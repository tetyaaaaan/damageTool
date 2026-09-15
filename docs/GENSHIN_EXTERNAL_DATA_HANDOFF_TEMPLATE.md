# 原神 新規ゲーム情報 外部調査・引き渡しテンプレート

## 目的

外部の人間またはAIがゲーム内の事実と根拠を収集し、Codexがtetinetの既存データ構造、condition UI、modifier、production計算へ変換するための入力形式です。

外部側はtetinet内部の`category`、`applyTo`、modifier ID、condition key、JSON配置を決めません。原文、数値、対象、発動条件、時間・層・状態遷移、出典を省略せず渡してください。不明な項目は推測せず`unknown`とします。

### 項目区分

- `必須`: 対象種別では常に必要です。
- `該当時必須`: その効果・仕組みが存在する場合だけ必要です。
- `Codex補完可`: 元情報があればCodexが正規化できます。難読名などは分かれば記入してください。
- `人間入力不要`: tetinet内部の実装・生成・検証で決定します。

YAML内で区分コメントのない子項目は、その親ブロックが該当する場合は必須です。ゲーム上その仕組みが存在しない場合は`not_applicable`、存在するが資料で確定できない場合は`unknown`とし、後者は同じ`claim_id`を`unknowns`にも記録してください。空欄を不明値の代用にしません。

## 引き渡し単位

1キャラ、1武器、1聖遺物セットを1パケットとします。複数対象を渡す場合も対象ごとにテンプレートを分け、共通の根拠ファイルだけ共有してください。

推奨構成は次のとおりです。ファイル名は任意です。

```text
handoff/
  manifest.yaml
  entities/
    character-<id>.yaml
    weapon-<id>.yaml
    artifact-<id>.yaml
  sources/
    <取得した未加工JSON、HTML、PDF、画像、スクリーンショット等>
  images/
    <キャラ・武器・聖遺物の元画像>
```

URLだけでなく、可能な限り取得時点の未加工ファイルも添付します。表示だけに使う名称・画像には最低1つの固定可能な根拠が必要です。production計算へ採用する数値・条件・対象・式には、同じupstreamの翻訳やmirrorではない独立source familyによる照合資料も用意してください。資料間の不一致は多数決で消さず、そのまま記録します。

## 共通manifestテンプレート

```yaml
submission:
  target_game_version: ""       # 必須。例: 7.0
  target_release_or_build: ""   # 必須。正式版、preview、beta等も明記
  locale: "ja-JP"               # 必須
  researched_at: ""             # 必須。ISO 8601
  researcher: ""                # Codex補完可
  notes: ""                     # 該当時必須

entities:
  - type: "character|weapon|artifact"
    game_id: ""                 # 必須
    input_file: ""

sources:                         # 必須
  - source_id: "source-a"
    provider: ""                # 必須
    provider_family: ""         # Codex補完可。分かる場合はupstreamも記入
    url_or_locator: ""           # 必須
    revision_commit_or_snapshot: "" # 必須。固定不能なら理由をnotesへ
    captured_at: ""             # 必須
    game_version: ""            # 必須
    game_version_evidence: ""   # 必須。その版だと判断できる箇所
    locale: ""
    raw_file: ""                # 必須推奨。sources/以下の添付ファイル
    covered_claims: []           # 必須。例: identity, talent-values, c4-timing
    field_locations: []          # 必須。JSON path、表の行名、ページ番号等
    notes: ""
  - source_id: "source-b"
    independent_from: "source-a" # 計算採用claimでは必須
    provider: ""
    provider_family: ""
    url_or_locator: ""
    revision_commit_or_snapshot: ""
    captured_at: ""
    game_version: ""
    game_version_evidence: ""
    locale: ""
    raw_file: ""
    covered_claims: []
    field_locations: []

discrepancies:                   # 必須。なければ []
  - claim_id: ""
    source_a_value: ""
    source_b_value: ""
    context_or_unit_difference: ""
    resolved_by_source: ""      # 未解決なら unknown
    resolution_evidence: ""

unknowns:                        # 必須。なければ []
  - claim_id: ""
    missing_fact: ""
    sources_checked: []
    why_not_inferred: ""
```

SHA-256、SourceRecord ID、Spec ID、JSON pointer、provider独立性の最終判定、verification statusは人間入力不要です。Codexが添付物から生成・判定します。

## 共通の効果・挙動レコード

キャラの天賦・命ノ星座、武器効果、聖遺物効果に数値や状態変化がある場合は、該当する節の`effects`へ次の形で記録します。原文上ひとつの効果でも、対象・値・式が異なる節は別レコードに分けます。

```yaml
- claim_id: ""                        # 必須。パケット内で一意な調査用ラベル
  source_clause: ""                   # 必須。対応する原文を省略せず記載
  plain_meaning: ""                   # 必須。内部用語を使わない短い意味整理
  source_refs: []                      # 必須。manifestのsource_id

  effect:
    kind: ""                          # 必須。攻撃、回復、シールド、能力値、与ダメージ、会心、反応、耐性、防御、エネルギー等
    recipient: ""                     # 必須。自身、装備者、出場キャラ、チーム、装備者以外、敵、召喚物等
    affected_stat_action_or_reaction: "" # 必須
    included_attack_types: []          # 該当時必須
    excluded_attack_types: []          # 該当時必須
    elements: []                       # 該当時必須
    magnitude:
      value: null                     # 数値効果では必須
      unit: "percent|flat|ratio|seconds|energy|other"
      per: "total|stack|point|enemy|hit|other"
      values_by_talent_level: {}       # 該当時必須。原精度
      values_by_refinement: {}         # 該当時必須。R1～R5
      values_by_stack_or_state: {}     # 該当時必須。非線形なら全状態
      cap: null                        # 該当時必須
      floor_or_rounding: ""            # 該当時必須。不明なら unknown

  activation:
    trigger_event: ""                 # 必須。常時、使用、命中、反応、治療、HP変化等
    trigger_actor: ""                 # 必須。自身、装備者、任意の味方、敵、召喚物等
    trigger_target: ""                # 該当時必須
    prerequisites: []                  # 該当時必須。元素、攻撃種、HP、敵状態等
    relation: "AND|OR|exclusive|none" # 複数条件時必須
    on_field_required: null            # 動的効果では必須。true/false/unknown
    works_or_triggers_off_field: null  # 動的効果では必須
    trigger_interval_seconds: null     # 該当時必須
    cooldown_seconds: null             # 該当時必須

  timing:
    duration_seconds: null             # 該当時必須
    starts_at: ""                     # 該当時必須。使用時、命中時、ダメージ発生時等
    refresh_rule: "refresh|extend|independent|replace|none|unknown"
    activation_delay_seconds: null     # 該当時必須
    expiry_or_exit_event: ""           # 該当時必須

  stacks:
    applicable: false                 # 必須
    minimum: 0                        # 該当時必須
    maximum: null                     # 該当時必須
    initial: null                     # 該当時必須
    gained_per_trigger: null          # 該当時必須
    gain_events: []                   # 該当時必須
    consume_events_and_amounts: []    # 該当時必須
    reset_events: []                  # 該当時必須
    duration_per_stack_or_shared: ""  # 該当時必須
    refresh_rule: ""                  # 該当時必須
    shared_between_effects: []        # 該当時必須
    shared_between_owners_or_targets: "" # 該当時必須

  choices_or_branches:
    mutually_exclusive: false         # 該当時必須
    options: []                       # 該当時必須。状態名、条件、各値を全て記録

  formula:                            # 独立ダメージ、加算、回復、シールド、特殊反応等で必須
    formula_text: ""
    scaling_terms:
      - reference_stat: "ATK|HP|DEF|EM|level|fixed|other"
        reference_owner: "self|provider|active_character|target|other"
        coefficient: null
        unit: "percent|flat|ratio"
        values_by_level_or_refinement: {}
    base_or_additive_or_multiplier: ""
    element: ""
    damage_type: ""
    hit_count: null
    is_value_per_hit_or_total: ""
    can_crit: null
    crit_owner_and_stats: ""
    uses_enemy_defense: null
    defense_rule: ""
    uses_enemy_resistance: null
    resistance_element_and_rule: ""
    elemental_mastery_rule: ""
    character_or_reaction_level_rule: ""
    area_and_target_count_behavior: ""
    snapshot_or_recalculation: ""

  party_and_stacking:
    same_source_multiple_owners: "stack|max|not_stack|unknown" # チーム効果時必須
    stacks_with_other_sources: ""       # 明記がある場合
    maximum_targets_or_elements: null   # 該当時必須

  behavior:                            # 複雑な効果だけ該当時必須
    hit_or_attack_count: null
    charges: null
    maximum_triggers_or_instances: null
    tick_interval_seconds: null
    target_selection: ""
    element_application:
      application_element: ""
      gauge_units: null
      icd_interval: null
      icd_hit_rule: ""
      icd_scope_or_tag: ""
    resource_or_gauge:
      name: ""
      minimum: null
      maximum: null
      initial: null
      gain_rules: []
      consume_rules: []
      overflow_behavior: ""
    summon_or_construct:
      name: ""
      owner: ""
      lifetime: ""
      attack_cycle: ""
      placement_limit: null
      replacement_or_destroy_rule: ""
      inherited_stats: []
    special_state_or_form:
      state_name: ""
      entry_triggers: []
      exit_triggers: []
      replaced_or_added_actions: []
      separate_multiplier_rows: []
      element_changes_and_exclusions: []

  unknowns: []                         # 必須。なければ []
```

`effect.kind`などはゲーム上の意味を平文で示せればよく、tetinetのenumに合わせる必要はありません。外部側で不明なhit数、ICD、snapshot、対象、式を倍率配列や類似効果から推測しないでください。

## キャラクター入力テンプレート

```yaml
entity_type: character                 # 必須
identity:
  character_id: ""                    # 必須。安定したゲーム内ID
  variant_id_or_key: ""               # 旅人の元素、別variantでは必須
  name_ja: ""                         # 必須
  name_original: ""                   # 該当時必須
  name_reading_ja: ""                 # Codex補完可
  element: ""                         # 必須
  weapon_type: ""                     # 必須
  rarity: null                         # 必須
  release_date_or_order: ""            # 必須。選択一覧の並び順用
  source_refs: []                      # 必須

image:
  original_file: ""                   # 必須。direct_urlとのいずれか
  direct_url: ""                      # 必須。original_fileとのいずれか
  provider_icon_key_or_asset_path: ""  # 該当時必須
  source_page: ""                     # 必須
  source_revision_or_date: ""          # 必須
  confirms_character_and_variant_id: true # 必須
  # 96px WebP化、保存名、digestは人間入力不要

base_stats:
  source_native_record: {}             # 必須。base値、curve参照、突破加算のraw
  resolved_checkpoints:                # 必須。転記・curve対応の照合用
    - { level: 1, ascension: 0, hp: null, atk: null, def: null }
    - { level: 20, ascension: before, hp: null, atk: null, def: null }
    - { level: 20, ascension: after, hp: null, atk: null, def: null }
    # 40/50/60/70/80のbefore/after、90、対応する場合は100も同形式で追加
  ascension_bonus_stat:
    stat_name: ""                     # 必須
    values_by_ascension: []            # 必須。原精度
  source_refs: []                      # 必須

talents:
  normal_attack:
    source_key: ""                    # Codex補完可。combat1等
    name_ja: ""                       # 必須
    normal_description_ja: ""         # 必須
    charged_description_ja: ""        # 必須
    plunging_description_ja: ""       # 必須
    attributes: []                    # 必須。下記attribute形式で全行
  skill:
    source_key: ""
    name_ja: ""                       # 必須
    description_ja: ""                # 必須
    attributes: []                    # 必須
  burst:
    source_key: ""
    name_ja: ""                       # 必須
    description_ja: ""                # 必須
    energy_cost: null                 # 必須
    attributes: []                    # 必須
  alternate_or_special: []            # 該当時必須。特殊通常、別フォーム等

# talents.*.attributes の要素。原資料にある行を「非ダメージ値も含め」省略しない
attribute_example:
  source_label: ""
  source_param_key_or_field_path: ""
  values_lv1_to_lv15: []              # 必須。15個、原精度。存在する全レベル
  source_format_and_unit: ""          # 必須。%, flat, seconds, energy等
  semantic_notes: ""
  source_refs: []

calculation_rows:                     # 必須。画面に出す各攻撃・回復・シールド等
  - source_talent: "normal_attack|skill|burst|alternate"
    source_attribute_label: ""        # 必須
    action_or_variant: ""             # 必須。1段、長押し、低空、召喚物A等
    effect_kind: "damage|healing|shield|other" # 必須
    attack_type: "normalAttack|chargedAttack|plungingAttack|skill|burst|other" # 必須
    damage_type: "normal|charged|plunging|skill|burst|reaction|other" # 必須
    element: "physical|炎|水|風|雷|草|氷|岩|special" # 必須
    hit_count: null                    # 必須。不明なら unknown
    is_value_per_hit_or_total: ""      # 必須
    scaling_terms: []                 # 必須。参照stat、Lv1～15値、単位
    can_crit: null                    # 必須
    uses_enemy_defense: null          # 必須
    uses_enemy_resistance: null       # 必須
    available_only_in_state: ""       # 該当時必須
    target_count_behavior: ""         # 該当時必須
    source_refs: []                   # 必須

passives:                             # 必須。探索・生活天賦を含め全件
  - source_key: ""                   # Codex補完可
    unlock_ascension: null            # 該当時必須
    name_ja: ""                       # 必須
    description_ja: ""                # 必須
    effects: []                       # 数値・戦闘効果があれば該当時必須。共通効果レコード
    source_refs: []                   # 必須

constellations:                       # 必須。C1～C6を全件
  "1":
    name_ja: ""                       # 必須
    effect_text_ja: ""                # 必須
    talent_level_change:              # 該当時必須
      talent: ""
      amount: null
      maximum_level: null
    effects: []                       # 数値・戦闘効果があれば該当時必須。共通効果レコード
    source_refs: []                   # 必須
  # "2"～"6"も同形式

character_wide_mechanics:             # 該当時必須
  resources_or_gauges: []
  summons_or_constructs: []
  special_states_or_forms: []
  infusions_or_conversions: []
  special_reactions: []
  shared_party_rules: []
```

通常・重撃・落下・スキル・爆発の倍率行は、名称だけで対応づけず、原資料のparam keyまたはfield pathも添えてください。倍率がATK以外を参照する場合、参照statの所有者まで必要です。

## 武器入力テンプレート

```yaml
entity_type: weapon                    # 必須
identity:
  weapon_id: ""                       # 必須。安定したゲーム内ID
  name_ja: ""                         # 必須
  name_original: ""                   # 該当時必須
  name_reading_ja: ""                 # Codex補完可
  weapon_type: "片手剣|両手剣|長柄武器|弓|法器" # 必須
  rarity: null                         # 必須
  source_refs: []                      # 必須

image:
  original_file: ""                   # 必須。direct_urlとのいずれか
  direct_url: ""
  provider_icon_key_or_asset_path: ""  # 該当時必須
  source_page: ""                     # 必須
  source_revision_or_date: ""          # 必須
  confirms_weapon_id: true             # 必須
  # crop、WebP化、保存名、digestは人間入力不要

stats:
  base_atk:
    source_native_record: {}           # 必須。base値、curve、突破加算
    displayed_checkpoints:             # 必須
      level_1: null
      level_20_before: null
      level_20_after: null
      level_40_before: null
      level_40_after: null
      level_50_before: null
      level_50_after: null
      level_60_before: null
      level_60_after: null
      level_70_before: null
      level_70_after: null
      level_80_before: null
      level_80_after: null
      level_90: null
  secondary_stat:
    type: "ATK%|HP%|DEF%|元素熟知|元素チャージ効率|会心率|会心ダメージ|物理ダメージ|none" # 必須
    source_native_record: {}           # none以外は必須
    level_1: null                     # none以外は必須
    level_90: null                    # none以外は必須
    unit: "percent|flat"              # none以外は必須
  source_refs: []                     # 必須

passive:
  effect_name_ja: ""                  # 効果を持つ武器では必須
  exact_text_ja_by_refinement:         # 必須。R1～R5の省略なし全文
    "1": ""
    "2": ""
    "3": ""
    "4": ""
    "5": ""
  source_params_by_refinement:         # 必須。原資料のparam名と原精度値
    "1": {}
    "2": {}
    "3": {}
    "4": {}
    "5": {}
  effects: []                         # 必須。共通効果レコード。R1～R5軸を記録
  source_refs: []                     # 必須

flavor_description_ja: ""             # 該当時必須。現UIでは未使用
story_ja: ""                          # 人間入力不要。現production未使用
```

副ステータスは完全情報として必須です。ただし現行productionの手動武器選択は`base-stats.json`から基礎ATKだけを自動反映し、副ステータスは自動加算しません。この既存gapをどう扱うかはCodex側の統合判断であり、外部側で値を省略してよい理由にはなりません。

## 聖遺物セット入力テンプレート

```yaml
entity_type: artifact                  # 必須
identity:
  set_id: ""                          # 必須。安定したゲーム内set ID
  name_ja: ""                         # 必須
  name_original: ""                   # 該当時必須
  short_name_ja: ""                   # Codex補完可
  name_reading_ja: ""                 # Codex補完可。難読名は記入推奨
  source_refs: []                      # 必須

image:
  original_file: ""                   # 必須。direct_urlとのいずれか
  direct_url: ""
  metadata_url_or_raw_file: ""         # 必須推奨。setId、Icon、部位対応
  provider_icon_key_or_asset_path: ""  # 該当時必須
  source_revision_or_date: ""          # 必須
  confirms_set_id: true                # 必須
  # どの部位を代表画像にするか、WebP化、digestは人間入力不要

set_effects:
  two_piece:
    exact_text_ja: ""                  # 必須
    exact_text_other_locale: ""        # 別locale照合時は必須
    effects: []                        # 必須。共通効果レコード
    source_refs: []
  four_piece:
    exact_text_ja: ""                  # 必須
    exact_text_other_locale: ""
    effects: []                        # 必須。共通効果レコード
    source_refs: []

set_specific_rules:                   # 該当時必須
  same_set_multiple_wearers: "stack|max|not_stack|unknown"
  off_field_activation: ""
  reaction_element_mapping: []        # 反応・元素で対象が変わる場合は真理値表
  mutually_exclusive_states: []
  maximum_active_targets_or_elements: null
  special_reaction_formulas: []

piece_names_stories_and_drop_domain: "" # 人間入力不要。現セット選択・計算では未使用
rarity_list: []                         # 人間入力不要。画像照合資料に含まれる場合は添付可
```

`artifact-sets.json`相当のidentityだけでは選択モーダルに出ません。2セットまたは4セット効果文が必要です。また、効果文が表示されるだけでは計算完了ではなく、対応consumerがない特殊反応等はその部分だけfail-closedになります。

## 特殊反応を新設・変更する場合の追加テンプレート

キャラ・武器・聖遺物が既存consumerにない反応を発生・変更する場合は、次も添付します。通常反応や類似反応からの推測は禁止です。

```yaml
special_reaction:
  name_ja: ""                         # 必須
  internal_or_game_id: ""              # 分かる場合は必須
  target_game_version: ""             # 必須
  enabling_elements_and_order: []      # 必須
  trigger_owner: ""                   # 必須
  damage_owner_and_used_stats: ""      # 必須
  produced_element: ""                # 必須
  formula:
    base_coefficient_by_character_or_reaction_level: {} # 必須
    scaling_stats_and_formula: ""      # 必須
    elemental_mastery_formula: ""      # 必須
    additive_and_multiplicative_bonuses: "" # 必須
    can_crit: null                     # 必須
    crit_owner_and_stats: ""           # 必須
    uses_enemy_defense: null           # 必須
    defense_rule: ""                   # 必須
    resistance_element_and_rule: ""    # 必須
  execution:
    immediate_or_delayed: ""           # 必須
    delay_seconds: null                # 該当時必須
    hit_count: null                    # 必須
    area_and_target_count: ""          # 必須
    level_or_stage_rules: []           # 該当時必須
    early_detonation_rules: []         # 該当時必須
    coexistence_and_overwrite_rules: [] # 該当時必須
    gauge_icd_and_application: {}      # 該当時必須
    snapshot_or_recalculation: ""      # 必須
  source_refs: []                      # 必須。計算claimは独立照合を含む
  unknowns: []                         # 必須
```

## 外部入力から現行productionへの対応

| 外部入力 | 主な格納先 | 表示・計算経路 |
| --- | --- | --- |
| キャラID、名前、元素、武器種、レアリティ | `games/genshin/data/characters.json` | `genshinIdResolver.js` → `genshinSelectionModal.js` |
| キャラ実装順 | `games/genshin/data/character-release-order.json` | 選択モーダルの並び順 |
| 天賦名・説明、固有天賦 | `games/genshin/data/character-talents.json` | `genshinEquipmentDetails.js` |
| C1～C6名・説明 | `games/genshin/data/character-constellations.json` | `genshinEquipmentDetails.js` |
| キャラ基礎値 | `games/genshin/data/base-stats.json` | `genshinBaseStats.js` → 手動入力の基礎値 |
| 天賦の計算行・Lv倍率 | `games/genshin/data/calc/talent-scalings.json` | `genshinCalcEngine.js` |
| 固有天賦・スキル状態の補正 | verified Spec → `calc/talent-modifiers.json` | `genshinCalcConditions.js` → `genshinCalcEngine.js` |
| 命ノ星座補正 | verified Spec → `calc/constellation-modifiers.json` | 同上 |
| 別攻撃モード・元素付与等 | `calc/talent-scalings.json`、必要時`calc/attack-mode-rules.json` | 条件UI・攻撃entry正規化 |
| 武器ID、名前、種別、レアリティ | `games/genshin/data/weapons.json` | ID resolver → 選択モーダル |
| 武器効果名・R1～R5全文 | `games/genshin/data/weapon-effects.json` | `genshinEquipmentDetails.js` |
| 武器基礎値 | `games/genshin/data/base-stats.json` | `genshinBaseStats.js` |
| 武器の計算効果 | verified Spec → `calc/weapon-modifiers.json` | Conditions → Engine |
| 武器の共有条件・対象 | `calc/weapon-effect-registry.json` | toggle/stack/option UI、対象解決 |
| 聖遺物名・短縮名・読み | `games/genshin/data/artifact-sets.json` | ID resolver → 選択モーダル |
| 2/4セット全文 | `games/genshin/data/artifact-set-effects.json` | 詳細・条件カード表示、モーダル登録可否 |
| 2/4セット計算効果 | verified Spec → `calc/artifact-set-modifiers.json` | Conditions → Engine |
| 画像 | `games/images/genshin/{characters,weapons,artifacts}/<id>.webp` | 選択モーダル・選択trigger |
| 固定raw・版・field根拠 | SourceRecordとraw artifact | Spec検証 → canonical Runtime gate |
| timing、召喚物、stack lifecycle等 | BehaviorSpec / BehaviorModifier | canonical Runtimeの対応consumer |

モーダル登録用の個別コードは通常不要です。catalogと必要な表示データを追加すると既存モーダルが列挙します。画像は既存同期処理で取得・96px WebP化できる場合があり、内部保存名や加工は人間入力不要です。

## 実装済み例

### キャラ: フレミネ `10000085`

- identityは`characters.json`。
- 天賦名・全文と固有天賦は`character-talents.json`。
- C1～C6全文は`character-constellations.json`。
- 通常4段、重撃、落下、スキル各rank、爆発のLv1～15倍率は`calc/talent-scalings.json`の別entry。
- C4の「指定反応後6秒、攻撃力+9%、最大2層」とC6の「会心ダメージ+12%、最大3層」は、外部事実からCodexがstack条件へ変換し、条件UIの0～最大値とproduction補正へ接続します。

外部側に必要なのは、対象反応、1層値、最大層、継続時間、発動間隔、取得主体です。`statBonus`、`critBonus`、内部ID、UI部品は人間入力不要です。

### 複雑キャラ: フリーナ `10000089`

- 3種召喚物のHP倍率は別々の計算行になります。
- テンションのLv別変換率、上限、C2の上限超過、C6の元素変換・HP加算・最大回数は、効果と状態の複数レコードへ分かれます。
- 外部側は各フォーム、参照HPの所有者、Lv別値、0～上限、継続時間、最大回数、適用攻撃、元素変換の除外を事実として渡します。

### 武器: 船渠剣 `11427`

- identityは`weapons.json`、効果名・全文・R1～R5 paramは`weapon-effects.json`。
- 基礎ATKと副statのrawは`base-stats.json`。
- 「治療時に30秒のマークを最大3枚取得」「スキル・爆発で全消費」「1枚ごとの熟知R1～R5」「2秒後のエネルギー」「15秒ごと」「待機中取得可」という外部事実から、resource入力と消費stack補正へ変換されます。

### 聖遺物: 紅血の証 `15047`

- 名前・短縮名・読みは`artifact-sets.json`、全文は`artifact-set-effects.json`。
- 2セットの攻撃力+18%と、星拡散後10秒の会心率+16%／星拡散ダメージ+40%は`calc/artifact-set-modifiers.json`へ分割されます。
- 4セットの2効果は同じ外部発動条件なので、Codexが同一condition groupへまとめ、画面には1つのtoggleを出します。

### 聖遺物: 炉炎溶錬の心 `15048`

- 外部側は「装備者が星反応を起こす、または星反応ダメージを与える」「待機中も発動」「12秒」「装備者攻撃力」「周囲チームの星反応ダメージ」「同名非重複」を個別に渡します。
- 既存の星電導consumerへは接続できますが、星拡散の式が未実装なら、入力が完全でも星拡散部分だけは表示可能・計算不可として残ります。

## Codex側の作業と完了判定

以下は人間入力不要です。

1. 添付rawを固定し、digest、SourceRecord、field locator、版・source familyを確認する。
2. 不一致とunknownを保持し、EffectSpec／BehaviorSpec／BehaviorModifierのどれが正本か決める。
3. 既存schema、generator、consumerが意味を扱えるか確認する。扱えない部分は推測せずfail-closedにする。
4. catalog、全文、基礎値、倍率、verified Runtime、modifierを既存経路へ接続する。
5. modifierからtoggle、stack、option、専用入力を生成し、初期状態を中立値にする。
6. UID最終ステータスとの二重加算、party対象、同名非重複、攻撃・元素・反応対象外への漏れを防ぐ。
7. 既存の画像同期を使うか添付画像をWebP化し、実画像ロードを確認する。
8. 最小fixtureと実ブラウザで次を確認する。

- 選択モーダルから選べる。
- 画像、名称、天賦／凸／精錬／セット効果全文を読める。
- 必要な条件をOFF/ON、0/最大層、各optionへ変更できる。
- UI入力が`CalculationRequest`のcondition/resource/party stateへ入る。
- modifierが対象entryだけに適用され、非対象へ漏れない。
- 条件変更でproduction計算結果が期待どおり変化する。
- 特殊反応、party効果、召喚物、別フォームは対応consumerまで通る。

この一連を満たして初めて「選択できる・内容が表示される・条件設定できる・計算される」の完了とします。表示のみ、内部JSONのみ、fixture用の直接呼び出しのみは完了に含めません。
