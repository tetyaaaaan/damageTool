# Genshin behavior v2 batch 8 audit

- Status: **passed**
- Fixed batch characters: 10
- Raw source records: 150
- Batch-local inventory candidates: 140
- Source inventory candidates: 209
- Explicit inventory candidates: 142
- Unknown inventory candidates: 67
- Review-gated BehaviorSpec candidates: 140
- Runtime modifiers: 0
- Canonical records: 0

Explicit inventory fields are copied only as review-gated measurements; operation conflicts, resets, and unknown signals remain discrepancies. Runtime connection is blocked.

## Character coverage

| Character ID | Name | Sources | Inventory | Specs | Input candidates | Explicit | Unknown | Modifiers | Canonical |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10000088 | シャルロット | 15 | 14 | 14 | 24 | 17 | 7 | 0 | 0 |
| 10000090 | シュヴルーズ | 15 | 14 | 14 | 20 | 13 | 7 | 0 | 0 |
| 10000091 | ナヴィア | 15 | 14 | 14 | 18 | 9 | 9 | 0 | 0 |
| 10000092 | 閑雲 | 15 | 14 | 14 | 26 | 18 | 8 | 0 | 0 |
| 10000093 | 嘉明 | 15 | 14 | 14 | 14 | 11 | 3 | 0 | 0 |
| 10000095 | シグウィン | 15 | 14 | 14 | 17 | 11 | 6 | 0 | 0 |
| 10000096 | アルレッキーノ | 15 | 14 | 14 | 29 | 24 | 5 | 0 | 0 |
| 10000097 | セトス | 15 | 14 | 14 | 20 | 11 | 9 | 0 | 0 |
| 10000099 | エミリエ | 15 | 14 | 14 | 24 | 18 | 6 | 0 | 0 |
| 10000100 | カチーナ | 15 | 14 | 14 | 17 | 10 | 7 | 0 | 0 |

## Contract

- Deterministic: true
- Errors: 0
