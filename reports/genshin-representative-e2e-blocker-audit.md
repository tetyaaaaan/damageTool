# 原神・実データ代表 E2E blocker 監査

監査日: 2026-08-23  
判定主体: Sol  
AI 自己承認: 禁止を維持  
canonical gate: 緩和していない

## 結論

実データ代表の最短候補は、武器 `12516`「超越の鍵」の独立した常時攻撃力 modifier `w_12516_stat_1` である。

ゲームデータの証拠は Genshin Impact 6.7 に厳密結合でき、R1〜R5 の値 `28 / 35 / 42 / 49 / 56%` は公式 HoYoWiki と immutable な genshin-db revision で一致する。Gachabase の revision-specific 6.7 release も R1 `28%` を補助的に再確認する。

しかし現行コードでは、証拠が完全でも `humanReviewReady` は構造的に成立しない。`genshinV2DualSourceAudit.cjs` が全 claim の `canonicalEligibility` を常に `false` にし、`genshinNeedsReviewTriage.cjs` は同じ値が `true` であることを human-review-ready の必須条件にしているためである。これはデータ不足ではなく、review readiness と canonical promotion を同じフラグで表した契約上の循環である。

したがって今回の終了条件は「現 canonical 契約では代表 E2E が構造的に成立不能であることを立証し、ユーザー判断が必要な一点まで絞る」に該当する。

## 少数候補比較

| 候補 | Raw / version | 独立第二 source | Runtime / Calculation / UI | Behavior | 完遂性 |
|---|---|---|---|---|---|
| 超越の鍵 `12516`・常時攻撃力 | 公式 HoYoWiki entry `10949` に R1〜R5 と `Luna VIII` | genshin-db `1bab2cd…`、補助 Gachabase 6.7 release | 既存 `weaponModifiers/12516/modifiers`、精錬選択、攻撃力計算 | 対象外。別の stack 効果と分離可能 | **最短**。証拠は揃うが readiness 契約で停止 |
| Amos' Bow `15502` | 公式 Version 1.2 は R1 のみ | gcsim は revision 固定だが gameVersion 不明 | stack / interval / arrowFlightTime の既存 E2E あり | 適する | R2〜R5 と gcsim strict version が欠ける |
| Golden Frostbound Oath `15516` | 公式 R1、Gachabase 6.7 release | genshin-db 6.7 | 既存 route あり | 適するが複雑 | R2〜R5 と複数 scope が残る |
| Celestial Gift / Disenchantment 2-piece | 公式 Luna VII | genshin-db 6.7 | artifact route あり | 不要 | 同一 target version の直接証明としては弱い |

## 選定候補の証拠パケット（承認前・構造 blocker 付き）

### 対象

- entity: weapon `12516`「超越の鍵」
- candidate: `w_12516_stat_1`
- 意味: 装備中、攻撃力を精錬ランクに応じて常時上昇
- Runtime destination: `weaponModifiers/12516/modifiers`
- legacy replacement: `w_12516_stat_1`
- canonical runtime id candidate: `genshin:v2:weapon:12516:w_12516_stat_1`

### 原文 / Source A（公式）

- provider: HoYoverse / HoYoWiki
- locator: `https://wiki.hoyolab.com/pc/genshin/entry/10949`
- record identity: entry `10949`, weapon `12516`
- raw: `攻撃力+28/35/42/49/56%。`
- 同一ページの version field: `実装バージョン Luna VIII`
- 公式 update binding: `https://www.hoyolab.com/article_pre/18014398241022990`
  - `Luna VIII` update の新武器として「超越の鍵」を明記

### Source B（独立 structured provider）

- provider: `theBowja/genshin-db`
- immutable revision: `1bab2cdba4d218fd5caa46b5f54e7884ee8359a2`
- locator: `src/data/English/weapons/ateaspoonoftranscendence.json`
- manifest locator: `package.json` at the same revision
- manifest text: `Genshin Impact v6.7 JSON data.`
- extracted values:
  - R1 `28%`
  - R2 `35%`
  - R3 `42%`
  - R4 `49%`
  - R5 `56%`
- condition: passive first sentence; no trigger applies to this ATK clause

### 補助 Source C（revision-specific cross-check）

- provider: Gachabase（自身を independent fan-made community project と明記）
- locator: `https://gi.gachabase.net/weapons/12516/a-teaspoon-of-transcendence/release/6.7.0/46509556?lang=en`
- provider snapshot: `v6.7.0 (REL)`, `D46509556 | R46263955`
- R1 raw: `ATK is increased by 28%.`
- limitation: 表示上 R1 のみなので R2〜R5 の主証拠には使わない

### field comparison

| field | Source A | Source B | Spec | 判定 |
|---|---|---|---|---|
| entity id | `12516` | `12516` | `12516` | 一致 |
| target | 攻撃力 | ATK | `atkPercent` | 一致（locale normalization） |
| condition | 常時句 | trigger から独立した第一文 | `always` | 一致 |
| R1 | 28% | 28% | 28 | 一致 |
| R2 | 35% | 35% | 35 | 一致 |
| R3 | 42% | 42% | 42 | 一致 |
| R4 | 49% | 49% | 49 | 一致 |
| R5 | 56% | 56% | 56 | 一致 |
| unit | percent | percent | `percent` | 一致 |
| gameVersion | Luna VIII | 6.7 manifest | 6.7へ伝播可能 | 一致 |

### 自動解消すべき Spec 問題

現在の `w_12516_stat_1` は、武器の第二節に属する `max 3 stacks` を常時攻撃力 clause に誤って継承し、`stack` と `valueByRefinementPerStack` を持つ。公式・genshin-db とも stack は Stellar-Conduct 節だけに掛かる。canonical 化前に、共通 parser / clause ownership 修正で次を行う必要がある。

- 常時攻撃力 modifier から `stack` を除去
- `valueByRefinementPerStack` を除去
- `valueRole` を非 stack の精錬値として正規化
- reaction modifier 側の 5秒 / 0.2秒 / 最大3層は維持

これは genuine semantic conflict ではなく、provider text の節境界に対する deterministic mapping 問題である。

## Raw → Spec → Runtime → Calculation → UI 到達点

| 層 | 状態 | 証跡 / 残条件 |
|---|---|---|
| Raw / Source | complete | 公式 HoYoWiki、genshin-db immutable 6.7、Gachabase 6.7 R1 を特定 |
| Structured Spec | implementedButNeedsValidation | 値・target・condition は一致。誤った stack 継承の自動修正が必要 |
| canonical Runtime | structurallyBlocked | human review 前であることに加え、review-readiness の循環条件で packet を ready にできない |
| Calculation | routeExists | legacy `weaponModifiers/12516/modifiers` は refinement に応じた `atkPercent` route を持つ |
| UI | routeExists | 武器 / 精錬入力から CalculationInput へ接続可能。常時効果なので結果値 toggle は不要 |

## 構造的不能のコード証拠

1. `scripts/genshinV2DualSourceAudit.cjs` の `buildClaimRecords` は、classification の結果にかかわらず全 claimへ `canonicalEligibility: false` を格納する。
2. 同ファイルの candidate summary も常に `canonicalEligibility: false` を返す。
3. `scripts/genshinNeedsReviewTriage.cjs` は `classification === "dual-source eligible" && claim.canonicalEligibility === true` のときだけ `evidenceReady` とする。
4. candidate は全 claim の `evidenceReadyClaims` が `claims` と一致した場合だけ human-review-ready になる。
5. その全 claim には `notApplicable` と、外部ゲーム provider が発行しない `destination`、`runtime.modifierIds`、`supersedesLegacyModifierIds` 等の damageTool 内部契約も含まれる。

したがって、外部証拠を追加するだけでは ready 数は必ず 0 のままである。`verified`、reviewer、canonical promotion を要求する production gate 自体は別に維持できる。

## 元 `/goal` と後発契約の分離

元 `/goal` が代表 E2E に要求する保証:

- Raw と AI interpretation の分離
- provenance / gameVersion / verification の追跡
- 未検証値の fail-closed
- 実データで Spec → Runtime → Calculation → UI を実証

後発 canonical 契約が追加した保証:

- every copied field に独立二源の exact verified claim
- reviewer / reviewedAt
- allowlisted destination と legacy supersession

これらの追加保証は維持できる。ただし、human review の入口まで canonical promotion フラグを要求すると循環するため、入口と出口の状態を分離する必要がある。

## ユーザー判断が必要な一点

次の契約修正を実装してよいか。

> `machineEvidenceReady`（人手レビューの入口）と `canonicalEligibility`（人手承認後の昇格資格）を別フィールドにし、game semantic claim、deterministic implementation claim、notApplicable claim を別ルールで評価する。外部の値・条件・target は strict gameVersion の独立二源を維持し、内部 route はコード provenance と focused test で検証する。production canonical gate の `verified` / reviewer / reviewedAt / fail-closed は変更しない。

この修正は証拠条件の緩和ではなく、現在同一フラグに混在している「レビュー準備」と「レビュー済み」を分離するものである。

## 承認後の具体的再開地点

1. claim kind と `machineEvidenceReady` を schema / DataContract に追加
2. dual-source audit は promotion を行わず、game semantic claims の machine evidence result のみを返す
3. triage は `needsReview` claims の machine evidence completion を評価し、`notApplicable` を分母から除く
4. internal route claims は deterministic code provenance + focused tests で readiness を評価
5. `w_12516_stat_1` の clause ownership を修正
6. SourceRecord A/B/C と field provenance を materialize
7. review packet を再生成し `machineReady` を確認
8. その時点で初めて人手 review を要求
9. approve 後にのみ `verified` / `reviewedBy` / canonical Runtime を生成
10. browser E2E で refinement を変えた攻撃力・ダメージ差を確認

BehaviorModifier の実データ route は通常代表の成立後に、Amos' Bow `15502` の stack / interval / arrowFlightTime を最小第二代表として使う。通常代表の contract blocker が解ける前に Behavior 側の data population は開始しない。
