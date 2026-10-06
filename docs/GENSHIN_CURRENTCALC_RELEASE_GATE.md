# 原神CurrentCalc Release Gate

## 公開判定の範囲

Release Candidate基準点は `6f177be`（2026-10-05）。専用focused suiteは44ファイル・282テスト成功、Golden一致、Release blocker 0、代表ブラウザフローのP0/P1/P2は0として確認済み。件数はこの基準点の実績であり、将来の合否条件にはしない。

CurrentCalcは現在状態を明示入力する単発ダメージ計算。計算式・条件・party/provider・結果・保存復元の健全性を公開判定する。時間軸を自動処理するDPS機能とは分離する。

## focused suiteの実行

repositoryルートでNode.js標準テストランナーを使う。以下は確定済みテスト集合であり、ファイル追加時は同じ目的の検証を含めて更新する。Goldenは照合し、期待値を公開判定のためだけに再生成しない。

```powershell
$gateNames = @(
    'CalcIntegration',
    'PartyModifiers',
    'PartyConditionState',
    'ComparisonAndPartyState',
    'ConstellationUi',
    '70ProvisionalRuntime',
    '70ProvisionalWeapons',
    '70ProvisionalStellarSwirl',
    '70WeaponBaseStats',
    '70WeaponConditions',
    '70WeaponRegression',
    '70ArtifactSetsIsolation',
    'LunarCrystallizeGolden',
    'GoldenScenarios',
    'CurrentCalcState',
    'ProviderWeaponTransferCurrentCalc',
    'EverlastingMoonglowCurrentCalc',
    'NicoleCurrentCalcConnections',
    'CalculationRequestEnemy',
    'CalculationCommit',
    'InputProvenanceAndResonance',
    'StatBonusBaseInput',
    'UidPartyBridgeContract',
    'ReactionOptionsUi',
    'ArtifactReactionTargets',
    'WitchLuna3VentiAlbedoRazorIsolation',
    'WeaponConditionalDefaultIsolation',
    'FreminetStellarConductIsolation',
    'SkirkStellarSwirlIsolation',
    'FurinaCurrentCalcCompleteness',
    'AlyoshaCurrentCalcCompleteness',
    'OdetteCurrentCalcCompleteness',
    'SucroseCurrentCalcCompleteness',
    'RazorCurrentCalcCompleteness',
    'VentiCurrentCalcCompleteness',
    'AlbedoCurrentCalcCompleteness',
    'FischlCurrentCalcCompleteness',
    'BeidouCurrentCalcCompleteness',
    'RaidenCurrentCalcCompleteness',
    'ClorindeCurrentCalcCompleteness',
    'ArlecchinoCurrentCalcCompleteness',
    'DurinCurrentCalcCompleteness',
    'WandererCurrentCalcCompleteness',
    'ReleasePolish',
    'WolfGravestoneCurrentCalc',
    'WhiteRainFinaleCurrentCalc',
    'SandroneCurrentCalc',
    'ResolvedModifierDisplay',
    'LinearProviderCurrentCalc',
    'VesnaCurrentCalc',
    'VodyanitsaCurrentCalc',
    '71WeaponCurrentCalc'
)
$gateFiles = $gateNames | ForEach-Object { "tests/genshin/genshin$_.test.cjs" }
node --test @gateFiles
if ($LASTEXITCODE -ne 0) { throw 'CurrentCalc focused Release Gate failed' }
```

| 検証目的 | 主なファイル群（上記名称） |
| --- | --- |
| engine・入力・敵条件 | CalcIntegration、CalculationRequestEnemy、CalculationCommit、InputProvenanceAndResonance、StatBonusBaseInput |
| party・条件・対象分離 | PartyModifiers、PartyConditionState、ComparisonAndPartyState、ConstellationUi、ProviderWeaponTransferCurrentCalc、各Isolation |
| Site Ready完全性 | Furina〜WandererのCurrentCalcCompleteness、NicoleCurrentCalcConnections、EverlastingMoonglowCurrentCalc、SandroneCurrentCalc |
| 7.0暫定経路 | 70Provisional系、70Weapon系、70ArtifactSetsIsolation |
| 特殊反応・Golden | LunarCrystallizeGolden、GoldenScenarios、ReactionOptionsUi、ArtifactReactionTargets |
| 保存復元・公開UI | CurrentCalcState、ReleasePolish、UidPartyBridgeContract |

## 代表ブラウザE2E

別ターミナルで `node local-server.cjs` を起動し、以下を順に実行する。Windowsでは既存E2Eが専用Edgeプロセスを使用する。必要なら `BROWSER_EXECUTABLE` に実在するChromium系ブラウザのパス、`GENSHIN_E2E_URL` に対象URLを指定する。既存ブラウザのデバッグポートは使わない。

```powershell
node tests/genshin/genshinCurrentCalcState.e2e.cjs
node tests/genshin/genshinProviderWeaponTransferCurrentCalc.e2e.cjs
node tests/genshin/genshin70WeaponPatterns.e2e.cjs
node tests/genshin/genshin70ArtifactCurrentCalc.e2e.cjs
node tests/genshin/genshinArlecchinoCurrentCalc.e2e.cjs
node tests/genshin/genshinDurinCurrentCalc.e2e.cjs
node tests/genshin/genshinRaidenCurrentCalc.e2e.cjs
node tests/genshin/genshinSandroneCurrentCalc.e2e.cjs
node tests/genshin/genshinLinearProviderCurrentCalc.e2e.cjs
node tests/genshin/genshinVesnaCurrentCalc.e2e.cjs
node tests/genshin/genshinVodyanitsaCurrentCalc.e2e.cjs
node tests/genshin/genshin71WeaponCurrentCalc.e2e.cjs
```

各コマンドの終了コード0を個別に確認する。基準点で確認済みの実ブラウザ受入項目も維持する：
- 320/375/768/1280pxで主要入力が操作でき、ページ全体の横スクロール・重なりがない。
- 数値条件、party/provider転送、自己限定補正、敵条件、特殊反応が結果に反映される。
- reload前後の状態・ダメージ・ステータス表示形式一致。ユーザー向けには前回入力の自動復元を提供する。
- 内部versioned schemaのJSON serialize→状態変更→importによるRequest・ダメージ一致、不正JSON拒否と現在状態維持。JSON保存/読込UIは通常画面には公開しない。
- 条件タブの矢印キー操作。

内部JSON roundtripテストは将来の再公開に備えて維持する。現在の受入確認にはブラウザdownloadを必要としない。新たな不具合がないことの根拠には、実行できた検証だけを使う。

## 判定と残件の分離

| 区分 | 扱い |
| --- | --- |
| Release blocker | Runtimeの明確な誤ダメージ、クラッシュ、UI→Request→結果や保存復元の破損。1件でもあれば公開判定を停止 |
| CurrentCalc non-blocking | 公開計算に影響しない残件は理由・再現条件を別記 |
| canonical / provenance audit debt | 旧v2の昇格状態・証拠管理の残件。focused gate成功と全監査成功を同一視しない |
| stale fixed expectation / generated artifact | 古い件数・hash・表示文言・生成物の期待値。Runtime誤りの証拠かを分け、件数合わせでデータを削除しない |
| FutureDPS | ICD、付着タイミング、tick、rotation、自動スタック・状態遷移、snapshot時間追跡、効果時間・CTのシミュレーション。現単発計算の公開条件に含めない |

`node --test "tests/genshin/*.test.cjs"` や `node scripts/verifyGenshinCalc.cjs` は監査も含む全体確認。残存失敗は原因グループごとに上記区分へ分離し、全体成功をCurrentCalc公開の前提にはしない。ただし新規失敗が実計算や保存契約を壊す場合はblockerとして扱う。

## Known Limitation

`11435 異端を狩る熔刃` は最小・最大状態対応済み。中間距離→ATK補正式だけ外部仕様待ちで、推測補間は実装しない。この独立制限はRelease blockerにしない。

ユーザー向け説明は[利用ガイド](../guides/genshin/index.html)、改善内容は[更新履歴](../updates/index.html)。公開版番号は新設せず、開発側ではRCのcommitで識別する。HTMLの `?v=` は資産キャッシュ更新用で、ゲーム仕様versionや公開版番号ではない。

## Vesna CurrentCalc implementation checkpoint

ヴェスナの確定実装はcheckpointとして保持し、CurrentCalc Site Readyとは判定しない。`VesnaCurrentCalc`専用テストと`genshinVesnaCurrentCalc.e2e.cjs`は確定部分・保留表示・reloadを検証する。

未確定3件は`externalSpecPending`：C6転位150%のDMG Bonus分類、風羽のDMG Bonus分類、星光の祝福のATK端数処理。GO候補はそれぞれ内部`elemental`ノード、`skill`、連続比例`min(ATK × 0.007 / 100, 0.14)`だが、仕様確定としてRuntimeへ導入しない。未確定hitの数値を出さず、星光の祝福の未確定式も適用しない。詳細は[7.1限定一覧](GENSHIN_71_CURRENTCALC_INVENTORY.md)。この保留と後続キャラの独立検証を分離する。

## Vodyanitsa CurrentCalc implementation checkpoint

ヴォジャニーツァは確定部分のcheckpointであり、CurrentCalc Site Readyではない。`VodyanitsaCurrentCalc`は保存倍率、provider C4反映後HP、party対象、共有条件、A4の基礎側加算、悠久の歌の独立Talent倍率、Request再計算を検証する。専用E2Eは実入力から結果、HP端数の保留表示、reload一致を確認する。checkpoint専用テストの成功を、未確定仕様の解消とは扱わない。

外部仕様待ちはA4「十二弦の涙唄」のHP端数処理1件。段階/連続候補が一致するHPでは共通値だけ計算し、異なる場合は対象結果を保留表示する。HP50,500の候補値は水/氷1400対1470、星拡散2600対2730。GO連続式は候補として保存し、独立した実測またはmechanics根拠が得られるまで仕様確定しない。詳細と比較点は[7.1限定一覧](GENSHIN_71_CURRENTCALC_INVENTORY.md)。

2026-10-06のcheckpoint検証：focused suite（Vesna/Vodyanitsa専用テストを含む）341テスト、ページ構成6テスト、計347テスト成功。Golden一致。ヴォジャニーツァ専用実ブラウザE2EはC4/C1、悠久の歌の倍率、A4共通値と端数保留、reload・Request再計算を成功確認。party provider HP参照・受け手隔離は専用Runtime回帰で確認。

## 7.1武器 batch1

蝶の羽化11522・銀灯11438は7.1暫定経路でCurrentCalc Site Ready。`71WeaponCurrentCalc`は保存versionとR1〜R5値、全Lv/突破前後の標準curve、副stat精度、自己/party隔離、星拡散分類、会心可能な独立反応の装備者補正、層数、武器変更とRequest再計算を確認する。専用E2Eは実際の武器選択、現在状態入力、実ダメージ、R1/R5、reload一致を確認する。時間経過と発動順の自動再現はFutureDPSへ分離する。

今回のfocused suite349テストとページ構成6テスト、計355テスト成功。Golden一致。武器専用回帰8テストはこの集合に含まれる。外部仕様待ちは今回の2本にはなく、既存キャラcheckpointの保留を解消したとは扱わない。
