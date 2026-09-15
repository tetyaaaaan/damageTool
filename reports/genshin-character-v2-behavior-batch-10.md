# Genshin behavior v2 batch 10 audit

- Status: **passed**
- Fixed batch characters: 10
- Raw source records: 150
- Batch-local inventory candidates: 140
- Source inventory candidates: 172
- Explicit inventory candidates: 119
- Unknown inventory candidates: 53
- Review-gated BehaviorSpec candidates: 140
- Runtime modifiers: 0
- Canonical records: 0

Explicit inventory fields are copied only as review-gated measurements; operation conflicts, resets, and unknown signals remain discrepancies. Runtime connection is blocked.

## Character coverage

| Character ID | Name | Sources | Inventory | Specs | Input candidates | Explicit | Unknown | Modifiers | Canonical |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10000111 | ヴァレサ | 15 | 14 | 14 | 19 | 13 | 6 | 0 | 0 |
| 10000112 | エスコフィエ | 15 | 14 | 14 | 20 | 15 | 5 | 0 | 0 |
| 10000113 | イファ | 15 | 14 | 14 | 16 | 10 | 6 | 0 | 0 |
| 10000114 | スカーク | 15 | 14 | 14 | 20 | 12 | 8 | 0 | 0 |
| 10000115 | ダリア | 15 | 14 | 14 | 12 | 7 | 5 | 0 | 0 |
| 10000116 | イネファ | 15 | 14 | 14 | 18 | 12 | 6 | 0 | 0 |
| 10000119 | ラウマ | 15 | 14 | 14 | 26 | 21 | 5 | 0 | 0 |
| 10000120 | フリンズ | 15 | 14 | 14 | 12 | 9 | 3 | 0 | 0 |
| 10000121 | アイノ | 15 | 14 | 14 | 13 | 10 | 3 | 0 | 0 |
| 10000122 | ネフェル | 15 | 14 | 14 | 16 | 10 | 6 | 0 | 0 |

## Contract

- Deterministic: true
- Errors: 0
