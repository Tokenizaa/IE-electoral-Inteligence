-- ============================================================================
-- PLATAFORMA INTELIGÊNCIA ELEITORAL — ESQUEMA DE PUBLICAÇÃO REMOTA (SUPABASE)
-- DATA MART SERVÍVEL NA WEB COM ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- 1. Metadados de Publicação Remota e Auditoria de Lotes
CREATE TABLE IF NOT EXISTS meta_publicacoes_remotas (
    id_publicacao VARCHAR(64) PRIMARY KEY,
    id_eleicao VARCHAR(32) NOT NULL,
    sg_uf VARCHAR(2) NOT NULL,
    timestamp_publicacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    versao_metodologia VARCHAR(32) NOT NULL,
    hash_manifesto_local CHAR(64) NOT NULL,
    total_registros_mart INTEGER NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PUBLICADO_ATIVO'
);

-- 2. Tabelas Dimensionais Essenciais para Filtros e Busca na Aplicação
CREATE TABLE IF NOT EXISTS dim_eleicao (
    id_eleicao VARCHAR(32) PRIMARY KEY,
    ano_eleicao SMALLINT NOT NULL,
    nr_turno SMALLINT NOT NULL,
    tp_eleicao VARCHAR(32) NOT NULL,
    dt_eleicao DATE NOT NULL,
    ds_eleicao VARCHAR(128) NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_cargo (
    cd_cargo SMALLINT PRIMARY KEY,
    ds_cargo VARCHAR(64) NOT NULL,
    tp_sistema VARCHAR(32) NOT NULL
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
    cd_ibge INTEGER PRIMARY KEY,
    cd_tse INTEGER NOT NULL UNIQUE,
    sg_uf VARCHAR(2) NOT NULL,
    nm_municipio VARCHAR(128) NOT NULL,
    nm_regiao VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_candidatura (
    id_candidatura VARCHAR(64) PRIMARY KEY,
    id_eleicao VARCHAR(32) NOT NULL REFERENCES dim_eleicao(id_eleicao),
    sq_candidato BIGINT NOT NULL,
    cd_cargo SMALLINT NOT NULL REFERENCES dim_cargo(cd_cargo),
    nr_candidato INTEGER NOT NULL,
    nm_urna_candidato VARCHAR(128) NOT NULL,
    nr_partido SMALLINT NOT NULL REFERENCES dim_partido(nr_partido),
    nr_federacao SMALLINT,
    cd_situacao_candidatura SMALLINT NOT NULL,
    ds_situacao_candidatura VARCHAR(64) NOT NULL,
    fl_voto_valido BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT unq_remoto_cand UNIQUE (id_eleicao, sq_candidato)
);

-- 3. Data Marts Consolidados para Consumo Ultra-Rápido na Web
CREATE TABLE IF NOT EXISTS mart_votacao_candidato_mun (
    id_mart VARCHAR(64) PRIMARY KEY,
    id_eleicao VARCHAR(32) NOT NULL REFERENCES dim_eleicao(id_eleicao),
    sq_candidato BIGINT NOT NULL,
    cd_ibge INTEGER NOT NULL REFERENCES dim_municipio_tse_ibge(cd_ibge),
    cd_tse INTEGER NOT NULL,
    qt_votos_nominais INTEGER NOT NULL CHECK (qt_votos_nominais >= 0),
    pct_sobre_validos_mun NUMERIC(6, 4) NOT NULL,
    pct_sobre_votos_candidato NUMERIC(6, 4) NOT NULL,
    ranking_no_municipio INTEGER NOT NULL,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unq_remoto_mart_mun UNIQUE (id_eleicao, sq_candidato, cd_ibge)
);

CREATE TABLE IF NOT EXISTS mart_indicadores_candidato (
    id_indicador VARCHAR(64) PRIMARY KEY,
    id_eleicao VARCHAR(32) NOT NULL REFERENCES dim_eleicao(id_eleicao),
    sq_candidato BIGINT NOT NULL,
    cd_cargo SMALLINT NOT NULL REFERENCES dim_cargo(cd_cargo),
    total_votos_estado INTEGER NOT NULL,
    pct_votos_validos_estado NUMERIC(6, 4) NOT NULL,
    hhi_concentracao NUMERIC(8, 6) NOT NULL,
    classificacao_espacial VARCHAR(64) NOT NULL,
    municipios_com_voto INTEGER NOT NULL,
    maior_reduto_cd_ibge INTEGER REFERENCES dim_municipio_tse_ibge(cd_ibge),
    pct_maior_reduto NUMERIC(6, 4) NOT NULL,
    manifest_sha256 CHAR(64) NOT NULL,
    data_calculo TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unq_remoto_indicador UNIQUE (id_eleicao, sq_candidato)
);

CREATE TABLE IF NOT EXISTS mart_quocientes_eleicao (
    id_quociente VARCHAR(64) PRIMARY KEY,
    id_eleicao VARCHAR(32) NOT NULL REFERENCES dim_eleicao(id_eleicao),
    cd_cargo SMALLINT NOT NULL REFERENCES dim_cargo(cd_cargo),
    sg_uf VARCHAR(2) NOT NULL,
    qt_vagas SMALLINT NOT NULL,
    total_votos_validos INTEGER NOT NULL,
    quociente_eleitoral INTEGER NOT NULL,
    metodo_sobras VARCHAR(64) NOT NULL,
    distribuicao_bancadas_json JSONB NOT NULL,
    data_calculo TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unq_remoto_quociente UNIQUE (id_eleicao, cd_cargo, sg_uf)
);

-- ============================================================================
-- POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- Leitura pública para anon e authenticated; Escritas bloqueadas para service_role
-- ============================================================================

ALTER TABLE dim_eleicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_cargo ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_partido ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_federacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_municipio_tse_ibge ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_candidatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE mart_votacao_candidato_mun ENABLE ROW LEVEL SECURITY;
ALTER TABLE mart_indicadores_candidato ENABLE ROW LEVEL SECURITY;
ALTER TABLE mart_quocientes_eleicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_publicacoes_remotas ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura Aberta
CREATE POLICY "Public Read dim_eleicao" ON dim_eleicao FOR SELECT USING (true);
CREATE POLICY "Public Read dim_cargo" ON dim_cargo FOR SELECT USING (true);
CREATE POLICY "Public Read dim_partido" ON dim_partido FOR SELECT USING (true);
CREATE POLICY "Public Read dim_federacao" ON dim_federacao FOR SELECT USING (true);
CREATE POLICY "Public Read dim_municipio_tse_ibge" ON dim_municipio_tse_ibge FOR SELECT USING (true);
CREATE POLICY "Public Read dim_candidatura" ON dim_candidatura FOR SELECT USING (true);
CREATE POLICY "Public Read mart_votacao_candidato_mun" ON mart_votacao_candidato_mun FOR SELECT USING (true);
CREATE POLICY "Public Read mart_indicadores_candidato" ON mart_indicadores_candidato FOR SELECT USING (true);
CREATE POLICY "Public Read mart_quocientes_eleicao" ON mart_quocientes_eleicao FOR SELECT USING (true);
CREATE POLICY "Public Read meta_publicacoes_remotas" ON meta_publicacoes_remotas FOR SELECT USING (true);
