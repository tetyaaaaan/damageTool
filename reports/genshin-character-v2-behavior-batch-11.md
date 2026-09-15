# Genshin behavior v2 batch 11 audit

- Status: **passed**
- Fixed batch characters: 10
- Raw source records: 150
- Batch-local inventory candidates: 140
- Source inventory candidates: 160
- Explicit inventory candidates: 100
- Unknown inventory candidates: 60
- Review-gated BehaviorSpec candidates: 140
- Runtime modifiers: 0
- Canonical records: 0

Explicit inventory fields are copied only as review-gated measurements; operation conflicts, resets, and unknown signals remain discrepancies. Runtime connection is blocked.

## Character coverage

| Character ID | Name | Sources | Inventory | Specs | Input candidates | Explicit | Unknown | Modifiers | Canonical |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10000123 | ドゥリン | 15 | 14 | 14 | 18 | 14 | 4 | 0 | 0 |
| 10000124 | ヤフォダ | 15 | 14 | 14 | 12 | 4 | 8 | 0 | 0 |
| 10000125 | コロンビーナ | 15 | 14 | 14 | 20 | 16 | 4 | 0 | 0 |
| 10000126 | 兹白 | 15 | 14 | 14 | 14 | 4 | 10 | 0 | 0 |
| 10000127 | イルーガ | 15 | 14 | 14 | 11 | 6 | 5 | 0 | 0 |
| 10000128 | ファルカ | 15 | 14 | 14 | 15 | 5 | 10 | 0 | 0 |
| 10000129 | ロエン | 15 | 14 | 14 | 26 | 22 | 4 | 0 | 0 |
| 10000130 | リンネア | 15 | 14 | 14 | 10 | 5 | 5 | 0 | 0 |
| 10000131 | ニコル | 15 | 14 | 14 | 19 | 14 | 5 | 0 | 0 |
| 10000132 | プルーネ | 15 | 14 | 14 | 15 | 10 | 5 | 0 | 0 |

## Contract

- Deterministic: true
- Errors: 0
