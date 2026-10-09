/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto';
import * as fs from 'fs';

export class ChecksumValidator {
  public static computeFileSha256(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  public static computeStringSha256(content: string): string {
    const hashSum = crypto.createHash('sha256');
    hashSum.update(content, 'utf8');
    return hashSum.digest('hex');
  }

  public static verifyFile(filePath: string, expectedHash: string): boolean {
    const actualHash = this.computeFileSha256(filePath);
    return actualHash.toLowerCase() === expectedHash.toLowerCase();
  }
}
