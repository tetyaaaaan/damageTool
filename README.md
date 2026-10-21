# ダメージ計算ツール

原神と崩壊スターレイルのダメージを確認するための静的Webツールです。

原神のCurrentCalcは、現在状態を明示入力する単発ダメージ計算です。対応範囲、保存機能、既知の制限は[利用ガイド](guides/genshin/index.html)、公開判定に使うテスト集合と実行手順は[CurrentCalc Release Gate](docs/GENSHIN_CURRENTCALC_RELEASE_GATE.md)を参照してください。

## 開発メモ

- 共通ヘッダー・フッターを含むリポジトリの開発指示は [AGENTS.md](AGENTS.md) を参照してください。
- Cloudflare Workers と Workers Assets で運用します。
- 公開ルートは `https://tetinet.com/` とし、静的ファイルは `/` 配下を正とします。
- HSRのUID取得APIは `worker.js` の `/games/api/hsr-profile` で処理します。
- Pages Functionsとは併用しないため、`functions/` ディレクトリは置きません。
- 画面表示は `games/index.html`、`games/genshin/index.html`、`games/hsr/index.html` を中心に構成します。
- 計算処理は `games/js/` 配下にまとめます。
- 元データは `games/data/` 配下のCSVを正とし、同名のExcelファイルは編集・確認用として扱います。
- 命名規則、コメント方針、配色を含むデザインシステム、CSVの編集ルールは `docs/DEVELOPMENT_RULES.md` を参照してください。
- 原神JSON計算の責務、補正解析、対応順は `docs/GENSHIN_CALC_DESIGN.md` を参照してください。
- STEP 19〜24の監査・数式拡張・ゴールデン検証は `docs/GENSHIN_CALC_STEP19_24.md` を参照してください。

## テスト

原神JSON計算の単体・統合テストはNode.js標準テストランナーで実行します。

以下は旧データ監査も含む全体テストです。CurrentCalcの公開判定には上記Release Gateのfocused suiteを使用し、canonical/provenance監査の残件と分離します。監査レポートやGolden値の再生成は公開判定の必須手順ではありません。

```bash
node --test "tests/genshin/*.test.cjs"
```

補正監査レポートと代表シナリオのゴールデン値は次のコマンドで再生成します。

```bash
node scripts/genshinModifierAudit.cjs
node scripts/generateGenshinGolden.cjs
```

## ローカル確認

VS Code Live Server の `http://127.0.0.1:5500/` でも画面表示は確認できますが、崩壊:スターレイルのUID取得はEnka.Network APIのCORS制限で失敗する場合があります。

UID取得を含めて確認する場合は、同一オリジンのプロキシを持つローカルサーバーを使ってください。

powershellで実行
```bash
cd D:\Documents\GitHub\damageTool
node local-server.cjs
```

起動後、次のURLを開きます。

```text
http://127.0.0.1:4173/games/hsr/
```


## Cloudflare公開用の隔離配信物

Node.js 22.5以降（推奨24）とGit、tar、Wranglerを使用します。作業フォルダから直接デプロイせず、承認済みのcommitをリポジトリ外の新しいディレクトリへ取り出してください。未commit差分・未追跡ファイルは取り込みません。

PowerShell例（`$releaseCommit` は承認された完全なcommit SHAに置き換えます）:

```powershell
$releaseCommit = "承認済みcommit SHA"
$releaseDir = Join-Path $env:TEMP ("tetinet-release-" + [guid]::NewGuid().ToString("N"))
node scripts/prepareWorkerRelease.cjs $releaseCommit $releaseDir
if ($LASTEXITCODE -ne 0) { throw "配信物の準備に失敗しました" }
Set-Location $releaseDir
node scripts/prepareWorkerRelease.cjs --check-release
if ($LASTEXITCODE -ne 0) { throw "配信資産の検証に失敗しました" }
wrangler deploy --dry-run --outdir (Join-Path $env:TEMP ("tetinet-bundle-" + [guid]::NewGuid().ToString("N")))
if ($LASTEXITCODE -ne 0) { throw "dry-runに失敗しました" }
```

隔離出力時に既存の共通HTML同期を実行してから、`RELEASE.json` に元commitと公開資産・Worker・ビルド設定の一覧およびSHA-256を記録します。ビルド前後にこの記録を照合し、元のGit作業フォルダや編集済み配信物からの公開を停止します。この一覧自体は配信対象外です。準備失敗時の出力先は再利用せず、新しいディレクトリでやり直してください。配信物内のファイルを手動編集しません。

`.assetsignore` は開発ファイル、Git/エージェント設定、秘密鍵・環境設定・ログ・検証応答などを除外します。Worker本体は静的公開せず、`wrangler.toml` の `main` としてバンドルします。既存の共通HTML同期ビルド、静的ASSETSバインディング、原神・HSRのAPI経路は維持します。原神の候補・バージョン移行JSONにも実行時参照があるため、一律には除外しません。

実際の公開は利用者が別途行います。Cloudflareで現在の正常なVersion IDを控え、上記検証が成功した隔離ディレクトリで `wrangler deploy` を実行してください。公開後はHSR・原神の表示/計算、UID、保存復元を確認し、重大な問題時は記録したVersionへ `wrangler rollback <Version ID>` で戻します。dry-runはビルド確認であり、認証・実配信やAPI通信の成功を保証しません。
