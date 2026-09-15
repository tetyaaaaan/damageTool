# Genshin external source catalog contract audit

Status: **passed**; promotion gate: **blocked**; canonical eligibility: **0**

This read-only report separates repository reproducibility from game-version proof. A pinned Git revision and file digest identify bytes, but they do not identify a Genshin patch.

## Contract

- Required game-version proof: explicit `gameVersion` plus a matching primary metadata locator and SHA-256 digest.
- Accepted metadata kinds: `gameClientManifest`, `providerDatasetManifest`, `providerReleaseArtifact`, `releaseNotesWithExplicitGameVersion`.
- Rejected as game-version proof: Git commit/tag/date, package semver, branch, capturedAt, entity path, or entity digest alone.
- Field-level dual-source evidence still requires comparable values, two independent groups, and `supportsClaimValue`; entity-only pins never satisfy it.

## Catalog source status

| source | provider | independence group | revision pinned | gameVersion | game-version verified | blocked reasons |
| --- | --- | --- | --- | --- | --- | --- |
| gcsim | genshinsim/gcsim | gcsim-implementation | yes | — | no | gameVersion:missing, gameVersionEvidence:missing, revisionPin:notGameVersionProof |
| genshinDb | theBowja/genshin-db | GenshinData-derived | yes | 6.7 | yes | none |

Catalog records: **18**; revision/file pins: **18**; field-scoped: **9**; game-version verified: **9**.

### Pinned record sample

| record | source | revision pinned | field scoped | game-version verified | blocked reasons |
| --- | --- | --- | --- | --- | --- |
| `gcsim:weapon:11503` | gcsim | yes | no | no | fieldScope:missing, gameVersionEvidence:missing |
| `gcsim:weapon:11509` | gcsim | yes | no | no | fieldScope:missing, gameVersionEvidence:missing |
| `gcsim:weapon:11518` | gcsim | yes | no | no | fieldScope:missing, gameVersionEvidence:missing |
| `gcsim:weapon:12402` | gcsim | yes | no | no | fieldScope:missing, gameVersionEvidence:missing |
| `gcsim:weapon:12430` | gcsim | yes | no | no | fieldScope:missing, gameVersionEvidence:missing |
| `gcsim:weapon:14402` | gcsim | yes | no | no | fieldScope:missing, gameVersionEvidence:missing |
| `gcsim:weapon:15402` | gcsim | yes | no | no | fieldScope:missing, gameVersionEvidence:missing |
| `gcsim:weapon:15502` | gcsim | yes | no | no | fieldScope:missing, gameVersionEvidence:missing |
| `gcsim:weapon:15516` | gcsim | yes | no | no | fieldScope:missing, gameVersionEvidence:missing |
| `genshinDb:weapon:11503` | genshinDb | yes | yes | yes | none |
| `genshinDb:weapon:11509` | genshinDb | yes | yes | yes | none |
| `genshinDb:weapon:11518` | genshinDb | yes | yes | yes | none |

## Local records and gates

- Local SourceRecords: **1321** total; **0** with gameVersion; **1321** missing gameVersion; **0** with complete primary version evidence.
- Dual-source claims: **12117**; eligible claims/candidates: **0/0**; missing-version claims: **12117**.
- gcsim pinned weapon entities: **9**; gcsim artifact records: **0**; GO evidence present: **no**.
- Canonical gate: **0** canonical of **2268** candidates; fail-closed status **passedFailClosed**.

## Blocked reasons

- `canonicalGate:canonicalEligibility:zero`
- `dualSource:fieldGameVersion:missing:12117`
- `dualSource:pinnedEntityFiles:gameVersionProofMissing:9`
- `localSourceRecords:gameVersion:missing:1321`
- `record:gcsim:weapon:11503:gameVersionEvidence:missing`
- `record:gcsim:weapon:11509:gameVersionEvidence:missing`
- `record:gcsim:weapon:11518:gameVersionEvidence:missing`
- `record:gcsim:weapon:12402:gameVersionEvidence:missing`
- `record:gcsim:weapon:12430:gameVersionEvidence:missing`
- `record:gcsim:weapon:14402:gameVersionEvidence:missing`
- `record:gcsim:weapon:15402:gameVersionEvidence:missing`
- `record:gcsim:weapon:15502:gameVersionEvidence:missing`
- `record:gcsim:weapon:15516:gameVersionEvidence:missing`
- `source:gcsim:gameVersion:missing`
- `source:gcsim:gameVersionEvidence:missing`
- `source:gcsim:revisionPin:notGameVersionProof`
- `sourceCatalog:gcsim:artifactRecords:missing`
- `sourceCatalog:go:records:missing`

No candidate was marked verified or canonical by this audit. Full deterministic details are in the adjacent JSON report.
