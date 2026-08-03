# HSR calculation data

The runtime loads the attack-data manifest in `attacks.json`.

- `catalog.json`: StarRailRes-derived characters, skills, equipment, and enemies.
- `attacks.generated.json`: Direct-damage entries generated from character skill descriptions and level parameters.
- `attack-overrides.json`: Reviewed exceptions keyed by attack ID. Keep only cases that cannot be represented correctly by the generator.
- `modifiers.json`: Conditional party, character, equipment, and enemy modifiers.
- `image-manifest.json`: Availability audit for locally served catalog images.

Regenerate attack data after updating `catalog.json`:

```powershell
node scripts/generateHsrAttacks.cjs
node --test tests/hsr/*.test.cjs
```

Do not edit `attacks.generated.json` by hand. Update the generator for general rules and `attack-overrides.json` for an ID-specific exception. The runtime merges overrides after generated entries.

Attack support is explicit at the file or record level. Generated entries are `review` data and the UI labels their results as reference values. Reviewed overrides are `calculable`. A record-level `support` object takes precedence over the file default. Run `node scripts/validateHsrAttacks.cjs` to audit counts and contracts before release.
