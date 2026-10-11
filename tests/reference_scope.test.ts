/**
 * Adversarial + positive tests for the official scope/denominator contract
 * (phase: base oficial de referência e reconciliação nacional).
 */
import assert from 'node:assert/strict';
import {
  validateScope,
  reconcileMemberInventory,
  reconcileReferences,
  evaluateScopeGate,
  scopeIsFullyValidated,
  type ScopeDeclaration,
  type ScopeRequirement,
  type OfficialSource
} from '../src/audit/referenceScope.ts';

const VALID_SOURCE: OfficialSource = {
  id: 'src-official',
  dataset_id: 'resultados-2022',
  resource_name: 'Votação nominal por município e zona',
  url: 'https://cdn.tse.jus.br/x.zip',
  sha256: 'a'.repeat(64),
  obtained: true,
  validated: true,
  notes: []
};

function req(id: string, over: Partial<ScopeRequirement> = {}): ScopeRequirement {
  return {
    id, resource_id: 'res-1', year: 2022, turno: null, uf: null, cargo: null,
    dimension: 'UF', key: id, expected_value: 1, unit: 'DISTINCT_KEYS',
    method: 'contagem', source_id: 'src-official', state: 'VALIDATED', notes: [], ...over
  };
}

function scope(over: Partial<ScopeDeclaration> = {}): ScopeDeclaration {
  return {
    contract_version: 'test-1',
    year: 2022,
    resource_id: 'res-1',
    expected_members: ['a.csv', 'b.csv'],
    sources: [VALID_SOURCE],
    requirements: [req('req-a')],
    limitations: [],
    ...over
  };
}

async function run() {
  console.log('Running official scope tests...');

  // 1) valid, complete scope authorizes a delimited scope (POSITIVE fixture).
  console.log('1) positive: complete delimited scope authorizes');
  const good = scope();
  assert.deepEqual(validateScope(good), [], 'valid scope has no violations');
  assert.equal(scopeIsFullyValidated(good), true);
  const goodObserved = new Map<string, number>([['req-a', 1]]);
  const ok = evaluateScopeGate(good, ['a.csv', 'b.csv'], goodObserved);
  assert.equal(ok.authorized, true, 'complete validated scope + exact inventory authorizes');
  console.log('  OK');

  // 2) empty scope never authorizes
  console.log('2) empty scope');
  const empty = evaluateScopeGate(scope({ requirements: [] }), ['a.csv', 'b.csv']);
  assert.equal(empty.authorized, false);
  assert.ok(empty.blockers.includes('SCOPE_EMPTY'));
  console.log('  OK');

  // 3) missing denominator (requirement not VALIDATED)
  console.log('3) missing denominator');
  const notValidated = evaluateScopeGate(scope({ requirements: [req('req-a', { state: 'KNOWN_NO_SOURCE', expected_value: null })] }), ['a.csv', 'b.csv']);
  assert.equal(notValidated.authorized, false);
  assert.ok(notValidated.blockers.includes('REQUIREMENTS_NOT_VALIDATED'));
  console.log('  OK');

  // 4) missing member (dimension/inventory)
  console.log('4) missing member');
  const inv = reconcileMemberInventory(good, ['a.csv']);
  assert.deepEqual(reconcileMemberInventory(good, ['a.csv']).missing_members, ['b.csv']);
  assert.equal(evaluateScopeGate(good, ['a.csv'], goodObserved).blockers.includes('INVENTORY_INCOMPLETE'), true);
  assert.equal(inv.complete, false);
  console.log('  OK');

  // 5) extra member detected
  console.log('5) extra member');
  assert.deepEqual(reconcileMemberInventory(good, ['a.csv', 'b.csv', 'c.csv']).extra_members, ['c.csv']);
  console.log('  OK');

  // 5b) aggregate-equal but per-unit divergent is detected
  console.log('5b) aggregate equal, per-unit divergent');
  const twoReq = scope({ requirements: [req('req-a'), req('req-b', { key: 'req-b' })] });
  const divergent = new Map<string, number>([['req-a', 2], ['req-b', 0]]); // total 2 == 1+1 expected, but per-unit diverges
  const findings = reconcileReferences(twoReq.requirements, divergent);
  assert.ok(findings.some(f => f.kind !== 'OK'), 'per-unit divergence detected even when totals tie');
  assert.ok(reconcileReferences(scope().requirements, goodObserved).every(m => m.kind === 'OK'));
  console.log('  OK');

  // 5) duplicate requirement id
  console.log('5) duplicate requirement');
  assert.ok(validateScope(scope({ requirements: [req('dup'), req('dup')] })).some(v => /duplicado/.test(v)));
  console.log('  OK');

  // 6) contradictory requirement
  console.log('6) contradictory requirement');
  const contradictory = [req('x', { key: 'k', expected_value: 1 }), req('y', { key: 'k', expected_value: 2 })];
  assert.ok(validateScope(scope({ requirements: contradictory })).some(v => /contradit/));
  console.log('  OK');

  // 7) reference from another election
  console.log('7) wrong election year');
  assert.ok(validateScope(scope({ requirements: [req('req-a', { year: 2018 })] })).some(v => v.includes('2018')));
  console.log('  OK');

  // 8) invalid expected value
  console.log('8) invalid expected value');
  assert.ok(validateScope(scope({ requirements: [req('req-a', { expected_value: -1 })] })).some(v => v.includes('negativo')));
  console.log('  OK');

  // 9) reference to unknown source
  console.log('9) unknown source');
  assert.ok(validateScope(scope({ requirements: [req('req-a', { source_id: 'nope' })] })).some(v => v.includes('desconhecida')));
  console.log('  OK');

  // 10) VALIDATED requirement whose source is not validated
  console.log('10) validated requirement, unvalidated source');
  assert.ok(validateScope(scope({ sources: [{ ...VALID_SOURCE, validated: false }] })).some(v => v.includes('não está validada')));
  console.log('  OK');

  // 11) observed count incompatible (mismatch / partial coverage)
  console.log('11) reference mismatch / partial coverage');
  const mismatch = evaluateScopeGate(good, ['a.csv', 'b.csv'], new Map([['req-a', 999]]));
  assert.equal(mismatch.authorized, false);
  assert.ok(mismatch.blockers.includes('REFERENCE_MISMATCH'));
  assert.equal(reconcileReferences([req('req-a')], new Map()).at(0)?.kind, 'MISSING');
  console.log('  OK');

  // 12) contradictory duplicate keys detected by reconciliation identity
  console.log('12) inventory reconciliation identity');
  const inv2 = reconcileMemberInventory(scope({ expected_members: ['a.csv'] }), ['a.csv', 'x.csv', 'y.csv']);
  assert.equal(inv2.extra_members.length, 2);
  assert.equal(inv2.complete, false);
  console.log('  OK');

  console.log('\n=== ALL OFFICIAL SCOPE TESTS PASSED ===');
}

run().catch(err => { console.error('Tests failed:', err); process.exitCode = 1; });
