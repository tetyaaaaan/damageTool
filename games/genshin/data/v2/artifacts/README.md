# Genshin artifact-set v2 evidence layer

This directory is a deterministic, copy-only migration candidate for all 61
legacy artifact sets. It is evidence for review, not a promoted runtime data
source.

The generated layer contains 122 structured modifier candidates (50 two-piece
and 72 four-piece records). Every candidate is `needsReview` with
`singleSource`; none is `canonical`. The seven sets without a structured
modifier record remain represented by raw source records and a blocked package
with `structuredModifiersMissing`. Their deterministic classifications are
materialized in `gap-review.json`: 3 sets are `unstructured` (raw 2pc/4pc
effect text with no modifier record), 4 are `displayOnly` (one-piece-only raw
text), and the empty 2pc/4pc slots are explicitly `noEffect`. The one missing
scalar value contract (`artifact:15020:fourPiece:4pc_burst_damage_bonus_from_er`)
is `needsReview`; its explicit `ratio`, `reference`, and `maxValue` fields are
retained, while no value is inferred. `invalid` remains a reserved
classification with zero current records. Every classification carries source
pointers and `canonical: 0`.

Each set intentionally has two levels of effect evidence:

* `artifact:<setId>:effects` is the aggregate `artifact-set-effects.json`
  record. Its digest proves the complete legacy effect document.
* `artifact:<setId>:effect:<onePiece|twoPiece|fourPiece>` is a field-level raw
  text record used by candidates and package slot references. The field records
  are hierarchical references, not duplicate modifiers.

Modifier source records preserve the complete structured object from
`calc/artifact-set-modifiers.json` (or an explicit `sourceText` field when one
is supplied). Values, targets, conditions, duration/stack fields, and policy
inputs are copied from those explicit fields. Localized effect text is retained
as evidence and is never parsed to infer a value or target.

Regenerate the JSON layer with:

```text
node scripts/genshinArtifactV2Generate.cjs
node scripts/genshinArtifactV2Audit.cjs
```

The generator writes `gap-review.json` alongside the source/spec/verification
artifacts. The audit checks every gap source pointer, 2pc/4pc display versus
calculation blocking state, input-policy counts, and the value-contract review
without promoting any candidate to canonical runtime.

The audit verifies source digests, source-reference resolution, set/modifier
coverage, piece-slot/value/target/duration/stack copies, deterministic input
policy classification, seven blocked packages, and repeated legacy modifier ID
groups (14 groups; namespaced candidate IDs remain unique).
