/**
 * Minimal, streaming CSV line reader for TSE tabular members.
 *
 * Design decision: quoted fields that contain a line break are BLOCKED with a
 * clear error instead of being assembled across records. Official TSE delimited
 * files (candidaturas, votação, apuração) do not embed newlines inside quoted
 * cells; rejecting them keeps this parser streaming with O(1) memory and avoids
 * a stateful RFC-4180 record builder. If a future dataset needs multiline
 * quoted fields, replace `readCsvLines` with a full RFC-4180 parser.
 *
 * Multiline detection is a quote-parity rule: every `"` byte toggles the
 * in-quote state (`""` contributes two toggles and nets zero), so a line
 * carrying an odd number of quotes is still inside a quoted field; a `\n` in
 * that state proves a field spans records and is rejected.
 */
import type { Readable } from 'node:stream';

export const MULTILINE_FIELD_ERROR = 'Erro: campo multilinha não suportado pelo parser';

export function parseCsvLine(line: string, delimiter: string): string[] {
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
      cells.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

export interface CsvLineReaderOptions {
  delimiter?: string;
  maxLineBytes?: number;
}

/**
 * Streaming CSV line reader. Iterates the byte stream directly, splits on
 * `\n` (CR and CRLF accepted), maps bytes 1:1 to latin1 (the official TSE
 * ISO-8859-1 encoding) and rejects fields that carry a line break with a clear
 * error ({@link MULTILINE_FIELD_ERROR}). Memory stays O(lineBytes).
 *
 * The consumer must destroy `readable` when aborting early; otherwise the
 * generator keeps reading the underlying member stream to completion.
 */
export async function* readCsvLines(readable: Readable, options: CsvLineReaderOptions = {}): AsyncGenerator<string[], void, unknown> {
  const delimiter = options.delimiter ?? ';';
  const maxLineBytes = options.maxLineBytes ?? 16 * 1024 * 1024;
  let line = '';
  let quoteParity = 0; // odd => currently inside a quoted field
  for await (const chunk of readable) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      if (byte === 0x22) quoteParity ^= 1;
      if (byte === 0x0a) {
        if (quoteParity === 1) throw new Error(MULTILINE_FIELD_ERROR);
        yield parseCsvLine(line.endsWith('\r') ? line.slice(0, -1) : line, delimiter);
        line = '';
        quoteParity = 0;
      } else {
        line += String.fromCharCode(byte);
        if (line.length > maxLineBytes) throw new Error(`Linha CSV excede o limite de ${maxLineBytes} bytes.`);
      }
    }
  }
  if (quoteParity === 1) throw new Error(MULTILINE_FIELD_ERROR);
  if (line) yield parseCsvLine(line.endsWith('\r') ? line.slice(0, -1) : line, delimiter);
}

/** Reads only the first physical line of a byte stream (header), never buffering the rest. */
export async function readFirstLineBytes(readable: Readable, maxBytes = 128 * 1024): Promise<Buffer> {
  const parts: Buffer[] = [];
  let total = 0;
  for await (const chunk of readable) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const newline = buffer.indexOf(0x0a);
    if (newline >= 0) {
      parts.push(buffer.subarray(0, newline));
      total += newline;
      break;
    }
    parts.push(buffer);
    total += buffer.length;
    if (total > maxBytes) throw new Error(`A primeira linha excede o limite de ${maxBytes} bytes.`);
  }
  return Buffer.concat(parts);
}

export interface CsvHeaderResult {
  header: string[];
  delimiter: string;
  encoding: 'iso-8859-1';
}

/** Reads and parses the CSV header line of a member stream (TSE files are ISO-8859-1). */
export async function readCsvHeader(readable: Readable, maxHeaderBytes = 128 * 1024): Promise<CsvHeaderResult> {
  const raw = await readFirstLineBytes(readable, maxHeaderBytes);
  const line = raw.toString('latin1').replace(/^\uFEFF/, '').replace(/\r$/, '');
  const delimiter = line.includes(';') ? ';' : ',';
  return { header: parseCsvLine(line, delimiter), delimiter, encoding: 'iso-8859-1' };
}