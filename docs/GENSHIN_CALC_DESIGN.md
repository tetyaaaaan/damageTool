# 原神JSON計算 設計書

STEP 13〜18の完了仕様・回帰基準・本番移行方針は [GENSHIN_CALC_STEP13_18.md](./GENSHIN_CALC_STEP13_18.md) を参照してください。

## 目的

原神JSON計算では、計算入力欄に表示されている値を唯一の計算入力とし、武器・聖遺物・天賦・命ノ星座の補正を構造化データから安全に適用します。

補正カテゴリを増やす際は、個別の例外を計算エンジンや条件UIへ直接追加せず、共通解析層で「計算可能性」「入力値への反映状況」「条件」「対象」を分類してから利用します。

## 設計上の原則

### 計算入力欄を正とする

- キャラクター、武器、命ノ星座、天賦レベル、ステータスは計算入力欄から読みます。
- UID取得処理は入力欄へ値を反映するところまでを担当します。
- UID取得時に保持した古いオブジェクトや、補正条件欄の値を計算入力の代わりに使用しません。
- UID由来か手動入力かは、値の出所を示す補助情報としてのみ扱います。

### 構造化データを計算根拠とする

- `category`、`value`、`reference`、`scalings`、`applyTo` などの構造化フィールドを計算根拠にします。
- `sourceText` の解析は、原則として既存データの診断と候補理由の分類に限定します。
- 日本語効果文だけから倍率や対象を推測して本計算へ適用しません。
- 現在の `extraDamage` には別種効果の誤分類があるため、移行期間中だけ誤適用防止フィルターとして効果文を確認します。`effectRole` の整備後にこの暫定判定を廃止します。

### 一つの判定を複数箇所へ実装しない

- 補正の計算可否は `genshinModifierAnalyzer.js` で判定します。
- 計算エンジンと条件UIは同じ解析結果を使用します。
- カテゴリ固有の対応条件を `genshinCalcEngine.js` と `genshinCalcConditions.js` に重複実装しません。

### 未対応効果を無理に計算しない

- 参照値、倍率、対象、発動条件が不足する効果は候補として残します。
- 他キャラクターのステータス、記録治療量、消費スタックなどの入力が必要な場合は、専用入力がない限り計算しません。
- `manualOnly`、`displayOnly`、`special` は計算可能性とは別の入力ポリシーとして扱います。

## データフロー

1. 計算入力欄から計算コンテキストを作成します。
2. 補正JSONを読み込み、共通解析層で `ModifierAnalysis` に変換します。
3. 入力ポリシーと発動条件を評価します。
4. 適用可能な補正だけを計算へ渡します。
5. 適用しなかった補正は固定ステータスと理由を付けて候補表示します。

## ModifierAnalysis

`GenshinModifierAnalyzer.analyzeModifier()` は次の情報を返します。

| フィールド | 役割 |
| --- | --- |
| `key` | 補正ソースと補正IDを組み合わせた識別子 |
| `effectGroupKey` | 同じ効果から分割されたレコードをまとめるための識別子 |
| `category` | 元データの補正カテゴリ |
| `status` | 入力ポリシーを含めた現在の状態 |
| `calculable` | 現在の計算処理が数式を扱えるか |
| `calculation` | 使用する計算処理名 |
| `supportStatus` | 数式対応状況。`supported`、`invalidData`、`unsupported` |
| `reason` | 計算できない場合の理由 |
| `inputStatus` | 入力値への反映状況や手動専用などの状態 |
| `condition` | 発動条件ID |
| `targets` | 適用対象 |
| `customHandlingRequired` | データ側が専用処理を要求しているか |

### status

- `applicable`: 現在の解析上は適用候補
- `includedInInput`: 入力ステータスまたは天賦レベルへ反映済み
- `manualOnly`: 手動処理専用
- `displayOnly`: 表示専用
- `invalidData`: 計算に必要な構造化データが不足
- `unsupported`: 未対応または専用処理が必要

`calculable` と `inputStatus` は別々に保持します。構造化された数式が存在しても、入力ポリシーが `displayOnly` なら自動適用してはいけません。

## 効果グループ

同じ効果文から複数の補正レコードが生成されることがあります。たとえば、一つの追撃が `extraDamage` と `statBonus` に分割される場合があります。

- 明示的な `effectGroupId` がある場合はそれを使用します。
- 既存データでは `_resolved_1`、`_resolved_2` などの末尾を除いたIDを暫定グループキーにします。
- `sourceText` の一致だけでは本計算の重複排除を行いません。
- 重複排除の実適用は、各グループ内の `effectRole` を定義した後に行います。

想定する `effectRole` は `damage`、`buff`、`debuff`、`conversion`、`resource`、`display` です。

## 条件管理

条件状態は補正の安定キー単位で管理します。IDを持つ補正は `source:id`、IDを持たない補正はソース・カテゴリ・条件・対象から組み立てた安定キーを使用します。

```js
conditionByModifier: {
    [modifierStateKey]: {
        enabled: true,
        stack: 2,
        option: ""
    }
}
```

現行のキャラ・装備共通チェックボックスは互換UIとして残っています。補正条件更新時には同一キーの状態を保持し、存在しなくなった補正の状態だけを削除します。計算エンジンは互換UIを直接判定せず、変換後の `conditionByModifier` を参照します。

## カテゴリ対応順

1. `effectOverride`
2. `extraDamage`
3. `additiveBaseDamage` の構造化済みサブセット
4. 効果グループを確認した上で `statBonus` と `scalingBonus`
5. 専用入力を要する参照効果
6. リソース・状態管理系

`statBonus` には追撃効果から誤分割されたレコードが含まれるため、カテゴリ全体を一律に有効化しません。

### custom補正の明示契約

- customの直接ステータス補正は `customCalculation: "directStatBonus"` を持ち、単一のステータス対象・数値・対応する単位が揃う場合だけ計算します。
- customの `statBonus` でこの指定がないものは、追撃や回復の誤分類を避けるため候補に残します。
- `scalingBonus` は参照先を `scalingStatBonus` と `scalingDamageBonus` に分類します。自己ステータス参照、対象、倍率、単位が揃わないものは計算しません。
- 専用入力や複数選択肢を要する補正は、数値の一部だけを推測して適用しません。

### 残候補の再集計

2026-07-13時点の全補正JSONに対する共通解析結果です。`calculable` は数式を扱える件数であり、UID入力へ反映済みのため実適用しないレコードも含みます。

| category | total | calculable | UID上applicable |
| --- | ---: | ---: | ---: |
| `statBonus` | 302 | 285 | 188 |
| `scalingBonus` | 27 | 4 | 15 |
| `additiveBaseDamage` | 30 | 10 | 25 |
| `extraDamage` | 156 | 107 | 121 |
| `effectOverride` | 47 | 1 | 45 |

### 専用参照入力の契約

専用参照値は `context.manualInputs` に保持し、通常のキャラクターステータスと混在させません。

```js
manualInputs: {
    recordedHealing: 12000,
    providerStats: {
        hp: null,
        atk: null,
        def: 3000,
        elementalMastery: null
    },
    resourceStates: {
        [resourceStateKey]: 2
    }
}
```

- `reference.type: "healingRecorded"` は `recordedHealing` を要求し、`reference.maxValue` がある場合は入力値を上限で制限します。
- `reference.source: "provider"` は `providerStats[reference.stat]` を要求します。自己ステータスへのフォールバックは行いません。
- 解析結果は `requiredInputs` と `missingInputs` を返します。入力不足時は `supportStatus: "missingInput"` とし、理由付き候補に残します。
- 記録治療量型の独立ダメージは、上限適用後の値を固定基礎ダメージとして生成します。

2026-07-13時点では記録治療量参照が2件、提供キャラクター参照が4件あります。

### リソース・状態管理系

`resourceEffect`、`resourceGeneratedEffect`、`resourceCostOverride` は `resourceClassification` で分類します。

| 分類 | 判定 | 動作 |
| --- | --- | --- |
| `calculationInput` | リソースIDまたは名称と、構造化された増減量がある | 現在層数とともに `resourceStateInputs` へ返す |
| `displayOnly` | 原文由来、または名称だけが構造化済み | 候補一覧に表示専用と明示する |
| `unsupported` | リソース構造自体が不足 | 未対応理由を候補一覧へ表示する |

全補正JSONの再集計結果は、計算入力27件、表示専用22件、未対応0件です。リソース効果自体はダメージへ直接加算せず、後続効果が参照できる状態入力として扱います。

## 実装段階

### 現在の段階

- 設計書をリポジトリへ保存
- Node.js標準テストランナーによる恒久テストを追加
- 共通解析層を追加
- `effectOverride` と `extraDamage` の計算可否判定を共通解析層へ接続
- Engine独自のUID例外判定を廃止し、`inputStatus` と `inputReason` へ統一
- `manualOnly`、`displayOnly`、`special` を計算可能性だけで迂回しない
- 計算不能な条件付き補正を黙って無視せず、理由付き候補として保持
- `effectOverride` と `extraDamage` の適用処理全体を解析結果ベースへ移行
- 同一効果・同一計算役割に限定した重複排除を追加
- 自己ステータスを参照する `additiveBaseDamage` の安全なサブセットを実装
- 条件状態を補正の安定キー単位へ移行し、同じ補正の保持と消えた補正の削除を実装
- custom `statBonus` は `directStatBonus` を明示した5件だけを追加で有効化
- `scalingBonus` をステータス変換とダメージ補正に分類し、倍率が揃う安全な4件だけを計算可能化
- 全補正JSONを再集計し、未対応境界を設計書へ記録
- 記録治療量・提供者ステータス・現在リソース層数の専用入力欄を追加
- 専用入力の `requiredInputs` / `missingInputs` 契約と、入力不足時の安全な停止を実装
- 記録治療量型の加算ダメージと独立ダメージ、提供者参照型の加算ダメージを実装
- リソース・状態管理系を計算入力・表示専用・未対応へ分類し、候補表示と `resourceStateInputs` へ反映

### 次の段階

- 汎用の現在リソース層数入力を、補正の安定キーごとの動的入力UIへ移行
- リソース消費を参照する後続ダメージ補正との接続を、発動回数と消費規則を含めて実装
- 選択肢・対象数・チーム構成を要求する専用条件入力を同じ入力契約へ追加

## テスト方針

テストはブラウザなしで実行できるようにし、実際のJSONとDOMモックを使用します。

```powershell
node --test tests/genshin/*.test.cjs
```

最低限、次を固定します。

- 計算入力欄の命ノ星座が条件パネルの古い値より優先される
- `effectOverride` の対象効果と倍率が解析できる
- ステータス参照型と元ダメージ参照型の `extraDamage` を区別できる
- `null` 倍率を計算可能と判定しない
- `uidHandling` の状態を計算可否とは別に保持する
- `_resolved_1` と `_resolved_2` が同じ効果グループになる
- EngineとConditionsが共通解析層を使用して既存結果を維持する
- 自己ステータス参照の `additiveBaseDamage` だけが対象攻撃へ加算される
- 条件更新時に同じ補正キーを保持し、選択から消えたキーを削除する
- custom直接ステータス補正の明示契約がない誤分類レコードを適用しない
- 自己ステータス参照のダメージ補正を対象攻撃だけへ適用する
- 記録治療量と提供者ステータスは専用入力がある場合だけ計算する
- 記録治療量の上限を独立ダメージと加算ダメージへ反映する
- リソース効果を計算入力・表示専用・未対応へ分類する

テスト用の一時ファイルを作って削除する運用には戻さず、再発防止に必要なケースは恒久テストへ追加します。
