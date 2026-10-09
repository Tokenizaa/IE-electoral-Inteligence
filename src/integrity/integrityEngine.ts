/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElectoralDatabase } from '../db/database.ts';

export interface IntegrityCheckResult {
  nome_teste: string;
  categoria: 'FECHAMENTO_URNA' | 'CONSERVACAO_VOTOS' | 'INTEGRIDADE_REFERENCIAL' | 'UNICIDADE_CHAVES';
  status: 'PASS' | 'FAIL' | 'ALERTA';
  total_itens_testados: number;
  itens_com_divergencia: number;
  divergencias_amostra: Array<{
    item_id: string;
    valor_esperado: any;
    valor_encontrado: any;
    diferenca: any;
    classificacao: string;
  }>;
}

export interface ComprehensiveAuditReport {
  timestamp: string;
  id_eleicao: string;
  status_geral: 'APROVADO' | 'REJEITADO' | 'REQUER_ATENCAO';
  testes: IntegrityCheckResult[];
}

export class IntegrityEngine {
  constructor(private db: ElectoralDatabase) {}

  public async runFullAudit(idEleicao: string): Promise<ComprehensiveAuditReport> {
    const report: ComprehensiveAuditReport = {
      timestamp: new Date().toISOString(),
      id_eleicao: idEleicao,
      status_geral: 'APROVADO',
      testes: []
    };

    // Test 1: Fechamento Aritmético da Urna (Boletim de Urna)
    const testTurnout = await this.auditUrnaTurnout(idEleicao);
    report.testes.push(testTurnout);

    // Test 2: Conservação de Votos Nominais e Legenda (Raw Votes vs Detalhe)
    const testConservation = await this.auditVotesConservation(idEleicao);
    report.testes.push(testConservation);

    // Test 3: Integridade Territorial TSE x IBGE
    const testTerritory = await this.auditTerritoryMapping(idEleicao);
    report.testes.push(testTerritory);

    // Test 4: Integridade de Candidaturas e Partidos
    const testCandidacies = await this.auditCandidacyReferences(idEleicao);
    report.testes.push(testCandidacies);

    const hasFailure = report.testes.some(t => t.status === 'FAIL');
    report.status_geral = hasFailure ? 'REJEITADO' : 'APROVADO';

    return report;
  }

  private async auditUrnaTurnout(idEleicao: string): Promise<IntegrityCheckResult> {
    const rows = await this.db.query<{
      cd_tse: number;
      nr_zona: number;
      qt_aptos: number;
      qt_comparecimento: number;
      qt_abstencao: number;
      qt_votos_nominais: number;
      qt_votos_legenda: number;
      qt_votos_brancos: number;
      qt_votos_nulos: number;
      qt_votos_anulados_sub_judice: number;
    }>(
      `SELECT cd_tse, nr_zona, qt_aptos, qt_comparecimento, qt_abstencao,
              qt_votos_nominais, qt_votos_legenda, qt_votos_brancos, qt_votos_nulos,
              qt_votos_anulados_sub_judice
       FROM raw_detalhe_apuracao
       WHERE id_eleicao = $1`,
      [idEleicao]
    );

    const result: IntegrityCheckResult = {
      nome_teste: 'Fechamento Aritmético de Comparecimento e Votos por Zona',
      categoria: 'FECHAMENTO_URNA',
      status: 'PASS',
      total_itens_testados: rows.length,
      itens_com_divergencia: 0,
      divergencias_amostra: []
    };

    for (const r of rows) {
      const somaAptos = r.qt_comparecimento + r.qt_abstencao;
      const somaVotos = r.qt_votos_nominais + r.qt_votos_legenda + r.qt_votos_brancos + r.qt_votos_nulos + r.qt_votos_anulados_sub_judice;

      if (somaAptos !== r.qt_aptos) {
        result.itens_com_divergencia++;
        result.divergencias_amostra.push({
          item_id: `Mun_${r.cd_tse}_Zona_${r.nr_zona}`,
          valor_esperado: r.qt_aptos,
          valor_encontrado: somaAptos,
          diferenca: somaAptos - r.qt_aptos,
          classificacao: 'DIVERGENCIA_COMPARECIMENTO_MAIS_ABSTENCAO'
        });
      }

      if (somaVotos !== r.qt_comparecimento) {
        result.itens_com_divergencia++;
        result.divergencias_amostra.push({
          item_id: `Mun_${r.cd_tse}_Zona_${r.nr_zona}`,
          valor_esperado: r.qt_comparecimento,
          valor_encontrado: somaVotos,
          diferenca: somaVotos - r.qt_comparecimento,
          classificacao: 'DIVERGENCIA_SOMA_VOTOS_VS_COMPARECIMENTO'
        });
      }
    }

    if (result.itens_com_divergencia > 0) {
      result.status = 'FAIL';
    }

    return result;
  }

  private async auditVotesConservation(idEleicao: string): Promise<IntegrityCheckResult> {
    // Cross-check sum of individual raw votes in raw_votacao_munzona against raw_detalhe_apuracao
    const rows = await this.db.query<{
      cd_tse: number;
      nr_zona: number;
      detalhe_nominais: number;
      detalhe_legenda: number;
      soma_nominais_raw: number;
      soma_legenda_raw: number;
    }>(
      `SELECT d.cd_tse, d.nr_zona,
              d.qt_votos_nominais AS detalhe_nominais,
              d.qt_votos_legenda AS detalhe_legenda,
              COALESCE(SUM(CASE WHEN v.tp_votavel = 'NOMINAL' THEN v.qt_votos ELSE 0 END), 0) AS soma_nominais_raw,
              COALESCE(SUM(CASE WHEN v.tp_votavel = 'LEGENDA' THEN v.qt_votos ELSE 0 END), 0) AS soma_legenda_raw
       FROM raw_detalhe_apuracao d
       LEFT JOIN raw_votacao_munzona v
         ON d.id_eleicao = v.id_eleicao
        AND d.cd_tse = v.cd_tse
        AND d.nr_zona = v.nr_zona
        AND d.cd_cargo = v.cd_cargo
       WHERE d.id_eleicao = $1
       GROUP BY d.cd_tse, d.nr_zona, d.qt_votos_nominais, d.qt_votos_legenda`,
      [idEleicao]
    );

    const result: IntegrityCheckResult = {
      nome_teste: 'Conservação de Votos Nominais e Legenda (Raw vs Detalhe)',
      categoria: 'CONSERVACAO_VOTOS',
      status: 'PASS',
      total_itens_testados: rows.length,
      itens_com_divergencia: 0,
      divergencias_amostra: []
    };

    for (const r of rows) {
      if (Number(r.detalhe_nominais) !== Number(r.soma_nominais_raw)) {
        result.itens_com_divergencia++;
        result.divergencias_amostra.push({
          item_id: `Mun_${r.cd_tse}_Zona_${r.nr_zona}_Nominais`,
          valor_esperado: Number(r.detalhe_nominais),
          valor_encontrado: Number(r.soma_nominais_raw),
          diferenca: Number(r.soma_nominais_raw) - Number(r.detalhe_nominais),
          classificacao: 'DIVERGENCIA_SOMA_NOMINAIS'
        });
      }

      if (Number(r.detalhe_legenda) !== Number(r.soma_legenda_raw)) {
        result.itens_com_divergencia++;
        result.divergencias_amostra.push({
          item_id: `Mun_${r.cd_tse}_Zona_${r.nr_zona}_Legenda`,
          valor_esperado: Number(r.detalhe_legenda),
          valor_encontrado: Number(r.soma_legenda_raw),
          diferenca: Number(r.soma_legenda_raw) - Number(r.detalhe_legenda),
          classificacao: 'DIVERGENCIA_SOMA_LEGENDA'
        });
      }
    }

    if (result.itens_com_divergencia > 0) {
      result.status = 'FAIL';
    }

    return result;
  }

  private async auditTerritoryMapping(idEleicao: string): Promise<IntegrityCheckResult> {
    const unmapped = await this.db.query<{ cd_tse: number; total: number }>(
      `SELECT v.cd_tse, COUNT(*) as total
       FROM raw_votacao_munzona v
       LEFT JOIN dim_municipio_tse_ibge m ON v.cd_tse = m.cd_tse
       WHERE v.id_eleicao = $1 AND m.cd_ibge IS NULL
       GROUP BY v.cd_tse`,
      [idEleicao]
    );

    const totalDistinctTse = await this.db.query<{ count: number }>(
      `SELECT COUNT(DISTINCT cd_tse) as count FROM raw_votacao_munzona WHERE id_eleicao = $1`,
      [idEleicao]
    );

    const result: IntegrityCheckResult = {
      nome_teste: 'Correspondência Territorial Obrigatória TSE vs IBGE',
      categoria: 'INTEGRIDADE_REFERENCIAL',
      status: unmapped.length === 0 ? 'PASS' : 'FAIL',
      total_itens_testados: Number(totalDistinctTse[0]?.count || 0),
      itens_com_divergencia: unmapped.length,
      divergencias_amostra: unmapped.map(u => ({
        item_id: `CD_TSE_${u.cd_tse}`,
        valor_esperado: 'CD_IBGE_PRESENTE',
        valor_encontrado: 'NAO_MAPEADO',
        diferenca: u.total,
        classificacao: 'CODIGO_TSE_SEM_CORRESPONDENCIA_IBGE'
      }))
    };

    return result;
  }

  private async auditCandidacyReferences(idEleicao: string): Promise<IntegrityCheckResult> {
    const unreferenced = await this.db.query<{ sq_candidato: number; total: number }>(
      `SELECT v.sq_candidato, COUNT(*) as total
       FROM raw_votacao_munzona v
       LEFT JOIN dim_candidatura c
         ON v.id_eleicao = c.id_eleicao
        AND v.sq_candidato = c.sq_candidato
       WHERE v.id_eleicao = $1
         AND v.tp_votavel = 'NOMINAL'
         AND c.id_candidatura IS NULL
       GROUP BY v.sq_candidato`,
      [idEleicao]
    );

    const totalCands = await this.db.query<{ count: number }>(
      `SELECT COUNT(DISTINCT sq_candidato) as count FROM raw_votacao_munzona WHERE id_eleicao = $1 AND tp_votavel = 'NOMINAL'`,
      [idEleicao]
    );

    const result: IntegrityCheckResult = {
      nome_teste: 'Integridade Referencial de Candidaturas Nominais',
      categoria: 'INTEGRIDADE_REFERENCIAL',
      status: unreferenced.length === 0 ? 'PASS' : 'FAIL',
      total_itens_testados: Number(totalCands[0]?.count || 0),
      itens_com_divergencia: unreferenced.length,
      divergencias_amostra: unreferenced.map(u => ({
        item_id: `SQ_CANDIDATO_${u.sq_candidato}`,
        valor_esperado: 'CADASTRO_EM_DIM_CANDIDATURA',
        valor_encontrado: 'ORFÃO',
        diferenca: u.total,
        classificacao: 'VOTO_NOMINAL_SEM_CANDIDATURA_CADASTRADA'
      }))
    };

    return result;
  }
}
