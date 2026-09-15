# Genshin behavior v2 batch 9 audit

- Status: **passed**
- Fixed batch characters: 10
- Raw source records: 150
- Batch-local inventory candidates: 140
- Source inventory candidates: 196
- Explicit inventory candidates: 126
- Unknown inventory candidates: 70
- Review-gated BehaviorSpec candidates: 140
- Runtime modifiers: 0
- Canonical records: 0

Explicit inventory fields are copied only as review-gated measurements; operation conflicts, resets, and unknown signals remain discrepancies. Runtime connection is blocked.

## Character coverage

| Character ID | Name | Sources | Inventory | Specs | Input candidates | Explicit | Unknown | Modifiers | Canonical |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10000101 | キィニチ | 15 | 14 | 14 | 22 | 14 | 8 | 0 | 0 |
| 10000102 | ムアラニ | 15 | 14 | 14 | 16 | 6 | 10 | 0 | 0 |
| 10000103 | シロネン | 15 | 14 | 14 | 27 | 18 | 9 | 0 | 0 |
| 10000104 | チャスカ | 15 | 14 | 14 | 18 | 6 | 12 | 0 | 0 |
| 10000105 | オロルン | 15 | 14 | 14 | 22 | 17 | 5 | 0 | 0 |
| 10000106 | マーヴィカ | 15 | 14 | 14 | 19 | 14 | 5 | 0 | 0 |
| 10000107 | シトラリ | 15 | 14 | 14 | 23 | 16 | 7 | 0 | 0 |
| 10000108 | 藍硯 | 15 | 14 | 14 | 11 | 7 | 4 | 0 | 0 |
| 10000109 | 夢見月瑞希 | 15 | 14 | 14 | 12 | 9 | 3 | 0 | 0 |
| 10000110 | イアンサ | 15 | 14 | 14 | 26 | 19 | 7 | 0 | 0 |

## Contract

- Deterministic: true
- Errors: 0
