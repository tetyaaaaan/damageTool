# Genshin representative canonical E2E

Status: **passed**

- Target: **12516 / w_12516_stat_1**
- Raw sources: **2** strict independent sources for Genshin **6.7**
- Human review: **verified** by **user:workspace-owner**
- Canonical Runtime: **true**; production active/pending: **0/2**; historical fixture applied/superseded: **2/1**
- UI: weapon **12516**, refinement **R5**, incorrect toggle: **false**
- Calculation: **15** results; effective ATK **2000**; double-applied: **false**

The persistent self ATK bonus is represented in canonical provenance and recognized as already included in final manual/UID stats, so the result UI does not expose a cause-less toggle and the engine does not add it twice.
