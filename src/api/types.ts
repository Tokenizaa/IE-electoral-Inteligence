/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ElectionItem {
  id_eleicao: string;
  ano_eleicao: number;
  nr_turno: number;
  tp_eleicao: string;
  ds_eleicao: string;
}

export interface CandidateItem {
  id_candidatura: string;
  id_eleicao: string;
  sq_candidato: number;
  cd_cargo: number;
  ds_cargo: string;
  nr_candidato: number;
  nm_urna_candidato: string;
  nm_civil: string;
  nr_partido: number;
  sg_partido: string;
  nm_partido: string;
  nr_federacao: number | null;
  sg_federacao: string | null;
  ds_situacao_candidatura: string;
  fl_voto_valido: boolean;
}

export interface CandidateMunicipalResult {
  cd_ibge: number;
  cd_tse: number;
  nm_municipio: string;
  nm_regiao: string;
  qt_votos_nominais: number;
  pct_sobre_validos_mun: number;
  pct_sobre_votos_candidato: number;
  ranking_no_municipio: number;
}

export interface CandidateAnalysisResponse {
  candidate: CandidateItem;
  id_eleicao: string;
  total_votos_amostra: number;
  hhi_concentracao: number;
  classificacao_espacial: string;
  municipios_com_voto: number;
  maior_reduto_nome: string;
  pct_maior_reduto: number;
  resultados_municipais: CandidateMunicipalResult[];
  quociente_eleitoral_estado: number | null;
  limites_metodologicos: string[];
}

export interface PartyAnalysisResponse {
  nr_partido: number;
  sg_partido: string;
  nm_partido: string;
  total_votos_nominais: number;
  total_votos_legenda: number;
  total_votos_validos: number;
  pct_dependencia_legenda: number;
  candidatos: Array<{
    sq_candidato: number;
    nm_urna: string;
    votos: number;
    pct_do_partido: number;
  }>;
  votos_por_municipio: Array<{
    cd_tse: number;
    nm_municipio: string;
    votos_nominais: number;
    votos_legenda: number;
    total: number;
  }>;
}

export interface ComparativeAnalysisResponse {
  candidato_t1: string;
  candidato_t2: string;
  votos_t1: number;
  votos_t2: number;
  delta_absoluto: number;
  delta_percentual_relativo: number | null;
  share_t1: number;
  share_t2: number;
  delta_share_pp: number;
  ressalvas_metodologicas: string[];
  comparacao_valida: boolean;
  motivo_bloqueio?: string;
}

export interface AIReportRequest {
  questao_analitica: string;
  sq_candidato: number;
  id_eleicao: string;
}

export interface AIReportEvidenceBundle {
  sq_candidato: number;
  nm_candidato: string;
  partido: string;
  cargo: string;
  eleicao: string;
  total_votos_amostra: number;
  hhi: number;
  classificacao_espacial: string;
  top_municipios: Array<{
    municipio: string;
    votos: number;
    pct_candidato: number;
    ranking: number;
  }>;
  quociente_eleitoral: number | null;
}

export interface AIReportResponse {
  titulo: string;
  pergunta_investigacao: string;
  timestamp: string;
  modelo_ia_utilizado: string;
  status_ia: 'GERADO_COM_SUCESSO' | 'IA_INDISPONIVEL_RELATORIO_DETERMINISTICO';
  resumo_executivo: string;
  diagnostico_territorial: string;
  analise_institucional: string;
  evidencias_vinculadas: AIReportEvidenceBundle;
  limitacoes_e_epistemologia: string[];
  conclusao_proporcional: string;
  provencancia_arquivos: string[];
}
