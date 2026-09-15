---
name: genshin-v2-data
description: Work on Genshin v2 data authoring, evidence and verification, canonical Runtime promotion, or the r2 data-correction workflow. Do not use for UI/CSS, HSR, or unrelated calculator work.
---

# Genshin v2 data

Use this skill only for the workflows named in the description. The user's current request takes precedence over historical goal or workflow text.

## Choose the relevant route

- For a new v2 record, spec, modifier, or Runtime connection, read the relevant sections of `docs/GENSHIN_V2_DATA_AUTHORING_STANDARD.md`, then inspect only the schemas, policies, generator, and consumer involved in that data path.
- For verification, promotion, source-family, version, or evidence work, read the applicable safety conditions in `docs/genshin-goals/2026-08-28-realignment/revised-goal.md` and the specific schema or policy being enforced. Preserve fail-closed behavior: unknown or insufficiently verified effects must not enter canonical/default production data.
- For an explicit r2 resume, begin with `games/genshin/data/v2/version-transitions/6.7-to-7.0/active-goal-resume-checkpoint.json`. Read the relevant goal sections and only the execution-addendum section needed for the current batch. Dated pause, stop, model-name, and next-task statements are history unless the current user request reactivates them.

## Execution boundaries

- Define the current batch's target IDs, intended outcome, authoritative data path, missing evidence, and consumer before editing. Reuse existing artifacts and finite searches; do not repeat completed repository-wide audits.
- Preserve the established evidence rules: fixed raw artifacts and digests, field- and version-bound claims, independent source-family requirements where strict verification applies, explicit discrepancies, and no self-approval of AI interpretation.
- Use focused checks that exercise the changed semantic boundary. Run broader generation, queue, determinism, or UI regression only when the changed dependency or acceptance boundary requires it.
- Use subagents for bounded, independent work when doing so saves main-context usage or parallelizes useful work, especially raw comparison, candidate selection, bounded inventory, repetitive/mechanical processing, and isolated fixture or verification work.
- Keep source acceptance, semantic decisions, safety boundaries, production integration, and cross-cutting changes with the coordinating agent. Avoid overlapping edits, duplicate investigation, and delegation created only for its own sake.
- Finish the requested batch through necessary implementation, verification, and correction. Do not equate candidate preparation, a successful generator, or `autoProcessableNow=0` with verification, Runtime acceptance, or completion.
