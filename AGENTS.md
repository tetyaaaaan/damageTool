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

## GitHub Issues の進め方と完了条件

- GitHub Issues を課題の管理先とする。1件で修正と検証ができる単位で登録し、補正区分、発見日（判明している場合）、再現条件、現状、期待結果、個別の完了条件を記録する。追加の根拠を待つ項目は備忘録として区別する。
- Issue 番号で対応範囲を特定し、原則として1修正 Issue につき1 PR とする。着手前に再現条件と仕様を確認し、未確定の仕様を暫定採用する場合は根拠と仮定を記録する。
- 完了には、個別の期待結果を再現手順で確認し、既存の関連挙動への影響も確認する。ダメージ補正では対象攻撃と対象外攻撃を比較し、関係する非会心・会心・期待値を確認する。
- 変更点、検証環境と入力条件、確認結果、未確認事項を Issue または関連 PR に記録する。実測比較では残差を記録し、未確認の一致を確認済みと扱わない。
- 修正 PR のマージ後、必須の確認が揃ったら Issue を閉じる。公開サイトの挙動が対象の場合は公開版でも確認するまで開いたままにし、PR に自動クローズ指定を使わない。

## Delegation

- Delegate bounded, independent work when parallel execution can save time, improve quality, or keep noisy exploration and test output out of the main context.
- Prefer delegation for independent exploration, candidate selection, repetitive or mechanical processing, fixture preparation, triage, and isolated verification when those tasks do not require cross-cutting judgment.
- Avoid duplicate investigation and concurrent edits to shared files. Give each worker a clear scope; the coordinating agent owns cross-cutting decisions, safety boundaries, and integration.
- Do not create work merely to justify delegation or add infrastructure, scripts, schemas, tests, or reports that the task does not need.

