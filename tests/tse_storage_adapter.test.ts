/**
 * Tests for the TSE object-storage adapter (Etapa 2) and the deterministic
 * object key. Uses the real `LocalObjectStorage` on a temp dir and a fake
 * `R2S3Client` for the R2 adapter — no real credentials or network involved.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  LocalObjectStorage,
  R2ObjectStorage,
  tseObjectKey,
  type R2S3Client,
  type TseObjectMetadata
} from '../src/storage/tseStorageAdapter.ts';

const resourceId = '40fdcf49-256a-4c81-87cf-711545bd1528';
const sha256 = 'cd44bcc2260c3b7e53c254aa9b03ff989ad7511737d5df9a2b99c78e45eb00ef';

function fixtureMetadata(overrides: Partial<TseObjectMetadata> = {}): TseObjectMetadata {
  return {
    source: 'Portal de Dados Abertos do TSE',
    resource_id: resourceId,
    dataset_id: 'resultados-2022',
    dataset_title: 'Resultados - 2022',
    resource_name: 'Votação nominal por município e zona',
    resource_url: 'https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip',
    package_modified_at: '2026-01-01T00:00:00',
    resource_modified_at: null,
    requested_year: 2022,
    detected_kind: 'VOTACAO_NOMINAL_MUNICIPIO_ZONA',
    format: 'CSV',
    size_bytes: 0,
    sha256: '',
    downloaded_at: '2026-10-09T22:29:45.842Z',
    validation_status: 'DOWNLOADED_HASHED_LAYOUT_REVIEW_REQUIRED',
    validation: { extension_matches_format: false, signature_valid: true, csv_header: null, notes: [] },
    ...overrides
  };
}

class FakeR2Client implements R2S3Client {
  readonly objects = new Map<string, Buffer>();
  readonly getFailures = new Set<string>();

  async putObject(key: string, stream: Readable): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    this.objects.set(key, Buffer.concat(chunks));
  }

  async getObject(key: string): Promise<Readable | null> {
    if (this.getFailures.has(key)) throw new Error('Falha de download simulada (rede/credencial R2).');
    const value = this.objects.get(key);
    return value === undefined ? null : Readable.from(value);
  }

  async headObject(key: string): Promise<Record<string, string> | null> {
    return this.objects.has(key) ? { 'content-length': String(this.objects.get(key)!.length) } : null;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async listObjects(prefix: string): Promise<string[]> {
    return [...this.objects.keys()].filter(key => key.startsWith(prefix));
  }
}

async function collect(stream: Readable): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const chunk of stream) parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(parts);
}

async function run() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tse-storage-'));
  try {
    const csv = Buffer.from('ANO_ELEICAO;CD_CARGO;DS_CARGO\n2022;7;DEPUTADO ESTADUAL\n2022;1;PRESIDENTE\n', 'latin1');

    // --- tseObjectKey determinístico ---
    const key = tseObjectKey(2022, resourceId, sha256, '.zip');
    assert.equal(key, `tse/2022/${resourceId}/${sha256}.zip`);
    assert.equal(tseObjectKey(2022, resourceId, sha256, 'zip'), key, 'extensão sem ponto deve normalizar');
    assert.equal(tseObjectKey(2022, resourceId, sha256.toUpperCase(), '.zip'), key, 'sha256 deve normalizar para minúsculas');
    assert.throws(() => tseObjectKey(2022, '../evil', sha256, '.zip'), /Chave TSE inválida/);
    assert.throws(() => tseObjectKey(2022, resourceId, 'nãoéhex', '.zip'), /Chave TSE inválida/);
    assert.throws(() => tseObjectKey(999, resourceId, sha256, '.zip'), /Chave TSE inválida/);
    assert.throws(() => tseObjectKey(2022, resourceId, sha256, '../../../etc/passwd'), /Chave TSE inválida/, 'extensão com path traversal rejeitada');

    // --- LocalObjectStorage ---
    const local = new LocalObjectStorage(tempDir);
    assert.equal(await local.head(key), null);
    assert.equal(await local.get(key), null);

    const stored = await local.put(key, Readable.from(csv), fixtureMetadata());
    assert.equal(stored.size_bytes, csv.length);
    assert.equal(stored.sha256, createHash('sha256').update(csv).digest('hex'), 'sha256 deve ser calculado do stream, não herdado do metadata');
    assert.equal((await local.head(key))?.size_bytes, csv.length);

    const fetched = await local.get(key);
    assert.ok(fetched, 'get deve retornar o objeto');
    assert.equal(fetched.metadata?.sha256, stored.sha256);
    assert.equal(fetched.size, csv.length);
    assert.deepEqual(await collect(fetched.stream), csv);

    assert.deepEqual(await local.list('tse/'), [key]);
    assert.deepEqual(await local.list('tse/2022/'), [key]);

    // Reuso: mesma chave determinística -> mesmo objeto físico, sem duplicação.
    await local.put(key, Readable.from(csv), fixtureMetadata());
    const files = await readdir(path.join(tempDir, 'tse', '2022', resourceId));
    assert.equal(files.filter(file => file.endsWith('.zip')).length, 1, 'reuso deve manter um único objeto');
    assert.equal((await local.get(key))?.size, csv.length);

    // Falha de upload: artefato incompleto deve ser limpo.
    const failingStream = new Readable({
      read() {
        this.push(Buffer.from('linha1\n'));
        this.destroy(new Error('falha simulada no meio do stream'));
      }
    });
    const badKey = 'tse/2023/11111111-1111-1111-1111-111111111111/deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef.zip';
    await assert.rejects(() => local.put(badKey, failingStream, fixtureMetadata({ requested_year: 2023 })), /falha simulada/);
    const badKeyDir = path.join(tempDir, 'tse', '2023', '11111111-1111-1111-1111-111111111111');
    assert.deepEqual(await readdir(badKeyDir).catch(() => []), [], 'nenhum artefato parcial deve sobrar após upload falho');

    // Delete.
    await local.delete(key);
    assert.equal(await local.get(key), null);
    assert.equal(await local.head(key), null);
    assert.deepEqual(await local.list('tse/'), []);

    // --- R2ObjectStorage (fake client) ---
    const client = new FakeR2Client();
    const r2 = new R2ObjectStorage(client);

    assert.equal(await r2.head(key), null);
    assert.equal(await r2.get(key), null);

    await r2.put(key, Readable.from(csv), fixtureMetadata());
    assert.equal((await r2.head(key))?.resource_id, resourceId);
    const r2Fetched = await r2.get(key);
    assert.ok(r2Fetched);
    assert.equal(r2Fetched.size, csv.length);
    assert.equal(r2Fetched.metadata?.size_bytes, csv.length);
    assert.deepEqual(await collect(r2Fetched.stream), csv);
    assert.deepEqual(await r2.list('tse/'), [key], 'manifesto não deve aparecer como objeto em list()');

    // Reuso: mesma chave -> mesmo objeto, sem duplicação.
    await r2.put(key, Readable.from(csv), fixtureMetadata());
    assert.equal(client.objects.size, 2, 'um objeto de dados + um manifesto, sem duplicação');

    // Falha de download -> erro claro, sem dados corrompidos.
    client.getFailures.add(key);
    await assert.rejects(() => r2.get(key), /falha|rede|credencial/i);
    client.getFailures.delete(key);
    assert.deepEqual(await collect((await r2.get(key))!.stream), csv, 'objeto permanece íntegro após falha simulada');

    await r2.delete(key);
    assert.equal(await r2.get(key), null);
    assert.equal(await r2.head(key), null);

    console.log('TSE storage adapter verified (local + R2 fake).');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error('TSE storage adapter tests failed:', error);
  process.exitCode = 1;
});