# Genshin behavior v2 batch 7 audit

- Status: **passed**
- Fixed batch characters: 10
- Raw source records: 150
- Batch-local inventory candidates: 140
- Source inventory candidates: 181
- Explicit inventory candidates: 122
- Unknown inventory candidates: 59
- Review-gated BehaviorSpec candidates: 140
- Runtime modifiers: 0
- Canonical records: 0

Explicit inventory fields are copied only as review-gated measurements; operation conflicts, resets, and unknown signals remain discrepancies. Runtime connection is blocked.

## Character coverage

| Character ID | Name | Sources | Inventory | Specs | Input candidates | Explicit | Unknown | Modifiers | Canonical |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10000078 | アルハイゼン | 15 | 14 | 14 | 24 | 16 | 8 | 0 | 0 |
| 10000079 | ディシア | 15 | 14 | 14 | 26 | 22 | 4 | 0 | 0 |
| 10000080 | ミカ | 15 | 14 | 14 | 10 | 4 | 6 | 0 | 0 |
| 10000081 | カーヴェ | 15 | 14 | 14 | 13 | 9 | 4 | 0 | 0 |
| 10000082 | 白朮 | 15 | 14 | 14 | 14 | 9 | 5 | 0 | 0 |
| 10000083 | リネット | 15 | 14 | 14 | 12 | 8 | 4 | 0 | 0 |
| 10000084 | リネ | 15 | 14 | 14 | 25 | 13 | 12 | 0 | 0 |
| 10000085 | フレミネ | 15 | 14 | 14 | 20 | 19 | 1 | 0 | 0 |
| 10000086 | リオセスリ | 15 | 14 | 14 | 18 | 11 | 7 | 0 | 0 |
| 10000087 | ヌヴィレット | 15 | 14 | 14 | 19 | 11 | 8 | 0 | 0 |

## Contract

- Deterministic: true
- Errors: 0
