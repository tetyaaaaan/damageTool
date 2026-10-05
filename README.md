# ダメージ計算ツール

原神と崩壊スターレイルのダメージを確認するための静的Webツールです。

原神のCurrentCalcは、現在状態を明示入力する単発ダメージ計算です。対応範囲、保存機能、既知の制限は[利用ガイド](guides/genshin/index.html)、公開判定に使うテスト集合と実行手順は[CurrentCalc Release Gate](docs/GENSHIN_CURRENTCALC_RELEASE_GATE.md)を参照してください。

## 開発メモ

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
