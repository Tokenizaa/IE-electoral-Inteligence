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
  const csv = 'ANO_ELEICAO;CD_CARGO;DS_CARGO;SQ_CANDIDATO;QT_VOTOS_NOMINAIS_VALIDOS\n2022;7;DEPUTADO ESTADUAL;12345;10\n2022;1;PRESIDENTE;12346;20\n2022;7;DEPUTADO ESTADUAL;12347;5\n';

  let sourceDownloadCount = 0;
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
      sourceDownloadCount++;
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

    // The same resource and unchanged CKAN metadata must reuse the retained
    // artifact rather than downloading a duplicate copy.
    const reusedManifest = await client.downloadResource(resourceId, 2022);
    assert.equal(reusedManifest.local_file, manifest.local_file);
    assert.equal(sourceDownloadCount, 1, 'Um recurso inalterado não deve ser baixado novamente.');
    const inventory = await client.listStoredResources(2022);
    assert.equal(inventory.length, 1);
    assert.equal(inventory[0].artifact_status, 'AVAILABLE');
    assert.equal(inventory[0].manifest.sha256, manifest.sha256);

    const inspection = await client.inspectDownloadedResource(resourceId, 2022);
    assert.equal(inspection.total_registros, 3);
    assert.deepEqual(inspection.cargos.map(item => item.cd_cargo), ['1', '7']);
    assert.equal(inspection.cargos.find(item => item.cd_cargo === '7')?.registros_observados, 2);
    assert.equal(inspection.cargos.find(item => item.cd_cargo === '1')?.ds_cargo, 'PRESIDENTE');
    assert.match(inspection.validation_status, /LAYOUT_AINDA_REQUER_VALIDACAO/);

    await assert.rejects(() => client.downloadResource(resourceId, 2024), /não foi identificado individualmente como pertencente à eleição de 2024/);

    // A generic package can hold several years; only year-labelled resources belong in each result.
    const multiYear2022 = { ...resource, id: '11111111-1111-1111-1111-111111111111', name: 'Votação nominal - 2022', description: 'Todas as UFs', package_id: packageId };
    const multiYear2026 = { ...resource, id: '22222222-2222-2222-2222-222222222222', name: 'Votação nominal - 2026', description: 'Todas as UFs', package_id: packageId };
    const genericPackage = { ...pkg, name: 'resultados-votacao', title: 'Resultados de votação', notes: 'Arquivos por ano eleitoral', resources: [multiYear2022, multiYear2026] };
    const multiYearFetch: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/package_search')) return Response.json({ success: true, result: { count: 1, results: [genericPackage] } });
      if (url.pathname.endsWith('/resource_show')) {
        const id = url.searchParams.get('id');
        return Response.json({ success: true, result: id === multiYear2026.id ? multiYear2026 : multiYear2022 });
      }
      if (url.pathname.endsWith('/package_show')) return Response.json({ success: true, result: genericPackage });
      throw new Error(`Unexpected URL: ${url}`);
    };
    const multiYearClient = new TseOpenDataClient({ fetchImpl: multiYearFetch, downloadDir: tempDir });
    const yearScopedCatalog = await multiYearClient.search(2022);
    assert.deepEqual(yearScopedCatalog.resources.map(item => item.id), [multiYear2022.id]);
    await assert.rejects(
      () => multiYearClient.downloadResource(multiYear2026.id, 2022),
      /não foi identificado individualmente/
    );

    // CKAN metadata may say CSV while the official resource URL is a ZIP container.
    const zipResource = {
      ...resource,
      id: '87654321-4321-4321-4321-cba987654321',
      format: 'CSV',
      url: 'https://cdn.tse.jus.br/estatistica/teste/resultados.zip'
    };
    const zipPackage = { ...pkg, resources: [zipResource] };
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const zipFetch: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/resource_show')) return Response.json({ success: true, result: zipResource });
      if (url.pathname.endsWith('/package_show')) return Response.json({ success: true, result: zipPackage });
      if (url.hostname === 'cdn.tse.jus.br') return new Response(zipBytes, { status: 200, headers: { 'content-length': String(zipBytes.length) } });
      throw new Error(`Unexpected URL: ${url}`);
    };
    const zipClient = new TseOpenDataClient({ fetchImpl: zipFetch, downloadDir: tempDir });
    const zipManifest = await zipClient.downloadResource(zipResource.id, 2022);
    assert.ok(zipManifest.local_file.endsWith('.zip'), 'A extensão real da URL deve prevalecer sobre o metadado genérico CSV.');
    assert.equal(zipManifest.validation.signature_valid, true);
    assert.equal(zipManifest.validation.extension_matches_format, false, 'A divergência entre formato declarado e container deve permanecer auditável.');

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
    // Isolate this case from the previously downloaded resource: otherwise
    // idempotent reuse would correctly skip the redirect path being tested.
    const redirectClient = new TseOpenDataClient({ fetchImpl: redirectFetch, downloadDir: path.join(tempDir, 'redirect-test') });
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
