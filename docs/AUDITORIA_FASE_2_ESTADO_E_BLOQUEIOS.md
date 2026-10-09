# Caderno de Auditoria — Estado Real, Bloqueios e Relação de Projetos (Fase 2)

**Data da Auditoria:** 2026-10-09  
**Status:** Auditado e Validado  
**Branch:** `main` (Branch principal única)  
**Ambiente:** Node.js v22.23.2, TypeScript 7.0, PostgreSQL nativo (PGlite v18.3 WASM)  

---

## 1. Verificação do Estado da Fase 1 e Bloqueios Documentados

A auditoria inicial constatou que a Fase 1 especificou conceitualmente a plataforma nos cadernos `docs/01_...` a `docs/08_...`. No entanto, em conformidade com o princípio metodológico de que **"declarações de conclusão ou modelos conceituais não constituem evidência empírica"**, foram auditados os seguintes bloqueios técnicos concretos que precisavam ser superados:

1. **Inexistência de Tabelas Físicas e Rastreio Atômico:** Nenhuma tabela PostgreSQL existia fisicamente; o estado anterior limitava-se a definições conceituais.
2. **Hipótese de Nomenclatura vs. Realidade do TSE:** Confirmou-se que layouts de arquivos do TSE mudaram significativamente entre ciclos (ex: 2014 usava `NUMERO_CANDIDATO`, 2018/2022/2024 adotaram `NR_CANDIDATO`; codificação transitou de `ISO-8859-1` para `UTF-8`). O pipeline não pode assumir esquemas estáticos universais.
3. **Máscara de CPF por LGPD:** Desde 2020, o TSE anonimiza o CPF do candidato (`***123456**`). A correspondência de indivíduos históricos (`Pessoa`) requer algoritmo determinístico com chave composta desambiguada: `(Nome Civil Completo + Data de Nascimento + UF de Origem)`.
4. **Instabilidade de Zonas Eleitorais:** Zonas eleitorais sofrem frequentes rezoneamentos pelos TREs. O modelo físico adota o Município (código IBGE de 7 dígitos) como âncora geográfica de continuidade longitudinal, mantendo as Zonas como unidades judiciárias vinculadas a pleitos específicos.

---

## 5. Relação com o Repositório `Tokenizaa/Deputado-Carlos-Burigo`

A auditoria analisou o código e as necessidades do repositório base para classificar o que é universal, o que exige adaptação e o que é restrito ao gabinete:

| Componente | Classificação | Destino na Plataforma Inteligência Eleitoral |
| :--- | :--- | :--- |
| **Métricas de Concentração Espacial (HHI)** | Reutilizável | Generalizado para qualquer candidato, partido, cargo e estado. |
| **Tabela de Compatibilização TSE vs. IBGE** | Reutilizável | Expandido de Caxias do Sul/Serra Gaúcha para os municípios do estado e do país. |
| **Cálculo de Quociente e Sobras D'Hondt** | Exige Adaptação | Reformulado com matriz normativa parametrizada por ano (regras pré-2020 vs Lei 14.211/2021). |
| **Agregações Específicas do Candidato Búrigo** | Exige Adaptação | Integrado como caso de teste e benchmark oficial representativo de validação empírica. |
| **Anotações de Gabinete e Metas Políticas** | Exclusivo de Gabinete | **Terminantemente excluído** da plataforma neutra de inteligência eleitoral. |

---

## 3. Fontes Oficiais Inspecionadas vs. Hipóteses

* **Layouts Confirmados:**
  - `consulta_cand_YYYY_UF`: Delimitado por `;`, campos chave `SQ_CANDIDATO`, `NR_CANDIDATO`, `NM_URNA_CANDIDATO`, `CD_CARGO`, `SG_PARTIDO`, `DS_SITUACAO_CANDIDATURA`.
  - `votacao_candidato_munzona_YYYY_UF`: Delimitado por `;`, agregado por `CD_MUNICIPIO`, `NR_ZONA`, `SQ_CANDIDATO`, com contagem `QT_VOTOS_NOMINAIS_VALIDOS`.
  - `detalhe_votacao_munzona_YYYY_UF`: Delimitado por `;`, contendo fechamento com `QT_APTOS`, `QT_COMPARECIMENTO`, `QT_ABSTENCAO`, `QT_VOTOS_BRANCOS`, `QT_VOTOS_NULOS`.
* **Hipóteses Rejeitadas:**
  - *Rejeitada a hipótese de que o comparecimento equivale à soma de votos nominais:* É mandatório incluir votos de legenda, brancos, nulos e votos anulados sub judice para fechar a igualdade com o comparecimento.
  - *Rejeitada a hipótese de que o número de urna identifica unicamente uma pessoa:* Números de urna são reutilizados por diferentes candidatos em pleitos distintos ou até no mesmo pleito em municípios diferentes (ex: número 15123 disputando em municípios diferentes para vereador). A chave é `(id_eleicao, sq_candidato)`.

---

## 4. Disponibilidade dos Bancos de Dados

* **PostgreSQL Local:** Homologado com PostgreSQL 18 nativo em runtime WASM (`@electric-sql/pglite`), garantindo conformidade com ANSI SQL, esquemas (`raw`, `stg`, `dim`, `mart`), chaves estrangeiras, `CHECK constraints`, índices e funções de janela.
* **Supabase Remoto:** Especificado com tabelas de projeção `mart_*` e políticas RLS para consulta com baixa latência na web.
