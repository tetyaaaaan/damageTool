# Genshin r2 behaviorSpec candidate materialization audit

- Generated: 2026-08-29T00:00:00.000Z
- Scope: 1533 queue candidates (`layer=behaviorSpec`, `primaryBlockReason=semanticDecisionRequired`, `ready`, `searchRequired`)
- Claims: 10731 (9198 external, 1533 internal runtime metadata)

## Result

- Existing transition raw integrity verified: 1521; integrity gap: 12
- Local claim schema complete: 1484; missing (pilot fallback): 49
- Candidate×claim values materialized: 0
- Candidate-field search still required: 9198
- Finite G06 candidate frontier proven: 0
- Strict/certificate/canonical: 0/0/0

## Safety boundary

The captured genshin-db records are a single correlated GenshinData-derived family. Their raw descriptions and attribute templates are retained as direct pointers only; no prose, token, or placeholder inference is performed. `searchRequired` is not treated as `searchExhausted`, so no candidate is closed or deferred. Runtime is recorded separately as internal metadata and is not source proof.

Authoritative queue: [reports/genshin-evidence-task-queue.json](../reports/genshin-evidence-task-queue.json)
Source frontier: [reports/genshin-candidate-source-coverage-frontier-inventory.json](../reports/genshin-candidate-source-coverage-frontier-inventory.json)
