# Caderno 03 — Protocolo Metodológico Científico e Diretrizes Estatísticas

## 1. O Protocolo Analítico Canônico em 9 Etapas

Toda análise, relatório ou investigação conduzida na plataforma **Inteligência Eleitoral** deve obrigatoriamente submeter-se ao protocolo canônico de 9 etapas. Nenhuma conclusão é considerada válida se qualquer uma das etapas for omitida ou mascarada.

```
+-----------------------------------------------------------------------------------+
|                           PROTOCOLO CANÔNICO DE 9 ETAPAS                          |
+-----------------------------------------------------------------------------------+
| 1. Pergunta      ➔ 2. Hipótese     ➔ 3. Delimitação (Tempo/População/Unidade)     |
| 4. Fontes TSE    ➔ 5. Variáveis    ➔ 6. Método Estatístico / Cálculo Matemático   |
| 7. Validação     ➔ 8. Limitações   ➔ 9. Registro de Proveniência & Reprodutibilidade|
+-----------------------------------------------------------------------------------+
```

### Etapa 1: Formulação Explícita da Pergunta
- A pergunta deve ser formulada em linguagem precisa, sem juízos de valor morais ou especulativos.
- *Exemplo Válido:* "Qual foi a variação na concentração espacial da votação do candidato X para deputado estadual entre os pleitos de 2018 e 2022 no Rio Grande do Sul?"
- *Exemplo Inválido:* "O candidato X traiu sua base eleitoral em 2022?"

### Etapa 2: Definição da Hipótese (quando aplicável)
- Estabelecimento claro da hipótese nula ($H_0$) e da hipótese alternativa ($H_1$) para testes estatísticos, ou do padrão esperado com base na literatura teórica.
- *Exemplo:* $H_0$: A distribuição espacial dos votos do candidato não sofreu alteração estatisticamente significativa entre 2018 e 2022 ($HHI_{2022} = HHI_{2018}$).

### Etapa 3: Delimitação Temporal, Populacional e Unidade de Análise
- **Período:** Anos eleitorais exatos e turnos considerados (ex: 1º Turno de 2018 e 1º Turno de 2022).
- **População:** Votos válidos para o cargo de Deputado Estadual no estado do RS.
- **Unidade de Análise:** O município (código IBGE) ou a zona eleitoral (código TSE). É terminantemente proibido alternar unidades de análise no meio da mesma equação.

### Etapa 4: Identificação e Isolamento das Fontes Oficiais
- Indicação inequívoca dos arquivos de dados abertos do TSE utilizados, acompanhados de seus hashes SHA-256 e timestamps de publicação.

### Etapa 5: Definição de Variáveis e Critérios de Inclusão/Exclusão
- Identificação de cada variável utilizada (ex: `QT_VOTOS_NOMINAIS`, `QT_VOTOS_LEGENDA`, `QT_COMPARECIMENTO`).
- Critérios explícitos para lidar com candidaturas indeferidas com recurso (*sub judice*), votos anulados, e renúncias.

### Etapa 6: Especificação da Fórmula Matemática ou Método Estatístico
- Publicação da fórmula formal em notação matemática padrão.
- Detalhamento de pesos, arredondamentos e regras de desempate.

### Etapa 7: Validação Cruzada dos Dados e Resultados
- Verificação de consistência interna:
  - $\sum \text{Votos por Município} \equiv \text{Total Estadual Oficial}$.
  - $\text{Votos Válidos} + \text{Brancos} + \text{Nulos} \equiv \text{Total de Comparecimento}$.
  - $\text{Comparecimento} + \text{Abstenção} \equiv \text{Eleitorado Apto}$.

### Etapa 8: Apresentação Transparente de Evidências e Limitações
- Toda tabela ou visualização gráfica deve conter indicação das margens de incerteza, condições de contorno e ressalvas legais da época.

### Etapa 9: Registro Criptográfico de Reprodutibilidade
- Geração de um Manifesto de Execução (JSON) contendo: parâmetros de entrada, hash das bases, versão do algoritmo e semente aleatória (caso métodos estocásticos fossem usados — priorizando-se algoritmos estritamente determinísticos).

---

## 2. Diretrizes Científicas para Distinções Epistemológicas

### 2.1. Correlação vs. Causalidade
- **Regra:** A constatação de correlação linear ($r$ de Pearson ou $\rho$ de Spearman) entre duas variáveis eleitorais (ex: % de evangélicos no município e votação do candidato Y) **jamais autoriza** a conclusão de que um fator causou o outro.
- **Exigência:** Textos gerados pelo sistema devem obrigatoriamente usar termos como "associação estatística", "covariação observada" ou "relação bivariada", proibindo os termos "causou", "determinou" ou "provocou", a menos que um desenho de identificação causal quase-experimental (ex: Regressão Descontínua - RDD, Diferenças em Diferenças - DiD, ou Variáveis Instrumentais) tenha sido formalmente executado e documentado.

### 2.2. Tendência vs. Variação Pontual Espúria
- **Regra:** Duas eleições consecutivas (dois pontos no tempo: $t_1$ e $t_2$) constituem apenas uma variação pontual ($\Delta$), **nunca uma tendência histórica secular**.
- **Exigência:** Para caracterizar uma "tendência", a série histórica deve abranger no mínimo 3 ciclos comparáveis ($t_1, t_2, t_3$) sob o mesmo arcabouço institucional, explicitando se houve alterações de regras entre os ciclos.

### 2.3. Ausência de Dados vs. Valor Zero
- **Regra:** A plataforma deve tratar `NULL` (Dado Ausente / Não Informado / Seção Inexistente) como estritamente diferente de `0` (Zero Votos Apurados).
  - Um município que não existia no ano de 1996 ou que não teve urnas apuradas por decisão judicial tem valor `NULL`.
  - Um município onde o candidato concorreu, as urnas funcionaram normalmente, mas ninguém votou nele, tem valor `0`.
- Misturar `NULL` com `0` corrompe médias, taxas de variação percentual e cálculos de concentração.

### 2.4. Universos Incompatíveis e Comparações Inválidas
- É expressamente proibido comparar:
  - **Percentual sobre Votos Válidos** com **Percentual sobre Eleitorado Total / Votos Totais**.
  - **Eleições Gerais (Deputado)** com **Eleições Municipais (Vereador)** sem isolar a diferença de circunscrição e tamanho de colégio eleitoral.
  - Votação de candidatos de partidos diferentes sem descontar o efeito da magnitude do distrito ($M$) e do tamanho da chapa.

---

## 3. Diretrizes Rígidas para Uso de Inteligência Artificial (Anti-Alucinação)

A plataforma proíbe terminantemente a utilização de Modelos de Linguagem (LLMs) como mecanismos de cálculo aritmético ou repositórios de memória de dados.

### As 5 Leis da IA na Inteligência Eleitoral:
1. **A IA não calcula:** Cálculos matemáticos, agregações, percentuais, quocientes e métricas espaciais são obrigatoriamente executados por código determinístico (SQL / TypeScript / Python) no banco de dados. A IA recebe os resultados prontos e verificados como contexto.
2. **A IA não inventa dados ou fontes:** Qualquer menção a votos, candidatos, partidos ou zonas deve ser amparada em dados estruturados injetados. Se um dado não constar no contexto fornecido, a IA é instruída a declarar formalmente: *"Dado não disponível na base oficial carregada"*.
3. **A IA não faz afirmações causais sem testes:** Se solicitada a explicar "por que o candidato perdeu votos", a IA deve descrever os fatos empíricos (ex: "perdeu 4.200 votos nominais no município Z, onde o comparecimento caiu 8% e a chapa concorrente W ampliou seus votos em 5.100") e abster-se de especulações subjetivas de psicologia do eleitor não sustentadas em dados.
4. **Verificação de Fórmulas e Citações:** Fórmulas teóricas exibidas devem usar notação matemática universal e citar os autores de referência (ex: Taagepera & Shugart, 1989; Gallagher, 1991; Rae, 1967; Ames, 2001).
5. **Logs de Auditoria de Prompts:** Todo texto analítico assistido por IA deve registrar o prompt do sistema, os parâmetros de contexto fornecidos e os identificadores das tabelas consultadas.

---

## 4. Regras vinculantes de validação

Este adendo prevalece sobre exemplos anteriores mais amplos. É uma especificação; não comprova que os testes estejam implementados.

### 4.1. Fechamento aritmético contextual
Antes de testar uma identidade, registrar eleição, turno, território, cargo, categoria de voto, layout e versão da totalização. Só comparar campos que representem o mesmo universo. Não somar automaticamente votos nominais, legenda, brancos, nulos e anulados/sub judice sem verificar a semântica e as regras de totalização da fonte. Classificar divergências como explicadas, não comparáveis ou não explicadas; nunca corrigir o dado bruto silenciosamente.

### 4.2. Hipóteses e causalidade
Análises descritivas não exigem automaticamente testes de hipótese. Quando houver inferência, declarar população-alvo, desenho, pressupostos, estimando, incerteza, critérios de exclusão e multiplicidade quando relevante. Um desenho quase-experimental não basta por si só para alegar causalidade: documentar identificação, pressupostos e ameaças à validade.

### 4.3. Indicadores
Cada indicador deve ter ficha versionada com pergunta, unidade, universo, variável, denominador, fórmula, tratamento de zeros/ausências, limites, interpretação permitida, casos de não aplicação, bibliografia e testes conhecidos. HHI da distribuição geográfica dos votos de um candidato (share de cada território no total desse candidato) é diferente de HHI da competição dentro de um território (share de cada candidato/partido naquele território). Não usar “Gini eleitoral”, “coeficiente de localização” ou “volatilidade de Pedersen” sem definir fórmula e universo comparável.

### 4.4. Comparabilidade histórica
Produzir matriz de comparabilidade por pleito, cargo, sistema eleitoral, território, fonte/layout e status de totalização. Tratar explicitamente mudanças territoriais, oferta de candidaturas, magnitude distrital e regras eleitorais. Quando não houver correspondência confiável, declarar a série não comparável em vez de imputar equivalência.
