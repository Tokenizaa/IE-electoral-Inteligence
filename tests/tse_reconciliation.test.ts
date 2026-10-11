/**
 * Tests for methodological reconciliation (Issue #4 — Etapa B).
 *
 * Covers:
 * - buildDimensionCounts
 * - detectGaps
 * - detectDuplicates
 * - detectDivergences
 * - reconcileAgainstExpected
 * - determineScanStatus
 * - Full scan + reconciliation via scanStoredZipMember (fixture)
 */
import assert from 'node:assert/strict';
import { buildZip, type ZipEntrySpec } from './helpers/zipBuilder.ts';
import { TseOpenDataClient } from '../src/ingestion/tseOpenData.ts';
import {
  buildDimensionCounts,
  detectGaps,
  detectDuplicates,
  detectDivergences,
  reconcileAgainstExpected,
  determineScanStatus,
  type TseExpectedCount,
  type TseCoverageEntry
} from '../src/ingestion/tseReconciliation.ts';
import { readCsvLines } from '../src/ingestion/tseCsvStream.ts';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';

const CSV_PARSER_VERSION = (await import('../src/ingestion/tseCsvStream.ts')).CSV_PARSER_VERSION;

async function run() {
  console.log('Running reconciliation tests...');

  // 1) buildDimensionCounts
  console.log('1) buildDimensionCounts');
  const header = ['ANO_ELEICAO', 'SG_UF', 'CD_CARGO', 'NR_TURNO', 'CD_MUNICIPIO', 'NR_ZONA', 'SQ_CANDIDATO'];
  const records = [
    ['2022', 'AC', '6', '1', '1001', '1', '100'],
    ['2022', 'AC', '6', '1', '1002', '1', '101'],
    ['2022', 'RS', '7', '2', '2001', '5', '200'],
    ['2022', 'RS', '7', '2', '2002', '5', '201'],
    ['2022', 'RS', '7', '2', '2003', '5', '202'],
  ];
  const dims = buildDimensionCounts(records, header);
  assert.equal(dims.UF.find(u => u.UF === 'AC')!.count, 2, 'UF AC count');
  assert.equal(dims.UF.find(u => u.UF === 'RS')!.count, 3, 'UF RS count');
  assert.equal(dims.CARGO.find(c => c.CARGO === '6')!.count, 2, 'CARGO 6 count');
  assert.equal(dims.CARGO.find(c => c.CARGO === '7')!.count, 3, 'CARGO 7 count');
  assert.equal(dims.TURNO.find(t => t.TURNO === '1')!.count, 2, 'TURNO 1 count');
  assert.equal(dims.TURNO.find(t => t.TURNO === '2')!.count, 3, 'TURNO 2 count');
  console.log('  OK');

  // 2) detectGaps
  console.log('2) detectGaps');
  const expected: TseExpectedCount[] = [
    { UF: 'AC', expected_count: 5, source_ref: 'TSE oficial', method: 'COUNT_OF_OFFICIAL_TABLE' },
    { UF: 'RS', expected_count: 3, source_ref: 'TSE oficial', method: 'COUNT_OF_OFFICIAL_TABLE' },
    { UF: 'SP', expected_count: 100, source_ref: 'TSE oficial', method: 'COUNT_OF_OFFICIAL_TABLE' },
  ];
  const gaps = detectGaps(dims, expected);
  assert.equal(gaps.length, 2, 'gaps for AC (2<5) and SP (0<100)');
  assert.equal(gaps.find(g => g.key === 'AC')!.observed_count, 2);
  assert.equal(gaps.find(g => g.key === 'SP')!.observed_count, 0);
  console.log('  OK');

  // 3) detectDuplicates
  console.log('3) detectDuplicates');
  const dupHeader = ['CD_MUNICIPIO', 'NR_ZONA', 'CD_CARGO', 'SQ_CANDIDATO', 'QT_VOTOS'];
  const dupRecords = [
    ['1001', '1', '6', '100', '10'],
    ['1001', '1', '6', '100', '20'], // duplicate key
    ['1002', '1', '6', '101', '30'],
    ['1001', '1', '6', '100', '40'], // same key again
  ];
  const dups = detectDuplicates(dupRecords, dupHeader, ['CD_MUNICIPIO', 'NR_ZONA', 'CD_CARGO', 'SQ_CANDIDATO']);
  assert.equal(dups.length, 1, 'one duplicate key');
  assert.equal(dups[0].count, 3, 'key appears 3 times');
  assert.equal(dups[0].key_columns.join(','), 'CD_MUNICIPIO,NR_ZONA,CD_CARGO,SQ_CANDIDATO');
  console.log('  OK');

  // 4) detectDivergences
  console.log('4) detectDivergences');
  const layoutValidation = {
    resource_kind: 'VOTACAO_NOMINAL_MUNICIPIO_ZONA' as const,
    observed_columns: ['ANO_ELEICAO', 'SG_UF', 'CD_CARGO', 'NR_TURNO', 'CD_MUNICIPIO', 'NR_ZONA', 'SQ_CANDIDATO', 'QT_VOTOS'],
    missing_required_columns: ['QT_VOTOS'],
    status: 'MISSING_REQUIRED_COLUMNS' as const,
    layout_id: null,
    header_fingerprint_sha256: '',
    duplicate_columns: [],
    ingestion_approved: false as const,
    evidence_scope: '',
    notes: []
  };
  const divergences = detectDivergences(header, layoutValidation);
  // header missing QT_VOTOS -> should detect as missing required
  assert.ok(divergences.some(d => d.includes('obrigatória ausente') && d.includes('QT_VOTOS')), 'detects missing required QT_VOTOS');
  console.log('  OK');

  // 5) reconcileAgainstExpected - UNVERIFIED when no expected
  console.log('5) reconcileAgainstExpected (no expected -> UNVERIFIED)');
  const coverageUnv = reconcileAgainstExpected(dims, null);
  assert.ok(coverageUnv.every(c => c.status === 'UNVERIFIED'), 'all UNVERIFIED when no expected');
  assert.ok(coverageUnv.some(c => c.dimension === 'SOURCE' && c.key === 'TOTAL'), 'has SOURCE total');
  console.log('  OK');

  // 6) reconcileAgainstExpected - with expected
  console.log('6) reconcileAgainstExpected (with expected)');
  const expectedRef = {
    source_ref: 'TSE Boletim 2022',
    method: 'SUM_FROM_TSE_TOTALIZATION',
    per_dimension: {
      'UF:AC': { UF: 'AC', expected_count: 2, source_ref: 'TSE Boletim 2022', method: 'SUM_FROM_TSE_TOTALIZATION' },
      'UF:RS': { UF: 'RS', expected_count: 3, source_ref: 'TSE Boletim 2022', method: 'SUM_FROM_TSE_TOTALIZATION' },
      'CARGO:6': { CARGO: '6', expected_count: 2, source_ref: 'TSE Boletim 2022', method: 'SUM_FROM_TSE_TOTALIZATION' }
    }
  };
  const coverage = reconcileAgainstExpected(dims, expectedRef);
  const ufAC = coverage.find(c => c.dimension === 'UF' && c.key === 'AC')!;
  assert.equal(ufAC.status, 'COMPLETE', 'UF AC matches expected');
  const ufRS = coverage.find(c => c.dimension === 'UF' && c.key === 'RS')!;
  assert.equal(ufRS.status, 'COMPLETE', 'UF RS matches expected');
  const cargo6 = coverage.find(c => c.dimension === 'OFFICE' && c.key === '6')!;
  assert.equal(cargo6.status, 'COMPLETE', 'CARGO 6 matches expected');
  console.log('  OK');

  // 7) determineScanStatus
  console.log('7) determineScanStatus');
  assert.equal(determineScanStatus({ fullyConsumed: true, maxRowsReached: false, cancelled: false, error: false, sizeLimitReached: false }), 'COMPLETE');
  assert.equal(determineScanStatus({ fullyConsumed: false, maxRowsReached: true, cancelled: false, error: false, sizeLimitReached: false }), 'PARTIAL_MAX_ROWS');
  assert.equal(determineScanStatus({ fullyConsumed: false, maxRowsReached: false, cancelled: true, error: false, sizeLimitReached: false }), 'PARTIAL_CANCELLED');
  assert.equal(determineScanStatus({ fullyConsumed: false, maxRowsReached: false, cancelled: false, error: true, sizeLimitReached: false }), 'PARTIAL_ERROR');
  assert.equal(determineScanStatus({ fullyConsumed: false, maxRowsReached: false, cancelled: false, error: false, sizeLimitReached: true }), 'PARTIAL_SIZE_LIMIT');
  assert.equal(determineScanStatus({ fullyConsumed: false, maxRowsReached: false, cancelled: false, error: false, sizeLimitReached: false }), 'INVALID');
  console.log('  OK');

  // 8) Full scan + reconciliation via scanStoredZipMember (fixture)
  console.log('8) scanStoredZipMember fixture');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tse-reconcile-test-'));
  try {
    const fixtureCSV = Buffer.from(
      'ANO_ELEICAO;SG_UF;CD_CARGO;NR_TURNO;CD_MUNICIPIO;NR_ZONA;SQ_CANDIDATO;QT_VOTOS\n' +
      '2022;AC;6;1;1001;1;100;100\n' +
      '2022;AC;6;1;1002;1;101;200\n' +
      '2022;RS;7;2;2001;5;200;300\n',
      'latin1'
    );
    const zipPath = path.join(tempDir, 'fixture.zip');
    await writeFile(zipPath, buildZip([{ name: 'votacao.csv', data: fixtureCSV }]));

    // Use scanStoredZipMember - but it requires a retained ZIP. We'll test via the CSV stream directly.
    const stream = Readable.from(fixtureCSV);
    const headerResult = await (await import('../src/ingestion/tseCsvStream.ts')).readCsvHeader(stream);
    const allRecords: string[][] = [];
    for await (const row of readCsvLines(Readable.from(fixtureCSV), { delimiter: headerResult.delimiter })) {
      allRecords.push(row);
    }
    // First record is header
    const dataRecords = allRecords.slice(1);
    assert.equal(dataRecords.length, 3, '3 data records parsed');

    // Build dimensions
    const dims2 = buildDimensionCounts(dataRecords, headerResult.header);
    assert.equal(dims2.UF.find(u => u.UF === 'AC')!.count, 2);
    assert.equal(dims2.UF.find(u => u.UF === 'RS')!.count, 1);

    // Reconcile
    const report = reconcileAgainstExpected(dims2, {
      source_ref: 'Fixture',
      method: 'FLAT_FILE_LINE_COUNT',
      per_dimension: {
        'UF:AC': { UF: 'AC', expected_count: 2, source_ref: 'Fixture', method: 'FLAT_FILE_LINE_COUNT' },
        'UF:RS': { UF: 'RS', expected_count: 1, source_ref: 'Fixture', method: 'FLAT_FILE_LINE_COUNT' }
      }
    });
    const covAC = report.find(c => c.dimension === 'UF' && c.key === 'AC')!;
    assert.equal(covAC.status, 'COMPLETE');
    console.log('  OK');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  // 9) Multiline field in CSV is now supported (regression from old parser)
  console.log('9) Multiline field support (RFC-4180)');
  const multilineCSV = Buffer.from('a;"linha1\nlinha2";c\n', 'latin1');
  const mlRecords: string[][] = [];
  for await (const row of readCsvLines(Readable.from(multilineCSV), { delimiter: ';' })) {
    mlRecords.push(row);
  }
  assert.deepEqual(mlRecords, [['a', 'linha1\nlinha2', 'c']], 'multiline field preserved');
  console.log('  OK');

  // 10) Escaped quotes in quoted field
  console.log('10) Escaped quotes');
  const quoteCSV = Buffer.from('a;"\"\"hello\"\"";c\n', 'latin1');
  const qRecords: string[][] = [];
  for await (const row of readCsvLines(Readable.from(quoteCSV), { delimiter: ';' })) {
    qRecords.push(row);
  }
  assert.deepEqual(qRecords, [['a', '"hello"', 'c']], 'escaped quotes unescaped');
  console.log('  OK');

  // 11) Delimiter inside quoted field
  console.log('11) Delimiter in quoted field');
  const delimCSV = Buffer.from('a;"b;c";d\n', 'latin1');
  const dRecords: string[][] = [];
  for await (const row of readCsvLines(Readable.from(delimCSV), { delimiter: ';' })) {
    dRecords.push(row);
  }
  assert.deepEqual(dRecords, [['a', 'b;c', 'd']], 'delimiter in quotes not split');
  console.log('  OK');

  // 12) CRLF/LF/CR line endings
  console.log('12) Line endings');
  const crlfCSV = Buffer.from('a;b;c\r\n1;2;3\r4;5;6\n', 'latin1');
  const lfRecords: string[][] = [];
  for await (const row of readCsvLines(Readable.from(crlfCSV), { delimiter: ';' })) {
    lfRecords.push(row);
  }
  assert.deepEqual(lfRecords, [['a','b','c'],['1','2','3'],['4','5','6']], 'CRLF/CR/LF all work');
  console.log('  OK');

  // 13) Empty field
  console.log('13) Empty field');
  const emptyCSV = Buffer.from('a;;c\n', 'latin1');
  const eRecords: string[][] = [];
  for await (const row of readCsvLines(Readable.from(emptyCSV), { delimiter: ';' })) {
    eRecords.push(row);
  }
  assert.deepEqual(eRecords, [['a', '', 'c']], 'empty field preserved');
  console.log('  OK');

  // 14) EOF without newline
  console.log('14) EOF without newline');
  const eofCSV = Buffer.from('a;b;c', 'latin1');
  const eofRecords: string[][] = [];
  for await (const row of readCsvLines(Readable.from(eofCSV), { delimiter: ';' })) {
    eofRecords.push(row);
  }
  assert.deepEqual(eofRecords, [['a','b','c']], 'EOF without newline parsed');
  console.log('  OK');

  // 15) Limits: maxRecordBytes, maxFieldBytes, maxColumns
  console.log('15) Limits enforcement');
  const longRecord = Buffer.from('a;' + 'x'.repeat(200) + ';c\n', 'latin1');
  try {
    for await (const _ of readCsvLines(Readable.from(longRecord), { delimiter: ';', maxRecordBytes: 100 })) { }
    assert.fail('should have thrown RECORD_TOO_LARGE');
  } catch (err: any) {
    assert.equal(err.code, 'RECORD_TOO_LARGE');
  }
  console.log('  OK');

  const manyCols = Buffer.from('a;' + 'b;'.repeat(50) + 'c\n', 'latin1');
  try {
    for await (const _ of readCsvLines(Readable.from(manyCols), { delimiter: ';', maxColumns: 10 })) { }
    assert.fail('should have thrown TOO_MANY_COLUMNS');
  } catch (err: any) {
    assert.equal(err.code, 'TOO_MANY_COLUMNS');
  }
  console.log('  OK');

  // 16) Partial != COMPLETE: maxRows -> PARTIAL_MAX_ROWS
  console.log('16) Partial scan status');
  // We test via the flags directly
  assert.equal(determineScanStatus({ fullyConsumed: false, maxRowsReached: true, cancelled: false, error: false, sizeLimitReached: false }), 'PARTIAL_MAX_ROWS');
  assert.equal(determineScanStatus({ fullyConsumed: false, maxRowsReached: false, cancelled: true, error: false, sizeLimitReached: false }), 'PARTIAL_CANCELLED');
  assert.equal(determineScanStatus({ fullyConsumed: false, maxRowsReached: false, cancelled: false, error: true, sizeLimitReached: false }), 'PARTIAL_ERROR');
  assert.equal(determineScanStatus({ fullyConsumed: true, maxRowsReached: false, cancelled: false, error: false, sizeLimitReached: false }), 'COMPLETE');
  console.log('  OK');

  // 17) scanStoredZipMember end-to-end: streaming aggregation (no records[]), filters,
  // record classification, and scan_status gating of coverage.
  console.log('17) scanStoredZipMember integration');
  {
    const resourceId = '40fdcf49-256a-4c81-87cf-711545bd1528';
    const scanRoot = await mkdtemp(path.join(os.tmpdir(), 'tse-scan-'));
    try {
      const yearDir = path.join(scanRoot, '2022');
      await mkdir(yearDir, { recursive: true });
      const memberName = 'votacao.csv';
      const fixture = Buffer.from(
        'ANO_ELEICAO;SG_UF;CD_CARGO;NR_TURNO;CD_MUNICIPIO;NR_ZONA;SQ_CANDIDATO;QT_VOTOS\n' +
        '2022;AC;6;1;1001;1;100;100\n' +
        '2022;AC;6;1;1002;1;101;200\n' +
        '2022;RS;7;2;2001;5;200;300\n' +
        '2022;AC;6;1\n' +
        '2022;AC;6;1;1001;1;100;50\n',
        'latin1'
      );
      const zipBytes = buildZip([{ name: memberName, data: fixture }]);
      const zipPath = path.join(yearDir, `${resourceId}-scan.zip`);
      await writeFile(zipPath, zipBytes);
      const sha256 = createHash('sha256').update(zipBytes).digest('hex');
      await writeFile(`${zipPath}.manifest.json`, JSON.stringify({
        source: 'Portal de Dados Abertos do TSE',
        resource_id: resourceId,
        dataset_id: 'resultados-2022',
        dataset_title: 'Resultados - 2022',
        resource_name: 'Votação nominal',
        resource_url: 'https://cdn.tse.jus.br/estatistica/teste/resultados.zip',
        package_modified_at: null,
        resource_modified_at: null,
        requested_year: 2022,
        detected_kind: 'VOTACAO_NOMINAL_MUNICIPIO_ZONA',
        format: 'ZIP',
        size_bytes: zipBytes.length,
        sha256,
        downloaded_at: '2026-01-01T00:00:00.000Z',
        validation_status: 'DOWNLOADED_HASHED_LAYOUT_REVIEW_REQUIRED',
        validation: { extension_matches_format: false, signature_valid: true, csv_header: null, notes: [] },
        local_file: zipPath
      }), { encoding: 'utf8' });
      const client = new TseOpenDataClient({ downloadDir: scanRoot });

      // 17a) full scan: invalid + duplicate classification, COMPLETE status, coverage COMPLETE.
      const full = await client.scanStoredZipMember(resourceId, 2022, memberName, {
        expected: {
          source_ref: 'fixture',
          method: 'FLAT_FILE_LINE_COUNT',
          per_dimension: {
            'UF:AC': { UF: 'AC', expected_count: 3, source_ref: 'fixture', method: 'FLAT_FILE_LINE_COUNT' },
            'UF:RS': { UF: 'RS', expected_count: 1, source_ref: 'fixture', method: 'FLAT_FILE_LINE_COUNT' }
          }
        }
      });
      assert.equal(full.summary.scan_status, 'COMPLETE', 'full scan COMPLETE');
      assert.equal(full.summary.counters.records_read, 5, '5 data rows read');
      assert.equal(full.summary.counters.records_invalid, 1, 'malformed row = inválido');
      assert.equal(full.summary.counters.records_accepted, 4);
      assert.equal(full.summary.counters.records_rejected, 0);
      assert.equal(full.duplicates.length, 1, 'duplicate composite key detected');
      assert.equal(full.duplicates[0].count, 2);
      assert.equal(full.coverage.find(c => c.dimension === 'UF' && c.key === 'AC')!.status, 'COMPLETE');
      console.log('  OK full');

      // 17b) filters reject non-matching rows and exclude them from aggregates.
      const filtered = await client.scanStoredZipMember(resourceId, 2022, memberName, {
        filters: [{ column: 'SG_UF', values: ['AC'] }]
      });
      assert.equal(filtered.summary.counters.records_rejected, 1, 'RS row rejected by filter');
      assert.equal(filtered.summary.counters.records_accepted, 3);
      assert.equal(filtered.summary.dimensions.UF.some(u => u.UF === 'RS'), false, 'rejected UF absent from aggregates');
      console.log('  OK filters');

      // 17c) maxRows -> PARTIAL; coverage must NOT be COMPLETE even when counts match.
      const partial = await client.scanStoredZipMember(resourceId, 2022, memberName, {
        maxRows: 1,
        expected: {
          source_ref: 'fixture',
          method: 'FLAT_FILE_LINE_COUNT',
          per_dimension: {
            'UF:AC': { UF: 'AC', expected_count: 1, source_ref: 'fixture', method: 'FLAT_FILE_LINE_COUNT' }
          }
        }
      });
      assert.equal(partial.summary.scan_status, 'PARTIAL_MAX_ROWS');
      assert.equal(partial.summary.counters.records_accepted, 1);
      assert.equal(partial.coverage.find(c => c.dimension === 'UF' && c.key === 'AC')!.status, 'PARTIAL', 'partial scan cannot yield COMPLETE coverage');
      console.log('  OK partial gate');
    } finally {
      await rm(scanRoot, { recursive: true, force: true });
    }
  }
  console.log('  OK');

  console.log('\n=== ALL RECONCILIATION TESTS PASSED ===');
}

run().catch(err => {
  console.error('Tests failed:', err);
  process.exitCode = 1;
});
