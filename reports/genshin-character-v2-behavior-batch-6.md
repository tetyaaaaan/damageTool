# Genshin behavior v2 batch 6 audit

- Status: **passed**
- Fixed batch characters: 10
- Raw source records: 150
- Batch-local inventory candidates: 140
- Source inventory candidates: 153
- Explicit inventory candidates: 86
- Unknown inventory candidates: 67
- Review-gated BehaviorSpec candidates: 140
- Runtime modifiers: 0
- Canonical records: 0

Explicit singleton inventory fields are copied only as review-gated schema measurements; conflicts, resets, add operations, and unknown signals remain discrepancies. Runtime connection is blocked.

## Character coverage

| Character ID | Name | Sources | Inventory | Specs | Input candidates | Explicit | Unknown | Modifiers | Canonical |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10000068 | ドリー | 15 | 14 | 14 | 17 | 8 | 9 | 0 | 0 |
| 10000069 | ティナリ | 15 | 14 | 14 | 16 | 7 | 9 | 0 | 0 |
| 10000070 | ニィロウ | 15 | 14 | 14 | 12 | 8 | 4 | 0 | 0 |
| 10000071 | セノ | 15 | 14 | 14 | 18 | 13 | 5 | 0 | 0 |
| 10000072 | キャンディス | 15 | 14 | 14 | 14 | 5 | 9 | 0 | 0 |
| 10000073 | ナヒーダ | 15 | 14 | 14 | 10 | 6 | 4 | 0 | 0 |
| 10000074 | レイラ | 15 | 14 | 14 | 13 | 4 | 9 | 0 | 0 |
| 10000075 | 放浪者 | 15 | 14 | 14 | 13 | 7 | 6 | 0 | 0 |
| 10000076 | ファルザン | 15 | 14 | 14 | 19 | 12 | 7 | 0 | 0 |
| 10000077 | ヨォーヨ | 15 | 14 | 14 | 21 | 16 | 5 | 0 | 0 |

## Contract

- Deterministic: true
- Errors: 0
