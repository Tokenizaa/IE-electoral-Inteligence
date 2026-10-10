/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { DataService } from './src/services/dataService.ts';
import { TseOpenDataClient, type TseResourceKind } from './src/ingestion/tseOpenData.ts';
import type { TseReconciliationReport } from './src/ingestion/tseReconciliation.ts';
import { validateTseLayout } from './src/ingestion/tseLayoutRegistry.ts';
import { TseSelectError } from './src/ingestion/tseSelectiveReader.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  app.use(express.json());

  console.log('[Server] Inicializando banco de dados analítico...');
  const dataService = DataService.getInstance();
  await dataService.ensureDataLoaded();
  const tseOpenData = new TseOpenDataClient();
  console.log('[Server] Banco de dados e tabelas analíticas prontas.');

  // Health and Status
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      engine: 'PGlite (PostgreSQL WASM)',
      cobertura: 'Amostra parcial do RS, eleições gerais de 2022; cobertura estadual/nacional completa não validada.',
      metodologia: 'Resultados sujeitos às limitações documentadas da amostra.'
    });
  });

  // Dynamic catalog of official TSE open-data resources by election year.
  app.get('/api/tse/catalog', async (req, res) => {
    const year = Number.parseInt(String(req.query.year ?? ''), 10);
    if (!Number.isInteger(year)) {
      return res.status(400).json({ error: 'Informe o ano eleitoral em ?year=2022.' });
    }
    const kindValue = req.query.kind ? String(req.query.kind) : undefined;
    const allowedKinds: TseResourceKind[] = [
      'CANDIDATURAS',
      'VOTACAO_NOMINAL_MUNICIPIO_ZONA',
      'VOTACAO_PARTIDO_MUNICIPIO_ZONA',
      'DETALHE_APURACAO_MUNICIPIO_ZONA',
      'DETALHE_APURACAO_SECAO',
      'BOLETIM_URNA',
      'OUTRO'
    ];
    if (kindValue && !allowedKinds.includes(kindValue as TseResourceKind)) {
      return res.status(400).json({ error: 'Tipo de recurso TSE inválido.', allowedKinds });
    }
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await tseOpenData.search(year, kindValue as TseResourceKind | undefined));
    } catch (err: any) {
      res.status(502).json({ error: err.message, source: 'Portal de Dados Abertos do TSE' });
    }
  });

  // Inventory of retained TSE source artifacts. This reads manifests only and does not
  // contact the TSE or load large source files into memory.
  app.get('/api/tse/downloads', async (req, res) => {
    const year = Number.parseInt(String(req.query.year ?? ''), 10);
    if (!Number.isInteger(year)) {
      return res.status(400).json({ error: 'Informe o ano eleitoral em ?year=2022.' });
    }
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await tseOpenData.listStoredResources(year));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Download a resource selected from the live catalog; never accepts arbitrary URLs.
  app.post('/api/tse/download', async (req, res) => {
    const resourceId = String(req.body?.resource_id ?? '');
    const year = Number.parseInt(String(req.body?.year ?? ''), 10);
    if (!resourceId || !Number.isInteger(year)) {
      return res.status(400).json({ error: 'Informe resource_id e year do catálogo do TSE.' });
    }
    try {
      const manifest = await tseOpenData.downloadResource(resourceId, year);
      res.status(201).json(manifest);
    } catch (err: any) {
      const message = String(err?.message ?? 'Falha no download do recurso TSE.');
      const status = /inválido|não foi identificado|não possui URL|não foi confirmado/i.test(message) ? 400 : 502;
      res.status(status).json({ error: message, source: 'Portal de Dados Abertos do TSE' });
    }
  });

  // Inspect an already downloaded CSV and enumerate the cargo codes actually present.
  app.post('/api/tse/inspect', async (req, res) => {
    const resourceId = String(req.body?.resource_id ?? '');
    const year = Number.parseInt(String(req.body?.year ?? ''), 10);
    if (!resourceId || !Number.isInteger(year)) {
      return res.status(400).json({ error: 'Informe resource_id e year do catálogo do TSE.' });
    }
    try {
      res.json(await tseOpenData.inspectDownloadedResource(resourceId, year));
    } catch (err: any) {
      const message = String(err?.message ?? 'Falha ao inspecionar o arquivo TSE.');
      const status = /inválido|não encontrado|exige CSV|não contém a coluna|fora do diretório/i.test(message) ? 400 : 422;
      res.status(status).json({ error: message });
    }
  });

  // Inspect a retained ZIP artifact: list members from the central directory and
  // read only the header of each internal CSV (never extracts member data).
  app.post('/api/tse/inspect-zip', async (req, res) => {
    const resourceId = String(req.body?.resource_id ?? '');
    const year = Number.parseInt(String(req.body?.year ?? ''), 10);
    if (!resourceId || !Number.isInteger(year)) {
      return res.status(400).json({ error: 'Informe resource_id e year do catálogo do TSE.' });
    }
    try {
      res.json(await tseOpenData.inspectStoredZip(resourceId, year));
    } catch (err: any) {
      const message = String(err?.message ?? 'Falha ao inspecionar o ZIP do TSE.');
      const status = /inválido|não foi encontrado|exige ZIP|fora do diretório/i.test(message) ? 400 : 422;
      res.status(status).json({ error: message });
    }
  });

  // Validate the inspected header against versioned, sample-only layout profiles.
  // A positive structural match never authorizes ingestion into the analytical model.
  app.post('/api/tse/validate-layout', async (req, res) => {
    const resourceId = String(req.body?.resource_id ?? '');
    const year = Number.parseInt(String(req.body?.year ?? ''), 10);
    if (!resourceId || !Number.isInteger(year)) {
      return res.status(400).json({ error: 'Informe resource_id e year do catálogo do TSE.' });
    }
    try {
      const inspection = await tseOpenData.inspectDownloadedResource(resourceId, year);
      const supportedKinds = [
        'CANDIDATURAS',
        'VOTACAO_NOMINAL_MUNICIPIO_ZONA',
        'DETALHE_APURACAO_MUNICIPIO_ZONA'
      ] as const;
      const kind = supportedKinds.includes(inspection.detected_kind as typeof supportedKinds[number])
        ? inspection.detected_kind as typeof supportedKinds[number]
        : 'OUTRO';
      res.json(validateTseLayout(inspection.year, kind, inspection.layout_columns));
    } catch (err: any) {
      const message = String(err?.message ?? 'Falha ao validar o layout TSE.');
      const status = /inválido|não encontrado|exige CSV|não contém a coluna|fora do diretório/i.test(message) ? 400 : 422;
      res.status(status).json({ error: message });
    }
  });

  // Selective streaming read of one CSV member inside a retained ZIP. Filtered
  // rows are returned in batches bounded by `limit` (default 1000 accepted rows);
  // the member is streamed and never fully loaded. Accepts only a validated
  // (resource_id, year) pair — never client paths. Column names must belong to
  // the documented allowlist of the layout kind.
  const SELECT_LIMIT_MAX = 50_000;
  const TSE_SELECT_STATUS: Record<string, number> = {
    COLUMN_NOT_ALLOWED: 400,
    INVALID_OPTION: 400,
    UNSAFE_MEMBER_NAME: 400,
    COLUMN_NOT_FOUND: 422,
    DUPLICATE_COLUMN: 422,
    EMPTY_HEADER: 422,
    MEMBER_NOT_FOUND: 422,
    MEMBER_TOO_LARGE: 422,
    ZIP_BOMB: 422,
    ZIP_READ_ERROR: 502
  };
  app.post('/api/tse/select-zip', async (req, res) => {
    const resourceId = String(req.body?.resource_id ?? '');
    const year = Number.parseInt(String(req.body?.year ?? ''), 10);
    const memberName = typeof req.body?.member_name === 'string' ? req.body.member_name.trim() : '';
    const limit = req.body?.limit === undefined ? 1000 : Number(req.body?.limit);
    if (!resourceId || !Number.isInteger(year)) {
      return res.status(400).json({ error: 'Informe resource_id e year do catálogo do TSE.' });
    }
    if (!memberName) {
      return res.status(400).json({ error: 'member_name é obrigatório (nome interno do membro CSV no ZIP).' });
    }
    if (!/^[a-f0-9-]{16,64}$/i.test(resourceId)) {
      return res.status(400).json({ error: 'resource_id malformado.' });
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > SELECT_LIMIT_MAX) {
      return res.status(400).json({ error: `limit deve ser inteiro entre 1 e ${SELECT_LIMIT_MAX}.` });
    }
    try {
      const options: any = {
        batchSize: Math.min(limit, 1000),
        maxRows: limit,
        filters: Array.isArray(req.body?.filters) ? req.body.filters : undefined,
        columns: Array.isArray(req.body?.columns) ? req.body.columns.map(String) : undefined
      };
      const batches: string[][][] = [];
      let summary: any = null;
      // `maxRows: limit` ends the generator after `limit` accepted rows (documented
      // early stop), so we just drain it to capture both batches and the summary.
      const iterator = tseOpenData.selectStoredZipRows(resourceId, year, memberName, options);
      for (;;) {
        const next = await iterator.next();
        if (next.done) {
          summary = next.value;
          break;
        }
        batches.push(next.value);
      }
      res.json({ summary, batches });
    } catch (err: any) {
      if (err instanceof TseSelectError) {
        const status = TSE_SELECT_STATUS[err.code] ?? 502;
        return res.status(status).json({ error: { code: err.code, message: err.message, details: err.details } });
      }
      const message = String(err?.message ?? 'Falha na leitura seletiva do ZIP TSE.');
      const status = /inválido|não foi encontrado|não possui|exige ZIP|fora do diretório/i.test(message) ? 400 : 422;
      res.status(status).json({ error: message });
    }
  });

  // Full scan + methodological reconciliation of one CSV member inside a retained ZIP.
  // Reads ALL records (no maxRows unless explicitly passed), builds dimension aggregates,
  // detects duplicates, layout divergences, and reconciles against optional expected counts.
  // Returns a structured TseReconciliationReport.
  app.post('/api/tse/reconcile', async (req, res) => {
    const resourceId = String(req.body?.resource_id ?? '');
    const year = Number.parseInt(String(req.body?.year ?? ''), 10);
    const memberName = typeof req.body?.member_name === 'string' ? req.body.member_name.trim() : '';
    const maxRows = req.body?.max_rows === undefined ? undefined : Number(req.body?.max_rows);
    const expected = req.body?.expected ?? null;
    const filters = Array.isArray(req.body?.filters) ? req.body.filters : undefined;

    if (!resourceId || !Number.isInteger(year)) {
      return res.status(400).json({ error: 'Informe resource_id e year do catálogo do TSE.' });
    }
    if (!memberName) {
      return res.status(400).json({ error: 'member_name é obrigatório (nome interno do membro CSV no ZIP).' });
    }
    if (!/^[a-f0-9-]{16,64}$/i.test(resourceId)) {
      return res.status(400).json({ error: 'resource_id malformado.' });
    }
    if (maxRows !== undefined && (!Number.isInteger(maxRows) || maxRows < 1)) {
      return res.status(400).json({ error: 'max_rows deve ser inteiro positivo.' });
    }

    try {
      const report: TseReconciliationReport = await tseOpenData.scanStoredZipMember(resourceId, year, memberName, {
        maxRows,
        expected,
        filters
      });
      res.json(report);
    } catch (err: any) {
      const message = String(err?.message ?? 'Falha na reconciliação do ZIP TSE.');
      const status = /inválido|não foi encontrado|não possui|exige ZIP|fora do diretório/i.test(message) ? 400 : 422;
      res.status(status).json({ error: message });
    }
  });

  // Full scan + methodological reconciliation of one CSV member inside a retained ZIP.
  // Reads ALL records (no maxRows unless explicitly passed), builds dimension aggregates,
  // detects duplicates, layout divergences, and reconciles against optional expected counts.
  // Returns a structured TseReconciliationReport.
  app.post('/api/tse/reconcile', async (req, res) => {
    const resourceId = String(req.body?.resource_id ?? '');
    const year = Number.parseInt(String(req.body?.year ?? ''), 10);
    const memberName = typeof req.body?.member_name === 'string' ? req.body.member_name.trim() : '';
    const maxRows = req.body?.max_rows === undefined ? undefined : Number(req.body?.max_rows);
    const expected = req.body?.expected ?? null;
    const filters = Array.isArray(req.body?.filters) ? req.body.filters : undefined;

    if (!resourceId || !Number.isInteger(year)) {
      return res.status(400).json({ error: 'Informe resource_id e year do catálogo do TSE.' });
    }
    if (!memberName) {
      return res.status(400).json({ error: 'member_name é obrigatório (nome interno do membro CSV no ZIP).' });
    }
    if (!/^[a-f0-9-]{16,64}$/i.test(resourceId)) {
      return res.status(400).json({ error: 'resource_id malformado.' });
    }
    if (maxRows !== undefined && (!Number.isInteger(maxRows) || maxRows < 1)) {
      return res.status(400).json({ error: 'max_rows deve ser inteiro positivo.' });
    }

    try {
      const report: TseReconciliationReport = await tseOpenData.scanStoredZipMember(resourceId, year, memberName, {
        maxRows,
        expected,
        filters
      });
      res.json(report);
    } catch (err: any) {
      const message = String(err?.message ?? 'Falha na reconciliação do ZIP TSE.');
      const status = /inválido|não foi encontrado|não possui|exige ZIP|fora do diretório/i.test(message) ? 400 : 422;
      res.status(status).json({ error: message });
    }
  });

  // Full scan + methodological reconciliation of one CSV member inside a retained ZIP.
  // Reads ALL records (no maxRows unless explicitly passed), builds dimension aggregates,
  // detects duplicates, layout divergences, and reconciles against optional expected counts.
  // Returns a structured TseReconciliationReport.
  app.post('/api/tse/reconcile', async (req, res) => {
    const resourceId = String(req.body?.resource_id ?? '');
    const year = Number.parseInt(String(req.body?.year ?? ''), 10);
    const memberName = typeof req.body?.member_name === 'string' ? req.body.member_name.trim() : '';
    const maxRows = req.body?.max_rows === undefined ? undefined : Number(req.body?.max_rows);
    const expected = req.body?.expected ?? null;
    const filters = Array.isArray(req.body?.filters) ? req.body.filters : undefined;

    if (!resourceId || !Number.isInteger(year)) {
      return res.status(400).json({ error: 'Informe resource_id e year do catálogo do TSE.' });
    }
    if (!memberName) {
      return res.status(400).json({ error: 'member_name é obrigatório (nome interno do membro CSV no ZIP).' });
    }
    if (!/^[a-f0-9-]{16,64}$/i.test(resourceId)) {
      return res.status(400).json({ error: 'resource_id malformado.' });
    }
    if (maxRows !== undefined && (!Number.isInteger(maxRows) || maxRows < 1)) {
      return res.status(400).json({ error: 'max_rows deve ser inteiro positivo.' });
    }

    try {
      const report: TseReconciliationReport = await tseOpenData.scanStoredZipMember(resourceId, year, memberName, {
        maxRows,
        expected,
        filters
      });
      res.json(report);
    } catch (err: any) {
      const message = String(err?.message ?? 'Falha na reconciliação do ZIP TSE.');
      const status = /inválido|não foi encontrado|não possui|exige ZIP|fora do diretório/i.test(message) ? 400 : 422;
      res.status(status).json({ error: message });
    }
  });

  // Full scan + methodological reconciliation of one CSV member inside a retained ZIP.
  // Reads ALL records (no maxRows unless explicitly passed), builds dimension aggregates,
  // detects duplicates, layout divergences, and reconciles against optional expected counts.
  // Returns a structured TseReconciliationReport.
  app.post('/api/tse/reconcile', async (req, res) => {
    const resourceId = String(req.body?.resource_id ?? '');
    const year = Number.parseInt(String(req.body?.year ?? ''), 10);
    const memberName = typeof req.body?.member_name === 'string' ? req.body.member_name.trim() : '';
    const maxRows = req.body?.max_rows === undefined ? undefined : Number(req.body?.max_rows);
    const expected = req.body?.expected ?? null;
    const filters = Array.isArray(req.body?.filters) ? req.body.filters : undefined;

    if (!resourceId || !Number.isInteger(year)) {
      return res.status(400).json({ error: 'Informe resource_id e year do catálogo do TSE.' });
    }
    if (!memberName) {
      return res.status(400).json({ error: 'member_name é obrigatório (nome interno do membro CSV no ZIP).' });
    }
    if (!/^[a-f0-9-]{16,64}$/i.test(resourceId)) {
      return res.status(400).json({ error: 'resource_id malformado.' });
    }
    if (maxRows !== undefined && (!Number.isInteger(maxRows) || maxRows < 1)) {
      return res.status(400).json({ error: 'max_rows deve ser inteiro positivo.' });
    }

    try {
      const report: TseReconciliationReport = await tseOpenData.scanStoredZipMember(resourceId, year, memberName, {
        maxRows,
        expected,
        filters
      });
      res.json(report);
    } catch (err: any) {
      const message = String(err?.message ?? 'Falha na reconciliação do ZIP TSE.');
      const status = /inválido|não foi encontrado|não possui|exige ZIP|fora do diretório/i.test(message) ? 400 : 422;
      res.status(status).json({ error: message });
    }
  });

  // Full scan + methodological reconciliation of one CSV member inside a retained ZIP.
  // Reads ALL records (no maxRows unless explicitly passed), builds dimension aggregates,
  // detects duplicates, layout divergences, and reconciles against optional expected counts.
  // Returns a structured TseReconciliationReport.
  app.post('/api/tse/reconcile', async (req, res) => {
    const resourceId = String(req.body?.resource_id ?? '');
    const year = Number.parseInt(String(req.body?.year ?? ''), 10);
    const memberName = typeof req.body?.member_name === 'string' ? req.body.member_name.trim() : '';
    const maxRows = req.body?.max_rows === undefined ? undefined : Number(req.body?.max_rows);
    const expected = req.body?.expected ?? null;
    const filters = Array.isArray(req.body?.filters) ? req.body.filters : undefined;

    if (!resourceId || !Number.isInteger(year)) {
      return res.status(400).json({ error: 'Informe resource_id e year do catálogo do TSE.' });
    }
    if (!memberName) {
      return res.status(400).json({ error: 'member_name é obrigatório (nome interno do membro CSV no ZIP).' });
    }
    if (!/^[a-f0-9-]{16,64}$/i.test(resourceId)) {
      return res.status(400).json({ error: 'resource_id malformado.' });
    }
    if (maxRows !== undefined && (!Number.isInteger(maxRows) || maxRows < 1)) {
      return res.status(400).json({ error: 'max_rows deve ser inteiro positivo.' });
    }

    try {
      const report: TseReconciliationReport = await tseOpenData.scanStoredZipMember(resourceId, year, memberName, {
        maxRows,
        expected,
        filters
      });
      res.json(report);
    } catch (err: any) {
      const message = String(err?.message ?? 'Falha na reconciliação do ZIP TSE.');
      const status = /inválido|não foi encontrado|não possui|exige ZIP|fora do diretório/i.test(message) ? 400 : 422;
      res.status(status).json({ error: message });
    }
  });

  // Elections Catalog
  app.get('/api/elections', async (req, res) => {
    try {
      const elections = await dataService.getElections();
      res.json(elections);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Candidates Catalog
  app.get('/api/candidates', async (req, res) => {
    try {
      const idEleicao = (req.query.id_eleicao as string) || '2022_1T_GERAL';
      const cands = await dataService.getCandidates(idEleicao);
      res.json(cands);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Candidate Analysis & HHI
  app.get('/api/results/candidate', async (req, res) => {
    const idEleicao = (req.query.id_eleicao as string) || '2022_1T_GERAL';
    const sqCandidato = parseInt(req.query.sq_candidato as string, 10);
    if (!sqCandidato) return res.status(400).json({ error: 'sq_candidato é obrigatório' });
    try {
      const result = await dataService.getCandidateAnalysis(idEleicao, sqCandidato);
      res.json(result);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // Party Analysis (Nominal vs Legenda)
  app.get('/api/results/party', async (req, res) => {
    const idEleicao = (req.query.id_eleicao as string) || '2022_1T_GERAL';
    const nrPartido = parseInt(req.query.nr_partido as string, 10);
    if (!nrPartido) return res.status(400).json({ error: 'nr_partido é obrigatório' });
    try {
      const result = await dataService.getPartyAnalysis(idEleicao, nrPartido);
      res.json(result);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // Electoral Rules Simulation (D'Hondt & Sobras Lei 14.211/2021)
  app.get('/api/rules/distribution', async (req, res) => {
    const ano = parseInt(req.query.ano as string, 10) || 2022;
    const vagas = parseInt(req.query.vagas as string, 10) || 4;
    try {
      const dist = await dataService.getElectoralDistribution(ano, vagas);
      res.json(dist);
    } catch (err: any) {
      res.status(409).json({ error: err.message });
    }
  });

  // Historical comparisons remain blocked until compatible official datasets are available.
  app.get('/api/comparisons', (_req, res) => {
    res.status(409).json({
      error: 'Comparação histórica indisponível: ainda não existem bases completas e metodologicamente compatíveis para os dois pleitos.',
      comparacao_valida: false
    });
  });

  // Geographic Vector Features
  app.get('/api/territory/geo', (req, res) => {
    res.json([]);
  });

  // AI-Assisted Report Generation (Gemini via Server-side Proxy)
  app.post('/api/reports/ai', async (req, res) => {
    const { questao_analitica, sq_candidato, id_eleicao } = req.body;
    if (!sq_candidato) return res.status(400).json({ error: 'sq_candidato é obrigatório' });
    try {
      const report = await dataService.generateAIReport({
        questao_analitica,
        sq_candidato: parseInt(sq_candidato, 10),
        id_eleicao: id_eleicao || '2022_1T_GERAL'
      });
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Mount Vite middleware in development or serve static in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true }
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`[Server] Inteligência Eleitoral ativo em http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[Server Error]', err);
  process.exit(1);
});
