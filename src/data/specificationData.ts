export interface CanonicalDoc {
  id: string;
  caderno: string;
  title: string;
  summary: string;
  path: string;
  iconName: string;
  badge: string;
  contentMarkdownFile: string;
}

export const CANONICAL_DOCS: CanonicalDoc[] = [
  {
    id: "01_visao",
    caderno: "Caderno 01",
    title: "Visão do Produto, Escopo e Limites Epistemológicos",
    summary: "Missão, usuários, limites das conclusões extraíveis, distinção ontológica entre dado oficial, dado tratado, indicador e interpretação.",
    path: "/docs/01_VISAO_DO_PRODUTO.md",
    iconName: "ShieldAlert",
    badge: "Fundamentos Epistemológicos",
    contentMarkdownFile: "01_VISAO_DO_PRODUTO.md"
  },
  {
    id: "02_requisitos",
    caderno: "Caderno 02",
    title: "Requisitos Funcionais e Casos de Uso",
    summary: "Catálogo exaustivo de RF-001 a RF-015, perguntas investigáveis, casos de uso UC-01 e UC-02, e matriz de granularidade suportada.",
    path: "/docs/02_REQUISITOS_FUNCIONAIS_E_CASOS_DE_USO.md",
    iconName: "CheckSquare",
    badge: "15 Requisitos Funcionais",
    contentMarkdownFile: "02_REQUISITOS_FUNCIONAIS_E_CASOS_DE_USO.md"
  },
  {
    id: "03_metodologia",
    caderno: "Caderno 03",
    title: "Protocolo Metodológico Científico e Diretrizes Estatísticas",
    summary: "Protocolo formal em 9 etapas, distinção estrita entre correlação e causalidade, tendência vs variação, tratamento de nulo vs zero e as 5 Leis da IA.",
    path: "/docs/03_PROTOCOLO_METODOLOGICO_CIENTIFICO.md",
    iconName: "Binary",
    badge: "Protocolo em 9 Etapas",
    contentMarkdownFile: "03_PROTOCOLO_METODOLOGICO_CIENTIFICO.md"
  },
  {
    id: "04_fontes",
    caderno: "Caderno 04",
    title: "Catálogo de Fontes Oficiais do TSE",
    summary: "Inventário detalhado dos dados abertos do TSE (votação por seção, candidatos, comparecimento, locais de votação, perfis), formatos e encodings.",
    path: "/docs/04_CATALOGO_DE_FONTES_OFICIAIS_TSE.md",
    iconName: "Database",
    badge: "Fontes Primárias Oficiais",
    contentMarkdownFile: "04_CATALOGO_DE_FONTES_OFICIAIS_TSE.md"
  },
  {
    id: "05_modelo",
    caderno: "Caderno 05",
    title: "Modelo Conceitual de Dados e Ontologia Eleitoral",
    summary: "Entidades E1 a E11, relações complexas (Pessoa vs Candidatura, Município vs Zona vs Seção) e regras formais anti-dupla contagem.",
    path: "/docs/05_MODELO_CONCEITUAL_DE_DADOS.md",
    iconName: "Network",
    badge: "Ontologia & Anti-Dupla Contagem",
    contentMarkdownFile: "05_MODELO_CONCEITUAL_DE_DADOS.md"
  },
  {
    id: "06_arquitetura",
    caderno: "Caderno 06",
    title: "Arquitetura de Bancos: PostgreSQL Local & Supabase Remoto",
    summary: "Divisão de responsabilidades, por que não duplicar seções na nuvem, fluxo de dados unidirecional e condições de reconstrução total.",
    path: "/docs/06_ARQUITETURA_LOCAL_E_REMOTA.md",
    iconName: "Layers",
    badge: "Dual-Database Topology",
    contentMarkdownFile: "06_ARQUITETURA_LOCAL_E_REMOTA.md"
  },
  {
    id: "07_integridade",
    caderno: "Caderno 07",
    title: "Regras de Integridade, Proveniência e Requisitos Não Funcionais",
    summary: "Os 4 testes canônicos de fechamento aritmético, SHA-256, RNF-001 a RNF-008 (segurança, escala nacional, tolerância zero a desvios).",
    path: "/docs/07_REGRAS_DE_INTEGRIDADE_E_PROVENIENCIA.md",
    iconName: "FileCheck",
    badge: "Auditoria Criptográfica",
    contentMarkdownFile: "07_REGRAS_DE_INTEGRIDADE_E_PROVENIENCIA.md"
  },
  {
    id: "08_aceite",
    caderno: "Caderno 08",
    title: "Critérios de Aceite para Transição à Fase 2 e Incertezas Mapeadas",
    summary: "Respostas sem ambiguidade às 7 perguntas-chave, matriz de incertezas e mitigações, e checklist objetivo de transição.",
    path: "/docs/08_CRITERIOS_DE_ACEITE_FASE_2.md",
    iconName: "Award",
    badge: "Transição para Fase 2",
    contentMarkdownFile: "08_CRITERIOS_DE_ACEITE_FASE_2.md"
  },
  {
    id: "09_evidencias",
    caderno: "Caderno 09",
    title: "Relatório de Evidências, Validação Empírica e Estado da Fase 2",
    summary: "Relatório canônico de testes executados: 4 testes de fechamento aprovados, idempotência verificada, Sobras D'Hondt Lei 14.211/2021 validadas e publicador remoto com SHA-256.",
    path: "/docs/09_EVIDENCIAS_E_RELATORIO_FASE_2.md",
    iconName: "FileCheck",
    badge: "Fase 2 Homologada",
    contentMarkdownFile: "09_EVIDENCIAS_E_RELATORIO_FASE_2.md"
  }
];

export const ACCEPTANCE_QUESTIONS = [
  {
    question: "O que a plataforma deve fazer?",
    answer: "Investigar fenômenos eleitorais com base em evidências e dados oficiais do TSE, calculando métricas espaciais (HHI, Gini), auditando quocientes e sobras D'Hondt, e harmonizando séries históricas (2014-2024). Não gera previsões oraculares nem substitui cálculos por texto de IA.",
    status: "Concluído & Documentado",
    docRef: "01_VISAO_DO_PRODUTO.md"
  },
  {
    question: "Quais fontes serão utilizadas?",
    answer: "Arquivos brutos bulk em formato aberto do TSE: votacao_secao (seções eleitorais), votacao_candidato_munzona, detalhe_votacao (comparecimento/brancos/nulos), consulta_cand (candidatos e partidos), local_votacao e tabela de compatibilização TSE-IBGE.",
    status: "Concluído & Documentado",
    docRef: "04_CATALOGO_DE_FONTES_OFICIAIS_TSE.md"
  },
  {
    question: "Qual é a unidade de cada registro?",
    answer: "Na camada bruta de seção: (Eleicao, UF, Municipio_TSE, Zona, Secao, Cargo, Numero_Votavel). Na camada agregada: (Eleicao, UF, Municipio_TSE, Zona, SQ_CANDIDATO). Na camada de candidatura: (Eleicao, SQ_CANDIDATO). Na camada de indivíduo: (id_pessoa).",
    status: "Concluído & Documentado",
    docRef: "05_MODELO_CONCEITUAL_DE_DADOS.md"
  },
  {
    question: "Como os resultados serão calculados e validados?",
    answer: "Calculados por código determinístico (SQL/TypeScript) segundo fórmulas matemáticas abertas. Validados por 4 testes: fechamento da urna (BU), conservação de votos por agregação territorial, reconciliação de cadeiras/sobras e verificação de hashes SHA-256.",
    status: "Concluído & Documentado",
    docRef: "03_PROTOCOLO_METODOLOGICO_CIENTIFICO.md"
  },
  {
    question: "Qual banco é responsável por cada tipo de dado?",
    answer: "PostgreSQL Local: histórico atômico bruto de seções (50-200 GB), staging, particionamento e transformações analíticas pesadas. Supabase Remoto: tabelas dimensionais leves (dim_*) e projeções consolidadas servíveis na web (mart_*) com latência <250ms e RLS.",
    status: "Concluído & Documentado",
    docRef: "06_ARQUITETURA_LOCAL_E_REMOTA.md"
  },
  {
    question: "Como qualquer conclusão poderá ser reproduzida?",
    answer: "Cada indicador e projeção carrega o hash SHA-256 do arquivo original do TSE, o manifesto de execução JSON com parâmetros e a versão exata do script versionado no Git. O pipeline é estritamente idempotente.",
    status: "Concluído & Documentado",
    docRef: "07_REGRAS_DE_INTEGRIDADE_E_PROVENIENCIA.md"
  },
  {
    question: "Como o modelo suporta a expansão nacional?",
    answer: "Particionamento nativo no PostgreSQL local por ANO_ELEICAO e SG_UF, chaves universais padronizadas (TSE e IBGE), isolamento de concorrência por estado e pipelines assíncronos independentes.",
    status: "Concluído & Documentado",
    docRef: "08_CRITERIOS_DE_ACEITE_FASE_2.md"
  }
];

export const METHODOLOGY_STEPS = [
  {
    step: 1,
    title: "Formulação da Pergunta",
    desc: "Pergunta precisa em linguagem formal sem juízos morais ou vieses políticos pré-concebidos."
  },
  {
    step: 2,
    title: "Definição da Hipótese",
    desc: "Estabelecimento de Hipótese Nula (H0) e Alternativa (H1), quando aplicável a testes inferenciais."
  },
  {
    step: 3,
    title: "Delimitação Amostral",
    desc: "Definição estrita do período (anos e turnos), população de eleitores e unidade de análise (município ou zona)."
  },
  {
    step: 4,
    title: "Identificação das Fontes",
    desc: "Isolamento dos arquivos oficiais do TSE com registro de URLs oficiais e hashes criptográficos SHA-256."
  },
  {
    step: 5,
    title: "Definição de Variáveis",
    desc: "Critérios de inclusão/exclusão para votos nominais, votos em trânsito e candidaturas sub judice."
  },
  {
    step: 6,
    title: "Especificação do Cálculo",
    desc: "Fórmula matemática formal aberta (ex: D'Hondt com sobras 80/20, HHI, Quociente Eleitoral, Pedersen)."
  },
  {
    step: 7,
    title: "Validação Cruzada",
    desc: "Execução dos 4 testes de integridade aritmética e conservação da soma de votos."
  },
  {
    step: 8,
    title: "Evidências e Limitações",
    desc: "Apresentação explícita de ressalvas legais, rezoneamentos, abstenções e falácia ecológica."
  },
  {
    step: 9,
    title: "Registro de Proveniência",
    desc: "Geração do manifesto de execução (JSON) permitindo reprodução determinística independente."
  }
];

export const AI_RULES = [
  { rule: "A IA não calcula", desc: "Cálculos matemáticos, quocientes e somas são executados por código determinístico. A IA recebe números pré-validados." },
  { rule: "A IA não inventa dados", desc: "Se um dado ou candidato não consta no contexto oficial injetado, a resposta declara obrigatoriamente a ausência do dado." },
  { rule: "A IA não faz saltos causais", desc: "Proibido usar termos causais ('causou', 'provocou') sem desenho formal de identificação. Usa termos de associação empírica." },
  { rule: "Verificação de Fórmulas", desc: "Toda métrica citada usa notação matemática padronizada com autores de referência reconhecidos na literatura de ciência política." },
  { rule: "Trilha de Auditoria", desc: "Prompts e respostas analíticas mantêm registro de parâmetros e tabelas consultadas para auditoria jurídica e metodológica." }
];

export const TSE_DATASETS = [
  {
    name: "Votação por Seção Eleitoral",
    file: "votacao_secao_YYYY_UF.csv",
    granularity: "Seção Eleitoral (Atômica)",
    coverage: "1994 a 2024",
    encoding: "Latin-1 (<2020) / UTF-8 (>=2020)",
    storage: "Apenas PostgreSQL Local",
    desc: "Contagem de votos nominais e de legenda urna a urna. Base de alta volumetria (dezenas de milhões de linhas)."
  },
  {
    name: "Votação de Candidatos por Município e Zona",
    file: "votacao_candidato_munzona_YYYY_UF.csv",
    granularity: "Candidato x Município x Zona",
    coverage: "1994 a 2024",
    encoding: "Latin-1 / UTF-8",
    storage: "PostgreSQL Local e Supabase Mart",
    desc: "Votação oficial agregada por candidato com situação jurídica da candidatura (deferido, sub judice)."
  },
  {
    name: "Detalhe da Apuração e Comparecimento",
    file: "detalhe_votacao_munzona_YYYY_UF.csv",
    granularity: "Zona / Município",
    coverage: "1994 a 2024",
    encoding: "Latin-1 / UTF-8",
    storage: "PostgreSQL Local e Supabase Mart",
    desc: "Fechamento aritmético: Eleitores aptos, comparecimento, abstenção, brancos, nulos e votos anulados sub judice."
  },
  {
    name: "Consulta a Candidaturas e Federações",
    file: "consulta_cand_YYYY_UF.csv",
    granularity: "Candidatura Única por Pleito",
    coverage: "1994 a 2024",
    encoding: "Latin-1 / UTF-8",
    storage: "PostgreSQL Local e Supabase Dimensões",
    desc: "Cadastro de candidatos, SQ_CANDIDATO, número de urna, partido, federação e situação de deferimento."
  },
  {
    name: "Locais de Votação e Georreferenciamento",
    file: "local_votacao_YYYY.csv",
    granularity: "Estabelecimento de Votação",
    coverage: "2016 a 2024",
    encoding: "UTF-8",
    storage: "PostgreSQL Local e Supabase Dimensões",
    desc: "Escolas e locais físicos com associação de seções e coordenadas geográficas (lat/long) para análise espacial."
  },
  {
    name: "Perfil do Eleitorado",
    file: "perfil_eleitorado_YYYY.csv",
    granularity: "Faixa Demográfica por Zona/Município",
    coverage: "2008 a 2024",
    encoding: "UTF-8",
    storage: "PostgreSQL Local e Supabase Mart",
    desc: "Segmentação por gênero, faixa etária, escolaridade e estado civil para contextualização sociológica."
  }
];
