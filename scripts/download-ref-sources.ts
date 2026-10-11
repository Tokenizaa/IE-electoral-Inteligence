/**
 * Download reference files from official TSE CKAN resources.
 *
 * Usage:
 *   bun run download:refs 2022
 *   REF_TYPES=correspondencias,comparecimento,eleitorado,candidatos bun run download:refs 2022
 */
import { mkdir, writeFile, readFile, access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createWriteStream, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

const CKAN = 'https://dadosabertos.tse.jus.br/api/3/action';
const YEAR = Number(process.env.TSE_YEAR ?? process.argv[2] ?? 2022);
const REF_TYPES = (process.env.REF_TYPES ?? 'correspondencias,comparecimento,eleitorado,candidatos,boletim,totalizacao')
  .split(',').map(s => s.trim()).filter(Boolean);
const DOWNLOAD_DIR = path.resolve(process.cwd(), `var/tse-downloads/${YEAR}`);
const MAX_DOWNLOAD_BYTES = 5 * 1024 ** 3; // 5 GiB cap per file


const TARGET_DATASETS = {
  correspondencias: [
    `resultados-${YEAR}-correspondencias-esperadas-e-efetivadas-1-turno`,
    `resultados-${YEAR}-correspondencias-esperadas-e-efetivadas-2-turno`
  ],
  comparecimento: [`comparecimento-e-abstencao-${YEAR}`],
  eleitorado: [`eleitorado-${YEAR}`],
  candidatos: [`candidatos-${YEAR}`],
  boletim: [`resultados-${YEAR}-boletim-de-urna`],
  totalizacao: [`resultados-${YEAR}-arquivos-transmitidos-para-totalizacao`],
  resultados: [`resultados-${YEAR}`]
};
interface CkanResource { id?: string; name?: string; format?: string; url?: string; size?: number | null; package_id?: string; }
interface CkanPackage { id?: string; name?: string; title?: string; resources?: Array<{ id?: string; name?: string; format?: string; url?: string; size?: number | null }>; }

async function ckan<T>(action: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`${CKAN}/${action}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'InteligenciaEleitoral/1.0 (ref download)' }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`CKAN ${action} HTTP ${res.status}`);
  const json = await res.json() as { success: boolean; result: T; error?: { message?: string } };
  if (!json.success) throw new Error(json.error?.message ?? `CKAN ${action} failed`);
  return json.result;
}

function safeFilename(url: string, fallback: string): string {
  try {
    const u = new URL(url);
    const name = path.basename(u.pathname);
    if (name && name.length > 0) return name;
  } catch {}
  return fallback;
}

async function downloadFile(url: string, destPath: string, maxBytes: number): Promise<{ sha256: string; size: number }> {
  // If the file already exists, compute its hash and size and return.
  try {
    const stats = await stat(destPath);
    if (stats.isFile()) {
      const fileHash = await sha256File(destPath);
      return { sha256: fileHash, size: stats.size };
    }
  } catch {
    // If any error (file doesn't exist or not a file), we'll download.
  }

  // Otherwise, download the file.
  const res = await fetch(url, {
    headers: { 'user_agent': 'InteligenciaEleitoral/1.0 (TSE ref download)' },
    signal: AbortSignal.timeout(30 * 60_000)
  });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

  const hash = createHash('sha256');
  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) { cb(new Error(`Exceeds max ${maxBytes} bytes`)); return; }
      hash.update(chunk);
      cb(null, chunk);
    }
  });

  if (res.body) {
    await pipeline(Readable.fromWeb(res.body as any), limiter, createWriteStream(destPath, { flags: 'wx' }));
  } else {
    throw new Error('Response body is null');
  }
  return { sha256: hash.digest('hex'), size };
};
    }
  } catch {
    // If any error (file doesn't exist or not a file), we'll download.
  }

  // Otherwise, download the file.
  const res = await fetch(url, {
    headers: { 'user_agent': 'InteligenciaEleitoral/1.0 (TSE ref download)' },
    signal: AbortSignal.timeout(30 * 60_000)
  });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

  const hash = createHash('sha256');
  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) { cb(new Error(`Exceeds max ${maxBytes} bytes`)); return; }
      hash.update(chunk);
      cb(null, chunk);
    }
  });

  if (res.body) {
    await pipeline(Readable.fromWeb(res.body as any), limiter, createWriteStream(destPath, { flags: 'wx' }));
  } else {
    throw new Error('Response body is null');
  }
  return { sha256: hash.digest('hex'), size };
}

function inferKindFromDataset(datasetId: string): import('../ingestion/tseOpenData').TseResourceKind {
  const lower = datasetId.toLowerCase();
  if (lower.includes('candidatos')) return 'CANDIDATURAS';
  if (lower.includes('eleitorado')) return 'ELEITORADO';
  if (lower.includes('comparecimento')) return 'COMPARECIMENTO';
  if (lower.includes('boletim')) return 'BOLETIM_URNA';
  if (lower.includes('totalizacao')) return 'TOTALIZACAO';
  if (lower.includes('correspondencias')) return 'CORRESPONDENCIA';
  return 'OUTRO';
}

function checkExtensionMatchesFormat(filename: string, format: string): boolean {
  const ext = path.extname(filename).toLowerCase().substring(1);
  const f = format.toLowerCase();
  if (f === 'csv' && ext === 'csv') return true;
  if (f === 'json' && ext === 'json') return true;
  if (f === 'xlsx' && ext === 'xlsx') return true;
  if (f === 'zip' && ext === 'zip') return true;
  return false;
}

async function main(): Promise<void> {
  await mkdir(DOWNLOAD_DIR, { recursive: true });

  // Load catalog to find resources
  const catalogPath = path.resolve(process.cwd(), `data/reference/tse_catalog_${YEAR}.json`);
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));

  const targetDatasetIds = new Set<string>();
  for (const t of REF_TYPES) {
    for (const id of TARGET_DATASETS[t] ?? []) targetDatasetIds.add(id);
  }

  for (const dataset of catalog.datasets) {
    if (!targetDatasetIds.has(dataset.dataset_id)) continue;
    console.log(`\n=== ${dataset.dataset_id} (${dataset.title}) ===`);

    for (const res of dataset.resources) {
      const url = res.url;
      if (!url || !url.startsWith('https://')) continue;

      const filename = safeFilename(url, `${res.id}.zip`);
      const destPath = path.join(DOWNLOAD_DIR, filename);
      const manifestPath = `${destPath}.manifest.json`;

      // Skip if manifest already exists (assumes file is valid)
      try {
        await access(manifestPath, fs.constants.F_OK);
        const existingManifest = JSON.parse(
          await readFile(manifestPath, 'utf8')
        ) as any;
        if (existingManifest.sha256) {
          console.log(`  [SKIP] ${filename} (manifest exists, sha256=${existingManifest.sha256})`);
          continue;
        }
      } catch {
        // manifest missing or invalid, will download
      }

      console.log(`  [DOWNLOAD] ${res.name} -> ${filename}`);
      try {
        const { sha256, size } = await downloadFile(url, destPath, MAX_DOWNLOAD_BYTES);
        // Build TseDownloadManifest compatible manifest
        const manifestObj = {
          source: 'Portal de Dados Abertos do TSE',
          resource_id: res.id,
          dataset_id: dataset.dataset_id,
          dataset_title: dataset.title,
          resource_name: res.name,
          resource_url: url,
          package_modified_at: null,
          resource_modified_at: null,
          requested_year: YEAR,
          detected_kind: inferKindFromDataset(dataset.dataset_id),
          format: res.format,
          size_bytes: size,
          sha256,
          downloaded_at: new Date().toISOString(),
          validation_status: 'DOWNLOADED_HASHED_LAYOUT_REVIEW_REQUIRED',
          validation: {
            extension_matches_format: checkExtensionMatchesFormat(filename, res.format),
            signature_valid: null,
            csv_header: null,
            notes: [],
          },
           local_file: destPath
        };
        await writeFile(manifestPath, JSON.stringify(manifestObj, null, 2), 'utf8');
        console.log(`  [OK] ${filename} (${size} bytes, sha256=${sha256})`);
      } catch (err) {
        console.error(`  [ERR] ${filename}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  console.log('\n=== Download complete ===');
}

main().catch(err => { console.error('Falha no download de referências:', err); process.exitCode = 1; });