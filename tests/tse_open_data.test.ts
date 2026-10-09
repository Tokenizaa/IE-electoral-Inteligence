import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TseOpenDataClient } from '../src/ingestion/tseOpenData.ts';

const resourceId = '12345678-1234-1234-1234-123456789abc';
const packageId = 'abcdefab-cdef-abcd-efab-cdefabcdefab';
const resource = {
  id: resourceId,
  name: 'Votação nominal por município e zona',
  description: 'Votação nominal por município e zona',
  format: 'CSV',
  url: 'https://cdn.tse.jus.br/estatistica/teste/votacao.csv',
  size: 87,
  package_id: packageId
};
const pkg = {
  id: packageId,
  name: 'resultados-2022',
  title: 'Resultados - 2022',
  metadata_modified: '2026-01-01T00:00:00',
  resources: [resource]
};

async function run() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tse-open-data-'));
  const csv = 'ANO_ELEICAO;CD_CARGO;SQ_CANDIDATO;QT_VOTOS_NOMINAIS_VALIDOS\n2022;7;12345;10\n';

  const mockFetch: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/package_search')) {
      return Response.json({ success: true, result: { count: 1, results: [pkg] } });
    }
    if (url.pathname.endsWith('/resource_show')) {
      return Response.json({ success: true, result: resource });
    }
    if (url.pathname.endsWith('/package_show')) {
      return Response.json({ success: true, result: pkg });
    }
    if (url.hostname === 'cdn.tse.jus.br') {
      return new Response(csv, { status: 200, headers: { 'content-type': 'text/csv', 'content-length': String(Buffer.byteLength(csv)) } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const client = new TseOpenDataClient({ fetchImpl: mockFetch, downloadDir: tempDir, maxDownloadBytes: 1024 * 1024 });
    const catalog = await client.search(2022);
    assert.equal(catalog.year, 2022);
    assert.equal(catalog.dataset_count, 1);
    assert.equal(catalog.resource_count, 1);
    assert.equal(catalog.resources[0].kind, 'VOTACAO_NOMINAL_MUNICIPIO_ZONA');

    const filtered = await client.search(2022, 'CANDIDATURAS');
    assert.equal(filtered.resource_count, 0, 'A classificação por tipo deve filtrar recursos, não inventar candidaturas.');

    await assert.rejects(() => client.search(1800), /Ano eleitoral inválido/);

    const manifest = await client.downloadResource(resourceId, 2022);
    assert.equal(manifest.validation_status, 'DOWNLOADED_HASHED_LAYOUT_REVIEW_REQUIRED');
    assert.equal(manifest.validation.signature_valid, true);
    assert.ok(manifest.validation.csv_header?.includes('CD_CARGO'));
    assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
    assert.equal(manifest.size_bytes, Buffer.byteLength(csv));
    assert.equal(await readFile(manifest.local_file, 'utf8'), csv);
    const savedManifest = JSON.parse(await readFile(`${manifest.local_file}.manifest.json`, 'utf8'));
    assert.equal(savedManifest.sha256, manifest.sha256);

    await assert.rejects(() => client.downloadResource(resourceId, 2024), /não foi identificado como eleição de 2024/);

    const unsafeFetch: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/resource_show')) {
        return Response.json({ success: true, result: { ...resource, url: 'https://example.com/not-tse.csv' } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };
    const unsafeClient = new TseOpenDataClient({ fetchImpl: unsafeFetch, downloadDir: tempDir });
    await assert.rejects(() => unsafeClient.downloadResource(resourceId, 2022), /URL HTTPS permitida/);

    let downloadRequestCount = 0;
    const redirectFetch: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/resource_show')) {
        return Response.json({ success: true, result: resource });
      }
      if (url.pathname.endsWith('/package_show')) {
        return Response.json({ success: true, result: pkg });
      }
      if (url.hostname === 'cdn.tse.jus.br') {
        downloadRequestCount++;
        return new Response(null, { status: 302, headers: { location: 'https://example.com/redirect-target' } });
      }
      throw new Error(`Unexpected URL should not be requested: ${url}`);
    };
    const redirectClient = new TseOpenDataClient({ fetchImpl: redirectFetch, downloadDir: tempDir });
    await assert.rejects(() => redirectClient.downloadResource(resourceId, 2022), /domínio não autorizado/);
    assert.equal(downloadRequestCount, 1, 'O cliente deve bloquear o destino externo antes de fazer a segunda requisição.');

    console.log('TSE Open Data catalog and downloader safeguards verified.');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error('TSE Open Data tests failed:', error);
  process.exitCode = 1;
});
