# 原神 active goal 本文 — 改訂 r2 への参照

この既存goalは、ユーザーの明示的な依頼により2026-08-28に改訂されました。
goalの新規作成・complete・実装resumeではありません。現在は pausedByUser です。

## 現在のauthoritative goal本文

次の文書を全文読んでから、このgoalに関する判断・再開を行ってください。

D:/Documents/GitHub/damageTool/docs/genshin-goals/2026-08-28-realignment/revised-goal.md

Revision ID: genshin-goal-2026-08-28-r2
SHA-256: 1bc4327886c141b4f69721ce018faf9bcc66c2cd5a16f51be36a346a992d8a37

本来の目的、A→B→C、保留管理、部分的な計算有効化、strict verification安全条件、改訂後の完了条件はこの文書が正です。旧本文や旧checkpointの完了条件・作業順よりr2を優先します。
本文が見つからない、digestが違う場合は旧いgoalを黙って再開せず、改訂履歴を確認してください。

## 変更前の本文と経緯

変更前本文は原本とbyte一致で永続保存されています。旧い内容を上書きせず参照できます。

- 旧本文: D:/Documents/GitHub/damageTool/docs/genshin-goals/2026-08-28-realignment/original-goal.md
- 旧本文SHA-256: 9e27e072ef58a0a0f5a93ffd2c2155e151670b704938c4464ba2853fca7624d8
- 変更理由・旧37節の引継ぎ・自己レビュー: D:/Documents/GitHub/damageTool/docs/genshin-goals/2026-08-28-realignment/revision-review.md
- 改訂前get_goal応答: D:/Documents/GitHub/damageTool/docs/genshin-goals/2026-08-28-realignment/original-goal-state.json
- 改訂前checkpoint: D:/Documents/GitHub/damageTool/docs/genshin-goals/2026-08-28-realignment/checkpoint-before-revision.json
- 保存・切替検証: D:/Documents/GitHub/damageTool/docs/genshin-goals/2026-08-28-realignment/revision-manifest.json

## 一時停止を維持する

今回のユーザー承認はgoal改訂までです。コード/schema/v2データ/queue/Runtime/certificateを変更せず、source取得・candidate処理・生成・review承認・promotion・Luna worker再開を行わないでください。
次の明示resume後、r2本文と現行repository/checkpoint/queueを読み、工程Aの必要差分から進めます。旧381件比較scriptを自動実行しないでください。

登録goalのthreadIdとobjectiveの参照pathは維持しています。参照本文の更新であり、アプリのgoal statusや利用量を変更したものではありません。
