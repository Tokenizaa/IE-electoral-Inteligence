/**
 * Discover official TSE datasets/resources for a given election year via the
 * public CKAN API and write a versioned catalog. Reproducible; contacts only the
 * official portal.
 *
 *   bun run discover:tse -- 2022
 *   TSE_YEAR=2022 bun run discover:tse
 *
 * Output: data/reference/tse_catalog_<year>.json
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CKAN = 'https://dadosabertos.tse.jus.br/api/3/action';
const YEAR = Number(process.env.TSE_YEAR ?? process.argv[2] ?? 2022);
const OUT_DIR = path.resolve(process.cwd(), 'data/reference');

interface CkanResource { id?: string; name?: string; format?: string; url?: string; size?: number | null; package_id?: string; }
interface CkanPackage { id?: string; name?: string; title?: string; metadata_modified?: string; resources?: CkanResource[]; }

async function ckan<T>(action: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`${CKAN}/${action}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'InteligenciaEleitoral/1.0 (catalog discovery)' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`CKAN ${action} HTTP ${res.status}`);
  const json = await res.json() as { success: boolean; result: T; error?: { message?: string } };
  if (!json.success) throw new Error(json.error?.message ?? `CKAN ${action} failed`);
  return json.result;
}

async function main(): Promise<void> {
  const result = await ckan<{ count: number; results: CkanPackage[] }>('package_search', { q: String(YEAR), rows: 500, start: 0 });
  const datasets = (result.results ?? []).map(pkg => ({
    dataset_id: String(pkg.name ?? ''),
    title: String(pkg.title ?? ''),
    metadata_modified: pkg.metadata_modified ?? null,
    resources: (pkg.resources ?? []).map(r => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? ''),
      format: String(r.format ?? ''),
      url: String(r.url ?? ''),
      size: r.size ?? null,
      package_id: String(r.package_id ?? pkg.id ?? '')
    })).filter(r => /^https:\/\//.test(r.url))
  })).filter(d => d.dataset_id);

  const catalog = {
    source: 'Portal de Dados Abertos do TSE (CKAN API / package_search)',
    generated_at: new Date().toISOString(),
    query_year: YEAR,
    dataset_count: datasets.length,
    resource_count: datasets.reduce((n, d) => n + d.resources.length, 0),
    datasets
  };

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `tse_catalog_${YEAR}.json`);
  await writeFile(outPath, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`# Catálogo oficial TSE ${YEAR}: ${catalog.dataset_count} datasets, ${catalog.resource_count} recursos (URLs oficiais)`);
  console.log(`gravado em ${outPath}`);
}

main().catch(err => { console.error('Falha na descoberta de fontes TSE:', err); process.exitCode = 1; });
