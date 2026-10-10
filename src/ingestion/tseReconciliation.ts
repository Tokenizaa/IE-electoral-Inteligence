/**
 * Metodological reconciliation for TSE CSV scans (Issue #4 — Etapa B).
 *
 * Provides pure functions to:
 * - Build dimension aggregates (UF, ANO, CARGO, TURNO) from records
 * - Detect gaps against expected counts (with source_ref + method)
 * - Detect duplicates by composite key
 * - Detect layout divergences against registry profiles
 * - Produce a structured TseReconciliationReport
 *
 * IMPORTANT: No ingestion, no analytical engine coupling. Pure computation on
 * observed records + optional expected reference. Status COMPLETE only when
 * scan consumed fully without maxRows/cancel/error/size-limit.
 */
import { validateTseLayout, type TseLayoutValidation } from './tseLayoutRegistry.ts';
import { CSV_PARSER_VERSION } from './tseCsvStream.ts';

export type TseScanStatus =
  | 'COMPLETE'
  | 'PARTIAL_MAX_ROWS'
  | 'PARTIAL_CANCELLED'
  | 'PARTIAL_ERROR'
  | 'PARTIAL_SIZE_LIMIT'
  | 'INVALID';

export interface TseDimensionKey {
  UF?: string;
  ANO?: string;
  CARGO?: string;
  TURNO?: string;
}

export interface TseDimensionCount extends TseDimensionKey {
  count: number;
}

export interface TseExpectedCount extends TseDimensionKey {
  expected_count: number;
  source_ref: string;
  method: string;
}

export interface TseGapFinding {
  dimension: keyof TseDimensionKey;
  key: string;
  expected_count: number;
  observed_count: number;
  source_ref: string;
  method: string;
  explanation: string;
}

export interface TseDuplicateFinding {
  key_columns: string[];
  key_value: string;
  count: number;
  example_records: string[][];
}

export interface TseCoverageEntry {
  dimension: 'SOURCE' | 'UF' | 'YEAR' | 'OFFICE' | 'TURN';
  key: string;
  source_ref?: string;
  expected_count: number | null;
  observed_count: number | null;
  status: 'COMPLETE' | 'PARTIAL' | 'MISSING' | 'INVALID' | 'UNVERIFIED';
  explanation: string;
}

export interface TseReconciliationSummary {
  source: {
    resource_id: string;
    year: number;
    resource_url: string | null;
    zip_sha256: string;
    member: string;
    member_uncompressed_size: number;
  };
  parser_version: string;
  delimiter: string;
  encoding: string;
  num_columns: number;
  header_normalized: string[];
  counters: {
    records_read: number;
    records_accepted: number;
    records_rejected: number;
    records_invalid: number;
    records_truncated: number;
  };
  scan_status: TseScanStatus;
  filters?: Array<{ column: string; values: string[] }>;
  dimensions: {
    UF: TseDimensionCount[];
    ANO: TseDimensionCount[];
    CARGO: TseDimensionCount[];
    TURNO: TseDimensionCount[];
  };
}

export interface TseReconciliationReport {
  summary: TseReconciliationSummary;
  expected: {
    source_ref: string;
    method: string;
    per_dimension?: Record<string, TseExpectedCount>;
  };
  gaps: TseGapFinding[];
  duplicates: TseDuplicateFinding[];
  coverage: TseCoverageEntry[];
}

/**
 * Column indexes for standard VOTACAO_NOMINAL_MUNICIPIO_ZONA dimension fields.
 * Returns -1 if column not present.
 */
function getDimensionIndexes(header: string[]): {
  UF: number;
  ANO: number;
  CARGO: number;
  TURNO: number;
} {
  return {
    UF: header.indexOf('SG_UF'),
    ANO: header.indexOf('ANO_ELEICAO'),
    CARGO: header.indexOf('CD_CARGO'),
    TURNO: header.indexOf('NR_TURNO')
  };
}

/**
 * Builds dimension aggregates from records using the normalized header.
 * Only aggregates dimensions where the column exists in the header.
 */
export function buildDimensionCounts(
  records: string[][],
  header: string[]
): {
  UF: TseDimensionCount[];
  ANO: TseDimensionCount[];
  CARGO: TseDimensionCount[];
  TURNO: TseDimensionCount[];
} {
  const idx = getDimensionIndexes(header);
  const ufMap = new Map<string, number>();
  const anoMap = new Map<string, number>();
  const cargoMap = new Map<string, number>();
  const turnoMap = new Map<string, number>();

  for (const row of records) {
    if (idx.UF >= 0 && idx.UF < row.length) {
      const v = row[idx.UF];
      ufMap.set(v, (ufMap.get(v) ?? 0) + 1);
    }
    if (idx.ANO >= 0 && idx.ANO < row.length) {
      const v = row[idx.ANO];
      anoMap.set(v, (anoMap.get(v) ?? 0) + 1);
    }
    if (idx.CARGO >= 0 && idx.CARGO < row.length) {
      const v = row[idx.CARGO];
      cargoMap.set(v, (cargoMap.get(v) ?? 0) + 1);
    }
    if (idx.TURNO >= 0 && idx.TURNO < row.length) {
      const v = row[idx.TURNO];
      turnoMap.set(v, (turnoMap.get(v) ?? 0) + 1);
    }
  }

  const toArray = (map: Map<string, number>, keyName: keyof TseDimensionKey): TseDimensionCount[] =>
    Array.from(map.entries()).map(([key, count]) => ({ [keyName]: key, count } as TseDimensionCount));

  return {
    UF: toArray(ufMap, 'UF'),
    ANO: toArray(anoMap, 'ANO'),
    CARGO: toArray(cargoMap, 'CARGO'),
    TURNO: toArray(turnoMap, 'TURNO')
  };
}

/**
 * Detects gaps: expected dimensions present in expected but absent in observed.
 * expected: array of { dimension key + expected_count + source_ref + method }
 * observed: Map<dimensionKey, observed_count> from buildDimensionCounts
 */
export function detectGaps(
  observed: { UF: TseDimensionCount[]; ANO: TseDimensionCount[]; CARGO: TseDimensionCount[]; TURNO: TseDimensionCount[] },
  expected: TseExpectedCount[]
): TseGapFinding[] {
  const obsMaps = {
    UF: new Map(observed.UF.map(o => [o.UF!, o.count])),
    ANO: new Map(observed.ANO.map(o => [o.ANO!, o.count])),
    CARGO: new Map(observed.CARGO.map(o => [o.CARGO!, o.count])),
    TURNO: new Map(observed.TURNO.map(o => [o.TURNO!, o.count]))
  };

  const gaps: TseGapFinding[] = [];
  for (const exp of expected) {
    const dim = exp.UF !== undefined ? 'UF' : exp.ANO !== undefined ? 'ANO' : exp.CARGO !== undefined ? 'CARGO' : 'TURNO';
    const key = exp[dim]!;
    const obsCount = obsMaps[dim].get(key) ?? 0;
    if (obsCount < exp.expected_count) {
      gaps.push({
        dimension: dim,
        key,
        expected_count: exp.expected_count,
        observed_count: obsCount,
        source_ref: exp.source_ref,
        method: exp.method,
        explanation: `Dimensão ${dim}=${key}: esperado ${exp.expected_count} (${exp.method} via ${exp.source_ref}), observado ${obsCount}`
      });
    }
  }
  return gaps;
}

/**
 * Detects duplicate records by composite key columns.
 * Returns findings for keys that appear more than once.
 */
export function detectDuplicates(
  records: string[][],
  header: string[],
  keyColumns: string[]
): TseDuplicateFinding[] {
  const keyIndexes = keyColumns.map(col => header.indexOf(col)).filter(i => i >= 0);
  if (keyIndexes.length === 0) return [];

  const keyMap = new Map<string, { count: number; examples: string[][] }>();
  for (const row of records) {
    const keyParts = keyIndexes.map(i => row[i] ?? '');
    const key = keyParts.join('|');
    const entry = keyMap.get(key) ?? { count: 0, examples: [] };
    entry.count++;
    if (entry.examples.length < 3) entry.examples.push([...row]);
    keyMap.set(key, entry);
  }

  const findings: TseDuplicateFinding[] = [];
  for (const [keyValue, { count, examples }] of keyMap) {
    if (count > 1) {
      findings.push({
        key_columns: keyColumns,
        key_value: keyValue,
        count,
        example_records: examples
      });
    }
  }
  return findings;
}

/**
 * Detects layout divergences: columns in header not in registry profile,
 * or required columns missing. Returns textual findings (does not modify registry).
 */
export function detectDivergences(
  header: string[],
  registryProfile: TseLayoutValidation
): string[] {
  const findings: string[] = [];
  const headerSet = new Set(header.map(h => h.toUpperCase()));
  // Use observed_columns from validation (normalized header) and missing_required_columns
  const profileCols = new Set(registryProfile.observed_columns.map(c => c.toUpperCase()));

  // Columns in header but not in profile's observed columns
  for (const h of header) {
    if (!profileCols.has(h.toUpperCase())) {
      findings.push(`Coluna extra no arquivo não prevista no perfil: ${h}`);
    }
  }
  // Required columns in profile but missing from header
  for (const p of registryProfile.missing_required_columns) {
    if (!headerSet.has(p.toUpperCase())) {
      findings.push(`Coluna obrigatória ausente no arquivo: ${p} (perfil: ${registryProfile.resource_kind})`);
    }
  }
  return findings;
}

/**
 * Reconciles observed counts against expected reference.
 * expected: optional object with source_ref, method, and per_dimension counts.
 * Returns coverage entries with status COMPLETE/PARTIAL/MISSING/INVALID/UNVERIFIED.
 */
export function reconcileAgainstExpected(
  observed: { UF: TseDimensionCount[]; ANO: TseDimensionCount[]; CARGO: TseDimensionCount[]; TURNO: TseDimensionCount[] },
  expected: { source_ref: string; method: string; per_dimension?: Record<string, TseExpectedCount> } | null
): TseCoverageEntry[] {
  const coverage: TseCoverageEntry[] = [];
  const obsMaps = {
    UF: new Map(observed.UF.map(o => [o.UF!, o.count])),
    ANO: new Map(observed.ANO.map(o => [o.ANO!, o.count])),
    CARGO: new Map(observed.CARGO.map(o => [o.CARGO!, o.count])),
    TURNO: new Map(observed.TURNO.map(o => [o.TURNO!, o.count]))
  };

  if (!expected || !expected.per_dimension) {
    // No expected reference -> all UNVERIFIED
    for (const [dim, map] of Object.entries(obsMaps)) {
      for (const [key, count] of map) {
        coverage.push({
          dimension: dim as TseCoverageEntry['dimension'],
          key,
          expected_count: null,
          observed_count: count,
          status: 'UNVERIFIED',
          explanation: 'Denominador oficial não disponível; registrado como não verificável'
        });
      }
    }
    // Also add SOURCE level
    const totalObserved = observed.UF.reduce((s, o) => s + o.count, 0);
    coverage.push({
      dimension: 'SOURCE',
      key: 'TOTAL',
      expected_count: null,
      observed_count: totalObserved,
      status: 'UNVERIFIED',
      explanation: 'Denominador oficial não disponível; registrado como não verificável'
    });
    return coverage;
  }

  // With expected reference
  for (const [, exp] of Object.entries(expected.per_dimension)) {
    // Determine which dimension this expected entry belongs to
    let dim: keyof typeof obsMaps = 'UF';
    let key = '';
    if (exp.UF !== undefined) { dim = 'UF'; key = exp.UF; }
    else if (exp.ANO !== undefined) { dim = 'ANO'; key = exp.ANO; }
    else if (exp.CARGO !== undefined) { dim = 'CARGO'; key = exp.CARGO; }
    else if (exp.TURNO !== undefined) { dim = 'TURNO'; key = exp.TURNO; }
    else continue;

    const obsMap = obsMaps[dim];
    const obsCount = obsMap.get(key) ?? 0;
    let status: TseCoverageEntry['status'] = 'MISSING';
    if (obsCount === exp.expected_count) status = 'COMPLETE';
    else if (obsCount > 0) status = 'PARTIAL';
    else if (obsCount === 0 && exp.expected_count > 0) status = 'MISSING';

    const dimLabel = dim === 'UF' ? 'UF' : dim === 'ANO' ? 'YEAR' : dim === 'CARGO' ? 'OFFICE' : 'TURN';
    coverage.push({
      dimension: dimLabel,
      key,
      source_ref: exp.source_ref,
      expected_count: exp.expected_count,
      observed_count: obsCount,
      status,
      explanation: status === 'COMPLETE'
        ? `Contagem confere com ${exp.method} (${exp.source_ref})`
        : status === 'PARTIAL'
          ? `Contagem parcial: ${obsCount}/${exp.expected_count} (${exp.method} via ${exp.source_ref})`
          : `Ausente no observado: esperado ${exp.expected_count} (${exp.method} via ${exp.source_ref})`
    });
  }

  // SOURCE level total
  const totalExpected = Object.values(expected.per_dimension).reduce((s, e) => s + e.expected_count, 0);
  const totalObserved = observed.UF.reduce((s, o) => s + o.count, 0);
  coverage.push({
    dimension: 'SOURCE',
    key: 'TOTAL',
    source_ref: expected.source_ref,
    expected_count: totalExpected,
    observed_count: totalObserved,
    status: totalObserved === totalExpected ? 'COMPLETE' : totalObserved > 0 ? 'PARTIAL' : 'MISSING',
    explanation: totalObserved === totalExpected
      ? `Total confere com ${expected.method} (${expected.source_ref})`
      : `Total divergente: ${totalObserved}/${totalExpected} (${expected.method} via ${expected.source_ref})`
  });

  return coverage;
}

/**
 * Determines scan status from execution flags.
 * ONLY 'COMPLETE' when fully consumed without interruption.
 */
export function determineScanStatus(flags: {
  fullyConsumed: boolean;
  maxRowsReached: boolean;
  cancelled: boolean;
  error: boolean;
  sizeLimitReached: boolean;
}): TseScanStatus {
  if (!flags.fullyConsumed) {
    if (flags.maxRowsReached) return 'PARTIAL_MAX_ROWS';
    if (flags.cancelled) return 'PARTIAL_CANCELLED';
    if (flags.error) return 'PARTIAL_ERROR';
    if (flags.sizeLimitReached) return 'PARTIAL_SIZE_LIMIT';
    return 'INVALID';
  }
  return 'COMPLETE';
}

export { CSV_PARSER_VERSION };
