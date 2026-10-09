/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { DataService } from './src/services/dataService.ts';
import { RS_MUNICIPALITIES_GEO } from './src/data/geoData.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  app.use(express.json());

  console.log('[Server] Inicializando banco de dados analítico...');
  const dataService = DataService.getInstance();
  await dataService.ensureDataLoaded();
  console.log('[Server] Banco de dados e tabelas analíticas prontas.');

  // Health and Status
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      engine: 'PostgreSQL 18 (PGlite WASM)',
      cobertura: 'RS 2022 Sample Auditada (100% Oficial TSE)',
      metodologia: 'Protocolo Científico em 9 Etapas'
    });
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
      res.status(500).json({ error: err.message });
    }
  });

  // Historical & Comparative Delta
  app.get('/api/comparisons', (req, res) => {
    const v1 = parseInt(req.query.v1 as string, 10) || 31000;
    const v2 = parseInt(req.query.v2 as string, 10) || 36900;
    const m1 = parseInt(req.query.m1 as string, 10) || 210000;
    const m2 = parseInt(req.query.m2 as string, 10) || 225000;
    try {
      const comp = dataService.getComparativeAnalysis(v1, v2, m1, m2);
      res.json(comp);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Geographic Vector Features
  app.get('/api/territory/geo', (req, res) => {
    res.json(RS_MUNICIPALITIES_GEO);
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
