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
import { ApiClient } from './api/client.ts';
import { CandidateItem } from './api/types.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [selectedCandidateSq, setSelectedCandidateSq] = useState<number>(210001610488);
  const [statusInfo, setStatusInfo] = useState({
    cobertura: 'RS 2022 (Amostra Auditada)',
    engine: 'PostgreSQL 18 WASM'
  });

  useEffect(() => {
    ApiClient.getCandidates('2022_1T_GERAL')
      .then(data => {
        setCandidates(data);
        if (data.length > 0 && !data.some(c => c.sq_candidato === selectedCandidateSq)) {
          setSelectedCandidateSq(data[0].sq_candidato);
        }
      })
      .catch(err => console.error('Erro ao carregar candidatos:', err));
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

        {activeTab === 'docs' && (
          <DocsTab />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-4 px-4 sm:px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Plataforma Inteligência Eleitoral • Base Oficial TSE • Código Aberto & Auditável
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
            <span>Fase 3: Interface Analítica & IA Científica</span>
            <span>•</span>
            <span className="text-emerald-400 font-semibold">100% Determinístico</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
