/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CandidateItem, CandidateAnalysisResponse, PartyAnalysisResponse, ComparativeAnalysisResponse, AIReportRequest, AIReportResponse, ElectionItem } from './types.ts';
import { GeoMunicipalityFeature } from '../data/geoData.ts';

async function readJson<T>(url: string, message: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || message);
  }
  return response.json() as Promise<T>;
}

export class ApiClient {
  public static getElections(): Promise<ElectionItem[]> {
    return readJson('/api/elections', 'Falha ao carregar eleições');
  }

  public static getCandidates(idEleicao: string): Promise<CandidateItem[]> {
    return readJson('/api/candidates?id_eleicao=' + encodeURIComponent(idEleicao), 'Falha ao carregar candidaturas');
  }

  public static getCandidateAnalysis(idEleicao: string, sqCandidato: number): Promise<CandidateAnalysisResponse> {
    return readJson('/api/results/candidate?id_eleicao=' + encodeURIComponent(idEleicao) + '&sq_candidato=' + encodeURIComponent(String(sqCandidato)), 'Falha ao carregar análise da candidatura');
  }

  public static getPartyAnalysis(idEleicao: string, nrPartido: number): Promise<PartyAnalysisResponse> {
    return readJson('/api/results/party?id_eleicao=' + encodeURIComponent(idEleicao) + '&nr_partido=' + encodeURIComponent(String(nrPartido)), 'Falha ao carregar análise partidária');
  }

  public static getElectoralDistribution(ano: number, vagas: number) {
    return readJson('/api/rules/distribution?ano=' + encodeURIComponent(String(ano)) + '&vagas=' + encodeURIComponent(String(vagas)), 'Falha ao calcular distribuição eleitoral');
  }

  public static getComparativeAnalysis(v1: number, v2: number, m1: number, m2: number): Promise<ComparativeAnalysisResponse> {
    const params = new URLSearchParams({ v1: String(v1), v2: String(v2), m1: String(m1), m2: String(m2) });
    return readJson('/api/comparisons?' + params.toString(), 'Falha ao processar comparação');
  }

  public static getGeoData(): Promise<GeoMunicipalityFeature[]> {
    return readJson('/api/territory/geo', 'Malha geográfica oficial não disponível');
  }

  public static generateAIReport(payload: AIReportRequest): Promise<AIReportResponse> {
    return readJson('/api/reports/ai', 'Falha ao gerar relatório', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
}
