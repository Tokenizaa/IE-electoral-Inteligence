# Caderno 02 — Requisitos Funcionais e Casos de Uso

## 1. Visão Geral dos Requisitos Funcionais

A especificação funcional da plataforma **Inteligência Eleitoral** assegura cobertura completa da apuração oficial, da dinâmica institucional e da análise espacial, sem depender de palpites ou aproximações.

---

## 2. Catálogo de Requisitos Funcionais (RF)

### Módulo A: Gestão de Fontes e Ingestão Auditada
- **RF-001 (Catálogo e Metadados de Fontes):** O sistema deve manter registro formal de cada conjunto de dados oficial ingerido, contendo URL oficial do TSE, data/hora do download, checksum SHA-256 do arquivo ZIP/CSV, tamanho em bytes e versão do layout do TSE.
- **RF-002 (Ingestão Idempotente de Resultados por Seção):** O sistema deve processar os arquivos de votação nominal e detalhe de apuração em nível de seção eleitoral (`votacao_secao_YYYY_UF.csv` ou agregados oficiais por município/zona) garantindo que execuções repetidas não dupliquem registros nem alterem totais.
- **RF-003 (Mapeamento de Candidaturas e Partidos):** O sistema deve ingerir e vincular candidaturas oficiais (`consulta_cand_YYYY_UF.csv`), partidos e coligações/federações, registrando número de urna, SQ_CANDIDATO (sequencial único do TSE), CPF mascarado, cargo pleiteado e situação de deferimento (`DS_SITUACAO_CANDIDATURA`).
- **RF-004 (Controle de Situação Jurídica do Voto):** O sistema deve categorizar explicitamente a destinação dos votos: Válido, Válido com Recurso (Sub Judice), Nulo, Branco, Anulado Sub Judice, e Voto em Trânsito.

### Módulo B: Análise de Desempenho e Território
- **RF-005 (Totalização de Votação por Nível Territorial):** O sistema deve permitir consultar a votação absoluta e percentual de qualquer candidato ou partido nos seguintes níveis de agregação estritamente suportados pela fonte:
  1. Nacional (Eleições Presidenciais)
  2. Estadual / Circunscrição Estadual (Governador, Senador, Deputado Federal, Deputado Estadual/Distrital)
  3. Municipal (Prefeito, Vereador; ou agregação de pleitos gerais por município)
  4. Zona Eleitoral (Circunscrição da zona judiciária)
  5. Seção Eleitoral / Local de Votação (Boletins de urna consolidados)
- **RF-006 (Harmonização Territorial TSE x IBGE):** O sistema deve manter tabela de-para oficial entre o código do município do TSE (5 dígitos, ex: `85995` para Caxias do Sul/RS) e o código geográfico oficial do IBGE (7 dígitos, ex: `4305108`), viabilizando cruzamentos espaciais e demográficos sem erro de homônimos.
- **RF-007 (Cálculo de Índices de Concentração Espacial):** O sistema deve calcular para qualquer candidato em uma dada eleição:
  - **Índice de Herfindahl-Hirschman (HHI Eleitoral):** Mede o grau de concentração de votos entre os municípios da circunscrição ($HHI = \sum_{i=1}^{n} s_i^2$, onde $s_i$ é a fração dos votos do candidato obtida no município $i$).
  - **Classificação de Padrão Espacial:** Categorização formal segundo a literatura de ciência política (ex: Dominante-Concentrado, Concentrado-Compartilhado, Disperso-Compartilhado, Fragmentado).
  - **Coeficiente de Localização (QL / Location Quotient):** Razão entre a proporção de votos do candidato no município e a proporção de votos do partido ou da eleição geral naquele mesmo município.

### Módulo C: Dinâmica Institucional e Sistema Proporcional
- **RF-008 (Auditoria do Quociente Eleitoral e Partidário):** O sistema deve recalcular e validar o Quociente Eleitoral (QE) e Quociente Partidário (QP) para eleições de deputados federais, estaduais e vereadores:
  $$QE = \left\lfloor \frac{\text{Total de Votos Válidos (Nominais + Legenda)}}{\text{Número de Cadeiras Disponíveis}} \right\rfloor$$
- **RF-009 (Simulação e Distribuição de Sobras Eleitorais):** O sistema deve aplicar as regras vigentes no ano da eleição para distribuição de sobras pelo método das maiores médias (D'Hondt):
  - Pleitos até 2018: Regra clássica de maiores médias entre todos os partidos que atingiram o QE.
  - Pleito 2022: Regra da Lei 14.211/2021 (exigência de 80% do QE para o partido e votação individual mínima de 20% do QE para o candidato na primeira rodada de sobras; com simulação paramétrica de cenários pós-STF).
  - Pleito 2024: Regras consolidadas das Resoluções TSE aplicáveis.
- **RF-010 (Decomposição de Voto Nominal vs. Voto de Legenda):** O sistema deve decompor a votação total do partido em votação nominal (soma dos votos individuais dos candidatos) e votos exclusivamente atribuídos à legenda partidária, calculando o percentual de dependência de legenda.

### Módulo D: Séries Temporais e Comparabilidade
- **RF-011 (Comparação Longitudinal de Candidato / Partido):** O sistema deve permitir comparar a trajetória de um mesmo ator político ou legenda entre diferentes eleições (ex: 2018 vs. 2022), exibindo:
  - Variação absoluta de votos ($\Delta V = V_{t} - V_{t-1}$).
  - Variação percentual relativa ($\% \Delta V = \frac{V_{t} - V_{t-1}}{V_{t-1}} \times 100$).
  - Variação da participação de mercado eleitoral ($\Delta \text{Share} = \text{Share}_t - \text{Share}_{t-1}$, onde $\text{Share}$ é a % sobre os votos válidos).
- **RF-012 (Volatilidade Eleitoral de Pedersen):** O sistema deve calcular o índice de volatilidade eleitoral agregado entre dois pleitos consecutivos para uma dada circunscrição:
  $$V_{Pedersen} = \frac{1}{2} \sum_{p=1}^{k} |\text{Share}_{p, t} - \text{Share}_{p, t-1}|$$
- **RF-013 (Controle de Comparecimento e Abstenção):** O sistema deve mensurar o eleitorado apto, total de votantes, comparecimento absoluto e relativo (%), abstenção absoluta e relativa (%), brancos (%) e nulos (%).

### Módulo E: Rastreabilidade, Auditoria e Exportação
- **RF-014 (Ficha de Linhagem e Memória de Cálculo):** Qualquer indicador exibido deve disponibilizar uma "Ficha Metodológica" exibindo a fórmula matemática exata, os parâmetros utilizados, o código do script de cálculo e a lista de arquivos TSE que serviram de insumo.
- **RF-015 (Exportação Estruturada):** O sistema deve permitir exportar dados tratados e indicadores em formatos padronizados (CSV com separador `;` e codificação UTF-8, JSON com esquemas validados).

---

## 3. Matriz de Granularidade por Conjunto de Dados

| Entidade / Recorte | Disponível no TSE? | Unidade Mínima de Registro no Dado Bruto | Observações de Consistência |
| :--- | :--- | :--- | :--- |
| **Eleição Presidencial** | Sim | Seção Eleitoral / Município / UF / Brasil | Inclui Voto no Exterior (ZZ). |
| **Deputado Federal / Estadual** | Sim | Seção Eleitoral / Município / Zona | Circunscrição é a UF. Não há quociente municipal em pleito geral! |
| **Prefeito / Vereador** | Sim | Seção Eleitoral / Município / Zona | Circunscrição é o Município. |
| **Seção Eleitoral** | Sim | Seção individual por Zona | Algumas seções são agregadas fisicamente no dia da votação (seções agregadas). |
| **Bairro Oficial do Eleitor** | **Não (com ressalvas)** | **Apenas Local de Votação** | O TSE não registra o bairro do eleitor no resultado da urna; registra apenas o endereço físico do estabelecimento escolar/local de votação! Inferir o bairro do eleitor exige cruzamento espacial com locais de votação. |
| **Voto Individual do Eleitor** | **Não (Vedado por Lei)** | Cédula Secreta | O Boletim de Urna é anônimo por preceito constitucional inquebrável. |

---

## 4. Casos de Uso Críticos Detalhados

### Caso de Uso UC-01: Auditoria de Votação de Candidato em Pleito Proporcional
- **Ator:** Pesquisador ou Auditor Eleitoral.
- **Pré-condição:** Ingestão dos arquivos `consulta_cand_2022_RS.csv` e `votacao_candidato_munzona_2022_RS.csv` concluída e validada por hash.
- **Fluxo Principal:**
  1. O usuário seleciona o ano (ex: `2022`), cargo (ex: `Deputado Estadual`), UF (ex: `RS`) e candidato (ex: `Carlos Búrigo - SQ: 210001610488`).
  2. O sistema recupera a situação jurídica da candidatura (Deferido com voto válido).
  3. O sistema calcula a votação total no estado, percentual sobre os votos válidos totais e percentual sobre os votos do partido/federação.
  4. O sistema gera a tabela de votação desagregada por município com ranking dos 10 maiores municípios em votos absolutos e percentuais.
  5. O sistema exibe o HHI Eleitoral do candidato e a classificação espacial (ex: Concentrado na Serra Gaúcha).
  6. O sistema exibe a ficha de proveniência com o hash do arquivo TSE e o Quociente Eleitoral estadual.
- **Pós-condição:** Diagnóstico reproduzível emitido com assinatura digital de dados.

### Caso de Uso UC-02: Comparação de Desempenho Entre Eleições Consecutivas
- **Ator:** Estrategista Político.
- **Pré-condição:** Dados de 2018 e 2022 normalizados na base.
- **Fluxo Principal:**
  1. O usuário seleciona duas eleições consecutivas e o ator político.
  2. O sistema busca os identificadores correspondentes (verificação de consistência entre trocas de legenda partidária ou nomes de urna).
  3. O sistema harmoniza os municípios pelos códigos IBGE.
  4. O sistema calcula $\Delta V$, $\% \Delta V$ e $\Delta \text{Share}$ por município.
  5. O sistema separa municípios com ganho líquido de votos de municípios com perda líquida.
  6. O sistema exibe aviso metodológico caso tenha havido rezoneamento ou mudança na regra de coligação.
