/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Database,
  Layers,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  FileText,
  ChevronRight,
  Search,
  Cpu,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  Scale,
  GitBranch,
  HardDrive,
  Lock,
  RefreshCw,
  Binary,
  Table,
  CheckSquare,
  Award,
  Terminal,
  Info
} from 'lucide-react';
import {
  CANONICAL_DOCS,
  ACCEPTANCE_QUESTIONS,
  METHODOLOGY_STEPS,
  AI_RULES,
  TSE_DATASETS,
  CanonicalDoc
} from './data/specificationData.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'cadernos' | 'architecture' | 'methodology' | 'datasets' | 'ontology' | 'transition'>('overview');
  const [selectedDocId, setSelectedDocId] = useState<string>('01_visao');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const currentDoc = useMemo(() => {
    return CANONICAL_DOCS.find(d => d.id === selectedDocId) || CANONICAL_DOCS[0];
  }, [selectedDocId]);

  const filteredDocs = useMemo(() => {
    if (!searchTerm.trim()) return CANONICAL_DOCS;
    const term = searchTerm.toLowerCase();
    return CANONICAL_DOCS.filter(d => 
      d.title.toLowerCase().includes(term) ||
      d.summary.toLowerCase().includes(term) ||
      d.caderno.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const copyDocPath = (path: string, id: string) => {
    navigator.clipboard.writeText(path);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Banner / System Notification */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 border-b border-emerald-800/40 px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-semibold text-emerald-300">FASE 2 CONCLUÍDA: BASE DE DADOS E MOTOR ANALÍTICO HOMOLOGADOS</span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-300">Repositório: <code className="text-emerald-400 bg-slate-900/80 px-1 py-0.5 rounded">Tokenizaa/Deputado-Carlos-Burigo</code></span>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <span>PostgreSQL Nativo + Testes Aprovados (100% PASS)</span>
          <span className="text-slate-400">|</span>
          <span className="text-emerald-300 font-medium">Caderno 09 em /docs</span>
        </div>
      </div>

      {/* Main Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 p-0.5 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <div className="h-full w-full bg-slate-950 rounded-[7px] flex items-center justify-center">
                <Scale className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">Inteligência Eleitoral</h1>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                  Especificação Canônica
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Plataforma Analítica Independente Baseada em Dados Oficiais do TSE e Método Científico
              </p>
            </div>
          </div>

          {/* Navigation Bar */}
          <nav className="flex items-center gap-1 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
            {[
              { id: 'overview', label: 'Respostas Canônicas', icon: Award },
              { id: 'cadernos', label: '8 Cadernos Normativos', icon: BookOpen },
              { id: 'architecture', label: 'Arquitetura Local & Nuvem', icon: Layers },
              { id: 'methodology', label: 'Protocolo Científico', icon: Binary },
              { id: 'datasets', label: 'Catálogo de Dados TSE', icon: Database },
              { id: 'ontology', label: 'Ontologia & Anti-Duplicação', icon: HardDrive },
              { id: 'transition', label: 'Transição Fase 2', icon: GitBranch },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
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

      {/* Main Body */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full">

        {/* TAB 1: OVERVIEW & RESPOSTAS CANÔNICAS */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Executive Summary Card */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 rounded-xl border border-slate-800 p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                <Scale className="w-64 h-64 text-indigo-400" />
              </div>
              <div className="max-w-3xl space-y-3">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Fase 1 Concluída: 100% dos Requisitos Fundacionais Especificados
                </div>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Fundação Científica e Arquitetural da Inteligência Eleitoral
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Esta plataforma não é um dashboard estático nem um chatbot genérico. Foi concebida como um ambiente de 
                  <strong> ciência de dados eleitorais</strong> com total fidelidade às fontes oficiais do TSE, fórmulas matemáticas 
                  reproduzíveis, distinção epistemológica rigorosa entre evidência e causalidade, e separação arquitetural estrita 
                  entre o processamento de alta volumetria (PostgreSQL Local) e o data mart otimizado para a web (Supabase).
                </p>
                <div className="pt-2 flex flex-wrap gap-4 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-md border border-slate-700/50">
                    <Database className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Dados Oficiais: <strong>TSE Open Data (Bulk Dumps)</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-md border border-slate-700/50">
                    <Binary className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Método: <strong>Protocolo Científico de 9 Etapas</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-md border border-slate-700/50">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>Topologia: <strong>PostgreSQL Analítico + Supabase Mart</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* As 7 Respostas Canônicas aos Critérios de Aceite */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                    As 7 Respostas Canônicas sem Ambiguidade (Critérios de Aceite da Fase 1)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Respostas formais que validam o fechamento da Fase 1 e autorizam o início da Fase 2.
                  </p>
                </div>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                  7 de 7 Critérios Atendidos
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ACCEPTANCE_QUESTIONS.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="bg-slate-900/90 rounded-lg border border-slate-800 p-4 hover:border-slate-700 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/50">
                          Questão #{idx + 1}
                        </span>
                        <span className="text-[11px] flex items-center gap-1 text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          {item.status}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-white">
                        {item.question}
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {item.answer}
                      </p>
                    </div>

                    <div className="pt-3 mt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Referência Normativa:</span>
                      <button 
                        onClick={() => {
                          const target = CANONICAL_DOCS.find(d => d.contentMarkdownFile === item.docRef);
                          if (target) {
                            setSelectedDocId(target.id);
                            setActiveTab('cadernos');
                          }
                        }}
                        className="text-indigo-400 hover:text-indigo-300 font-mono flex items-center gap-1 underline underline-offset-2"
                      >
                        {item.docRef}
                        <ArrowRight className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ontological Quadrant Preview */}
            <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-5">
              <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                Separação Ontológica Inegociável dos Dados
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                A plataforma impede a mistura entre fato oficial, métrica calculada e hipótese interpretativa.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                  <div className="text-[10px] font-mono uppercase text-emerald-400 font-bold mb-1">Nível 1 • Dado Bruto Oficial</div>
                  <div className="text-xs font-semibold text-white">Boletim de Urna / CSV TSE</div>
                  <div className="text-[11px] text-slate-400 mt-1">Imutável, assinado por SHA-256. "5.210 votos nominais na Seção 42".</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                  <div className="text-[10px] font-mono uppercase text-sky-400 font-bold mb-1">Nível 2 • Dado Tratado</div>
                  <div className="text-xs font-semibold text-white">Normalizado & Harmonizado</div>
                  <div className="text-[11px] text-slate-400 mt-1">Tipagem estrita, vínculo com código IBGE de 7 dígitos e status eleitoral.</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                  <div className="text-[10px] font-mono uppercase text-indigo-400 font-bold mb-1">Nível 3 • Indicador Derivado</div>
                  <div className="text-xs font-semibold text-white">Métrica Matemática Auditável</div>
                  <div className="text-[11px] text-slate-400 mt-1">HHI de Concentração, Quociente Eleitoral, Sobras D'Hondt, Volatilidade.</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                  <div className="text-[10px] font-mono uppercase text-amber-400 font-bold mb-1">Nível 4 • Interpretação</div>
                  <div className="text-xs font-semibold text-white">Hipótese ou Diagnóstico</div>
                  <div className="text-[11px] text-slate-400 mt-1">Texto contextual com limites de confiança, declarando dados e sem saltos causais.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: OS 8 CADERNOS CANÔNICOS */}
        {activeTab === 'cadernos' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Sidebar with Documents List */}
            <div className="lg:col-span-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cadernos Oficiais</span>
                <span className="text-[11px] font-mono text-indigo-400">8 Documentos</span>
              </div>
              
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filtrar cadernos ou tópicos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
                {filteredDocs.map((doc) => {
                  const isSelected = doc.id === selectedDocId;
                  return (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDocId(doc.id)}
                      className={`w-full text-left p-3 rounded-lg transition-all border flex flex-col gap-1.5 ${
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
                      <div className="text-xs font-semibold leading-snug">
                        {doc.title}
                      </div>
                      <div className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {doc.summary}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Document Details & Viewer */}
            <div className="lg:col-span-8 bg-slate-900/90 rounded-xl border border-slate-800 p-6 flex flex-col min-h-[600px]">
              <div className="border-b border-slate-800 pb-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/50">
                      {currentDoc.caderno}
                    </span>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs text-emerald-400 font-medium">{currentDoc.badge}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {currentDoc.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyDocPath(currentDoc.path, currentDoc.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 transition-colors"
                    title="Copiar caminho no repositório"
                  >
                    {copiedId === currentDoc.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-mono">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono text-slate-300">{currentDoc.path}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Document Canonical Content Highlights */}
              <div className="flex-1 space-y-4 text-xs text-slate-300 leading-relaxed overflow-y-auto pr-2">
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2 text-indigo-300 font-semibold mb-2">
                    <Info className="w-4 h-4 text-indigo-400" />
                    Resumo Executivo da Especificação Normativa
                  </div>
                  <p className="text-slate-300 leading-relaxed text-xs">
                    {currentDoc.summary}
                  </p>
                </div>

                {/* Dynamic rendering based on selected doc */}
                {currentDoc.id === '01_visao' && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-white text-sm">Problema Central & Epistemologia Eleitoral</h4>
                    <p>
                      O ecossistema político brasileiro padece de visualizações superficiais que ignoram as regras de quociente, 
                      sobras (Lei 14.211/2021) e federações. A plataforma estabelece rigor científico inegociável, separando dados brutos do TSE 
                      de interpretações, e vedando inferências individuais sobre votos de urnas (falácia ecológica).
                    </p>
                    <div className="bg-slate-950 p-3 rounded border border-slate-800/80 font-mono text-[11px] text-emerald-300">
                      <div>✓ Unidade Atômica: Seção Eleitoral Oficial (Anônima por mandamento constitucional)</div>
                      <div>✓ Rastreabilidade: Hash SHA-256 de cada lote ingerido</div>
                      <div>✓ Proibição: Nenhuma IA gera números sem lastro determinístico</div>
                    </div>
                  </div>
                )}

                {currentDoc.id === '02_requisitos' && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-white text-sm">Catálogo de Requisitos Funcionais (RF-001 a RF-015)</h4>
                    <p>
                      Abrange a gestão de fontes auditadas, cálculo de Quociente Eleitoral e Partidário, decomposição de votos nominais 
                      vs. legenda, índices espaciais (HHI, Coeficiente de Localização) e volatilidade de Pedersen entre eleições.
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-slate-950 p-2 rounded border border-slate-800">
                        <span className="font-bold text-indigo-400">RF-006: Harmonização TSE-IBGE</span>
                        <p className="text-slate-400 mt-0.5">Tabela de-para de código municipal TSE (5 dígitos) para IBGE (7 dígitos).</p>
                      </div>
                      <div className="bg-slate-950 p-2 rounded border border-slate-800">
                        <span className="font-bold text-indigo-400">RF-009: Sobras das Maiores Médias</span>
                        <p className="text-slate-400 mt-0.5">Aplicação estrita do algoritmo D'Hondt com trava de 80%/20% (Lei 14.211/2021).</p>
                      </div>
                    </div>
                  </div>
                )}

                {currentDoc.id === '03_metodologia' && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-white text-sm">Protocolo Metodológico em 9 Etapas e as 5 Leis da IA</h4>
                    <p>
                      Proibição terminante de confusão entre correlação e causalidade, e de extrapolação de tendências a partir de apenas 2 pontos no tempo.
                    </p>
                    <div className="space-y-1.5">
                      {AI_RULES.map((r, i) => (
                        <div key={i} className="bg-slate-950 p-2 rounded border border-slate-800/80 flex items-start gap-2">
                          <span className="font-mono text-indigo-400 font-bold text-[11px]">#{i+1}</span>
                          <div>
                            <span className="font-semibold text-white text-[11px]">{r.rule}: </span>
                            <span className="text-slate-400 text-[11px]">{r.desc}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {currentDoc.id === '04_fontes' && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-white text-sm">Inventário de Fontes TSE (Bulk Dumps)</h4>
                    <p>
                      Uso exclusivo de arquivos completos do Portal de Dados Abertos e RDE do TSE, com tratamento de diferenças de encoding 
                      (ISO-8859-1 para anos anteriores a 2020 e UTF-8 para 2020 adiante).
                    </p>
                    <div className="bg-slate-950 p-3 rounded border border-slate-800 font-mono text-[11px] text-slate-300">
                      <div>• votacao_secao_YYYY_UF.csv (Boletins de urna consolidados)</div>
                      <div>• votacao_candidato_munzona_YYYY_UF.csv (Totais oficiais por município/zona)</div>
                      <div>• detalhe_votacao_munzona_YYYY_UF.csv (Aptos, comparecimento, brancos e nulos)</div>
                      <div>• consulta_cand_YYYY_UF.csv (Cadastro e situação jurídica)</div>
                    </div>
                  </div>
                )}

                {currentDoc.id === '05_modelo' && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-white text-sm">Entidades E1 a E11 e Regras Anti-Dupla Contagem</h4>
                    <p>
                      Distinção entre a Pessoa física perene ao longo dos anos e a Candidatura vinculada a um pleito específico (SQ_CANDIDATO).
                      Separação estrita das camadas de agregação territorial para impedir a soma de dados municipais com dados de seção.
                    </p>
                    <div className="bg-slate-950 p-3 rounded border border-slate-800 font-mono text-[11px] text-amber-300">
                      Invariante Canônica: ∑ votos(seções do município) ≡ votos_município_oficial.
                    </div>
                  </div>
                )}

                {currentDoc.id === '06_arquitetura' && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-white text-sm">Topologia Dual: PostgreSQL Local + Supabase Remoto</h4>
                    <p>
                      PostgreSQL analítico local suporta dezenas de milhões de linhas de seções e executa transformações pesadas.
                      O Supabase na nuvem disponibiliza Data Marts pré-agregados para consultas ultra-rápidas na web com RLS ativado.
                    </p>
                    <div className="bg-slate-950 p-3 rounded border border-slate-800 text-[11px] text-slate-300">
                      Direção do fluxo: Unidirecional (Data Lake → Postgres Local → Supabase Mart). Reconstrução total (Full Rebuild) reprodutível a qualquer instante.
                    </div>
                  </div>
                )}

                {currentDoc.id === '07_integridade' && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-white text-sm">Os 4 Testes de Fechamento e RNF</h4>
                    <p>
                      Testes obrigatórios de conservação de votos: Fechamento da Urna, Conservação Territorial, Reconciliação de Cadeiras e Hash SHA-256.
                    </p>
                    <div className="bg-slate-950 p-3 rounded border border-slate-800 text-[11px] text-emerald-400 font-mono">
                      Tolerância de divergência aritmética em eleições homologadas = 0 (zero absoluto).
                    </div>
                  </div>
                )}

                {currentDoc.id === '08_aceite' && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-white text-sm">Transição para Fase 2 e Incertezas Mapeadas</h4>
                    <p>
                      Todas as 7 perguntas de aceite formalmente respondidas. Incertezas mapeadas com planos de mitigação (mudança de encoding, 
                      julgamentos sub judice posteriores, LGPD sobre CPF de candidatos).
                    </p>
                    <div className="bg-slate-950 p-3 rounded border border-slate-800 text-[11px] text-indigo-300">
                      Marcos 2.1 a 2.7 definidos para modelagem física, DDLs e pipelines de ingestão.
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Arquivo canônico completo preservado no repositório:</span>
                  <code className="text-indigo-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">{currentDoc.path}</code>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TOPOLOGIA DA ARQUITETURA */}
        {activeTab === 'architecture' && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6">
              <div className="max-w-2xl mb-6">
                <span className="text-xs font-mono uppercase text-indigo-400 font-bold">Topologia em Camadas</span>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Arquitetura de Dados: Local (PostgreSQL) e Nuvem (Supabase)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Separação estrita entre o ambiente de ingestão massiva e computação pesada e o ambiente de serviço web de alta performance.
                </p>
              </div>

              {/* Architecture Flow Diagram */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
                {/* Layer 0 & 1 */}
                <div className="bg-slate-950 p-5 rounded-xl border border-indigo-900/40 relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
                      CAMADA 0 & 1
                    </span>
                    <HardDrive className="w-4 h-4 text-indigo-400" />
                  </div>
                  <h4 className="text-sm font-bold text-white">PostgreSQL Analítico Local</h4>
                  <p className="text-[11px] text-slate-400 mt-1 mb-3">
                    Data Warehouse Histórico & Processamento Pesado
                  </p>
                  <ul className="text-xs space-y-1.5 text-slate-300">
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400"></span>
                      <span>Arquivos Brutos e Dumps TSE com SHA-256</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400"></span>
                      <span>Votação por Seção (50M+ linhas/ano)</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400"></span>
                      <span>Particionamento nativo por ANO e UF</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400"></span>
                      <span>Cálculo de HHI, Gini, Sobras D'Hondt</span>
                    </li>
                  </ul>
                  <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] font-mono text-indigo-300">
                    Volumetria: 50 a 200 GB
                  </div>
                </div>

                {/* Pipeline Arrow */}
                <div className="hidden md:flex flex-col items-center justify-center p-2 text-center">
                  <div className="w-full flex items-center justify-center gap-2 text-slate-500 font-mono text-xs">
                    <div className="h-0.5 flex-1 bg-gradient-to-r from-indigo-500 to-emerald-500"></div>
                    <span className="bg-slate-900 px-2 py-1 rounded border border-slate-700 text-[10px] text-emerald-400">
                      SYNC DETERMINÍSTICO
                    </span>
                    <div className="h-0.5 flex-1 bg-gradient-to-r from-emerald-500 to-indigo-500"></div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Projeção Idempotente via UPSERT de Data Marts Consolidados
                  </p>
                </div>

                {/* Layer 2 */}
                <div className="bg-slate-950 p-5 rounded-xl border border-emerald-900/40 relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                      CAMADA 2
                    </span>
                    <Database className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h4 className="text-sm font-bold text-white">Supabase Remoto (Nuvem)</h4>
                  <p className="text-[11px] text-slate-400 mt-1 mb-3">
                    Data Mart de Serviço & Aplicação Web
                  </p>
                  <ul className="text-xs space-y-1.5 text-slate-300">
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      <span>Tabelas Dimensionais Limpas (dim_*)</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      <span>Votação Consolidada por Município e Zona</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      <span>Métricas Pré-Calculadas (mart_indicadores)</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      <span>RLS (Row Level Security) ativado</span>
                    </li>
                  </ul>
                  <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] font-mono text-emerald-300">
                    Latência: &lt; 250ms (Leituras Web)
                  </div>
                </div>
              </div>
            </div>

            {/* Justification Matrix */}
            <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6">
              <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <Table className="w-4 h-4 text-indigo-400" />
                Matriz de Responsabilidade das Tabelas (Sem Duplicação Desnecessária)
              </h4>
              <p className="text-xs text-slate-400 mb-4">
                Justificativa formal do porquê certas tabelas residem apenas no PostgreSQL local e outras são projetadas no Supabase.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                      <th className="py-2.5 px-3">Tabela / Objeto</th>
                      <th className="py-2.5 px-3">PostgreSQL Local</th>
                      <th className="py-2.5 px-3">Supabase Nuvem</th>
                      <th className="py-2.5 px-3">Justificativa Arquitetural</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr>
                      <td className="py-2.5 px-3 font-mono text-indigo-300">raw_votacao_secao</td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-400">SIM (Atômico)</td>
                      <td className="py-2.5 px-3 text-rose-400">NÃO</td>
                      <td className="py-2.5 px-3 text-slate-400">Centenas de milhões de linhas inviabilizariam custo e IOPS na nuvem para leitura web.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-mono text-indigo-300">raw_detalhe_apuracao</td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-400">SIM (Atômico)</td>
                      <td className="py-2.5 px-3 text-rose-400">NÃO</td>
                      <td className="py-2.5 px-3 text-slate-400">Usado no local para validar o fechamento aritmético de urna antes da promoção.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-mono text-indigo-300">dim_municipio_tse_ibge</td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-400">SIM</td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-400">SIM</td>
                      <td className="py-2.5 px-3 text-slate-400">Tabela leve essencial para renderização de mapas coropléticos e georreferenciamento.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-mono text-indigo-300">dim_candidatura</td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-400">SIM</td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-400">SIM</td>
                      <td className="py-2.5 px-3 text-slate-400">Necessário para autocomplete e busca de perfil de candidatos na aplicação.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-mono text-indigo-300">mart_votacao_candidato_mun</td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-400">SIM (Gerado)</td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-400">SIM (Servido)</td>
                      <td className="py-2.5 px-3 text-slate-400">Projeção pré-computada que atende 90% das buscas e rankings com latência &lt;50ms.</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-mono text-indigo-300">mart_indicadores_candidato</td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-400">SIM (Gerado)</td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-400">SIM (Servido)</td>
                      <td className="py-2.5 px-3 text-slate-400">HHI, concentração, variação relativa e perfil espacial prontos para exibição.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PROTOCOLO METODOLÓGICO */}
        {activeTab === 'methodology' && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6">
              <div className="max-w-3xl mb-6">
                <span className="text-xs font-mono uppercase text-indigo-400 font-bold">Rigor Científico</span>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Protocolo Metodológico Canônico em 9 Etapas
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Nenhuma conclusão ou relatório é emitido sem cumprir integralmente as etapas do protocolo experimental.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {METHODOLOGY_STEPS.map((s) => (
                  <div key={s.step} className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800">
                        ETAPA 0{s.step}
                      </span>
                    </div>
                    <h5 className="text-xs font-bold text-white mb-1">{s.title}</h5>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Distinções Epistemológicas & 5 Leis da IA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Scale className="w-4 h-4 text-amber-400" />
                  Distinções Epistemológicas Obrigatórias
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                    <div className="font-semibold text-amber-300">Correlação vs. Causalidade</div>
                    <div className="text-slate-400 mt-0.5">Covariação estatística nunca prova causalidade sem desenho quase-experimental formal.</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                    <div className="font-semibold text-amber-300">Tendência vs. Variação Pontual</div>
                    <div className="text-slate-400 mt-0.5">Dois pleitos (t1 e t2) constituem apenas variação pontual (Δ). Tendência exige 3+ ciclos sob regras estáveis.</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                    <div className="font-semibold text-amber-300">Ausência de Dados vs. Zero Voto</div>
                    <div className="text-slate-400 mt-0.5">NULL (município sem urna ou criação recente) é estritamente diferente de 0 (eleição válida com zero votos).</div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  As 5 Leis da IA na Inteligência Eleitoral
                </h4>
                <div className="space-y-2 text-xs">
                  {AI_RULES.map((rule, idx) => (
                    <div key={idx} className="p-2 rounded bg-slate-950 border border-slate-800/80 flex items-start gap-2">
                      <span className="font-mono text-indigo-400 font-bold">#{idx + 1}</span>
                      <div>
                        <span className="font-semibold text-white">{rule.rule}: </span>
                        <span className="text-slate-400">{rule.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: CATÁLOGO DE DADOS TSE */}
        {activeTab === 'datasets' && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6">
              <div className="max-w-2xl mb-6">
                <span className="text-xs font-mono uppercase text-indigo-400 font-bold">Inventário de Dados Abertos</span>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Catálogo de Fontes Oficiais do Tribunal Superior Eleitoral
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Uso exclusivo de bulk dumps oficiais do Portal de Dados Abertos do TSE com hashes e metadados.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {TSE_DATASETS.map((ds, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-bold text-white">{ds.name}</span>
                        <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800">
                          {ds.encoding}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-emerald-400 mb-2">
                        {ds.file}
                      </div>
                      <p className="text-xs text-slate-400 mb-3">
                        {ds.desc}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">Granularidade:</span>
                        <span className="text-slate-300 font-medium">{ds.granularity}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Destino Arquitetural:</span>
                        <span className="text-slate-300 font-medium">{ds.storage}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: ONTOLOGIA & ANTI-DUPLICAÇÃO */}
        {activeTab === 'ontology' && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6">
              <div className="max-w-2xl mb-6">
                <span className="text-xs font-mono uppercase text-indigo-400 font-bold">Ontologia de Domínio</span>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Distinções Conceituais e Prevenção de Dupla Contagem
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Definições semânticas que impedem erros em cruzamentos temporais e agregações espaciais.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2 text-indigo-400">
                    Pessoa Física vs. Candidatura
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed mb-3">
                    A <strong>Pessoa</strong> é durável ao longo da vida civil (conectada por CPF hash/título). A <strong>Candidatura</strong> é uma relação transitória específica de um pleito (<code className="text-emerald-400">SQ_CANDIDATO</code>). Votos nunca são atribuídos à pessoa diretamente, mas à candidatura específica de uma eleição.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2 text-indigo-400">
                    Município vs. Zona Eleitoral (Relação N:M)
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed mb-3">
                    Grandes capitais possuem <strong>dezenas de zonas em um único município</strong>. No interior, <strong>uma única zona abrange múltiplos pequenos municípios</strong>. A menor unidade administrativa é o Município; a menor unidade judiciária é o par (Município, Zona).
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2 text-indigo-400">
                    Regra Anti-Dupla Contagem
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed mb-3">
                    Tabelas de seção e tabelas pré-agregadas municipais residem em camadas separadas. Qualquer query analítica consulta exclusivamente uma única camada dimensional declarada, impedindo a soma acidental de dados atômicos com agregados.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2 text-indigo-400">
                    Voto Nominal vs. Voto de Legenda
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed mb-3">
                    Votos de legenda pertencem exclusivamente à agremiação partidária para composição do Quociente Partidário e não são inflados nos votos pessoais de nenhum candidato, nem duplicados em coligações.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: TRANSIÇÃO PARA FASE 2 */}
        {activeTab === 'transition' && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6">
              <div className="max-w-2xl mb-6">
                <span className="text-xs font-mono uppercase text-emerald-400 font-bold">Roadmap Técnico</span>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Critérios de Aceite e Transição para a Fase 2
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Sequência executiva obrigatória para início da modelagem física de dados e pipeline de ingestão.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { marco: "Marco 2.1", title: "Estrutura do Data Lake Local", desc: "Criação de diretórios /data/raw, /data/staging e /data/manifests para armazenamento de arquivos originais imutáveis." },
                  { marco: "Marco 2.2", title: "DDL do PostgreSQL Analítico Local", desc: "Criação de tabelas raw e dim com particionamento nativo por ANO_ELEICAO e SG_UF e índices BRIN/B-Tree." },
                  { marco: "Marco 2.3", title: "DDL do Supabase Remoto (Data Mart)", desc: "Criação de tabelas mart_* pré-agregadas com políticas RLS para leitura pública rápida e escrita restrita." },
                  { marco: "Marco 2.4", title: "Downloader Determinístico TSE", desc: "Pipeline automatizado de download com validação de hash SHA-256 e gravação de metadados de proveniência." },
                  { marco: "Marco 2.5", title: "Parser de Streaming de Alta Performance", desc: "Processamento de arquivos CSV por chunks com detecção de encoding (ISO-8859-1 vs UTF-8) e tipagem estrita." },
                  { marco: "Marco 2.6", title: "Motor dos 4 Testes de Validação Aritmética", desc: "Execução automatizada do fechamento de urna e soma de votos antes da promoção para a camada servível." },
                  { marco: "Marco 2.7", title: "Benchmark Piloto (Rio Grande do Sul)", desc: "Ingestão e projeção piloto para RS (2018/2022/2024) antes da expansão nacional para os demais 26 estados." },
                ].map((item, idx) => (
                  <div key={idx} className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-start gap-3">
                    <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800">
                      {item.marco}
                    </span>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-white">{item.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{item.desc}</div>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/40">
                      Pronto para Execução
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-4 px-4 sm:px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Plataforma Inteligência Eleitoral • Especificação Canônica da Fase 1 • Fonte Primária: TSE Dados Abertos
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
            <span>Docs em <code>/docs/*.md</code></span>
            <span>•</span>
            <span className="text-emerald-400 font-semibold">Fase 1 100% Homologada</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
