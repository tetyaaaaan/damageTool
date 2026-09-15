# Genshin character ID identity consistency audit

Status: **passed**; identity-sensitive promotion: **failClosed**; canonical promotion: **forbidden (0)**

This read-only audit mechanically compares the DataContract catalog/source-text datasets with both legacy profile-mapper name maps. Missing mapper entries are reported as consumer coverage gaps; they are not treated as name mismatches. No identity is inferred from source prose and no canonical data is promoted.

## Summary

- Catalog entities: **117**; source-text talents: **117**; source-text constellations: **117**.
- Compared entities: **117**; mapper maps: **2**.
- Identity-sensitive gate: **failClosed**; blocking IDs: 10000092, 10000093.
- Consumer coverage: **gap**; missing mapper IDs: **19**.

## Classification

| Classification | Count | IDs |
| --- | ---: | --- |
| match | 96 | 10000002, 10000003, 10000005, 10000006, 10000007, 10000014, 10000015, 10000016, 10000020, 10000021, 10000022, 10000023, 10000024, 10000025, 10000026, 10000027, 10000029, 10000030, 10000031, 10000032, 10000033, 10000034, 10000035, 10000036, 10000037, 10000038, 10000039, 10000041, 10000042, 10000043, 10000044, 10000045, 10000046, 10000047, 10000048, 10000049, 10000050, 10000051, 10000052, 10000053, 10000054, 10000055, 10000056, 10000057, 10000058, 10000059, 10000060, 10000062, 10000063, 10000064, 10000065, 10000066, 10000067, 10000068, 10000069, 10000070, 10000071, 10000072, 10000073, 10000074, 10000075, 10000076, 10000077, 10000078, 10000079, 10000080, 10000081, 10000082, 10000083, 10000084, 10000085, 10000086, 10000087, 10000088, 10000089, 10000090, 10000091, 10000094, 10000095, 10000096, 10000097, 10000098, 10000099, 10000100, 10000101, 10000102, 10000103, 10000104, 10000105, 10000106, 10000107, 10000108, 10000112, 10000115, 10000121, 10000132 |
| mapperMissing | 19 | 10000109, 10000110, 10000111, 10000113, 10000114, 10000116, 10000119, 10000120, 10000122, 10000123, 10000124, 10000125, 10000126, 10000127, 10000128, 10000129, 10000130, 10000131, 10000133 |
| mapperDuplicateDisagreement | 0 | — |
| catalogSourceTextMismatch | 0 | — |
| mapperNameMismatch | 2 | 10000092, 10000093 |
| malformedEvidence | 0 | — |

Observed catalog-vs-mapper mismatches: `10000092`, `10000093`. Missing mapper coverage remains a separate `mapperMissing` classification and is never relabeled as a mismatch.

## Inputs

| Role | Dataset | Path | Layer | Authority | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| catalog | characters | characters.json | raw | catalog | 5d239863352fc896931c0c626e2de1ad60c615e4e376142daa8e2d3a7464c211 |
| sourceTextTalents | characterTalents | character-talents.json | raw | sourceText | 4263297365929e19b3ac99f9e63158d5033d66cf2b37617bdbccb2d8fb8a5e31 |
| sourceTextConstellations | characterConstellations | character-constellations.json | raw | sourceText | 597d3eb254ccc9cc2fec3d3e7c9bf87fd2bdcca60e2140ffcf08778fd9a91e4e |
| manifest | — | games/genshin/data/data-v2-manifest.json | — | DataContract | c1816e273b31052a1a4c0fe0b902dc48f326f5dbb4ac9f358a1f16bbe8a1ece4 |
| consumerMapper | — | games/js/genshinProfileMapper.js | legacy | profile mapper | 6fdc93b3b6369faea17ace15b01bf455f5b66fc297d5c34113dcdfae3f271629 |

## Gate policy

- `mapperDuplicateDisagreement`, `catalogSourceTextMismatch`, `mapperNameMismatch`, and `malformedEvidence` fail closed for identity-sensitive promotion.
- `mapperMissing` is a consumer coverage gap and remains a distinct classification.
- Canonical promotion is forbidden and remains zero; this report does not mutate any source, verification status, or runtime data.

Field digest: `a354d79e4269faa657cc3cd593a229cdbd830cbac75e8d677bc5040c61ca8f11`

