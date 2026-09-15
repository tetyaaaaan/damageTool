# Genshin behavior v2 batch 12 audit

- Status: **passed**
- Fixed batch characters: 1
- Raw source records: 15
- Batch-local inventory candidates: 14
- Source inventory candidates: 12
- Explicit inventory candidates: 4
- Unknown inventory candidates: 8
- Review-gated BehaviorSpec candidates: 14
- Runtime modifiers: 0
- Canonical records: 0

Explicit inventory fields are copied only as review-gated measurements; operation conflicts, resets, and unknown signals remain discrepancies. Runtime connection is blocked.

## Character coverage

| Character ID | Name | Sources | Inventory | Specs | Input candidates | Explicit | Unknown | Modifiers | Canonical |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10000133 | サンドローネ | 15 | 14 | 14 | 12 | 4 | 8 | 0 | 0 |

## Contract

- Deterministic: true
- Errors: 0
