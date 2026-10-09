/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Cpu,
  Sparkles,
  Download,
  Copy,
  Check,
  ShieldAlert,
  HelpCircle,
  FileText,
  Lock,
  Database,
  ArrowRight
} from 'lucide-react';
import { CandidateItem, AIReportResponse } from '../api/types.ts';
import { ApiClient } from '../api/client.ts';

interface AIReportsTabProps {
  candidates: CandidateItem[];
  selectedCandidateSq: number;
}

export const AIReportsTab: React.FC<AIReportsTabProps> = ({
  candidates,
  selectedCandidateSq
}) => {
  const [selectedSq, setSelectedSq] = useState<number>(selectedCandidateSq);
  const [question, setQuestion] = useState<string>(
    'Qual é a estrutura territorial e o grau de concentração de votos da candidatura?'
  );
  const [report, setReport] = useState<AIReportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const predefinedQuestions = [
    'Qual é a estrutura territorial e o grau de concentração de votos da candidatura?',
    'A candidatura depende criticamente de um único município para sua sustentação eleitoral?',
    'Como o desempenho da candidatura se relaciona com o Quociente Eleitoral estadual?'
  ];

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const data = await ApiClient.generateAIReport({
        questao_analitica: question,
        sq_candidato: selectedSq,
        id_eleicao: '2022_1T_GERAL'
      });
      setReport(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyText = () => {
    if (!report) return;
    const text = `
${report.titulo}
Data: ${report.timestamp}
Modelo: ${report.modelo_ia_utilizado}
Status: ${report.status_ia}

1. RESUMO EXECUTIVO:
${report.resumo_executivo}

2. DIAGNÓSTICO TERRITORIAL:
${report.diagnostico_territorial}

3. ANÁLISE INSTITUCIONAL:
${report.analise_institucional}

4. CONCLUSÃO PROPORCIONAL:
${report.conclusao_proporcional}

LIMITAÇÕES EPISTEMOLÓGICAS:
${report.limitacoes_e_epistemologia.join('\n')}
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_evidencias_${selectedSq}_2022.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Control & Query Formulation Card */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold text-white uppercase tracking-wider">
            Geração de Relatório de Inteligência Assistido por IA
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          A IA recebe as evidências numéricas disponíveis como contexto para redação e síntese. A saída não é uma fonte independente nem uma validação dos dados; revise números e interpretações antes de utilizá-los.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-slate-400 text-[11px] mb-1 font-mono">Candidatura Investigada:</label>
            <select
              value={selectedSq}
              onChange={(e) => setSelectedSq(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              {candidates.map(c => (
                <option key={c.sq_candidato} value={c.sq_candidato}>
                  {c.nm_urna_candidato} ({c.sg_partido})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-slate-400 text-[11px] mb-1 font-mono">Questão de Investigação:</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Suggested Quick Questions */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
          <span className="text-[11px] text-slate-500 font-mono">Sugestões:</span>
          {predefinedQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => setQuestion(q)}
              className="text-[11px] px-2.5 py-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Processando Evidências...</span>
              </>
            ) : (
              <>
                <Cpu className="w-4 h-4" />
                <span>Gerar Relatório Científico</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Generated Report Output */}
      {report && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-6">
          {/* Report Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                  report.status_ia === 'GERADO_COM_SUCESSO' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                }`}>
                  {report.status_ia === 'GERADO_COM_SUCESSO' ? 'IA com contexto estruturado' : 'Relatório Determinístico (amostra)'}
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs text-slate-400 font-mono">{report.modelo_ia_utilizado}</span>
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">{report.titulo}</h3>
              <p className="text-xs text-indigo-400 font-mono mt-0.5">Questão: "{report.pergunta_investigacao}"</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyText}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
              </button>
              <button
                onClick={handleExportJson}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Exportar JSON</span>
              </button>
            </div>
          </div>

          {/* Section 1: Executive Summary */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 font-mono">
              1. Resumo Executivo
            </h4>
            <p className="text-xs text-slate-200 leading-relaxed bg-slate-950 p-4 rounded-lg border border-slate-800">
              {report.resumo_executivo}
            </p>
          </div>

          {/* Section 2: Territorial Diagnostic */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 font-mono">
              2. Diagnóstico Territorial e Dispersão Espacial
            </h4>
            <p className="text-xs text-slate-200 leading-relaxed bg-slate-950 p-4 rounded-lg border border-slate-800">
              {report.diagnostico_territorial}
            </p>
          </div>

          {/* Section 3: Institutional & Proportional Rules */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-mono">
              3. Análise Institucional e Mecânica Proporcional
            </h4>
            <p className="text-xs text-slate-200 leading-relaxed bg-slate-950 p-4 rounded-lg border border-slate-800">
              {report.analise_institucional}
            </p>
          </div>

          {/* Section 4: Proportional Conclusion */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 font-mono">
              4. Conclusão Proporcional às Evidências
            </h4>
            <p className="text-xs text-slate-200 leading-relaxed bg-slate-950 p-4 rounded-lg border border-slate-800 font-medium">
              {report.conclusao_proporcional}
            </p>
          </div>

          {/* Evidence Bundle Audit Box */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" />
                Evidências Estruturadas Utilizadas na Análise
              </span>
              <span className="text-[10px] font-mono text-emerald-400">Relatório com escopo limitado</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">Votos Apurados:</span>
                <span className="text-white font-bold">{report.evidencias_vinculadas.total_votos_amostra.toLocaleString()}</span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">Índice HHI:</span>
                <span className="text-indigo-300 font-bold">{report.evidencias_vinculadas.hhi}</span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">Quociente Eleitoral:</span>
                <span className="text-emerald-300 font-bold">{report.evidencias_vinculadas.quociente_eleitoral == null ? 'Indisponível — amostra parcial' : report.evidencias_vinculadas.quociente_eleitoral.toLocaleString()}</span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">Top Reduto:</span>
                <span className="text-purple-300 font-bold truncate block">{report.evidencias_vinculadas.top_municipios[0]?.municipio}</span>
              </div>
            </div>

            {/* Anti-Hallucination Disclaimers */}
            <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
              <span className="text-slate-300 font-semibold block">Salvaguardas Epistemológicas e Proveniência:</span>
              {report.limitacoes_e_epistemologia.map((l, i) => (
                <div key={i} className="flex items-start gap-1.5 text-slate-400">
                  <span className="text-indigo-400">•</span>
                  <span>{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
