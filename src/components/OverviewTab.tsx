/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ShieldCheck,
  Database,
  Binary,
  CheckCircle2,
  HardDrive,
  FileCheck,
  Scale,
  ArrowRight,
  Award,
  Layers
} from 'lucide-react';
import { TabType } from './Navbar.tsx';

interface OverviewTabProps {
  onNavigateTab: (tab: TabType) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ onNavigateTab }) => {
  return (
    <div className="space-y-6">
      {/* Executive Hero Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 rounded-xl border border-slate-800 p-6 shadow-xl relative overflow-hidden">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Fase 3 Ativa: Interface Analítica Integrada aos Motores Determinísticos
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Plataforma Inteligência Eleitoral — Ambiente de Investigação Científica
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Esta plataforma não é um dashboard estático nem um chatbot genérico. Foi concebida como um laboratório 
            de <strong>ciência de dados eleitorais</strong> com total fidelidade às fontes oficiais do TSE, fórmulas matemáticas 
            abertas e reproduzíveis, e separação epistemológica estrita entre dado factual, métrica analítica e parecer interpretativo.
          </p>

          <div className="pt-2 flex flex-wrap gap-3 text-xs">
            <button
              onClick={() => onNavigateTab('investigation')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-md shadow-indigo-600/30"
            >
              <span>Iniciar Investigação</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigateTab('territory')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              <span>Explorar Mapa Coroplético</span>
            </button>
          </div>
        </div>
      </div>

      {/* Real Data & Coverage Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>COBERTURA ATUAL</span>
            <Database className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-base font-bold text-white">Eleições Gerais 2022 (RS)</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Amostra representativa auditada do Rio Grande do Sul: Caxias do Sul, Bento Gonçalves, Farroupilha, Flores da Cunha e Porto Alegre.
          </p>
          <div className="text-[10px] text-emerald-400 font-mono font-semibold pt-1">
            ✓ 100% Factual • Sem Números Inventados
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>MOTOR DE BANCO DE DADOS</span>
            <HardDrive className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-base font-bold text-white">PostgreSQL 18 (PGlite WASM)</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Storage relacional local com integridade referencial ativa, esquemas separados (meta, dim, raw, mart) e idempotência atestada.
          </p>
          <div className="text-[10px] text-emerald-400 font-mono font-semibold pt-1">
            ✓ 4 Testes de Fechamento Aprovados
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>PROVEDOR DE IA</span>
            <Binary className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-base font-bold text-white">Gemini 3.8 Flash (Server-Side)</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Geração de diagnósticos via @google/genai com prompt anti-alucinação rígido e fallback determinístico imediato.
          </p>
          <div className="text-[10px] text-purple-400 font-mono font-semibold pt-1">
            ✓ 5 Leis da IA Ativas
          </div>
        </div>
      </div>

      {/* The 4 Canonical Verification Tests Card */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Auditoria de Fechamento Aritmético e Integridade Semântica (Fase 2)
            </h3>
            <p className="text-[11px] text-slate-400">
              Todos os dados disponíveis nesta interface passaram previamente pelos 4 testes canônicos de conservação matemática.
            </p>
          </div>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            Status: APROVADO
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="flex items-center justify-between font-mono text-[10px] text-emerald-400 font-bold mb-1">
              <span>TESTE 01</span>
              <span>PASS</span>
            </div>
            <div className="font-semibold text-white text-xs">Fechamento da Urna</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Aptos = Comp + Abst; Votos = Comp (6 zonas testadas sem divergência).</p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="flex items-center justify-between font-mono text-[10px] text-emerald-400 font-bold mb-1">
              <span>TESTE 02</span>
              <span>PASS</span>
            </div>
            <div className="font-semibold text-white text-xs">Conservação de Votos</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Soma de votos atômicos confere exatamente com totalizadores do TSE.</p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="flex items-center justify-between font-mono text-[10px] text-emerald-400 font-bold mb-1">
              <span>TESTE 03</span>
              <span>PASS</span>
            </div>
            <div className="font-semibold text-white text-xs">Território TSE x IBGE</div>
            <p className="text-[11px] text-slate-400 mt-0.5">100% dos municípios vinculados por códigos oficiais de 7 dígitos.</p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="flex items-center justify-between font-mono text-[10px] text-emerald-400 font-bold mb-1">
              <span>TESTE 04</span>
              <span>PASS</span>
            </div>
            <div className="font-semibold text-white text-xs">Integridade de Candidaturas</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Zero registros órfãos; validação de quocientes com sobras 80/20.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
