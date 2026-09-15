# Genshin character external field evidence audit

Status: **passed**

This report joins the 8 pilot BehaviorSpec characters and 25 talent-gap characters to pinned gcsim/Genshin Optimizer locators. It is evidence-only: no source-code values are extracted, no numeric tokens are matched, and no existing candidate is promoted.

## Coverage

- Pilot characters/specs: 8/56
- Talent-gap characters/specs: 25/73
- Evidence mappings: 258
- External source locators: 78
- Verification: {"needsReview":129}
- Runtime: {"blocked":129}
- Canonical candidates: 0

## Blocking policy

Every source and candidate has `gameVersion: null` plus `gameVersionNotExplicit`; mappings remain `needsReview` and `runtime=blocked` even when a local checkout is supplied. The gcsim revision mismatch between `constellation-source-index.json` and `source-catalog.json` is retained as a warning/blocking reason.

## Audit details

- Contract errors: 0
- Warnings: 0
- Malformed source records: 0
- Token matching violations: 0

A future extractor must resolve an exact external file/symbol, record its digest and explicit game version, compare field values semantically, and obtain independent review before any candidate can leave this blocked state.

