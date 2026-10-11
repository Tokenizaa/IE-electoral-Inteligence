# Caderno 11 — Auditoria e Consolidação da Cadeia de Ingestão Eleitoral

**Data:** 2026-10-11
**Escopo:** avaliação reproduzível da cadeia de ingestão TSE → reconciliação → decisão de autorização da ingestão analítica.
**Estado:** **Ingestão analítica NÃO AUTORIZADA.**

---

## 1. Objetivo

Produzir uma **avaliação reproduzível** que separe, com evidência observável:

1. o que está **comprovadamente completo**;
2. o que permanece **parcial**;
3. quais **evidências oficiais** ainda faltam.

E derivar **critérios objetivos** para autorizar ou bloquear a ingestão analítica.

> Princípio: registros processados **não** são cobertura comprovada. Sem denominador
> oficial reconciliado, nenhuma conclusão de completude é autorizada.

---

## 2. Método

`scripts/audit-ingestion.ts` (comando `bun run audit:ingestion`) lê cada artefato
**retido** do ano, verifica a rastreabilidade, inspeciona os membros CSV e roda a
varredura auditável de reconciliação (`scanStoredZipMember`), produzindo:

- `data/reports/ingestion_assessment_<ano>.json` — evidência legível por máquina;
- resumo humano no stdout.

A lógica de decisão é pura e testada em `src/audit/ingestionAssessment.ts` e
`tests/ingestion_audit.test.ts`. O harness **não baixa**, **não altera perfis de
layout** e **não promove** dados à camada analítica — apenas observa e relata.

### Como reproduzir

```bash
bun run lint                                  # TypeScript (mesmo comando da CI)
bun run test:ingestion-audit                  # testes da avaliação (fixtures)
bun run audit:ingestion                        # ano 2022, varredura limitada a 20k linhas/membro
AUDIT_MAX_ROWS=0 AUDIT_MEMBERS=AC bun run audit:ingestion   # varredura COMPLETA de um membro
AUDIT_MEMBERS=AC,RR,AP,DF bun run audit:ingestion           # subconjunto de UFs
```

## 1. Evidência real observada (Etapa de diagnóstico)

| Fato | Valor observado |
| :--- | :--- |
| Artefato retido | `40fdcf49-…zip` = `votacao_candidato_munzona_2022.zip` |
| Conjunto TSE | *Resultados - 2022* — "Votação nominal por município e zona" |
| URL de origem | `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip` (host oficial) |
| Tamanho | 580.941.971 bytes (≈554 MiB) |
| SHA-256 | `cd44bcc2260c3b7e53c254aa9b03ff989ad7511737d5df9a2b99c78e45eb00ef` |
| Membros | 29 CSVs = **27 UFs + BR + BRASIL** (+ `leiame.pdf`) |
| Conteúdo descompactado | ≈ 8,60 GB |
| `validation_status` | `DOWNLOADED_HASHED_LAYOUT_REVIEW_REQUIRED` |
| Amostras RS/2022 | `data/raw/*_sample.csv` (7–37 linhas) para o motor analítico |

## 2. Resultado da avaliação reproduzível

Execução `AUDIT_MAX_ROWS=2000 bun run audit:ingestion` (2022):

```
artefatos=1 membros=29 completos=0 parciais=29 faltam_evidencia_oficial=0
autorizados=0 -> decisão da cadeia: BLOCKED
bloqueios: { LAYOUT_NOT_OFFICIALLY_VALIDATED: 28, SCAN_NOT_COMPLETE: 29,
             NO_OFFICIAL_DENOMINATOR: 28, RECONCILIATION_NOT_ZERO_TOLERANCE: 28 }
```

Execução `AUDIT_MAX_ROWS=0 AUDIT_MEMBERS=AC` (varredura **completa** de 1 UF):

```
membros=1 -> scan_status=COMPLETE; bloqueios: LAYOUT_NOT_OFFICIALLY_VALIDATED,
DUPLICATE_SCAN_INCOMPLETE, NO_OFFICIAL_DENOMINATOR, RECONCILIATION_NOT_ZERO_TOLERANCE
```

Observação adicional: `BRASIL.csv` (4.298.078.527 bytes) ultrapassa o limite de
segurança de 3 GiB por membro e é registrado como `PARTIAL_ERROR` com a mensagem
exata do limite — nunca rotulado como sucesso.

## 3. Classificação (o que está completo, parcial e faltante)

| Classe | Contagem | Significado |
| :--- | :--- | :--- |
| **PROVEN_COMPLETE** | **0** | Nenhum membro satisfez todos os critérios. |
| **PARTIAL** | **29** | Artefato/varredura insuficientes (varredura limitada; dedup truncada em UF grande; 1 erro de limite). |
| **MISSING_OFFICIAL_EVIDENCE** | 0 | Nenhum membro reuniu os pré-requisitos para ser bloqueado **apenas** por falta de insumo oficial. |

**Comprovadamente completo:** apenas a *custódia do artefato bruto* — presença do
arquivo, `SHA-256` conferido contra o manifesto, URL em host oficial e ano
coerente (`VERIFIED_LOCAL_HASH`). Isso **não** é cobertura eleitoral comprovada.

**Parcial:** processamento por membro (contadores, deduplicação, estados de erro).
Faltam: varredura integral de cada membro, chave de deduplicação não truncada e
invariantes consistentes em todos os membros.

**Evidência oficial ainda ausente (bloqueios de autorização):**
- **`LAYOUT_NOT_OFFICIALLY_VALIDATED`** — os perfis em `tseLayoutRegistry.ts` são
  assinaturas de amostra (`ingestion_approved: false`); não há catálogo oficial
  validado por ano/eleição/UF.
- **`NO_OFFICIAL_DENOMINATOR`** — sem arquivos oficiais de totalização
  (BU/Totais TSE) não há denominador para reconciliar contagens.
- **`RECONCILIATION_NOT_ZERO_TOLERANCE`** — cobertura não reconciliada com
  tolerância zero contra fonte oficial.
- **`SCAN_NOT_COMPLETE` / `DUPLICATE_SCAN_INCOMPLETE`** — varredura integral e
  deduplicação exaustiva ainda não realizadas.

## 4. Critérios objetivos de autorização da ingestão analítica

`decideAuthorization()` só retorna **AUTHORIZED** quando **todos** forem verdadeiros:

1. `traceability_verified` — arquivo confere com manifesto, host oficial, ano correto.
2. `layout_officially_validated` — perfil de layout **oficialmente** aprovado.
3. `scan_status === 'COMPLETE'` — varredura consumiu o membro por inteiro.
4. `duplicate_scan_complete` — chave completa e não truncada.
5. `counter_invariants_ok` — `records_read = aceitos+rejeitados+inválidos+truncados`.
6. `official_denominator_present` — **todo** o conjunto obrigatório de
   `(dimensão, chave)` declarado possui denominador oficial (`expected_count !== null`).
7. `reconciled_zero_tolerance` — **todo** o conjunto obrigatório reconcilia `COMPLETE`.

### Contrato de cobertura obrigatória (correção pós-auditoria)

`evaluateCoverage(coverage, required)` exige um **conjunto explícito** de
`CoverageRequirement { dimension, key }`. A autorização **nunca** é concedida por um
subconjunto de referências:

- conjunto obrigatório **vazio** ⇒ `denominator_complete = false` (não se afirma
  completude sem escopo declarado);
- referência **ausente** ⇒ `missing_entries`;
- referência **presente sem denominador** (`expected_count === null`) ⇒ `null_denominators`;
- referência **com denominador mas status ≠ COMPLETE** ⇒ `incomplete`.

Regressão em `tests/ingestion_audit.test.ts` (bloco 6) prova que um relatório com
apenas **parte** dos denominadores exigidos não satisfaz cobertura, mesmo com os
dados presentes batendo. Hoje o harness declara `required_coverage = []` (não há
escopo oficial publicado), então **nenhum** membro é autorizado → decisão **BLOCKED**.

## 5. Limitações explícitas

- A avaliação atual é **limitada** por `AUDIT_MAX_ROWS`; não afirma completude.
- `BRASIL.csv` acima do limite de membro exige reprocessamento com limite elevado
  consciente ou leitura offline.
- Nenhuma malha geográfica, RLS remoto, publicação Supabase ou cobertura nacional
  foi validada aqui.
- SHA-256 confere arquivo↔manifesto; **não** compara com a publicação oficial
  independente do TSE.

## 6. Conclusão

A cadeia de ingestão é **executável, observável e auditável** de ponta a ponta
sobre um artefato nacional retido, com contadores consistentes e estados de erro
honestos. Contudo, **a ingestão analítica permanece NÃO AUTORIZADA**: faltam
denominadores oficiais, perfis de layout oficialmente validados e reconciliação
com tolerância zero. A conclusão só muda quando os sete critérios da seção 4 forem
demonstrados com evidência oficial.
