# Caderno 08 — Critérios de Aceite para Transição à Fase 2 e Incertezas Mapeadas

## 1. Respostas Formais aos Critérios de Conclusão da Fase 1

Em estrita conformidade com os objetivos da **Fase 1 (Fundação Científica e Arquitetural)**, as respostas canônicas sem ambiguidade para as sete perguntas fundamentais são:

---

### Pergunta 1: O que a plataforma deve fazer?
**Resposta Canônica:**
A plataforma **Inteligência Eleitoral** é um sistema de investigação e análise política e eleitoral baseado em evidências empíricas, dados oficiais do TSE e métodos reproduzíveis de ciência política. A plataforma:
- Totaliza votações oficiais nominais e de legenda em múltiplos níveis territoriais suportados pela fonte (País, UF, Município, Zona e Seção).
- Harmoniza séries temporais entre eleições gerais e municipais (com compatibilização de códigos municipais TSE-IBGE).
- Calcula métricas científicas consagradas de concentração espacial (HHI Eleitoral, Gini, Quociente de Localização) e volatilidade (Pedersen).
- Audita a mecânica do sistema proporcional (Quociente Eleitoral, Quociente Partidário, distribuição de sobras D'Hondt segundo a legislação de cada ano).
- Fornece fichas de proveniência com hashes criptográficos e fórmulas abertas para cada indicador exibido.
- **Não faz:** Previsões oraculares sem dados, afirmações de causalidade sem desenhos quasi-experimentais de identificação, ou cálculos inventados por LLMs.

---

### Pergunta 2: Quais fontes serão utilizadas?
**Resposta Canônica:**
Fontes primárias oficiais do Tribunal Superior Eleitoral (TSE) disponibilizadas no Portal de Dados Abertos (`dadosabertos.tse.jus.br`) e Repositório de Dados Eleitorais (RDE):
1. `votacao_secao_YYYY_UF.csv` (votação por seção eleitoral).
2. `votacao_candidato_munzona_YYYY_UF.csv` (votação oficial por candidato, município e zona).
3. `detalhe_votacao_secao_YYYY_UF.csv` / `detalhe_votacao_munzona_YYYY_UF.csv` (eleitores aptos, comparecimento, abstenção, brancos e nulos).
4. `consulta_cand_YYYY_UF.csv` (candidatos, números, partidos, federações e situação jurídica do registro).
5. `local_votacao_YYYY.csv` (estabelecimentos e geolocalização dos locais de votação).
6. Tabela oficial de correspondência territorial TSE (5 dígitos) vs. IBGE (7 dígitos).

---

### Pergunta 3: Qual é a unidade de cada registro?
**Resposta Canônica:**
A unidade varia conforme a camada de modelagem, com fronteiras explícitas para impedir dupla contagem:
- **Camada de Seção (Bruta):** A unidade é `(Eleicao, UF, Municipio_TSE, Zona, Secao, Cargo, Numero_Votavel)`. Representa os votos daquele candidato/legenda naquela urna específica.
- **Camada de Candidato por Município/Zona (Agregada Oficial):** A unidade é `(Eleicao, UF, Municipio_TSE, Zona, SQ_CANDIDATO)`.
- **Camada Dimensional de Candidatura:** A unidade é `(Eleicao, SQ_CANDIDATO)`, que é única por pleito.
- **Camada Dimensional de Pessoa:** A unidade é o indivíduo biológico (`id_pessoa`, vinculado por CPF/dados de registro civil), que conecta as diferentes candidaturas de uma carreira política.

---

### Pergunta 4: Como os resultados serão calculados e validados?
**Resposta Canônica:**
- **Cálculo:** Realizado por scripts determinísticos em SQL/Python/TypeScript no ambiente analítico. Fórmulas matemáticas abertas (ex: D'Hondt com piso de 80%/20%, HHI como $\sum s_i^2$). Nenhuma operação aritmética é delegada a modelos de IA.
- **Validação:**
  1. Fechamento de urna: $\text{Votos} \equiv \text{Comparecimento} = \text{Aptos} - \text{Abstenção}$.
  2. Validação cruzada territorial: $\sum \text{Votos por Município} \equiv \text{Total Oficial Estadual publicado pelo TRE/TSE}$.
  3. Reconciliação de cadeiras: $\sum \text{Eleitos} \equiv \text{Cadeiras em disputa}$.
  4. Quarentena automática para discrepâncias superiores a zero.

---

### Pergunta 5: Qual banco é responsável por cada tipo de dado?
**Resposta Canônica:**
- **PostgreSQL Analítico Local:** Responsável pelo Data Warehouse completo, tabelas brutas de seções eleitorais (dezenas de milhões de linhas), tabelas de staging particionadas por ano e UF, execuções de cálculos pesados de índices espaciais e logs profundos de importação.
- **Supabase Remoto (Nuvem):** Responsável por servir a aplicação web com latência sub-segundo, contendo exclusivamente tabelas dimensionais limpas (`dim_*`), projeções consolidadas por município/zona (`mart_*`), métricas pré-calculadas e regras de segurança RLS para acesso seguro.
- **Data Lake de Arquivos:** Responsável por reter os arquivos originais `.zip`/`.csv` imutáveis com seus hashes SHA-256.

---

### Pergunta 6: Como qualquer conclusão poderá ser reproduzida?
**Resposta Canônica:**
- Cada registro projetado e cada indicador analítico carrega um metadado de proveniência apontando:
  - O hash SHA-256 do arquivo fonte oficial TSE.
  - A versão do script de transformação/cálculo no repositório Git.
  - O manifesto de execução em formato JSON (`manifest.json`) com os parâmetros exatos.
- O pipeline de dados é idempotente: ao reexecutar os scripts contra os mesmos arquivos brutos, os bancos geram o mesmo resultado bit a bit.

---

### Pergunta 7: Como o modelo suporta a expansão nacional?
**Resposta Canônica:**
- **Particionamento Nativo:** O PostgreSQL local particiona dados por `ANO_ELEICAO` e `SG_UF`. Cada estado pode ser carregado e recalculado de forma isolada sem bloquear a base.
- **Chaves Canônicas:** A modelagem utiliza os códigos oficiais nacionais do TSE e IBGE, sem IDs arbitrários ou suposições regionais específicas de um único estado.
- **Modularidade de Ingestão:** O sistema de ingestão suporta processamento em lote por estado com pipelines assíncronos.

---

## 2. Incertezas Mapeadas e Mitigações Técnicas

| Incerteza Mapeada | Impacto Técnico | Estratégia de Mitigação na Fase 2 |
| :--- | :--- | :--- |
| **Inconsistência de Encodings Históricos do TSE** | Arquivos pré-2020 usam `ISO-8859-1` e pós-2020 usam `UTF-8`; caracteres acentuados corrompidos em nomes de candidatos. | Inserir módulo de auto-detecção de charset (`chardet` / iconv) no pipeline de leitura por streaming. |
| **Mudanças de Nomenclatura de Colunas entre 2004 e 2024** | O TSE renomeou colunas como `NUMERO_CANDIDATO` para `NR_CANDIDATO` e `CODIGO_MUNICIPIO` para `CD_MUNICIPIO`. | Criar dicionário canônico de mapeamento de esquemas por ano (`schema_tse_YYYY.json`). |
| **Candidaturas com Julgamento Sub Judice Posterior ao Pleito** | Candidatos indeferidos que tiveram votos anulados e posteriormente validados por decisão do TSE/STF alteram a contagem de sobras meses após a eleição. | Manter campos de histórico de retotalização (`dt_geracao_arquivo_tse`) e flags explícitas sobre a situação jurídica do voto na data do arquivo. |
| **Rezoneamento Eleitoral (Mudança de Zonas)** | TREs frequentemente extinguem ou reconfiguram zonas eleitorais entre um pleito e outro. | Adotar o Município (código IBGE) como unidade principal de continuidade histórica, tratando Zonas como unidades jurisdicionais vinculadas a eleições específicas. |
| **LGPD e Anonimização de Dados de Candidatos** | O TSE passou a mascarar o CPF dos candidatos a partir de 2020 (`***123456**`), dificultando a unificação automática da pessoa física histórica. | Implementar algoritmo de correspondência probabilística determinística com chave composta: `(Nome Civil Exato + Data de Nascimento + UF Naturalidade)`. |

---

## 3. Checklist Objetivo de Aceite e Transição para a Fase 2

Para dar início à **Fase 2 (Modelagem Física de Dados e Pipeline de Ingestão)**, os seguintes marcos técnicos devem ser executados em estrita ordem:

- [ ] **Marco 2.1:** Criação da estrutura de diretórios do Data Lake local (`/data/raw/`, `/data/staging/`, `/data/manifests/`).
- [ ] **Marco 2.2:** Criação dos scripts DDL do PostgreSQL local com particionamento por ano e UF para as tabelas `raw` e `dim`.
- [ ] **Marco 2.3:** Criação dos scripts DDL do Supabase com tabelas de projeção `mart_*` e políticas RLS.
- [ ] **Marco 2.4:** Implementação do downloader determinístico com verificação de SHA-256 e gravação de metadados.
- [ ] **Marco 2.5:** Implementação dos parsers de streaming de CSV de alta performance com normalização de codificação e tipagem estrita.
- [ ] **Marco 2.6:** Implementação do motor de validação aritmética (os 4 testes canônicos) antes da promoção de dados para o Data Mart.
- [ ] **Marco 2.7:** Publicação das primeiras projeções harmonizadas (iniciando pelo Rio Grande do Sul - 2018/2022/2024 como benchmark antes da expansão nacional).
