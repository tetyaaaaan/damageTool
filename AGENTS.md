# Repository guidance

## Scope and authority

- Follow the current user request first. Treat dated goals, checkpoints, reports, and handoffs as historical context unless the user explicitly asks to resume that work.
- Preserve existing product behavior and data contracts unless the task requires changing them. Do not treat a generated artifact, legacy compatibility data, or an agent's prose as source evidence.
- Make reasonable, reversible in-scope changes without pausing for routine confirmation. Continue through implementation, proportionate verification, and fixes caused by the change.

## Read only what the task needs

- Use `docs/DEVELOPMENT_RULES.md` for the relevant naming, UI, CSV, or public-copy rules.
- Use `docs/GENSHIN_CALCULATION_REQUEST.md` when changing the Genshin request boundary, input provenance, or snapshot behavior; use `docs/GENSHIN_CALC_DESIGN.md` for calculation-engine responsibilities.
- Use the `genshin-v2-data` skill only for Genshin v2 source records, specs, verification, canonical Runtime, or an explicit resume of the r2 data-correction goal.
- Use `docs/HSR_CALC_DATA_SOURCES.md` only for HSR calculation-data work.
- Do not preload dated plans, reports, goal history, or broad repository maps. Open them only when the current task depends on them.

## Verification

- Start with the smallest meaningful check for the changed behavior. Run focused tests for affected code or data; use `node scripts/verifyGenshinCalc.cjs` when shared Genshin calculation behavior, generated data, or final integration warrants the full check.
- Broaden or repeat checks only after relevant failures, shared-engine changes, generated-artifact changes, or an explicit acceptance requirement. Documentation-only and other low-risk changes do not require the product test suite.
- Fix failures caused by the requested change and rerun the affected checks. Report unrelated pre-existing failures without expanding scope.

## Delegation

- Delegate bounded, independent work when parallel execution can save time, improve quality, or keep noisy exploration and test output out of the main context.
- Prefer delegation for independent exploration, candidate selection, repetitive or mechanical processing, fixture preparation, triage, and isolated verification when those tasks do not require cross-cutting judgment.
- Avoid duplicate investigation and concurrent edits to shared files. Give each worker a clear scope; the coordinating agent owns cross-cutting decisions, safety boundaries, and integration.
- Do not create work merely to justify delegation or add infrastructure, scripts, schemas, tests, or reports that the task does not need.

