# Genshin canonical RuntimeModifier audit

Status: **passed**

Only independently verified structured specifications may be promoted. The generator never parses prose, and every copied field needs an exact verified claim, two provider names in at least two independent source families, a consistent game version, either a human attestation or an authoritative deterministicConsensus certificate plus machine attestation, an allowlisted destination, and explicit legacy supersession metadata.

The browser exposes a dedicated BehaviorModifier runtime route. Current behavior candidates still remain blocked because their evidence, field claims, review, destination, and supersession contracts are incomplete.

| Input layer | Candidates | Canonical | Primary blocking reasons |
| --- | ---: | ---: | --- |
| weapons | 455 | 1 | claim:activation:eligibilityCertificateMissing (454); claim:activation:status:needsReview (454); claim:activation:verificationAttestationMissing (454) |
| artifacts | 122 | 0 | claim:activation:eligibilityCertificateMissing (122); claim:activation:status:needsReview (122); claim:activation:verificationAttestationMissing (122) |
| talentGap | 73 | 0 | claim:activation:eligibilityCertificateMissing (73); claim:activation:status:needsReview (73); claim:activation:verificationAttestationMissing (73) |
| behavior | 92 | 1 | claimCoverage:runtime.destination:verifiedRequired (91); claimCoverage:runtime.supersedesLegacyModifierIds:verifiedRequired (91); destination:missing (91) |
| behaviorBatch1 | 111 | 0 | claim:energy:eligibilityCertificateMissing (111); claim:energy:status:needsReview (111); claim:energy:verificationAttestationMissing (111) |
| behaviorBatch2 | 140 | 0 | claim:energy:eligibilityCertificateMissing (140); claim:energy:status:needsReview (140); claim:energy:verificationAttestationMissing (140) |
| behaviorBatch3 | 141 | 0 | claim:energy:eligibilityCertificateMissing (141); claim:energy:status:needsReview (141); claim:energy:verificationAttestationMissing (141) |
| behaviorBatch4 | 140 | 0 | claim:energy:eligibilityCertificateMissing (140); claim:energy:status:needsReview (140); claim:energy:verificationAttestationMissing (140) |
| behaviorBatch5 | 140 | 0 | claim:energy:eligibilityCertificateMissing (140); claim:energy:status:needsReview (140); claim:energy:verificationAttestationMissing (140) |
| behaviorBatch6 | 140 | 0 | claim:energy:eligibilityCertificateMissing (140); claim:energy:status:needsReview (140); claim:energy:verificationAttestationMissing (140) |
| behaviorBatch7 | 140 | 0 | claim:energy:eligibilityCertificateMissing (140); claim:energy:status:needsReview (140); claim:energy:verificationAttestationMissing (140) |
| behaviorBatch8 | 140 | 0 | claim:energy:eligibilityCertificateMissing (140); claim:energy:status:needsReview (140); claim:energy:verificationAttestationMissing (140) |
| behaviorBatch9 | 140 | 0 | claim:energy:eligibilityCertificateMissing (140); claim:energy:status:needsReview (140); claim:energy:verificationAttestationMissing (140) |
| behaviorBatch10 | 140 | 0 | claim:energy:eligibilityCertificateMissing (140); claim:energy:status:needsReview (140); claim:energy:verificationAttestationMissing (140) |
| behaviorBatch11 | 140 | 0 | claim:energy:eligibilityCertificateMissing (140); claim:energy:status:needsReview (140); claim:energy:verificationAttestationMissing (140) |
| behaviorBatch12 | 14 | 0 | claim:energy:eligibilityCertificateMissing (14); claim:energy:status:needsReview (14); claim:energy:verificationAttestationMissing (14) |
| **total** | **2268** | **2** | 2266 excluded |

A canonical count of zero is intentional fail-closed behavior, not a claim that candidate coverage is complete or verified.
