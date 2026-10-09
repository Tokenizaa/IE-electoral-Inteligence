/**
 * Versioned layout registry for TSE tabular resources.
 *
 * The initial profiles describe repository sample files only. They are deliberately
 * NOT treated as official, year-wide layouts and never authorize automatic ingestion.
 */
import { createHash } from 'node:crypto';

export type TSE_LAYOUT_STATUS =
  | 'KNOWN_SAMPLE_SIGNATURE_ONLY'
  | 'REQUIRED_COLUMNS_MATCH_UNVERIFIED_LAYOUT'
  | 'UNKNOWN_LAYOUT'
  | 'INVALID_DUPLICATE_COLUMNS'
  | 'MISSING_REQUIRED_COLUMNS';

export interface TseLayoutProfile {
  id: string;
  resource_kind:
    | 'CANDIDATURAS'
    | 'VOTACAO_NOMINAL_MUNICIPIO_ZONA'
    | 'DETALHE_APURACAO_MUNICIPIO_ZONA';
  evidence: 'REPOSITORY_SAMPLE_2022_RS';
  election_year: 2022;
  required_columns: string[];
  sample_header: string[];
  ingestion_approved: false;
}

export interface TseLayoutValidation {
  status: TSE_LAYOUT_STATUS;
  layout_id: string | null;
  resource_kind: TseLayoutProfile['resource_kind'] | 'OUTRO';
  header_fingerprint_sha256: string;
  observed_columns: string[];
  missing_required_columns: string[];
  duplicate_columns: string[];
  ingestion_approved: false;
  evidence_scope: string;
  notes: string[];
}

const PROFILES: TseLayoutProfile[] = [
  {
    id: 'sample-2022-rs-candidaturas-v1',
    resource_kind: 'CANDIDATURAS',
    evidence: 'REPOSITORY_SAMPLE_2022_RS',
    election_year: 2022,
    required_columns: [
      'ANO_ELEICAO', 'NR_TURNO', 'SG_UF', 'CD_CARGO', 'DS_CARGO',
      'SQ_CANDIDATO', 'NR_CANDIDATO', 'NM_CANDIDATO', 'NM_URNA_CANDIDATO',
      'CD_SITUACAO_CANDIDATURA', 'DS_SITUACAO_CANDIDATURA', 'NR_PARTIDO',
      'SG_PARTIDO'
    ],
    sample_header: [
      'ANO_ELEICAO', 'NR_TURNO', 'SG_UF', 'CD_CARGO', 'DS_CARGO',
      'SQ_CANDIDATO', 'NR_CANDIDATO', 'NM_CANDIDATO', 'NM_URNA_CANDIDATO',
      'NR_CPF_CANDIDATO', 'CD_SITUACAO_CANDIDATURA', 'DS_SITUACAO_CANDIDATURA',
      'NR_PARTIDO', 'SG_PARTIDO', 'NM_PARTIDO', 'NR_FEDERACAO', 'SG_FEDERACAO',
      'DT_NASCIMENTO', 'CD_GENERO', 'SG_UF_NASCIMENTO'
    ],
    ingestion_approved: false
  },
  {
    id: 'sample-2022-rs-votacao-nominal-munzona-v1',
    resource_kind: 'VOTACAO_NOMINAL_MUNICIPIO_ZONA',
    evidence: 'REPOSITORY_SAMPLE_2022_RS',
    election_year: 2022,
    required_columns: [
      'ANO_ELEICAO', 'NR_TURNO', 'SG_UF', 'CD_MUNICIPIO', 'NM_MUNICIPIO',
      'NR_ZONA', 'CD_CARGO', 'SQ_CANDIDATO', 'QT_VOTOS_NOMINAIS_VALIDOS',
      'TP_VOTAVEL'
    ],
    sample_header: [
      'ANO_ELEICAO', 'NR_TURNO', 'SG_UF', 'CD_MUNICIPIO', 'NM_MUNICIPIO',
      'NR_ZONA', 'CD_CARGO', 'SQ_CANDIDATO', 'NR_CANDIDATO', 'NM_CANDIDATO',
      'NM_URNA_CANDIDATO', 'CD_SITUACAO_CANDIDATURA', 'DS_SITUACAO_CANDIDATURA',
      'NR_PARTIDO', 'SG_PARTIDO', 'QT_VOTOS_NOMINAIS_VALIDOS', 'TP_VOTAVEL'
    ],
    ingestion_approved: false
  },
  {
    id: 'sample-2022-rs-apuracao-munzona-v1',
    resource_kind: 'DETALHE_APURACAO_MUNICIPIO_ZONA',
    evidence: 'REPOSITORY_SAMPLE_2022_RS',
    election_year: 2022,
    required_columns: [
      'ANO_ELEICAO', 'NR_TURNO', 'SG_UF', 'CD_MUNICIPIO', 'NM_MUNICIPIO',
      'NR_ZONA', 'CD_CARGO', 'QT_APTOS', 'QT_COMPARECIMENTO', 'QT_ABSTENCAO',
      'QT_VOTOS_NOMINAIS', 'QT_VOTOS_LEGENDA', 'QT_VOTOS_BRANCOS',
      'QT_VOTOS_NULOS'
    ],
    sample_header: [
      'ANO_ELEICAO', 'NR_TURNO', 'SG_UF', 'CD_MUNICIPIO', 'NM_MUNICIPIO',
      'NR_ZONA', 'CD_CARGO', 'QT_APTOS', 'QT_COMPARECIMENTO', 'QT_ABSTENCAO',
      'QT_VOTOS_NOMINAIS', 'QT_VOTOS_LEGENDA', 'QT_VOTOS_BRANCOS',
      'QT_VOTOS_NULOS', 'QT_VOTOS_ANULADOS_SUB_JUDICE'
    ],
    ingestion_approved: false
  }
];

function normalizeColumn(column: string): string {
  return column.replace(/^\uFEFF/, '').trim().replace(/^"|"$/g, '').toUpperCase();
}

function fingerprint(columns: string[]): string {
  return createHash('sha256').update(columns.map(normalizeColumn).join(';'), 'utf8').digest('hex');
}

export function listTseLayoutProfiles(): ReadonlyArray<TseLayoutProfile> {
  return PROFILES.map(profile => ({
    ...profile,
    required_columns: [...profile.required_columns],
    sample_header: [...profile.sample_header]
  }));
}

export function validateTseLayout(
  year: number,
  resourceKind: TseLayoutProfile['resource_kind'] | 'OUTRO',
  rawColumns: string[]
): TseLayoutValidation {
  const observed = rawColumns.map(normalizeColumn);
  const counts = new Map<string, number>();
  for (const column of observed) counts.set(column, (counts.get(column) ?? 0) + 1);
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([column]) => column);
  const candidates = PROFILES.filter(profile => profile.resource_kind === resourceKind);
  const profile = candidates.find(item => item.election_year === year) ?? null;
  const required = profile?.required_columns ?? [];
  const missing = required.filter(column => !counts.has(column));
  const exactSampleSignature = Boolean(profile) &&
    observed.length === profile!.sample_header.length &&
    observed.every((column, index) => column === profile!.sample_header[index]);

  let status: TSE_LAYOUT_STATUS;
  if (duplicates.length > 0) status = 'INVALID_DUPLICATE_COLUMNS';
  else if (profile && missing.length > 0) status = 'MISSING_REQUIRED_COLUMNS';
  else if (exactSampleSignature) status = 'KNOWN_SAMPLE_SIGNATURE_ONLY';
  else if (profile && missing.length === 0) status = 'REQUIRED_COLUMNS_MATCH_UNVERIFIED_LAYOUT';
  else status = 'UNKNOWN_LAYOUT';

  return {
    status,
    layout_id: profile && status !== 'UNKNOWN_LAYOUT' && status !== 'MISSING_REQUIRED_COLUMNS' ? profile.id : null,
    resource_kind: resourceKind,
    header_fingerprint_sha256: fingerprint(observed),
    observed_columns: observed,
    missing_required_columns: missing,
    duplicate_columns: duplicates,
    ingestion_approved: false,
    evidence_scope: 'Os perfis disponíveis foram derivados de arquivos de amostra do repositório para RS/2022; não comprovam o layout oficial de todos os recursos ou anos.',
    notes: [
      'Esta validação identifica compatibilidade estrutural inicial; não verifica encoding integral, linhas malformadas, semântica, totais, cobertura geográfica ou reconciliação com a totalização oficial.',
      'Nenhum status desta etapa autoriza ingestão automática na camada analítica.',
      ...(status === 'KNOWN_SAMPLE_SIGNATURE_ONLY' ? ['A assinatura coincide com a amostra conhecida; isso não comprova autenticidade, completude nem equivalência com o arquivo oficial integral.'] : [])
    ]
  };
}
