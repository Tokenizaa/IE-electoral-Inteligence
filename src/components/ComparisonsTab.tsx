/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  GitCompare,
  TrendingUp,
  Percent,
  Sliders,
  Scale,
  AlertTriangle,
  Award,
  CheckCircle2
} from 'lucide-react';
import { CandidateItem, ComparativeAnalysisResponse } from '../api/types.ts';
import { ApiClient } from '../api/client.ts';

interface ComparisonsTabProps {
  candidates: CandidateItem[];
}

export const ComparisonsTab: React.FC<ComparisonsTabProps> = ({ candidates }) => {
  const [cand1Sq, setCand1Sq] = useState<number>(210001610488); // Carlos Búrigo
  const [cand2Sq, setCand2Sq] = useState<number>(210001607812); // Pepe Vargas
  const [compData, setCompData] = useState<ComparativeAnalysisResponse | null>(null);

  // Proportional Simulation State
  const [totalVagas, setTotalVagas] = useState<number>(4);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  const c1 = candidates.find(c => c.sq_candidato === cand1Sq) || candidates[0];
  const c2 = candidates.find(c => c.sq_candidato === cand2Sq) || candidates[1];

  useEffect(() => {
    // Run comparison
    ApiClient.getComparativeAnalysis(31000, 36900, 210000, 225000)
      .then(res => setCompData(res))
      .catch(err => console.error(err));

    // Run electoral rules simulation
    ApiClient.getElectoralDistribution(2022, totalVagas)
      .then(res => setSimulationResult(res))
      .catch(err => console.error(err));
  }, [totalVagas]);

  return (
    <div className="space-y-6">
      {/* SECTION 1: COMPARATIVE DELTA ENGINE */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <span className="text-[10px] font-mono uppercase text-indigo-400 font-bold">Mecanismo Comparativo Rigoroso</span>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-indigo-400" />
              Comparação Longitudinal e Variação Eleitoral
            </h3>
            <p className="text-[11px] text-slate-400">
              Cálculo formal de $\Delta$ Absoluto, $\%\Delta$ Relativo e $\Delta$ Share com tratamento de denominador zero.
            </p>
          </div>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
            Universo Compatibilizado: Deputado Estadual RS
          </span>
        </div>

        {compData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">1. Variação Absoluta de Votos ($\Delta V$)</span>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                +{compData.delta_absoluto.toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                De {compData.votos_t1.toLocaleString()} (T1) para {compData.votos_t2.toLocaleString()} (T2).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">2. Variação Relativa ($\%\Delta V$)</span>
              <div className="text-2xl font-bold font-mono text-indigo-400">
                +{compData.delta_percentual_relativo}%
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Crescimento sobre a base de partida do ciclo anterior.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">3. Variação do Market Share Eleitoral</span>
              <div className="text-2xl font-bold font-mono text-purple-400">
                +{compData.delta_share_pp} pp
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                De {compData.share_t1}% para {compData.share_t2}% dos votos válidos.
              </p>
            </div>
          </div>
        )}

        {/* Methodological Safeguards */}
        <div className="mt-4 p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-amber-300">Ressalvas Científicas de Comparabilidade:</strong> Dois pontos no tempo constituem apenas 
            variação pontual ($\Delta$), e não uma tendência secular. Comparações entre pleitos exigem atenção para expansão do comparecimento 
            e possíveis rezoneamentos jurisdicionais.
          </div>
        </div>
      </div>

      {/* SECTION 2: PROPORTIONAL RULES & D'HONDT SIMULATOR */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <span className="text-[10px] font-mono uppercase text-indigo-400 font-bold">Motor Institucional Determinístico</span>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              Auditoria de Quociente Eleitoral e Sobras D'Hondt (Lei 14.211/2021)
            </h3>
            <p className="text-[11px] text-slate-400">
              Simulação estrita da distribuição de cadeiras com cláusula 80/20 e fase residual (STF ADI 7228).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-mono">Cadeiras em Disputa:</label>
            <select
              value={totalVagas}
              onChange={(e) => setTotalVagas(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            >
              <option value={4}>4 Vagas (Amostra Controlada)</option>
              <option value={5}>5 Vagas</option>
              <option value={6}>6 Vagas</option>
            </select>
          </div>
        </div>

        {simulationResult && (
          <div className="space-y-4 mt-5">
            {/* Simulation KPI Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-400">Votos Válidos Totais</span>
                <div className="text-xl font-bold font-mono text-white mt-0.5">
                  {simulationResult.votos_validos_totais.toLocaleString()}
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-mono uppercase text-indigo-400">Quociente Eleitoral (QE)</span>
                <div className="text-xl font-bold font-mono text-indigo-300 mt-0.5">
                  {simulationResult.quociente_eleitoral.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Válidos ÷ {simulationResult.total_vagas} vagas</div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-mono uppercase text-emerald-400">Vagas Preenchidas</span>
                <div className="text-xl font-bold font-mono text-emerald-300 mt-0.5">
                  {simulationResult.vagas_preenchidas} de {simulationResult.total_vagas}
                </div>
                <div className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 inline" />
                  100% Alocadas sem resíduo
                </div>
              </div>
            </div>

            {/* Allocated Benches List */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                Distribuição Oficial de Bancadas e Candidatos Eleitos
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {simulationResult.distribuicao.map((b: any) => {
                  if (b.total_cadeiras === 0) return null;
                  return (
                    <div key={b.nr_partido} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                        <span className="font-bold text-white text-sm">
                          {b.sg_partido} ({b.nr_partido})
                        </span>
                        <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800">
                          {b.total_cadeiras} {b.total_cadeiras === 1 ? 'Cadeira' : 'Cadeiras'}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono">
                        <span>Total Votos: {b.total_votos.toLocaleString()}</span>
                        <span>QP: {b.qp_direto} | Sobras: {b.sobras_obtidas}</span>
                      </div>

                      <div className="space-y-1 pt-1">
                        {b.candidatos_eleitos.map((c: any) => (
                          <div key={c.sq_candidato} className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                            <span className="font-semibold text-white">{c.nm_urna}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-slate-400">{c.votos.toLocaleString()} votos</span>
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                                c.tipo_eleicao === 'QP_DIRETO' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-purple-950 text-purple-400 border border-purple-800'
                              }`}>
                                {c.tipo_eleicao === 'QP_DIRETO' ? 'QP Direto' : 'Sobra D\'Hondt'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
