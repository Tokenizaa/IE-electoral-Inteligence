/**
 * Discover and download election datasets from the official TSE Open Data CKAN API.
 *
 * Discovery is dynamic: dataset/resource names are read from the portal at request time.
 * Downloads are retained as raw source artifacts and are not silently promoted into
 * the analytical model. A separate, versioned adapter must validate each layout first.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';

const CKAN_API = 'https://dadosabertos.tse.jus.br/api/3/action';
const DEFAULT_DOWNLOAD_DIR = path.resolve(process.cwd(), 'var/tse-downloads');
const MAX_METADATA_BYTES = 2_000_000;
const DEFAULT_MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export type TseResourceKind =
  | 'CANDIDATURAS'
  | 'VOTACAO_NOMINAL_MUNICIPIO_ZONA'
  | 'VOTACAO_PARTIDO_MUNICIPIO_ZONA'
  | 'DETALHE_APURACAO_MUNICIPIO_ZONA'
  | 'DETALHE_APURACAO_SECAO'
  | 'BOLETIM_URNA'
  | 'OUTRO';

export interface TseCatalogResource {
  id: string;
  name: string;
  description: string;
  format: string;
  url: string;
  size_bytes: number | null;
  kind: TseResourceKind;
  package_id: string;
  package_name: string;
  package_title: string;
  package_modified: string | null;
}

export interface TseCatalogResult {
  source: 'Portal de Dados Abertos do TSE (CKAN API)';
  year: number;
  query: string;
  dataset_count: number;
  resource_count: number;
  resources: TseCatalogResource[];
  limitations: string[];
}

interface CkanResource {
  id?: string;
  name?: string;
  description?: string;
  format?: string;
  url?: string;
  size?: number | string | null;
  package_id?: string;
  last_modified?: string | null;
  created?: string | null;
}

interface CkanPackage {
  id?: string;
  name?: string;
  title?: string;
  notes?: string;
  metadata_modified?: string;
  resources?: CkanResource[];
}

interface CkanEnvelope<T> {
  success: boolean;
  result: T;
  error?: { message?: string };
}

export interface TseDownloadManifest {
  source: 'Portal de Dados Abertos do TSE';
  resource_id: string;
  dataset_id: string;
  dataset_title: string;
  resource_name: string;
  resource_url: string;
  package_modified_at?: string | null;
  resource_modified_at?: string | null;
  requested_year: number;
  detected_kind: TseResourceKind;
  format: string;
  size_bytes: number;
  sha256: string;
  downloaded_at: string;
  validation_status: 'DOWNLOADED_HASHED_LAYOUT_REVIEW_REQUIRED';
  validation: {
    extension_matches_format: boolean;
    signature_valid: boolean | null;
    csv_header: string[] | null;
    notes: string[];
  };
  local_file: string;
}

export interface TseCargoObservation {
  cd_cargo: string;
  ds_cargo: string | null;
  registros_observados: number;
}

export type TseStoredArtifactStatus = 'AVAILABLE' | 'MISSING' | 'SIZE_MISMATCH';

export interface TseStoredResource {
  manifest: TseDownloadManifest;
  artifact_status: TseStoredArtifactStatus;
  actual_size_bytes: number | null;
}

export interface TseDownloadedInspection {
  resource_id: string;
  year: number;
  dataset_title: string;
  detected_kind: TseResourceKind;
  file_name: string;
  sha256: string;
  layout_columns: string[];
  total_registros: number;
  registros_sem_cargo: number;
  cargos: TseCargoObservation[];
  validation_status: 'CARGOS_EXTRAIDOS_LAYOUT_AINDA_REQUER_VALIDACAO';
  limitations: string[];
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

export interface TseOpenDataOptions {
  fetchImpl?: typeof fetch;
  downloadDir?: string;
  maxDownloadBytes?: number;
}

function normalized(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function classifyResource(name: string, description: string, format: string): TseResourceKind {
  const text = normalized(`${name} ${description}`);
  if (/CANDIDATOS|CANDIDATURAS|CONSULTA POR CANDIDATO/.test(text)) return 'CANDIDATURAS';
  if (/VOTACAO NOMINAL.*MUNICIPIO.*ZONA/.test(text)) return 'VOTACAO_NOMINAL_MUNICIPIO_ZONA';
  if (/VOTACAO EM PARTIDO|VOTACAO PARTIDO/.test(text) && /MUNICIPIO|ZONA/.test(text)) return 'VOTACAO_PARTIDO_MUNICIPIO_ZONA';
  if (/DETALHE DA APURACAO.*SECAO/.test(text)) return 'DETALHE_APURACAO_SECAO';
  if (/DETALHE DA APURACAO/.test(text)) return 'DETALHE_APURACAO_MUNICIPIO_ZONA';
  if (/BOLETIM DE URNA/.test(text) || normalized(format) === 'BU') return 'BOLETIM_URNA';
  return 'OUTRO';
}

function safeExtension(format: string, url: string): string {
  // TSE metadata sometimes labels a ZIP container as CSV. Prefer the actual
  // resource path suffix when present; retain metadata separately for audit.
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (/^\.(csv|zip|txt|json|7z|gz)$/.test(ext)) return ext;
  } catch {
    // URL validation happens separately.
  }
  const fmt = normalized(format);
  if (fmt.includes('ZIP')) return '.zip';
  if (fmt.includes('CSV')) return '.csv';
  if (fmt.includes('JSON')) return '.json';
  if (fmt.includes('TXT') || fmt.includes('TEXT')) return '.txt';
  return '.bin';
}

function isAllowedTseUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' &&
      (url.hostname === 'dadosabertos.tse.jus.br' ||
       url.hostname === 'www.tse.jus.br' ||
       url.hostname === 'tse.jus.br' ||
       url.hostname.endsWith('.tse.jus.br'));
  } catch {
    return false;
  }
}

function containsElectionYear(values: Array<string | undefined>, year: number): boolean {
  const searchableText = normalized(values.filter(Boolean).join(' '));
  return new RegExp(`(^|[^0-9])${year}([^0-9]|$)`).test(searchableText);
}

function isYearInPackage(pkg: CkanPackage, year: number): boolean {
  // Package title/name can scope every resource when the package itself is year-specific.
  // Otherwise, at least one resource must explicitly identify the year.
  return containsElectionYear([pkg.title, pkg.name], year) ||
    (pkg.resources ?? []).some(resource =>
      containsElectionYear([resource.name, resource.description], year)
    );
}

function isResourceForYear(pkg: CkanPackage, resource: CkanResource, year: number): boolean {
  if (containsElectionYear([pkg.title, pkg.name], year)) return true;
  // A generic package can contain multiple years; do not infer a resource's year
  // from package notes or from a different resource in the same package.
  return containsElectionYear([resource.name, resource.description], year);
}

export class TseOpenDataClient {
  private readonly fetchImpl: typeof fetch;
  private readonly downloadDir: string;
  private readonly maxDownloadBytes: number;

  constructor(options: TseOpenDataOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.downloadDir = options.downloadDir ?? DEFAULT_DOWNLOAD_DIR;
    this.maxDownloadBytes = options.maxDownloadBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
  }

  private async ckan<T>(action: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(`${CKAN_API}/${action}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await this.fetchImpl(url, {
      headers: { accept: 'application/json', 'user-agent': 'InteligenciaEleitoral/1.0 (TSE Open Data client)' },
      signal: AbortSignal.timeout(25_000)
    });
    if (!response.ok) throw new Error(`Portal TSE/CKAN respondeu HTTP ${response.status} em ${action}.`);
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_METADATA_BYTES) throw new Error('Resposta de metadados do CKAN excedeu o limite de segurança.');
    let payload: CkanEnvelope<T>;
    try {
      payload = JSON.parse(text) as CkanEnvelope<T>;
    } catch {
      throw new Error('O Portal TSE/CKAN retornou metadados que não são JSON válido.');
    }
    if (!payload.success) throw new Error(payload.error?.message || `A API CKAN falhou em ${action}.`);
    return payload.result;
  }

  async search(year: number, kind?: TseResourceKind): Promise<TseCatalogResult> {
    if (!Number.isInteger(year) || year < 1994 || year > new Date().getFullYear() + 1) {
      throw new Error('Ano eleitoral inválido. Informe um ano entre 1994 e o próximo ano-calendário.');
    }
    const query = String(year);
    const result = await this.ckan<{ count?: number; results?: CkanPackage[] }>('package_search', {
      q: query,
      rows: 1000,
      start: 0
    });
    const packages = (result.results ?? []).filter(pkg => isYearInPackage(pkg, year));
    const resources: TseCatalogResource[] = [];
    for (const pkg of packages) {
      for (const resource of pkg.resources ?? []) {
        if (!isResourceForYear(pkg, resource, year)) continue;
        const url = String(resource.url ?? '');
        if (!resource.id || !url || !isAllowedTseUrl(url)) continue;
        const resourceKind = classifyResource(
          String(resource.name ?? ''),
          String(resource.description ?? ''),
          String(resource.format ?? '')
        );
        if (kind && resourceKind !== kind) continue;
        resources.push({
          id: resource.id,
          name: String(resource.name ?? 'Recurso sem nome'),
          description: String(resource.description ?? ''),
          format: String(resource.format ?? 'Desconhecido').toUpperCase(),
          url,
          size_bytes: resource.size == null || resource.size === '' ? null : Number(resource.size),
          kind: resourceKind,
          package_id: String(pkg.id ?? resource.package_id ?? ''),
          package_name: String(pkg.name ?? ''),
          package_title: String(pkg.title ?? pkg.name ?? 'Conjunto sem título'),
          package_modified: pkg.metadata_modified ?? null
        });
      }
    }
    resources.sort((a, b) =>
      a.package_title.localeCompare(b.package_title, 'pt-BR') ||
      a.kind.localeCompare(b.kind) ||
      a.name.localeCompare(b.name, 'pt-BR')
    );
    return {
      source: 'Portal de Dados Abertos do TSE (CKAN API)',
      year,
      query,
      dataset_count: packages.length,
      resource_count: resources.length,
      resources,
      limitations: [
        'O catálogo reflete os metadados publicados no Portal TSE no momento da consulta; ausência no resultado não prova inexistência histórica.',
        'A classificação do recurso é heurística baseada no nome/descrição e deve ser conferida antes da ingestão.',
        'Arquivos de votação por município/zona normalmente incluem vários cargos; o cargo deve ser filtrado pelos códigos e rótulos existentes no próprio arquivo.',
        'Baixar e calcular SHA-256 não comprova, isoladamente, autenticidade ou completude eleitoral.'
      ]
    };
  }

  private async getResource(resourceId: string): Promise<{ resource: CkanResource; pkg: CkanPackage }> {
    if (!/^[a-f0-9-]{16,64}$/i.test(resourceId)) throw new Error('Identificador de recurso CKAN inválido.');
    const resource = await this.ckan<CkanResource>('resource_show', { id: resourceId });
    if (!resource.url || !resource.package_id || !isAllowedTseUrl(resource.url)) {
      throw new Error('O recurso não possui URL HTTPS permitida do domínio oficial do TSE.');
    }
    const pkg = await this.ckan<CkanPackage>('package_show', { id: resource.package_id });
    if (!pkg.id || !(pkg.resources ?? []).some(item => item.id === resourceId)) {
      throw new Error('O recurso não foi confirmado dentro do conjunto de dados informado pelo CKAN.');
    }
    return { resource, pkg };
  }

  /**
   * Lists the locally retained source artifacts for one election year.
   * The inventory is derived from manifests; it never contacts the TSE or reads
   * large data files into memory.
   */
  async listStoredResources(year: number): Promise<TseStoredResource[]> {
    if (!Number.isInteger(year) || year < 1994 || year > new Date().getFullYear() + 1) {
      throw new Error('Ano eleitoral inválido.');
    }
    const yearDir = path.resolve(this.downloadDir, String(year));
    const names = await readdir(yearDir).catch(() => [] as string[]);
    const stored: TseStoredResource[] = [];
    const seenResourceIds = new Set<string>();

    for (const name of names.filter(item => item.endsWith('.manifest.json')).sort().reverse()) {
      const manifestPath = path.resolve(yearDir, name);
      try {
        const manifest = JSON.parse(
          await (await import('node:fs/promises')).readFile(manifestPath, 'utf8')
        ) as TseDownloadManifest;
        if (manifest.requested_year !== year || !/^[a-f0-9-]{16,64}$/i.test(manifest.resource_id)) continue;
        // Filenames contain an ISO timestamp; reverse lexical order yields the
        // newest snapshot first. Keep only that snapshot in the UI inventory.
        if (seenResourceIds.has(manifest.resource_id)) continue;
        seenResourceIds.add(manifest.resource_id);

        const filePath = path.resolve(manifest.local_file);
        const relative = path.relative(yearDir, filePath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) continue;

        let actualSize: number | null = null;
        let status: TseStoredArtifactStatus = 'MISSING';
        try {
          actualSize = (await stat(filePath)).size;
          status = actualSize === manifest.size_bytes ? 'AVAILABLE' : 'SIZE_MISMATCH';
        } catch {
          status = 'MISSING';
        }
        stored.push({ manifest, artifact_status: status, actual_size_bytes: actualSize });
      } catch {
        // Ignore malformed manifests in the inventory; they are not trusted as paths.
      }
    }

    return stored;
  }

  async downloadResource(resourceId: string, year: number): Promise<TseDownloadManifest> {
    if (!Number.isInteger(year) || year < 1994 || year > new Date().getFullYear() + 1) {
      throw new Error('Ano eleitoral inválido.');
    }
    const { resource, pkg } = await this.getResource(resourceId);
    if (!isResourceForYear(pkg, resource, year)) {
      throw new Error(`O recurso não foi identificado individualmente como pertencente à eleição de ${year}; download bloqueado para evitar mistura de anos.`);
    }
    const url = String(resource.url);
    // Reuse a retained artifact only when the source URL and published metadata
    // still match. Otherwise acquire a new immutable snapshot instead of silently
    // treating an old file as the current version.
    const existing = (await this.listStoredResources(year)).find(item =>
      item.manifest.resource_id === resourceId &&
      item.artifact_status === 'AVAILABLE' &&
      item.manifest.resource_url === url &&
      (item.manifest as TseDownloadManifest & { package_modified_at?: string | null }).package_modified_at === (pkg.metadata_modified ?? null) &&
      (item.manifest as TseDownloadManifest & { resource_modified_at?: string | null }).resource_modified_at === (resource.last_modified ?? null)
    );
    if (existing) return existing.manifest;

    const response = await this.fetchTseDownload(url);
    if (!response.ok || !response.body) throw new Error(`Falha ao baixar recurso TSE: HTTP ${response.status}.`);

    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > this.maxDownloadBytes) throw new Error(`O recurso excede o limite de download de ${this.maxDownloadBytes} bytes.`);

    const extension = safeExtension(String(resource.format ?? ''), url);
    const yearDir = path.join(this.downloadDir, String(year));
    await mkdir(yearDir, { recursive: true });
    const downloadId = new Date().toISOString().replace(/[:.]/g, '-');
    const basename = `${resourceId}-${downloadId}${extension}`;
    const finalPath = path.join(yearDir, basename);
    const partialPath = `${finalPath}.${randomUUID()}.part`;
    const hash = createHash('sha256');
    let finalFileCreated = false;
    let sizeBytes = 0;
    const limiter = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        sizeBytes += chunk.length;
        if (sizeBytes > this.maxDownloadBytes) {
          callback(new Error(`O recurso excedeu o limite de download de ${this.maxDownloadBytes} bytes.`));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      }
    });

    try {
      await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), limiter, createWriteStream(partialPath, { flags: 'wx' }));
      const digest = hash.digest('hex');
      const signature = await this.validateFile(partialPath, extension);
      await rename(partialPath, finalPath);
      finalFileCreated = true;
      const manifest: TseDownloadManifest = {
        source: 'Portal de Dados Abertos do TSE',
        resource_id: resourceId,
        dataset_id: String(pkg.name ?? pkg.id),
        dataset_title: String(pkg.title ?? pkg.name ?? ''),
        resource_name: String(resource.name ?? ''),
        resource_url: url,
        package_modified_at: pkg.metadata_modified ?? null,
        resource_modified_at: resource.last_modified ?? null,
        requested_year: year,
        detected_kind: classifyResource(String(resource.name ?? ''), String(resource.description ?? ''), String(resource.format ?? '')),
        format: String(resource.format ?? 'Desconhecido').toUpperCase(),
        size_bytes: sizeBytes,
        sha256: digest,
        downloaded_at: new Date().toISOString(),
        validation_status: 'DOWNLOADED_HASHED_LAYOUT_REVIEW_REQUIRED',
        validation: {
          extension_matches_format: this.extensionMatchesFormat(extension, String(resource.format ?? '')),
          signature_valid: signature.signatureValid,
          csv_header: signature.csvHeader,
          notes: signature.notes
        },
        local_file: finalPath
      };
      await writeFile(`${finalPath}.manifest.json`, JSON.stringify(manifest, null, 2), { encoding: 'utf8', flag: 'wx' });
      return manifest;
    } catch (error) {
      await rm(partialPath, { force: true });
      // If manifest creation fails after the atomic rename, remove the orphan
      // artifact so it cannot be mistaken for a completed, auditable download.
      if (finalFileCreated) await rm(finalPath, { force: true });
      throw error;
    }
  }

  async inspectDownloadedResource(resourceId: string, year: number): Promise<TseDownloadedInspection> {
    if (!/^[a-f0-9-]{16,64}$/i.test(resourceId)) throw new Error('Identificador de recurso CKAN inválido.');
    if (!Number.isInteger(year) || year < 1994 || year > new Date().getFullYear() + 1) throw new Error('Ano eleitoral inválido.');

    const yearDir = path.resolve(this.downloadDir, String(year));
    const files = await readdir(yearDir).catch(() => []);
    const manifestNames = files
      .filter(name => name.startsWith(`${resourceId}-`) && name.endsWith('.manifest.json'))
      .sort()
      .reverse();
    if (manifestNames.length === 0) throw new Error('Nenhum manifesto de download encontrado para esse recurso e ano.');

    const manifestPath = path.resolve(yearDir, manifestNames[0]);
    const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(manifestPath, 'utf8')) as TseDownloadManifest;
    const filePath = path.resolve(manifest.local_file);
    const relative = path.relative(yearDir, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('O manifesto aponta para um arquivo fora do diretório de downloads permitido.');
    if (path.extname(filePath).toLowerCase() !== '.csv') {
      throw new Error('A inspeção de cargos exige CSV. Recursos ZIP precisam ser extraídos e inspecionados por um adaptador próprio.');
    }

    const reader = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });
    let header: string[] | null = null;
    let delimiter = ';';
    let cargoIndex = -1;
    let descriptionIndex = -1;
    let totalRegistros = 0;
    let registrosSemCargo = 0;
    const cargos = new Map<string, { ds_cargo: string | null; registros_observados: number }>();
    try {
      for await (const line of reader) {
        if (!line.trim()) continue;
        if (!header) {
          delimiter = line.includes(';') ? ';' : ',';
          header = parseDelimitedLine(line, delimiter).map(value => value.replace(/^\uFEFF/, '').toUpperCase());
          cargoIndex = header.indexOf('CD_CARGO');
          descriptionIndex = header.indexOf('DS_CARGO');
          if (cargoIndex < 0) throw new Error('O CSV não contém a coluna CD_CARGO; não é possível identificar a cobertura por cargo.');
          continue;
        }
        const row = parseDelimitedLine(line, delimiter);
        if (row.length <= cargoIndex) {
          registrosSemCargo++;
          continue;
        }
        totalRegistros++;
        const code = row[cargoIndex]?.trim();
        if (!code) {
          registrosSemCargo++;
          continue;
        }
        const description = descriptionIndex >= 0 ? (row[descriptionIndex]?.trim() || null) : null;
        const current = cargos.get(code) ?? { ds_cargo: description, registros_observados: 0 };
        current.registros_observados++;
        if (!current.ds_cargo && description) current.ds_cargo = description;
        cargos.set(code, current);
      }
    } finally {
      reader.close();
    }

    if (!header) throw new Error('CSV vazio; não foi possível inspecionar os cargos.');
    return {
      resource_id: resourceId,
      year,
      dataset_title: manifest.dataset_title,
      detected_kind: manifest.detected_kind,
      file_name: path.basename(filePath),
      sha256: manifest.sha256,
      layout_columns: header,
      total_registros: totalRegistros,
      registros_sem_cargo: registrosSemCargo,
      cargos: Array.from(cargos.entries())
        .map(([cd_cargo, value]) => ({ cd_cargo, ...value }))
        .sort((a, b) => Number(a.cd_cargo) - Number(b.cd_cargo)),
      validation_status: 'CARGOS_EXTRAIDOS_LAYOUT_AINDA_REQUER_VALIDACAO',
      limitations: [
        'A contagem representa linhas no arquivo baixado, não votos totais nem cobertura oficial comprovada.',
        'A leitura trata registros CSV linha a linha; layouts com campos contendo quebras de linha exigem parser CSV especializado.',
        'A presença de CD_CARGO permite identificar cargos observados, mas não prova que todos os cargos/candidaturas do pleito estejam presentes.',
        'ZIP não é extraído automaticamente nesta etapa.'
      ]
    };
  }

  private async fetchTseDownload(initialUrl: string): Promise<Response> {
    let currentUrl = initialUrl;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
      if (!isAllowedTseUrl(currentUrl)) {
        throw new Error('O download tentou acessar um domínio não autorizado; somente hosts oficiais do TSE são permitidos.');
      }
      const response = await this.fetchImpl(currentUrl, {
        headers: { 'user-agent': 'InteligenciaEleitoral/1.0 (TSE Open Data client)' },
        signal: AbortSignal.timeout(30 * 60_000),
        redirect: 'manual'
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirecionamento do TSE sem cabeçalho Location.');
      if (redirectCount === 5) throw new Error('O recurso excedeu o limite de cinco redirecionamentos.');
      currentUrl = new URL(location, currentUrl).toString();
    }
    throw new Error('Não foi possível resolver o redirecionamento do recurso TSE.');
  }

  private extensionMatchesFormat(extension: string, format: string): boolean {
    const normalizedFormat = normalized(format);
    if (normalizedFormat.includes('CSV')) return extension === '.csv';
    if (normalizedFormat.includes('ZIP')) return extension === '.zip';
    if (normalizedFormat.includes('JSON')) return extension === '.json';
    if (normalizedFormat.includes('TXT') || normalizedFormat.includes('TEXT')) return extension === '.txt';
    return true;
  }

  private async validateFile(filePath: string, extension: string): Promise<{ signatureValid: boolean | null; csvHeader: string[] | null; notes: string[] }> {
    const info = await stat(filePath);
    if (info.size === 0) throw new Error('O recurso baixado está vazio.');
    const handle = await open(filePath, 'r');
    const prefix = Buffer.alloc(Math.min(8, info.size));
    try { await handle.read(prefix, 0, prefix.length, 0); } finally { await handle.close(); }
    const notes: string[] = [];
    let signatureValid: boolean | null = null;
    let csvHeader: string[] | null = null;
    if (extension === '.zip') {
      signatureValid = prefix.length >= 4 && prefix[0] === 0x50 && prefix[1] === 0x4b && [0x03, 0x05, 0x07].includes(prefix[2]) && [0x04, 0x06, 0x08].includes(prefix[3]);
      if (!signatureValid) throw new Error('O recurso anunciado como ZIP não possui assinatura ZIP válida.');
      notes.push('Assinatura ZIP validada; o conteúdo interno ainda precisa de validação de layout e integridade.');
    } else if (extension === '.csv' || extension === '.txt') {
      const sampleBuffer = Buffer.alloc(Math.min(64 * 1024, info.size));
      const sampleHandle = await open(filePath, 'r');
      try { await sampleHandle.read(sampleBuffer, 0, sampleBuffer.length, 0); } finally { await sampleHandle.close(); }
      const sample = sampleBuffer.toString('utf8');
      if (/^\s*<(?:!doctype\s+html|html)/i.test(sample) || /^\s*\{\s*"(?:success|error)"/i.test(sample)) {
        throw new Error('O download retornou uma página HTML/JSON de erro, não um arquivo tabular.');
      }
      const firstLine = sample.split(/\r?\n/).find(line => line.trim().length > 0) ?? '';
      const delimiter = firstLine.includes(';') ? ';' : ',';
      csvHeader = firstLine.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, '').toUpperCase());
      if (csvHeader.length < 2 || !csvHeader.some(col => /ANO_ELEICAO|CD_CARGO|SQ_CANDIDATO|QT_VOTOS/.test(col))) {
        throw new Error('Cabeçalho não reconhecido como layout eleitoral TSE; arquivo preservado em quarentena.');
      }
      signatureValid = true;
      notes.push('Cabeçalho tabular plausível detectado; validação semântica e de cobertura ainda pendente.');
    } else if (extension === '.json') {
      const sampleBuffer = Buffer.alloc(Math.min(64 * 1024, info.size));
      const sampleHandle = await open(filePath, 'r');
      try { await sampleHandle.read(sampleBuffer, 0, sampleBuffer.length, 0); } finally { await sampleHandle.close(); }
      const sample = sampleBuffer.toString('utf8').trim();
      try { JSON.parse(sample); signatureValid = true; }
      catch { signatureValid = null; notes.push('JSON não validado por amostra truncada; validar o documento completo no adaptador correspondente.'); }
    } else {
      notes.push('Formato não reconhecido para validação estrutural automática; mantido como artefato bruto.');
    }
    return { signatureValid, csvHeader, notes };
  }
}
