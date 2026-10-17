# Repository guidance

## Scope and authority

- Follow the current user request first. Treat dated goals, checkpoints, reports, and handoffs as historical context unless the user explicitly asks to resume that work.
- Preserve existing product behavior and data contracts unless the task requires changing them. Do not treat a generated artifact, legacy compatibility data, or an agent's prose as source evidence.
- Make reasonable, reversible in-scope changes without pausing for routine confirmation. Continue through implementation, proportionate verification, and fixes caused by the change.

## Read only what the task needs

- Use `docs/DEVELOPMENT_RULES.md` for the relevant naming, UI, CSV, or public-copy rules.
- Use `docs/GENSHIN_CALCULATION_REQUEST.md` when changing the Genshin request boundary, input provenance, or snapshot behavior; use `docs/GENSHIN_CALC_DESIGN.md` for calculation-engine responsibilities.
- Use the `genshin-v2-data` skill only for Genshin v2 source records, specs, verification, canonical Runtime, or an explicit resume of the r2 data-correction goal.
- Use `docs/HSR_CALC_DATA_SOURCES.md` only for HSR calculation-data work.
- Do not preload dated plans, reports, goal history, or broad repository maps. Open them only when the current task depends on them.

## 共通ヘッダー・フッターの開発ルール

- サイト共通のヘッダー・フッターは `scripts/lib/siteChrome.cjs` を正とします。共通ロゴ、ブランド名、文言、ナビゲーション、リンク、著作権表記、HTML構造はこの共通定義を編集します。
- 各ページの生成済みHTMLにある `site-chrome:header` / `site-chrome:footer` コメントで囲まれた部分は直接修正しません。共通UIのコピー実装も増やしません。
- 共通定義を変更したら `node scripts/syncSiteChrome.cjs` で対象HTMLへ反映し、生成差分が意図した共通部分だけであることを確認して、共通定義と一緒にcommitします。
- 同期後は `node scripts/syncSiteChrome.cjs --check` と `node --test tests/seo/site-chrome.test.cjs` で生成結果の整合性を確認します。`--check` は書き換えを行わず、同期漏れがあれば失敗します。
- 配信前の同期は `wrangler.toml` の `[build].command` から同じ `node scripts/syncSiteChrome.cjs` を実行します。生成済み静的HTMLを配信し、ブラウザでの追加取得には依存させません。
- パンくず、ページ固有の概要、計算入力、ページ固有操作は各ページ側で管理し、共通部分との境界を維持します。メニュー・テーマ操作は既存の `games/js/theme.js` を再利用します。

## Verification

- Start with the smallest meaningful check for the changed behavior. Run focused tests for affected code or data; use `node scripts/verifyGenshinCalc.cjs` when shared Genshin calculation behavior, generated data, or final integration warrants the full check.
- Broaden or repeat checks only after relevant failures, shared-engine changes, generated-artifact changes, or an explicit acceptance requirement. Documentation-only and other low-risk changes do not require the product test suite.
- Fix failures caused by the requested change and rerun the affected checks. Report unrelated pre-existing failures without expanding scope.

## Delegation

- Delegate bounded, independent work when parallel execution can save time, improve quality, or keep noisy exploration and test output out of the main context.
- Prefer delegation for independent exploration, candidate selection, repetitive or mechanical processing, fixture preparation, triage, and isolated verification when those tasks do not require cross-cutting judgment.
- Avoid duplicate investigation and concurrent edits to shared files. Give each worker a clear scope; the coordinating agent owns cross-cutting decisions, safety boundaries, and integration.
- Do not create work merely to justify delegation or add infrastructure, scripts, schemas, tests, or reports that the task does not need.

