# r2 実データ処置・7.0対応の到達点

集計時点: 2026-08-31 16:48 JST。goalは未完了。

## 実際の成果

2026-08-28 21:32開始の連続作業について、authoritative queueと処置台帳を照合した。

| 指標 | 開始 | 現在 | 増分 |
| --- | ---: | ---: | ---: |
| 今回の作業処置済み | 15/2,268 (0.66%) | 1,117/2,268 (49.25%) | +1,102 |
| 理由付き証拠待ち保留 | 0 | 1,102 | +1,102 |
| current 7.0 strict検証済み | 0 | 0 | 0 |
| production canonical | 0 | 0 | 0 |
| 未処理 | 2,253 | 1,151 | -1,102 |
| 7.0計算機能の新規受入 | 0 | 0 | 0 |

00:42のresume時点では161件が既に保存済みで、146件を再処理・再加算していない。今回、7.0 known-impact frontierの47候補を追加で個別監査・登録したため、処置済みは161→208へ増えた。

2026-08-30の継続処理では、取得済みrawと既存shardを再利用して、readyなBehaviorSpecの先頭100件とnumeric-only WeaponEffectSpecの先頭100件を候補単位で監査した。BehaviorSpecは8 entity・700 claimについて保存済み9 providerを照合したが、独立かつversion-boundなcandidate×claim field一致は0件だった。WeaponEffectSpecは59 entityを照合し、3件のHoYoWiki観測はmutable/version-unbound、残り97件には独立field recordがなかった。この200件を値推測やverification付与なしの理由付き外部証拠待ちへ登録し、処置済み208→408、保留193→393、未処理2,060→1,860へ進めた。

2026-08-31の継続処理では、次のBehaviorSpec100件（8 entity・700 claim）と安全なnumeric WeaponEffectSpec100件（56 entity）を同じ候補単位の境界で処置した。保存済みrawの完全性と数値一致は再利用・再検証したが、独立かつstrict version-boundなfield evidenceは0件だったため、200件すべてを理由とreopen trigger付きの外部証拠待ちへ登録した。historical canonical再検証経路の`w_12516_stat_1`は通常のconsumer-not-applicable候補へ混ぜず除外した。処置済み408→608、保留393→593、未処理1,860→1,660となった。

同日の次処理では、BehaviorSpec Shard03の100件（8 entity）とWeaponEffectSpec Shard03の100件（56 entity）を既存rawから処置した。Behaviorは100/100 raw integrity、Weaponは100/100 numeric observationを確認したが、独立strict evidenceはいずれも0件だったため、理由付き保留として一度だけ登録した。処置済み608→808、保留593→793、未処理1,660→1,460となった。

続くShard04では、BehaviorSpec100件（8 entity）と、安全なnumeric WeaponEffectSpecの残り9件（7 entity）を既存rawから処置した。Behaviorは700 claim、Weaponは36 claimを候補単位で確認したが、独立strict evidenceは0件だった。109件を理由付き保留へ一度だけ登録し、処置済み808→917、保留793→902、未処理1,460→1,351となった。通常のnumeric weapon raw tailはこれで枯渇した。

Shard05ではBehaviorSpec100件（8 entity・700 claim）を既存rawから処置した。raw integrity100/100、9 providerの保存済みsurfaceを確認したが、独立version-bound candidate-field evidenceは0件だったため理由付き保留へ登録した。処置済み917→1,017、保留902→1,002、未処理1,351→1,251となった。

Shard06では次のBehaviorSpec100件（8 entity・700 claim）を既存rawから処置した。raw integrity100/100、9 providerの保存済みsurfaceを確認したが、独立version-bound candidate-field evidenceは今回も0件だった。理由付き保留へ一度だけ登録し、処置済み1,017→1,117、保留1,002→1,102、未処理1,251→1,151となった。

この時点で処置率は49.25%に達した一方、strict検証・certificate・7.0機能受入は0のままだった。収束監査の結果、同型Behavior shardを続けても動くのは処置/保留件数だけで、r2の中心目的であるデータ正確化と7.0受入には直結しないと判断した。このためShard07は開始せず、次工程を候補単位の独立・version-bound field evidenceと7.0 mapping取得へ切り替えた。

通常numeric lane終了後のWeapon72件も再分類した。`w_12516_stat_1`を除く71件はmissing21、ambiguous41、localValueUnsupported8、unitMismatch1で、raw破損はないがcandidate-level semantic mappingと独立strict evidenceがない。安全な修正・strict検証subsetはなく、searchRequiredを維持した。

未処理1,151件は、coverage/raw再利用laneの1,005件（Behavior933、Weapon72）と、coverage外の特殊lane146件へ完全に分解した。特殊laneはready135件、reopen-on-trigger10件、Xiao version-reverification1件である。内訳はbehaviorModifier36、talentGap67、weapon inputMissing13、artifact inputMissing4、weapon unsupported15、behavior drift4、talentGap drift3、artifact unsupported2、`w_12516` drift1、Xiao1。したがってcoverage inventory外の候補も取りこぼしていない。

並行して、7.0新キャラ6 local IDのcatalog/base stats/talent/constellation/scaling接続とdirect reaction dispatchをテストで固定した。星拡散も公式存在証拠・UI・modifier routeまでは接続済みであることを確認したが、正確な式がないため計算受入はfail-closedのまま0件である。これは内部経路の前進であり、strict検証や7.0機能受入としては数えていない。

生成queue・frontier・coverageのSHAを候補証拠として参照すると、再生成のたびに自分自身を無効化する循環があることも判明した。これらをimmutable evidenceから除外し、中央validatorで拒否するようにした。既存の聖遺物116件・武器30件もimmutable evidenceへ再拘束した。coverage inventoryは1,914件を維持し、未処置のlookupRequired 1,005件と、処置済みのreopenOnTriggerOnly 909件を分離している。

保留1,102件は武器339件（既存30＋numeric shard100×3＋tail9）、聖遺物116件（4pc 68、2pc 48）、7.0外部mechanic証拠待ち47件、BehaviorSpec600件。候補ID、現在値、旧値の有無、限定された探索履歴、実際のsource/legacy/transition artifactのdigest、安全措置、外部待ちの理由、再開条件を個別保存した。保留はstrict検証でも計算対応でもない。既存legacy計算と未確認データを維持し、新規canonicalを有効化していない。

聖遺物6件と、その他の具体的な未処理作業を保留へ混ぜていない。queueのsearchExhausted 203件全部を完了扱いにはしていない。

## 7.0の実データと不足

取得可能と確認できた、固定revisionの日本語天賦・凸JSONを6件だけ取得・検証した。同じrawは再取得しない。

| Provider上の対象 | embedded ID | 取得済み | 天賦label数 | 解決済みattributes.values |
| --- | ---: | ---: | ---: | ---: |
| アリョーシャ | 14801 | 2/2 | 19 | 0 |
| オデット | 15001 | 2/2 | 26 | 0 |
| 旅人（氷元素） | 705 | 2/2 | 23 | 0 |

実bytes、SHA-256、Git blob、保存済みtree、明示7.0 package metadataを確認済み。ただし単一のGenshinData-derived familyで、倍率表は未解決のパラメータ。provider IDを計算用local IDへ算術変換せず、localEntityId=nullを維持した。新規キャラの計算対応済みとは数えない。星拡散の式も推測していない。

14:50 JSTの限定再確認では、公式7.0 update detailsから「星拡散は条件付きAnemo＋Cryo、Anemoの初撃、遅延爆発するCryo範囲ダメージ、反復triggerでlevel/範囲/威力増加、会心可能」という定性的mechanicまでは確認できた。一方、計算倍率・level table・contributor式は公開本文にない。community guideで見つかった式も自身でapproximationと明記されており、strictまたはproduction式の根拠には採用しなかった。

従来の「9 targets」は公式変更5、武器の証拠サンプル3、roster coverage placeholder1の混合であり、均質な9機能ではない。0/9を7.0全機能の完成率と呼ばない旨を生成レポートにも明記した。

## ボトルネックの再確認

- 処置KPIが動かなかった直接の接続不足は、個別の保留決定が台帳へ登録されていなかったこと。今回は146件を登録してqueue・受入台帳まで反映した。
- strict/7.0対応は単なる台帳接続では増えない。現versionへ拘束された独立sourceの必要field、倍率の実値、identity/mappingが不足している。Runtimeの枠だけ増やしても解決しない。
- inputPolicy/automaticDetectabilityの244項目は内部実装メタデータへ分類修正した。ゲーム上の値・条件・対象の厳格な外部検証は維持。読み取り再計算の外部claim数は12,705→12,461だがeligibleは0のまま。保存済みcertificate registryは今回再生成せず、0/3,105の旧対象snapshotを保持している。両分母を混同しない。

### 通常計算の実修正と待ち分類の訂正

- 聖遺物15042のteam補正はエンジンに既存実装があった。欠けていたのはサポート側の月兆optionを通常UIからrequestへ渡す経路。PartyState・条件reconcile・rendererを接続した。
- Solが通常ブラウザ操作で、神里綾華の熟知100、サポート甘雨＋15042、満照＋適用ONを確認。結果内訳に+120が一度表示され、再度条件画面を開いても満照を保持。未発動へ戻すと+120は解除された。full-requestテストでは100→220。独立source検証済みとは扱わない。
- 未入力/不正値を選択肢先頭の正の値へ補完しない。明示されたneutral値0がない場合は入力不足を維持。null/空文字/falseを0の証拠にしない。
- BehaviorSpec1,581件に付いていた将来consumer必須の誤分類を除去。実Runtime参照はXiaoの旧version1件だけで、旧証明・7.0再検証待ちは保持した。
- 入力待ち17件は既存のruntime user-state経路（レビュー16件＋既存Haran回帰1件）。15042の実バグ修正後、誤ったconsumer実装待ちを解除した。source検索はreadyのまま。
- consumer deferred laneは1,616→18。これは候補完了数ではない。処置161・保留146・strict0・7.0新規機能受入0は、この接続修正だけでは増えていない。

既存の探索済み55件を個別監査し、45件のconservative entity invalidationと2件のexact candidate mappingを、候補×claim単位の外部mechanic証拠待ちとして登録した。282 external fieldsと47 internal runtime metadata fieldsを分離し、strict/certificate/promotionは0のまま。7件のstructural mapping/scope課題と武器1件の式/consumer課題は除外した。7件を同じ保留方式へ広げる中央validator変更はauto-reviewに拒否されたため再試行せず、partial変更を除去してpendingを維持した。

## 証跡・回帰

- `games/genshin/data/v2/r2-work-dispositions.json`: 1,102件、Solの処置記録。verification/promotion付与なし。
- `reports/genshin-evidence-task-queue.json`: 処置1,117、保留1,102、未処理1,151。data側queueとbyte一致。
- `games/genshin/data/v2/reviews/r2-transition-deferral-audit.json`: 47件、8件除外、329 field findings、fail-closed gate。
- `games/genshin/data/v2/reviews/r2-weapon-deferral-audit.json`: immutable evidenceへ再拘束したSHA 4ad6efb12d98fb10298685fe83be92f702618621e58ea3058c63f5fcd3d8011f。
- `games/genshin/data/v2/reviews/r2-artifact-deferral-audit.json`: immutable evidenceへ再拘束したSHA 66239cd662d1251d7904fca1212b3410b20ec8c152ab5eaecfabb454c8ccb254。
- `games/genshin/data/v2/version-transitions/6.7-to-7.0/r2-new-roster-capture.json`: raw6件と不足条件。
- Shard06直接監査7/7、registry/WorkDisposition22/22、acceptance/7.0 focused15/15成功。1,102件のregistryはauthoritative queue上で有効。
- 7.0受入台帳のtransition参照をmanifest所有の`games/genshin/data/v2/version-transition.json`へ修正し、実在性を回帰テストで固定した。KPI自体の水増しは行っていない。
- Shard06 integratorは登録後の再開検証で同じ100件を再追加せず、完全一致なら現在状態を返し、部分一致・digest不一致は拒否するよう修正した。post-write回帰4/4成功。
- HSR変更なし。checkpoint保存済み。今回の利用上限エラーは確認されていない。
