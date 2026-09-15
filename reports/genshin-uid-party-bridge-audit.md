# UID → Party bridge audit

UIDプロフィールを`CalculationInput v2`へ正規化し、サポート枠の`PartyState v2`へ取り込む経路を監査した。イベント登録、スロット反映、手動編集後のprovenance、計算用provider subset、元プロフィールのlossless保持、実ブラウザDOM経路まで実装・検証済みである。

## 実行経路

1. `genshinProfileMapper.mapProfileResponse()`がAPIプロフィールを表示用characterへ変換する。
2. `GenshinDataContract.createCalculationInput()`が`CalculationInput v2`とJSON-safeな`profileSnapshot`を生成する。この保持経路は監査上も`profileSnapshotCalculationInput=true`である。
3. UID importerが`genshin:calculation-input-selected`を発火し、`GenshinPartyState`が全character inputをID mapへ保持する。
4. ユーザーがサポート枠で同じIDを選ぶと、レベル、凸、通常/スキル/爆発天賦、武器、精錬、聖遺物mode、provider statsをフォームへ反映する。
5. 計算時はフォームと`getSupportState()`からCalculationRequestを再構築する。元snapshotを計算値として自動適用しない。

## Lossless profile snapshot

PartyMemberは編集可能な計算用subsetとは別に、deep-cloned `profileSnapshot`を保持する。次の情報はサポート投影で失われない。

- 通常/スキル/爆発以外の天賦キー
- 5部位すべての聖遺物ID、set、slot、名前、表示情報
- 武器名、種別、レア度、効果文などの表示情報
- 会心率、会心ダメージ、元素チャージ効率、元素ダメージ詳細
- character名、元素、武器種、レア度、元provenance

`provenance.source`は現在の編集状態（`uidProfile` / `manual` / `mixed`）を表し、`sourceSnapshot`と`retainedFromUid`は保持中の元UID記録を表す。手動編集後もsnapshotは変更されず、現在値と元値を混同しない。

## 計算境界

- provider計算用statsは従来の`baseHp/baseAtk/baseDef/hp/atk/def/elementalMastery` subsetのまま。
- 聖遺物modeは`4pc` / `2pc2pc` / `2pc` / `none`。単独2セットを4セット効果として扱わない。
- supportの`combatState.onField`は`false`、`hpRatio`は100、`buffStates`は空で開始する。UIDから戦闘状態やbuff有効化を推測しない。
- 未知のUID天賦IDはrawByIdへ保持し、provider値をLv1へfail-closedする。`Object.values()`順序による意味割当は行わない。

## 検証

- `tests/genshin/genshinUidPartyBridgeContract.test.cjs`: deep clone、5聖遺物、追加天賦、詳細stats、手動編集後のsnapshot/provenance、provider subset不変を検証。
- `tests/genshin/genshinUidTalentOrderContract.test.cjs`: 明示combat IDと未知IDのfail-closedを検証。
- `tests/genshin/genshinBrowserSmoke.e2e.cjs`: 実Edge上でUID inputイベント、party選択、DOM反映、手動編集による`mixed`化、元snapshot不変、戦闘状態非推測を検証。

最終結果: bridge contract 8件、関連UID/DataContract/Party tests、全Genshin test 402件、実Edge E2E 1件が成功した。
