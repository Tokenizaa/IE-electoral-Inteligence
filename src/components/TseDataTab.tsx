import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, ExternalLink, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import type { TseCatalogResource, TseCatalogResult, TseResourceKind, TseDownloadManifest, TseDownloadedInspection, TseStoredResource } from '../ingestion/tseOpenData.ts';
import type { TseLayoutValidation } from '../ingestion/tseLayoutRegistry.ts';

const kinds: Array<{ value: '' | TseResourceKind; label: string }> = [
  { value: '', label: 'Todos os tipos de recurso' },
  { value: 'CANDIDATURAS', label: 'Candidaturas' },
  { value: 'VOTACAO_NOMINAL_MUNICIPIO_ZONA', label: 'Votação nominal por município/zona' },
  { value: 'VOTACAO_PARTIDO_MUNICIPIO_ZONA', label: 'Votação de partido por município/zona' },
  { value: 'DETALHE_APURACAO_MUNICIPIO_ZONA', label: 'Detalhe da apuração por município/zona' },
  { value: 'DETALHE_APURACAO_SECAO', label: 'Detalhe da apuração por seção' },
  { value: 'BOLETIM_URNA', label: 'Boletim de urna' },
  { value: 'OUTRO', label: 'Outros recursos' }
];

function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return 'Tamanho não informado';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function kindLabel(kind: TseResourceKind): string {
  return kinds.find(item => item.value === kind)?.label ?? kind;
}

export const TseDataTab: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [kind, setKind] = useState<'' | TseResourceKind>('');
  const [catalog, setCatalog] = useState<TseCatalogResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Record<string, TseDownloadManifest>>({});
  const [storedStatuses, setStoredStatuses] = useState<Record<string, TseStoredResource['artifact_status']>>({});
  const [inspections, setInspections] = useState<Record<string, TseDownloadedInspection>>({});
  const [layoutValidations, setLayoutValidations] = useState<Record<string, TseLayoutValidation>>({});
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ year });
      if (kind) params.set('kind', kind);
      const response = await fetch(`/api/tse/catalog?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível consultar o catálogo do TSE.');
      setCatalog(payload as TseCatalogResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao consultar o catálogo oficial.');
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, [year, kind]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  // The local inventory is read from manifests only; it does not fetch or scan
  // large TSE datasets. This makes retained artifacts visible after a page reload.
  useEffect(() => {
    let active = true;
    setDownloads({});
    setStoredStatuses({});
    fetch(`/api/tse/downloads?year=${encodeURIComponent(year)}`)
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Não foi possível consultar o repositório local.');
        return payload as TseStoredResource[];
      })
      .then(inventory => {
        if (!active) return;
        const statuses: Record<string, TseStoredResource['artifact_status']> = {};
        const available: Record<string, TseDownloadManifest> = {};
        for (const item of inventory) {
          statuses[item.manifest.resource_id] = item.artifact_status;
          if (item.artifact_status === 'AVAILABLE') available[item.manifest.resource_id] = item.manifest;
        }
        setStoredStatuses(statuses);
        setDownloads(available);
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Falha ao consultar o repositório local.');
      });
    return () => { active = false; };
  }, [year]);

  const resources = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase('pt-BR');
    if (!catalog) return [];
    if (!query) return catalog.resources;
    return catalog.resources.filter(resource =>
      [resource.name, resource.description, resource.package_title, resource.format, resource.kind]
        .some(value => value.toLocaleLowerCase('pt-BR').includes(query))
    );
  }, [catalog, searchText]);

  const download = async (resource: TseCatalogResource) => {
    setDownloadingId(resource.id);
    setError(null);
    try {
      const response = await fetch('/api/tse/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resource_id: resource.id, year: Number(year) })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Falha ao baixar o recurso.');
      setDownloads(previous => ({ ...previous, [resource.id]: payload as TseDownloadManifest }));
      setStoredStatuses(previous => ({ ...previous, [resource.id]: 'AVAILABLE' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao baixar o recurso do TSE.');
    } finally {
      setDownloadingId(null);
    }
  };

  const inspectCargos = async (resource: TseCatalogResource) => {
    setInspectingId(resource.id);
    setError(null);
    try {
      const response = await fetch('/api/tse/inspect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resource_id: resource.id, year: Number(year) })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível inspecionar os cargos do arquivo.');
      setInspections(previous => ({ ...previous, [resource.id]: payload as TseDownloadedInspection }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao inspecionar cargos.');
    } finally {
      setInspectingId(null);
    }
  };

  const validateLayout = async (resource: TseCatalogResource) => {
    setValidatingId(resource.id);
    setError(null);
    try {
      const response = await fetch('/api/tse/validate-layout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resource_id: resource.id, year: Number(year) })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível validar o layout do arquivo.');
      setLayoutValidations(previous => ({ ...previous, [resource.id]: payload as TseLayoutValidation }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao validar o layout do arquivo.');
    } finally {
      setValidatingId(null);
    }
  };

  const years = Array.from({ length: currentYear - 1994 + 1 }, (_, index) => currentYear - index);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-emerald-300">
              <span className="rounded-lg bg-emerald-500/10 p-2"><Search className="h-5 w-5" /></span>
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">Fonte primária</span>
            </div>
            <h1 className="text-xl font-semibold text-white">Catálogo de dados eleitorais do TSE</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Consulta o catálogo público em tempo real, permite selecionar o ano e o tipo de arquivo e baixar recursos oficiais sem fixar a plataforma em uma única eleição.
            </p>
          </div>
          <a href="https://dadosabertos.tse.jus.br/dataset/" target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 text-xs text-emerald-300 hover:text-emerald-200">
            Portal oficial <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[150px_minmax(220px,1fr)_auto]">
          <label className="text-xs text-slate-400">
            Ano / eleição
            <select value={year} onChange={event => setYear(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500">
              {years.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Tipo de arquivo
            <select value={kind} onChange={event => setKind(event.target.value as '' | TseResourceKind)} className="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500">
              {kinds.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <button onClick={() => void loadCatalog()} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Consultar TSE
            </button>
          </div>
        </div>
        <label className="mt-4 block text-xs text-slate-400">
          Filtrar os resultados encontrados
          <input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Nome do arquivo, tipo de dado ou conjunto..." className="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-emerald-500" />
        </label>
      </section>

      {error && (
        <div role="alert" className="flex gap-3 rounded-xl border border-rose-900/70 bg-rose-950/30 p-4 text-sm text-rose-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div><strong className="block">Operação não concluída</strong><span>{error}</span></div>
        </div>
      )}

      {catalog && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>{catalog.dataset_count} conjuntos de dados · {catalog.resource_count} recursos encontrados no catálogo · {resources.length} exibidos</span>
          <span className="text-slate-500">Consulta dinâmica via API CKAN do TSE</span>
        </div>
      )}

      {loading && !catalog && <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400"><LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />Consultando os metadados oficiais...</div>}

      {catalog && resources.length === 0 && !loading && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">Nenhum recurso corresponde aos filtros. Tente outro ano ou tipo de arquivo.</div>
      )}

      <div className="space-y-3">
        {resources.map(resource => {
          const manifest = downloads[resource.id];
          const isDownloading = downloadingId === resource.id;
          return (
            <article key={resource.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">{kindLabel(resource.kind)}</span>
                    <span className="text-[10px] text-slate-500">{resource.format} · {formatBytes(resource.size_bytes)}</span>
                  </div>
                  <h2 className="text-sm font-semibold text-white">{resource.name}</h2>
                  <p className="mt-1 text-xs text-slate-400">{resource.package_title}</p>
                  {resource.description && <p className="mt-2 text-xs leading-5 text-slate-500">{resource.description}</p>}
                  <a href={resource.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-400 underline decoration-slate-700 underline-offset-2 hover:text-slate-200">
                    Abrir recurso original <ExternalLink className="h-3 w-3" />
                  </a>
                  {storedStatuses[resource.id] === 'MISSING' && (
                    <p className="mt-3 text-xs text-amber-200">O manifesto existe, mas o arquivo local não foi encontrado. É necessário adquiri-lo novamente.</p>
                  )}
                  {storedStatuses[resource.id] === 'SIZE_MISMATCH' && (
                    <p className="mt-3 text-xs text-amber-200">O tamanho do arquivo local diverge do manifesto. O artefato não será reutilizado automaticamente.</p>
                  )}
                  {manifest && (
                    <div className="mt-3 rounded-lg border border-emerald-900/70 bg-emerald-950/20 p-3 text-xs">
                      <div className="flex items-center gap-2 font-semibold text-emerald-300"><CheckCircle2 className="h-4 w-4" />Download e hash concluídos</div>
                      <p className="mt-1 break-all text-slate-400">SHA-256 registrado: <span className="font-mono text-slate-300">{manifest.sha256}</span></p>
                      <p className="mt-1 text-slate-400">Arquivo já armazenado no repositório local; esta listagem verifica presença e tamanho, não recalcula o hash.</p>
                      <p className="mt-1 text-amber-200">Revisão de layout e validação de cobertura ainda pendentes.</p>
                      {manifest.local_file.toLowerCase().endsWith('.csv') && (
                        <button onClick={() => void inspectCargos(resource)} disabled={inspectingId !== null} className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                          {inspectingId === resource.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                          {inspectingId === resource.id ? 'Inspecionando arquivo...' : 'Identificar cargos presentes'}
                        </button>
                      )}
                      {manifest.local_file.toLowerCase().endsWith('.csv') && (
                        <button onClick={() => void validateLayout(resource)} disabled={validatingId !== null} className="mt-3 ml-2 inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                          {validatingId === resource.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          {validatingId === resource.id ? 'Validando layout...' : 'Validar layout'}
                        </button>
                      )}
                      {layoutValidations[resource.id] && (
                        <div className="mt-3 border-t border-slate-700 pt-3">
                          <p className="font-semibold text-slate-200">Layout: {layoutValidations[resource.id].status}</p>
                          <p className="mt-1 break-all text-slate-400">Fingerprint SHA-256: <span className="font-mono text-slate-300">{layoutValidations[resource.id].header_fingerprint_sha256}</span></p>
                          {layoutValidations[resource.id].missing_required_columns.length > 0 && (
                            <p className="mt-1 text-amber-200">Colunas obrigatórias ausentes: {layoutValidations[resource.id].missing_required_columns.join(', ')}</p>
                          )}
                          <p className="mt-1 text-amber-200">Ingestão analítica autorizada: não. A assinatura disponível deriva de amostra RS/2022 e exige validação adicional.</p>
                        </div>
                      )}
                      {inspections[resource.id] && (
                        <div className="mt-3 border-t border-slate-700 pt-3">
                          <p className="font-semibold text-slate-200">{inspections[resource.id].cargos.length} códigos de cargo encontrados em {inspections[resource.id].total_registros.toLocaleString('pt-BR')} registros.</p>
                          <ul className="mt-2 space-y-1 text-slate-400">
                            {inspections[resource.id].cargos.map(cargo => (
                              <li key={cargo.cd_cargo} className="flex flex-wrap justify-between gap-2">
                                <span><strong className="text-slate-200">{cargo.cd_cargo}</strong> — {cargo.ds_cargo ?? 'Descrição não disponível no arquivo'}</span>
                                <span>{cargo.registros_observados.toLocaleString('pt-BR')} registros</span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-amber-200">A lista mostra apenas cargos observados neste arquivo; não comprova cobertura integral do pleito.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => void download(resource)} disabled={isDownloading || downloadingId !== null} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-emerald-700/70 bg-emerald-950/40 px-3 py-2.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/50 disabled:cursor-wait disabled:opacity-60">
                  {isDownloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {isDownloading ? 'Baixando...' : manifest ? 'Verificar / reutilizar arquivo' : 'Baixar e validar'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {catalog && (
        <section className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4">
          <div className="flex gap-2 text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><h2 className="text-sm font-semibold">Limites de validação</h2></div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-400">
            {catalog.limitations.map(item => <li key={item}>{item}</li>)}
            <li>O arquivo bruto é armazenado no servidor em var/tse-downloads/{year}; ambientes efêmeros podem apagar arquivos ao reiniciar ou redeploy.</li>
            <li>O download não publica os dados automaticamente na camada analítica. Cada layout precisa de adaptador, validação semântica e reconciliação de totais antes de ser usado nos indicadores.</li>
          </ul>
        </section>
      )}
    </div>
  );
};
