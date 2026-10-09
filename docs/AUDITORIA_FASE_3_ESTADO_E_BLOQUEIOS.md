# Caderno de Auditoria da Fase 3 — Estado Real, Motores e Contratos Disponíveis

**Data da Auditoria:** 2026-10-09  
**Agente Executor:** Engenheiro Responsável pela Fase 3  
**Repositório:** `Tokenizaa/IE-electoral-Inteligence`  
**Branch:** `main` (Branch principal única)  
**Commit de Referência Auditado:** `a5f21c06970b9f9cf2edecb4dbf0c980a47f76cd`  

---

## 1. Verificação do Histórico e Integridade da Fase 2

O relatório histórico da Fase 2 registra os itens abaixo, mas esta revisão corretiva da Fase 3 não reexecutou a suíte completa da Fase 2 nem verificou novamente todas as evidências de publicação. Portanto, esses itens não devem ser tratados como aprovação independente desta revisão:
1. Commit de referência informado: `a5f21c0`.
2. O relatório anterior declara execução de `tests/phase2_engine.test.ts` com `exit code 0`, incluindo:
   - Inicialização DDL com PGlite.
   - Ingestão de quatro arquivos amostrais do TSE (RS 2022).
   - Idempotência com 36 registros atômicos.
   - Testes de integridade e fechamento de urna.
   - Cálculo de quocientes/sobras e HHI.
   - Publicação remota e manifesto SHA-256.
   
   Os números e resultados acima são afirmações do relatório histórico; sua reprodutibilidade precisa ser confirmada separadamente.

---

## 2. Inventário dos Motores e Componentes Existentes

| Componente | Estado nesta revisão | Observação |
| :--- | :--- | :--- |
| `src/db/database.ts` | Implementado; revalidação pendente | PGlite é usado como banco local; integridade e comportamento transacional precisam de testes reproduzíveis. |
| `src/db/schema.sql` | Implementado; revalidação pendente | O esquema contém tabelas de metadados, dimensões, dados brutos e marts; constraints precisam de execução de testes. |
| `src/db/supabase_schema.sql` | Presente; uso remoto não comprovado | A existência de DDL não comprova implantação, RLS ativa em produção ou conexão remota. |
| `src/ingestion/pipeline.ts` | Implementado; revalidação pendente | A ingestão amostral precisa de testes de idempotência, encoding e proveniência nesta revisão. |
| `src/integrity/integrityEngine.ts` | Implementado; revalidação pendente | A presença do motor não comprova aprovação dos testes sobre dados oficiais completos. |
| `src/electoral/electoralEngine.ts` | Implementado; não liberado para resultados oficiais | A interface bloqueia distribuição proporcional enquanto faltarem dados completos e compatíveis da circunscrição. |
| `src/analytics/analyticalEngine.ts` | Implementado; escopo limitado | HHI e estatísticas derivadas precisam ser interpretados apenas dentro da amostra disponível. |
| `src/sync/publisher.ts` | Presente; publicação não revalidada | A presença do código não comprova manifesto recente ou publicação remota bem-sucedida. |

---

## 3. Estado das Credenciais Remotas e Supabase

* **Disponibilidade Remota:** Não há variáveis de ambiente `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` injetadas no ambiente atual.
* **Decisão Arquitetural:** Em estrito cumprimento ao requisito ("A plataforma não pode depender de uma sessão de desenvolvimento ou de um banco local permanentemente conectado para servir os dados já publicados; não suponha que a configuração remota esteja pronta"), a arquitetura da Fase 3:
  1. Instancia um serviço de banco de dados robusto no backend (Node/Express via `server.ts`) servindo tanto consultas locais autenticadas quanto servindo os Data Marts consolidados.
  2. Implementa contratos REST estritos em `/api/*` consumíveis pelo frontend React sem expor credenciais nem lógica de cálculo na UI.
  3. Prepara a camada servível para espelhar a mesma interface de contrato do Supabase (`dim_*` e `mart_*`).

---

## 4. Consultas Disponíveis e Bloqueios Reais

A aplicação carrega uma amostra parcial de eleições gerais de 2022 no RS, com foco em deputado estadual. A lista de municípios e candidaturas deve ser interpretada como o conteúdo presente nos arquivos amostrais, não como catálogo completo do pleito.

**Consultas limitadas à amostra, sujeitas à validação dos dados:**
- Catálogo de candidaturas e identificação de registros carregados.
- Votos nominais e métricas territoriais derivadas dos registros presentes.
- HHI espacial e ranking municipal, sem extrapolar para votação estadual completa.
- Relatório determinístico com cobertura e limitações explicitadas; IA externa é opcional.

**Bloqueadas ou não validadas para resultados oficiais:**
- Quociente eleitoral estadual e distribuição de cadeiras.
- Comparação histórica entre eleições.
- Conclusões de elegibilidade, piso individual, sobras, bancadas ou desempenho estadual.
- Mapa coroplético: não há malha geográfica oficial validada integrada.
- Integridade, cobertura, reconciliação e representatividade estatística da amostra como um todo não foram revalidadas por esta revisão.

---

## 5. Bloqueios Identificados e Estratégias de Mitigação na Fase 3

| Bloqueio | Causa Raiz | Mitigação Obrigatória na Fase 3 |
| :--- | :--- | :--- |
| **Ausência de Geometrias SVG/GeoJSON de Municípios do RS** | O TSE não disponibiliza polígonos geográficos em seus dumps de votação; apenas tabelas tabulares. | Integrar malha cartográfica vetorial simplificada oficial dos municípios do RS com correspondência estrita por código IBGE de 7 dígitos. |
| **Declaração de Cobertura Parcial vs Nacional** | A base contém amostra parcial do RS em 2022. | Informar claramente o recorte e a ausência de cobertura estadual/nacional comprovada. Não usar rótulos como "100% factual" ou "amostra auditada" sem evidência verificável. |
| **Ausência Potencial de GEMINI_API_KEY no Runtime** | A chave pode estar ausente ou o provedor indisponível. | Gerar relatório determinístico com escopo amostral explícito; não afirmar que todos os dados foram auditados ou que métricas representam o estado inteiro. |

---

## 7. Revisão corretiva independente — 2026-10-09

Após a interrupção do agente por limite de cota, foi feita revisão direta do estado publicado na `main`. O commit que iniciou esta revisão era `63553d7f8a6805f74f6e94c5bc4ba16b0f2fa6f8`.

### Achados confirmados e correções publicadas

| Achado | Correção aplicada | Limite remanescente |
|---|---|---|
| O cliente substituía falhas da API por catálogo fixo de eleição/candidatos. | Removidos os fallbacks locais; falhas agora são propagadas para a interface. | É necessário executar o app e validar os estados de erro. |
| A coleção geográfica continha polígonos esquemáticos descritos como cartografia oficial. | Coleção de geometria vazia até integração de malha validada; interface informa indisponibilidade. | Mapa coroplético real continua bloqueado. |
| A rota comparativa preenchia parâmetros ausentes com valores predefinidos. | Rota comparativa bloqueada com HTTP 409 enquanto não houver dois universos oficiais compatíveis. | Comparação histórica funcional não está disponível. |
| A distribuição proporcional usava contagens de partidos/candidatos codificadas no serviço. | Serviço bloqueia a simulação com amostra parcial, em vez de retornar distribuição fabricada. | QE, QP, sobras e cadeiras exigem dados completos da circunscrição e validação normativa. |
| O serviço declarava comparabilidade válida sem prova de compatibilidade. | Resultado aritmético auxiliar não é mais marcado como comparação histórica válida. | A metodologia precisa ser ligada a duas bases identificadas e compatíveis. |
| Relatórios citavam QE estadual fixo e conclusões eleitorais amplas a partir da amostra. | QE estadual passou a ser `null`; textos de relatório foram limitados à amostra e às suas restrições. | Relatórios ainda precisam de revisão integral e validação empírica. |
| Teste da Fase 3 exigia totais exatos fixos e não protegia contra dados fictícios. | Testes reformulados para verificar limites da amostra, HHI, bloqueios e consistência do relatório sem assumir total eleitoral fixo. | Testes não foram executados neste ambiente; não declarar aprovação até execução. |
| O motor de HHI gravava o marcador literal `SHA256_VERIFIED` como se fosse hash de proveniência. | O indicador agora calcula SHA-256 determinístico a partir dos nomes e hashes das fontes ingeridas; o teste exige 64 caracteres hexadecimais. | O manifesto identifica os arquivos amostrais registrados; não prova completude nem autenticidade externa das fontes. |
| A ingestão marcava arquivos locais como `VERIFICADO` apenas por calcular seu SHA-256. | O estado passou a `HASH_LOCAL_CALCULADO`, deixando explícito que o hash foi calculado localmente, sem comprovação de correspondência com publicação oficial do TSE. | A verificação oficial ainda exige fonte/URL de origem rastreável e comparação independente do conteúdo/hash. |
| O HHI era rotulado com classes baseadas em limiares 0,15/0,25 atribuídos a autores sem validação metodológica documentada. | A classificação qualitativa foi desativada; o HHI é apresentado como indicador exploratório da distribuição de votos na amostra. | Definir e validar universo territorial e limiares antes de comparar classes entre candidatos/eleições. |
| Percentual municipal e métricas partidárias pareciam representar votos válidos/total oficial, embora o CSV contenha apenas candidaturas selecionadas e votos de legenda parciais. | Campo renomeado para `pct_sobre_registros_amostra_mun`; interface e exportação identificam os valores como participação nos registros amostrais, e a visão partidária avisa que não representa total oficial nem dependência real da legenda. | Força eleitoral municipal e composição total de cada partido permanecem indisponíveis sem dados completos de todas as candidaturas e votos válidos.
| Colunas `total_votos_estado` e `pct_votos_validos_estado` guardavam valores derivados da amostra. | Esquema e motor renomeados para `total_votos_amostra` e `pct_votos_validos_amostra`. | Mudança adequada ao banco local criado em memória; qualquer banco persistente preexistente exigiria migração explícita. |

### Novo mecanismo de descoberta e aquisição dinâmica do TSE — 2026-10-09

Foi implementada uma primeira camada reutilizável de aquisição de fontes, sem fixar a plataforma em um único ano ou arquivo:

- `src/ingestion/tseOpenData.ts` consulta a API CKAN do Portal de Dados Abertos do TSE em tempo de execução, pesquisa por ano e classifica recursos pelo nome/descrição publicados.
- A aba **Fontes TSE** permite selecionar ano, tipo de arquivo, filtrar resultados e iniciar o download de um recurso do catálogo. Depois do download de um CSV, a interface também pode percorrer o arquivo em streaming e listar os códigos `CD_CARGO` e descrições `DS_CARGO` observados, com contagem de registros por código.
- `GET /api/tse/catalog?year=2022` lista recursos; `POST /api/tse/download` recebe o identificador do recurso do CKAN e o ano selecionado. A API não aceita uma URL arbitrária fornecida pelo cliente.
- Os downloads são guardados em `var/tse-downloads/<ano>/`, ignorados pelo Git, com manifesto JSON contendo URL oficial, metadados, tamanho e SHA-256.
- Há limite de tamanho configurável (2 GiB por padrão), verificação do host oficial HTTPS em cada redirecionamento, bloqueio de HTML/JSON de erro disfarçado de CSV e validação inicial da assinatura ZIP/cabeçalho tabular.
- A classificação de recurso é heurística. Arquivos de votação podem incluir múltiplos cargos, e o campo `CD_CARGO` precisa ser interpretado a partir do layout de cada ano/arquivo.

**Limite crítico:** essa primeira entrega descobre e baixa arquivos brutos; ela ainda não os incorpora automaticamente às tabelas analíticas nem afirma que o arquivo esteja completo ou autenticado pelo TSE. O estado de validação do manifesto é `DOWNLOADED_HASHED_LAYOUT_REVIEW_REQUIRED`. A próxima fase deve criar adaptadores versionados por tipo/layout/ano, extrair o catálogo real de cargos e turnos, validar os totais com os arquivos de totalização correspondentes e só então publicar um lote como elegível para análise.

### Estado de validação após as correções

- **Código:** alterações gravadas na `main` em commits sequenciais.
- **CI (TypeScript, build e testes de salvaguarda):** TypeScript e build passaram; a suíte de salvaguardas também passou para o commit `360e107f318543f0832724a9baa34ee77beb18b1`; execução: https://github.com/Tokenizaa/IE-electoral-Inteligence/actions/runs/37978378711.
- **Escopo dessa CI:** valida tipagem, build de produção e a suíte `tests/phase3_interface.test.ts`; não comprova cobertura eleitoral completa, reconciliação oficial ou validade científica de todos os indicadores.
- **Cobertura eleitoral:** permanece amostra parcial do RS em 2022, sem evidência de representatividade estatística ou cobertura estadual completa.
- **Geometria territorial:** indisponível; nenhum polígono esquemático deve ser apresentado como mapa oficial.
- **Comparações históricas e distribuição de cadeiras:** bloqueadas até ingestão e validação de dados compatíveis.
- **Fase 3:** **não concluída**. Build e testes básicos passam, mas ainda faltam validação funcional mais ampla, reconciliação independente com fontes oficiais e fechamento dos bloqueios metodológicos.

## 8. Etapa seguinte — registro de layouts versionados e validação estrutural (2026-10-09)

Foi acrescentado `src/ingestion/tseLayoutRegistry.ts`, com perfis explícitos para três cabeçalhos encontrados nos arquivos amostrais existentes do RS/2022: candidaturas, votação nominal por município/zona e detalhe de apuração por município/zona.

- Cada perfil tem identificador versionado, colunas obrigatórias e assinatura do cabeçalho.
- O validador calcula SHA-256 do cabeçalho normalizado e distingue assinatura de amostra conhecida, colunas obrigatórias compatíveis mas não verificadas, layout desconhecido, colunas ausentes e nomes duplicados.
- O endpoint `POST /api/tse/validate-layout` usa o arquivo já baixado e inspecionado; ele não aceita cabeçalhos enviados livremente pelo cliente.
- Os perfis têm `ingestion_approved: false`. Mesmo uma correspondência exata apenas demonstra igualdade estrutural com uma amostra do repositório.
- A CI agora executa `tests/tse_layout_registry.test.ts`.

**Limite importante:** os três perfis são assinaturas de amostras, não um catálogo oficial validado por ano/eleição/UF. Eles não autorizam a promoção dos arquivos para as tabelas analíticas, nem provam cobertura, integridade semântica ou reconciliação de votos. O próximo passo é testar o catálogo CKAN real e obter arquivos oficiais integrais representativos, comparar seus layouts e documentar a evidência antes de aprovar qualquer adaptador de ingestão.

### Verificação ao vivo do catálogo e correções de seleção de recurso

Em 2026-10-09 foi feita uma consulta real à API CKAN do Portal de Dados Abertos do TSE, usando o endpoint público `package_search`. A resposta confirmou metadados de conjuntos com recursos nomeados por ano e também um caso em que o metadado `format` informa `CSV`, mas a URL do recurso termina em `.zip`.

Correções publicadas após essa verificação:

1. O catálogo passou a filtrar o ano no próprio recurso quando o conjunto é genérico, evitando incluir recursos de 2026 numa consulta de 2022 só porque outro recurso do mesmo conjunto menciona 2022.
2. O endpoint de download aplica a mesma validação individual do ano; recursos ambíguos são bloqueados em vez de presumidos compatíveis.
3. A extensão real do caminho HTTPS do recurso prevalece sobre o campo `format` genérico para identificar o contêiner baixado. A divergência continua registrada no manifesto.
4. Foram acrescentados testes para impedir mistura de anos e para o caso de ZIP rotulado como CSV.

A consulta ao catálogo oficial foi testada ao vivo; não foi realizado download integral de um recurso eleitoral real. Os testes de download usam respostas simuladas. A execução da CI que inclui as correções mais recentes ainda precisa terminar com sucesso antes de declarar a etapa tecnicamente verificada.
