/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Scale,
  LayoutDashboard,
  Search,
  MapPin,
  GitCompare,
  FileSpreadsheet,
  BookOpen,
  Database,
  CheckCircle2
} from 'lucide-react';

export type TabType = 'overview' | 'investigation' | 'territory' | 'comparisons' | 'reports' | 'sources' | 'docs';

interface NavbarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  statusInfo: {
    cobertura: string;
    engine: string;
  };
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, statusInfo }) => {
  const tabs = [
    { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'investigation', label: 'Investigação Eleitoral', icon: Search },
    { id: 'territory', label: 'Análise Territorial & Mapa', icon: MapPin },
    { id: 'comparisons', label: 'Comparações & Regras', icon: GitCompare },
    { id: 'reports', label: 'Relatórios & IA', icon: FileSpreadsheet },
    { id: 'sources', label: 'Fontes TSE', icon: Database },
    { id: 'docs', label: 'Cadernos Canônicos', icon: BookOpen },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
      {/* Top Bar with Audit Tag */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 border-b border-emerald-800/40 px-4 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-semibold text-emerald-300">SISTEMA OFICIAL DE INTELIGÊNCIA ELEITORAL</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300">Cobertura: <strong className="text-white">{statusInfo.cobertura}</strong></span>
        </div>
        <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px]">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
          <span className="text-amber-300">Validação metodológica em andamento</span>
          <span className="text-slate-600">•</span>
          <span>{statusInfo.engine}</span>
        </div>
      </div>

      {/* Main App Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 p-0.5 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <div className="h-full w-full bg-slate-950 rounded-[7px] flex items-center justify-center">
              <Scale className="h-4 w-4 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-white tracking-tight">Inteligência Eleitoral</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                Fase 3: Em validação
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Plataforma Analítica Baseada em Dados Oficiais do TSE e Fórmulas Verificáveis
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <nav className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
