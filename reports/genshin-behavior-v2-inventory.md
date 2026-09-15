# Genshin behavior v2 inventory

Status: **passed**

This report is generated from the deterministic all-character inventory audit. It is an evidence/coverage layer; it does not promote runtime behavior or infer values from prose.

## Coverage

| Metric | Count |
| --- | ---: |
| Raw characters | 117 |
| Pilot characters excluded | 8 |
| Expansion characters | 109 |
| Source records | 1757 |
| Expansion candidates | 1694 |
| Pilot candidates leaked | 0 |
| Canonical candidates | 0 |

## Candidate status

| Status | Count |
| --- | ---: |
| candidate | 1083 |
| unknown | 611 |

## Candidate kinds

| Kind | Count |
| --- | ---: |
| count | 671 |
| timing | 437 |
| icd | 332 |
| refresh | 192 |
| charge | 62 |

All candidate records remain needsReview/singleSource; unknown records retain a null value and a source pointer for later review.
