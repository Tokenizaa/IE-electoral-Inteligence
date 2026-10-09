# Plataforma Inteligência Eleitoral — Índice Canônico da Fundação Científica e Arquitetural (Fase 1)

**Versão da Especificação:** 1.0.0-PROD-SPEC  
**Status:** Canônico / Aprovado para Transição para Fase 2  
**Repositório Base:** `Tokenizaa/Deputado-Carlos-Burigo` (Concepção Universal e Neutra)  
**Fonte Oficial Primária:** Tribunal Superior Eleitoral (TSE) — Portal de Dados Abertos  

---

## 1. Estrutura Canônica de Documentos

A Fundação Científica e Arquitetural da plataforma **Inteligência Eleitoral** é documentada através dos seguintes 8 cadernos de especificação normativa:

| Caderno | Documento | Finalidade e Conteúdo |
| :--- | :--- | :--- |
| **01** | [`01_VISAO_DO_PRODUTO.md`](./01_VISAO_DO_PRODUTO.md) | Problema, missão, usuários, casos de uso, fronteiras analíticas, distinção ontológica entre dado oficial, dado tratado, indicador e interpretação, e limites das conclusões. |
| **02** | [`02_REQUISITOS_FUNCIONAIS_E_CASOS_DE_USO.md`](./02_REQUISITOS_FUNCIONAIS_E_CASOS_DE_USO.md) | Catálogo de requisitos funcionais, perguntas eleitorais investigáveis, suporte a recortes temporais/espaciais e requisitos estritos de reprodução e auditoria. |
| **03** | [`03_PROTOCOLO_METODOLOGICO_CIENTIFICO.md`](./03_PROTOCOLO_METODOLOGICO_CIENTIFICO.md) | Protocolo metodológico em 9 etapas, distinção estrita entre correlação e causalidade, tendência vs. variação espúria, tratamento de nulo vs. zero, e barreiras contra alucinações de IA. |
| **04** | [`04_CATALOGO_DE_FONTES_OFICIAIS_TSE.md`](./04_CATALOGO_DE_FONTES_OFICIAIS_TSE.md) | Inventário detalhado dos conjuntos de dados abertos do TSE (resultados, candidaturas, seções, eleitorado, prestação de contas), granularidades reais, limites e rotas de acesso. |
| **05** | [`05_MODELO_CONCEITUAL_DE_DADOS.md`](./05_MODELO_CONCEITUAL_DE_DADOS.md) | Entidades conceituais, chaves de negócio, cardinalidades, prevenção de dupla contagem e distinção entre Pessoa, Candidatura, Território e Registro de Voto. |
| **06** | [`06_ARQUITETURA_LOCAL_E_REMOTA.md`](./06_ARQUITETURA_LOCAL_E_REMOTA.md) | Arquitetura de duas camadas: PostgreSQL Analítico Local (storage histórico e processamento pesado) e Supabase (projeções servíveis, RLS e consumo na web). |
| **07** | [`07_REGRAS_DE_INTEGRIDADE_E_PROVENIENCIA.md`](./07_REGRAS_DE_INTEGRIDADE_E_PROVENIENCIA.md) | Linhagem de dados ponta a ponta, hashes criptográficos SHA-256, reconciliação aritmética oficial (BU e Totais TSE) e requisitos não funcionais. |
| **08** | [`08_CRITERIOS_DE_ACEITE_FASE_2.md`](./08_CRITERIOS_DE_ACEITE_FASE_2.md) | Respostas formais aos critérios de encerramento da Fase 1, incertezas residuais e checklist vinculante para o início da modelagem e ingestão na Fase 2. |
| **Audit** | [`AUDITORIA_FASE_2_ESTADO_E_BLOQUEIOS.md`](./AUDITORIA_FASE_2_ESTADO_E_BLOQUEIOS.md) | Auditoria do estado real de partida da Fase 2, bloqueios superados e reuso do repositório base. |
| **09** | [`09_EVIDENCIAS_E_RELATORIO_FASE_2.md`](./09_EVIDENCIAS_E_RELATORIO_FASE_2.md) | Relatório canônico de evidências empíricas da Fase 2: testes executados, motores validados e publicações remotas. |

---

## 2. Documentação da Fase 3

A interface analítica está em implementação, com cobertura parcial. A auditoria corretiva independente está registrada em [AUDITORIA_FASE_3_ESTADO_E_BLOQUEIOS.md](./AUDITORIA_FASE_3_ESTADO_E_BLOQUEIOS.md). A aba **Fontes TSE** consulta dinamicamente o catálogo CKAN oficial por ano e permite baixar recursos com hash e validação estrutural inicial; esses arquivos ainda não são promovidos automaticamente à camada analítica. O mapa, a comparação histórica e a simulação proporcional permanecem bloqueados até haver dados oficiais completos e compatíveis. O HHI é exploratório na amostra, sem classe qualitativa não validada; percentuais municipais e partidários são proporções dos registros amostrais, não totais oficiais. SHA-256 identifica o arquivo baixado, mas não comprova sozinho autenticidade externa ou completude eleitoral. A aprovação técnica da CI não conclui a Fase 3.

## 3. Princípios Norteadores Intransponíveis

1. **Primazia da Verdade Oficial Verificável:** Nenhum número entra no sistema sem vínculo rastreável ao arquivo de origem publicado pelo TSE (com SHA-256 e timestamp oficial).
2. **Separação Ontológica Inegociável:**
   - **Dado Bruto Oficial:** O que o TSE registrou no Boletim de Urna ou no arquivo consolidado.
   - **Dado Tratado/Normalizado:** O dado limpo com tipos estritos e códigos padronizados (IBGE, TSE).
   - **Indicador Metodológico:** O resultado de uma fórmula matemática/estatística publicada e auditável (ex: HHI, Quociente Eleitoral, Sobras).
   - **Interpretação/Diagnóstico:** A hipótese explicativa formulada pelo pesquisador ou contextualizada pela IA com limites de confiança declarados.
3. **Imutabilidade e Reprodutibilidade Total:** Todo cálculo deve gerar o mesmo resultado quando reexecutado com o mesmo código e mesma base, sem variabilidade estocástica.
4. **Respeito à Granularidade Real:** Nunca inferir resultados de urna/seção a partir de agregados municipais, nem mascarar a agregação territorial.
