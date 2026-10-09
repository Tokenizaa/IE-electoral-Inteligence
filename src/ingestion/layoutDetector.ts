/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import { LayoutProfile, SourceFileMetadata } from './types.ts';

export class LayoutDetector {
  public static inspectCsv(filePath: string): LayoutProfile {
    const rawBuffer = fs.readFileSync(filePath);
    
    // Test UTF-8 validity
    let encoding: 'UTF-8' | 'ISO-8859-1' = 'UTF-8';
    let text = '';
    try {
      text = rawBuffer.toString('utf-8');
      if (text.includes('\ufffd')) {
        encoding = 'ISO-8859-1';
        text = rawBuffer.toString('latin1');
      }
    } catch {
      encoding = 'ISO-8859-1';
      text = rawBuffer.toString('latin1');
    }

    const firstLine = text.split(/\r?\n/)[0] || '';
    const separador = firstLine.includes(';') ? ';' : ',';
    const colunas = firstLine.split(separador).map(c => c.trim().replace(/^"|"$/g, ''));

    let tipo_detectado: SourceFileMetadata['tipo_conteudo'] = 'CONSULTA_CAND';
    let ano_inferido = 2022;

    const colSet = new Set(colunas.map(c => c.toUpperCase()));

    if (colSet.has('CD_IBGE') && colSet.has('CD_TSE')) {
      tipo_detectado = 'MUNICIPIO_IBGE';
    } else if (colSet.has('QT_APTOS') && colSet.has('QT_COMPARECIMENTO')) {
      tipo_detectado = 'DETALHE_APURACAO';
    } else if (colSet.has('QT_VOTOS_NOMINAIS_VALIDOS') || colSet.has('QT_VOTOS')) {
      tipo_detectado = 'VOTACAO_MUNZONA';
    } else if (colSet.has('SQ_CANDIDATO') && colSet.has('DS_SITUACAO_CANDIDATURA')) {
      tipo_detectado = 'CONSULTA_CAND';
    }

    // Detect election year from first data line
    const secondLine = text.split(/\r?\n/)[1] || '';
    if (secondLine) {
      const parts = secondLine.split(separador);
      const yearCandidate = parseInt(parts[0], 10);
      if (yearCandidate >= 1994 && yearCandidate <= 2030) {
        ano_inferido = yearCandidate;
      }
    }

    return {
      separador,
      encoding,
      colunas,
      total_colunas: colunas.length,
      tipo_detectado,
      ano_inferido
    };
  }
}
