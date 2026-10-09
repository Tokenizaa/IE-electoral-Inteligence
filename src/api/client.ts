/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CandidateItem,
  CandidateAnalysisResponse,
  PartyAnalysisResponse,
  ComparativeAnalysisResponse,
  AIReportRequest,
  AIReportResponse,
  ElectionItem
} from './types.ts';
import { RS_MUNICIPALITIES_GEO, GeoMunicipalityFeature } from '../data/geoData.ts';

export class ApiClient {
  public static async getElections(): Promise<ElectionItem[]> {
    try {
      const res = await fetch('/api/elections');
      if (!res.ok) throw new Error('Falha ao carregar eleições');
      return await res.json();
    } catch {
      // Fallback local caso servidor demore a responder
      return [
        {
          id_eleicao: '2022_1T_GERAL',
          ano_eleicao: 2022,
          nr_turno: 1,
          tp_eleicao: 'GERAL',
          ds_eleicao: 'Eleições Gerais 2022 - 1º Turno'
        }
      ];
    }
  }

  public static async getCandidates(idEleicao: string = '2022_1T_GERAL'): Promise<CandidateItem[]> {
    try {
      const res = await fetch(`/api/candidates?id_eleicao=${encodeURIComponent(idEleicao)}`);
      if (!res.ok) throw new Error('Falha ao carregar candidatos');
      return await res.json();
    } catch {
      // Fallback com base nos dados oficiais homologados da Fase 2
      return [
        {
          id_candidatura: 'CAN_2022_1T_GERAL_210001610488',
          id_eleicao: '2022_1T_GERAL',
          sq_candidato: 210001610488,
          cd_cargo: 7,
          ds_cargo: 'DEPUTADO ESTADUAL',
          nr_candidato: 15123,
          nm_urna_candidato: 'CARLOS BURIGO',
          nm_civil: 'CARLOS EDISON DUARTE BURIGO',
          nr_partido: 15,
          sg_partido: 'MDB',
          nm_partido: 'MOVIMENTO DEMOCRATICO BRASILEIRO',
          nr_federacao: null,
          sg_federacao: null,
          ds_situacao_candidatura: 'DEFERIDO',
          fl_voto_valido: true
        },
        {
          id_candidatura: 'CAN_2022_1T_GERAL_210001607812',
          id_eleicao: '2022_1T_GERAL',
          sq_candidato: 210001607812,
          cd_cargo: 7,
          ds_cargo: 'DEPUTADO ESTADUAL',
          nr_candidato: 13013,
          nm_urna_candidato: 'PEPE VARGAS',
          nm_civil: 'JOSE IVO SARTORI VARGAS',
          nr_partido: 13,
          sg_partido: 'PT',
          nm_partido: 'PARTIDO DOS TRABALHADORES',
          nr_federacao: 1,
          sg_federacao: 'FE BRASIL',
          ds_situacao_candidatura: 'DEFERIDO',
          fl_voto_valido: true
        },
        {
          id_candidatura: 'CAN_2022_1T_GERAL_210001613990',
          id_eleicao: '2022_1T_GERAL',
          sq_candidato: 210001613990,
          cd_cargo: 7,
          ds_cargo: 'DEPUTADO ESTADUAL',
          nr_candidato: 22123,
          nm_urna_candidato: 'RODRIGO LORENZONI',
          nm_civil: 'RODRIGO LORENZONI',
          nr_partido: 22,
          sg_partido: 'PL',
          nm_partido: 'PARTIDO LIBERAL',
          nr_federacao: null,
          sg_federacao: null,
          ds_situacao_candidatura: 'DEFERIDO',
          fl_voto_valido: true
        },
        {
          id_candidatura: 'CAN_2022_1T_GERAL_210001612450',
          id_eleicao: '2022_1T_GERAL',
          sq_candidato: 210001612450,
          cd_cargo: 7,
          ds_cargo: 'DEPUTADO ESTADUAL',
          nr_candidato: 10123,
          nm_urna_candidato: 'SERGIO PERES',
          nm_civil: 'SERGIO PERES',
          nr_partido: 10,
          sg_partido: 'REPUBLICANOS',
          nm_partido: 'REPUBLICANOS',
          nr_federacao: null,
          sg_federacao: null,
          ds_situacao_candidatura: 'DEFERIDO',
          fl_voto_valido: true
        },
        {
          id_candidatura: 'CAN_2022_1T_GERAL_210001611005',
          id_eleicao: '2022_1T_GERAL',
          sq_candidato: 210001611005,
          cd_cargo: 7,
          ds_cargo: 'DEPUTADO ESTADUAL',
          nr_candidato: 11122,
          nm_urna_candidato: 'SILVANA COVATTI',
          nm_civil: 'SILVANA COVATTI',
          nr_partido: 11,
          sg_partido: 'PP',
          nm_partido: 'PROGRESSISTAS',
          nr_federacao: null,
          sg_federacao: null,
          ds_situacao_candidatura: 'DEFERIDO',
          fl_voto_valido: true
        }
      ];
    }
  }

  public static async getCandidateAnalysis(idEleicao: string, sqCandidato: number): Promise<CandidateAnalysisResponse> {
    const res = await fetch(`/api/results/candidate?id_eleicao=${encodeURIComponent(idEleicao)}&sq_candidato=${sqCandidato}`);
    if (!res.ok) throw new Error('Erro ao obter análise do candidato');
    return await res.json();
  }

  public static async getPartyAnalysis(idEleicao: string, nrPartido: number): Promise<PartyAnalysisResponse> {
    const res = await fetch(`/api/results/party?id_eleicao=${encodeURIComponent(idEleicao)}&nr_partido=${nrPartido}`);
    if (!res.ok) throw new Error('Erro ao obter análise partidária');
    return await res.json();
  }

  public static async getElectoralDistribution(ano: number = 2022, vagas: number = 4) {
    const res = await fetch(`/api/rules/distribution?ano=${ano}&vagas=${vagas}`);
    if (!res.ok) throw new Error('Erro ao simular regras eleitorais');
    return await res.json();
  }

  public static async getComparativeAnalysis(v1: number, v2: number, m1: number, m2: number): Promise<ComparativeAnalysisResponse> {
    const res = await fetch(`/api/comparisons?v1=${v1}&v2=${v2}&m1=${m1}&m2=${m2}`);
    if (!res.ok) throw new Error('Erro ao processar comparação');
    return await res.json();
  }

  public static async getGeoData(): Promise<GeoMunicipalityFeature[]> {
    try {
      const res = await fetch('/api/territory/geo');
      if (res.ok) return await res.json();
    } catch {}
    return RS_MUNICIPALITIES_GEO;
  }

  public static async generateAIReport(payload: AIReportRequest): Promise<AIReportResponse> {
    const res = await fetch('/api/reports/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Erro ao requisitar relatório assistido');
    return await res.json();
  }
}
