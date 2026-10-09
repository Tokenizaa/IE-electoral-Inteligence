# Caderno 01 — Visão do Produto, Escopo e Limites Epistemológicos

## 1. O Problema que a Plataforma Resolve

O ecossistema de análise política e consultoria eleitoral no Brasil sofre de quatro patologias estruturais recorrentes:

1. **Dashboardismo Superficial:** Ferramentas comerciais limitam-se a plotar gráficos agregados de votação municipal sem contextualizar o sistema eleitoral (majoritário vs. proporcional, quocientes, sobras, regras de barreira de cláusula e coligações/federações vigentes no pleito).
2. **Mistura entre Opinião e Evidência:** Diagnósticos estratégicos frequentemente confundem o sentimento eleitoral intuitivo de cabos eleitorais com o comportamento real das urnas, levando a campanhas desastrosas baseadas em viés de confirmação.
3. **Opacidade Metodológica e Inconsistência de Dados:** Ausência de rastreabilidade entre o número exibido na tela e o Boletim de Urna (BU) ou arquivo oficial emitido pelo Tribunal Superior Eleitoral (TSE), impossibilitando auditoria jurídica ou científica.
4. **Alucinação Analítica e Saltos Causais:** O uso ingênuo de modelos de linguagem (IA) que "inventam" porcentagens ou atribuem causalidades simplistas a fenômenos complexos sem testes de hipótese formais.

**A Plataforma Inteligência Eleitoral** resolve esse problema ao instituir um ambiente de **Ciência de Dados Eleitorais**, que trata o dado eleitoral brasileiro com o rigor de um laboratório econométrico e de ciência política, fundamentado exclusivamente em fontes oficiais primárias, com reprodutibilidade determinística e linhagem de dados transparente.

---

## 2. Usuários e Casos de Uso Principais

A plataforma atende quatro perfis com necessidades analíticas distintas, sob uma mesma verdade de dados:

### 2.1. Cientistas Políticos, Pesquisadores e Institutos Acadêmicos
- **Caso de Uso:** Testar hipóteses sobre nacionalização/regionalização partidária, impacto de reformas eleitorais (ex: fim das coligações proporcionais em 2020/2022, criação de federações partidárias, novas regras de sobras eleitorais — Lei 14.211/2021 e decisões do STF de 2024), cálculo de índices de concentração espacial (Gini eleitoral, Hirschman-Herfindahl).
- **Necessidade:** Exportação de séries históricas harmonizadas, fórmulas abertas e scripts de cálculo reprodutíveis.

### 2.2. Estrategistas Políticos e Coordenações de Campanha
- **Caso de Uso:** Diagnóstico cirúrgico de "redutos eleitorais" consolidados, zonas de expansão e zonas de perda de votos entre ciclos (2014, 2018, 2022, 2026 / 2016, 2020, 2024); identificação de transferência de votos intrachapa ou entre partidos concorrentes em nível de zona eleitoral ou município.
- **Necessidade:** Precisão factual inquestionável, simulações de quociente com cenários reais e segmentação territorial rigorosa.

### 2.3. Jornalistas Investigativos e Checadores de Fatos (Fact-Checking)
- **Caso de Uso:** Verificação imediata de alegações públicas feitas por candidatos ou partidos (ex: "o candidato X teve 80% dos votos em tal bairro" ou "o partido Y cresceu 300% no interior"); auditoria de apuração e votação por seção e urna.
- **Necessidade:** Rastreamento do Boletim de Urna original, hashes de arquivos e links diretos para a base do TSE.

### 2.4. Juristas Eleitorais e Contadores Partidários
- **Caso de Uso:** Auditoria de distribuição de cadeiras (cálculo de sobras 80/20 vs. ADIs no STF), validação de cotas de gênero (candidaturas fictícias e nulidade de votos da chapa) e verificação de votos válidos para cláusula de barreira.
- **Necessidade:** Conformidade legal estrita com a legislação vigente no exato ano do pleito analisado.

---

## 3. As Perguntas Eleitorais que a Plataforma Deve Responder

A plataforma foi concebida para responder a perguntas objetivas e empiricamente verificáveis, tais como:

1. **Estrutura Territorial do Voto:**
   - Onde se concentram os votos nominais de um candidato ou partido? Qual é o grau de dispersão espacial medido pelo Índice de Herfindahl-Hirschman (HHI) ou Gini Eleitoral?
   - O candidato é predominantemente "dominante" (concentrado e dominante em poucos locais), "compartilhado" (competindo voto a voto), "disperso" ou "periférico"? (Tipologia de Ames/Carvalho).
2. **Dinâmica Temporal e Trajetória Eleitoral:**
   - Como evoluiu a votação nominal absoluta e a fatia percentual dos votos válidos do candidato/partido entre diferentes eleições?
   - Onde o candidato ganhou novos eleitores e onde perdeu espaço relativo? A mudança decorreu de alteração no comparecimento/abstenção ou migração de votos?
3. **Mecânica Proporcional e Formação de Bancadas:**
   - Qual foi o Quociente Eleitoral (QE) e Quociente Partidário (QP) na respectiva circunscrição?
   - Quantas vagas foram obtidas por quociente direto e quantas por sobras eleitorais? Quem ficou com a primeira e a última sobra da chapa?
   - Se a regra de distribuição de sobras fosse alterada (ex: sem a exigência de 80% do QE para o partido ou 20% para o candidato), a bancada teria mudado?
4. **Relação entre Comparecimento, Abstenção e Brancos/Nulos:**
   - Como a taxa de abstenção em uma determinada zona ou município correlaciona-se com o desempenho de candidaturas de determinados espectros?
   - Qual é a taxa de votos válidos sobre o eleitorado apto (taxa de participação efetiva)?
5. **Composição da Chapa (Nominal vs. Legenda):**
   - Qual fração da votação total de um partido adveio de votos de legenda versus votos nominais concentrados em "puxadores de voto"?
   - Houve dependência crítica de um único nome para a superação da cláusula de barreira partidária?

---

## 4. Tipos de Análise Suportados

A plataforma divide suas operações em quatro níveis analíticos bem delimitados:

1. **Análise Descritiva Oficial:** Agregações aritméticas estritas (somas, médias ponderadas, percentuais de votos válidos, totais de comparecimento) em diferentes níveis de granularidade (País, UF, Município, Zona Eleitoral, Seção Eleitoral).
2. **Análise Comparativa Longitudinal:** Cruzamento padronizado entre diferentes pleitos (ex: Eleições Gerais 2018 vs. 2022 ou Eleições Municipais 2020 vs. 2024), com harmonização de códigos de município (conversão de Código TSE para Código IBGE de 7 dígitos).
3. **Análise Espacial-Eleitoral:** Métricas de concentração geográfica (HHI eleitoral, Coeficiente de Localização Eleitoral, índice de isolamento).
4. **Análise Contrafactual Simulatória (Base Determinística):** Simulações parametrizadas sobre regras institucionais conhecidas (ex: cálculo de distribuição de cadeiras variando regras de cláusula de desempenho de candidatos ou cálculo de sobras).

---

## 5. Diferença Ontológica dos Níveis de Informação

Para garantir integridade inquestionável, a plataforma impõe uma separação categórica em quatro camadas ontológicas:

```
+-------------------------------------------------------------------------+
| [NÍVEL 4] INTERPRETAÇÕES & HIPÓTESES                                   |
| Textos explicativos, diagnósticos de consultoria, cenários conjunturais |
+-------------------------------------------------------------------------+
                                   ▲
+-------------------------------------------------------------------------+
| [NÍVEL 3] INDICADORES DERIVADOS & MÉTRICAS CIENTÍFICAS                  |
| HHI Eleitoral, Gini, Variação Relativa, QE/QP, Taxa de Retenção         |
+-------------------------------------------------------------------------+
                                   ▲
+-------------------------------------------------------------------------+
| [NÍVEL 2] DADOS TRATADOS & HARMONIZADOS                                 |
| Tipagem estrita, fusão TSE-IBGE, flags de situação jurídica válida     |
+-------------------------------------------------------------------------+
                                   ▲
+-------------------------------------------------------------------------+
| [NÍVEL 1] DADOS BRUTOS OFICIAIS (TSE OPEN DATA)                         |
| Arquivos CSV/ZIP originais do TSE, imutáveis, com SHA-256 e proveniência |
+-------------------------------------------------------------------------+
```

| Nível | Conceito | Origem | Mutabilidade | Exemplo |
| :--- | :--- | :--- | :--- | :--- |
| **Nível 1: Dado Bruto Oficial** | Registro literal fornecido pelo TSE | Portal de Dados Abertos TSE | Estritamente Imutável | "5.210 votos nominais para o candidato 15123 na Zona 119, Seção 42" |
| **Nível 2: Dado Tratado** | Dado oficial limpo, tipado e harmonizado | Pipeline determinístico (ETL) | Reproduzível via código | Código IBGE associado, gênero padronizado, status eleitoral normalizado |
| **Nível 3: Indicador Derivado** | Métrica calculada por fórmula matemática pública | Algoritmo formal com equações | Determinístico e auditável | $HHI = \sum s_i^2 = 0.4215$; Quociente Eleitoral = 74.321 votos |
| **Nível 4: Interpretação** | Parecer político, leitura estratégica ou hipótese | Pesquisador humano ou IA | Subjetivo / Condicional | "O candidato apresenta um padrão de votação concentrado na Serra Gaúcha" |

**Regra de Ouro:** Uma interpretação de Nível 4 **nunca** pode ser apresentada como se fosse um dado de Nível 1 ou 2. Toda afirmação de Nível 4 deve citar explicitamente os Indicadores de Nível 3 e Dados de Nível 2 que a fundamentam.

---

## 6. Limites Epistemológicos das Conclusões Extraíveis

A plataforma define explicitamente o que **NÃO PODE** ser concluído a partir de dados eleitorais públicos:

1. **Falácia Ecológica (Robinson, 1950):** O fato de uma seção eleitoral localizada em um bairro de alta renda ter votado massivamente em um candidato liberal não permite afirmar que "todos os indivíduos de alta renda votaram naquele candidato". A unidade de análise é o agregado da seção/urna, jamais a cédula individual (o voto é secreto por cláusula pétrea constitucional).
2. **Correlação não implica Causalidade:** Uma correlação entre alta votação e maior investimento em despesas de publicidade de campanha não prova por si só que o gasto causou a votação; pode decorrer de popularidade prévia que atraiu doadores (endogeneidade).
3. **Ausência de Registro não é Zero Voto:** Uma ausência de dados em um determinado arquivo pode significar inelegibilidade com recurso sub judice pendente de totalização, anulação de seção por problemas técnicos na urna, ou simplesmente falta de lançamento na base parcial.
4. **Incompatibilidade Temporal de Agrupamentos:**
   - Comparar votações de 2014 e 2022 exige atentar para:
     - Criação, fusão ou extinção de zonas eleitorais (rezoneamentos frequentes nos TREs).
     - Alteração no número total de eleitores aptos (crescimento demográfico ou expurgo biométrico).
     - Mudança de partidos (fusões como DEM + PSL = UNIÃO; PPS = CIDADANIA; PRB = REPUBLICANOS; PTB + PATRIOTA = PRD).

---

## 7. Requisitos de Transparência, Auditoria e Reprodução

1. **Auditabilidade de Registro:** Todo número exibido deve apontar para o conjunto de dados TSE de origem, incluindo:
   - Nome exato do arquivo oficial (ex: `votacao_secao_2022_RS.csv`).
   - Hash SHA-256 do arquivo original baixado.
   - Data de extração oficial registrada no cabeçalho ou metadado do TSE.
2. **Reprodutibilidade por Código Aberto:** O pipeline de transformação de dados deve ser idempotente: dado o mesmo arquivo bruto do TSE e os mesmos scripts de ingestão e agregação, a base local e as projeções remotas devem resultar em valores idênticos bit a bit.
3. **Transparência de Atualizações Sub Judice:** Quando candidatos com votos anulados têm suas situações alteradas posteriormente pelo TSE (retotalização), o sistema deve registrar o histórico de retotalização com logs versionados, sem apagar a fotografia histórica original.
