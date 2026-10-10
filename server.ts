/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { DataService } from './src/services/dataService.ts';
import { TseOpenDataClient, type TseResourceKind } from './src/ingestion/tseOpenData.ts';
import { validateTseLayout } from './src/ingestion/tseLayoutRegistry.ts';

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
