# Genshin behavior v2 batch 3 audit

- Status: **passed**
- Fixed batch characters: 10
- Raw source records: 151
- Inventory candidates: 141
- Review-gated BehaviorSpec candidates: 141
- Existing inventory candidates linked: 118
- Explicit candidate operations retained: 76
- Unknown candidate IDs retained: 42
- Runtime modifiers: 0
- Canonical records: 0

Raw source pointers remain review-gated. Explicit values are copied only from behavior-inventory candidates; conflicting operations and null resets remain verification discrepancies. Runtime connection is blocked.

## Character coverage

| Character ID | Name | Sources | Specs | Inventory input | Explicit | Unknown | Modifiers | Canonical |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10000033 | タルタリヤ | 15 | 14 | 19 | 12 | 7 | 0 | 0 |
| 10000034 | ノエル | 15 | 14 | 12 | 8 | 4 | 0 | 0 |
| 10000035 | 七七 | 15 | 14 | 8 | 7 | 1 | 0 | 0 |
| 10000036 | 重雲 | 15 | 14 | 11 | 6 | 5 | 0 | 0 |
| 10000038 | アルベド | 15 | 14 | 11 | 6 | 5 | 0 | 0 |
| 10000039 | ディオナ | 15 | 14 | 7 | 3 | 4 | 0 | 0 |
| 10000041 | モナ | 16 | 15 | 14 | 9 | 5 | 0 | 0 |
| 10000042 | 刻晴 | 15 | 14 | 14 | 10 | 4 | 0 | 0 |
| 10000043 | スクロース | 15 | 14 | 12 | 8 | 4 | 0 | 0 |
| 10000044 | 辛炎 | 15 | 14 | 10 | 7 | 3 | 0 | 0 |

## Contract

- Deterministic: true
- Errors: 0
