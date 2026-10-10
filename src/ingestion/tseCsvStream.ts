/**
 * Streaming CSV record reader for TSE tabular members (RFC-4180).
 *
 * Uses `csv-parse` in streaming mode to produce complete CSV records (not
 * physical lines). Quoted fields may contain line breaks; escaped quotes `""`
 * become `"` and surrounding quotes are removed by the parser. Data values are
 * preserved as-is (no `.trim()`).
 *
 * Layers: file bytes → decoded text (latin1/iso-8859-1) → logical CSV values
 * (RFC-4180 unescape). Hashes of source bytes remain authoritative; values are
 * not "byte-a-byte" after decoding.
 *
 * Design: `readCsvLines(readable, options)` yields `string[]` per CSV record
 * to keep the signature compatible with existing callers (`tseSelectiveReader`).
 * Header reading uses the same record stream. Safety limits: `maxRecordBytes`,
 * `maxFieldBytes`, `maxColumns` abort with structured errors.
 */
import type { Readable } from 'node:stream';
import { parse } from 'csv-parse';

export const MULTILINE_FIELD_ERROR = 'Erro: campo multilinha não suportado pelo parser';
export const CSV_PARSER_VERSION_FALLBACK = 'tse-csv-stream/3-rfc4180';

export const CSV_PARSER_VERSION = CSV_PARSER_VERSION_FALLBACK;

/**
 * Normalizes a header cell for name comparison only (never applied to data
 * values): strips a leading BOM, trims outer whitespace and uppercases.
 */
export function normalizeHeaderName(cell: string): string {
  return cell.replace(/^\uFEFF/, '').trim().toUpperCase();
}

/**
 * Parses one CSV physical line preserving every cell byte-for-byte. Kept for
 * compatibility/testing; prefer `readCsvLines` for full RFC-4180 semantics.
 * Only RFC-4180 quote unescaping (`""` → `"`) is applied; surrounding quotes
 * are removed; NO trim happens.
 */
export function parseCsvRecord(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value);
  return cells;
}

export interface CsvLineReaderOptions {
  delimiter?: string;
  maxLineBytes?: number;
  maxRecordBytes?: number;
  maxFieldBytes?: number;
  maxColumns?: number;
  encoding?: 'latin1' | 'utf8' | 'iso-8859-1';
}

export class CsvParserError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'CsvParserError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Streaming CSV record reader (RFC-4180). Yields complete records as string[].
 * Values are decoded from latin1 (TSE ISO-8859-1) then parsed; no trim applied.
 */
export async function* readCsvLines(
  readable: Readable,
  options: CsvLineReaderOptions = {}
): AsyncGenerator<string[], void, unknown> {
  const delimiter = options.delimiter ?? ';';
  const maxRecordBytes = options.maxRecordBytes ?? 128 * 1024 * 1024;
  const maxFieldBytes = options.maxFieldBytes ?? 32 * 1024 * 1024;
  const maxColumns = options.maxColumns ?? 2048;
  const encoding = options.encoding ?? 'latin1';

  const parser = readable
    .setEncoding(encoding as BufferEncoding)
    .pipe(
      parse({
        delimiter,
        skip_empty_lines: false,
        relax_quotes: true,
        trim: false,
        escape: '"',
        quote: '"',
        record_delimiter: ['\r\n', '\n', '\r']
      })
    );

  let recordBytes = 0;
  for await (const record of parser as AsyncIterable<string[]>) {
    // Estimate bytes conservatively by joining with delimiter
    const joined = record.join(delimiter);
    recordBytes = Buffer.byteLength(joined, encoding === 'latin1' ? 'latin1' : 'utf8');
    if (recordBytes > maxRecordBytes) {
      const err = new CsvParserError('RECORD_TOO_LARGE', `Registro CSV excede o limite de ${maxRecordBytes} bytes.`, {
        max_record_bytes: maxRecordBytes,
        approx_bytes: recordBytes
      });
      parser.destroy(err);
      throw err;
    }
    for (const field of record) {
      const fb = Buffer.byteLength(field, encoding === 'latin1' ? 'latin1' : 'utf8');
      if (fb > maxFieldBytes) {
        const err = new CsvParserError('FIELD_TOO_LARGE', `Campo CSV excede o limite de ${maxFieldBytes} bytes.`, {
          max_field_bytes: maxFieldBytes,
          approx_bytes: fb
        });
        parser.destroy(err);
        throw err;
      }
    }
    if (record.length > maxColumns) {
      const err = new CsvParserError('TOO_MANY_COLUMNS', `Registro com mais colunas que o limite (${record.length} > ${maxColumns}).`, {
        column_count: record.length,
        max_columns: maxColumns
      });
      parser.destroy(err);
      throw err;
    }
    yield record;
  }
}

/**
 * Reads only the first physical line of a byte stream (header). The remainder
 * of the source chunk is put back into the stream via `unshift` so the caller
 * can keep reading records afterwards.
 * Works with both true streams (yauzl) and buffered streams (Readable.from).
 */
export async function readFirstLineBytes(readable: Readable, maxBytes = 128 * 1024): Promise<Buffer> {
  const parts: Buffer[] = [];
  let total = 0;
  
  // Use readable.read() to pull from internal buffer without consuming 'end'
  async function readChunk(): Promise<Buffer | null> {
    // First try to read from buffer synchronously
    const chunk = readable.read();
    if (chunk !== null) {
      return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    }
    // Buffer empty, wait for 'readable' event
    return new Promise((resolve, reject) => {
      const onReadable = (): void => {
        readable.removeListener('readable', onReadable);
        readable.removeListener('error', onError);
        readable.removeListener('end', onEnd);
        const chunk = readable.read();
        resolve(chunk ? (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)) : null);
      };
      const onEnd = (): void => {
        readable.removeListener('readable', onReadable);
        readable.removeListener('error', onError);
        readable.removeListener('end', onEnd);
        resolve(null);
      };
      const onError = (error: Error): void => {
        readable.removeListener('readable', onReadable);
        readable.removeListener('error', onError);
        readable.removeListener('end', onEnd);
        reject(error);
      };
      readable.on('readable', onReadable);
      readable.on('end', onEnd);
      readable.on('error', onError);
    });
  }
  
  for (;;) {
    const chunk = await readChunk();
    if (chunk === null) break;
    const newline = chunk.indexOf(0x0a);
    if (newline >= 0) {
      parts.push(chunk.subarray(0, newline));
      const remainder = chunk.subarray(newline + 1);
      if (remainder.length > 0) readable.unshift(remainder);
      break;
    }
    parts.push(chunk);
    total += chunk.length;
    if (total > maxBytes) throw new Error(`A primeira linha excede o limite de ${maxBytes} bytes.`);
  }
  return Buffer.concat(parts);
}

export interface CsvHeaderResult {
  /** Cells as written in the file (byte-for-byte, quotes resolved, no trim). */
  raw_header: string[];
  /** Header cells normalized for column-name comparison ({@link normalizeHeaderName}). */
  header: string[];
  delimiter: string;
  encoding: 'iso-8859-1';
}

/** Reads and parses the CSV header line of a member stream (TSE files are ISO-8859-1). */
export async function readCsvHeader(readable: Readable, maxHeaderBytes = 128 * 1024): Promise<CsvHeaderResult> {
  const raw = await readFirstLineBytes(readable, maxHeaderBytes);
  const line = raw.toString('latin1').replace(/\r$/, '');
  const delimiter = line.includes(';') ? ';' : ',';
  const raw_header = parseCsvRecord(line, delimiter);
  return { raw_header, header: raw_header.map(normalizeHeaderName), delimiter, encoding: 'iso-8859-1' };
}
