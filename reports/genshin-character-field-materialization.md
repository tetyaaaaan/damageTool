# Genshin character field materialization audit

Status: **passed**

This artifact materializes only the pinned source-index paths for the 8 pilot and 25 talent-gap character priorities. Source-index and source-catalog revisions remain separate observations; a revision or checkout match is not game-version evidence.

## Coverage

- Characters: 31 (pilot 8, talent-gap 25)
- Candidates: 129
- External locators: 78
- Materialized/path-verified locators: 74/74
- Files/declarations: 297/4219
- Field evidence: 258; named-symbol observations: 25
- Game-version verified: 0; canonical: 0
- Verification: {"needsReview":258}; runtime: {"blocked":258}

## Safety contract

Only a checkout whose git HEAD equals the source-index revision is path-verified. The source-catalog revision is retained independently and mismatches are blocked. Parsing records named declarations/structured assignment locations only; no numeric token, prose regex, or computed field value is promoted. Every field remains `needsReview`, `runtime=blocked`, `gameVersion: null`, and `canonical: 0` until explicit version evidence and independent review exist.

- Contract errors: 0
- Warnings: 0
- Blocked reasons: {"checkoutRevisionMismatchSourceCatalog":168,"externalLocatorMissing":14,"externalLocatorOutsideConfiguredRoot":14,"gameVersionNotExplicit":258,"independentReviewerRequired":258,"namedDeclarationValueExtractionNotImplemented":258,"namedSymbolNotFound":223,"sourceCatalogProjectMissing":168,"sourceCatalogRevisionMismatch":168}

