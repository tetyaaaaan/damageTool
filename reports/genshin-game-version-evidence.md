# Genshin game-version primary evidence audit

Status: **passed**; promotion gate: **blocked**; canonical eligibility: **0**

This report separates repository reproducibility from Genshin game-version proof. A commit/file digest is never treated as a patch version. The generator performs no network access and records official provider locators only as review targets.

## Strict primary-evidence contract

- Accepted kinds: `gameClientManifest`, `providerDatasetManifest`, `providerReleaseArtifact`, `releaseNotesWithExplicitGameVersion`.
- Required: explicit gameVersion, metadata SHA-256, and `binding.revision` equal to the pinned source revision.
- Field-scoped records additionally require `binding.sourceRecordDigest` equal to the exact pinned entity-file SHA-256.
- Rejected as proof: repository commit or file SHA-256 alone; Git tag, branch, or commit date; provider package semver alone; capturedAt timestamp; entity path or entity file digest without version metadata; a nearby release or patch note not bound to the pinned revision.

## Current source status

| source | revision pinned | gameVersion | strictly bound | blocked reasons |
| --- | --- | --- | --- | --- |
| gcsim | yes | - | no | gameVersionMissing, metadataDigestMissing, primaryMetadataIncomplete, sameRevisionBindingMismatch, sameRevisionBindingMissing |
| genshinDb | yes | 6.7 | yes | none |

- Sources: **2**; revision-pinned: **2**; explicit gameVersion: **1**; strictly bound: **1**.
- Catalog records: **18**; field-scoped: **9**; explicit gameVersion: **9**; strictly bound: **9**.
- Local SourceRecords: **1327**; gameVersion present: **5**.
- Existing external field-evidence artifacts with explicit/verified gameVersion: **0/0**.

## Current-contract feasibility and impact

- gcsim: **revisionLevelGameVersionNotManagedInInspectedArtifacts**; strict binding: **no**.
- genshin-db: **evidenceFoundAndStrictlyBound**; strict binding: **yes** (6.7).
- Current candidate exposure: **2266/2268**; directly exposed to the missing gcsim revision version: **9 candidates / 651 claims**.
- Claim exposure: **12117/12122** missing version; dual-source eligible: **5**.
- Dataset exposure: weapons **454 candidates / 9560 claims**; artifacts **122 / 2562**; characters **1690 candidates**.

## Evidence-model comparison (no contract change)

| model | status | false-promotion risk | version-drift risk | auditability | reproducibility |
| --- | --- | --- | --- | --- | --- |
| strictExactRevision | current | lowest | lowest | highest | highest |
| claimScopedVersionTriangulation | proposalOnlyNotImplemented | low-to-medium; bounded to reviewed fields | medium; requires per-field invalidation when semantics change | high when both raw excerpts, digests, locators, and comparison output are retained | high for reviewed fields |

The alternative is a proposal only. Adoption requires explicit user approval and a separate DataContract/canonical-gate change.

## Primary-source investigation (non-promoting)

The following observations retain the strict genshin-db snapshot binding while keeping canonical runtime unchanged; AI self-approval is prohibited.

| source | release | release revision | explicit gameVersion | exact pinned revision | strictly bound | blocked reasons |
| --- | --- | --- | --- | --- | --- | --- |
| gcsim | v2.44.2 | 3647a07a7cc3004bc1e79d9bb5f7444de20dceaa | - | yes | no | gameVersionMissingInReleaseMetadata, metadataSnapshotNotMaterializedForOfflineReplay |
| genshinDb | v5.2.12 | 67f563f693343ea2ec8e8121f1245dcb010a8809 | 6.7 | no | yes | releaseRevisionIsAncestorOfPinnedRevision, exactPinnedRevisionBindingMissing, metadataSnapshotNotMaterializedForOfflineReplay |

- Research sources: **2**; release candidates with explicit gameVersion: **1**; exact-revision field candidates: **9**; strictly bound sources/fields: **1/9**.
- genshin-db record provenance uses the provider-authored package manifest as snapshot version 6.7. `src/data/version/weapons.json` remains introduction-version history and is retained separately; it never substitutes for the snapshot version.
- gcsim v2.44.2 resolves to the pinned revision, but the release metadata has no explicit Genshin gameVersion. HoYoLAB 6.7 corroboration is cross-source and is not revision-bound.

### Next candidates

- obtain an immutable official/provider manifest with explicit gameVersion and exact gcsim revision binding
- do not infer 6.7 from the HoYoLAB article or from the v2.44.2 release date
- propagate the strictly bound 6.7 source-level manifest through provenance without treating per-weapon introduced versions as snapshot versions
- retain the exact record digests only as field candidates until introduced-version semantics are independently resolved

## Result

The genshin-db source and nine exact weapon records now carry accepted same-revision snapshot-version provenance for 6.7. gcsim still lacks revision-specific Genshin gameVersion evidence, and local/second-provider claim gates remain blocked; canonical eligibility remains zero.

## Blocked reasons

- `canonicalGate:gameVersionEvidenceNotStrictlyBound`
- `externalEvidence:gameVersionMissing`
- `providerManifest:gcsim:metadataManifestNotConfigured`
- `record:gcsim:weapon:11503:fieldScopeMissing`
- `record:gcsim:weapon:11503:gameVersionMissing`
- `record:gcsim:weapon:11503:metadataDigestMissing`
- `record:gcsim:weapon:11503:primaryMetadataIncomplete`
- `record:gcsim:weapon:11503:sameRevisionBindingMismatch`
- `record:gcsim:weapon:11503:sameRevisionBindingMissing`
- `record:gcsim:weapon:11503:sourceRecordDigestBindingMissingOrMismatch`
- `record:gcsim:weapon:11509:fieldScopeMissing`
- `record:gcsim:weapon:11509:gameVersionMissing`
- `record:gcsim:weapon:11509:metadataDigestMissing`
- `record:gcsim:weapon:11509:primaryMetadataIncomplete`
- `record:gcsim:weapon:11509:sameRevisionBindingMismatch`
- `record:gcsim:weapon:11509:sameRevisionBindingMissing`
- `record:gcsim:weapon:11509:sourceRecordDigestBindingMissingOrMismatch`
- `record:gcsim:weapon:11518:fieldScopeMissing`
- `record:gcsim:weapon:11518:gameVersionMissing`
- `record:gcsim:weapon:11518:metadataDigestMissing`
- `record:gcsim:weapon:11518:primaryMetadataIncomplete`
- `record:gcsim:weapon:11518:sameRevisionBindingMismatch`
- `record:gcsim:weapon:11518:sameRevisionBindingMissing`
- `record:gcsim:weapon:11518:sourceRecordDigestBindingMissingOrMismatch`
- `record:gcsim:weapon:12402:fieldScopeMissing`
- `record:gcsim:weapon:12402:gameVersionMissing`
- `record:gcsim:weapon:12402:metadataDigestMissing`
- `record:gcsim:weapon:12402:primaryMetadataIncomplete`
- `record:gcsim:weapon:12402:sameRevisionBindingMismatch`
- `record:gcsim:weapon:12402:sameRevisionBindingMissing`
- `record:gcsim:weapon:12402:sourceRecordDigestBindingMissingOrMismatch`
- `record:gcsim:weapon:12430:fieldScopeMissing`
- `record:gcsim:weapon:12430:gameVersionMissing`
- `record:gcsim:weapon:12430:metadataDigestMissing`
- `record:gcsim:weapon:12430:primaryMetadataIncomplete`
- `record:gcsim:weapon:12430:sameRevisionBindingMismatch`
- `record:gcsim:weapon:12430:sameRevisionBindingMissing`
- `record:gcsim:weapon:12430:sourceRecordDigestBindingMissingOrMismatch`
- `record:gcsim:weapon:14402:fieldScopeMissing`
- `record:gcsim:weapon:14402:gameVersionMissing`
- `record:gcsim:weapon:14402:metadataDigestMissing`
- `record:gcsim:weapon:14402:primaryMetadataIncomplete`
- `record:gcsim:weapon:14402:sameRevisionBindingMismatch`
- `record:gcsim:weapon:14402:sameRevisionBindingMissing`
- `record:gcsim:weapon:14402:sourceRecordDigestBindingMissingOrMismatch`
- `record:gcsim:weapon:15402:fieldScopeMissing`
- `record:gcsim:weapon:15402:gameVersionMissing`
- `record:gcsim:weapon:15402:metadataDigestMissing`
- `record:gcsim:weapon:15402:primaryMetadataIncomplete`
- `record:gcsim:weapon:15402:sameRevisionBindingMismatch`
- `record:gcsim:weapon:15402:sameRevisionBindingMissing`
- `record:gcsim:weapon:15402:sourceRecordDigestBindingMissingOrMismatch`
- `record:gcsim:weapon:15502:fieldScopeMissing`
- `record:gcsim:weapon:15502:gameVersionMissing`
- `record:gcsim:weapon:15502:metadataDigestMissing`
- `record:gcsim:weapon:15502:primaryMetadataIncomplete`
- `record:gcsim:weapon:15502:sameRevisionBindingMismatch`
- `record:gcsim:weapon:15502:sameRevisionBindingMissing`
- `record:gcsim:weapon:15502:sourceRecordDigestBindingMissingOrMismatch`
- `record:gcsim:weapon:15516:fieldScopeMissing`
- `record:gcsim:weapon:15516:gameVersionMissing`
- `record:gcsim:weapon:15516:metadataDigestMissing`
- `record:gcsim:weapon:15516:primaryMetadataIncomplete`
- `record:gcsim:weapon:15516:sameRevisionBindingMismatch`
- `record:gcsim:weapon:15516:sameRevisionBindingMissing`
- `record:gcsim:weapon:15516:sourceRecordDigestBindingMissingOrMismatch`
- `source:gcsim:gameVersionMissing`
- `source:gcsim:metadataDigestMissing`
- `source:gcsim:primaryMetadataIncomplete`
- `source:gcsim:sameRevisionBindingMismatch`
- `source:gcsim:sameRevisionBindingMissing`

Audit errors: **0**; warnings: **0**; deterministic artifact: **yes**.
