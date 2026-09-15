# Genshin canonical Runtime → UI/calculation gap audit

Status: **passed** for the repository-local synthetic fixture; production canonical runtime remains **0 records (fail-closed)**.

The test `tests/genshin/genshinCanonicalEndToEnd.test.cjs` builds four explicitly synthetic, two-source reviewed specifications in memory and sends them through:

`Raw/Spec fixture → genshinCanonicalRuntimeGenerate → browser GenshinCalcData.loadGenshinCalcData → supersession/registry remap → condition panel model → weapon/artifact/active-talent/party collection → damage calculation`.

The browser loader offered 4 records, applied 4, rejected 0, and superseded 4 legacy IDs. Destination routing covered `weaponModifiers.modifiers`, `artifactSetModifiers.fourPiece`, and `talentModifiers.passive`; the weapon registry references were remapped to the canonical IDs.

The conditional synthetic weapon effect produced an option condition definition. Selecting `enabled` applied the canonical conditional modifier; selecting `disabled` removed it and changed the non-critical result. The same run confirmed weapon, artifact, active-talent, and party-talent collection paths.

No synthetic value is written to production calc JSON, `canonical-runtime.json`, or the production manifest. The second test asserts that the shipped canonical runtime is still empty and the fixture is not shipped.

Reproduce with:

```text
node --test tests/genshin/genshinCanonicalEndToEnd.test.cjs
```

