# ダメージ計算ツール

原神と崩壊スターレイルのダメージを確認するための静的Webツールです。

## 開発メモ

- Cloudflare Workers と Workers Assets で運用します。
- 公開ルートは `https://tetinet.com/games/` とし、静的ファイルは `games/` 配下を正とします。
- 公開ルートは `https://tetinet.com/` とする。
- HSRのUID取得APIは `worker.js` の `/games/api/hsr-profile` で処理します。
- Pages Functionsとは併用しないため、`functions/` ディレクトリは置きません。
- 画面表示は `games/index.html`、`games/genshin/index.html`、`games/hsr/index.html` を中心に構成します。
- 計算処理は `games/js/` 配下にまとめます。
- 元データは `games/data/` 配下のCSVを正とし、同名のExcelファイルは編集・確認用として扱います。
- 命名規則、コメント方針、CSVの編集ルールは `docs/DEVELOPMENT_RULES.md` を参照してください。

## ローカル確認

VS Code Live Server の `http://127.0.0.1:5500/` でも画面表示は確認できますが、崩壊:スターレイルのUID取得はMiHoMo APIのCORS制限で失敗する場合があります。

UID取得を含めて確認する場合は、同一オリジンのプロキシを持つローカルサーバーを使ってください。

```bash
node local-server.cjs
```

起動後、次のURLを開きます。

```text
http://127.0.0.1:4173/games/hsr/
```
