/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  BookOpen,
  Search,
  FileText,
  Copy,
  Check,
  ArrowRight,
  Info
} from 'lucide-react';
import { CANONICAL_DOCS } from '../data/specificationData.ts';

export const DocsTab: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('01_visao');
  const [search, setSearch] = useState<string>('');
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = CANONICAL_DOCS.filter(d => 
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.summary.toLowerCase().includes(search.toLowerCase())
  );

  const current = CANONICAL_DOCS.find(d => d.id === selectedId) || CANONICAL_DOCS[0];

  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopied(path);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Sidebar List */}
      <div className="lg:col-span-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cadernos Normativos</span>
          <span className="text-[11px] font-mono text-indigo-400">{CANONICAL_DOCS.length} Documentos</span>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filtrar cadernos normativos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
          {filtered.map(doc => {
            const isSelected = doc.id === selectedId;
            return (
              <button
                key={doc.id}
                onClick={() => setSelectedId(doc.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all flex flex-col gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-950/70 border-indigo-600/70 text-white shadow-md'
                    : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                    {doc.caderno}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/40">
                    {doc.badge}
                  </span>
                </div>
                <div className="text-xs font-semibold leading-snug">{doc.title}</div>
                <div className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{doc.summary}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Document Inspector Card */}
      <div className="lg:col-span-8 bg-slate-900 rounded-xl border border-slate-800 p-6 flex flex-col min-h-[500px]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/50">
                {current.caderno}
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-emerald-400 font-medium">{current.badge}</span>
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight">{current.title}</h3>
          </div>

          <button
            onClick={() => handleCopy(current.path)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 transition-colors"
          >
            {copied === current.path ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-mono">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono text-slate-300">{current.path}</span>
              </>
            )}
          </button>
        </div>

        <div className="flex-1 space-y-4 text-xs text-slate-300 leading-relaxed">
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold mb-2">
              <Info className="w-4 h-4 text-indigo-400" />
              Resumo Executivo da Especificação Normativa
            </div>
            <p className="text-slate-300 leading-relaxed text-xs">
              {current.summary}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <span className="text-slate-200 font-bold block">Localização Canônica no Repositório:</span>
            <code className="text-indigo-300 font-mono bg-slate-900 px-3 py-1.5 rounded block border border-slate-800">
              {current.path}
            </code>
            <p className="text-[11px] text-slate-400 pt-1">
              Este caderno contém as diretrizes normativas completas que fundamentam a arquitetura, a auditoria matemática 
              e a conformidade legal da plataforma Inteligência Eleitoral.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
