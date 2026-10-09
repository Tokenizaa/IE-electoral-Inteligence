/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Verification tests intentionally avoid hard-coded election totals. The current
 * source files cover only a partial RS 2022 sample and must not be treated as
 * statewide or national results.
 */

import assert from 'node:assert/strict';
import { DataService } from '../src/services/dataService.ts';
import { RS_MUNICIPALITIES_GEO } from '../src/data/geoData.ts';

async function runPhase3VerificationSuite() {
  console.log('Phase 3: verifying data availability and scientific safeguards');

  const dataService = DataService.getInstance();
  await dataService.ensureDataLoaded();

  const sourceMetadata = await (dataService as any).db.query(
    'SELECT hash_sha256, status_verificacao FROM meta_fontes_tse'
  );
  assert.ok(sourceMetadata.length > 0, 'A ingestão deve registrar metadados de proveniência.');
  assert.ok(sourceMetadata.every((source: { hash_sha256: string; status_verificacao: string }) =>
    /^[a-f0-9]{64}$/i.test(source.hash_sha256.trim()) &&
    source.status_verificacao === 'HASH_LOCAL_CALCULADO'
  ), 'Hash local calculado não deve ser confundido com verificação oficial da fonte.');

  const elections = await dataService.getElections();
  assert.ok(elections.length > 0, 'A amostra deve identificar pelo menos uma eleição disponível.');

  const electionId = '2022_1T_GERAL';
  const candidates = await dataService.getCandidates(electionId);
  assert.ok(candidates.length > 0, 'O catálogo deve refletir candidaturas efetivamente carregadas.');

  const candidate = candidates[0];
  const analysis = await dataService.getCandidateAnalysis(electionId, candidate.sq_candidato);
  assert.equal(analysis.candidate.sq_candidato, candidate.sq_candidato);
  assert.ok(Number.isFinite(analysis.total_votos_amostra) && analysis.total_votos_amostra >= 0);
  assert.ok(Number.isFinite(analysis.hhi_concentracao));
  assert.ok(analysis.hhi_concentracao >= 0 && analysis.hhi_concentracao <= 1);
  assert.match(analysis.classificacao_espacial, /NÃO CLASSIFICADO.*LIMIARES NÃO VALIDADOS/i, 'Não aplicar classes qualitativas sem limiares metodológicos validados.');

  const indicatorRows = await (dataService as any).db.query(
    'SELECT manifest_sha256 FROM mart_indicadores_candidato WHERE id_eleicao = $1 AND sq_candidato = $2',
    [electionId, candidate.sq_candidato]
  );
  assert.ok(indicatorRows.length > 0, 'O indicador deve registrar sua proveniência.');
  assert.match(indicatorRows[0].manifest_sha256, /^[a-f0-9]{64}$/i, 'O manifesto deve ser um SHA-256 real, não um marcador textual.');
  assert.notEqual(indicatorRows[0].manifest_sha256, 'SHA256_VERIFIED');
  assert.ok(Array.isArray(analysis.resultados_municipais));
  assert.ok(analysis.resultados_municipais.every(result =>
    Number.isFinite(result.pct_sobre_registros_amostra_mun) &&
    result.pct_sobre_registros_amostra_mun >= 0 &&
    result.pct_sobre_registros_amostra_mun <= 100
  ), 'Percentuais municipais devem se referir apenas aos registros presentes na amostra.');
  assert.equal(analysis.quociente_eleitoral_estado, null, 'QE estadual não deve ser inventado a partir da amostra.');

  const comparison = dataService.getComparativeAnalysis(100, 120, 1000, 1100);
  assert.equal(comparison.delta_absoluto, 20, 'A operação aritmética de delta deve ser determinística.');
  assert.equal(comparison.comparacao_valida, false, 'Cálculo aritmético não comprova comparabilidade histórica.');

  await assert.rejects(
    () => dataService.getElectoralDistribution(2022, 4),
    /amostra municipal|votação válida completa/i,
    'A distribuição de cadeiras deve bloquear a amostra parcial.'
  );

  assert.equal(RS_MUNICIPALITIES_GEO.length, 0, 'Não deve haver polígonos esquemáticos apresentados como malha oficial.');

  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = '';
  try {
    const report = await dataService.generateAIReport({
      questao_analitica: 'Descreva somente os dados observados na amostra.',
      sq_candidato: candidate.sq_candidato,
      id_eleicao: electionId
    });
    assert.equal(report.evidencias_vinculadas.total_votos_amostra, analysis.total_votos_amostra);
    assert.equal(report.evidencias_vinculadas.quociente_eleitoral, null);
    assert.match(report.evidencias_vinculadas.cobertura, /amostra parcial/i);
    assert.ok(report.limitacoes_e_epistemologia.length > 0);
    assert.match(report.resumo_executivo, /amostra/i);
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }

  console.log('Phase 3 safeguards verified.');
}

runPhase3VerificationSuite().catch(error => {
  console.error('Phase 3 verification failed:', error);
  process.exitCode = 1;
});
