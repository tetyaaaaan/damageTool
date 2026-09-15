# Genshin weapon gcsim field evidence audit

- Status: **passed**
- Pinned source records: **9/9**
- Field records: **145**
- Eligible field extractions: **100**
- Eligible-but-canonical-blocked fields: **100**
- Fields with supportsClaimValue=true: **72**
- Candidate value agreements/conflicts: **72/0**
- needsReview fields: **45**
- Unresolved (needsReview + unmapped): **45**
- Unmapped source fields: **0**
- Canonical eligible fields/candidates: **0/0**
- Game-version-missing source records: **9**
- Portable provider-relative source files: **9/9**
- Absolute/root source-file leaks: **0**

## Interpretation

Eligible means that a named Go assignment and its semantic branch were extracted and structurally compared with a candidate claim. It does not promote that candidate: the pinned catalog has a repository revision and file SHA-256 but no game patch/version, so canonical eligibility remains false.

The extractor does not search arbitrary numeric tokens. Ambiguous scope, activation, target, duplicate, and display-only mappings remain `needsReview`.

## Errors

- none

## Warnings

- none
