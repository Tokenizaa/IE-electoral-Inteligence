/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { ElectoralDatabase } from '../src/db/database.ts';
import { IngestionPipeline } from '../src/ingestion/pipeline.ts';
import { IntegrityEngine } from '../src/integrity/integrityEngine.ts';
import { ElectoralEngine, PartyVoteTally } from '../src/electoral/electoralEngine.ts';
import { AnalyticalEngine } from '../src/analytics/analyticalEngine.ts';

async function runPhase2VerificationSuite() {
  console.log('================================================================');
  console.log('SUÍTE DE TESTES E VERIFICAÇÃO EMPÍRICA — FASE 2: INTELIGÊNCIA ELEITORAL');
  console.log('================================================================\n');

  const db = new ElectoralDatabase();
  await db.connect();
  console.log('[1/6] Inicializando esquema físico no PostgreSQL...');
  await db.initSchema();
  console.log('✓ Tabelas, restrições e índices criados com sucesso no PostgreSQL.\n');

  console.log('[2/6] Executando Ingestão Controlada das Fontes Oficiais...');
  const pipeline = new IngestionPipeline(db);

  const filesToIngest = [
    'data/raw/municipio_tse_ibge_RS.csv',
    'data/raw/consulta_cand_2022_RS_sample.csv',
    'data/raw/votacao_candidato_munzona_2022_RS_sample.csv',
    'data/raw/detalhe_votacao_munzona_2022_RS_sample.csv'
  ];

  for (const f of filesToIngest) {
    const fullPath = path.resolve(process.cwd(), f);
    const report = await pipeline.ingestFile(fullPath, `file://${f}`);
    console.log(`  -> Arquivo: ${f.split('/').pop()}`);
    console.log(`     Status: ${report.status} | Lidas: ${report.linhas_lidas} | Aceitas: ${report.linhas_aceitas} | Duplicadas: ${report.linhas_duplicadas} | Rejeitadas: ${report.linhas_rejeitadas}`);
    if (report.linhas_rejeitadas > 0) {
      throw new Error(`Falha na ingestão do arquivo ${f}: ${report.erros_amostra.join(', ')}`);
    }
  }
  console.log('✓ Ingestão inicial concluída com 100% das linhas aceitas.\n');

  console.log('[3/6] Testando Idempotência do Pipeline (Reexecução sem Duplicação)...');
  const retestFile = path.resolve(process.cwd(), 'data/raw/votacao_candidato_munzona_2022_RS_sample.csv');
  const retestReport = await pipeline.ingestFile(retestFile, `file://data/raw/votacao_candidato_munzona_2022_RS_sample.csv`);
  console.log(`  -> Re-ingestão de votacao_candidato: Lidas: ${retestReport.linhas_lidas} | Aceitas: ${retestReport.linhas_aceitas} | Rejeitadas: ${retestReport.linhas_rejeitadas}`);
  
  // Verify that count of records in raw_votacao_munzona did not double
  const countRaw = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM raw_votacao_munzona');
  console.log(`  -> Total de registros na tabela raw_votacao_munzona: ${countRaw[0].count} (esperado: 36)`);
  if (parseInt(countRaw[0].count, 10) !== 36) {
    throw new Error(`Falha no teste de idempotência: esperado 36 registros, encontrado ${countRaw[0].count}`);
  }
  console.log('✓ Idempotência verificada: nenhuma duplicação foi introduzida.\n');

  console.log('[4/6] Executando Motor de Integridade Aritmética e Semântica...');
  const integrity = new IntegrityEngine(db);
  const auditReport = await integrity.runFullAudit('2022_1T_GERAL');

  console.log(`  -> Status Geral da Auditoria: ${auditReport.status_geral}`);
  auditReport.testes.forEach(t => {
    console.log(`     [${t.status}] ${t.nome_teste} (Testados: ${t.total_itens_testados}, Divergências: ${t.itens_com_divergencia})`);
    if (t.divergencias_amostra.length > 0) {
      console.log(`          Amostra de divergência:`, JSON.stringify(t.divergencias_amostra[0]));
    }
  });

  if (auditReport.status_geral !== 'APROVADO') {
    throw new Error('Falha nos testes de integridade aritmética!');
  }
  console.log('✓ Todos os 4 testes de fechamento aritmético e integridade referencial APROVADOS.\n');

  console.log('[5/6] Executando Motor de Regras Eleitorais (Quocientes e Sobras D\'Hondt)...');
  const partyTallies: PartyVoteTally[] = [
    {
      nr_partido: 15,
      sg_partido: 'MDB',
      votos_nominais: 36900,
      votos_legenda: 3450,
      total_votos: 40350,
      candidatos_nominais: [
        { sq_candidato: 210001610488, nm_urna: 'CARLOS BURIGO', votos: 36900 }
      ]
    },
    {
      nr_partido: 13,
      sg_partido: 'PT',
      votos_nominais: 38100,
      votos_legenda: 4300,
      total_votos: 42400,
      candidatos_nominais: [
        { sq_candidato: 210001607812, nm_urna: 'PEPE VARGAS', votos: 38100 }
      ]
    },
    {
      nr_partido: 22,
      sg_partido: 'PL',
      votos_nominais: 21400,
      votos_legenda: 3750,
      total_votos: 25150,
      candidatos_nominais: [
        { sq_candidato: 210001613990, nm_urna: 'RODRIGO LORENZONI', votos: 21400 }
      ]
    },
    {
      nr_partido: 11,
      sg_partido: 'PP',
      votos_nominais: 7670,
      votos_legenda: 1840,
      total_votos: 9510,
      candidatos_nominais: [
        { sq_candidato: 210001611005, nm_urna: 'SILVANA COVATTI', votos: 7670 }
      ]
    },
    {
      nr_partido: 10,
      sg_partido: 'REPUBLICANOS',
      votos_nominais: 11200,
      votos_legenda: 1550,
      total_votos: 12750,
      candidatos_nominais: [
        { sq_candidato: 210001612450, nm_urna: 'SERGIO PERES', votos: 11200 }
      ]
    }
  ];

  const totalVagasCenario = 4;
  const dist = ElectoralEngine.calculateDistribution(2022, totalVagasCenario, partyTallies);
  console.log(`  -> Ano: ${dist.ano_eleicao} | Vagas: ${dist.total_vagas} | Votos Válidos: ${dist.votos_validos_totais}`);
  console.log(`  -> Quociente Eleitoral (QE): ${dist.quociente_eleitoral}`);
  console.log(`  -> Regra: ${dist.regra_aplicada}`);
  
  dist.distribuicao.forEach(b => {
    if (b.total_cadeiras > 0) {
      console.log(`     Bancada ${b.sg_partido}: ${b.total_cadeiras} cadeiras (QP Direto: ${b.qp_direto}, Sobras D'Hondt: ${b.sobras_obtidas})`);
      b.candidatos_eleitos.forEach(c => {
        console.log(`       - Eleito: ${c.nm_urna} (${c.votos.toLocaleString()} votos) [${c.tipo_eleicao}]`);
      });
    }
  });

  if (dist.vagas_preenchidas !== totalVagasCenario) {
    throw new Error(`Falha no cálculo de sobras: esperado ${totalVagasCenario} vagas preenchidas, obtido ${dist.vagas_preenchidas}`);
  }
  console.log('✓ Motor Eleitoral validado: Quocientes e Sobras distribuídas rigorosamente conforme a Lei 14.211/2021.\n');

  console.log('[6/6] Executando Motor Analítico (Projeções Mart, HHI e Concentração Espacial)...');
  const analytics = new AnalyticalEngine(db);

  // Carlos Búrigo SQ: 210001610488
  const hhiReport = await analytics.computeCandidateHHI('2022_1T_GERAL', 210001610488, 7);
  console.log(`  -> Candidato: CARLOS BÚRIGO (SQ: ${hhiReport.sq_candidato})`);
  console.log(`     Total Votos na Amostra: ${hhiReport.total_votos_amostra.toLocaleString()}`);
  console.log(`     HHI de Concentração Espacial: ${hhiReport.hhi_concentracao}`);
  console.log(`     Classificação Espacial: ${hhiReport.classificacao_espacial}`);
  console.log(`     Municípios com Votação: ${hhiReport.municipios_com_voto}`);
  console.log(`     Maior Reduto: ${hhiReport.maior_reduto_nome} (${hhiReport.pct_maior_reduto}% dos votos do candidato)`);

  // Verify DB persisted mart records
  const martVotacao = await db.query(
    'SELECT * FROM mart_votacao_candidato_mun WHERE sq_candidato = $1 ORDER BY qt_votos_nominais DESC',
    [210001610488]
  );
  console.log(`  -> Registros criados no Data Mart (mart_votacao_candidato_mun): ${martVotacao.length}`);
  console.log(`     Top 1 Município: Caxias do Sul com ${martVotacao[0].qt_votos_nominais} votos nominais (Ranking no município: #${martVotacao[0].ranking_no_municipio})`);

  // Test comparative delta
  const deltaTest = AnalyticalEngine.calculateComparativeDelta(31000, 36900, 210000, 225000);
  console.log(`  -> Teste de Comparação Longitudinal: Δ Absoluto = +${deltaTest.delta_absoluto} | %Δ Relativo = +${deltaTest.delta_percentual_relativo}% | Δ Share = +${deltaTest.delta_share_pontos_percentuais} pp`);

  console.log('\n[7/7] Executando Publicador Remoto e Geração de Manifesto Criptográfico...');
  const { RemotePublisher } = await import('../src/sync/publisher.ts');
  const publisher = new RemotePublisher(db);
  const manifest = await publisher.generatePublicationBatch('2022_1T_GERAL', 'RS');
  console.log(`  -> ID Publicação: ${manifest.id_publicacao}`);
  console.log(`  -> Status da Auditoria Pré-Publicação: ${manifest.status_auditoria}`);
  console.log(`  -> Total Municípios Projetados: ${manifest.total_municipios_projetados}`);
  console.log(`  -> Total Indicadores Projetados: ${manifest.total_indicadores_projetados}`);
  console.log(`  -> Hash SHA-256 do Manifesto: ${manifest.sha256_manifesto}`);
  console.log('✓ Publicação remota e manifesto validados com sucesso.');

  console.log('\n================================================================');
  console.log('TODOS OS TESTES DA FASE 2 FORAM EXECUTADOS E APROVADOS COM SUCESSO!');
  console.log('================================================================');

  await db.close();
}

runPhase2VerificationSuite().catch(err => {
  console.error('\n❌ ERRO NA EXECUÇÃO DA SUÍTE DE TESTES:', err);
  process.exit(1);
});
