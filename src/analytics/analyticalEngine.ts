/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { ElectoralDatabase } from '../db/database.ts';

export interface CandidateHHIReport {
  indicador_id: string;
  versao_metodologia: string;
  sq_candidato: number;
  id_eleicao: string;
  total_votos_amostra: number;
  hhi_concentracao: number;
  classificacao_espacial: string;
  municipios_com_voto: number;
  maior_reduto_cd_ibge: number;
  maior_reduto_nome: string;
  pct_maior_reduto: number;
  limites_epistemologicos: string;
}

export interface ComparativeDeltaReport {
  votos_t1: number;
  votos_t2: number;
  delta_absoluto: number;
  delta_percentual_relativo: number | null;
  share_t1: number;
  share_t2: number;
  delta_share_pontos_percentuais: number;
  ressalvas_comparabilidade: string[];
}

export class AnalyticalEngine {
  constructor(private db: ElectoralDatabase) {}

  /**
   * Projeta e persiste a votação do candidato agregada por município
   */
  public async projectCandidateMunicipalVotes(idEleicao: string, sqCandidato: number): Promise<void> {
    // 1. Get candidate votes aggregated by municipality
    const candMunRows = await this.db.query<{
      cd_tse: number;
      cd_ibge: number;
      votos_candidato: number;
    }>(
      `SELECT v.cd_tse, m.cd_ibge, SUM(v.qt_votos) as votos_candidato
       FROM raw_votacao_munzona v
       JOIN dim_municipio_tse_ibge m ON v.cd_tse = m.cd_tse
       WHERE v.id_eleicao = $1 AND v.sq_candidato = $2 AND v.tp_votavel = 'NOMINAL'
       GROUP BY v.cd_tse, m.cd_ibge`,
      [idEleicao, sqCandidato]
    );

    if (candMunRows.length === 0) return;

    const totalVotosCandidato = candMunRows.reduce((acc, r) => acc + Number(r.votos_candidato), 0);

    for (const row of candMunRows) {
      const cdIbge = row.cd_ibge;
      const cdTse = row.cd_tse;
      const votosCand = Number(row.votos_candidato);

      // Total valid votes in municipality
      const totMun = await this.db.query<{ total: number }>(
        `SELECT COALESCE(SUM(qt_votos), 0) as total
         FROM raw_votacao_munzona
         WHERE id_eleicao = $1 AND cd_tse = $2 AND (tp_votavel = 'NOMINAL' OR tp_votavel = 'LEGENDA')`,
        [idEleicao, cdTse]
      );
      const totalRegistrosAmostraMun = Number(totMun[0]?.total || 0);
      if (totalRegistrosAmostraMun <= 0) throw new Error(`Sem registros de votos na amostra para o município TSE ${cdTse}.`);

      // Calculate ranking in municipality
      const rankQuery = await this.db.query<{ rank: number }>(
        `WITH cand_tot AS (
           SELECT sq_candidato, SUM(qt_votos) as total_votos
           FROM raw_votacao_munzona
           WHERE id_eleicao = $1 AND cd_tse = $2 AND tp_votavel = 'NOMINAL'
           GROUP BY sq_candidato
         )
         SELECT COUNT(*) + 1 as rank
         FROM cand_tot
         WHERE total_votos > $3`,
        [idEleicao, cdTse, votosCand]
      );
      const ranking = Number(rankQuery[0]?.rank || 1);

      const pctSobreRegistrosAmostra = Number(((votosCand / totalRegistrosAmostraMun) * 100).toFixed(4));
      const pctSobreCand = Number(((votosCand / totalVotosCandidato) * 100).toFixed(4));
      const idMart = `MART_${idEleicao}_${sqCandidato}_${cdIbge}`;

      await this.db.query(
        `INSERT INTO mart_votacao_candidato_mun (
          id_mart, id_eleicao, sq_candidato, cd_ibge, cd_tse,
          qt_votos_nominais, pct_sobre_registros_amostra_mun, pct_sobre_votos_candidato,
          ranking_no_municipio, data_atualizacao
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
        ON CONFLICT (id_eleicao, sq_candidato, cd_ibge) DO UPDATE SET
          qt_votos_nominais = EXCLUDED.qt_votos_nominais,
          pct_sobre_registros_amostra_mun = EXCLUDED.pct_sobre_registros_amostra_mun,
          pct_sobre_votos_candidato = EXCLUDED.pct_sobre_votos_candidato,
          ranking_no_municipio = EXCLUDED.ranking_no_municipio,
          data_atualizacao = CURRENT_TIMESTAMP`,
        [idMart, idEleicao, sqCandidato, cdIbge, cdTse, votosCand, pctSobreRegistrosAmostra, pctSobreCand, ranking]
      );
    }
  }

  /**
   * Calcula o Índice de Herfindahl-Hirschman (HHI) de Concentração Espacial do Candidato
   */
  public async computeCandidateHHI(idEleicao: string, sqCandidato: number, cdCargo: number): Promise<CandidateHHIReport> {
    await this.projectCandidateMunicipalVotes(idEleicao, sqCandidato);

    const rows = await this.db.query<{
      cd_ibge: number;
      nm_municipio: string;
      qt_votos_nominais: number;
    }>(
      `SELECT m.cd_ibge, mun.nm_municipio, m.qt_votos_nominais
       FROM mart_votacao_candidato_mun m
       JOIN dim_municipio_tse_ibge mun ON m.cd_ibge = mun.cd_ibge
       WHERE m.id_eleicao = $1 AND m.sq_candidato = $2
       ORDER BY m.qt_votos_nominais DESC`,
      [idEleicao, sqCandidato]
    );

    if (rows.length === 0) {
      throw new Error(`Nenhum voto encontrado para o candidato ${sqCandidato} na eleição ${idEleicao}.`);
    }

    const totalVotos = rows.reduce((acc, r) => acc + Number(r.qt_votos_nominais), 0);

    // HHI = Sum( (v_i / Total)^2 )
    let hhiSum = 0;
    rows.forEach(r => {
      const share = Number(r.qt_votos_nominais) / totalVotos;
      hhiSum += share * share;
    });

    const hhi = Number(hhiSum.toFixed(6));

    // Não aplicamos classes qualitativas sem limiares e universo territorial validados.
    const classificacao = 'NÃO CLASSIFICADO — LIMIARES NÃO VALIDADOS';

    const maiorReduto = rows[0];
    const pctMaiorReduto = Number(((Number(maiorReduto.qt_votos_nominais) / totalVotos) * 100).toFixed(4));

    // Total de votos nominais + legenda observados na amostra para este cargo
    const sampleValidos = await this.db.query<{ total: number }>(
      `SELECT COALESCE(SUM(qt_votos), 0) as total
       FROM raw_votacao_munzona
       WHERE id_eleicao = $1 AND cd_cargo = $2 AND (tp_votavel = 'NOMINAL' OR tp_votavel = 'LEGENDA')`,
      [idEleicao, cdCargo]
    );
    const totalValidosAmostra = Number(sampleValidos[0]?.total || 0);
    if (totalValidosAmostra <= 0) {
      throw new Error('Não é possível calcular a participação na amostra sem votos válidos observados.');
    }
    const pctValidosAmostra = Number(((totalVotos / totalValidosAmostra) * 100).toFixed(4));

    // Hash real e reproduzível do manifesto das fontes efetivamente registradas.
    // Isto identifica os arquivos amostrais ingeridos; não certifica cobertura estadual/nacional.
    const sourceRows = await this.db.query<{ nome_arquivo: string; hash_sha256: string }>(
      `SELECT nome_arquivo, hash_sha256
       FROM meta_fontes_tse
       WHERE ano_eleicao = (SELECT ano_eleicao FROM dim_eleicao WHERE id_eleicao = $1)
         AND sg_uf = 'RS'
       ORDER BY nome_arquivo, hash_sha256`,
      [idEleicao]
    );
    if (sourceRows.length === 0 || sourceRows.some(row => !/^[a-f0-9]{64}$/i.test(row.hash_sha256.trim()))) {
      throw new Error('Não é possível calcular o HHI sem hashes SHA-256 válidos das fontes ingeridas.');
    }
    const manifestContent = sourceRows
      .map(row => `${row.nome_arquivo.trim()}:${row.hash_sha256.trim().toLowerCase()}`)
      .join('\n');
    const manifestSha256 = createHash('sha256').update(manifestContent, 'utf8').digest('hex');

    const idIndicador = `HHI_${idEleicao}_${sqCandidato}`;

    await this.db.query(
      `INSERT INTO mart_indicadores_candidato (
        id_indicador, id_eleicao, sq_candidato, cd_cargo,
        total_votos_amostra, pct_votos_validos_amostra, hhi_concentracao,
        classificacao_espacial, municipios_com_voto, maior_reduto_cd_ibge,
        pct_maior_reduto, manifest_sha256, data_calculo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
      ON CONFLICT (id_eleicao, sq_candidato) DO UPDATE SET
        total_votos_amostra = EXCLUDED.total_votos_amostra,
        pct_votos_validos_amostra = EXCLUDED.pct_votos_validos_amostra,
        hhi_concentracao = EXCLUDED.hhi_concentracao,
        classificacao_espacial = EXCLUDED.classificacao_espacial,
        municipios_com_voto = EXCLUDED.municipios_com_voto,
        maior_reduto_cd_ibge = EXCLUDED.maior_reduto_cd_ibge,
        pct_maior_reduto = EXCLUDED.pct_maior_reduto,
        manifest_sha256 = EXCLUDED.manifest_sha256,
        data_calculo = CURRENT_TIMESTAMP`,
      [
        idIndicador, idEleicao, sqCandidato, cdCargo,
        totalVotos, pctValidosAmostra, hhi, classificacao,
        rows.length, maiorReduto.cd_ibge, pctMaiorReduto,
        manifestSha256
      ]
    );

    return {
      indicador_id: idIndicador,
      versao_metodologia: '1.1.0-HHI-SAMPLE-ONLY',
      sq_candidato: sqCandidato,
      id_eleicao: idEleicao,
      total_votos_amostra: totalVotos,
      hhi_concentracao: hhi,
      classificacao_espacial: classificacao,
      municipios_com_voto: rows.length,
      maior_reduto_cd_ibge: maiorReduto.cd_ibge,
      maior_reduto_nome: maiorReduto.nm_municipio,
      pct_maior_reduto: pctMaiorReduto,
      limites_epistemologicos: 'O HHI é a soma dos quadrados das participações municipais nos votos nominais observados na amostra. A classificação qualitativa e seus limiares não foram validados; o indicador não representa votação estadual completa, não mede lealdade individual e não demonstra causalidade.'
    };
  }

  /**
   * Cálculo de Variação Longitudinal Comparativa entre Dois Pleitos
   */
  public static calculateComparativeDelta(
    votosT1: number,
    votosT2: number,
    validosMunT1: number,
    validosMunT2: number
  ): ComparativeDeltaReport {
    const deltaAbs = votosT2 - votosT1;
    const deltaRel = votosT1 > 0 ? Number((((votosT2 - votosT1) / votosT1) * 100).toFixed(2)) : null;

    const shareT1 = validosMunT1 > 0 ? Number(((votosT1 / validosMunT1) * 100).toFixed(4)) : 0;
    const shareT2 = validosMunT2 > 0 ? Number(((votosT2 / validosMunT2) * 100).toFixed(4)) : 0;
    const deltaShare = Number((shareT2 - shareT1).toFixed(4));

    const ressalvas: string[] = [];
    if (votosT1 === 0) ressalvas.push('Candidato não obteve votos em T1 (variação percentual indefinida).');
    if (Math.abs(validosMunT2 - validosMunT1) / validosMunT1 > 0.15) {
      ressalvas.push('O universo de votos válidos municipais variou mais de 15% entre os pleitos (comparação relativa recomendada sobre a absoluta).');
    }

    return {
      votos_t1: votosT1,
      votos_t2: votosT2,
      delta_absoluto: deltaAbs,
      delta_percentual_relativo: deltaRel,
      share_t1: shareT1,
      share_t2: shareT2,
      delta_share_pontos_percentuais: deltaShare,
      ressalvas_comparabilidade: ressalvas
    };
  }
}
