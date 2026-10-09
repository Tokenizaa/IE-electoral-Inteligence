/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface NormativeRuleConfig {
  ano_eleicao: number;
  legislacao_base: string;
  exige_clausula_individual_qp: boolean;
  pct_minimo_individual_qp: number; // 0.10 (10% do QE)
  regra_sobras: 'CLÁSSICA_DHONDT' | 'LEI_14211_80_20' | 'RESOLUCAO_TSE_2024';
  pct_minimo_partido_sobras: number; // 0.80 sob Lei 14.211
  pct_minimo_candidato_sobras: number; // 0.20 sob Lei 14.211
  permite_coligacao_proporcional: boolean;
  permite_federacao: boolean;
  observacoes_juridicas: string;
}

export const NORMATIVE_MATRIX: Record<number, NormativeRuleConfig> = {
  2018: {
    ano_eleicao: 2018,
    legislacao_base: 'Lei 9.504/1997 e Código Eleitoral (Lei 4.737/1965 com redação da Lei 13.165/2015)',
    exige_clausula_individual_qp: true,
    pct_minimo_individual_qp: 0.10,
    regra_sobras: 'CLÁSSICA_DHONDT',
    pct_minimo_partido_sobras: 0.0,
    pct_minimo_candidato_sobras: 0.10,
    permite_coligacao_proporcional: true,
    permite_federacao: false,
    observacoes_juridicas: 'Permitia coligações em pleitos proporcionais; sobras disputadas por todos os partidos que atingiram o QE.'
  },
  2022: {
    ano_eleicao: 2022,
    legislacao_base: 'Lei 9.504/1997 com alterações da Lei 14.211/2021 e EC 97/2017 (Fim de Coligações Proporcionais)',
    exige_clausula_individual_qp: true,
    pct_minimo_individual_qp: 0.10,
    regra_sobras: 'LEI_14211_80_20',
    pct_minimo_partido_sobras: 0.80,
    pct_minimo_candidato_sobras: 0.20,
    permite_coligacao_proporcional: false,
    permite_federacao: true,
    observacoes_juridicas: 'Exigência de 80% do QE para o partido e 20% do QE individual para concorrer às sobras da primeira fase.'
  },
  2024: {
    ano_eleicao: 2024,
    legislacao_base: 'Resolução TSE 23.677/2021 com atualizações para 2024 e Decisão STF ADI 7228/7263',
    exige_clausula_individual_qp: true,
    pct_minimo_individual_qp: 0.10,
    regra_sobras: 'RESOLUCAO_TSE_2024',
    pct_minimo_partido_sobras: 0.80,
    pct_minimo_candidato_sobras: 0.20,
    permite_coligacao_proporcional: false,
    permite_federacao: true,
    observacoes_juridicas: 'Eleições municipais com federações e regras consolidadas do TSE.'
  }
};

export interface PartyVoteTally {
  nr_partido: number;
  sg_partido: string;
  votos_nominais: number;
  votos_legenda: number;
  total_votos: number;
  candidatos_nominais: Array<{
    sq_candidato: number;
    nm_urna: string;
    votos: number;
  }>;
}

export interface BancadaDistributionResult {
  ano_eleicao: number;
  total_vagas: number;
  votos_validos_totais: number;
  quociente_eleitoral: number;
  regra_aplicada: string;
  distribuicao: Array<{
    nr_partido: number;
    sg_partido: string;
    total_votos: number;
    qp_direto: number;
    sobras_obtidas: number;
    total_cadeiras: number;
    candidatos_eleitos: Array<{
      sq_candidato: number;
      nm_urna: string;
      votos: number;
      tipo_eleicao: 'QP_DIRETO' | 'SOBRA_MEDIA';
    }>;
  }>;
  vagas_preenchidas: number;
}

export class ElectoralEngine {
  public static getNormativeConfig(ano: number): NormativeRuleConfig {
    const config = NORMATIVE_MATRIX[ano];
    if (!config) {
      throw new Error(`Ausência de evidência normativa validada para o ano eleitoral ${ano}.`);
    }
    return config;
  }

  public static calculateQuocienteEleitoral(votosValidosTotais: number, totalVagas: number): number {
    if (totalVagas <= 0) throw new Error('Total de vagas deve ser maior que zero.');
    if (votosValidosTotais <= 0) throw new Error('Total de votos válidos deve ser maior que zero.');
    // CE art. 106: divisão dos votos válidos pelo número de lugares a preencher, desprezada a fração se igual ou inferior a meio, equivalente a piso
    const qe = Math.floor(votosValidosTotais / totalVagas);
    return qe < 1 ? 1 : qe;
  }

  public static calculateQuocientePartidario(votosPartido: number, qe: number): number {
    if (qe <= 0) return 0;
    return Math.floor(votosPartido / qe);
  }

  public static calculateDistribution(
    ano: number,
    totalVagas: number,
    partidos: PartyVoteTally[]
  ): BancadaDistributionResult {
    const config = this.getNormativeConfig(ano);

    // Sum total valid votes
    const votosValidosTotais = partidos.reduce((acc, p) => acc + p.total_votos, 0);
    const qe = this.calculateQuocienteEleitoral(votosValidosTotais, totalVagas);

    // Sort candidates within each party descending by votes
    partidos.forEach(p => {
      p.candidatos_nominais.sort((a, b) => b.votos - a.votos);
    });

    const bancadas = new Map<number, {
      nr_partido: number;
      sg_partido: string;
      total_votos: number;
      qp_direto: number;
      sobras_obtidas: number;
      total_cadeiras: number;
      eleitos: Array<{ sq_candidato: number; nm_urna: string; votos: number; tipo_eleicao: 'QP_DIRETO' | 'SOBRA_MEDIA' }>;
      nextCandidateIdx: number;
    }>();

    partidos.forEach(p => {
      bancadas.set(p.nr_partido, {
        nr_partido: p.nr_partido,
        sg_partido: p.sg_partido,
        total_votos: p.total_votos,
        qp_direto: 0,
        sobras_obtidas: 0,
        total_cadeiras: 0,
        eleitos: [],
        nextCandidateIdx: 0
      });
    });

    let vagasPreenchidas = 0;
    const clausulaIndividualQp = Math.floor(qe * config.pct_minimo_individual_qp);

    // FASE 1: Distribuição por Quociente Partidário Direto
    partidos.forEach(p => {
      const qp = this.calculateQuocientePartidario(p.total_votos, qe);
      const b = bancadas.get(p.nr_partido)!;

      for (let i = 0; i < qp && vagasPreenchidas < totalVagas; i++) {
        if (b.nextCandidateIdx < p.candidatos_nominais.length) {
          const cand = p.candidatos_nominais[b.nextCandidateIdx];
          // Check personal performance threshold (10% of QE)
          if (!config.exige_clausula_individual_qp || cand.votos >= clausulaIndividualQp) {
            b.eleitos.push({
              sq_candidato: cand.sq_candidato,
              nm_urna: cand.nm_urna,
              votos: cand.votos,
              tipo_eleicao: 'QP_DIRETO'
            });
            b.qp_direto++;
            b.total_cadeiras++;
            b.nextCandidateIdx++;
            vagasPreenchidas++;
          }
        }
      }
    });

    // FASE 2: Distribuição de Sobras pelo Método das Maiores Médias (D'Hondt)
    const clausulaPartidoSobras = qe * config.pct_minimo_partido_sobras;
    const clausulaCandSobras = qe * config.pct_minimo_candidato_sobras;

    while (vagasPreenchidas < totalVagas) {
      let melhorMedia = -1;
      let partidoVencedor: number | null = null;

      partidos.forEach(p => {
        const b = bancadas.get(p.nr_partido)!;

        // Check party eligibility for sobras
        const partidoElegivel = config.regra_sobras === 'CLÁSSICA_DHONDT'
          ? b.qp_direto > 0 // Até 2018 exigia ter atingido o QE
          : p.total_votos >= clausulaPartidoSobras; // 2022: >= 80% do QE

        if (!partidoElegivel) return;

        // Check if party still has available candidates
        if (b.nextCandidateIdx >= p.candidatos_nominais.length) return;

        const proxCand = p.candidatos_nominais[b.nextCandidateIdx];
        if (config.regra_sobras === 'LEI_14211_80_20' && proxCand.votos < clausulaCandSobras) {
          return; // Candidato não atinge 20% do QE
        }

        // D'Hondt Formula: Votos / (Cadeiras + 1)
        const media = p.total_votos / (b.total_cadeiras + 1);
        if (media > melhorMedia) {
          melhorMedia = media;
          partidoVencedor = p.nr_partido;
        }
      });

      if (partidoVencedor === null) {
        // FASE 3: Sobras Residuais (Art. 109, § 2º e Decisão STF ADI 7228/7263)
        // Quando nenhum partido mais atinge o filtro estrito da 1ª fase de sobras,
        // as vagas restantes são disputadas pelas maiores médias entre todos os partidos com candidatos disponíveis.
        let melhorMediaResidual = -1;
        let partidoResidualVencedor: number | null = null;

        partidos.forEach(p => {
          const b = bancadas.get(p.nr_partido)!;
          if (b.nextCandidateIdx >= p.candidatos_nominais.length) return;

          const media = p.total_votos / (b.total_cadeiras + 1);
          if (media > melhorMediaResidual) {
            melhorMediaResidual = media;
            partidoResidualVencedor = p.nr_partido;
          }
        });

        if (partidoResidualVencedor === null) {
          // Não há mais candidatos registrados em nenhum partido
          break;
        }

        partidoVencedor = partidoResidualVencedor;
      }

      const pData = partidos.find(p => p.nr_partido === partidoVencedor)!;
      const bData = bancadas.get(partidoVencedor)!;
      const cand = pData.candidatos_nominais[bData.nextCandidateIdx];

      bData.eleitos.push({
        sq_candidato: cand.sq_candidato,
        nm_urna: cand.nm_urna,
        votos: cand.votos,
        tipo_eleicao: 'SOBRA_MEDIA'
      });
      bData.sobras_obtidas++;
      bData.total_cadeiras++;
      bData.nextCandidateIdx++;
      vagasPreenchidas++;
    }

    return {
      ano_eleicao: ano,
      total_vagas: totalVagas,
      votos_validos_totais: votosValidosTotais,
      quociente_eleitoral: qe,
      regra_aplicada: config.legislacao_base,
      distribuicao: Array.from(bancadas.values()).map(b => ({
        nr_partido: b.nr_partido,
        sg_partido: b.sg_partido,
        total_votos: b.total_votos,
        qp_direto: b.qp_direto,
        sobras_obtidas: b.sobras_obtidas,
        total_cadeiras: b.total_cadeiras,
        candidatos_eleitos: b.eleitos
      })),
      vagas_preenchidas: vagasPreenchidas
    };
  }
}
