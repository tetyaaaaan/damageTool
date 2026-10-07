# 原神の効果説明と計算への反映

表示専用の原文は `games/genshin/data/original/effect-texts-ja.json` に出典とともに保存する。保存rawの日本語文、またはユーザーが外部確認した日本語原文を扱う。原文登録は計算仕様の検証・昇格を意味しない。

共通の `GenshinIdResolver.describeEffect` は `originalText` と `calculationSummary` を分離する。明示された原文だけを「原文」、明示的な部分引用だけを「原文抜粋」とする。原文を登録していない表示用文章は「TETINETによる説明」とし、原文の存在や一致を推定しない。

補正モーダルの「計算への反映」はRuntime modifierと現在の入力から生成した補正量・対象・精錬ランクを示す。原文は効果単位で表示し、modifierごとに重複させない。party効果の精錬は提供者の値を使用する。

既存の `sourceText`、`effectDescription`、`labelJa` は原文の証拠にしない。特に `sourceText` は条件・対象推定にも使われるため、表示の都合で原文へ置換しない。表示専用原文はRuntimeの推定・計算に渡さない。
