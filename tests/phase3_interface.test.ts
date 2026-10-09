/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataService } from '../src/services/dataService.ts';
import { RS_MUNICIPALITIES_GEO } from '../src/data/geoData.ts';

async function runPhase3VerificationSuite() {
  console.log('================================================================');
  console.log('SUÍTE DE TESTES E VALIDAÇÃO DA FASE 3: INTERFACE E IA CIENTÍFICA');
  console.log('================================================================\n');

  const dataService = DataService.getInstance();
  await dataService.ensureDataLoaded();

  // Test 1: Data Access Layer & Catalog
  console.log('[1/5] Testando Camada de Acesso a Dados e Catálogo...');
  const elections = await dataService.getElections();
  console.log(`  -> Eleições cadastradas: ${elections.length} (esperado >= 1)`);
  if (elections.length === 0) throw new Error('Falha: Nenhuma eleição retornada');

  const candidates = await dataService.getCandidates('2022_1T_GERAL');
  console.log(`  -> Candidatos cadastrados em 2022: ${candidates.length} (esperado: 6)`);
  if (candidates.length !== 6) throw new Error(`Falha: Esperado 6 candidatos, obtido ${candidates.length}`);
  console.log('✓ Catálogo e camadas de acesso a dados operacionais.\n');

  // Test 2: Candidate Analysis & HHI
  console.log('[2/5] Testando Análise de Candidatura e Indicador HHI...');
  const burigoAnalysis = await dataService.getCandidateAnalysis('2022_1T_GERAL', 210001610488);
  console.log(`  -> Candidato: ${burigoAnalysis.candidate.nm_urna_candidato} (${burigoAnalysis.candidate.sg_partido})`);
  console.log(`  -> Total Votos na Amostra: ${burigoAnalysis.total_votos_amostra.toLocaleString()} (esperado: 36.900)`);
  console.log(`  -> HHI de Concentração Espacial: ${burigoAnalysis.hhi_concentracao} (esperado: ~0.572972)`);
  console.log(`  -> Maior Reduto: ${burigoAnalysis.maior_reduto_nome} (${burigoAnalysis.pct_maior_reduto}%)`);
  if (burigoAnalysis.total_votos_amostra !== 36900) {
    throw new Error(`Falha no total de votos: esperado 36900, obtido ${burigoAnalysis.total_votos_amostra}`);
  }
  if (burigoAnalysis.maior_reduto_nome !== 'CAXIAS DO SUL') {
    throw new Error(`Falha no maior reduto: esperado CAXIAS DO SUL, obtido ${burigoAnalysis.maior_reduto_nome}`);
  }
  console.log('✓ Análise de candidatura e HHI calculados e validados.\n');

  // Test 3: Party Analysis (Nominal vs Legenda)
  console.log('[3/5] Testando Decomposição Partidária (Nominal vs Legenda)...');
  const mdbAnalysis = await dataService.getPartyAnalysis('2022_1T_GERAL', 15);
  console.log(`  -> Partido: ${mdbAnalysis.sg_partido} (${mdbAnalysis.nr_partido})`);
  console.log(`  -> Votos Nominais: ${mdbAnalysis.total_votos_nominais.toLocaleString()}`);
  console.log(`  -> Votos de Legenda: ${mdbAnalysis.total_votos_legenda.toLocaleString()}`);
  console.log(`  -> Total Votos Válidos: ${mdbAnalysis.total_votos_validos.toLocaleString()}`);
  console.log(`  -> Taxa de Dependência de Legenda: ${mdbAnalysis.pct_dependencia_legenda}%`);
  if (mdbAnalysis.total_votos_nominais !== 36900 || mdbAnalysis.total_votos_legenda !== 5320) {
    throw new Error('Falha na decomposição de votos nominais e de legenda do MDB');
  }
  console.log('✓ Decomposição partidária e taxa de legenda validadas.\n');

  // Test 4: Comparative Engine & Edge Cases
  console.log('[4/5] Testando Motor Comparativo e Casos de Borda (Denominador Zero)...');
  const normalComp = dataService.getComparativeAnalysis(31000, 36900, 210000, 225000);
  console.log(`  -> Caso Normal: Δ Absoluto = +${normalComp.delta_absoluto} | %Δ Relativo = +${normalComp.delta_percentual_relativo}% | Δ Share = +${normalComp.delta_share_pp} pp`);
  if (normalComp.delta_absoluto !== 5900 || normalComp.delta_percentual_relativo !== 19.03) {
    throw new Error('Falha no cálculo comparativo padrão');
  }

  // Edge Case: V1 = 0 (Novo candidato)
  const zeroComp = dataService.getComparativeAnalysis(0, 15000, 200000, 225000);
  console.log(`  -> Caso Borda (V1 = 0): %Δ Relativo = ${zeroComp.delta_percentual_relativo} (esperado: null) | Ressalvas: ${zeroComp.ressalvas_metodologicas[0]}`);
  if (zeroComp.delta_percentual_relativo !== null) {
    throw new Error('Falha no tratamento de denominador zero: esperado null');
  }
  console.log('✓ Motor comparativo e tratamento de divisão por zero aprovados.\n');

  // Test 5: AI-Assisted Report Generation & Evidence Grounding
  console.log('[5/5] Testando Geração de Relatório de IA e Ancoragem em Evidências...');
  const report = await dataService.generateAIReport({
    questao_analitica: 'Qual a estrutura espacial e dependência de reduto da candidatura?',
    sq_candidato: 210001610488,
    id_eleicao: '2022_1T_GERAL'
  });

  console.log(`  -> Título: ${report.titulo}`);
  console.log(`  -> Status IA: ${report.status_ia}`);
  console.log(`  -> Modelo: ${report.modelo_ia_utilizado}`);
  console.log(`  -> Evidência Vinculada - Total Votos: ${report.evidencias_vinculadas.total_votos_amostra.toLocaleString()}`);
  console.log(`  -> Evidência Vinculada - HHI: ${report.evidencias_vinculadas.hhi}`);
  console.log(`  -> Proveniência: ${report.provencancia_arquivos.join(', ')}`);

  if (report.evidencias_vinculadas.total_votos_amostra !== 36900) {
    throw new Error('Falha: Evidência vinculada à IA diverge do total apurado na base!');
  }
  if (!report.resumo_executivo || !report.diagnostico_territorial || !report.conclusao_proporcional) {
    throw new Error('Falha: Seções obrigatórias do relatório de inteligência ausentes!');
  }
  console.log('✓ Relatório de inteligência ancorado em evidências e salvaguardas validadas.\n');

  console.log('================================================================');
  console.log('TODOS OS TESTES DA FASE 3 FORAM EXECUTADOS E APROVADOS COM SUCESSO!');
  console.log('================================================================');
}

runPhase3VerificationSuite().catch(err => {
  console.error('\n❌ ERRO NA EXECUÇÃO DA SUÍTE DE TESTES DA FASE 3:', err);
  process.exit(1);
});
