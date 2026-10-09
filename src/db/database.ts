/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';

export class ElectoralDatabase {
  private db: PGlite | null = null;
  private isInitialized = false;

  constructor(private dataDir?: string) {}

  public async connect(): Promise<PGlite> {
    if (!this.db) {
      this.db = this.dataDir ? new PGlite(this.dataDir) : new PGlite();
    }
    return this.db;
  }

  public async initSchema(): Promise<void> {
    const client = await this.connect();
    const schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    await client.exec(sql);
    this.isInitialized = true;
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const client = await this.connect();
    const res = await client.query(sql, params);
    return res.rows as T[];
  }

  public async exec(sql: string): Promise<void> {
    const client = await this.connect();
    await client.exec(sql);
  }

  public async transaction<T>(callback: (client: PGlite) => Promise<T>): Promise<T> {
    const client = await this.connect();
    await client.exec('BEGIN;');
    try {
      const result = await callback(client);
      await client.exec('COMMIT;');
      return result;
    } catch (err) {
      await client.exec('ROLLBACK;');
      throw err;
    }
  }

  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}
