# Genshin behavior v2 batch 5 audit

- Status: **passed**
- Fixed batch characters: 10
- Raw source records: 150
- Local raw-context candidates: 140
- Source inventory candidates: 145 (85 explicit / 60 unknown)
- Review-gated BehaviorSpec candidates: 140
- Runtime modifiers: 0
- Canonical records: 0

Only singleton explicit set candidates are copied into schema measurements. Conflicts, nulls, and add/replace/setMaximum/extend operations remain discrepancies; raw pointers and runtime promotion remain review-gated.

## Character coverage

| Character ID | Name | Sources | Inventory | Specs | Input candidates | Explicit | Unknown | Modifiers | Canonical |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10000056 | 九条裟羅 | 15 | 14 | 14 | 18 | 9 | 9 | 0 | 0 |
| 10000057 | 荒瀧一斗 | 15 | 14 | 14 | 15 | 8 | 7 | 0 | 0 |
| 10000059 | 鹿野院平蔵 | 15 | 14 | 14 | 17 | 11 | 6 | 0 | 0 |
| 10000060 | 夜蘭 | 15 | 14 | 14 | 21 | 11 | 10 | 0 | 0 |
| 10000062 | アーロイ | 15 | 14 | 14 | 7 | 4 | 3 | 0 | 0 |
| 10000063 | 申鶴 | 15 | 14 | 14 | 13 | 9 | 4 | 0 | 0 |
| 10000064 | 雲菫 | 15 | 14 | 14 | 11 | 5 | 6 | 0 | 0 |
| 10000065 | 久岐忍 | 15 | 14 | 14 | 15 | 11 | 4 | 0 | 0 |
| 10000066 | 神里綾人 | 15 | 14 | 14 | 12 | 4 | 8 | 0 | 0 |
| 10000067 | コレイ | 15 | 14 | 14 | 16 | 13 | 3 | 0 | 0 |

## Contract

- Deterministic: true
- Errors: 0
