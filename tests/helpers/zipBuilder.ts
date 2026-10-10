/**
 * In-memory ZIP fixture builder used by the TSE reader tests.
 * Builds a minimal but valid ZIP archive (stored or deflate) with `node:zlib`
 * only — no extra fixture dependency.
 */
import { crc32, deflateRawSync } from 'node:zlib';

export interface ZipEntrySpec {
  name: string;
  data: Buffer;
  method?: 0 | 8; // stored | deflate
  encrypted?: boolean;
  declaredCompressedSize?: number;
  declaredUncompressedSize?: number;
}

/** Builds a minimal but valid ZIP archive in memory (stored or deflate). */
export function buildZip(entries: ZipEntrySpec[]): Buffer {
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