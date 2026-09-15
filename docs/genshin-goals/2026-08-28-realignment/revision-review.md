# Goal改訂理由・要件引継ぎ・自己レビュー（2026-08-28 r2）

## 結論と参照先

本来の目的へ合わせて、既存goalの「今回の作業を閉じる条件」を改訂する。strict verificationを緩めず、証拠待ち保留を管理し、確認できた計算機能を部分的に提供できるようにする。新規goalの作成・旧goalのcomplete・実装再開は行わない。

- 改訂本文: [revised-goal.md](revised-goal.md)
- 変更前本文（byte一致保存）: [original-goal.md](original-goal.md)
- 変更前get_goal応答: [original-goal-state.json](original-goal-state.json)
- 変更前停止checkpoint（byte一致保存）: [checkpoint-before-revision.json](checkpoint-before-revision.json)
- 保存内容・切替検証: [revision-manifest.json](revision-manifest.json)

## なぜ改訂したか

旧goalは安全な自動verification基盤と残存populationを目的としたが、queueでは全candidateの未完了0がgoal完了へ結び付けられた。証拠不足を保留して確認・修正作業を閉じる経路がなく、良い情報源の欠如が全体の終わらない条件になっていた。

ユーザーは本来の目的を明示し直した。データを信頼できる出典で点検・修正すること、検証不能なものを未確認として再確認可能に残すこと、将来追加・既存キャラ調整への更新経路、7.0新キャラ/星拡散/既存変更の計算反映、ユーザー視点の補正条件UIである。

したがって「全未知が消えるまで終わらない」から「有限の確認・修正・安全な計算反映と、未確認の保留管理を仕上げる」へ受入契約を変更する。未確認をverifiedへ読み替えず、旧資料や成果を捨てない。

## 経緯（会話と保存済み成果に基づく要約。全会話の逐語録ではない）

1. 構造監査・代表E2E・candidate分類・provider frontier監査を経て、旧goalを開始。原文は37節で構成され、原神のみ・Sol/Luna分担・独立二源・strict version・candidate/claim証明・全自動lane継続等を要求した。
2. 追加指示でread-only制約を解除し、prototypeのfail-open再監査、実revision/raw digest/field digest再計算、GO/genshin-db等のroot lineage整合を要求した。
3. 星拡散の追加scopeと既存キャラの将来調整を共通設計で扱う指示があった。
4. official live versionがaccepted baselineを超えた場合、旧version canonicalを現versionへ適用しない局所fail-closedを承認した。旧canonicalの保持と7.0 evidence→再検証→Runtime→gate再開を要求した。
5. 多数のprovider capture、identity/variant照合、差分・mapping・queue関連作業を実施。usage停止の誤認防止と正確なcheckpoint保存が追加された。
6. 現goalに必須でない改善/汎用化を連鎖追加しない指示、実数・分母付きKPI要求が追加された。
7. ユーザーは実作業を停止。checkpointはpausedByUser。武器381候補のprimary数値比較scriptは保存済みだが未検証・未実行。
8. read-only進捗監査で、15/2,268はnon-calculative完了のみ、certificate0/3,105は武器/聖遺物577候補の登録claimに限ること、大量rawとclaim証明は別段階であること、旧human条件やversion/証明入力の接続不足を確認した。
9. ユーザーが本来の目的を再提示。Sol/Luna read-only設計でA→B→C、三軸状態、保留、部分有効化、共通version更新を提案した。
10. 今回、ユーザーが設計に沿うgoal改訂と、旧本文・経緯・重要要件を残すことを依頼。今回はgoal改訂まで、実装は再開しない。

## 改訂前の実行・成果状態

- アプリget_goal: 同じthreadId 01a03256-cb5d-7fb0-a6f9-e268bcb222e6、status blocked（過去状態）。objectiveは添付テキストを参照。新規goal/complete操作はしない。
- 現行checkpoint: pausedByUser、complete=false。実作業はユーザー停止中。
- queue: total 2,268 / complete 15 / incomplete 2,253 / productionCanonical 0。
- certificate registry: 3,105 claim / eligible 0。全datasetのclaim総数ではない。
- source coverage reconciliation: 1,914候補。rawとidentityの成果でありstrict claim証明ではない。
- 旧Runtime2件は保持・非適用。strict source-family/証拠の条件を変更しない。
- 武器381候補scriptは44,429 bytes、SHA-256 c8c03de7e4200469c8123e16337cf83ebf1e1f60f3022cfe39cd13df8f4fc7a7。未実行のまま残す。

## 旧37節からの引継ぎ表

| 旧節 | 内容 | 扱い・改訂本文の対応先 |
| --- | --- | --- |
| 1 | 現在状態・既存成果を引継ぐ | 維持。G02/G14。旧数値を現在値として固定せず、差分確認でresume |
| 2 | deterministic consensus導入承認 | 維持。G04/G05。AI自己承認への変更ではない |
| 3 | human/machineとattestation分離 | 維持。G05。reviewedBy/reviewedAt流用禁止とdigest等を明記 |
| 4 | eligibility authority一本化 | 維持。G05/G08。同一candidate×claim証明を全判定層へ接続 |
| 5 | Eligibility Certificate | 維持・具体化。G05。実raw/field/revision/versionを再計算しpolicy存在を証拠にしない |
| 6 | source-family中央管理 | 維持。G04.1。root/transform/mirror/fork/API/翻訳/datamine等 |
| 7 | 同一family二重計上禁止 | 維持。G04.1。GO/db、HoYoWiki/HoYoLABの既存扱い |
| 8 | 自動verification条件 | 維持。G04/G05。必要field完全一致、applicability証明、Runtime検証 |
| 9 | AI semantic inference禁止 | 維持。G04.2。技術設計と外部事実の証明を区別 |
| 10 | 必要時第三source | 維持。G04.3。有限な探索 |
| 11 | 多数決禁止 | 維持。G04.3。客観的除外か本当のhuman例外 |
| 12 | provider pair policy | 維持。G04.1。scope限定再利用、invalidation、candidate限定承認の一般化禁止 |
| 13 | 既知provider状況 | 維持。G04.1/G09。過去policyを履歴として再利用し新証拠なしに承認しない |
| 14 | w_12516_reaction_bonus_2 | 維持・追加指示統合。G09。version更新/consumer gapとdiscrepancyを分離、scopedMatch禁止 |
| 15 | evidence-derived queue | 維持。G03/G12。固定false禁止、証拠/計算/作業の三軸へ |
| 16 | searchExhausted一律付与禁止 | 維持。G06/G12。保留とも区別 |
| 17 | authoritative queue | 維持・変更。G12/G13。実taskを根拠に受入処置と厳格検証の完了を分離 |
| 18 | Luna大量実作業 | 維持。G12。Lunaの文章を証拠にしない |
| 19 | shard分割・共有file安全 | 維持。G12。所有範囲、重複/並行編集防止 |
| 20 | Sol責任 | 維持。G12。source採否・独立性・設計・promotion/goal判断 |
| 21 | Solによる再計算監査 | 維持。G12/G14。実bytes、coverage、determinism、回帰 |
| 22 | Phase 0後population | 維持・再編。G08→G09→G11。必要接続をAで修正、A単独完了禁止 |
| 23 | 高レバレッジunlock probe | 維持。G04.1/G06/G09。既存探索を再利用、無限探索しない |
| 24 | dataset優先順位 | 意図的変更。G09。6.7単純武器起点から、誤計算/7.0必要機能・実行可能性起点へ |
| 25 | Weapon population | 維持。G05/G09。条件成立後human通常工程なしでproduction/supersession/回帰へ |
| 26 | Artifact population | 維持。G09。2pc/4pc・condition・stackとconsumerを分離 |
| 27 | BehaviorSpecはRuntime不要 | 維持。G02/G05/G09。atomic field、applicability、Spec-only終端 |
| 28 | semantic一律human禁止 | 維持。G04.3/G09/G10。正規化・追加source・真の判断へ分解 |
| 29 | inputMissing/unsupported | 維持。G01/G09。現product必要部分のみ、simulation無限拡張禁止 |
| 30 | human packet | 維持。G10。簡潔な不一致/選択肢/推奨 |
| 31 | human待ちでも別lane継続 | 維持。G10/G12/G13 |
| 32 | goal状態とcomplete | 意図的変更。G13。受入処置の完了、許容される証拠保留、未実装/判断待ち/制限との分離 |
| 33 | complete誤判定禁止 | 維持・補強。G13。ラベル/分類/A/少数件だけでcomplete不可、適切な保留をverifiedにしない |
| 34 | usage checkpoint | 維持・補強。G14。実session/request証跡、各worker/途中成果/次task/分母を保存 |
| 35 | KPIを分ける | 維持・拡張。G14。厳格検証率、今回処置率、7.0機能対応率、保留の内訳 |
| 36 | テスト | 維持・拡張。G14。部分有効化/旧version拒否/再開/不完全結果/UID二重加算 |
| 37 | 最終報告 | 維持。G11/G14。開始終了差分、Sol/Luna、保留・機能不足・reopen条件 |

## 後続指示と本来の目的の引継ぎ

| 後続要件 | 対応 |
| --- | --- |
| candidate×claimの実証拠から証明、prototype再監査 | G04/G05/G08 |
| GO/db共通rootとGachabase policy整合 | G04.1 |
| 星拡散はformulaを推測せず、version/consumer gapとして確認 | G09 |
| 将来の既存キャラ強化・調整を共通経路で扱う | G07 |
| 旧canonicalを保持し、現versionで無効な部分だけ停止 | G06/G07 |
| source取得→再検証→Runtime→gate再開 | G07/G08/G09 |
| 現goalに不要な改善を必須taskへ連鎖追加しない | G01/G02/G08/G13 |
| 過去usage状態を現在の制約にしない、誤認を防ぐ | G12/G13/G14 |
| 分母付き進捗・停止時checkpoint | G14 |
| 不明データは保留し、全体を永久に停止させない | G03/G06/G13 |
| 全計算データ（基礎値/倍率等）も確認対象 | G02/G07/G08 |
| 補正対象のUX仕様は必要時に案を相談 | G10 |
| 今回はgoal改訂だけで、実装再開しない | 冒頭/G15 |

## Sol自己レビュー（goal本文の契約レビュー。コードや既存実装の合格判定ではない）

1. 独立二源/strict version/実rawとfield digest/完全match/AI推測禁止は残した。保留による証明基準の緩和はない。
2. 保留の処置完了とverifiedを別KPIにした。未知をverifiedへ加算する抜け道を作らない。
3. 「全件保留で即終了」を防ぐため、具体的な未処理検索・比較・修正がある場合は閉じない条件をG06/G13に入れた。
4. 部分有効化は候補単体でなく必要依存一式の証明・version・consumerを要求する。旧canonicalやlegacy fallbackで回避しない。
5. 7.0の未対応を隠さない。星拡散の外部証拠不足で確認作業を閉じることと、星拡散実装完了は別。証拠があるのに実装/テスト未完はcomplete不可。後で明示された必須機能を自己判断で削除しない。
6. 本来目的の基礎値/倍率/追加キャラ/既存強化も対象化し、2,268を全データ分母にしない。ただし将来機能や全generic unknownを今回必須に広げない。
7. 6.7履歴を削除せず、7.0対象検証・部分公開・全体品質KPIを分けた。全体baseline strict完了が再び永久停止条件にならない。
8. humanとmachineの分離、certificate authority、provider限定scope、第三source非多数決をすべて保持した。
9. Sol/Luna分担、共有file安全、determinism、Calculation/UI/E2E、HSR無変更を保持した。
10. pausedByUserを明記し、旧checkpointの381比較scriptを自動実行しない。今回の操作をgoal文書/保存/参照更新へ限定した。
11. 「暫定」の意味が本番採用と混ざらないよう、単独sourceの新規暫定production採用は今回未承認と明記した。
12. 処置状態名は実装schemaへ先行して変更したと偽らず、Aで接続する仕様として記述した。

自己レビュー結果: 旧37節の重要な安全/運用要件に意図しない脱落なし。意図的な変更は目的/有限scope/工程順/保留許容/部分有効化/完了条件/KPI。既存コードの接続不足は未修正であり、改訂文書があるだけでA完了とはしない。

## 今回の更新方法と未変更範囲

get_goalは添付テキストを参照しており、利用可能なupdate_goalは状態complete/blockedだけで本文編集用ではない。未達goalをcompleteにして作り直す方法は使わない。アプリ内部DBやsession logも直接変更しない。

同じgoalが参照する添付テキストを、旧本文保存先と新しい改訂本文へのentrypointへ更新する。登録objective文字列（参照先path）、threadId、status、usage値はそのまま。参照本文の改訂であり、アプリ状態をresumeしたことにはしない。切替完了の実証結果はrevision-manifest.jsonへ記録する。

現行checkpoint/queue/データ/schema/script/Runtime/certificateは変更しない。旧checkpointのphase/cursor/作業順は履歴として保持し、次回明示resume時はr2のAから差分確認して必要なcheckpoint/queue移行を行う。今は旧queueのcomplete判定が新契約に実装された状態ではない。

## 次の再開地点

実装再開は未承認。次回明示resume後に、revised-goal.md → 本review → 現行checkpoint/queueを読み、Aの受入対象表と必要接続の差分を確認する。既存成果は再利用し、残る具体taskをSolが再順位付けする。今回の改訂を理由に自動source取得やworkerを起動しない。

## 保存の範囲

旧本文・get_goal応答・停止checkpointと本経緯要約をローカルrepositoryの通常文書として永続保存する。原本archiveは追記・改変しない。Git commit/pushや外部バックアップは今回行わない。全会話の逐語録/全sourceファイルを複製したという意味ではない。既存source/成果物は元の場所に保持される。
