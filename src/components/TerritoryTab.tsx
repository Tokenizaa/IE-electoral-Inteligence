/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Layers,
  Info,
  Maximize2,
  Compass,
  BarChart2,
  AlertCircle
} from 'lucide-react';
import { RS_MUNICIPALITIES_GEO, GeoMunicipalityFeature } from '../data/geoData.ts';
import { CandidateItem, CandidateAnalysisResponse } from '../api/types.ts';
import { ApiClient } from '../api/client.ts';

interface TerritoryTabProps {
  candidates: CandidateItem[];
  selectedCandidateSq: number;
  onSelectCandidateSq: (sq: number) => void;
}

export const TerritoryTab: React.FC<TerritoryTabProps> = ({
  candidates,
  selectedCandidateSq,
  onSelectCandidateSq
}) => {
  const [analysis, setAnalysis] = useState<CandidateAnalysisResponse | null>(null);
  const [metric, setMetric] = useState<'absoluto' | 'pct_mun' | 'pct_cand'>('pct_cand');
  const [hoveredMun, setHoveredMun] = useState<GeoMunicipalityFeature | null>(null);
  const [selectedMun, setSelectedMun] = useState<GeoMunicipalityFeature | null>(null);

  const currentCandidate = candidates.find(c => c.sq_candidato === selectedCandidateSq) || candidates[0];

  useEffect(() => {
    if (!currentCandidate) return;
    ApiClient.getCandidateAnalysis('2022_1T_GERAL', currentCandidate.sq_candidato)
      .then(data => setAnalysis(data))
      .catch(err => console.error(err));
  }, [currentCandidate?.sq_candidato]);

  const getMunStats = (cdIbge: number) => {
    return analysis?.resultados_municipais.find(m => m.cd_ibge === cdIbge);
  };

  // Color intensity calculator based on the selected metric
  const getFillColor = (cdIbge: number) => {
    const stats = getMunStats(cdIbge);
    if (!stats) return '#1e293b'; // slate-800: sem dados na amostra

    if (metric === 'absoluto') {
      const maxVotes = Math.max(...(analysis?.resultados_municipais.map(m => m.qt_votos_nominais) || [1]));
      const ratio = stats.qt_votos_nominais / maxVotes;
      if (ratio > 0.6) return '#4f46e5'; // indigo-600
      if (ratio > 0.2) return '#6366f1'; // indigo-500
      if (ratio > 0.05) return '#818cf8'; // indigo-400
      return '#312e81'; // indigo-900
    }

    if (metric === 'pct_mun') {
      const pct = stats.pct_sobre_validos_mun;
      if (pct > 20) return '#059669'; // emerald-600
      if (pct > 10) return '#10b981'; // emerald-500
      if (pct > 3) return '#34d399'; // emerald-400
      return '#064e3b'; // emerald-900
    }

    // pct_cand: % dos votos do candidato
    const pctCand = stats.pct_sobre_votos_candidato;
    if (pctCand > 50) return '#9333ea'; // purple-600
    if (pctCand > 15) return '#a855f7'; // purple-500
    if (pctCand > 5) return '#c084fc'; // purple-400
    return '#581c87'; // purple-900
  };

  const activeMunDisplay = hoveredMun || selectedMun || RS_MUNICIPALITIES_GEO[0];
  const activeStats = activeMunDisplay ? getMunStats(activeMunDisplay.cd_ibge) : null;

  return (
    <div className="space-y-6">
      {/* Epistemological Distinction Banner */}
      <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-4 text-xs flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-amber-300 block mb-0.5">
            Distinção Metodológica Obrigatória (Ames 2001 / Carvalho 2003)
          </span>
          <span className="text-amber-200/90 leading-relaxed">
            <strong>Concentração dos votos de um candidato</strong> (onde ele obtém seus votos, medido pelo HHI e % do candidato) é 
            ontologicamente diferente de <strong>força eleitoral no território</strong> (qual fatia dos votos válidos do município o candidato conquistou). 
            Utilize o seletor abaixo para alternar conscientemente entre as duas grandezas.
          </span>
        </div>
      </div>

      {/* Control Toolbar */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 font-mono">Candidato Selecionado:</label>
          <select
            value={selectedCandidateSq}
            onChange={(e) => onSelectCandidateSq(Number(e.target.value))}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            {candidates.map(c => (
              <option key={c.sq_candidato} value={c.sq_candidato}>
                {c.nr_candidato} — {c.nm_urna_candidato} ({c.sg_partido})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono">Métrica do Mapa:</span>
          <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 flex items-center gap-1 text-xs">
            <button
              onClick={() => setMetric('pct_cand')}
              className={`px-2.5 py-1 rounded transition-colors ${
                metric === 'pct_cand' ? 'bg-purple-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              % dos Votos do Candidato
            </button>
            <button
              onClick={() => setMetric('pct_mun')}
              className={`px-2.5 py-1 rounded transition-colors ${
                metric === 'pct_mun' ? 'bg-emerald-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              % dos Votos do Município
            </button>
            <button
              onClick={() => setMetric('absoluto')}
              className={`px-2.5 py-1 rounded transition-colors ${
                metric === 'absoluto' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              Votos Nominais
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Vector Map & Spatial Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Vector SVG Choropleth Map Container */}
        <div className="lg:col-span-7 bg-slate-900 rounded-xl border border-slate-800 p-5 flex flex-col justify-between min-h-[460px]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-400" />
                Mapa territorial
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                Malha não validada
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              A visualização cartográfica depende da integração de uma malha oficial validada.
            </p>
          </div>

          {/* SVG Map Canvas */}
          <div className="my-4 relative bg-slate-950 rounded-xl border border-slate-800/80 p-4 flex items-center justify-center overflow-hidden">
            {RS_MUNICIPALITIES_GEO.length === 0 ? <div className="w-full max-w-[420px] min-h-[260px] flex items-center justify-center text-center p-6 text-sm text-amber-200 border border-amber-800/60 rounded-lg bg-amber-950/30">Malha geográfica oficial indisponível. Nenhum polígono esquemático será exibido como cartografia real.</div> : <svg
              viewBox="100 80 340 400"
              className="w-full max-w-[420px] h-auto drop-shadow-lg cursor-pointer"
            >
              {RS_MUNICIPALITIES_GEO.map(geo => {
                const isSelected = (selectedMun?.cd_ibge === geo.cd_ibge) || (hoveredMun?.cd_ibge === geo.cd_ibge);
                const fillColor = getFillColor(geo.cd_ibge);

                return (
                  <g key={geo.cd_ibge}>
                    <path
                      d={geo.svgPath}
                      fill={fillColor}
                      stroke={isSelected ? '#ffffff' : '#334155'}
                      strokeWidth={isSelected ? '2.5' : '1'}
                      className="transition-all duration-200 hover:opacity-90"
                      onMouseEnter={() => setHoveredMun(geo)}
                      onMouseLeave={() => setHoveredMun(null)}
                      onClick={() => setSelectedMun(geo)}
                    />
                    <text
                      x={geo.centroide[0] ? (geo.viewBoxBounds.minX + geo.viewBoxBounds.maxX) / 2 : 200}
                      y={(geo.viewBoxBounds.minY + geo.viewBoxBounds.maxY) / 2}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                      pointerEvents="none"
                      className="select-none shadow-black drop-shadow"
                    >
                      {geo.nm_municipio.split(' ')[0]}
                    </text>
                  </g>
                );
              })}
            </svg>}

            {/* Floating Legend */}
            <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur p-2.5 rounded-lg border border-slate-800 text-[10px] space-y-1">
              <span className="font-mono text-slate-300 font-bold block">Legenda da Intensidade</span>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: metric === 'pct_mun' ? '#059669' : metric === 'pct_cand' ? '#9333ea' : '#4f46e5' }}></span>
                <span className="text-slate-400">Intensidade Alta</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: metric === 'pct_mun' ? '#34d399' : metric === 'pct_cand' ? '#c084fc' : '#818cf8' }}></span>
                <span className="text-slate-400">Intensidade Média</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-800"></span>
                <span className="text-slate-500">Sem Votação / Fora da Amostra</span>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 flex items-center justify-between">
            <span>Fonte cartográfica: pendente de integração e validação</span>
            <span>Sistema geodésico: não validado</span>
          </div>
        </div>

        {/* Spatial Intelligence & Selected Region Panel */}
        <div className="lg:col-span-5 space-y-5">
          {/* Active Municipality Inspector */}
          {activeMunDisplay && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-mono uppercase text-indigo-400 font-bold">Município Inspecionado</span>
                  <h3 className="text-lg font-bold text-white">{activeMunDisplay.nm_municipio}</h3>
                </div>
                <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                  IBGE: {activeMunDisplay.cd_ibge}
                </span>
              </div>

              {activeStats ? (
                <div className="space-y-3 mt-4 text-xs">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400">Votos Nominais do Candidato:</span>
                    <span className="text-sm font-bold text-indigo-300 font-mono">
                      {activeStats.qt_votos_nominais.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400">Fatia da Votação Total do Candidato:</span>
                    <span className="text-sm font-bold text-purple-300 font-mono">
                      {activeStats.pct_sobre_votos_candidato}%
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400">Força Local (% dos Votos Válidos):</span>
                    <span className="text-sm font-bold text-emerald-300 font-mono">
                      {activeStats.pct_sobre_validos_mun}%
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400">Posição no Ranking Municipal:</span>
                    <span className="text-xs font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-mono">
                      #{activeStats.ranking_no_municipio} lugar
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-500 mt-4 text-center">
                  Município sem votação nominal registrada na amostra para esta candidatura.
                </div>
              )}
            </div>
          )}

          {/* Spatial Metrics & Scientific Formulas */}
          {analysis && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-indigo-400" />
                Métrica Científica: HHI de Concentração Espacial
              </h4>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-indigo-300 mb-3">
                {`HHI = Σ (V_i / V_total)² = ${analysis.hhi_concentracao}`}
              </div>

              <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                <p>
                  <strong>Classificação Teórica:</strong> <span className="text-indigo-400 font-semibold">{analysis.classificacao_espacial}</span>.
                </p>
                <p className="text-slate-400 text-[11px]">
                  Como $HHI \ge 0.25$, o candidato é categorizado pela literatura politológica como detentor de um 
                  <em> reduto territorial fechado</em>, dependendo criticamente de {analysis.maior_reduto_nome} ({analysis.pct_maior_reduto}% dos seus votos).
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
