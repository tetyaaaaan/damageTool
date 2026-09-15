# Genshin behavior v2 batch 4 audit

- Status: **passed**
- Fixed batch characters: 10
- Raw source records: 150
- Batch-local inventory candidates: 140
- Source inventory candidates: 155
- Explicit inventory candidates: 103
- Unknown inventory candidates: 52
- Review-gated BehaviorSpec candidates: 140
- Runtime modifiers: 0
- Canonical records: 0

Explicit inventory fields are copied only as review-gated measurements; operation conflicts, resets, and unknown signals remain discrepancies. Runtime connection is blocked.

## Character coverage

| Character ID | Name | Sources | Inventory | Specs | Input candidates | Explicit | Unknown | Modifiers | Canonical |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10000045 | ロサリア | 15 | 14 | 14 | 10 | 9 | 1 | 0 | 0 |
| 10000047 | 楓原万葉 | 15 | 14 | 14 | 14 | 9 | 5 | 0 | 0 |
| 10000048 | 煙緋 | 15 | 14 | 14 | 6 | 3 | 3 | 0 | 0 |
| 10000049 | 宵宮 | 15 | 14 | 14 | 17 | 9 | 8 | 0 | 0 |
| 10000050 | トーマ | 15 | 14 | 14 | 20 | 15 | 5 | 0 | 0 |
| 10000051 | エウルア | 15 | 14 | 14 | 16 | 7 | 9 | 0 | 0 |
| 10000052 | 雷電将軍 | 15 | 14 | 14 | 19 | 13 | 6 | 0 | 0 |
| 10000053 | 早柚 | 15 | 14 | 14 | 19 | 10 | 9 | 0 | 0 |
| 10000054 | 珊瑚宮心海 | 15 | 14 | 14 | 10 | 9 | 1 | 0 | 0 |
| 10000055 | ゴロー | 15 | 14 | 14 | 24 | 19 | 5 | 0 | 0 |

## Contract

- Deterministic: true
- Errors: 0
