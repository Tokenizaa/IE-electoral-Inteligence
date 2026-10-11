/**
 * Reproducible assessment of the TSE ingestion chain.
 *
 * Reads every RETAINED artifact for the requested year from the local download
 * directory, verifies traceability, scans each CSV member with the auditable
 * reconciliation report, and produces:
 *   - data/reports/ingestion_assessment_<year>.json  (machine-readable evidence)
 *   - a human summary printed to stdout
 *
 * It never downloads, never mutates layout profiles and never promotes data to
 * the analytical layer. It only OBSERVES and reports. Missing official inputs are
 * reported as such, never as completion.
 *
 * Usage:
 *   bun run audit:ingestion                              # year 2022, bounded scan
 *   AUDIT_MAX_ROWS=0 bun run audit:ingestion             # full scan of every listed member
 *   AUDIT_MEMBERS=AC,RR bun run audit:ingestion          # restrict to members
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TseOpenDataClient } from '../src/ingestion/tseOpenData.ts';
import {
  assessTraceability,
  buildErroredMemberAssessment,
  buildMemberAssessment,
  decideChainAuthorization,
  summarizeAssessment,
  type ArtifactAssessment,
  type MemberAssessment
} from '../src/audit/ingestionAssessment.ts';
import { evaluateScopeGate, validateScope, type ScopeDeclaration } from '../src/audit/referenceScope.ts';

const YEAR = Number(process.env.AUDIT_YEAR ?? 2022);
const MAX_ROWS = process.env.AUDIT_MAX_ROWS === undefined ? 20_000 : Number(process.env.AUDIT_MAX_ROWS);
const MEMBER_FILTER = process.env.AUDIT_MEMBERS ? new Set(process.env.AUDIT_MEMBERS.split(',').map(s => s.trim()).filter(Boolean)) : null;
const REPORT_DIR = path.resolve(process.cwd(), 'data/reports');

/** Streaming SHA-256 (never buffers a multi-GB archive in memory). */
async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function selectMembers(names: string[]): string[] {
  if (!MEMBER_FILTER) return names;
  return names.filter(name => {
    const base = path.basename(name, '.csv');
    const suffix = name.match(/_([A-Z]{2})\.csv$/)?.[1];
    return MEMBER_FILTER.has(name) || MEMBER_FILTER.has(path.basename(name)) || (suffix ? MEMBER_FILTER.has(suffix) : false);
  });
}

async function main(): Promise<void> {
  const client = new TseOpenDataClient({ downloadDir: path.resolve(process.cwd(), 'var/tse-downloads') });
  const stored = await client.listStoredResources(YEAR);

  const artifacts: ArtifactAssessment[] = [];
  const allMembers: MemberAssessment[] = [];

  for (const item of stored) {
    const manifest = item.manifest;
    let sha256FileValue: string | null = null;
    let filePresent = false;
    try {
      sha256FileValue = await sha256File(manifest.local_file);
      filePresent = true;
    } catch {
      filePresent = false;
    }

    const traceability = assessTraceability({
      manifest_present: true,
      file_present: filePresent,
      sha256_manifest: manifest.sha256,
      sha256_file: sha256FileValue,
      resource_url: manifest.resource_url,
      requested_year: manifest.requested_year,
      year: YEAR,
      validation_status: manifest.validation_status
    });

    // Structural layout validation only (never approves ingestion).
    const inspection = await client.inspectStoredZip(manifest.resource_id, YEAR);
    const memberNames = selectMembers(inspection.csvs.map(csv => csv.member_name));

    const members: MemberAssessment[] = [];
    for (const memberName of memberNames) {
      const csv = inspection.csvs.find(entry => entry.member_name === memberName);
      const layoutOk = csv?.layout ? Boolean(csv.layout.ingestion_approved) : false;
      try {
        const report = await client.scanStoredZipMember(manifest.resource_id, YEAR, memberName, {
          maxRows: MAX_ROWS > 0 ? MAX_ROWS : undefined
        });
        // No declared official scope yet -> required_coverage is empty, so the gate
        // can NEVER authorize (completeness is not asserted without a scope).
        members.push(buildMemberAssessment(memberName, report, traceability.verified, layoutOk, []));
      } catch (err) {
        members.push(buildErroredMemberAssessment(memberName, err instanceof Error ? err.message : String(err)));
      }
    }

    artifacts.push({
      resource_id: manifest.resource_id,
      year: YEAR,
      dataset_title: manifest.dataset_title,
      file_name: path.basename(manifest.local_file),
      size_bytes: manifest.size_bytes,
      sha256_manifest: manifest.sha256,
      sha256_file: sha256FileValue,
      validation_status: manifest.validation_status,
      traceability,
      members
    });
    allMembers.push(...members);
  }

  const summary = summarizeAssessment(artifacts);
  const chain = decideChainAuthorization(allMembers);

  // Official scope gate (conservative): loaded from data/reference if present.
  const observedMembers = artifacts.flatMap(a => a.members.map(m => m.member));
  let scopeGate: ReturnType<typeof evaluateScopeGate> | null = null;
  let scopeViolations: string[] = [];
  let scopeContractVersion: string | null = null;
  try {
    const scopePath = path.resolve(process.cwd(), `data/reference/official_scope_${YEAR}.json`);
    const scope = JSON.parse(await readFile(scopePath, 'utf8')) as ScopeDeclaration;
    scopeContractVersion = scope.contract_version;
    scopeViolations = validateScope(scope);
    scopeGate = evaluateScopeGate(scope, observedMembers);
  } catch {
    scopeGate = null;
  }

  const report = {
    generated_at: new Date().toISOString(),
    year: YEAR,
    scan_mode: MAX_ROWS > 0 ? `bounded:${MAX_ROWS}` : 'full',
    member_filter: MEMBER_FILTER ? [...MEMBER_FILTER] : null,
    policy: {
      note: 'Ingestão analítica BLOQUEADA até reconciliação com denominadores oficiais do TSE e evidência suficiente.',
      authorization_rule: 'AUTHORIZED somente quando TODOS os membros passam: traceabilidade, layout oficialmente validado, scan COMPLETE, dedup completa, invariante de contadores e reconciliação de cobertura com tolerância zero; E o escopo oficial está integralmente validado com inventário exato.'
    },
    summary,
    chain_authorization: chain,
    scope: {
      contract_version: scopeContractVersion,
      declared: scopeGate !== null,
      validation_violations: scopeViolations,
      gate: scopeGate
    },
    artifacts
  };

  await mkdir(REPORT_DIR, { recursive: true });
  const outPath = path.join(REPORT_DIR, `ingestion_assessment_${YEAR}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`# Avaliação da cadeia de ingestão — ano ${YEAR} (modo ${report.scan_mode})`);
  console.log(`artefatos=${summary.artifacts} membros=${summary.members} completos=${summary.proven_complete} parciais=${summary.partial} faltam_evidencia_oficial=${summary.missing_official_evidence}`);
  console.log(`autorizados=${summary.authorized_members} -> decisão da cadeia: ${chain.authorized ? 'AUTHORIZED' : 'BLOCKED'}`);
  console.log(`bloqueios: ${JSON.stringify(chain.blocker_counts)}`);
  if (scopeGate) {
    console.log(`escopo oficial (${scopeContractVersion}): ${scopeGate.authorized ? 'AUTHORIZED' : 'BLOCKED'} bloqueios=${JSON.stringify(scopeGate.blockers)} inventário_ok=${scopeGate.inventory?.complete}`);
    if (scopeGate.reasons.length) console.log(`  razões: ${scopeGate.reasons.slice(0, 5).join(' | ')}`);
  } else {
    console.log('escopo oficial: não declarado (data/reference ausente)');
  }
  for (const artifact of artifacts) {
    console.log(`- ${artifact.file_name} [${artifact.traceability.status}] membros=${artifact.members.length} sha256=${artifact.sha256_file}`);
  }
  console.log(`relatório: ${outPath}`);
}

main().catch(err => {
  console.error('Falha na avaliação da cadeia de ingestão:', err);
  process.exitCode = 1;
});
