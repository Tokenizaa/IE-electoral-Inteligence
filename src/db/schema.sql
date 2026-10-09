-- ============================================================================
-- PLATAFORMA INTELIGÊNCIA ELEITORAL — MODELO FÍSICO DE DADOS (POSTGRESQL 15+)
-- FASE 2: ESQUEMA CANÔNICO NORMALIZADO COM SEPARAÇÃO DE CAMADAS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABELAS DE METADADOS E PROVENIÊNCIA (CAMADA META)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS meta_fontes_tse (
    id_fonte VARCHAR(64) PRIMARY KEY,
    nome_arquivo VARCHAR(255) NOT NULL,
    url_origem TEXT NOT NULL,
    formato VARCHAR(32) NOT NULL DEFAULT 'CSV',
    encoding_detectado VARCHAR(32) NOT NULL DEFAULT 'UTF-8',
    ano_eleicao SMALLINT NOT NULL,
    sg_uf VARCHAR(2) NOT NULL,
    tipo_conteudo VARCHAR(64) NOT NULL,
    hash_sha256 CHAR(64) NOT NULL,
    tamanho_bytes BIGINT NOT NULL CHECK (tamanho_bytes >= 0),
    data_download TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status_verificacao VARCHAR(32) NOT NULL DEFAULT 'VERIFICADO',
    observacoes TEXT
);

CREATE TABLE IF NOT EXISTS meta_execucoes_ingestao (
    id_lote VARCHAR(64) PRIMARY KEY,
    id_fonte VARCHAR(64) NOT NULL REFERENCES meta_fontes_tse(id_fonte),
    timestamp_inicio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    timestamp_fim TIMESTAMP WITH TIME ZONE,
    linhas_lidas INTEGER NOT NULL DEFAULT 0 CHECK (linhas_lidas >= 0),
    linhas_aceitas INTEGER NOT NULL DEFAULT 0 CHECK (linhas_aceitas >= 0),
    linhas_rejeitadas INTEGER NOT NULL DEFAULT 0 CHECK (linhas_rejeitadas >= 0),
    linhas_duplicadas INTEGER NOT NULL DEFAULT 0 CHECK (linhas_duplicadas >= 0),
    status VARCHAR(32) NOT NULL CHECK (status IN ('EM_PROCESSAMENTO', 'CONCLUIDO_COM_SUCESSO', 'FALHA', 'QUARENTENA')),
    relatorio_validacao JSONB
);

-- ----------------------------------------------------------------------------
-- 2. TABELAS DIMENSIONAIS CANÔNICAS (CAMADA DIM)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dim_eleicao (
    id_eleicao VARCHAR(32) PRIMARY KEY, -- ex: '2022_1T_GERAL'
    ano_eleicao SMALLINT NOT NULL,
    nr_turno SMALLINT NOT NULL CHECK (nr_turno IN (1, 2)),
    tp_eleicao VARCHAR(32) NOT NULL CHECK (tp_eleicao IN ('GERAL', 'MUNICIPAL', 'SUPLEMENTAR')),
    dt_eleicao DATE NOT NULL,
    ds_eleicao VARCHAR(128) NOT NULL,
    CONSTRAINT unq_eleicao_ano_turno UNIQUE (ano_eleicao, nr_turno, tp_eleicao)
);

CREATE TABLE IF NOT EXISTS dim_cargo (
    cd_cargo SMALLINT PRIMARY KEY,
    ds_cargo VARCHAR(64) NOT NULL,
    tp_sistema VARCHAR(32) NOT NULL CHECK (tp_sistema IN ('MAJORITARIO', 'PROPORCIONAL'))
);

CREATE TABLE IF NOT EXISTS dim_partido (
    nr_partido SMALLINT PRIMARY KEY,
    sg_partido VARCHAR(32) NOT NULL,
    nm_partido VARCHAR(128) NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_federacao (
    nr_federacao SMALLINT PRIMARY KEY,
    sg_federacao VARCHAR(64) NOT NULL,
    nm_federacao VARCHAR(128) NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_municipio_tse_ibge (
    cd_ibge INTEGER PRIMARY KEY, -- 7 dígitos oficial IBGE (ex: 4305108)
    cd_tse INTEGER NOT NULL UNIQUE, -- 5 dígitos oficial TSE (ex: 85995)
    sg_uf VARCHAR(2) NOT NULL,
    nm_municipio VARCHAR(128) NOT NULL,
    nm_regiao VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_pessoa (
    id_pessoa VARCHAR(64) PRIMARY KEY, -- UUID gerado pelo motor
    nm_civil VARCHAR(255) NOT NULL,
    dt_nascimento DATE,
    cd_genero VARCHAR(16),
    sg_uf_nascimento VARCHAR(2),
    nr_cpf_mascarado VARCHAR(16),
    hash_identidade_composta CHAR(64) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS dim_candidatura (
    id_candidatura VARCHAR(64) PRIMARY KEY,
    id_eleicao VARCHAR(32) NOT NULL REFERENCES dim_eleicao(id_eleicao),
    sq_candidato BIGINT NOT NULL, -- Sequencial de 12 dígitos oficial do TSE
    id_pessoa VARCHAR(64) NOT NULL REFERENCES dim_pessoa(id_pessoa),
    cd_cargo SMALLINT NOT NULL REFERENCES dim_cargo(cd_cargo),
    nr_candidato INTEGER NOT NULL,
    nm_urna_candidato VARCHAR(128) NOT NULL,
    nr_partido SMALLINT NOT NULL REFERENCES dim_partido(nr_partido),
    nr_federacao SMALLINT REFERENCES dim_federacao(nr_federacao),
    cd_situacao_candidatura SMALLINT NOT NULL,
    ds_situacao_candidatura VARCHAR(64) NOT NULL,
    fl_voto_valido BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT unq_candidatura_eleicao_sq UNIQUE (id_eleicao, sq_candidato)
);

-- ----------------------------------------------------------------------------
-- 3. TABELAS DE DADOS BRUTOS NORMALIZADOS (CAMADA RAW/STG)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS raw_votacao_munzona (
    id_raw VARCHAR(64) PRIMARY KEY,
    id_lote VARCHAR(64) NOT NULL REFERENCES meta_execucoes_ingestao(id_lote),
    id_eleicao VARCHAR(32) NOT NULL REFERENCES dim_eleicao(id_eleicao),
    sg_uf VARCHAR(2) NOT NULL,
    cd_tse INTEGER NOT NULL,
    nr_zona SMALLINT NOT NULL,
    cd_cargo SMALLINT NOT NULL REFERENCES dim_cargo(cd_cargo),
    sq_candidato BIGINT, -- NULL quando voto de legenda
    nr_votavel INTEGER NOT NULL,
    qt_votos INTEGER NOT NULL CHECK (qt_votos >= 0),
    tp_votavel VARCHAR(16) NOT NULL CHECK (tp_votavel IN ('NOMINAL', 'LEGENDA', 'BRANCO', 'NULO', 'ANULADO')),
    CONSTRAINT unq_votacao_munzona_item UNIQUE (id_eleicao, sg_uf, cd_tse, nr_zona, cd_cargo, nr_votavel)
);

CREATE TABLE IF NOT EXISTS raw_detalhe_apuracao (
    id_detalhe VARCHAR(64) PRIMARY KEY,
    id_lote VARCHAR(64) NOT NULL REFERENCES meta_execucoes_ingestao(id_lote),
    id_eleicao VARCHAR(32) NOT NULL REFERENCES dim_eleicao(id_eleicao),
    sg_uf VARCHAR(2) NOT NULL,
    cd_tse INTEGER NOT NULL,
    nr_zona SMALLINT NOT NULL,
    cd_cargo SMALLINT NOT NULL REFERENCES dim_cargo(cd_cargo),
    qt_aptos INTEGER NOT NULL CHECK (qt_aptos >= 0),
    qt_comparecimento INTEGER NOT NULL CHECK (qt_comparecimento >= 0),
    qt_abstencao INTEGER NOT NULL CHECK (qt_abstencao >= 0),
    qt_votos_nominais INTEGER NOT NULL CHECK (qt_votos_nominais >= 0),
    qt_votos_legenda INTEGER NOT NULL CHECK (qt_votos_legenda >= 0),
    qt_votos_brancos INTEGER NOT NULL CHECK (qt_votos_brancos >= 0),
    qt_votos_nulos INTEGER NOT NULL CHECK (qt_votos_nulos >= 0),
    qt_votos_anulados_sub_judice INTEGER NOT NULL DEFAULT 0 CHECK (qt_votos_anulados_sub_judice >= 0),
    CONSTRAINT unq_detalhe_apuracao_zona UNIQUE (id_eleicao, sg_uf, cd_tse, nr_zona, cd_cargo)
);

-- ----------------------------------------------------------------------------
-- 4. TABELAS PROJETADAS E INDICADORES (CAMADA MART)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mart_votacao_candidato_mun (
    id_mart VARCHAR(64) PRIMARY KEY,
    id_eleicao VARCHAR(32) NOT NULL REFERENCES dim_eleicao(id_eleicao),
    sq_candidato BIGINT NOT NULL,
    cd_ibge INTEGER NOT NULL REFERENCES dim_municipio_tse_ibge(cd_ibge),
    cd_tse INTEGER NOT NULL,
    qt_votos_nominais INTEGER NOT NULL CHECK (qt_votos_nominais >= 0),
    pct_sobre_registros_amostra_mun NUMERIC(6, 4) NOT NULL CHECK (pct_sobre_registros_amostra_mun >= 0 AND pct_sobre_registros_amostra_mun <= 100),
    pct_sobre_votos_candidato NUMERIC(6, 4) NOT NULL CHECK (pct_sobre_votos_candidato >= 0 AND pct_sobre_votos_candidato <= 100),
    ranking_no_municipio INTEGER NOT NULL,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unq_mart_cand_mun UNIQUE (id_eleicao, sq_candidato, cd_ibge)
);

CREATE TABLE IF NOT EXISTS mart_indicadores_candidato (
    id_indicador VARCHAR(64) PRIMARY KEY,
    id_eleicao VARCHAR(32) NOT NULL REFERENCES dim_eleicao(id_eleicao),
    sq_candidato BIGINT NOT NULL,
    cd_cargo SMALLINT NOT NULL REFERENCES dim_cargo(cd_cargo),
    total_votos_amostra INTEGER NOT NULL CHECK (total_votos_amostra >= 0),
    pct_votos_validos_amostra NUMERIC(6, 4) NOT NULL,
    hhi_concentracao NUMERIC(8, 6) NOT NULL CHECK (hhi_concentracao >= 0 AND hhi_concentracao <= 1),
    classificacao_espacial VARCHAR(64) NOT NULL,
    municipios_com_voto INTEGER NOT NULL CHECK (municipios_com_voto >= 0),
    maior_reduto_cd_ibge INTEGER REFERENCES dim_municipio_tse_ibge(cd_ibge),
    pct_maior_reduto NUMERIC(6, 4) NOT NULL,
    manifest_sha256 CHAR(64) NOT NULL,
    data_calculo TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unq_mart_indicador_cand UNIQUE (id_eleicao, sq_candidato)
);

CREATE TABLE IF NOT EXISTS mart_quocientes_eleicao (
    id_quociente VARCHAR(64) PRIMARY KEY,
    id_eleicao VARCHAR(32) NOT NULL REFERENCES dim_eleicao(id_eleicao),
    cd_cargo SMALLINT NOT NULL REFERENCES dim_cargo(cd_cargo),
    sg_uf VARCHAR(2) NOT NULL,
    qt_vagas SMALLINT NOT NULL CHECK (qt_vagas > 0),
    total_votos_validos INTEGER NOT NULL CHECK (total_votos_validos > 0),
    quociente_eleitoral INTEGER NOT NULL CHECK (quociente_eleitoral > 0),
    metodo_sobras VARCHAR(64) NOT NULL,
    distribuicao_bancadas_json JSONB NOT NULL,
    data_calculo TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unq_quociente_eleicao UNIQUE (id_eleicao, cd_cargo, sg_uf)
);

-- Índices B-Tree para alta velocidade de consulta
CREATE INDEX IF NOT EXISTS idx_candidatura_sq ON dim_candidatura(sq_candidato);
CREATE INDEX IF NOT EXISTS idx_candidatura_partido ON dim_candidatura(nr_partido);
CREATE INDEX IF NOT EXISTS idx_mart_votacao_sq ON mart_votacao_candidato_mun(sq_candidato);
CREATE INDEX IF NOT EXISTS idx_mart_votacao_mun ON mart_votacao_candidato_mun(cd_ibge);
