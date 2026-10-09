/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import { ElectoralDatabase } from '../db/database.ts';
import { ChecksumValidator } from './checksum.ts';
import { LayoutDetector } from './layoutDetector.ts';
import { IngestionBatchReport, SourceFileMetadata } from './types.ts';

export class IngestionPipeline {
  constructor(private db: ElectoralDatabase) {}

  public async ingestFile(filePath: string, urlOrigem: string = 'local://sample'): Promise<IngestionBatchReport> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo não encontrado: ${filePath}`);
    }

    const sha256 = ChecksumValidator.computeFileSha256(filePath);
    const stats = fs.statSync(filePath);
    const layout = LayoutDetector.inspectCsv(filePath);
    const idFonte = `SRC_${sha256.substring(0, 16)}`;
    const idLote = `LOT_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const startTime = new Date().toISOString();

    // 1. Register Source File Metadata
    await this.db.query(
      `INSERT INTO meta_fontes_tse (
        id_fonte, nome_arquivo, url_origem, formato, encoding_detectado,
        ano_eleicao, sg_uf, tipo_conteudo, hash_sha256, tamanho_bytes,
        status_verificacao
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id_fonte) DO UPDATE SET status_verificacao = 'HASH_LOCAL_CALCULADO'`,
      [
        idFonte,
        filePath.split('/').pop() || 'unknown.csv',
        urlOrigem,
        'CSV',
        layout.encoding,
        layout.ano_inferido,
        'RS',
        layout.tipo_detectado,
        sha256,
        stats.size,
        'HASH_LOCAL_CALCULADO'
      ]
    );

    // 2. Register Initial Batch in meta_execucoes_ingestao (required for FK constraints)
    await this.db.query(
      `INSERT INTO meta_execucoes_ingestao (
        id_lote, id_fonte, timestamp_inicio, status
      ) VALUES ($1, $2, $3, $4)`,
      [idLote, idFonte, startTime, 'EM_PROCESSAMENTO']
    );

    // 3. Read File and Process Rows
    const rawBuffer = fs.readFileSync(filePath);
    const content = layout.encoding === 'UTF-8' ? rawBuffer.toString('utf-8') : rawBuffer.toString('latin1');
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);

    if (lines.length <= 1) {
      throw new Error(`Arquivo sem linhas de dados: ${filePath}`);
    }

    const header = lines[0].split(layout.separador).map(c => c.trim().replace(/^"|"$/g, '').toUpperCase());
    const colIndex = new Map<string, number>();
    header.forEach((col, idx) => colIndex.set(col, idx));

    let linhasLidas = 0;
    let linhasAceitas = 0;
    let linhasRejeitadas = 0;
    let linhasDuplicadas = 0;
    const errosAmostra: string[] = [];

    // Process row by row
    for (let i = 1; i < lines.length; i++) {
      linhasLidas++;
      const row = lines[i].split(layout.separador).map(c => c.trim().replace(/^"|"$/g, ''));
      if (row.length < header.length * 0.8) {
        linhasRejeitadas++;
        if (errosAmostra.length < 5) errosAmostra.push(`Linha ${i + 1}: colunas insuficientes (${row.length}/${header.length})`);
        continue;
      }

      try {
        if (layout.tipo_detectado === 'MUNICIPIO_IBGE') {
          await this.processMunicipioRow(row, colIndex);
          linhasAceitas++;
        } else if (layout.tipo_detectado === 'CONSULTA_CAND') {
          await this.processCandidatoRow(row, colIndex);
          linhasAceitas++;
        } else if (layout.tipo_detectado === 'VOTACAO_MUNZONA') {
          await this.processVotacaoMunZonaRow(row, colIndex, idLote);
          linhasAceitas++;
        } else if (layout.tipo_detectado === 'DETALHE_APURACAO') {
          await this.processDetalheApuracaoRow(row, colIndex, idLote);
          linhasAceitas++;
        }
      } catch (err: any) {
        if (err.message && err.message.includes('duplicate key') || err.message.includes('unique constraint') || err.message.includes('unq_')) {
          linhasDuplicadas++;
        } else {
          linhasRejeitadas++;
          if (errosAmostra.length < 5) errosAmostra.push(`Linha ${i + 1}: ${err.message}`);
        }
      }
    }

    const endTime = new Date().toISOString();
    const batchReport: IngestionBatchReport = {
      id_lote: idLote,
      id_fonte: idFonte,
      timestamp_inicio: startTime,
      timestamp_fim: endTime,
      linhas_lidas: linhasLidas,
      linhas_aceitas: linhasAceitas,
      linhas_rejeitadas: linhasRejeitadas,
      linhas_duplicadas: linhasDuplicadas,
      status: linhasRejeitadas > 0 ? 'QUARENTENA' : 'CONCLUIDO_COM_SUCESSO',
      erros_amostra: errosAmostra
    };

    // Update batch execution with final statistics
    await this.db.query(
      `UPDATE meta_execucoes_ingestao SET
        timestamp_fim = $2,
        linhas_lidas = $3,
        linhas_aceitas = $4,
        linhas_rejeitadas = $5,
        linhas_duplicadas = $6,
        status = $7,
        relatorio_validacao = $8
       WHERE id_lote = $1`,
      [
        idLote,
        endTime,
        linhasLidas,
        linhasAceitas,
        linhasRejeitadas,
        linhasDuplicadas,
        batchReport.status,
        JSON.stringify(batchReport)
      ]
    );

    return batchReport;
  }

  private async processMunicipioRow(row: string[], colIndex: Map<string, number>): Promise<void> {
    const cdIbge = parseInt(row[colIndex.get('CD_IBGE')!], 10);
    const cdTse = parseInt(row[colIndex.get('CD_TSE')!], 10);
    const sgUf = row[colIndex.get('SG_UF')!];
    const nmMunicipio = row[colIndex.get('NM_MUNICIPIO')!];
    const nmRegiao = row[colIndex.get('NM_REGIAO')!];

    await this.db.query(
      `INSERT INTO dim_municipio_tse_ibge (cd_ibge, cd_tse, sg_uf, nm_municipio, nm_regiao)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (cd_ibge) DO UPDATE SET nm_municipio = EXCLUDED.nm_municipio, nm_regiao = EXCLUDED.nm_regiao`,
      [cdIbge, cdTse, sgUf, nmMunicipio, nmRegiao]
    );
  }

  private async processCandidatoRow(row: string[], colIndex: Map<string, number>): Promise<void> {
    const ano = parseInt(row[colIndex.get('ANO_ELEICAO')!], 10);
    const turno = parseInt(row[colIndex.get('NR_TURNO')!], 10);
    const sgUf = row[colIndex.get('SG_UF')!];
    const cdCargo = parseInt(row[colIndex.get('CD_CARGO')!], 10);
    const dsCargo = row[colIndex.get('DS_CARGO')!];
    const sqCandidato = parseInt(row[colIndex.get('SQ_CANDIDATO')!], 10);
    const nrCandidato = parseInt(row[colIndex.get('NR_CANDIDATO')!], 10);
    const nmCandidato = row[colIndex.get('NM_CANDIDATO')!];
    const nmUrna = row[colIndex.get('NM_URNA_CANDIDATO')!];
    const nrCpf = row[colIndex.get('NR_CPF_CANDIDATO')!] || '';
    const cdSitCand = parseInt(row[colIndex.get('CD_SITUACAO_CANDIDATURA')!], 10);
    const dsSitCand = row[colIndex.get('DS_SITUACAO_CANDIDATURA')!];
    const nrPartido = parseInt(row[colIndex.get('NR_PARTIDO')!], 10);
    const sgPartido = row[colIndex.get('SG_PARTIDO')!];
    const nmPartido = row[colIndex.get('NM_PARTIDO')!];
    const nrFederacao = row[colIndex.get('NR_FEDERACAO')!] ? parseInt(row[colIndex.get('NR_FEDERACAO')!], 10) : null;
    const sgFederacao = row[colIndex.get('SG_FEDERACAO')!] || null;
    const dtNasc = row[colIndex.get('DT_NASCIMENTO')!] || null;
    const cdGenero = row[colIndex.get('CD_GENERO')!] || null;
    const sgUfNasc = row[colIndex.get('SG_UF_NASCIMENTO')!] || sgUf;

    const idEleicao = `${ano}_${turno}T_GERAL`;

    // Ensure Election
    await this.db.query(
      `INSERT INTO dim_eleicao (id_eleicao, ano_eleicao, nr_turno, tp_eleicao, dt_eleicao, ds_eleicao)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id_eleicao) DO NOTHING`,
      [idEleicao, ano, turno, 'GERAL', `${ano}-10-02`, `Eleições Gerais ${ano}`]
    );

    // Ensure Cargo
    await this.db.query(
      `INSERT INTO dim_cargo (cd_cargo, ds_cargo, tp_sistema)
       VALUES ($1, $2, $3)
       ON CONFLICT (cd_cargo) DO NOTHING`,
      [cdCargo, dsCargo, cdCargo === 7 || cdCargo === 6 || cdCargo === 13 ? 'PROPORCIONAL' : 'MAJORITARIO']
    );

    // Ensure Partido
    await this.db.query(
      `INSERT INTO dim_partido (nr_partido, sg_partido, nm_partido)
       VALUES ($1, $2, $3)
       ON CONFLICT (nr_partido) DO UPDATE SET sg_partido = EXCLUDED.sg_partido, nm_partido = EXCLUDED.nm_partido`,
      [nrPartido, sgPartido, nmPartido]
    );

    // Ensure Federacao if applicable
    if (nrFederacao && sgFederacao) {
      await this.db.query(
        `INSERT INTO dim_federacao (nr_federacao, sg_federacao, nm_federacao)
         VALUES ($1, $2, $3)
         ON CONFLICT (nr_federacao) DO NOTHING`,
        [nrFederacao, sgFederacao, sgFederacao]
      );
    }

    // Ensure Pessoa with Composite Disambiguation Hash
    const identityString = `${nmCandidato}|${dtNasc || ''}|${sgUfNasc}`.toUpperCase();
    const hashPessoa = crypto.createHash('sha256').update(identityString).digest('hex');
    const idPessoa = `PES_${hashPessoa.substring(0, 16)}`;

    await this.db.query(
      `INSERT INTO dim_pessoa (id_pessoa, nm_civil, dt_nascimento, cd_genero, sg_uf_nascimento, nr_cpf_mascarado, hash_identidade_composta)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (hash_identidade_composta) DO UPDATE SET nm_civil = EXCLUDED.nm_civil`,
      [idPessoa, nmCandidato, dtNasc, cdGenero, sgUfNasc, nrCpf, hashPessoa]
    );

    // Ensure Candidatura
    const idCandidatura = `CAN_${idEleicao}_${sqCandidato}`;
    await this.db.query(
      `INSERT INTO dim_candidatura (
        id_candidatura, id_eleicao, sq_candidato, id_pessoa, cd_cargo,
        nr_candidato, nm_urna_candidato, nr_partido, nr_federacao,
        cd_situacao_candidatura, ds_situacao_candidatura, fl_voto_valido
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id_eleicao, sq_candidato) DO UPDATE SET
        nm_urna_candidato = EXCLUDED.nm_urna_candidato,
        cd_situacao_candidatura = EXCLUDED.cd_situacao_candidatura,
        ds_situacao_candidatura = EXCLUDED.ds_situacao_candidatura`,
      [
        idCandidatura,
        idEleicao,
        sqCandidato,
        idPessoa,
        cdCargo,
        nrCandidato,
        nmUrna,
        nrPartido,
        nrFederacao,
        cdSitCand,
        dsSitCand,
        cdSitCand === 2 || cdSitCand === 16 // Deferido ou deferido com recurso
      ]
    );
  }

  private async processVotacaoMunZonaRow(row: string[], colIndex: Map<string, number>, idLote: string): Promise<void> {
    const ano = parseInt(row[colIndex.get('ANO_ELEICAO')!], 10);
    const turno = parseInt(row[colIndex.get('NR_TURNO')!], 10);
    const sgUf = row[colIndex.get('SG_UF')!];
    const cdTse = parseInt(row[colIndex.get('CD_MUNICIPIO')!], 10);
    const nrZona = parseInt(row[colIndex.get('NR_ZONA')!], 10);
    const cdCargo = parseInt(row[colIndex.get('CD_CARGO')!], 10);
    const sqCandRaw = row[colIndex.get('SQ_CANDIDATO')!];
    const sqCandidato = sqCandRaw && sqCandRaw !== '' ? parseInt(sqCandRaw, 10) : null;
    const nrCandRaw = row[colIndex.get('NR_CANDIDATO')!] || row[colIndex.get('NR_PARTIDO')!];
    const nrVotavel = parseInt(nrCandRaw, 10);
    const qtVotos = parseInt(row[colIndex.get('QT_VOTOS_NOMINAIS_VALIDOS')!], 10);
    const tpVotavel = (row[colIndex.get('TP_VOTAVEL')!] || (sqCandidato ? 'NOMINAL' : 'LEGENDA')) as any;

    const idEleicao = `${ano}_${turno}T_GERAL`;
    const idRaw = `RAW_MZ_${idEleicao}_${sgUf}_${cdTse}_${nrZona}_${cdCargo}_${nrVotavel}`;

    await this.db.query(
      `INSERT INTO raw_votacao_munzona (
        id_raw, id_lote, id_eleicao, sg_uf, cd_tse, nr_zona,
        cd_cargo, sq_candidato, nr_votavel, qt_votos, tp_votavel
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id_eleicao, sg_uf, cd_tse, nr_zona, cd_cargo, nr_votavel)
      DO UPDATE SET qt_votos = EXCLUDED.qt_votos`,
      [idRaw, idLote, idEleicao, sgUf, cdTse, nrZona, cdCargo, sqCandidato, nrVotavel, qtVotos, tpVotavel]
    );
  }

  private async processDetalheApuracaoRow(row: string[], colIndex: Map<string, number>, idLote: string): Promise<void> {
    const ano = parseInt(row[colIndex.get('ANO_ELEICAO')!], 10);
    const turno = parseInt(row[colIndex.get('NR_TURNO')!], 10);
    const sgUf = row[colIndex.get('SG_UF')!];
    const cdTse = parseInt(row[colIndex.get('CD_MUNICIPIO')!], 10);
    const nrZona = parseInt(row[colIndex.get('NR_ZONA')!], 10);
    const cdCargo = parseInt(row[colIndex.get('CD_CARGO')!], 10);
    const qtAptos = parseInt(row[colIndex.get('QT_APTOS')!], 10);
    const qtComparecimento = parseInt(row[colIndex.get('QT_COMPARECIMENTO')!], 10);
    const qtAbstencao = parseInt(row[colIndex.get('QT_ABSTENCAO')!], 10);
    const qtNominais = parseInt(row[colIndex.get('QT_VOTOS_NOMINAIS')!], 10);
    const qtLegenda = parseInt(row[colIndex.get('QT_VOTOS_LEGENDA')!], 10);
    const qtBrancos = parseInt(row[colIndex.get('QT_VOTOS_BRANCOS')!], 10);
    const qtNulos = parseInt(row[colIndex.get('QT_VOTOS_NULOS')!], 10);
    const qtAnulados = parseInt(row[colIndex.get('QT_VOTOS_ANULADOS_SUB_JUDICE')!] || '0', 10);

    const idEleicao = `${ano}_${turno}T_GERAL`;
    const idDetalhe = `DET_MZ_${idEleicao}_${sgUf}_${cdTse}_${nrZona}_${cdCargo}`;

    await this.db.query(
      `INSERT INTO raw_detalhe_apuracao (
        id_detalhe, id_lote, id_eleicao, sg_uf, cd_tse, nr_zona, cd_cargo,
        qt_aptos, qt_comparecimento, qt_abstencao, qt_votos_nominais,
        qt_votos_legenda, qt_votos_brancos, qt_votos_nulos, qt_votos_anulados_sub_judice
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id_eleicao, sg_uf, cd_tse, nr_zona, cd_cargo)
      DO UPDATE SET
        qt_aptos = EXCLUDED.qt_aptos,
        qt_comparecimento = EXCLUDED.qt_comparecimento,
        qt_abstencao = EXCLUDED.qt_abstencao,
        qt_votos_nominais = EXCLUDED.qt_votos_nominais,
        qt_votos_legenda = EXCLUDED.qt_votos_legenda,
        qt_votos_brancos = EXCLUDED.qt_votos_brancos,
        qt_votos_nulos = EXCLUDED.qt_votos_nulos,
        qt_votos_anulados_sub_judice = EXCLUDED.qt_votos_anulados_sub_judice`,
      [
        idDetalhe, idLote, idEleicao, sgUf, cdTse, nrZona, cdCargo,
        qtAptos, qtComparecimento, qtAbstencao, qtNominais,
        qtLegenda, qtBrancos, qtNulos, qtAnulados
      ]
    );
  }
}
