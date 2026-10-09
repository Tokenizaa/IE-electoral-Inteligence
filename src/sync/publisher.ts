/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ElectoralDatabase } from '../db/database.ts';
import { IntegrityEngine } from '../integrity/integrityEngine.ts';

export interface PublicationManifest {
  id_publicacao: string;
  id_eleicao: string;
  sg_uf: string;
  timestamp: string;
  versao_metodologia: string;
  status_auditoria: string;
  total_municipios_projetados: number;
  total_indicadores_projetados: number;
  sha256_manifesto: string;
}

export class RemotePublisher {
  constructor(private db: ElectoralDatabase) {}

  public async generatePublicationBatch(idEleicao: string, sgUf: string = 'RS'): Promise<PublicationManifest> {
    // 1. Mandatory Integrity Gate: Verify that audit passed 100%
    const integrity = new IntegrityEngine(this.db);
    const audit = await integrity.runFullAudit(idEleicao);
    if (audit.status_geral !== 'APROVADO') {
      throw new Error(`Publicação remota abortada: falha nos testes de integridade para a eleição ${idEleicao}.`);
    }

    // 2. Count projected mart records
    const munCount = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM mart_votacao_candidato_mun WHERE id_eleicao = $1',
      [idEleicao]
    );
    const indCount = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM mart_indicadores_candidato WHERE id_eleicao = $1',
      [idEleicao]
    );

    const timestamp = new Date().toISOString();
    const idPublicacao = `PUB_${idEleicao}_${sgUf}_${Date.now()}`;
    const payloadForHash = `${idPublicacao}|${idEleicao}|${sgUf}|${munCount[0].count}|${indCount[0].count}|${timestamp}`;
    const sha256 = crypto.createHash('sha256').update(payloadForHash).digest('hex');

    const manifest: PublicationManifest = {
      id_publicacao: idPublicacao,
      id_eleicao: idEleicao,
      sg_uf: sgUf,
      timestamp,
      versao_metodologia: '1.0.0-PROD-VERIFIED',
      status_auditoria: audit.status_geral,
      total_municipios_projetados: parseInt(munCount[0].count, 10),
      total_indicadores_projetados: parseInt(indCount[0].count, 10),
      sha256_manifesto: sha256
    };

    // Save manifest to disk
    const manifestPath = path.resolve(process.cwd(), `data/manifests/manifest_${idPublicacao}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    return manifest;
  }
}
