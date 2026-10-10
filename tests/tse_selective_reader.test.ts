/**
 * Tests for the selective streaming ZIP CSV reader (Issue #3 — Etapas A–C).
 *
 * Covers: exact filter projection with literal byte preservation, incremental
 * batch streaming + cancellation/cleanup, structured errors for oversize
 * members / zip bombs / invalid containers, header edge cases, the column
 * allowlist, and byte-a-byte parsing primitives.
 *
 * ZIP fixtures are built in memory with the shared `tests/helpers/zipBuilder.ts`
 * (node:zlib only — no extra dependency).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { TseOpenDataClient } from '../src/ingestion/tseOpenData.ts';
import { DEFAULT_ZIP_LIMITS } from '../src/ingestion/tseZipReader.ts';
import { normalizeHeaderName, parseCsvRecord, readCsvHeader, readCsvLines } from '../src/ingestion/tseCsvStream.ts';
import {
  CSV_PARSER_VERSION,
  selectZipCsvRows,
  TseSelectError,
  VOTACAO_NOMINAL_MUNICIPIO_ZONA_COLUMNS,
  type TseSelectSummary
} from '../src/ingestion/tseSelectiveReader.ts';
import { buildZip, type ZipEntrySpec } from './helpers/zipBuilder.ts';

const VOTACAO_CSV = Buffer.from(
  'ANO_ELEICAO;SG_UF;CD_CARGO;NM_MUNICIPIO;QT_VOTOS_NOMINAIS\n' +
  '2022;AC;6;ACRELANDIA;10\n' +
  '2022;  AC  ;7;  X  ;20\n' +
  '2022;AC;7;;30\n',
  'latin1'
);

async function collect(gen: AsyncGenerator<string[][], TseSelectSummary, void>) {
  const batches: string[][][] = [];
  let summary: TseSelectSummary | null = null;
  for (;;) {
    const next = await gen.next();
    if (next.done) {
      summary = next.value;
      break;
    }
    batches.push(next.value);
  }
  assert.ok(summary, 'o generator deve devolver um summary ao terminar');
  return { batches, summary };
}

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

async function spoolDirs(): Promise<string[]> {
  return (await readdir(os.tmpdir())).filter(name => name.startsWith('tse-zip-spool-'));
}

/** Temp spool cleanup is async (fire-and-forget on stream close); wait until no
 * NEW spool directory (absent from `before`) remains. */
async function waitForNoNewSpool(before: string[], timeoutMs = 5000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  let leaked: string[] = [];
  for (;;) {
    const now = await spoolDirs();
    leaked = now.filter(dir => !before.includes(dir));
    if (leaked.length === 0 || Date.now() >= deadline) return leaked;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

async function run() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tse-select-test-'));
  const writeZip = async (name: string, entries: ZipEntrySpec[]): Promise<string> => {
    const filePath = path.join(tempDir, name);
    await writeFile(filePath, buildZip(entries));
    return filePath;
  };

  try {
    // 1) Filtro exato por coluna/valor + valores literais preservados.
    const basic = await writeZip('basic.zip', [{ name: 'votacao.csv', data: VOTACAO_CSV }]);
    const { batches, summary } = await collect(
      selectZipCsvRows(basic, 'votacao.csv', { filters: [{ column: 'SG_UF', values: ['AC'] }] })
    );
    assert.deepEqual(batches, [[
      ['2022', 'AC', '6', 'ACRELANDIA', '10'],
      ['2022', 'AC', '7', '', '30']
    ]], 'apenas SG_UF exatamente "AC" (a célula "  AC  " é outro valor)');
    assert.equal(summary.rows_read, 3);
    assert.equal(summary.rows_accepted, 2);
    assert.equal(summary.rows_rejected, 1);
    assert.equal(summary.member_name, 'votacao.csv');
    assert.equal(summary.delimiter, ';');
    assert.equal(summary.encoding, 'iso-8859-1');
    assert.equal(summary.max_rows, null);
    assert.equal(summary.truncated, false);
    assert.equal(summary.parser_version, CSV_PARSER_VERSION);

    // 2) Preservação literal: espaços, vazio, latin1, aspas escapadas, delimitador em aspas.
    const literal = await writeZip('literal.zip', [
      { name: 'lat.csv', data: Buffer.from('SG_UF;NM_MUNICIPIO\nRS;TEUTÔNIA\nRS;UNIÃO\n', 'latin1') },
      { name: 'quotes.csv', data: Buffer.from('SG_UF;NM_MUNICIPIO;SG_PARTIDO\n"x;y";"said ""hi""";z\n', 'latin1') }
    ]);
    const preserving = await collect(selectZipCsvRows(literal, 'lat.csv', { columns: ['SG_UF', 'NM_MUNICIPIO'] }));
    assert.deepEqual(preserving.batches, [[['RS', 'TEUTÔNIA'], ['RS', 'UNIÃO']]], 'latin1 preservado byte-a-byte');

    const quoted = await collect(selectZipCsvRows(literal, 'quotes.csv', { columns: ['SG_UF', 'NM_MUNICIPIO', 'SG_PARTIDO'] }));
    assert.deepEqual(quoted.batches, [[['x;y', 'said "hi"', 'z']]],
      'delimitador dentro de aspas não separa; "" vira "');

    const spaces = await collect(selectZipCsvRows(basic, 'votacao.csv', { columns: ['SG_UF', 'NM_MUNICIPIO'] }));
    assert.equal(spaces.batches[0][1][0], '  AC  ', 'espaços no início/fim não são removidos');
    assert.equal(spaces.batches[0][1][1], '  X  ');
    assert.equal(spaces.batches[0][2][1], '', 'campo vazio permanece ""');

    // 3) Streaming incremental em arquivo grande + cancellation/cleanup.
    const bigRow = '2022;1;RS;12345;CIDADE;1;7;999;10\n';
    const bigCsv = Buffer.from(
      'ANO_ELEICAO;NR_TURNO;SG_UF;CD_MUNICIPIO;NM_MUNICIPIO;NR_ZONA;CD_CARGO;SQ_CANDIDATO;QT_VOTOS_NOMINAIS\n' +
      bigRow.repeat(200_000),
      'latin1'
    );
    const bigZipPath = await writeZip('big.zip', [{ name: 'big.csv', data: bigCsv }]);

    const streamed = await collect(
      // Fixture altamente repetitiva comprime >100x; o override é consciente e por chamada
      // (os DEFAULT_ZIP_LIMITS permanecem conservadores — ver assert final).
      selectZipCsvRows(bigZipPath, 'big.csv', {
        filters: [{ column: 'SG_UF', values: ['RS'] }],
        batchSize: 500,
        limits: { maxExpansionRatio: 10_000 }
      })
    );
    assert.equal(streamed.batches.length, 400, '200k linhas / batchSize 500 = 400 lotes');
    assert.ok(streamed.batches.every(batch => batch.length === 500), 'cada lote respeita batchSize');
    assert.equal(streamed.summary.rows_read, 200_000);
    assert.equal(streamed.summary.rows_accepted, 200_000);
    assert.equal(streamed.summary.rows_rejected, 0);

    // maxRows: para cedo e marca truncated, sem varrer o arquivo inteiro.
    const capped = await collect(
      selectZipCsvRows(bigZipPath, 'big.csv', {
        filters: [{ column: 'SG_UF', values: ['RS'] }],
        batchSize: 1000,
        maxRows: 2500,
        limits: { maxExpansionRatio: 10_000 }
      })
    );
    assert.equal(capped.summary.rows_accepted, 2500);
    assert.equal(capped.summary.rows_read, 2500, 'maxRows interrompe a leitura (não varre 200k)');
    assert.equal(capped.summary.truncated, true);

    // Cancellation: consumir só o 1º lote e sair; stream do membro deve ser destruído
    // e o spool temporário removido (fonte Readable força materialização em temp).
    const baselineSpool = await spoolDirs();
    const bigZipBytes = buildZip([{ name: 'big.csv', data: bigCsv }]);
    const cancelGen = selectZipCsvRows(Readable.from(bigZipBytes), 'big.csv', {
      filters: [{ column: 'SG_UF', values: ['RS'] }],
      batchSize: 500,
      limits: { maxExpansionRatio: 10_000 }
    });
    const firstBatch = await cancelGen.next();
    assert.equal(firstBatch.done, false);
    assert.equal((firstBatch.value as string[][]).length, 500);
    const cancelled = await capture(cancelGen.return(undefined as never));
    assert.equal(cancelled, null, 'o generator deve encerrar sem lançar após cancellation');
    const leakedAfterCancel = await waitForNoNewSpool(baselineSpool);
    assert.deepEqual(leakedAfterCancel, [], 'nenhum spool temporário remanescente após cancellation');

    // 4) Membro acima do limite -> erro estruturado MEMBER_TOO_LARGE.
    const lying = await writeZip('lying.zip', [
      { name: 'huge.csv', data: VOTACAO_CSV, declaredUncompressedSize: 1_000_000_000 }
    ]);
    const tooLarge = await capture(collect(selectZipCsvRows(lying, 'huge.csv', { limits: { maxMemberBytes: 1000 } })));
    assert.ok(tooLarge instanceof TseSelectError, 'deve ser TseSelectError');
    assert.equal((tooLarge as TseSelectError).code, 'MEMBER_TOO_LARGE');
    assert.equal((tooLarge as TseSelectError).details.size_bytes, 1_000_000_000);
    assert.equal((tooLarge as TseSelectError).details.max_member_bytes, 1000);
    assert.ok(Array.isArray((tooLarge as TseSelectError).details.alternatives) &&
      ((tooLarge as TseSelectError).details.alternatives as string[]).length > 0);

    // 5) ZIP bomb (razão de expansão) e container inválido/truncado; sem temp remanescente.
    const bomb = await writeZip('bomb.zip', [
      { name: 'bomb.csv', data: Buffer.from('a;b\n1;2\n'), declaredUncompressedSize: 1_000_000_000 }
    ]);
    const bombError = await capture(collect(selectZipCsvRows(bomb, 'bomb.csv')));
    assert.ok(bombError instanceof TseSelectError);
    assert.equal((bombError as TseSelectError).code, 'ZIP_BOMB');

    const invalidBaseline = await spoolDirs();
    const invalidError = await capture(
      collect(selectZipCsvRows(Readable.from(Buffer.from('this is not a zip archive')), 'x.csv'))
    );
    assert.ok(invalidError instanceof TseSelectError);
    assert.equal((invalidError as TseSelectError).code, 'ZIP_READ_ERROR');
    const leakedAfterInvalid = await waitForNoNewSpool(invalidBaseline);
    assert.deepEqual(leakedAfterInvalid, [], 'falha de leitura não deixa temp');

    const truncatedBytes = buildZip([{ name: 'x.csv', data: VOTACAO_CSV }]);
    const truncated = await capture(
      collect(selectZipCsvRows(Readable.from(truncatedBytes.subarray(0, Math.floor(truncatedBytes.length / 2))), 'x.csv'))
    );
    assert.ok(truncated instanceof TseSelectError);
    assert.equal((truncated as TseSelectError).code, 'ZIP_READ_ERROR');

    // 6) Cabeçalho duplicado/ausente; coluna de filtro ausente; membro ausente.
    const dup = await writeZip('dup.zip', [{ name: 'd.csv', data: Buffer.from('SG_UF;SG_UF\nAC;AC\n', 'latin1') }]);
    const dupError = await capture(collect(selectZipCsvRows(dup, 'd.csv', { filters: [{ column: 'SG_UF', values: ['AC'] }] })));
    assert.ok(dupError instanceof TseSelectError);
    assert.equal((dupError as TseSelectError).code, 'DUPLICATE_COLUMN');

    const empty = await writeZip('empty-header.zip', [{ name: 'e.csv', data: Buffer.alloc(0) }]);
    const emptyError = await capture(collect(selectZipCsvRows(empty, 'e.csv')));
    assert.ok(emptyError instanceof TseSelectError);
    assert.equal((emptyError as TseSelectError).code, 'EMPTY_HEADER');

    const missingCol = await writeZip('missing-col.zip', [
      { name: 'm.csv', data: Buffer.from('ANO_ELEICAO;CD_CARGO\n2022;7\n', 'latin1') }
    ]);
    const missingError = await capture(collect(selectZipCsvRows(missingCol, 'm.csv', { filters: [{ column: 'SG_UF', values: ['RS'] }] })));
    assert.ok(missingError instanceof TseSelectError);
    assert.equal((missingError as TseSelectError).code, 'COLUMN_NOT_FOUND');

    const missingMember = await capture(collect(selectZipCsvRows(basic, 'nope.csv', {})));
    assert.ok(missingMember instanceof TseSelectError);
    assert.equal((missingMember as TseSelectError).code, 'MEMBER_NOT_FOUND');

    // 7) Coluna fora da allowlist (filtro e projeção) -> erro 400-like.
    const notAllowedFilter = await capture(collect(selectZipCsvRows(basic, 'votacao.csv', { filters: [{ column: 'NM_CANDIDATO', values: ['X'] }] })));
    assert.ok(notAllowedFilter instanceof TseSelectError);
    assert.equal((notAllowedFilter as TseSelectError).code, 'COLUMN_NOT_ALLOWED');
    assert.ok((notAllowedFilter as TseSelectError).details.allowed);
    const notAllowedColumns = await capture(collect(selectZipCsvRows(basic, 'votacao.csv', { columns: ['NM_CANDIDATO'] })));
    assert.ok(notAllowedColumns instanceof TseSelectError);
    assert.equal((notAllowedColumns as TseSelectError).code, 'COLUMN_NOT_ALLOWED');

    // 8) Primitivas: parseCsvRecord byte-a-byte, normalizeHeaderName, readCsvHeader.
    assert.deepEqual(parseCsvRecord('  a  ;b ;  c', ';'), ['  a  ', 'b ', '  c']);
    assert.deepEqual(parseCsvRecord('', ';'), ['']);
    assert.deepEqual(parseCsvRecord('"x;y";z', ';'), ['x;y', 'z']);
    assert.deepEqual(parseCsvRecord('"a""b";c', ';'), ['a"b', 'c']);
    assert.equal(normalizeHeaderName('\uFEFFano_eleicao'), 'ANO_ELEICAO');
    assert.equal(normalizeHeaderName(' SG_UF '), 'SG_UF');

    const headerResult = await readCsvHeader(Readable.from(Buffer.from('ANO_ELEICAO; SG_UF \n2022;AC\n', 'latin1')));
    assert.deepEqual(headerResult.raw_header, ['ANO_ELEICAO', ' SG_UF '], 'raw_header preserva bytes');
    assert.deepEqual(headerResult.header, ['ANO_ELEICAO', 'SG_UF'], 'header é normalizado');
    assert.equal(headerResult.delimiter, ';');
    assert.equal(headerResult.encoding, 'iso-8859-1');

    const parsedRows: string[][] = [];
    for await (const row of readCsvLines(Readable.from(Buffer.from('a;  b  ;c\r\n1;"x""y";3\n', 'latin1')))) parsedRows.push(row);
    assert.deepEqual(parsedRows, [['a', '  b  ', 'c'], ['1', 'x"y', '3']], 'readCsvLines preserva e trata CR/LF');

    // allowlist documentada inclui as colunas obrigatórias da votação nominal munzona.
    for (const column of ['SG_UF', 'CD_CARGO', 'SQ_CANDIDATO', 'QT_VOTOS_NOMINAIS', 'QT_VOTOS_NOMINAIS_VALIDOS']) {
      assert.ok(VOTACAO_NOMINAL_MUNICIPIO_ZONA_COLUMNS.includes(column), `allowlist deve conter ${column}`);
    }

    // 9) Integração: selectStoredZipRows resolve o ZIP retido; inspectStoredZip segue funcionando.
    const resourceId = '40fdcf49-256a-4c81-87cf-711545bd1528';
    const yearDir = path.join(tempDir, 'var-downloads', '2022');
    await mkdir(yearDir, { recursive: true });
    const memberName = 'votacao_candidato_munzona_2022_RS.csv';
    const zipBytes = buildZip([{ name: memberName, data: VOTACAO_CSV }]);
    const zipPath = path.join(yearDir, `${resourceId}-test.zip`);
    await writeFile(zipPath, zipBytes);
    const sha256 = createHash('sha256').update(zipBytes).digest('hex');
    const manifest = {
      source: 'Portal de Dados Abertos do TSE',
      resource_id: resourceId,
      dataset_id: 'resultados-2022',
      dataset_title: 'Resultados - 2022',
      resource_name: 'Votação nominal por município e zona',
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
    };
    await writeFile(`${zipPath}.manifest.json`, JSON.stringify(manifest));

    const client = new TseOpenDataClient({ downloadDir: path.join(tempDir, 'var-downloads') });
    const inspection = await client.inspectStoredZip(resourceId, 2022);
    assert.equal(inspection.zip_sha256, sha256, 'inspectStoredZip continua lendo o mesmo artefato');

    const gen = client.selectStoredZipRows(resourceId, 2022, memberName, {
      filters: [{ column: 'SG_UF', values: ['AC'] }],
      columns: ['ANO_ELEICAO', 'SG_UF', 'CD_CARGO'],
      batchSize: 1,
      maxRows: 1
    });
    // Consome manualmente para capturar o summary (for-await não expõe o return value).
    const collected: string[][] = [];
    let integrationSummary: TseSelectSummary | null = null;
    for (;;) {
      const next = await gen.next();
      if (next.done) { integrationSummary = next.value; break; }
      collected.push(...next.value);
    }
    assert.deepEqual(collected, [['2022', 'AC', '6']], 'projeção literal via selectStoredZipRows');
    assert.ok(integrationSummary);
    assert.equal((integrationSummary as TseSelectSummary).rows_accepted, 1);
    assert.equal((integrationSummary as TseSelectSummary).truncated, true);
    assert.equal((integrationSummary as TseSelectSummary).source.resource_id, resourceId);
    assert.equal((integrationSummary as TseSelectSummary).source.year, 2022);
    assert.equal((integrationSummary as TseSelectSummary).source.zip_sha256, sha256);
    assert.equal((integrationSummary as TseSelectSummary).source.member, memberName);
    assert.equal((integrationSummary as TseSelectSummary).source.member_uncompressed_size, VOTACAO_CSV.length);

    // Defaults de segurança do leitor de ZIP não foram afrouxados por este trabalho.
    assert.equal(DEFAULT_ZIP_LIMITS.maxMemberBytes, 3 * 1024 ** 3);

    console.log('TSE selective reader verified (fixtures): filters, literals, streaming, cancellation, errors.');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error('TSE selective reader tests failed:', error);
  process.exitCode = 1;
});
