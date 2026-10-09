/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SourceFileMetadata {
  id_fonte: string;
  nome_arquivo: string;
  url_origem: string;
  formato: 'CSV' | 'ZIP';
  encoding_detectado: 'UTF-8' | 'ISO-8859-1';
  ano_eleicao: number;
  sg_uf: string;
  tipo_conteudo: 'CONSULTA_CAND' | 'VOTACAO_MUNZONA' | 'DETALHE_APURACAO' | 'MUNICIPIO_IBGE';
  hash_sha256: string;
  tamanho_bytes: number;
}

export interface IngestionBatchReport {
  id_lote: string;
  id_fonte: string;
  timestamp_inicio: string;
  timestamp_fim: string;
  linhas_lidas: number;
  linhas_aceitas: number;
  linhas_rejeitadas: number;
  linhas_duplicadas: number;
  status: 'CONCLUIDO_COM_SUCESSO' | 'QUARENTENA' | 'FALHA';
  erros_amostra: string[];
}

export interface LayoutProfile {
  separador: string;
  encoding: 'UTF-8' | 'ISO-8859-1';
  colunas: string[];
  total_colunas: number;
  tipo_detectado: SourceFileMetadata['tipo_conteudo'];
  ano_inferido: number;
}
