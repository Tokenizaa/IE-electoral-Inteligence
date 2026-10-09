# Caderno 07 — Regras de Integridade, Proveniência e Requisitos Não Funcionais

## 1. Princípios de Integridade e Linhagem de Dados (Data Lineage)

Na plataforma **Inteligência Eleitoral**, cada número ou indicador exibido possui uma linhagem ininterrupta de custódia que liga a tela do usuário ao arquivo bruto original fornecido pela Justiça Eleitoral.

---

## 2. As Quatro Camadas de Verificação de Integridade Aritmética

Antes de qualquer tabela agregada ser promovida a dado disponível para uso, o pipeline de dados executa quatro testes matemáticos canônicos:

```
+─────────────────────────────────────────────────────────────────────────────+
| TESTE 1: FECHAMENTO DA URNA (BOLETIM DE URNA)                               |
| Comparecimento + Abstenção == Eleitores Aptos                               |
| Votos Nominais + Legenda + Brancos + Nulos + Anulados == Comparecimento     |
+─────────────────────────────────────────────────────────────────────────────+
                                      │ PASS
                                      ▼
+─────────────────────────────────────────────────────────────────────────────+
| TESTE 2: CONSERVAÇÃO DE VOTOS POR AGREGAÇÃO TERRITORIAL                     |
| ∑ Votos(Seções do Município) == Total Oficial Municipal do TSE              |
| ∑ Votos(Municípios da UF) == Total Oficial Estadual do TSE                  |
+─────────────────────────────────────────────────────────────────────────────+
                                      │ PASS
                                      ▼
+─────────────────────────────────────────────────────────────────────────────+
| TESTE 3: CONSISTÊNCIA DE QUOCIENTES E DISTRIBUIÇÃO DE CADEIRAS              |
| ∑ Vagas Eleitas (QP Direto + Sobras) == Total de Cadeiras em Disputa        |
+─────────────────────────────────────────────────────────────────────────────+
                                      │ PASS
                                      ▼
+─────────────────────────────────────────────────────────────────────────────+
| TESTE 4: HASH DE PROVENIÊNCIA & ASSINATURA DE METADADOS                     |
| Registro de SHA-256 do arquivo fonte, timestamp e versão do algoritmo       |
+─────────────────────────────────────────────────────────────────────────────+
```

### Regra de Tolerância de Divergência:
- A tolerância para votos nominais, votos válidos e comparecimento oficial em eleições já homologadas é de **exatamente 0 (zero)**.
- Qualquer discrepância em relação ao total publicado nos boletins oficiais do TSE impede a publicação do lote e dispara alerta de integridade no pipeline.

---

## 3. Especificação dos Requisitos Não Funcionais (RNF)

### RNF-001: Integridade e Consistência de Dados
- **Restrições de Chave:** Nenhuma tabela do PostgreSQL local ou Supabase remoto poderá conter dados órfãos. Chaves estrangeiras ativas e restrições `CHECK` para campos numéricos de votos (`votos >= 0`).
- **Validação de Schema:** Todo arquivo CSV ingerido deve passar por validação estrita de cabeçalho e tipagem de dados. Registros malformados são desviados para tabela de quarentena com o número exato da linha do arquivo fonte.

### RNF-002: Segurança e Controle de Acesso
- **Isolamento de Credenciais:** As chaves de serviço do Supabase (`service_role`) e conexões locais do PostgreSQL residem exclusivamente no backend / ambiente de ETL e nunca são expostas ao frontend.
- **Proteção RLS:** As tabelas do banco de aplicação operam sob Row Level Security (RLS) habilitado com regras explícitas.
- **Conformidade com LGPD:** Dados de candidatos sensíveis (como CPF pessoal do candidato) são tratados com hash ou máscara conforme a prática oficial do TSE desde 2020. O sigilo do voto individual é preservado por construção, visto que o dado primário oficial do TSE já é agregado por seção (mínimo de dezenas/centenas de eleitores).

### RNF-003: Desempenho de Consultas (Performance)
- **Latência de UI:** Consultas realizadas na aplicação web (busca de candidato, visualização de mapa municipal, gráficos de séries temporais) devem responder em **tempo inferior a 250 ms** sob conexões típicas.
- **Estratégia de Indexação:** Índices B-Tree compostos em `(id_eleicao, sq_candidato)`, `(id_eleicao, cd_ibge)` e índices BRIN ou particionamento por ano/UF em tabelas históricas volumosas.
- **Pré-agregação:** Relatórios de ranking municipal e mapas não calculam somas em 500 mil seções sob demanda; consultam projeções pré-computadas na camada `mart`.

### RNF-004: Escalabilidade para Cobertura Nacional
- **Suporte aos 26 Estados e DF:** A arquitetura suporta os 5.570 municípios brasileiros e mais de 150 milhões de eleitores aptos.
- **Armazenamento Particionado:** No PostgreSQL local, a tabela de resultados de seção é particionada por `ANO_ELEICAO` e subparticionada por `SG_UF` (ex: `raw_votacao_secao_2022_rs`, `raw_votacao_secao_2022_sp`), permitindo carregar ou reprocessar estados específicos de forma independente sem bloquear o restante do banco.

### RNF-005: Observabilidade e Tratamento de Falhas
- **Logs Estruturados de Importação:** Toda execução de carga gera um registro com:
  - Timestamp de início e término.
  - Contagem de linhas brutas lidas.
  - Contagem de linhas inseridas/atualizadas.
  - Taxa de transferência (linhas/segundo).
  - Alertas de linhas com caracteres inválidos ou campos nulos inesperados.
- **Transacionalidade de Cargas:** Ingestões em nível de lote (*batch*) utilizam transações atômicas: se a validação aritmética falhar ao final do estado/pleito, o lote é revertido (`ROLLBACK`).

### RNF-006: Versionamento de Fontes e Transformações
- **Repositório de Metadados:** Cada conjunto de dados no Data Lake local armazena:
  - Arquivo: `votacao_secao_2022_RS.zip`
  - Metadado complementar: `votacao_secao_2022_RS.meta.json` contendo `{"sha256": "...", "download_url": "...", "download_date": "...", "source_etag": "..."}`.
- **Código Versionado:** Toda função ou view de cálculo de indicadores (ex: fórmula de sobras) está sob versionamento semântico no Git (`Tokenizaa/Deputado-Carlos-Burigo`).

### RNF-007: Recuperação e Reprocessamento (Idempotência)
- O pipeline de dados é puramente declarativo e reproduzível. Se toda a base de dados do PostgreSQL for deletada, o reprocessamento a partir dos arquivos brutos salvos no Data Lake recria o estado completo de dados e as projeções do Supabase de maneira idêntica.

### RNF-008: Testabilidade e Manutenção
- **Suíte de Testes Automatizados:** Testes unitários para funções de cálculo eleitoral (QE, QP, D'Hondt, HHI) utilizando casos de teste reais históricos com resultados oficiais homologados pelo TSE (ex: bancada de Deputados Federais do RS em 2022).
- Nenhum script de transformação é aceito sem teste de validação contra a totalização oficial publicada no Diário da Justiça Eleitoral.

---

## 4. Validação contextual e evidência de divergências

As identidades apresentadas acima são regras candidatas, não equações universais para todo arquivo, cargo, turno e estado de totalização. Antes de validar, documentar universo, granularidade, categorias, semântica do layout, versão do resultado oficial e exceções normativas.

- `aptos = comparecimento + abstenção` só deve ser testado quando os campos representam o mesmo universo e referência de totalização.
- Não assumir `nominais + legenda + brancos + nulos + anulados/sub judice = comparecimento` sem comprovar definições, inclusão/exclusão de categorias e unidade da contagem.
- Não comparar soma de linhas de seção com total municipal/estadual sem alinhar eleição, turno, cargo, categoria, território e versão da totalização.
- Não validar distribuição de cadeiras por fórmula genérica sem circunscrição, cargo, magnitude, partidos/federações, situação jurídica dos votos e regra legal aplicável ao pleito.

Cada divergência deve guardar arquivo e SHA-256, layout, parâmetros, chave/grupo afetado, valores comparados, regra aplicada e classificação. Quarentena é para divergência inexplicada, não para universos incompatíveis conhecidos. Nunca alterar dado bruto para forçar fechamento. Limites de desempenho e volumetria são metas até benchmark documentado. Hash do arquivo não prova interpretação correta dos campos; registrar também versões de esquema, código e regra metodológica.
