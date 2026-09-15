# Genshin behavior v2 batch 2 audit

- Status: **passed**
- Fixed batch characters: 10
- Raw source records: 150
- Batch-local inventory candidates: 140
- Source inventory candidates: 91
- Explicit inventory candidates: 50
- Unknown inventory candidates: 41
- Review-gated BehaviorSpec candidates: 140
- Runtime modifiers: 0
- Canonical records: 0

Raw source pointers and existing inventory candidates are retained as review evidence. Explicit values are copied only into schema measurement fields; operations, conflicts, reset/null candidates, and unknown candidates remain in verification discrepancies. Runtime connection is blocked and canonical promotion is zero.

## Character coverage

| Character ID | Name | Sources | Local inventory | Signal candidates | Unknown | Specs | Modifiers | Canonical |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10000020 | レザー | 15 | 14 | 15 | 6 | 14 | 0 | 0 |
| 10000021 | アンバー | 15 | 14 | 8 | 5 | 14 | 0 | 0 |
| 10000022 | ウェンティ | 15 | 14 | 10 | 4 | 14 | 0 | 0 |
| 10000023 | 香菱 | 15 | 14 | 5 | 0 | 14 | 0 | 0 |
| 10000024 | 北斗 | 15 | 14 | 8 | 3 | 14 | 0 | 0 |
| 10000025 | 行秋 | 15 | 14 | 6 | 2 | 14 | 0 | 0 |
| 10000027 | 凝光 | 15 | 14 | 11 | 4 | 14 | 0 | 0 |
| 10000029 | クレー | 15 | 14 | 10 | 4 | 14 | 0 | 0 |
| 10000030 | 鍾離 | 15 | 14 | 7 | 4 | 14 | 0 | 0 |
| 10000032 | ベネット | 15 | 14 | 11 | 9 | 14 | 0 | 0 |

## Contract

- Deterministic: true
- Errors: 0
