/**
 * Assessment logic for the electoral ingestion chain (pure, no I/O).
 *
 * Turns observable evidence (retained-artifact manifest facts + per-member scan
 * reports) into an OBJECTIVE authorization decision and a completeness class.
 *
 * Contract:
 * - "Processed records" is NEVER equated with "proven coverage".
 * - Analytical ingestion is AUTHORIZED only when all gate conditions hold.
 * - Missing official inputs (official denominator, officially-validated layout)
 *   classify the result as MISSING_OFFICIAL_EVIDENCE, never as complete.
 */
import {
  counterInvariantViolations,
  type TseCoverageEntry,
  type TseReconciliationReport,
  type TseScanCounters,
  type TseScanStatus
} from '../ingestion/tseReconciliation.ts';

/** Official TSE hosts allowed by the acquisition layer (HTTPS only). */
export function isOfficialTseUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && (
      url.hostname === 'dadosabertos.tse.jus.br' ||
      url.hostname === 'www.tse.jus.br' ||
      url.hostname === 'tse.jus.br' ||
      url.hostname.endsWith('.tse.jus.br')
    );
  } catch {
    return false;
  }
}

export interface TraceabilityInput {
  manifest_present: boolean;
  file_present: boolean;
  sha256_manifest: string | null;
  sha256_file: string | null;
  resource_url: string | null;
  requested_year: number | null;
  year: number;
  validation_status: string | null;
}

export type TraceabilityStatus =
  | 'VERIFIED_LOCAL_HASH'
  | 'MANIFEST_MISSING'
  | 'FILE_MISSING'
  | 'HASH_MISMATCH'
  | 'NON_OFFICIAL_URL'
  | 'YEAR_MISMATCH';

export interface Traceability {
  status: TraceabilityStatus;
  /** True only when manifest+file+hash+official URL+year all agree. */
  verified: boolean;
  reasons: string[];
}

/**
 * Traceability proves the retained file matches its OWN manifest and came from an
 * official host for the requested year. It does NOT prove the manifest hash equals
 * the official TSE publication (no independent source consulted).
 */
export function assessTraceability(input: TraceabilityInput): Traceability {
  const reasons: string[] = [];
  let status: TraceabilityStatus;

  if (!input.manifest_present) { status = 'MANIFEST_MISSING'; reasons.push('Manifesto de download ausente.'); }
  else if (!input.file_present) { status = 'FILE_MISSING'; reasons.push('Arquivo retido ausente.'); }
  else if (!input.sha256_manifest || !input.sha256_file || input.sha256_manifest.toLowerCase() !== input.sha256_file.toLowerCase()) {
    status = 'HASH_MISMATCH'; reasons.push('SHA-256 do arquivo difere do manifesto.');
  } else if (!isOfficialTseUrl(input.resource_url)) { status = 'NON_OFFICIAL_URL'; reasons.push('URL de origem fora dos hosts oficiais do TSE.'); }
  else if (input.requested_year !== null && input.requested_year !== input.year) { status = 'YEAR_MISMATCH'; reasons.push(`Ano do manifesto (${input.requested_year}) difere do solicitado (${input.year}).`); }
  else { status = 'VERIFIED_LOCAL_HASH'; reasons.push('Arquivo confere com o manifesto; origem oficial; ano confere. Hash local ainda NÃO comparado à publicação oficial.'); }

  if (input.validation_status) reasons.push(`validation_status=${input.validation_status}`);
  return { status, verified: status === 'VERIFIED_LOCAL_HASH', reasons };
}

export interface AuthorizationGateInput {
  traceability_verified: boolean;
  layout_officially_validated: boolean;
  scan_status: TseScanStatus;
  duplicate_scan_complete: boolean;
  counter_invariants_ok: boolean;
  official_denominator_present: boolean;
  reconciled_zero_tolerance: boolean;
}

export type AuthorizationBlocker =
  | 'TRACEABILITY_NOT_VERIFIED'
  | 'LAYOUT_NOT_OFFICIALLY_VALIDATED'
  | 'SCAN_NOT_COMPLETE'
  | 'DUPLICATE_SCAN_INCOMPLETE'
  | 'COUNTER_INVARIANT_VIOLATION'
  | 'NO_OFFICIAL_DENOMINATOR'
  | 'RECONCILIATION_NOT_ZERO_TOLERANCE';

export interface AuthorizationDecision {
  authorized: boolean;
  blockers: AuthorizationBlocker[];
}

/** Authorized only when NO blocker remains. */
export function decideAuthorization(gate: AuthorizationGateInput): { authorized: boolean; blockers: AuthorizationBlocker[] } {
  const blockers: AuthorizationBlocker[] = [];
  if (!gate.traceability_verified) blockers.push('TRACEABILITY_NOT_VERIFIED');
  if (!gate.layout_officially_validated) blockers.push('LAYOUT_NOT_OFFICIALLY_VALIDATED');
  if (gate.scan_status !== 'COMPLETE') blockers.push('SCAN_NOT_COMPLETE');
  if (!gate.duplicate_scan_complete) blockers.push('DUPLICATE_SCAN_INCOMPLETE');
  if (!gate.counter_invariants_ok) blockers.push('COUNTER_INVARIANT_VIOLATION');
  if (!gate.official_denominator_present) blockers.push('NO_OFFICIAL_DENOMINATOR');
  if (!gate.reconciled_zero_tolerance) blockers.push('RECONCILIATION_NOT_ZERO_TOLERANCE');
  return { authorized: blockers.length === 0, blockers };
}

export type CompletenessClass = 'PROVEN_COMPLETE' | 'PARTIAL' | 'MISSING_OFFICIAL_EVIDENCE';

/**
 * PROVEN_COMPLETE: every gate satisfied.
 * PARTIAL: the artifact or scan itself is insufficient (traceability/scan/dedup/
 *   counters), even if official inputs are also missing.
 * MISSING_OFFICIAL_EVIDENCE: blocked ONLY because an official input is absent
 *   (denominator and/or officially-validated layout).
 */
export function classifyCompleteness(gate: AuthorizationGateInput): CompletenessClass {
  if (decideAuthorization(gate).authorized) return 'PROVEN_COMPLETE';
  const dataDefect = !gate.traceability_verified
    || gate.scan_status !== 'COMPLETE'
    || !gate.duplicate_scan_complete
    || !gate.counter_invariants_ok
    || (gate.official_denominator_present && !gate.reconciled_zero_tolerance);
  if (dataDefect) return 'PARTIAL';
  const officialMissing = !gate.official_denominator_present || !gate.layout_officially_validated;
  return officialMissing ? 'MISSING_OFFICIAL_EVIDENCE' : 'PARTIAL';
}

export interface BuildGateInput {
  traceability_verified: boolean;
  layout_officially_validated: boolean;
  report: TseReconciliationReport;
}

export function buildGate(input: BuildGateInput): AuthorizationGateInput {
  const { report } = input;
  const coverage: TseCoverageEntry[] = report.coverage;
  return {
    traceability_verified: input.traceability_verified,
    layout_officially_validated: input.layout_officially_validated,
    scan_status: report.summary.scan_status,
    duplicate_scan_complete: report.duplicate_scan.complete,
    counter_invariants_ok: counterInvariantViolations(report.summary.counters).length === 0,
    official_denominator_present: coverage.some(entry => entry.expected_count !== null),
    reconciled_zero_tolerance: coverage.length > 0 && coverage.every(entry => entry.status === 'COMPLETE')
  };
}

export interface MemberAssessment {
  member: string;
  class: CompletenessClass;
  authorized: boolean;
  blockers: AuthorizationBlocker[];
  scan_status: TseScanStatus;
  counters: TseScanCounters;
  duplicate_keys_tracked: number;
  duplicate_scan_complete: boolean;
  scan_error: string | null;
}

export function buildMemberAssessment(
  member: string,
  report: TseReconciliationReport,
  traceabilityVerified: boolean,
  layoutOfficiallyValidated: boolean
): MemberAssessment {
  const gate = buildGate({ traceability_verified: traceabilityVerified, layout_officially_validated: layoutOfficiallyValidated, report });
  const decision = decideAuthorization(gate);
  return {
    member,
    class: classifyCompleteness(gate),
    authorized: decision.authorized,
    blockers: decision.blockers,
    scan_status: report.summary.scan_status,
    counters: report.summary.counters,
    duplicate_keys_tracked: report.duplicate_scan.tracked_keys,
    duplicate_scan_complete: report.duplicate_scan.complete,
    scan_error: report.scan_error
  };
}

/** Member whose scan could not run at all (e.g. parser/ZIP error): always PARTIAL. */
export function buildErroredMemberAssessment(member: string, message: string): MemberAssessment {
  return {
    member,
    class: 'PARTIAL',
    authorized: false,
    blockers: ['SCAN_NOT_COMPLETE'],
    scan_status: 'PARTIAL_ERROR',
    counters: { records_read: 0, records_accepted: 0, records_rejected: 0, records_invalid: 0, records_truncated: 0 },
    duplicate_keys_tracked: 0,
    duplicate_scan_complete: false,
    scan_error: message
  };
}

export interface ArtifactAssessment {
  resource_id: string;
  year: number;
  dataset_title: string;
  file_name: string;
  size_bytes: number;
  sha256_manifest: string | null;
  sha256_file: string | null;
  validation_status: string | null;
  traceability: Traceability;
  members: MemberAssessment[];
}

export interface ChainAssessmentSummary {
  artifacts: number;
  members: number;
  proven_complete: number;
  partial: number;
  missing_official_evidence: number;
  authorized_members: number;
}

export function summarizeAssessment(artifacts: ArtifactAssessment[]): {
  artifacts: number;
  members: number;
  proven_complete: number;
  partial: number;
  missing_official_evidence: number;
  authorized_members: number;
} {
  const summary = {
    artifacts: artifacts.length,
    members: 0,
    proven_complete: 0,
    partial: 0,
    missing_official_evidence: 0,
    authorized_members: 0
  };
  for (const artifact of artifacts) {
    for (const member of artifact.members) {
      summary.members++;
      if (member.class === 'PROVEN_COMPLETE') summary.proven_complete++;
      else if (member.class === 'PARTIAL') summary.partial++;
      else summary.missing_official_evidence++;
      if (member.authorized) summary.authorized_members++;
    }
  }
  return summary;
}

/** Decision for the whole chain = AUTHORIZED only if every member is authorized. */
export function decideChainAuthorization(members: MemberAssessment[]): {
  authorized: boolean;
  blocker_counts: Record<string, number>;
  blockers: AuthorizationBlocker[];
} {
  const counts: Record<string, number> = {};
  for (const member of members) {
    for (const blocker of member.blockers) counts[blocker] = (counts[blocker] ?? 0) + 1;
  }
  const blockers = Object.keys(counts) as AuthorizationBlocker[];
  return { authorized: members.length > 0 && members.every(m => m.authorized), blocker_counts: counts, blockers };
}
