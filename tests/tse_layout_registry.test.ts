import assert from 'node:assert/strict';
import { listTseLayoutProfiles, validateTseLayout } from '../src/ingestion/tseLayoutRegistry.ts';

const profiles = listTseLayoutProfiles();
assert.equal(profiles.length, 3, 'Somente os três layouts efetivamente amostrados devem ser registrados.');
assert.ok(profiles.every(profile => profile.ingestion_approved === false));

const candidate = profiles.find(profile => profile.resource_kind === 'CANDIDATURAS');
assert.ok(candidate);
const exact = validateTseLayout(2022, 'CANDIDATURAS', candidate.sample_header);
assert.equal(exact.status, 'KNOWN_SAMPLE_SIGNATURE_ONLY');
assert.equal(exact.layout_id, candidate.id);
assert.equal(exact.ingestion_approved, false);
assert.match(exact.header_fingerprint_sha256, /^[a-f0-9]{64}$/);

const sameFingerprint = validateTseLayout(2022, 'CANDIDATURAS', candidate.sample_header);
assert.equal(sameFingerprint.header_fingerprint_sha256, exact.header_fingerprint_sha256);

const extraColumn = validateTseLayout(2022, 'CANDIDATURAS', [...candidate.sample_header, 'COLUNA_NOVA']);
assert.equal(extraColumn.status, 'REQUIRED_COLUMNS_MATCH_UNVERIFIED_LAYOUT');
assert.equal(extraColumn.ingestion_approved, false);

const missing = validateTseLayout(2022, 'CANDIDATURAS', ['ANO_ELEICAO', 'CD_CARGO']);
assert.equal(missing.status, 'MISSING_REQUIRED_COLUMNS');
assert.ok(missing.missing_required_columns.includes('SQ_CANDIDATO'));
assert.equal(missing.layout_id, null);

const duplicate = validateTseLayout(2022, 'CANDIDATURAS', [...candidate.sample_header, 'CD_CARGO']);
assert.equal(duplicate.status, 'INVALID_DUPLICATE_COLUMNS');
assert.ok(duplicate.duplicate_columns.includes('CD_CARGO'));

const unsupportedYear = validateTseLayout(2024, 'CANDIDATURAS', candidate.sample_header);
assert.equal(unsupportedYear.status, 'UNKNOWN_LAYOUT');
assert.equal(unsupportedYear.layout_id, null);

const unsupportedKind = validateTseLayout(2022, 'OUTRO', candidate.sample_header);
assert.equal(unsupportedKind.status, 'UNKNOWN_LAYOUT');
assert.equal(unsupportedKind.layout_id, null);

console.log('TSE versioned layout registry safeguards verified.');
