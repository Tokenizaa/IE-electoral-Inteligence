/**
 * Secure, streaming reader for TSE ZIP containers.
 *
 * Why `yauzl`: writing a correct ZIP parser is a security-sensitive task
 * (central directory, ZIP64, CRC, deflate decoding, zip-slip). `yauzl` is the
 * minimal, long-maintained streaming ZIP reader for Node: it parses the central
 * directory with random access, exposes lazy entries and decompresses member
 * data as a Readable stream — a member is never buffered entirely in memory.
 *
 * The reader NEVER writes member data to arbitrary paths; it only returns
 * member streams. Physical extraction, when it exists, belongs to a controlled
 * directory under `var/` (out of scope here). When the source is a Readable
 * stream (e.g. a remote object), the container is spooled to an anonymous temp
 * file under the OS temp dir so `yauzl` can random-access it; that copy is
 * removed after use.
 *
 * Safety checks (applied before any member data is streamed):
 * - zip-slip names are rejected (`..`, absolute, backslash, `C:`)
 * - encrypted entries are rejected (general-purpose bit flag bit 0)
 * - unsupported compression methods (not stored/deflate) are rejected
 * - archive-level limits (entry count, total compressed/uncompressed bytes),
 *   per-member byte cap and expansion-ratio guard stop zip bombs
 */
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';

export interface TseZipLimits {
  maxEntries: number;
  maxCompressedBytes: number;
  maxUncompressedBytes: number;
  maxExpansionRatio: number;
  maxMemberBytes: number;
}

/** Conservative defaults; TSE annual ZIP containers hold ~30 members. */
export const DEFAULT_ZIP_LIMITS: TseZipLimits = {
  maxEntries: 200,
  maxCompressedBytes: 6 * 1024 ** 3,
  maxUncompressedBytes: 25 * 1024 ** 3,
  maxExpansionRatio: 100,
  maxMemberBytes: 3 * 1024 ** 3
};

export interface TseZipEntryInfo {
  name: string;
  compressed_size: number;
  uncompressed_size: number;
  compression_method: number;
  encrypted: boolean;
}

/** Local file path or a Readable stream (spooled to a temp file for random access). */
export type TseZipSource = string | Readable;

const SUPPORTED_METHODS = [0, 8]; // stored, deflate

function infoFrom(entry: Entry): TseZipEntryInfo {
  return {
    name: entry.fileName,
    compressed_size: entry.compressedSize,
    uncompressed_size: entry.uncompressedSize,
    compression_method: entry.compressionMethod,
    encrypted: entry.isEncrypted()
  };
}

/** Rejects path traversal / absolute / backslash / drive-letter member names. */
function assertSafeEntryName(name: string): void {
  if (!name) throw new Error('Membro ZIP com nome vazio rejeitado.');
  if (/^[A-Za-z]:/.test(name) || /^[/\\]/.test(name) || name.includes('\\') || name.split('/').includes('..')) {
    throw new Error(`Membro ZIP com nome inseguro (zip-slip) rejeitado: ${JSON.stringify(name)}`);
  }
}

interface ResolvedSource {
  path: string;
  cleanup: () => Promise<void>;
}

/**
 * Materializes a ZIP stream into a controlled temp file so it can be read more
 * than once (central-directory listing + member reads). Returns the temp path
 * and a cleanup function. A local path source is used as-is (no copy).
 */
export function materializeZipSource(source: TseZipSource): Promise<ResolvedSource> {
  return resolveSource(source);
}

async function resolveSource(source: TseZipSource): Promise<ResolvedSource> {
  if (typeof source === 'string') return { path: path.resolve(source), cleanup: async () => {} };
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tse-zip-spool-'));
  const target = path.join(dir, 'archive.zip');
  try {
    await pipeline(Readable.from(source), createWriteStream(target, { flags: 'wx' }));
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    path: target,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

async function openZip(zipPath: string): Promise<ZipFile> {
  const zipfile = await yauzl.openPromise(zipPath, {
    lazyEntries: true,
    autoClose: false,
    decodeStrings: true,
    strictFileNames: true,
    validateEntrySizes: true
  });
  // Failures surface through eachEntry()/nextEntry()/member stream; this guard
  // prevents an unhandled 'error' crash between operations.
  zipfile.on('error', () => {});
  return zipfile;
}

function closeZip(zipfile: ZipFile): void {
  try {
    if (zipfile.isOpen) zipfile.close();
  } catch {
    // already closed
  }
}

/** Waits for the next lazy entry; resolves null when the archive `end` event fires. */
function nextEntry(zipfile: ZipFile): Promise<Entry | null> {
  return new Promise((resolve, reject) => {
    const onEntry = (entry: Entry): void => {
      cleanup();
      resolve(entry);
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
      zipfile.removeListener('entry', onEntry);
      zipfile.removeListener('end', onEnd);
      zipfile.removeListener('error', onError);
    }
    zipfile.once('entry', onEntry);
    zipfile.once('end', onEnd);
    zipfile.once('error', onError);
    zipfile.readEntry();
  });
}

/**
 * Lists ZIP members (central-directory metadata only, no data extraction).
 * Throws a clear error on unsafe names, encrypted/unsupported entries, or when
 * archive-level limits are exceeded.
 */
export async function listZipEntries(source: TseZipSource, limits: Partial<TseZipLimits> = {}): Promise<TseZipEntryInfo[]> {
  const lim: TseZipLimits = { ...DEFAULT_ZIP_LIMITS, ...limits };
  const { path: zipPath, cleanup } = await resolveSource(source);
  const zipfile = await openZip(zipPath);
  const entries: TseZipEntryInfo[] = [];
  let compressedTotal = 0;
  let uncompressedTotal = 0;
  try {
    for await (const entry of zipfile.eachEntry()) {
      assertSafeEntryName(entry.fileName);
      if (entry.isEncrypted()) throw new Error(`Membro ZIP encriptado rejeitado: ${JSON.stringify(entry.fileName)}.`);
      if (!SUPPORTED_METHODS.includes(entry.compressionMethod)) {
        throw new Error(`Método de compressão não suportado (${entry.compressionMethod}) no membro ${JSON.stringify(entry.fileName)}; somente stored/deflate são aceitos.`);
      }
      if (entries.length + 1 > lim.maxEntries) throw new Error(`O ZIP contém mais de ${lim.maxEntries} membros; limite de segurança excedido.`);
      compressedTotal += entry.compressedSize;
      uncompressedTotal += entry.uncompressedSize;
      if (compressedTotal > lim.maxCompressedBytes) throw new Error(`Tamanho compactado total (${compressedTotal} bytes) excede o limite de ${lim.maxCompressedBytes} bytes.`);
      if (uncompressedTotal > lim.maxUncompressedBytes) throw new Error(`Tamanho descompactado total (${uncompressedTotal} bytes) excede o limite de ${lim.maxUncompressedBytes} bytes.`);
      entries.push(infoFrom(entry));
    }
    return entries;
  } catch (error) {
    closeZip(zipfile);
    throw error;
  } finally {
    closeZip(zipfile);
    await cleanup();
  }
}

/**
 * Opens a streaming read of exactly one ZIP member. The caller must consume or
 * destroy the returned stream; the file handle is released when it closes.
 * Member data is never fully buffered.
 *
 * The exact member is found by name (trusted from a prior `listZipEntries`
 * call; names are validated against zip-slip). No member data is written
 * anywhere — only the returned stream is exposed.
 */
export async function readZipMember(
  source: TseZipSource,
  memberName: string,
  limits: Partial<TseZipLimits> = {}
): Promise<{ stream: Readable; entry: TseZipEntryInfo }> {
  const lim: TseZipLimits = { ...DEFAULT_ZIP_LIMITS, ...limits };
  assertSafeEntryName(memberName);
  const { path: zipPath, cleanup } = await resolveSource(source);
  const zipfile = await openZip(zipPath);
  try {
    for (;;) {
      const entry = await nextEntry(zipfile);
      if (entry === null) throw new Error(`Membro não encontrado no ZIP: ${JSON.stringify(memberName)}.`);
      if (entry.fileName !== memberName) continue;

      if (entry.isEncrypted()) throw new Error(`Membro ZIP encriptado rejeitado: ${JSON.stringify(memberName)}.`);
      if (!SUPPORTED_METHODS.includes(entry.compressionMethod)) {
        throw new Error(`Método de compressão não suportado (${entry.compressionMethod}) no membro ${JSON.stringify(memberName)}; somente stored/deflate são aceitos.`);
      }
      if (entry.uncompressedSize > lim.maxMemberBytes) {
        throw new Error(`O membro ${JSON.stringify(memberName)} descompacta ${entry.uncompressedSize} bytes, excedendo o limite de ${lim.maxMemberBytes} bytes por membro.`);
      }
      const ratio = entry.compressedSize === 0 ? entry.uncompressedSize : entry.uncompressedSize / entry.compressedSize;
      if (ratio > lim.maxExpansionRatio) {
        throw new Error(`Razão de expansão de ${ratio.toFixed(1)}x do membro ${JSON.stringify(memberName)} excede o limite de ${lim.maxExpansionRatio}x (possível zip bomb).`);
      }

      const raw = await zipfile.openReadStreamPromise(entry);
      const stream = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          callback(null, chunk);
        }
      });
      let settled = false;
      raw.on('error', (error) => {
        if (!settled) stream.destroy(error);
      });
      raw.pipe(stream);
      stream.once('close', () => {
        settled = true;
        raw.destroy();
        closeZip(zipfile);
        void cleanup();
      });
      return { stream, entry: infoFrom(entry) };
    }
  } catch (error) {
    closeZip(zipfile);
    await cleanup();
    throw error;
  }
}