/**
 * Tests for the secure TSE ZIP reader (Etapa 3) and the streaming CSV header
 * parser. ZIP fixtures are built in memory (local + central directory + EOCD)
 * with `node:zlib` only — no extra fixture dependency.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { crc32, deflateRawSync } from 'node:zlib';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { listZipEntries, readZipMember } from '../src/ingestion/tseZipReader.ts';
import { MULTILINE_FIELD_ERROR, readCsvHeader, readCsvLines } from '../src/ingestion/tseCsvStream.ts';
import { validateTseLayout } from '../src/ingestion/tseLayoutRegistry.ts';

interface ZipEntrySpec {
  name: string;
  data: Buffer;
  method?: 0 | 8; // stored | deflate
  encrypted?: boolean;
  declaredCompressedSize?: number;
  declaredUncompressedSize?: number;
}

/** Builds a minimal but valid ZIP archive in memory (stored or deflate). */
function buildZip(entries: ZipEntrySpec[]): Buffer {
  const body: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  for (const entry of entries) {
    const method = entry.method ?? 8;
    const flags = entry.encrypted ? 0x1 : 0;
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = method === 8 ? deflateRawSync(entry.data) : entry.data;
    const crc = crc32(entry.data) >>> 0;
    const compressedSize = entry.declaredCompressedSize ?? compressed.length;
    const uncompressedSize = entry.declaredUncompressedSize ?? entry.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressedSize, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    body.push(local, name, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(flags, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(dosTime, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressedSize, 20);
    cd.writeUInt32LE(uncompressedSize, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(0, 38); // external attributes
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);

    offset += 30 + name.length + compressed.length;
  }
  const centralDir = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...body, centralDir, eocd]);
}

const VOTACAO_CSV = Buffer.from(
  'ANO_ELEICAO;NR_TURNO;SG_UF;CD_MUNICIPIO;NM_MUNICIPIO;NR_ZONA;CD_CARGO;SQ_CANDIDATO;QT_VOTOS_NOMINAIS_VALIDOS;TP_VOTAVEL\n' +
  '2022;1;AC;1000;ACRELANDIA;1;6;12345;10;NOMINAL\n' +
  '2022;1;AC;1000;ACRELANDIA;1;6;12346;20;NOMINAL\n',
  'latin1'
);

async function listCsvMembersWithHeaders(source: string | Readable) {
  const members = await listZipEntries(source);
  const selected: { name: string; header: string[] }[] = [];
  for (const member of members.filter(candidate => /\.csv$/i.test(candidate.name))) {
    const { stream } = await readZipMember(source, member.name);
    try {
      const header = await readCsvHeader(stream);
      if (header.header.some(column => column.toUpperCase() === 'CD_CARGO')) selected.push({ name: member.name, header: header.header });
    } finally {
      stream.destroy();
    }
  }
  return { members, selected };
}

async function run() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tse-zip-'));
  try {
    // 1) ZIP válido com 1 CSV TSE: list + header + hash do stream do membro.
    const oneCsv = buildZip([{ name: 'votacao_candidato_munzona_2022_AC.csv', data: VOTACAO_CSV }]);
    const oneCsvPath = path.join(tempDir, 'one-csv.zip');
    await writeFile(oneCsvPath, oneCsv);

    const oneEntries = await listZipEntries(oneCsvPath);
    assert.equal(oneEntries.length, 1);
    assert.equal(oneEntries[0].name, 'votacao_candidato_munzona_2022_AC.csv');
    assert.equal(oneEntries[0].uncompressed_size, VOTACAO_CSV.length);
    assert.equal(oneEntries[0].compression_method, 8);
    assert.equal(oneEntries[0].encrypted, false);

    const member = await readZipMember(oneCsvPath, 'votacao_candidato_munzona_2022_AC.csv');
    const memberHash = createHash('sha256');
    const memberChunks: Buffer[] = [];
    for await (const chunk of member.stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      memberChunks.push(buf);
      memberHash.update(buf);
    }
    assert.deepEqual(Buffer.concat(memberChunks), VOTACAO_CSV);
    assert.equal(memberHash.digest('hex'), createHash('sha256').update(VOTACAO_CSV).digest('hex'), 'SHA-256 do stream do membro deve conferir com o da fixture');

    // 2) ZIP com 2 CSVs + 1 PDF: filtra só o CSV com coluna CD_CARGO.
    const twoCsvPdf = buildZip([
      { name: 'consulta_cand_2022_AC.csv', data: VOTACAO_CSV },
      { name: 'relatorio_extra.csv', data: Buffer.from('foo;bar\n1;2\n', 'latin1') },
      { name: 'leiame.pdf', data: Buffer.from('%PDF-1.4 fake', 'latin1'), method: 0 }
    ]);
    const twoPath = path.join(tempDir, 'two-csv-pdf.zip');
    await writeFile(twoPath, twoCsvPdf);
    const filtered = await listCsvMembersWithHeaders(twoPath);
    assert.equal(filtered.members.length, 3);
    assert.equal(filtered.selected.length, 1, 'apenas o CSV com CD_CARGO deve ser selecionado');
    assert.equal(filtered.selected[0].name, 'consulta_cand_2022_AC.csv');
    assert.ok(filtered.selected[0].header.includes('CD_CARGO'));

    // 3) ZIP sem CSV.
    const noCsv = buildZip([{ name: 'leiame.pdf', data: Buffer.from('conteúdo', 'latin1') }]);
    const noCsvPath = path.join(tempDir, 'no-csv.zip');
    await writeFile(noCsvPath, noCsv);
    const noCsvEntries = await listZipEntries(noCsvPath);
    assert.equal(noCsvEntries.length, 1);
    assert.equal(noCsvEntries.filter(entry => /\.csv$/i.test(entry.name)).length, 0);

    // 4) zip-slip: nomes inseguros rejeitados; nada escrito fora.
    const maliciousNames = ['../evil.csv', '/abs.csv', 'C:\\x.csv', 'a\\..\\b.csv'];
    for (const name of maliciousNames) {
      const zipPath = path.join(tempDir, `slip-${Buffer.from(name).toString('hex')}.zip`);
      await writeFile(zipPath, buildZip([{ name, data: Buffer.from('x;y\n1;2\n') }]));
      await assert.rejects(() => listZipEntries(zipPath), /rejeitado|invalid|absolute|characters/i, `nome ${name} deve ser rejeitado`);
    }
    const afterSlip = await readdir(tempDir);
    assert.equal(afterSlip.some(file => file.includes('evil')), false, 'nenhum arquivo extraído/furtivo criado');
    await assert.rejects(() => readZipMember(oneCsvPath, '../evil.csv'), /rejeitado/, 'readZipMember também valida o nome pedido');

    // 5) Limites: entradas demais, tamanho descompactado/total e razão de expansão.
    const threeEntries = buildZip([
      { name: 'a.csv', data: Buffer.from('a\n') },
      { name: 'b.csv', data: Buffer.from('b\n') },
      { name: 'c.csv', data: Buffer.from('c\n') }
    ]);
    const threePath = path.join(tempDir, 'three.zip');
    await writeFile(threePath, threeEntries);
    await assert.rejects(() => listZipEntries(threePath, { maxEntries: 2 }), /mais de 2 membros/);

    // Cabeçalho central "mente" tamanho descompactado (sem armazenar o gigante).
    const lying = buildZip([{ name: 'bomb.csv', data: Buffer.from('a;b\n1;2\n'), declaredUncompressedSize: 1_000_000_000 }]);
    const lyingPath = path.join(tempDir, 'lying.zip');
    await writeFile(lyingPath, lying);
    await assert.rejects(() => listZipEntries(lyingPath, { maxUncompressedBytes: 1_000_000 }), /descompactado total/);
    await assert.rejects(() => readZipMember(lyingPath, 'bomb.csv', { maxExpansionRatio: 100 }), /expansão|por membro/);
    await assert.rejects(() => readZipMember(lyingPath, 'bomb.csv', { maxMemberBytes: 1000 }), /por membro/);

    // 6) Encrito / método não suportado rejeitados com erro claro.
    const encPath = path.join(tempDir, 'enc.zip');
    await writeFile(encPath, buildZip([{ name: 'x.csv', data: VOTACAO_CSV, encrypted: true }]));
    await assert.rejects(() => listZipEntries(encPath), /encriptado/);
    const unsupportedPath = path.join(tempDir, 'unsupported.zip');
    await writeFile(unsupportedPath, buildZip([{ name: 'x.csv', data: VOTACAO_CSV, method: 0 }]));
    // method 0 (stored) é suportado — validar que passa.
    assert.equal((await listZipEntries(unsupportedPath))[0].compression_method, 0);

    // 7) ZIP via stream (spooled internamente).
    const streamed = await listZipEntries(Readable.from(oneCsv));
    assert.equal(streamed.length, 1);
    const streamedMember = await readZipMember(Readable.from(oneCsv), 'votacao_candidato_munzona_2022_AC.csv');
    const streamedBytes = await new Promise<Buffer>((resolve, reject) => {
      const parts: Buffer[] = [];
      streamedMember.stream.on('data', part => parts.push(part));
      streamedMember.stream.on('end', () => resolve(Buffer.concat(parts)));
      streamedMember.stream.on('error', reject);
    });
    assert.deepEqual(streamedBytes, VOTACAO_CSV);

    // 8) CSV multilinha: bloqueado com erro claro; leitura em fluxo funciona.
    const multiline = Buffer.from('a;"linha1\nlinha2";c\n', 'latin1');
    await assert.rejects(async () => {
      for await (const _ of readCsvLines(Readable.from(multiline))) { /* consume */ }
    }, new RegExp(MULTILINE_FIELD_ERROR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    const rows: string[][] = [];
    for await (const row of readCsvLines(Readable.from(Buffer.from('a;b;c\r\n1;2;3\r\n4;5;6\n', 'latin1')))) rows.push(row);
    assert.deepEqual(rows, [['a', 'b', 'c'], ['1', '2', '3'], ['4', '5', '6']], 'CR/CRLF/LF suportados');

    // 9) Layout: cabeçalho real do CSV de votação valida sem lançar.
    const layout = validateTseLayout(2022, 'VOTACAO_NOMINAL_MUNICIPIO_ZONA', (await readCsvHeader(Readable.from(VOTACAO_CSV))).header);
    assert.notEqual(layout.status, 'UNKNOWN_LAYOUT');
    assert.equal(layout.ingestion_approved, false);

    console.log('TSE zip reader + csv stream verified (fixtures).');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error('TSE zip reader tests failed:', error);
  process.exitCode = 1;
});