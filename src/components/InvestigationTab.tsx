/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  Download,
  Building2,
  Award,
  Layers,
  Percent,
  TrendingUp,
  FileText
} from 'lucide-react';
import { CandidateItem, CandidateAnalysisResponse, PartyAnalysisResponse } from '../api/types.ts';
import { ApiClient } from '../api/client.ts';

interface InvestigationTabProps {
  candidates: CandidateItem[];
  selectedCandidateSq: number;
  onSelectCandidateSq: (sq: number) => void;
}

export const InvestigationTab: React.FC<InvestigationTabProps> = ({
  candidates,
  selectedCandidateSq,
  onSelectCandidateSq
}) => {
  const [analysis, setAnalysis] = useState<CandidateAnalysisResponse | null>(null);
  const [partyAnalysis, setPartyAnalysis] = useState<PartyAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'candidate' | 'party'>('candidate');
  const [selectedPartyNr, setSelectedPartyNr] = useState<number>(15);

  const currentCandidate = candidates.find(c => c.sq_candidato === selectedCandidateSq) || candidates[0];

  useEffect(() => {
    if (!currentCandidate) return;
    setLoading(true);
    ApiClient.getCandidateAnalysis('2022_1T_GERAL', currentCandidate.sq_candidato)
      .then(data => {
        setAnalysis(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [currentCandidate?.sq_candidato]);

  useEffect(() => {
    if (viewMode === 'party') {
      ApiClient.getPartyAnalysis('2022_1T_GERAL', selectedPartyNr)
        .then(data => setPartyAnalysis(data))
        .catch(err => console.error(err));
    }
  }, [viewMode, selectedPartyNr]);

  const handleExportCsv = () => {
    if (!analysis) return;
    const headers = ['CD_IBGE;CD_TSE;NM_MUNICIPIO;NM_REGIAO;QT_VOTOS_NOMINAIS;PCT_SOBRE_REGISTROS_AMOSTRA_MUN;PCT_SOBRE_VOTOS_CANDIDATO;RANKING_NO_MUNICIPIO'];
    const rows = analysis.resultados_municipais.map(r => 
      `${r.cd_ibge};${r.cd_tse};${r.nm_municipio};${r.nm_regiao};${r.qt_votos_nominais};${r.pct_sobre_registros_amostra_mun};${r.pct_sobre_votos_candidato};${r.ranking_no_municipio}`
    );
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `votacao_${analysis.candidate.nm_urna_candidato.toLowerCase().replace(/\s+/g, '_')}_2022.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Investigation Filter Toolbar */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold text-white uppercase tracking-wider">Filtros da Consulta (amostra)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('candidate')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'candidate' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Visão por Candidatura
            </button>
            <button
              onClick={() => setViewMode('party')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'party' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Visão por Agremiação / Partido
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
          <div>
            <label className="block text-slate-400 text-[11px] mb-1 font-mono">1. Pleito e Eleição</label>
            <select className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500">
              <option value="2022_1T_GERAL">2022 — Eleições Gerais (1º Turno)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-[11px] mb-1 font-mono">2. Cargo Pleiteado</label>
            <select className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500">
              <option value="7">Deputado Estadual (Sistema Proporcional)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-[11px] mb-1 font-mono">3. Circunscrição Eleitoral</label>
            <select className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500">
              <option value="RS">Rio Grande do Sul (RS)</option>
            </select>
          </div>

          {viewMode === 'candidate' ? (
            <div>
              <label className="block text-slate-400 text-[11px] mb-1 font-mono">4. Candidatura na amostra (fonte TSE)</label>
              <select
                value={selectedCandidateSq}
                onChange={(e) => onSelectCandidateSq(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500"
              >
                {candidates.map(c => (
                  <option key={c.sq_candidato} value={c.sq_candidato}>
                    {c.nr_candidato} — {c.nm_urna_candidato} ({c.sg_partido})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-slate-400 text-[11px] mb-1 font-mono">4. Partido / Agremiação</label>
              <select
                value={selectedPartyNr}
                onChange={(e) => setSelectedPartyNr(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500"
              >
                {Array.from(new Map(candidates.map(candidate => [
                  candidate.nr_partido,
                  { nr_partido: candidate.nr_partido, sg_partido: candidate.sg_partido, nm_partido: candidate.nm_partido }
                ])).values()).sort((a, b) => a.nr_partido - b.nr_partido).map(party => (
                  <option key={party.nr_partido} value={party.nr_partido}>
                    {party.nr_partido} — {party.sg_partido}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* VIEW MODE: CANDIDATE INVESTIGATION */}
      {viewMode === 'candidate' && analysis && (
        <div className="space-y-6">
          {/* Candidate Card */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 rounded-xl border border-slate-800 p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="h-14 w-14 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-mono font-bold text-lg text-indigo-400">
                  {analysis.candidate.nr_candidato}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-white tracking-tight">
                      {analysis.candidate.nm_urna_candidato}
                    </h2>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {analysis.candidate.ds_situacao_candidatura}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 space-x-2">
                    <span>Nome Civil: <strong className="text-slate-300">{analysis.candidate.nm_civil}</strong></span>
                    <span>•</span>
                    <span>Partido: <strong className="text-indigo-400">{analysis.candidate.sg_partido}</strong> ({analysis.candidate.nm_partido})</span>
                    <span>•</span>
                    <span>SQ TSE: <code className="text-slate-300 font-mono text-[11px]">{analysis.candidate.sq_candidato}</code></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Exportar CSV da amostra</span>
                </button>
              </div>
            </div>

            {/* Metrics Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] font-mono uppercase text-slate-400">Total Votos Nominais</div>
                <div className="text-lg font-bold text-white mt-0.5">
                  {analysis.total_votos_amostra.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Nos registros amostrais de 2022</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] font-mono uppercase text-indigo-400">HHI Espacial</div>
                <div className="text-lg font-bold text-indigo-300 mt-0.5">
                  {analysis.hhi_concentracao.toFixed(4)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate" title={analysis.classificacao_espacial}>
                  {analysis.classificacao_espacial}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] font-mono uppercase text-emerald-400">Maior volume observado</div>
                <div className="text-lg font-bold text-emerald-300 mt-0.5">
                  {analysis.maior_reduto_nome}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {analysis.pct_maior_reduto}% dos votos do candidato
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] font-mono uppercase text-amber-400">Piso individual (10% do QE)</div>
                {analysis.quociente_eleitoral_estado == null ? (
                  <>
                    <div className="text-sm font-bold text-amber-300 mt-1">Indisponível</div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Exige votação válida completa da circunscrição; não pode ser inferido da amostra.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-lg font-bold text-amber-300 mt-0.5">
                      {(analysis.quociente_eleitoral_estado * 0.1).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Referência aritmética; a aplicação depende das regras vigentes para a eleição.
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Municipal Results Table */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  Distribuição Territorial Municipal dos Votos
                </h3>
                <p className="text-[11px] text-slate-400">
                  Registros com códigos TSE/IBGE presentes na amostra; os vínculos territoriais ainda precisam de validação independente.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {analysis.resultados_municipais.length} municípios com registros na amostra
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <th className="py-2.5 px-3">Município</th>
                    <th className="py-2.5 px-3">Região</th>
                    <th className="py-2.5 px-3 text-right">Votos Nominais</th>
                    <th className="py-2.5 px-3 text-right">Participação na amostra municipal (%)</th>
                    <th className="py-2.5 px-3 text-right">% do Candidato</th>
                    <th className="py-2.5 px-3 text-center">Posição entre candidaturas da amostra</th>
                    <th className="py-2.5 px-3 font-mono">Código IBGE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {analysis.resultados_municipais.map((mun, idx) => (
                    <tr key={mun.cd_ibge} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-white flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-slate-500">#{idx + 1}</span>
                        {mun.nm_municipio}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{mun.nm_regiao}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-indigo-300">
                        {mun.qt_votos_nominais.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                        {mun.pct_sobre_registros_amostra_mun.toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                        {mun.pct_sobre_votos_candidato.toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          mun.ranking_no_municipio <= 3 ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-slate-800 text-slate-400'
                        }`}>
                          #{mun.ranking_no_municipio}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">{mun.cd_ibge}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE: PARTY INVESTIGATION */}
      {viewMode === 'party' && partyAnalysis && (
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono uppercase text-indigo-400 font-bold">Registros partidários da amostra</span>
                <p className="mt-2 max-w-3xl text-[11px] text-amber-200">
                  Os arquivos contêm apenas algumas candidaturas e registros de legenda. Estes valores não são totais oficiais completos do partido nem medem sua dependência real da legenda.
                </p>
                <h2 className="text-xl font-bold text-white">
                  {partyAnalysis.sg_partido} — {partyAnalysis.nm_partido} ({partyAnalysis.nr_partido})
                </h2>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-400 block">Votos registrados na amostra</span>
                <span className="text-lg font-bold text-indigo-300 font-mono">
                  {partyAnalysis.total_votos_validos.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-400">Votos Nominais (Candidatos)</span>
                <div className="text-lg font-bold text-white mt-1">
                  {partyAnalysis.total_votos_nominais.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {(100 - partyAnalysis.pct_dependencia_legenda).toFixed(1)}% dos registros observados
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-mono uppercase text-amber-400">Votos Exclusivos de Legenda</span>
                <div className="text-lg font-bold text-amber-300 mt-1">
                  {partyAnalysis.total_votos_legenda.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Participação da legenda nos registros observados: <strong>{partyAnalysis.pct_dependencia_legenda}%</strong>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-mono uppercase text-emerald-400">Maior votação nominal observada</span>
                <div className="text-lg font-bold text-emerald-300 mt-1">
                  {partyAnalysis.candidatos[0]?.nm_urna || 'N/A'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {partyAnalysis.candidatos[0]?.votos.toLocaleString()} votos ({partyAnalysis.candidatos[0]?.pct_do_partido}% dos registros observados)
                </div>
              </div>
            </div>

            {/* Party Candidates Table */}
            <div className="mt-5">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-2">
                Candidaturas presentes na amostra
              </h4>
              <div className="space-y-1.5">
                {partyAnalysis.candidatos.map(c => (
                  <div key={c.sq_candidato} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">{c.nm_urna}</span>
                    <div className="flex items-center gap-4 font-mono">
                      <span className="text-slate-400">{c.votos.toLocaleString()} votos</span>
                      <span className="text-indigo-400">{c.pct_do_partido}% dos registros observados</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
