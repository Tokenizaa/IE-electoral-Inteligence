/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navbar, TabType } from './components/Navbar.tsx';
import { OverviewTab } from './components/OverviewTab.tsx';
import { InvestigationTab } from './components/InvestigationTab.tsx';
import { TerritoryTab } from './components/TerritoryTab.tsx';
import { ComparisonsTab } from './components/ComparisonsTab.tsx';
import { AIReportsTab } from './components/AIReportsTab.tsx';
import { DocsTab } from './components/DocsTab.tsx';
import { TseDataTab } from './components/TseDataTab.tsx';
import { ApiClient } from './api/client.ts';
import { CandidateItem } from './api/types.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCandidateSq, setSelectedCandidateSq] = useState<number>(210001610488);
  const [statusInfo, setStatusInfo] = useState({
    cobertura: 'Amostra parcial RS 2022',
    engine: 'PGlite (PostgreSQL embutido)'
  });

  useEffect(() => {
    ApiClient.getCandidates('2022_1T_GERAL')
      .then(data => {
        setCandidates(data);
        if (data.length > 0 && !data.some(c => c.sq_candidato === selectedCandidateSq)) {
          setSelectedCandidateSq(data[0].sq_candidato);
        }
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar os dados eleitorais.'));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        statusInfo={statusInfo}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full">
        {loadError && (
          <div role="alert" className="mb-5 rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-100">
            <strong className="block mb-1">Dados eleitorais indisponíveis</strong>
            <span>{loadError}</span>
            <p className="mt-2 text-xs text-amber-200/80">A interface não substituirá a falha por candidatos ou números de demonstração.</p>
          </div>
        )}
        {!loadError && candidates.length === 0 && (
          <div role="status" className="mb-5 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
            Carregando os dados eleitorais disponíveis…
          </div>
        )}
        {activeTab === 'overview' && (
          <OverviewTab onNavigateTab={setActiveTab} />
        )}

        {activeTab === 'investigation' && (
          <InvestigationTab
            candidates={candidates}
            selectedCandidateSq={selectedCandidateSq}
            onSelectCandidateSq={setSelectedCandidateSq}
          />
        )}

        {activeTab === 'territory' && (
          <TerritoryTab
            candidates={candidates}
            selectedCandidateSq={selectedCandidateSq}
            onSelectCandidateSq={setSelectedCandidateSq}
          />
        )}

        {activeTab === 'comparisons' && (
          <ComparisonsTab candidates={candidates} />
        )}

        {activeTab === 'reports' && (
          <AIReportsTab
            candidates={candidates}
            selectedCandidateSq={selectedCandidateSq}
          />
        )}

        {activeTab === 'sources' && <TseDataTab />}

        {activeTab === 'docs' && (
          <DocsTab />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-4 px-4 sm:px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Plataforma Inteligência Eleitoral • Amostra de dados eleitorais • Cobertura limitada
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
            <span>Fase 3: validação em andamento</span>
            <span>•</span>
            <span className="text-emerald-400 font-semibold">Resultados sujeitos à validação</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
