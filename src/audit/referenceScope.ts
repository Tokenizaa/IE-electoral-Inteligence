/**
 * Versioned official reference/denominator contract for the electoral chain.
 *
 * A scope declares, from OFFICIAL sources only, which members and which
 * denominators must be present and reconciled before ingestion can be
 * authorized. Requirements carry an explicit lifecycle state so "not yet
 * discovered", "known but no source", "obtained but unvalidated" and "validated"
 * are never conflated.
 *
 * The scope gate is conservative by construction: it authorizes ONLY when the
 * declared scope is internally consistent, every requirement is VALIDATED, every
 * referenced source is validated and the observed inventory matches exactly.
 * An empty scope never authorizes.
 *
 * This module is pure (no I/O).
 */

export type ReferenceState = 'UNDISCOVERED' | 'KNOWN_NO_SOURCE' | 'OBTAINED_UNVALIDATED' | 'VALIDATED';

export interface OfficialSource {
  /** Stable source id referenced by requirements. */
  id: string;
  /** CKAN dataset identifier (e.g. "resultados-2022"). */
  dataset_id: string;
  resource_name: string | null;
  /** Direct official download URL, when known. */
  url: string | null;
  /** SHA-256 of the retained artifact, when obtained. */
  sha256: string | null;
  obtained: boolean;
  validated: boolean;
  notes: string[];
}

export type ScopeDimension =
  | 'MEMBER' | 'UF' | 'MUNICIPIO' | 'ZONA' | 'SECAO' | 'CARGO' | 'TURNO' | 'COVERAGE';

export type ScopeUnit =
  | 'MEMBERS' | 'RECORDS' | 'DISTINCT_KEYS' | 'VOTES' | 'SECTIONS' | 'MUNICIPALITIES' | 'ZONES';

export interface ScopeRequirement {
  /** Stable requirement id. */
  id: string;
  resource_id: string;
  year: number;
  turno: number | null;
  uf: string | null;
  cargo: number | null;
  dimension: ScopeDimension;
  key: string;
  expected_value: number | null;
  unit: ScopeUnit;
  method: string;
  source_id: string;
  state: ReferenceState;
  notes: string[];
}

export interface ScopeDeclaration {
  contract_version: string;
  year: number;
  resource_id: string;
  expected_members: string[];
  sources: OfficialSource[];
  requirements: ScopeRequirement[];
  limitations: string[];
}

/** Internal-consistency check of a scope declaration. Empty array = consistent. */
export function validateScope(scope: ScopeDeclaration): string[] {
  const violations: string[] = [];
  if (!scope.contract_version) violations.push('contract_version ausente.');
  if (!Number.isInteger(scope.year)) violations.push('year inválido.');
  if (!scope.resource_id) violations.push('resource_id ausente.');
  if (scope.expected_members.length === 0) violations.push('expected_members vazio: escopo de membros não definido.');
  if (scope.requirements.length === 0) violations.push('requirements vazio: escopo nunca autoriza sem denominadores declarados.');

  const sourceIds = new Set(scope.sources.map(s => s.id));
  if (sourceIds.size !== scope.sources.length) violations.push('sources contém ids duplicados.');

  const reqIds = new Set<string>();
  const keysSeen = new Map<string, number | null>();
  for (const req of scope.requirements) {
    if (reqIds.has(req.id)) violations.push(`requirement id duplicado: ${req.id}.`);
    reqIds.add(req.id);

    if (req.year !== scope.year) violations.push(`requirement ${req.id} pertence ao ano ${req.year}, fora do escopo ${scope.year}.`);
    if (!sourceIds.has(req.source_id)) violations.push(`requirement ${req.id} referencia fonte desconhecida: ${req.source_id}.`);
    if (req.expected_value !== null && req.expected_value < 0) violations.push(`requirement ${req.id} tem expected_value negativo.`);
    if (!req.method) violations.push(`requirement ${req.id} sem método de cálculo.`);
    if (req.dimension === 'CARGO' && req.cargo === null) violations.push(`requirement ${req.id} de cargo sem cargo declarado.`);

    const key = `${req.resource_id}|${req.dimension}|${req.uf ?? ''}|${req.turno ?? ''}|${req.cargo ?? ''}|${req.key}`;
    if (keysSeen.has(key) && keysSeen.get(key) !== req.expected_value) {
      violations.push(`requirements contraditórios para ${key}: ${keysSeen.get(key)} vs ${req.expected_value}.`);
    }
    keysSeen.set(key, req.expected_value);

    if (req.state === 'VALIDATED') {
      const source = scope.sources.find(s => s.id === req.source_id);
      if (!source?.validated) violations.push(`requirement ${req.id} VALIDATED mas a fonte ${req.source_id} não está validada.`);
      if (req.expected_value === null) violations.push(`requirement ${req.id} VALIDATED sem expected_value.`);
    }
  }

  for (const source of scope.sources) {
    if (source.validated && !source.obtained) violations.push(`fonte ${source.id} marcada validada mas não obtida.`);
    if (source.obtained && !source.url) violations.push(`fonte ${source.id} marcada obtida mas sem URL oficial.`);
  }
  return violations;
}

/** True only when the scope is complete and every requirement/source is validated. */
export function scopeIsFullyValidated(scope: ScopeDeclaration): boolean {
  if (validateScope(scope).length > 0) return false;
  if (scope.requirements.length === 0) return false;
  return scope.requirements.every(r => r.state === 'VALIDATED')
    && scope.sources.every(s => s.validated);
}

export interface InventoryReconciliation {
  expected: number;
  observed: number;
  missing_members: string[];
  extra_members: string[];
  complete: boolean;
}

/** Reconciles the declared member set against the observed member set (exact set). */
export function reconcileMemberInventory(scope: ScopeDeclaration, observedMembers: string[]): InventoryReconciliation {
  const expected = new Set(scope.expected_members);
  const observed = new Set(observedMembers);
  const missing_members = [...expected].filter(m => !observed.has(m)).sort();
  const extra_members = [...observed].filter(m => !expected.has(m)).sort();
  return {
    expected: expected.size,
    observed: observed.size,
    missing_members,
    extra_members,
    complete: missing_members.length === 0 && extra_members.length === 0
  };
}

export interface ReferenceMismatch {
  requirement_id: string;
  key: string;
  expected_value: number | null;
  observed_value: number | null;
  kind: 'MISSING' | 'MISMATCH' | 'OK';
}

/** Reconciles observed values against expected denominators with zero tolerance. */
export function reconcileReferences(
  requirements: ScopeRequirement[],
  observed: Map<string, number>
): ReferenceMismatch[] {
  return requirements.map(req => {
    const observedValue = observed.get(req.key) ?? null;
    let kind: ReferenceMismatch['kind'] = 'OK';
    if (observedValue === null) kind = 'MISSING';
    else if (req.expected_value === null || observedValue !== req.expected_value) kind = 'MISMATCH';
    return {
      requirement_id: req.id,
      key: req.key,
      expected_value: req.expected_value,
      observed_value: observedValue,
      kind
    };
  });
}

export type ScopeBlocker =
  | 'SCOPE_INVALID'
  | 'SCOPE_EMPTY'
  | 'REQUIREMENTS_NOT_VALIDATED'
  | 'SOURCES_NOT_VALIDATED'
  | 'INVENTORY_INCOMPLETE'
  | 'REFERENCE_MISMATCH';

export interface ScopeGateResult {
  authorized: boolean;
  blockers: ScopeBlocker[];
  reasons: string[];
  inventory: InventoryReconciliation | null;
}

/**
 * Conservative scope gate. `observedMembers` and `observedByKey` are supplied by
 * the caller (from real scans). A delimited scope is authorized ONLY when fully
 * validated and both reconciliations pass with zero tolerance.
 */
export function evaluateScopeGate(
  scope: ScopeDeclaration,
  observedMembers: string[],
  observedByKey: Map<string, number> = new Map()
): ScopeGateResult {
  const blockers: ScopeBlocker[] = [];
  const reasons: string[] = [];

  const violations = validateScope(scope);
  if (violations.length > 0) { blockers.push('SCOPE_INVALID'); reasons.push(...violations); }
  if (scope.requirements.length === 0) { blockers.push('SCOPE_EMPTY'); reasons.push('Escopo sem requisitos: não autoriza.'); }
  if (!scope.requirements.every(r => r.state === 'VALIDATED')) { blockers.push('REQUIREMENTS_NOT_VALIDATED'); reasons.push('Há requisitos não VALIDATED.'); }
  if (!scope.sources.every(s => s.validated)) { blockers.push('SOURCES_NOT_VALIDATED'); reasons.push('Há fontes oficiais não validadas.'); }

  const inventory = reconcileMemberInventory(scope, observedMembers);
  if (!inventory.complete) {
    blockers.push('INVENTORY_INCOMPLETE');
    if (inventory.missing_members.length) reasons.push(`Membros ausentes: ${inventory.missing_members.join(', ')}.`);
    if (inventory.extra_members.length) reasons.push(`Membros inesperados: ${inventory.extra_members.join(', ')}.`);
  }

  const mismatches = reconcileReferences(scope.requirements, observedByKey).filter(m => m.kind !== 'OK');
  if (mismatches.length > 0) {
    blockers.push('REFERENCE_MISMATCH');
    reasons.push(`${mismatches.length} referência(s) divergente(s)/ausente(s).`);
  }

  return { authorized: blockers.length === 0, blockers, reasons, inventory };
}
