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
    'WolfGravestoneCurrentCalc'
)
$gateFiles = $gateNames | ForEach-Object { "tests/genshin/genshin$_.test.cjs" }
node --test @gateFiles
if ($LASTEXITCODE -ne 0) { throw 'CurrentCalc focused Release Gate failed' }
```

| 検証目的 | 主なファイル群（上記名称） |
| --- | --- |
| engine・入力・敵条件 | CalcIntegration、CalculationRequestEnemy、CalculationCommit、InputProvenanceAndResonance、StatBonusBaseInput |
| party・条件・対象分離 | PartyModifiers、PartyConditionState、ComparisonAndPartyState、ConstellationUi、ProviderWeaponTransferCurrentCalc、各Isolation |
| Site Ready完全性 | Furina〜WandererのCurrentCalcCompleteness、NicoleCurrentCalcConnections、EverlastingMoonglowCurrentCalc |
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
