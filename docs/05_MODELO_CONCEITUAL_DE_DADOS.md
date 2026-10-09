# Caderno 05 — Modelo Conceitual de Dados e Ontologia Eleitoral

## 1. Princípios Conceituais e Semântica de Domínio

O domínio eleitoral brasileiro é repleto de nuances institucionais que induzem a erros graves quando modelado de forma ingênua. Este caderno define as entidades, seus papéis ontológicos, fronteiras semânticas e relações de dependência.

---

## 2. Distinções Ontológicas Fundamentais

### 2.1. Pessoa Física vs. Candidatura
- **Pessoa Física (`Pessoa`):** A entidade ontológica durável ao longo do tempo. Possui nome civil, data de nascimento, título de eleitor de raiz e CPF. Uma mesma pessoa pode disputar múltiplos pleitos ao longo das décadas (ex: Carlos Búrigo em 2016, 2018, 2020, 2022).
- **Candidatura (`Candidatura`):** A relação jurídica e temporal transitória entre uma `Pessoa`, um `Partido/Federação`, uma `Eleição/Turno`, um `Cargo` e uma `Circunscrição Territorial`.
  - A candidatura possui um identificador único oficial concedido pelo TSE (`SQ_CANDIDATO`), um número de urna (`NR_CANDIDATO`), um nome de urna (`NM_URNA_CANDIDATO`) e um status jurídico (`DS_SITUACAO_CANDIDATURA`).
  - **Invariante:** Nunca atribuir votação diretamente à `Pessoa`, mas sempre à `Candidatura` específica de um pleito.

### 2.2. Município vs. Zona Eleitoral
- **Município (`Municipio`):** Entidade federativa e político-administrativa definida pelo IBGE e reconhecida pelo TSE (possui código IBGE de 7 dígitos e código TSE de 5 dígitos).
- **Zona Eleitoral (`ZonaEleitoral`):** Circunscrição de jurisdição judiciária eleitoral gerida por um juiz eleitoral e um cartório.
- **Relação Complexa (N:M):**
  - Em grandes capitais (ex: São Paulo, Porto Alegre), **um único município contém dezenas de zonas eleitorais**.
  - No interior do Brasil, **uma única zona eleitoral abrange de 2 a 10 pequenos municípios**.
  - **Regra de Ouro:** A menor unidade territorial administrativa para apuração de eleições municipais é o `Municipio`. Para apuração judiciária e logística eleitoral, a unidade é o par `(Municipio, ZonaEleitoral)`.

### 2.3. Seção Eleitoral vs. Local de Votação vs. Seção Agregada
- **Seção Eleitoral (`SecaoEleitoral`):** A menor fração cadastral de eleitores (tipicamente entre 150 e 400 eleitores inscritos).
- **Local de Votação (`LocalVotacao`):** O prédio físico (ex: Escola Estadual Cristóvão de Mendoza) onde funcionam uma ou várias seções eleitorais.
- **Seção Agregada:** No dia do pleito, seções de menor movimento podem ser fundidas a outra para funcionar em uma única urna eletrônica física. Os votos emitidos continuam associados à sua seção cadastral de origem no Boletim de Urna.

### 2.4. Votação Nominal vs. Voto de Legenda vs. Votos Não Válidos
- **Voto Nominal (`VotoNominal`):** Voto direcionado especificamente ao número de um candidato a cargo proporcional ou majoritário.
- **Voto de Legenda (`VotoLegenda`):** Voto direcionado estritamente ao número de 2 dígitos do partido político em eleições proporcionais (Deputado Federal, Deputado Estadual, Vereador). Conta para o Quociente Partidário, mas não para nenhum candidato individual.
- **Brancos e Nulos (`VotoNaoNominal`):** Votos sem destinação a partido ou candidato, computados no detalhe de apuração da urna e excluídos do cálculo dos quocientes eleitorais (CF/88, art. 77, § 2º).

---

## 3. Diagrama Conceitual de Entidades

```
+-------------------+             +----------------------+
|  FonteDadosTSE    |             |  ExecucaoImportacao  |
| (URL, Dataset)    | 1         * | (Data, Log, Status)  |
+-------------------+             +----------------------+
          │                                  │
          │ 1                                │ 1
          ▼ *                                ▼ *
+-------------------+             +----------------------+
|  ArquivoOficial   |────────────▶|  LinhagemRegistro    |
| (SHA-256, Bytes)  |             | (Hash Origem, Linha) |
+-------------------+             +----------------------+
                                             │ 1
                                             │
                                             ▼ *
+-------------------+             +----------------------+
|      Pessoa       | 1         * |     Candidatura      |
| (ID, Nome, CPF)   |────────────▶| (SQ_CAND, NrUrna,    |
+-------------------+             |  Cargo, Status)      |
                                  +----------------------+
                                             │ 1
                                             │
                                             ▼ *
+-------------------+             +----------------------+             +--------------------+
|  UnidadeTerritorio|             |  ResultadoSecao      |             |  ResultadoMunZona  |
| (IBGE, TSE, Nivel)|             | (Voto por Secao:     |             | (Agregado Oficial: |
+-------------------+             |  Candidato/Legenda)  |             |  Mun + Zona + Cand)|
          │ 1                                │                         +--------------------+
          │                                  │
          ▼ *                                ▼ *
+-------------------+             +----------------------+
|   ZonaEleitoral   |             |  DetalheApuracao     |
|   / SecaoEleitoral|             | (Aptos, Comparec.,   |
+-------------------+             |  Brancos, Nulos)     |
                                  +----------------------+
```

---

## 4. Dicionário Conceitual de Entidades

### E1: `Eleicao`
- **Significado:** Pleito eleitoral realizado em um determinado ano e data.
- **Atributos Chave:** `ano_eleicao` (SMALLINT), `nr_turno` (SMALLINT: 1 ou 2), `tp_eleicao` (Geral, Municipal, Suplementar), `dt_eleicao` (DATE).
- **Chave de Negócio:** `(ano_eleicao, nr_turno, tp_eleicao)`.

### E2: `Cargo`
- **Significado:** Posto político em disputa.
- **Atributos Chave:** `cd_cargo` (TSE: 1=Pres, 3=Gov, 5=Sen, 6=DepFed, 7=DepEst, 8=DepDist, 11=Pref, 13=Ver), `ds_cargo`, `tp_sistema` (`MAJORITARIO` ou `PROPORCIONAL`).

### E3: `Pessoa`
- **Significado:** Indivíduo biológico que pode ter registros de candidatura ao longo de múltiplos pleitos.
- **Atributos Chave:** `id_pessoa` (UUID interno), `nm_social_ou_civil`, `dt_nascimento`, `cd_genero`, `nr_cpf_hash` (para vinculação histórica sem expor dado pessoal sensível desnecessariamente).

### E4: `Partido` e `Federacao`
- **Significado:** Agremiação partidária registrada no TSE ou união formal de partidos (federação partidária a partir de 2022).
- **Atributos Chave:** `nr_partido` (2 dígitos), `sg_partido` (sigla), `nm_partido`, `nr_federacao`, `sg_federacao`.

### E5: `Candidatura`
- **Significado:** Inscrição formal de uma `Pessoa` por um `Partido` em uma `Eleicao` para concorrer a um `Cargo` em uma `Circunscricao`.
- **Atributos Chave:** `sq_candidato` (ID oficial TSE de 12 dígitos), `id_pessoa` (FK), `id_eleicao` (FK), `cd_cargo` (FK), `nr_candidato` (número na urna), `nm_urna_candidato`, `cd_situacao_candidatura`, `cd_detalhe_situacao`, `fl_voto_valido` (BOOLEAN).
- **Chave de Negócio:** `(id_eleicao, sq_candidato)`.

### E6: `UnidadeTerritorial`
- **Significado:** Nível espacial padronizado com geometria e hierarquia administrativa.
- **Atributos Chave:** `cd_ibge` (7 dígitos), `cd_tse` (5 dígitos), `sg_uf`, `nm_municipio`, `nm_microrregiao`, `nm_mesorregiao`.

### E7: `ZonaEleitoral` e `SecaoEleitoral`
- **Significado:** Divisão jurisdicional eleitoral do TRE e urna básica.
- **Atributos Chave:** `nr_zona`, `cd_municipio_tse`, `nr_secao`.
- **Chave de Negócio:** `(sg_uf, cd_municipio_tse, nr_zona, nr_secao)`.

### E8: `ResultadoVotoSecao` (Nível Atômico de Seção)
- **Significado:** Contagem de votos recebidos por um determinado número votável em uma seção específica.
- **Atributos Chave:** `id_eleicao`, `sg_uf`, `cd_municipio_tse`, `nr_zona`, `nr_secao`, `cd_cargo`, `nr_votavel`, `sq_candidato` (NULL para voto de legenda ou branco/nulo), `qt_votos`.
- **Chave de Negócio:** `(id_eleicao, cd_municipio_tse, nr_zona, nr_secao, cd_cargo, nr_votavel)`.

### E9: `DetalheApuracaoSecao` (Totalizadores da Seção)
- **Significado:** Fechamento aritmético da urna.
- **Atributos Chave:** `id_eleicao`, `sg_uf`, `cd_municipio_tse`, `nr_zona`, `nr_secao`, `cd_cargo`, `qt_aptos`, `qt_comparecimento`, `qt_abstencao`, `qt_votos_nominais`, `qt_votos_legenda`, `qt_votos_brancos`, `qt_votos_nulos`, `qt_votos_anulados_sub_judice`.

### E10: `FonteDadosTSE`, `ArquivoOficial`, `ExecucaoImportacao`
- **Significado:** Metadados da infraestrutura de proveniência e auditoria.
- **Atributos Chave:** `id_arquivo`, `nm_arquivo`, `hash_sha256`, `tamanho_bytes`, `url_origem`, `data_download`, `linhas_lidas`, `linhas_rejeitadas`.

### E11: `IndicadorAnalitico` (Métrica Pré-Calculada)
- **Significado:** Métrica derivada com metodologia registrada.
- **Atributos Chave:** `id_indicador`, `tp_indicador` (`HHI_CONCENTRACAO`, `QUOCIENTE_ELEITORAL`, `SOBRAS_MÉDIA`, `VOLATILIDADE_PEDERSEN`), `id_eleicao`, `cd_cargo`, `sq_candidato` (opcional), `cd_ibge` (opcional), `vl_indicador` (NUMERIC), `parametros_json`, `data_calculo`.

---

## 5. Regras Formais Anti-Dupla Contagem

Para evitar a falha mais comum em sistemas eleitorais — a soma inadvertida de registros de diferentes níveis de agregação —, o modelo conceitual adota as seguintes restrições:

1. **Separação Rígida de Camadas Físicas de Votação:**
   - A tabela que armazena votos em nível de **Seção** (`ResultadoVotoSecao`) **nunca** é somada na mesma query com tabelas pré-agregadas por **Município/Zona** (`ResultadoMunZona`).
   - Todo relatório que agrega votos parte exclusivamente de uma única camada declarada.
2. **Invariante de Fechamento por Seção:**
   $$\sum \text{qt\_votos (ResultadoVotoSecao)} \equiv \text{qt\_comparecimento (DetalheApuracaoSecao)}$$
   Para qualquer divergência detectada na ingestão, o registro é colocado em quarentena de inconsistência com log detalhado de divergência do TSE.
3. **Impedimento de Dupla Contagem em Coligações e Federações:**
   - Votos de legenda são atribuídos ao partido isolado, e computados para o cálculo de cadeiras da federação/coligação sem replicar a linha física do voto.

---

## 6. Regras vinculantes para chaves e identidade

O diagrama e o dicionário acima são modelo conceitual inicial, não esquema físico aprovado. Chaves de negócio devem ser confirmadas contra layouts reais e testes de unicidade por pleito.

### 6.1. Resultado por seção
A chave candidata de `ResultadoVotoSecao` não é universal até considerar, conforme campos reais, eleição, turno, tipo de eleição, UF, município TSE, zona, seção, cargo, número votável, categoria/tipo de voto e versão da totalização. `NR_VOTAVEL` não identifica sozinho uma candidatura em todos os cargos e pleitos. Não usar `SQ_CANDIDATO = NULL` indistintamente para legenda, branco, nulo e outras categorias; tipar explicitamente a categoria e sua relação com candidatura. Só definir chave física após perfil de dados reais e teste de duplicidade.

### 6.2. Granularidade
Resultados por seção, agregados oficiais por município/zona e totalizadores de apuração são observações diferentes. Devem permanecer em camadas distintas com origem e granularidade explícitas. Distinguir agregado oficial TSE de agregado recalculado pela plataforma. Não presumir que somar todas as categorias de um arquivo reproduz comparecimento.

### 6.3. Identidade histórica
`SQ_CANDIDATO` identifica candidatura, não pessoa histórica. Não vincular automaticamente registros por nome, nome de urna, data de nascimento, naturalidade ou semelhança textual. A resolução deve aceitar estados `confirmado`, `provável`, `ambíguo` e `não vinculado`, guardar evidências, regra/versão, data e revisão humana. CPF mascarado ou hash não recuperável não é chave universal. Manter candidaturas independentes quando a pessoa não puder ser resolvida.

### 6.4. Território e tempo
Código TSE e IBGE pertencem a sistemas distintos. Manter correspondências versionadas por período, com fonte e cardinalidade registradas; não presumir equivalência entre zona e município nem estabilidade dos códigos históricos. Separar data do pleito da data/versão do arquivo e da totalização.
