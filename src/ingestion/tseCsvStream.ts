/**
 * Minimal, streaming CSV line reader for TSE tabular members.
 *
 * Cells are preserved byte-for-byte (no trim); header names are normalized
 * separately via `normalizeHeaderName` for column comparison only.
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

/**
 * Normalizes a header cell for name comparison only (never applied to data
 * values): strips a leading BOM, trims the outer whitespace and uppercases.
 */
export function normalizeHeaderName(cell: string): string {
  return cell.replace(/^\uFEFF/, '').trim().toUpperCase();
}

/**
 * Parses one CSV physical line preserving every cell byte-for-byte. Only the
 * RFC-4180 quote unescaping (`""` → `"`) is applied; surrounding quotes are
 * removed and NO trim happens — spaces inside a cell are official data.
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
        yield parseCsvRecord(line.endsWith('\r') ? line.slice(0, -1) : line, delimiter);
        line = '';
        quoteParity = 0;
      } else {
        line += String.fromCharCode(byte);
        if (line.length > maxLineBytes) throw new Error(`Linha CSV excede o limite de ${maxLineBytes} bytes.`);
      }
    }
  }
  if (quoteParity === 1) throw new Error(MULTILINE_FIELD_ERROR);
  if (line) yield parseCsvRecord(line.endsWith('\r') ? line.slice(0, -1) : line, delimiter);
}

/**
 * Pulls the next data chunk in paused mode (no 'data' listeners left behind,
 * no flowing state). Resolves null at EOF. Used so the first-line reader can
 * return the rest of the stream intact for continued reads.
 */
function pullChunk(readable: Readable): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const onData = (chunk: unknown): void => {
      cleanup();
      resolve(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    };
    const onEnd = (): void => {
      cleanup();
      resolve(null);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    function cleanup(): void {
      readable.removeListener('data', onData);
      readable.removeListener('end', onEnd);
      readable.removeListener('error', onError);
      readable.pause();
    }
    readable.on('data', onData);
    readable.on('end', onEnd);
    readable.on('error', onError);
    readable.resume();
  });
}

/**
 * Reads only the first physical line of a byte stream (header), never
 * buffering the rest. The remainder of the source chunk is put back into the
 * stream via `unshift`, so the caller can keep reading records afterwards.
 * The stream is NOT destroyed — the consumer owns its lifecycle.
 */
export async function readFirstLineBytes(readable: Readable, maxBytes = 128 * 1024): Promise<Buffer> {
  const parts: Buffer[] = [];
  let total = 0;
  for (;;) {
    const chunk = await pullChunk(readable);
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