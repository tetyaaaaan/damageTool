# Genshin official weapon frontier (11301-11303)

Status: **officialRawCapturedTargetVersionUnbound**; target: **7.0**; certificate/canonical: **blocked/0**

This is a bounded HoYoWiki raw-API capture. It does not modify queue, source catalog, candidates, runtime, or canonical data.

| entity | local name | official name | entry page | raw passive key | candidate claims | disposition |
| --- | --- | --- | ---: | --- | ---: | --- |
| 11301 | 冷刃 | Cool Steel | 1938 | Bane of Water and Ice | 8 | blocked |
| 11302 | 黎明の神剣 | Harbinger of Dawn | 2052 | Vigorous | 4 | blocked |
| 11303 | 旅道の剣 | Traveler's Handy Sword | 1977 | Journey | 0 | blocked |

- HoYoWiki aggregate pages 5, 7, and 8 resolve official entry IDs 2052, 1977, and 1938 to the exact English names captured here.
- All three current entry payloads expose a raw passive field and a Version Released field; raw bytes, URL, size, and SHA-256 are retained.
- Version Released is release/introduction evidence only. The mutable API has no immutable revision and no explicit Genshin 7.0 binding; capture time is not gameVersion evidence.
- HoYoWiki is the official-hoyoverse family. HoYoLAB notices normalize to the same family and cannot provide a second independent family in this lane.
- 11303 has no authoritative v2 candidate claim, so no candidate or promotion claim is invented; its numeric local ID is not silently bound to the official entry by translation inference.

## Gate

- Official raw field availability is recorded, but strict 7.0 binding is missing.
- The endpoint is mutable (`immutable: false`); the raw SHA-256 is an integrity digest, not a historical revision.
- No eligibility certificate or canonical promotion is issued.
- Reopen with an immutable official artifact explicitly bound to Genshin 7.0, or a newly disclosed independent source family.
