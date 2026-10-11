# Caderno 12 — Base Oficial de Referência, Denominadores e Reconciliação

**Data:** 2026-10-11 · **Contrato vigente:** `1.0.0-2022`
**Estado:** escopo nacional **BLOQUEADO**; nenhuma fonte oficial de denominador validada.

---

## 1. Fontes oficiais descobertas (CKAN/TSE, 2022)

Descoberta reproduzível: `bun run discover:tse 2022` → `data/reference/tse_catalog_2022.json`
(18 datasets, 785 recursos com URL oficial `https://`).

Conjuntos relevantes localizados no Portal de Dados Abertos do TSE:

| dataset_id | Título | Papel |
| :--- | :--- | :--- |
| `resultados-2022` | Resultados - 2022 | votação nominal/partido, detalhe apuração, votação por seção |
| `resultados-2022-boletim-de-urna` | Boletim de Urna | insumo por urna/seção |
| `resultados-2022-arquivos-transmitidos-para-totalizacao` | Arquivos transmitidos para totalização | insumo de totalização |
| `resultados-2022-correspondencias-esperadas-e-efetivadas-1-turno` / `-2-turno` | Correspondências esperadas e efetivadas | candidato a denominador por seção |
| `comparecimento-e-abstencao-2022` | Comparecimento e Abstenção | candidato a denominador de comparecimento |
| `eleitorado-2022` | Eleitorado | denominador de aptos |
| `candidatos-2022` | Candidatos | reconciliação de cargos/candidaturas |

Recurso reconciliável principal (retido, oficial):
`votacao_candidato_munzona_2022.zip` — `https://cdn.tse.jus.br/…/votacao_candidato_munzona_2022.zip`,
SHA-256 `cd44bcc2260c3b7e53c254aa9b03ff989ad7511737d5df9a2b99c78e45eb00ef` (confere com manifesto local).

## 2. Modelo versionado de escopo e denominadores

`src/audit/referenceScope.ts` (puro) + `data/reference/official_scope_2022.json`.

- `OfficialSource`: `{ id, dataset_id, resource_name, url, sha256, obtained, validated, notes }`.
- `ScopeRequirement`: `{ id, resource_id, year, turno, uf, cargo, dimension, key, expected_value, unit, method, source_id, state, notes }`.
- `ReferenceState`: `UNDISCOVERED` | `KNOWN_NO_SOURCE` | `OBTAINED_UNVALIDATED` | `VALIDATED`.
- `ScopeUnit` separa **entidades distintas** (members/UFs/cargos/municípios/zonas/seções) de **valores agregados** (votos) e de **registros** — números semelhantes não são tratados como intercambiáveis.

`validateScope()` rejeita: ids de requisito duplicados; `expected_value` negativo; requisito de
outro ano; `source_id` desconhecido; chaves contraditórias; `VALIDATED` apoiado em fonte não validada;
fonte obtida sem URL. Um escopo vazio nunca autoriza.

## 3. Reconciliação

- `reconcileMemberInventory(scope, observedMembers)` — compara o **conjunto exato** de membros
  (ausentes/inesperados), não apenas a contagem.
- `reconcileReferences(requirements, observed)` — tolerância zero por `(dimensão, chave)`,
  distinguindo `MISSING`, `MISMATCH`, `OK`. Detecta divergência por unidade mesmo quando o total
  coincide.
- `evaluateScopeGate(scope, observedMembers, observedByKey)` — gate conservador: autoriza só quando
  o escopo é internamente válido, **todos** os requisitos `VALIDATED`, todas as fontes validadas,
  inventário exato e reconciliação zero. Autorização por escopo parcial é explicitamente bloqueada.

## 4. Resultado real da execução (`bun run audit:ingestion`, 2022)

```
escopo oficial (1.0.0-2022): BLOCKED
  bloqueios: REQUIREMENTS_NOT_VALIDATED, SOURCES_NOT_VALIDATED, REFERENCE_MISMATCH
  inventário: esperado=29 observado=29 ausentes=0 inesperados=0 complete=true
decisão da cadeia: BLOCKED
```

O **inventário nacional confere** (29/29: 27 UFs + BR + BRASIL). Permanecem bloqueados: requisitos
não validados, fontes oficiais não validadas e 8 referências (cargos + seções) sem denominador obtido.

## 4b. Testes adversariais e positivos

`tests/reference_scope.test.ts` — rejeita: escopo vazio, denominador faltante, membro ausente,
membro inesperado, requisito duplicado, requisito contraditório, referência de outro ano, valor
esperado inválido, fonte desconhecida, `VALIDATED` sem fonte validada, contagem incompatível,
divergência por unidade com total coincidente. **Positivo:** escopo delimitado completo e validado
com inventário exato → `AUTHORIZED`.

## 5. O que está comprovado vs faltante

- **Comprovado por execução:** custódia e SHA-256 do artefato nacional; inventário de 29 membros
  exato; contadores/dedup/estados de erro por membro; gate rejeita todos os cenários incompletos.
- **Comprovado por fonte oficial:** existência e URLs dos datasets de totalização/comparecimento/
  eleitorado/candidatos no CKAN.
- **Não verificado:** denominadores oficiais por UF/cargo/seção (arquivos não obtidos/interpretados);
  layouts oficialmente validados (perfis `ingestion_approved=false`); varredura integral de todos os
  membros.
- **Bloqueado por dependência externa:** obtenção/parse dos arquivos oficiais de totalização e
  comparecimento para denominar a reconciliação.

## 6. Decisão

O escopo nacional permanece **NÃO AUTORIZADO**. Avanço concreto: a cadeia agora declara o escopo
oficial, reconcilia o inventário nacional com resultado exato e prova, por testes, que evidências
incompletas **não** produzem autorização. Falta obter e validar as fontes oficiais de denominador.
