/**
 * Selective, streaming reader for CSV members inside retained TSE ZIP
 * containers (Issue #3 — Etapa A).
 *
 * Reuses the secure ZIP reader (`readZipMember`) and the literal CSV stream
 * (`readCsvHeader` + `readCsvLines`); the member is NEVER fully buffered —
 * rows are emitted in batches while the underlying stream is consumed.
 *
 * Contract:
 * - `memberName` is validated with the ZIP reader's zip-slip guard and is only
 *   compared against the archive's internal member names (never a client path).
 * - Filter/projection column names must belong to a documented allowlist.
 * - Row filters are EXACT literal equality over the untrimmed cell value
 *   (official spaces are data); multiple filters are AND-ed.
 * - Cancellation is safe: aborting the consumer destroys the member stream
 *   (`finally`), releasing the ZIP handle/temp spool.
 * - `maxRows` stops the read EARLY and ends normally with `truncated: true`
 *   (documented choice: never silently truncates a delivered batch; a consumer
 *   that wants "error on too many rows" can assert `truncated` itself).
 */
import type { Readable } from 'node:stream';
import { normalizeHeaderName, readCsvHeader, readCsvLines } from './tseCsvStream.ts';
import { readZipMember, type TseZipEntryInfo, type TseZipLimits, type TseZipSource } from './tseZipReader.ts';
import { assertSafeEntryName } from './tseZipReader.ts';

/** Bumped when parser semantics change (Etapa B: literal, no cell trim). */
export const CSV_PARSER_VERSION = 'tse-csv-stream/2-literal';

/**
 * Column allowlist for `VOTACAO_NOMINAL_MUNICIPIO_ZONA` members (votação
 * nominal por município/zona). Filter/projection columns outside this list are
 * rejected with `COLUMN_NOT_ALLOWED`. Extend deliberately, never from client
 * input.
 */
export const VOTACAO_NOMINAL_MUNICIPIO_ZONA_COLUMNS: readonly string[] = Object.freeze([
  'ANO_ELEICAO',
  'NR_TURNO',
  'SG_UF',
  'CD_MUNICIPIO',
  'NM_MUNICIPIO',
  'NR_ZONA',
  'CD_CARGO',
  'DS_CARGO',
  'SQ_CANDIDATO',
  'NR_CANDIDATO',
  'NR_PARTIDO',
  'SG_PARTIDO',
  'QT_VOTOS_NOMINAIS',
  'QT_VOTOS_NOMINAIS_VALIDOS'
]);

export interface TseRowFilter {
  /** Column name (matched against the normalized header, must be allowlisted). */
  column: string;
  /** Exact literal values to accept (OR within a filter, AND across filters). */
  values: string[];
}

export interface TseSelectOptions {
  /** Row filters; AND semantics over exact literal equality. */
  filters?: TseRowFilter[];
  /** Allowlist projection: emitted rows keep only these columns (original order respected). */
  columns?: string[];
  /** Rows per emitted batch. Default: 1000. */
  batchSize?: number;
  /**
   * Hard cap on accepted rows. Reaching it ENDS the generator normally with
   * `summary.truncated = true` and stops reading the stream (documented choice).
   */
  maxRows?: number;
  /** Per-call ZIP limits override (defaults stay conservative). */
  limits?: Partial<TseZipLimits>;
  /** Provenance metadata attached to the summary (never read from file bytes). */
  source?: Partial<TseSelectSourceInfo>;
}

export type TseSelectErrorCode =
  | 'COLUMN_NOT_ALLOWED'
  | 'COLUMN_NOT_FOUND'
  | 'DUPLICATE_COLUMN'
  | 'EMPTY_HEADER'
  | 'INVALID_OPTION'
  | 'MEMBER_NOT_FOUND'
  | 'MEMBER_TOO_LARGE'
  | 'UNSAFE_MEMBER_NAME'
  | 'ZIP_BOMB'
  | 'ZIP_READ_ERROR';

/** Structured error thrown by {@link selectZipCsvRows}: code + machine-readable details. */
export class TseSelectError extends Error {
  readonly code: TseSelectErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: TseSelectErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'TseSelectError';
    this.code = code;
    this.details = details;
  }
}

export interface TseSelectSourceInfo {
  resource_id: string;
  year: number;
  zip_sha256: string;
  resource_url: string | null;
}

export interface TseSelectSummary {
  member_name: string;
  delimiter: string;
  encoding: 'iso-8859-1';
  /** Raw header cells exactly as written in the file (quotes resolved, no trim). */
  header: string[];
  /** Normalized header (BOM stripped, trimmed, uppercase) used for lookups. */
  normalized_header: string[];
  filters: TseRowFilter[];
  columns: string[] | null;
  rows_read: number;
  rows_accepted: number;
  rows_rejected: number;
  parser_version: string;
  truncated: boolean;
  max_rows: number | null;
  source: {
    resource_id: string | null;
    year: number | null;
    zip_sha256: string | null;
    resource_url: string | null;
    member: string;
    member_uncompressed_size: number;
  };
}

const MEMBER_TOO_LARGE_RE = /descompacta (\d+) bytes, excedendo o limite de (\d+) bytes/;

function fail(
  code: TseSelectErrorCode,
  message: string,
  details: Record<string, unknown> = {},
  cause?: unknown
): never {
  const error = new TseSelectError(code, message, details);
  if (cause !== undefined) (error as { cause?: unknown }).cause = cause;
  throw error;
}

function isTseSelectError(error: unknown): error is TseSelectError {
  return error instanceof TseSelectError;
}

/** Maps raw errors from `readZipMember` to structured {@link TseSelectError}s. */
function mapMemberOpenError(error: unknown, memberName: string): never {
  const message = error instanceof Error ? error.message : String(error);
  const tooLarge = MEMBER_TOO_LARGE_RE.exec(message);
  if (tooLarge) {
    fail('MEMBER_TOO_LARGE', message, {
      member: memberName,
      size_bytes: Number(tooLarge[1]),
      max_member_bytes: Number(tooLarge[2]),
      alternatives: [
        'Elevar o limite por chamada consciente (limits.maxMemberBytes) para leitura sequencial em fluxo.',
        'Baixar o snapshot e processar offline.'
      ]
    }, error);
  }
  if (/Razão de expansão/.test(message)) {
    fail('ZIP_BOMB', message, { member: memberName, reason: 'expansion_ratio' }, error);
  }
  if (/Membro não encontrado/.test(message)) {
    fail('MEMBER_NOT_FOUND', message, { member: memberName }, error);
  }
  if (/inseguro|zip-slip/.test(message)) {
    fail('UNSAFE_MEMBER_NAME', message, { member: memberName }, error);
  }
  fail('ZIP_READ_ERROR', message, { member: memberName }, error);
}

function validateOptions(options: TseSelectOptions): { batchSize: number; filters: TseRowFilter[]; columns: string[] | null; maxRows: number | null } {
  const batchSize = options.batchSize ?? 1000;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100_000) {
    fail('INVALID_OPTION', `batchSize inválido (${String(options.batchSize)}); esperado inteiro entre 1 e 100000.`, { batch_size: options.batchSize });
  }
  const filters = options.filters ?? [];
  if (!Array.isArray(filters)) fail('INVALID_OPTION', 'filters deve ser uma lista.', { filters: typeof filters });
  const normalizedFilters: TseRowFilter[] = [];
  for (const filter of filters) {
    if (!filter || typeof filter.column !== 'string' || !Array.isArray(filter.values)) {
      fail('INVALID_OPTION', 'Cada filtro precisa de { column: string, values: string[] }.', { filter });
    }
    if (filter.values.length === 0) {
      fail('INVALID_OPTION', 'Filtro sem valores aceitos: nenhum registro passaria; recusado para evitar consulta vazia.', { column: filter.column });
    }
    for (const value of filter.values) {
      if (typeof value !== 'string') fail('INVALID_OPTION', 'Valores de filtro devem ser strings.', { column: filter.column, value: typeof value });
    }
    const column = normalizeHeaderName(filter.column);
    if (!VOTACAO_NOMINAL_MUNICIPIO_ZONA_COLUMNS.includes(column)) {
      fail('COLUMN_NOT_ALLOWED', `Coluna de filtro fora da allowlist: ${column}.`, {
        column,
        allowed: [...VOTACAO_NOMINAL_MUNICIPIO_ZONA_COLUMNS]
      });
    }
    normalizedFilters.push({ column, values: [...filter.values] });
  }
  let columns: string[] | null = null;
  if (options.columns !== undefined) {
    if (!Array.isArray(options.columns) || options.columns.length === 0) {
      fail('INVALID_OPTION', 'columns deve ser uma lista não vazia de nomes de coluna quando fornecida.', { columns: options.columns });
    }
    columns = options.columns.map((raw) => {
      if (typeof raw !== 'string' || !raw) fail('INVALID_OPTION', 'Nome de coluna de projeção inválido.', { column: raw });
      const column = normalizeHeaderName(raw);
      if (!VOTACAO_NOMINAL_MUNICIPIO_ZONA_COLUMNS.includes(column)) {
        fail('COLUMN_NOT_ALLOWED', `Coluna de projeção fora da allowlist: ${column}.`, {
          column,
          allowed: [...VOTACAO_NOMINAL_MUNICIPIO_ZONA_COLUMNS]
        });
      }
      return column;
    });
  }
  const maxRows = options.maxRows ?? null;
  if (maxRows !== null && (!Number.isInteger(maxRows) || maxRows < 1)) {
    fail('INVALID_OPTION', `maxRows inválido (${String(options.maxRows)}); esperado inteiro positivo.`, { max_rows: options.maxRows });
  }
  return { batchSize, filters: normalizedFilters, columns, maxRows };
}

function resolveColumnIndex(normalizedHeader: string[], column: string, memberName: string, role: 'filtro' | 'projeção'): number {
  const matches: number[] = [];
  for (let i = 0; i < normalizedHeader.length; i++) {
    if (normalizedHeader[i] === column) matches.push(i);
  }
  if (matches.length === 0) {
    fail('COLUMN_NOT_FOUND', `Coluna ${column} (usada em ${role}) não existe no cabeçalho do membro ${memberName}.`, {
      column,
      member: memberName,
      header: normalizedHeader
    });
  }
  if (matches.length > 1) {
    fail('DUPLICATE_COLUMN', `Coluna ${column} aparece ${matches.length} vezes no cabeçalho do membro ${memberName}; seleção ambígua.`, {
      column,
      member: memberName,
      occurrences: matches.length
    });
  }
  return matches[0];
}

function buildSummary(
  memberName: string,
  headerResult: { raw_header: string[]; header: string[]; delimiter: string; encoding: 'iso-8859-1' },
  filters: TseRowFilter[],
  columns: string[] | null,
  counts: { rows_read: number; rows_accepted: number; rows_rejected: number },
  truncated: boolean,
  maxRows: number | null,
  source: Partial<TseSelectSourceInfo> | undefined,
  member: TseZipEntryInfo
): TseSelectSummary {
  return {
    member_name: memberName,
    delimiter: headerResult.delimiter,
    encoding: headerResult.encoding,
    header: headerResult.raw_header,
    normalized_header: headerResult.header,
    filters,
    columns,
    rows_read: counts.rows_read,
    rows_accepted: counts.rows_accepted,
    rows_rejected: counts.rows_rejected,
    parser_version: CSV_PARSER_VERSION,
    truncated,
    max_rows: maxRows,
    source: {
      resource_id: source?.resource_id ?? null,
      year: source?.year ?? null,
      zip_sha256: source?.zip_sha256 ?? null,
      resource_url: source?.resource_url ?? null,
      member: memberName,
      member_uncompressed_size: member.uncompressed_size
    }
  };
}

/**
 * Streaming selective read of one CSV member inside a retained ZIP.
 *
 * Yields batches of literal rows and returns a {@link TseSelectSummary} with
 * provenance (source member, parser version, counters). Aborting the consumer
 * destroys the member stream in `finally` (no leaked handles/temp files).
 */
export async function* selectZipCsvRows(
  source: TseZipSource,
  memberName: string,
  options: TseSelectOptions = {}
): AsyncGenerator<string[][], TseSelectSummary, void> {
  const { batchSize, filters, columns, maxRows } = validateOptions(options);

  try {
    assertSafeEntryName(memberName);
  } catch (error) {
    fail('UNSAFE_MEMBER_NAME', error instanceof Error ? error.message : String(error), { member: memberName }, error);
  }

  let memberStream: Readable | null = null;
  let records: AsyncGenerator<string[], void, unknown> | null = null;
  let summary: TseSelectSummary;
  try {
    let opened: { stream: Readable; entry: TseZipEntryInfo };
    try {
      opened = await readZipMember(source, memberName, options.limits ?? {});
    } catch (error) {
      mapMemberOpenError(error, memberName);
    }
    memberStream = opened!.stream;
    const entry = opened!.entry;

    let headerResult: Awaited<ReturnType<typeof readCsvHeader>>;
    try {
      headerResult = await readCsvHeader(memberStream, 128 * 1024);
    } catch (error) {
      fail('ZIP_READ_ERROR', `Falha ao ler o cabeçalho do membro ${memberName}: ${error instanceof Error ? error.message : String(error)}`, { member: memberName }, error);
    }
    const rawHeader = headerResult!.raw_header;
    const normalizedHeader = headerResult!.header;
    if (normalizedHeader.length === 0 || (normalizedHeader.length === 1 && normalizedHeader[0] === '')) {
      fail('EMPTY_HEADER', `O membro ${memberName} não possui cabeçalho CSV legível.`, { member: memberName });
    }

    const filterIndexes = filters.map(filter => resolveColumnIndex(normalizedHeader, filter.column, memberName, 'filtro'));
    const projectionIndexes = columns === null ? null : columns.map(column => resolveColumnIndex(normalizedHeader, column, memberName, 'projeção'));

    records = readCsvLines(memberStream, { delimiter: headerResult!.delimiter });
    let rowsRead = 0;
    let rowsAccepted = 0;
    let rowsRejected = 0;
    let truncated = false;
    let batch: string[][] = [];

    for (;;) {
      const next = await records.next();
      if (next.done) break;
      const row = next.value;
      rowsRead++;

      let matches = true;
      for (let f = 0; f < filters.length; f++) {
        const index = filterIndexes[f];
        const cell = index < row.length ? row[index] : undefined;
        if (cell === undefined || !filters[f].values.includes(cell)) {
          matches = false;
          break;
        }
      }
      if (!matches) {
        rowsRejected++;
        continue;
      }
      rowsAccepted++;
      const projected = projectionIndexes === null
        ? row
        : projectionIndexes.map(index => (index < row.length ? row[index] : ''));
      batch.push(projected);
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
      if (maxRows !== null && rowsAccepted >= maxRows) {
        truncated = true;
        break;
      }
    }
    if (batch.length > 0) yield batch;

    summary = buildSummary(
      memberName,
      { raw_header: rawHeader, header: normalizedHeader, delimiter: headerResult!.delimiter, encoding: headerResult!.encoding },
      filters,
      columns,
      { rows_read: rowsRead, rows_accepted: rowsAccepted, rows_rejected: rowsRejected },
      truncated,
      maxRows,
      options.source,
      entry
    );
  } catch (error) {
    if (isTseSelectError(error)) throw error;
    fail('ZIP_READ_ERROR', `Falha ao ler o membro ${memberName}: ${error instanceof Error ? error.message : String(error)}`, { member: memberName }, error);
  } finally {
    // Cancellation/cleanup: aborting the consumer (break/return/throw) or any
    // failure lands here — the member stream is destroyed, which closes the
    // ZIP handle and removes the temp spool via readZipMember's close handler.
    try {
      if (records) await records.return();
    } catch {
      // stream may already be closed
    }
    if (memberStream) memberStream.destroy();
  }
  return summary;
}