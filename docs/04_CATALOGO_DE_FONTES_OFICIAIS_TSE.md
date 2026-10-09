# Caderno 04 — Catálogo de Fontes Oficiais do Tribunal Superior Eleitoral (TSE)

## 1. Visão Geral da Infraestrutura de Dados do TSE

O Tribunal Superior Eleitoral disponibiliza seus dados oficiais por meio de dois canais principais:
1. **Portal de Dados Abertos do TSE:** Portal CKAN (`https://dadosabertos.tse.jus.br/`) com metadados e links para arquivos consolidados em formato compactado (`.zip`).
2. **Repositório de Dados Eleitorais (RDE):** Repositório de arquivos históricos estáticos (`https://repositorio.dados.tse.jus.br/` e `https://cdn.tse.jus.br/`).
3. **DivulgaCandContas (API REST e Portal):** Serviço web pontual para consulta a candidaturas e prestações de contas correntes (`https://divulgacandcontas.tse.jus.br/divulga/rest/v1/`).

> **Diretriz de Arquitetura:** Para fins analíticos históricos, volumetria massiva e consistência reprodutível, a plataforma utiliza **exclusivamente os arquivos de dados abertos completos (bulk dumps)**, evitando web scrapers frágeis ou chamadas repetitivas à API do DivulgaCand, que sofre rate limits severos e não disponibiliza séries históricas completas de votação por seção.

---

## 2. Inventário Exaustivo dos Conjuntos de Dados Oficiais

### Conjunto 1: Votação Nominal e de Legenda por Seção Eleitoral
- **Identificador Canônico TSE:** `votacao_secao_YYYY_UF.zip` / `votacao_secao_YYYY_UF.csv`
- **Endereço Oficial:** `https://dadosabertos.tse.jus.br/dataset/resultados-YYYY`
- **Formato:** Arquivo de texto CSV delimitado por ponto e vírgula (`;`), sem aspas por padrão ou com aspas duplas em strings, cabeçalho na primeira linha.
  - *Codificação (Encoding):* `ISO-8859-1` (Latin-1) para arquivos até 2018; `UTF-8` para arquivos a partir de 2020.
- **Cobertura Temporal:** Pleitos de 1994 a 2024 (disponibilidade detalhada de seção consistente a partir de 2004/2008).
- **Granularidade Mínima:** **Seção Eleitoral Individual** dentro de uma Zona Eleitoral e Município.
- **Campos Principais:**
  - `ANO_ELEICAO`, `NR_TURNO`, `SG_UF`, `CD_MUNICIPIO` (código TSE), `NM_MUNICIPIO`.
  - `NR_ZONA`, `NR_SECAO`.
  - `CD_CARGO`, `DS_CARGO`.
  - `NR_VOTAVEL` (número do candidato ou da legenda; 95=Branco, 96=Nulo).
  - `NM_VOTAVEL` (nome do candidato ou "Voto de Legenda").
  - `QT_VOTOS`.
- **Limitações e Armadilhas:**
  - *Volumetria Expressiva:* Os arquivos de seção eleitoral de estados grandes (SP, MG, RJ, RS, BA) contêm de 20 a 70 milhões de linhas por pleito.
  - *Seções Agregadas:* Nem toda seção física opera isoladamente; seções com poucos eleitores são agrupadas em uma seção principal na data do pleito. O campo `NR_SECAO` reflete a seção de origem do voto.
  - *Mudança de Nomes de Colunas:* O TSE padronizou a nomenclatura de cabeçalhos a partir de 2014/2016 (prefixos `CD_`, `DS_`, `NR_`, `NM_`, `QT_`). Arquivos de 2004-2012 exigem de-para de nomenclatura no pipeline de ingestão.

---

### Conjunto 2: Votação por Candidato em Município e Zona Eleitoral
- **Identificador Canônico TSE:** `votacao_candidato_munzona_YYYY_UF.csv`
- **Endereço Oficial:** `https://dadosabertos.tse.jus.br/dataset/resultados-YYYY`
- **Formato:** CSV delimitado por `;`.
- **Cobertura Temporal:** 1994 a 2024.
- **Granularidade Mínima:** **Agregado por Município e Zona Eleitoral** (uma linha por candidato/partido, por zona eleitoral do município).
- **Campos Principais:**
  - `ANO_ELEICAO`, `NR_TURNO`, `SG_UF`, `CD_MUNICIPIO`, `NM_MUNICIPIO`, `NR_ZONA`.
  - `CD_CARGO`, `SQ_CANDIDATO`, `NR_CANDIDATO`, `NM_CANDIDATO`, `NM_URNA_CANDIDATO`.
  - `CD_SITUACAO_CANDIDATURA`, `DS_SITUACAO_CANDIDATURA` (Deferido, Indeferido com recurso, etc.).
  - `CD_DETALHE_SITUACAO_CAND`, `DS_DETALHE_SITUACAO_CAND`.
  - `TP_AGREMIACAO` (Partido isolado, Coligação, Federação).
  - `NR_PARTIDO`, `SG_PARTIDO`, `NM_PARTIDO`.
  - `SQ_COLIGACAO`, `NM_COLIGACAO`, `DS_COMPOSICAO_COLIGACAO`.
  - `QT_VOTOS_NOMINAIS_VALIDOS`, `QT_TOTAL_VOTOS_VALIDOS`.
- **Limitações e Armadilhas:**
  - Contém apenas votação atribuída aos candidatos e partidos. **Não contém votos brancos e nulos**, que estão no arquivo de detalhe da apuração (`detalhe_votacao_munzona_YYYY_UF.csv`).

---

### Conjunto 3: Detalhe da Apuração e Comparecimento (Boletim Resumo)
- **Identificador Canônico TSE:** `detalhe_votacao_secao_YYYY_UF.csv` ou `detalhe_votacao_munzona_YYYY_UF.csv`
- **Endereço Oficial:** `https://dadosabertos.tse.jus.br/dataset/resultados-YYYY`
- **Formato:** CSV delimitado por `;`.
- **Granularidade Mínima:** Seção Eleitoral ou Zona/Município.
- **Campos Principais:**
  - `QT_APTOS` (eleitores aptos a votar).
  - `QT_COMPARECIMENTO` (eleitores que compareceram à urna).
  - `QT_ABSTENCAO` (eleitores faltosos).
  - `QT_VOTOS_NOMINAIS` (votos válidos direcionados a candidatos).
  - `QT_VOTOS_LEGENDA` (votos válidos direcionados à legenda partidária).
  - `QT_VOTOS_BRANCOS`, `QT_VOTOS_NULOS`, `QT_VOTOS_ANULADOS_SUB_JUDICE`.
- **Papel Metodológico Crítico:** É este conjunto que fecha a equação de integridade da urna. Sem ele, é impossível calcular taxas reais de abstenção ou percentuais sobre o comparecimento.

---

### Conjunto 4: Candidaturas e Agremiações
- **Identificador Canônico TSE:** `consulta_cand_YYYY_UF.csv` e `consulta_legendas_YYYY_UF.csv`
- **Endereço Oficial:** `https://dadosabertos.tse.jus.br/dataset/candidatos-YYYY`
- **Formato:** CSV delimitado por `;`.
- **Granularidade Mínima:** Candidatura única por eleição/cargo/circunscrição.
- **Campos Principais:**
  - `SQ_CANDIDATO` (chave única oficial do TSE para o registro da candidatura).
  - `NR_CANDIDATO`, `NM_CANDIDATO`, `NM_URNA_CANDIDATO`, `NR_CPF_CANDIDATO` (mascarado pelo TSE por LGPD nos arquivos recentes: `***123456**`).
  - `SG_UF`, `CD_MUNICIPIO`, `CD_CARGO`.
  - `NR_PARTIDO`, `SG_PARTIDO`, `NR_FEDERACAO`, `NM_FEDERACAO`.
  - `CD_SITUACAO_CANDIDATURA`, `DS_SITUACAO_CANDIDATURA`.
  - `DS_SITUACAO_JULGAMENTO`, `DS_SIT_TOT_TURNO` (Eleito por QP, Eleito por média, Suplente, Não eleito).
  - `VR_DESPESA_MAX_CAMPANHA`.
- **Limitações:**
  - Um indivíduo que concorreu em 2018 e 2022 terá **dois `SQ_CANDIDATO` diferentes**, pois esse identificador é gerado por eleição. A chave de continuidade da pessoa física histórica é o CPF (ou nome completo + data de nascimento + título eleitoral quando o CPF estiver mascarado).

---

### Conjunto 5: Perfil do Eleitorado
- **Identificador Canônico TSE:** `perfil_eleitorado_YYYY.csv`
- **Endereço Oficial:** `https://dadosabertos.tse.jus.br/dataset/eleitorado-YYYY`
- **Formato:** CSV delimitado por `;`.
- **Granularidade Mínima:** Faixa de perfil por Zona e Município (segmentado por gênero, faixa etária, escolaridade e estado civil).
- **Limitações:** Não se vincula à seção individual nem ao voto (o voto é secreto). Serve apenas para contextualização sociodemográfica do município ou da zona eleitoral.

---

### Conjunto 6: Locais de Votação e Georreferenciamento
- **Identificador Canônico TSE:** `local_votacao_YYYY.csv` / `eleitorado_local_votacao_YYYY.csv`
- **Endereço Oficial:** `https://dadosabertos.tse.jus.br/dataset/eleitorado-local-votacao-YYYY`
- **Granularidade Mínima:** Estabelecimento físico de votação (escola, clube, associação) com vínculo às seções que ali operam.
- **Campos:** `CD_MUNICIPIO`, `NR_ZONA`, `NR_LOCVOT`, `NM_LOCVOT`, `DS_ENDERECO`, `NM_BAIRRO`, `NR_CEP`, `LATITUDE`, `LONGITUDE` (quando preenchido pelo cartório).
- **Limitações:** Coordenadas de latitude/longitude fornecidas pelos TREs possuem percentual de inconsistência ou ausência em municípios do interior, exigindo geocodificação complementar ou validação cartográfica.

---

## 3. Matriz Sintética de Fontes Oficiais

| Conjunto de Dados | Frequência de Atualização | Tamanho Típico (Brasil / Pleito) | Encoding | Método de Obtenção |
| :--- | :--- | :--- | :--- | :--- |
| `votacao_secao` | Estático pós-totalização final | ~15 a 25 GB compactado | Latin1 (<2020) / UTF-8 (>=2020) | Download HTTP direto do Portal TSE |
| `votacao_candidato_munzona` | Estático pós-totalização final | ~800 MB a 1.5 GB compactado | Latin1 / UTF-8 | Download HTTP direto do Portal TSE |
| `detalhe_votacao_secao` | Estático pós-totalização final | ~2 a 4 GB compactado | Latin1 / UTF-8 | Download HTTP direto do Portal TSE |
| `consulta_cand` | Estático pós-julgamento final | ~100 a 250 MB compactado | Latin1 / UTF-8 | Download HTTP direto do Portal TSE |
| `local_votacao` | Bienal por eleição | ~80 MB compactado | UTF-8 | Download HTTP direto do Portal TSE |
| `perfil_eleitorado` | Mensal / Bienal | ~300 MB compactado | UTF-8 | Download HTTP direto do Portal TSE |
