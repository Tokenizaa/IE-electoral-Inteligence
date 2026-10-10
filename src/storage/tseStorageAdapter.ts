/**
 * Object-storage adapter for retained TSE source artifacts.
 *
 * Two implementations of the same minimal interface:
 * - `LocalObjectStorage` — real filesystem adapter over `var/tse-downloads`
 *   (default). Streams to/from disk; never loads whole files into memory.
 *   Writes are atomic (temp file + rename) so a failed upload never leaves a
 *   partial artifact behind.
 * - `R2ObjectStorage` — Cloudflare R2 over its S3-compatible API. It does NOT
 *   presume real credentials or a provisioned bucket; it delegates to an
 *   injected minimal `R2S3Client` whose methods return Node Readables.
 *   Provisioning that client for production requires: an R2 bucket, an R2 S3
 *   API token (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
 *   `R2_BUCKET`) and a bucket policy granting GetObject/PutObject/ListObjects/
 *   DeleteObject. SigV4 request signing is intentionally NOT implemented here
 *   — production wiring must supply it (or a signed fetch wrapper).
 *
 * Key layout (deterministic, no user-controlled paths):
 *   object:   `tse/<ano>/<resourceId>/<sha256>.<ext>`
 *   manifest: `tse/<ano>/<resourceId>/<sha256>.<ext>.manifest.json`
 * A manifest is only written after the whole object has been streamed and
 * hashed locally; a locally computed hash is never presented as a verified one.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { TseResourceKind } from '../ingestion/tseOpenData.ts';

export const DEFAULT_LOCAL_STORAGE_ROOT = path.resolve(process.cwd(), 'var/tse-downloads');
export const MANIFEST_SUFFIX = '.manifest.json';

export interface TseObjectMetadata {
  source: 'Portal de Dados Abertos do TSE';
  resource_id: string;
  dataset_id: string;
  dataset_title: string;
  resource_name: string;
  resource_url: string;
  package_modified_at: string | null;
  resource_modified_at: string | null;
  requested_year: number;
  detected_kind: TseResourceKind;
  format: string;
  size_bytes: number;
  sha256: string;
  downloaded_at: string;
  validation_status: string;
  validation: {
    extension_matches_format: boolean;
    signature_valid: boolean | null;
    csv_header: string[] | null;
    notes: string[];
  };
}

export interface TseObjectStorage {
  put(key: string, streamOrBuffer: Readable | Buffer, metadata: TseObjectMetadata): Promise<TseObjectMetadata>;
  get(key: string): Promise<{ stream: Readable; metadata: TseObjectMetadata | null; size: number | null } | null>;
  head(key: string): Promise<TseObjectMetadata | null>;
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

/** Deterministic object key. Validates every component; no user-controlled paths. */
export function tseObjectKey(year: number, resourceId: string, sha256: string, extension: string): string {
  if (!Number.isInteger(year) || year < 1994 || year > new Date().getFullYear() + 1) throw new Error('Chave TSE inválida: ano fora do intervalo permitido.');
  if (!/^[a-f0-9-]{16,64}$/i.test(resourceId)) throw new Error('Chave TSE inválida: identificador de recurso malformado.');
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('Chave TSE inválida: sha256 deve ter 64 caracteres hexadecimais.');
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  if (!/^\.[a-z0-9]{1,8}$/i.test(ext)) throw new Error('Chave TSE inválida: extensão não permitida.');
  return `tse/${year}/${resourceId}/${sha256.toLowerCase()}${ext}`;
}

function toReadable(streamOrBuffer: Readable | Buffer): Readable {
  return streamOrBuffer instanceof Readable ? streamOrBuffer : Readable.from(streamOrBuffer);
}

function parseManifest(text: string): TseObjectMetadata | null {
  try {
    const parsed = JSON.parse(text) as TseObjectMetadata;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export class LocalObjectStorage implements TseObjectStorage {
  private readonly root: string;

  constructor(root: string = DEFAULT_LOCAL_STORAGE_ROOT) {
    this.root = path.resolve(root);
  }

  private objectPath(key: string): string {
    const resolved = path.resolve(this.root, key);
    const relative = path.relative(this.root, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Chave de objeto inválida: fora do diretório raiz.');
    return resolved;
  }

  private manifestPath(key: string): string {
    return `${this.objectPath(key)}${MANIFEST_SUFFIX}`;
  }

  async put(key: string, streamOrBuffer: Readable | Buffer, metadata: TseObjectMetadata): Promise<TseObjectMetadata> {
    const objectFilePath = this.objectPath(key);
    await mkdir(path.dirname(objectFilePath), { recursive: true });
    const partialPath = `${objectFilePath}.${randomUUID()}.part`;
    const hash = createHash('sha256');
    let size = 0;
    const limiter = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        size += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      }
    });
    try {
      await pipeline(toReadable(streamOrBuffer), limiter, createWriteStream(partialPath, { flags: 'wx' }));
      const resolved: TseObjectMetadata = { ...metadata, size_bytes: size, sha256: hash.digest('hex') };
      await rename(partialPath, objectFilePath);
      try {
        await this.writeManifest(key, resolved);
      } catch (error) {
        // Object without a manifest is not auditable; remove the orphan.
        await rm(objectFilePath, { force: true });
        throw error;
      }
      return resolved;
    } catch (error) {
      await rm(partialPath, { force: true });
      throw error;
    }
  }

  private async writeManifest(key: string, metadata: TseObjectMetadata): Promise<void> {
    const manifestPath = this.manifestPath(key);
    await writeFile(manifestPath, JSON.stringify(metadata, null, 2), { encoding: 'utf8' });
  }

  async get(key: string): Promise<{ stream: Readable; metadata: TseObjectMetadata | null; size: number | null } | null> {
    const objectFilePath = this.objectPath(key);
    let info;
    try {
      info = await stat(objectFilePath);
    } catch {
      return null;
    }
    const metadata = await this.head(key);
    return { stream: createReadStream(objectFilePath), metadata, size: info.isFile() ? info.size : null };
  }

  async head(key: string): Promise<TseObjectMetadata | null> {
    try {
      return parseManifest(await readFile(this.manifestPath(key), 'utf8'));
    } catch {
      return null;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (entry.name.endsWith(MANIFEST_SUFFIX) || entry.name.endsWith('.part') || entry.name.endsWith('.tmp')) continue;
        const relative = path.relative(this.root, full);
        if (relative.startsWith(prefix)) keys.push(relative);
      }
    };
    await walk(this.root);
    return keys.sort();
  }

  async delete(key: string): Promise<void> {
    await rm(this.objectPath(key), { force: true });
    await rm(this.manifestPath(key), { force: true });
  }
}

/** Minimal R2 S3-compatible client interface (streaming, no AWS SDK). */
export interface R2S3Client {
  putObject(key: string, stream: Readable): Promise<void>;
  getObject(key: string): Promise<Readable | null>;
  headObject(key: string): Promise<Record<string, string> | null>;
  deleteObject(key: string): Promise<void>;
  listObjects(prefix: string): Promise<string[]>;
}

/**
 * R2 storage adapter delegating to an injected `R2S3Client` (tests inject a
 * fake). Real deployment requires provisioned R2 bucket/token/policy and a
 * SigV4-signing client — see module comment. The manifest is stored as a
 * sidecar object so `head()` stays a metadata-only operation.
 */
export class R2ObjectStorage implements TseObjectStorage {
  constructor(private readonly client: R2S3Client) {}

  private manifestKey(key: string): string {
    return `${key}${MANIFEST_SUFFIX}`;
  }

async put(key: string, streamOrBuffer: Readable | Buffer, metadata: TseObjectMetadata): Promise<TseObjectMetadata> {
    const hash = createHash('sha256');
    let size = 0;
    const limiter = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        size += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      }
    });
    await this.client.putObject(key, toReadable(streamOrBuffer).pipe(limiter));
    // Digest only after the stream was consumed; local hash ≠ verified official hash.
    const resolved: TseObjectMetadata = { ...metadata, size_bytes: size, sha256: hash.digest('hex') };
    await this.client.putObject(this.manifestKey(key), Readable.from(JSON.stringify(resolved, null, 2)));
    return resolved;
  }

  async get(key: string): Promise<{ stream: Readable; metadata: TseObjectMetadata | null; size: number | null } | null> {
    const stream = await this.client.getObject(key);
    if (!stream) return null;
    const metadata = await this.head(key);
    return { stream, metadata, size: metadata?.size_bytes ?? null };
  }

  async head(key: string): Promise<TseObjectMetadata | null> {
    const headers = await this.client.headObject(this.manifestKey(key));
    if (!headers) return null;
    const manifestStream = await this.client.getObject(this.manifestKey(key));
    if (!manifestStream) return null;
    let text = '';
    for await (const chunk of manifestStream) text += chunk.toString('utf8');
    return parseManifest(text);
  }

  async list(prefix: string): Promise<string[]> {
    const keys = await this.client.listObjects(prefix);
    return keys.filter(key => !key.endsWith(MANIFEST_SUFFIX)).sort();
  }

  async delete(key: string): Promise<void> {
    await this.client.deleteObject(key);
    await this.client.deleteObject(this.manifestKey(key));
  }
}