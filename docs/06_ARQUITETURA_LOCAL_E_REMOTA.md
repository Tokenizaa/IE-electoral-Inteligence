# Caderno 06 — Arquitetura de Bancos de Dados: Local (PostgreSQL) e Remoto (Supabase)

## 1. Topologia da Arquitetura de Dados

A plataforma **Inteligência Eleitoral** adota uma arquitetura em duas camadas complementares, evitando o erro de sobrecarregar a camada de aplicação em nuvem com terabytes de boletins de urna brutos, ou tentar executar consultas analíticas complexas e lentas diretamente na interface do usuário.

```
+─────────────────────────────────────────────────────────────────────────────────+
| [CAMADA 0: DATA LAKE IMUTÁVEL DE ARQUIVOS OFICIAIS TSE]                         |
| Arquivos brutos ZIP/CSV preservados (S3/Local Storage), Checksum SHA-256        |
+─────────────────────────────────────────────────────────────────────────────────+
                                        │
                                        │ Leitura por streaming (COPY / Chunked)
                                        ▼
+─────────────────────────────────────────────────────────────────────────────────+
| [CAMADA 1: POSTGRESQL ANALÍTICO LOCAL (DATA WAREHOUSE & PROCESSAMENTO)]          |
| • Storage de alta volumetria (dezenas de milhões de linhas por pleito).         |
| • Particionamento nativo por ANO_ELEICAO e SG_UF.                                |
| • Tabelas de Staging e Dados Brutos Normalizados.                               |
| • Engine de transformações analíticas pesadas (HHI, Sobras, QE, Pedersen).      |
| • Auditoria interna, logs de importação e integridade aritmética.               |
+─────────────────────────────────────────────────────────────────────────────────+
                                        │
                                        │ Pipeline de Publicação / Projeção
                                        │ (Sync Determinístico via pg_dump / API)
                                        ▼
+─────────────────────────────────────────────────────────────────────────────────+
| [CAMADA 2: SUPABASE / CLOUD SQL REMOTO (DATA MART DE SERVIÇO & APLICAÇÃO)]     |
| • Tabelas dimensionais leves e Projeções Pré-Calculadas (Aggregated Marts).     |
| • Tempo de resposta sub-segundo para consultas na Web.                         |
| • Row Level Security (RLS) para controle granular de acesso.                   |
| • NUNCA armazena os 500 milhões de votos brutos de urna linha a linha.           |
| • Armazena séries consolidadas por município, zona, candidato e indicadores.    |
+─────────────────────────────────────────────────────────────────────────────────+
                                        │
                                        ▼
+─────────────────────────────────────────────────────────────────────────────────+
| [CAMADA 3: INTERFACE DE CONSUMO (WEB / API / EXPORTAÇÃO CIENTÍFICA)]            |
+─────────────────────────────────────────────────────────────────────────────────+
```

---

## 2. Divisão de Responsabilidades e Justificativa de Isolamento

| Dimensão | PostgreSQL Analítico Local | Supabase Remoto (Aplicação) |
| :--- | :--- | :--- |
| **Papel Principal** | Armazenamento histórico profundo e processamento analítico | Servir consultas da aplicação web com latência mínima |
| **Volumetria Típica** | 50 a 200 GB (arquivos completos de seções eleitorais de múltiplos estados e pleitos) | 500 MB a 5 GB (tabelas consolidadas, dimensões e métricas) |
| **Granularidade** | Atômica: Seção Eleitoral, Votável, Boletim de Urna | Agregada: Município, Zona Eleitoral, Candidato, Eleição, Métricas |
| **Perfil de Carga** | Escritas em lote (Batch Ingest), JOINS massivos, Window Functions pesadas | Leituras frequentes (High Concurrency Read), filtros indexados |
| **Acesso Externo** | Restrito à equipe de engenharia/análise de dados (rede interna/VPN) | Seguro via HTTPS / API REST / Supabase Auth com RLS |
| **Mutabilidade** | Tabelas raw estritamente `APPEND-ONLY` com particionamento | Projeções atualizadas por pipelines de publicação versionados |

### Justificativa para NÃO duplicar todas as tabelas no Supabase:
1. **Viabilidade Econômica e Operacional:** Uma eleição nacional possui ~500.000 seções eleitorais com ~100 linhas de votos cada em pleitos proporcionais (~50 milhões de linhas por ano em um único estado grande como SP). Subir todas as linhas de seções de todos os pleitos para instâncias padrão de nuvem geraria custos desnecessários de IOPS e storage sem benefício para a navegação típica do usuário.
2. **Eficiência de Consulta:** Agregações em tempo real de 100 milhões de linhas em bancos de aplicação web causam timeouts. Agregações pré-computadas localmente e projetadas no Supabase entregam respostas em menos de 50 milissegundos.

---

## 3. Matriz Canônica de Tabelas por Banco de Dados

| Tabela / Objeto | Existe no PostgreSQL Local? | Existe no Supabase Remoto? | Justificativa |
| :--- | :--- | :--- | :--- |
| `raw_votacao_secao` | **SIM** | **NÃO** | Dados atômicos brutos de cada seção. Somente no local. |
| `raw_detalhe_apuracao_secao` | **SIM** | **NÃO** | Totalizadores atômicos por seção. Somente no local. |
| `stg_tse_ingest_log` | **SIM** | **SIM** (metadados resumidos) | Logs detalhados de ingestão no local; catálogo público de proveniência no remoto. |
| `dim_eleicao` | **SIM** | **SIM** | Tabela dimensional essencial para filtros na UI. |
| `dim_cargo` | **SIM** | **SIM** | Tabela dimensional padrão do sistema. |
| `dim_partido` / `dim_federacao` | **SIM** | **SIM** | Tabela dimensional de agremiações. |
| `dim_municipio_tse_ibge` | **SIM** | **SIM** | Tabela de compatibilização territorial essencial para mapas. |
| `dim_candidatura` | **SIM** | **SIM** | Cadastro de candidatos oficiais para busca e perfil. |
| `mart_votacao_candidato_mun` | **SIM** (calculado) | **SIM** (servido) | Votação consolidada do candidato por município (base de 95% das consultas). |
| `mart_votacao_candidato_zona` | **SIM** (calculado) | **SIM** (servido) | Votação consolidada por zona eleitoral (para grandes centros). |
| `mart_votacao_partido_mun` | **SIM** (calculado) | **SIM** (servido) | Totais de legenda e votos nominais agregados por partido. |
| `mart_indicadores_candidato` | **SIM** (calculado) | **SIM** (servido) | HHI, concentração, variação relativa e perfil territorial. |
| `mart_quocientes_eleicao` | **SIM** (calculado) | **SIM** (servido) | Quociente Eleitoral, Partidário e distribuição de sobras. |

---

## 4. Fluxo Unidirecional de Dados e Condições de Reconstrução

```
[Fontes TSE] ──(Download + SHA256)──▶ [Data Lake Local]
                                             │
                                             ▼
                                  [PostgreSQL Local: RAW]
                                             │
                                             ▼ (Transformações & Validações)
                                  [PostgreSQL Local: MART]
                                             │
                                             ▼ (Publicação Determinística)
                                     [Supabase Remoto]
```

### Regras de Ouro do Fluxo:
1. **Unidirecionalidade Estrita:** Dados fluem exclusivamente do ambiente local/pipeline para o Supabase. Nenhuma operação manual ou de escrita analítica é executada diretamente no banco de produção remoto.
2. **Reconstrução Total sob Demanda (Full Rebuild):**
   - Caso um pipeline ou projeção no Supabase seja corrompido ou uma nova versão metodológica de métrica seja adotada, o banco remoto pode ser completamente esvaziado e reconstruído a partir do PostgreSQL Local executando:
     ```bash
     npm run data:rebuild-projections -- --year=2022 --uf=RS
     ```
3. **Idempotência de Publicação:**
   - A carga no Supabase utiliza operações `UPSERT` baseadas em chaves de negócio exclusivas (ex: `(id_eleicao, sq_candidato, cd_ibge)`), garantindo que republicações parciais não gerem duplicidade nem inconsistência.

---

## 5. Políticas de Segurança e Controle de Acesso (RLS)

- **Supabase Row Level Security (RLS):**
  - **Tabelas de Dados Oficiais e Projeções (`mart_*`, `dim_*`):** Permissão de `SELECT` aberta para `anon` e `authenticated` (dados públicos oficiais). Escritas (`INSERT`, `UPDATE`, `DELETE`) estritamente bloqueadas para qualquer role que não seja o `service_role` da chave de automação do pipeline ETL.
  - **Tabelas de Pesquisas Salvas e Análises de Usuários (futuro):** RLS atrelado ao `auth.uid()`, garantindo isolamento total entre contas.
