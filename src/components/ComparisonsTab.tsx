/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, GitCompare, Scale } from 'lucide-react';

interface ComparisonsTabProps {
  candidates: Array<{ sq_candidato: number; nm_urna_candidato: string }>;
}

export const ComparisonsTab: React.FC<ComparisonsTabProps> = ({ candidates }) => {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <GitCompare className="h-4 w-4" />
              Comparações históricas
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-100">
              Funcionalidade temporariamente bloqueada. A base disponível cobre apenas uma amostra de municípios do RS em 2022.
              Não há duas bases completas e compatíveis para calcular variação histórica de votos ou participação eleitoral.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              A comparação será habilitada quando os dois pleitos tiverem cobertura, cargo, circunscrição, turno,
              universo de votos e denominadores validados e documentados. Nenhum número de exemplo será apresentado como resultado.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-start gap-3">
          <Scale className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div>
            <h2 className="text-lg font-semibold text-white">Distribuição de cadeiras e sobras</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              O motor normativo existe no projeto, mas a interface não executará uma simulação de resultado oficial com a amostra atual.
              O cálculo exige a votação válida completa da circunscrição, o número documentado de vagas e as candidaturas elegíveis
              segundo a regra aplicável à eleição.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Estado: bloqueado por insuficiência de dados. Candidaturas atualmente carregadas: {candidates.length}.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
