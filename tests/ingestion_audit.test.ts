/**
 * Regression tests for the ingestion-chain assessment (phase: auditoria e
 * consolidação da cadeia de ingestão).
 *
 * Covers: traceability, authorization gate, completeness classification, gate
 * built from a real reconciliation report, and end-to-end classification of a
 * scanned member (fixture).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildZip } from './helpers/zipBuilder.ts';
import { TseOpenDataClient } from '../src/ingestion/tseOpenData.ts';
import {
  assessTraceability,
  buildGate,
  buildMemberAssessment,
  classifyCompleteness,
  decideAuthorization,
  decideChainAuthorization,
  isOfficialTseUrl,
  summarizeAssessment,
  type AuthorizationGateInput,
  type ArtifactAssessment
} from '../src/audit/ingestionAssessment.ts';

const OK_GATE: AuthorizationGateInput = {
  traceability_verified: true,
  layout_officially_validated: true,
  scan_status: 'COMPLETE',
  duplicate_scan_complete: true,
  counter_invariants_ok: true,
  official_denominator_present: true,
  reconciled_zero_tolerance: true
};

const TRACE_OK = {
  manifest_present: true,
  file_present: true,
  sha256_manifest: 'AB'.repeat(32),
  sha256_file: 'ab'.repeat(32),
  resource_url: 'https://cdn.tse.jus.br/estatistica/x.zip',
  requested_year: 2022,
  year: 2022,
  validation_status: 'DOWNLOADED_HASHED_LAYOUT_REVIEW_REQUIRED'
};

async function run() {
  console.log('Running ingestion assessment tests...');

  // 1) official host allowlist
  console.log('1) isOfficialTseUrl');
  assert.equal(isOfficialTseUrl('https://cdn.tse.jus.br/estatistica/x.zip'), true);
  assert.equal(isOfficialTseUrl('https://dadosabertos.tse.jus.br/api'), true);
  assert.equal(isOfficialTseUrl('http://cdn.tse.jus.br/x.zip'), false, 'HTTP rejected');
  assert.equal(isOfficialTseUrl('https://evil.example.com/x.zip'), false);
  assert.equal(isOfficialTseUrl(null), false);
  console.log('  OK');

  // 2) traceability
  console.log('2) assessTraceability');
  assert.equal(assessTraceability(TRACE_OK).status, 'VERIFIED_LOCAL_HASH');
  assert.equal(assessTraceability(TRACE_OK).verified, true);
  assert.equal(assessTraceability({ ...TRACE_OK, sha256_file: 'ff'.repeat(32) }).status, 'HASH_MISMATCH');
  assert.equal(assessTraceability({ ...TRACE_OK, resource_url: 'https://evil.example.com/x.zip' }).status, 'NON_OFFICIAL_URL');
  assert.equal(assessTraceability({ ...TRACE_OK, requested_year: 2018 }).status, 'YEAR_MISMATCH');
  assert.equal(assessTraceability({ ...TRACE_OK, manifest_present: false, sha256_manifest: null }).status, 'MANIFEST_MISSING');
  assert.equal(assessTraceability({ ...TRACE_OK, file_present: false }).status, 'FILE_MISSING');
  console.log('  OK');

  // 2) authorization gate
  console.log('2) decideAuthorization');
  assert.equal(decideAuthorization(OK_GATE).authorized, true, 'all gates => AUTHORIZED');
  assert.ok(decideAuthorization({ ...OK_GATE, traceability_verified: false }).blockers.includes('TRACEABILITY_NOT_VERIFIED'));
  assert.ok(decideAuthorization({ ...OK_GATE, layout_officially_validated: false }).blockers.includes('LAYOUT_NOT_OFFICIALLY_VALIDATED'));
  assert.ok(decideAuthorization({ ...OK_GATE, scan_status: 'PARTIAL_MAX_ROWS' }).blockers.includes('SCAN_NOT_COMPLETE'));
  assert.ok(decideAuthorization({ ...OK_GATE, duplicate_scan_complete: false }).blockers.includes('DUPLICATE_SCAN_INCOMPLETE'));
  assert.ok(decideAuthorization({ ...OK_GATE, counter_invariants_ok: false }).blockers.includes('COUNTER_INVARIANT_VIOLATION'));
  assert.ok(decideAuthorization({ ...OK_GATE, official_denominator_present: false }).blockers.includes('NO_OFFICIAL_DENOMINATOR'));
  assert.ok(decideAuthorization({ ...OK_GATE, reconciled_zero_tolerance: false }).blockers.includes('RECONCILIATION_NOT_ZERO_TOLERANCE'));
  console.log('  OK');

  // 3) classifyCompleteness
  console.log('3) classifyCompleteness');
  assert.equal(classifyCompleteness(OK_GATE), 'PROVEN_COMPLETE');
  assert.equal(
    classifyCompleteness({ ...OK_GATE, layout_officially_validated: false, official_denominator_present: false, reconciled_zero_tolerance: false }),
    'MISSING_OFFICIAL_EVIDENCE'
  );
  assert.equal(classifyCompleteness({ ...OK_GATE, scan_status: 'PARTIAL_MAX_ROWS' }), 'PARTIAL');
  assert.equal(classifyCompleteness({ ...OK_GATE, traceability_verified: false }), 'PARTIAL');
  console.log('  OK');

  // 4) end-to-end classification of a real scanned member (fixture)
  console.log('4) scanStoredZipMember -> buildMemberAssessment');
  const resourceId = '40fdcf49-256a-4c81-87cf-711545bd1528';
  const root = await mkdtemp(path.join(os.tmpdir(), 'tse-audit-test-'));
  try {
    const yearDir = path.join(root, '2022');
    await mkdir(yearDir, { recursive: true });
    const memberName = 'votacao_candidato_munzona_2022_RR.csv';
    const fixture = Buffer.from(
      'ANO_ELEICAO;SG_UF;CD_CARGO;NR_TURNO;CD_MUNICIPIO;NR_ZONA;SQ_CANDIDATO;QT_VOTOS_NOMINAIS_VALIDOS\n' +
      '2022;RR;6;1;1001;1;100;10\n' +
      '2022;RR;6;1;1001;1;100;10\n' +
      '2022;RR;6;1;1002;1;101;20\n',
      'latin1'
    );
    const zipBytes = buildZip([{ name: memberName, data: fixture }]);
    const zipPath = path.join(yearDir, `${resourceId}-audit.zip`);
    await writeFile(zipPath, zipBytes);
    const sha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${zipPath}.manifest.json`, JSON.stringify({
      source: 'Portal de Dados Abertos do TSE',
      resource_id: resourceId,
      dataset_id: 'resultados-2022',
      dataset_title: 'Resultados - 2022',
      resource_name: 'Votação nominal por município e zona',
      resource_url: 'https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip',
      requested_year: 2022,
      detected_kind: 'VOTACAO_NOMINAL_MUNICIPIO_ZONA',
      format: 'CSV',
      size_bytes: zipBytes.length,
      sha256,
      downloaded_at: '2026-01-01T00:00:00.000Z',
      validation_status: 'DOWNLOADED_HASHED_LAYOUT_REVIEW_REQUIRED',
      validation: { extension_matches_format: false, signature_valid: true, csv_header: null, notes: [] },
      local_file: zipPath
    }), { encoding: 'utf8' });

    const client = new TseOpenDataClient({ downloadDir: root });
    const report = await client.scanStoredZipMember(resourceId, 2022, memberName);
    assert.equal(report.summary.counters.records_read, 3);
    assert.equal(report.duplicates.length, 1, 'duplicate detected in fixture');
    assert.equal(report.duplicate_scan.complete, true);

    const gate = buildGate({ traceability_verified: true, layout_officially_validated: false, report });
    const decision = decideAuthorization(gate);
    assert.equal(decision.authorized, false, 'never authorized without validated layout + denominator');
    assert.ok(decision.blockers.includes('LAYOUT_NOT_OFFICIALLY_VALIDATED'));
    assert.ok(decision.blockers.includes('NO_OFFICIAL_DENOMINATOR'));

    const member = buildMemberAssessment(memberName, report, true, false);
    assert.equal(member.class, 'MISSING_OFFICIAL_EVIDENCE', 'complete scan, missing official inputs');
    assert.equal(member.authorized, false);
    assert.equal(member.duplicate_scan_complete, true);

    // Bounded scan -> PARTIAL (scan insufficiency), never complete.
    const bounded = await client.scanStoredZipMember(resourceId, 2022, memberName, { maxRows: 1 });
    const boundedMember = buildMemberAssessment(memberName, bounded, true, true);
    assert.equal(boundedMember.class, 'PARTIAL');
    console.log('  OK');

    // 5) chain summary + authorization
    console.log('5) summarize / decideChainAuthorization');
    const artifacts: ArtifactAssessment[] = [{
      resource_id: resourceId,
      year: 2022,
      dataset_title: 'Resultados - 2022',
      file_name: path.basename(zipPath),
      size_bytes: zipBytes.length,
      sha256_manifest: sha256,
      sha256_file: sha256,
      validation_status: 'DOWNLOADED_HASHED_LAYOUT_REVIEW_REQUIRED',
      traceability: assessTraceability({ ...TRACE_OK, sha256_manifest: sha256, sha256_file: sha256 }),
      members: [buildMemberAssessment(memberName, report, true, false), boundedMember]
    }];
    const summary = summarizeAssessment(artifacts);
    assert.equal(summary.artifacts, 1);
    assert.equal(summary.members, 2);
    assert.equal(summary.missing_official_evidence, 1);
    assert.equal(summary.partial, 1);
    assert.equal(summary.authorized_members, 0);

    const chain = decideChainAuthorization(artifacts[0].members);
    assert.equal(chain.authorized, false);
    assert.ok(chain.blocker_counts.NO_OFFICIAL_DENOMINATOR >= 1);
    console.log('  OK');
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  console.log('\n=== ALL INGESTION ASSESSMENT TESTS PASSED ===');
}

run().catch(err => {
  console.error('Tests failed:', err);
  process.exitCode = 1;
});
