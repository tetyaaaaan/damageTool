# Genshin behavior v2 batch 1 audit

- Status: **passed**
- Fixed batch characters: 8
- Raw source records: 119
- Inventory candidates: 111
- Source inventory candidates: 101 (69 explicit / 32 unknown)
- Review-gated BehaviorSpec candidates: 111
- Runtime modifiers: 0
- Canonical records: 0

Explicit non-conflicting measurements copied from the deterministic behavior inventory remain needsReview. Unstated or ambiguous values, units, targets, lifecycle, and snapshot behavior remain unknown; Runtime connection is blocked.

## Character coverage

| Character ID | Name | Sources | Inventory | Specs | Modifiers | Canonical |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 10000002 | 神里綾華 | 16 | 15 | 15 | 0 | 0 |
| 10000003 | ジン | 15 | 14 | 14 | 0 | 0 |
| 10000005 | 旅人 | 14 | 13 | 13 | 0 | 0 |
| 10000006 | リサ | 15 | 14 | 14 | 0 | 0 |
| 10000007 | 旅人 | 14 | 13 | 13 | 0 | 0 |
| 10000014 | バーバラ | 15 | 14 | 14 | 0 | 0 |
| 10000015 | ガイア | 15 | 14 | 14 | 0 | 0 |
| 10000016 | ディルック | 15 | 14 | 14 | 0 | 0 |

## Contract

- Deterministic: true
- Errors: 0
