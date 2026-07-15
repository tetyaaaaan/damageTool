const GAMES_PREFIX = "/games";
const HSR_PROFILE_API_PATH = "/games/api/hsr-profile";
const GENSHIN_PROFILE_API_PATH = "/games/api/genshin-profile";
const ROOT_STATIC_SECTIONS = new Set([
  "/about", "/contact", "/guides", "/faq", "/updates",
  "/privacy", "/terms", "/links", "/sitemap",
]);

const INFO_PAGES = {
  "/about": {
    title: "このサイトについて",
    description: "tetinetの運営目的、計算ツールの制作方針、情報の検証方法について紹介します。",
    kicker: "About tetinet",
    lead: "tetinetは、ゲームの複雑なダメージ計算を試しやすく、結果の理由まで確認できる形にすることを目的とした個人制作サイトです。",
    content: `
      <section class="teti-panel"><h2>サイトの目的</h2><p>原神・崩壊：スターレイルを中心に、条件を変えながらダメージの目安を比較できる計算ツールと、その計算根拠を公開しています。単に数値を表示するだけでなく、補正項目や計算式を確認できるサイトを目指しています。</p></section>
      <section class="teti-panel"><h2>運営者</h2><dl class="info-definition"><dt>運営名</dt><dd>tetinet</dd><dt>運営形態</dt><dd>個人運営</dd><dt>連絡先</dt><dd><a href="/contact/">お問い合わせページ</a>または<a href="https://x.com/tetinet_jp" target="_blank" rel="noopener noreferrer">X（@tetinet_jp）</a></dd></dl></section>
      <section class="teti-panel"><h2>情報と検証の方針</h2><ul><li>公開情報とゲーム内で確認できる仕様をもとに計算ロジックを実装します。</li><li>計算式と主な前提条件を公開し、結果を検証できる状態にします。</li><li>仕様変更や不具合を確認した場合は修正し、主な変更を更新履歴に記録します。</li><li>計算結果は参考値であり、すべての特殊条件を完全に再現するものではありません。</li></ul></section>
      <section class="teti-panel"><h2>非公式ファンサイトについて</h2><p>本サイトはゲーム各社とは関係のない非公式ファンサイトです。ゲーム内名称、画像、商標などの権利は各権利者に帰属します。詳しくは<a href="/terms/">利用条件・免責事項</a>をご確認ください。</p></section>`,
  },
  "/contact": {
    title: "お問い合わせ",
    description: "tetinetの計算ツールに関する不具合報告、ご意見、ご連絡方法をご案内します。",
    kicker: "Contact",
    lead: "計算結果の不一致、不具合、ご意見は以下の窓口からお知らせください。",
    content: `
      <section class="teti-panel"><h2>お問い合わせ方法</h2><p><a class="teti-button teti-button-primary" href="mailto:contact@tetinet.com">contact@tetinet.com にメールする</a></p><p>お問い合わせはcontact@tetinet.comで受け付けています。</p></section>
      <section class="teti-panel"><h2>不具合報告に含めてほしい情報</h2><ul><li>対象ツールとページのURL</li><li>選択したキャラクター、武器、条件</li><li>期待した結果と実際に表示された結果</li><li>利用端末とブラウザ</li><li>可能であれば画面のスクリーンショット</li></ul></section>
      <section class="teti-panel"><h2>ご注意</h2><p>本サイトは非公式ファンサイトです。ゲームアカウント、課金、ゲーム内の不具合については各ゲームの公式サポートへお問い合わせください。パスワードや認証コードなどの機密情報は送信しないでください。</p></section>`,
  },
  "/guides": {
    title: "使い方ガイド",
    description: "原神・崩壊スターレイルのダメージ計算ツールの基本的な使い方を説明します。",
    kicker: "Guides",
    lead: "入力から結果確認までの基本的な流れと、計算結果を見るときの注意点をまとめています。",
    content: `
      <section class="teti-panel"><h2>原神ダメージ計算</h2><ol><li><a href="/games/genshin/">原神ダメージ計算ツール</a>を開きます。</li><li>キャラクター、武器、聖遺物と攻撃方法を選択します。</li><li>敵レベル、耐性、元素反応などの条件を確認します。</li><li>計算を実行し、会心なし・会心あり・期待値と補正内訳を比較します。</li></ol><p>条件付き効果は発動状態によって結果が変わります。選択中の条件カードも確認してください。</p></section>
      <section class="teti-panel"><h2>崩壊：スターレイル ダメージ計算</h2><ol><li><a href="/games/hsr/">スターレイル計算ツール</a>を開きます。</li><li>手入力、または公開プロフィールのUIDからキャラクター情報を反映します。</li><li>攻撃力、倍率、バフ、敵レベル、耐性などを調整します。</li><li>防御補正・属性耐性補正・靭性補正を含む結果を確認します。</li></ol></section>
      <section class="teti-panel"><h2>UID読み込みについて</h2><p>UID読み込みでは、ゲーム内で公開設定されているプロフィール情報のみを外部API経由で取得します。UIDや取得結果を本サイトのサーバーへ継続保存する機能はありません。詳細は<a href="/privacy/">プライバシーポリシー</a>をご確認ください。</p></section>
      <section class="teti-panel"><h2>結果を見るときの注意</h2><p>ゲーム内の丸め処理、敵固有ギミック、未対応の条件付き効果、アップデート直後の仕様変更などにより実測値と差が出る場合があります。計算の前提は<a href="/games/formula/">計算式ページ</a>、よくある疑問は<a href="/faq/">FAQ</a>にまとめています。</p></section>`,
  },
  "/faq": {
    title: "よくある質問",
    description: "tetinetのダメージ計算、UID読み込み、対応範囲に関するよくある質問です。",
    kicker: "FAQ",
    lead: "計算結果やUID読み込み、サイトの位置付けについてよくある質問をまとめました。",
    content: `
      <section class="teti-panel"><h2>計算結果がゲーム内と違うのはなぜですか？</h2><p>入力条件の差、ゲーム内の丸め処理、敵固有効果、条件付きバフ、未対応効果などが主な原因です。キャラクターと敵のレベル、耐性、会心条件、攻撃種類を確認してください。</p></section>
      <section class="teti-panel"><h2>会心なし・会心あり・期待値の違いは？</h2><p>会心なしは会心ダメージ補正を含めない値、会心ありは会心が発生した値です。期待値は会心率を加味して、多数回攻撃した場合の平均的な目安を示します。</p></section>
      <section class="teti-panel"><h2>UIDから何を取得しますか？</h2><p>ゲーム内で公開設定されているプロフィールとキャラクター情報を取得します。非公開情報、ログイン情報、所持キャラクター全体を取得することはできません。</p></section>
      <section class="teti-panel"><h2>UIDは保存されますか？</h2><p>本サイトにはUIDを継続保存するデータベース機能はありません。外部APIへの問い合わせとブラウザ上の表示に使用します。</p></section>
      <section class="teti-panel"><h2>公式サイトですか？</h2><p>いいえ。本サイトは個人が運営する非公式ファンサイトであり、各ゲームの運営会社とは関係ありません。</p></section>
      <section class="teti-panel"><h2>不具合や未対応効果はどこへ報告できますか？</h2><p><a href="/contact/">お問い合わせページ</a>から、対象ツールと再現条件を添えてお知らせください。</p></section>`,
  },
  "/updates": {
    title: "更新履歴",
    description: "tetinetと各ダメージ計算ツールの主な更新内容を掲載しています。",
    kicker: "Updates",
    lead: "利用者への影響が大きい機能追加、不具合修正、データ更新を記録します。",
    content: `
      <section class="teti-panel"><p class="info-meta"><time datetime="2026-07-15">2026年7月15日</time>｜サイト全体</p><h2>案内ページとポリシー情報を整備</h2><ul><li>使い方ガイド、FAQ、運営者情報、お問い合わせページを追加しました。</li><li>プライバシーポリシーと利用条件を整理しました。</li><li>サイトマップとクロール設定を追加しました。</li></ul></section>
      <section class="teti-panel"><p class="info-meta">2026年7月｜原神</p><h2>計算補正と選択機能を更新</h2><ul><li>一部武器の条件付き補正を修正しました。</li><li>月反応に関する計算処理を追加しました。</li><li>キャラクター選択画面を改善しました。</li></ul></section>
      <section class="teti-panel"><p>細かな内部修正を含むすべての変更ではなく、ツール利用時に影響する主な内容を掲載しています。</p></section>`,
  },
  "/privacy": {
    title: "プライバシーポリシー",
    description: "tetinetにおける広告、Cookie、アクセス解析、UID取得、個人情報の取り扱いを説明します。",
    kicker: "Privacy Policy",
    lead: "本サイトで利用する広告・アクセス解析・外部APIと、利用者情報の取り扱いについて定めます。",
    content: `
      <section class="teti-panel"><h2>広告配信について</h2><p>本サイトでは、第三者配信の広告サービス「Google AdSense」を利用します。Googleなどの第三者配信事業者は、利用者が本サイトや他のサイトへ過去にアクセスした情報に基づいて広告を配信するため、Cookie、Webビーコン、IPアドレスなどの識別情報を使用する場合があります。</p><p>Googleが広告Cookieを使用することにより、Googleおよびそのパートナーは本サイトや他のサイトへのアクセス情報に基づく広告を表示できます。利用者は<a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer">Google広告設定</a>でパーソナライズ広告を無効にできます。Googleによる情報の利用については、<a href="https://policies.google.com/technologies/partner-sites?hl=ja" target="_blank" rel="noopener noreferrer">Googleの案内</a>をご確認ください。</p></section>
      <section class="teti-panel"><h2>アクセス解析について</h2><p>本サイトでは、利用状況の分析と改善のためGoogle Analyticsを利用する場合があります。Google AnalyticsはCookie等を使用して閲覧ページ、利用環境、概略的な地域などのトラフィックデータを収集します。収集される情報はGoogleの規約とプライバシーポリシーに基づいて管理されます。</p></section>
      <section class="teti-panel"><h2>UID取得機能について</h2><p>原神ではEnka.Network、崩壊：スターレイルではMiHoMo APIを利用し、入力されたUIDに対応する公開プロフィール情報を取得します。取得対象は公開設定された情報に限られます。本サイトにはUIDや取得結果を継続保存するデータベース機能はありませんが、通信のためUIDは本サイトのサーバーおよび外部APIへ送信されます。</p></section>
      <section class="teti-panel"><h2>外部リンクとお問い合わせ</h2><p>外部サイトへ移動した後の情報の取り扱いは、各サイトの方針に従います。お問い合わせ時に利用者が任意で提供した情報は、問い合わせ対応のためにのみ利用します。パスワードや認証コードなどの機密情報は送信しないでください。</p></section>
      <section class="teti-panel"><h2>改定について</h2><p>法令、利用サービス、サイト機能の変更に応じて本ポリシーを改定する場合があります。</p><p class="info-meta">制定・最終更新：2026年7月15日</p></section>`,
  },
  "/terms": {
    title: "利用条件・免責事項",
    description: "tetinetの利用条件、計算結果に関する免責、著作権・商標について説明します。",
    kicker: "Terms",
    lead: "本サイトと計算ツールをご利用いただく際の条件と注意事項です。",
    content: `
      <section class="teti-panel"><h2>計算結果について</h2><p>本サイトの計算結果は、公開情報と独自に実装した計算処理に基づく参考値です。正確性、完全性、最新性を保証するものではありません。ゲーム内の仕様変更や入力条件により実際の結果と異なる場合があります。</p></section>
      <section class="teti-panel"><h2>免責事項</h2><p>本サイトの利用、利用不能、掲載情報または計算結果をもとにした判断によって生じた損害について、運営者は法令上認められる範囲で責任を負いません。外部サイトや外部APIの利用によって生じた問題についても同様です。</p></section>
      <section class="teti-panel"><h2>著作権・商標</h2><p>本サイトが独自に作成した文章、デザイン、プログラム等の権利は運営者に帰属します。原神および崩壊：スターレイルはCOGNOSPHEREの登録商標または商標です。その他のゲーム名、画像、データ、名称等の権利は各権利者に帰属します。</p></section>
      <section class="teti-panel"><h2>非公式ファンサイト</h2><p>本サイトは各ゲームの運営会社、Google、Enka.Network、MiHoMo API等から公式に運営・承認されたものではありません。各サービスへのお問い合わせを本サイトの窓口で受け付けることはできません。</p></section>
      <section class="teti-panel"><h2>変更</h2><p>サイト機能や運営状況の変化に応じて本条件を変更する場合があります。</p><p class="info-meta">制定・最終更新：2026年7月15日</p></section>`,
  },
  "/links": {
    title: "参考リンク・データ出典",
    description: "tetinetの計算ツールで参照する公式サイト、外部API、参考資料を掲載しています。",
    kicker: "References",
    lead: "ゲームの公式情報、プロフィール取得サービス、計算仕様の確認に利用する主な参考先です。",
    content: `
      <section class="teti-panel"><h2>公式サイト</h2><div class="info-link-grid"><a class="info-link-card" href="https://genshin.hoyoverse.com/ja/" target="_blank" rel="noopener noreferrer"><strong>原神 公式サイト</strong><span>ゲームの公式情報とお知らせ</span></a><a class="info-link-card" href="https://hsr.hoyoverse.com/ja-jp/" target="_blank" rel="noopener noreferrer"><strong>崩壊：スターレイル 公式サイト</strong><span>ゲームの公式情報とお知らせ</span></a></div></section>
      <section class="teti-panel"><h2>プロフィール取得サービス</h2><div class="info-link-grid"><a class="info-link-card" href="https://enka.network/" target="_blank" rel="noopener noreferrer"><strong>Enka.Network</strong><span>原神の公開プロフィール取得に利用</span></a><a class="info-link-card" href="https://github.com/Mar-7th/StarRailScore" target="_blank" rel="noopener noreferrer"><strong>MiHoMo関連情報</strong><span>スターレイルの公開プロフィール取得機能で利用</span></a></div></section>
      <section class="teti-panel"><h2>参照について</h2><p>外部情報は計算ロジックを検討する際の参考として利用しています。本サイトの実装や解説が各リンク先によって保証されているわけではありません。具体的な計算前提は<a href="/games/formula/">計算式ページ</a>に掲載します。</p></section>`,
  },
  "/sitemap": {
    title: "サイトマップ",
    description: "tetinet内の計算ツール、ガイド、運営情報ページの一覧です。",
    kicker: "Sitemap",
    lead: "目的のツールや案内ページを一覧から探せます。",
    content: `
      <section class="teti-panel"><h2>計算ツール</h2><div class="info-link-grid"><a class="info-link-card" href="/games/"><strong>ゲームツール一覧</strong><span>公開中のツール一覧</span></a><a class="info-link-card" href="/games/genshin/"><strong>原神ダメージ計算</strong><span>キャラクター・武器・聖遺物・反応を指定</span></a><a class="info-link-card" href="/games/hsr/"><strong>崩壊：スターレイル ダメージ計算</strong><span>防御・耐性・靭性補正に対応</span></a></div></section>
      <section class="teti-panel"><h2>解説・データ</h2><div class="info-link-grid"><a class="info-link-card" href="/guides/"><strong>使い方ガイド</strong><span>各ツールの基本操作</span></a><a class="info-link-card" href="/games/formula/"><strong>計算式</strong><span>補正項目と計算前提</span></a><a class="info-link-card" href="/games/enemies/"><strong>敵キャラ情報</strong><span>耐性や防御条件の参考値</span></a><a class="info-link-card" href="/faq/"><strong>よくある質問</strong><span>計算結果とUID取得の疑問</span></a></div></section>
      <section class="teti-panel"><h2>サイト情報</h2><div class="info-link-grid"><a class="info-link-card" href="/about/"><strong>このサイトについて</strong></a><a class="info-link-card" href="/updates/"><strong>更新履歴</strong></a><a class="info-link-card" href="/contact/"><strong>お問い合わせ</strong></a><a class="info-link-card" href="/privacy/"><strong>プライバシーポリシー</strong></a><a class="info-link-card" href="/terms/"><strong>利用条件・免責事項</strong></a><a class="info-link-card" href="/links/"><strong>参考リンク・データ出典</strong></a></div></section>`,
  },
};

const LEGACY_REDIRECTS = new Map([
  ["/hsr.html", "/games/hsr/"],
  ["/formula.html", "/games/formula/"],
  ["/enemies.html", "/games/enemies/"],
  ["/privacy.html", "/privacy/"],
  ["/games/privacy/", "/privacy/"],
  ["/granblue/granblue.html", "/games/gbf/"],
  ["/games/granblue/", "/games/gbf/"],
  ["/api/hsr-profile", HSR_PROFILE_API_PATH],
  ["/api/genshin-profile", GENSHIN_PROFILE_API_PATH],
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/ads.txt") {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/robots.txt" || url.pathname === "/sitemap.xml") {
      return env.ASSETS.fetch(request);
    }

    const normalizedRootSection = url.pathname.endsWith("/")
      ? url.pathname.slice(0, -1)
      : url.pathname;
    if (ROOT_STATIC_SECTIONS.has(normalizedRootSection)) {
      if (!url.pathname.endsWith("/")) {
        return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
      }
      return env.ASSETS.fetch(request);
    }

    const legacyRedirect = LEGACY_REDIRECTS.get(url.pathname);
    if (legacyRedirect) {
      return Response.redirect(`${url.origin}${legacyRedirect}${url.search}`, 301);
    }
    
    if (url.pathname === HSR_PROFILE_API_PATH) {
      return fetchHsrProfile(url);
    }

    if (url.pathname === GENSHIN_PROFILE_API_PATH) {
      return fetchGenshinProfile(url);
    }

    if (url.pathname === GAMES_PREFIX) {
      return Response.redirect(`${url.origin}/games/`, 301);
    }

    if (url.pathname.startsWith(`${GAMES_PREFIX}/`)) {
      return fetchGameAsset(request, env, url);
    }

    return new Response("Not found", { status: 404 });
  },
};

async function fetchHsrProfile(url) {
  const uid = (url.searchParams.get("uid") || "").trim();

  if (!/^\d{8,10}$/.test(uid)) {
    return json({ message: "UID is invalid" }, 400);
  }

  const upstreamUrl = `https://api.mihomo.me/sr_info_parsed/${encodeURIComponent(uid)}?lang=jp`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "tetinet-damage-tool/1.0",
      },
    });
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return json({ message: "Upstream request failed" }, 502);
  }
}

async function fetchGenshinProfile(url) {
  const uid = (url.searchParams.get("uid") || "").trim();

  if (!/^\d{8,10}$/.test(uid)) {
    return json({ message: "UID is invalid" }, 400);
  }

  const upstreamUrl = `https://enka.network/api/uid/${encodeURIComponent(uid)}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "tetinet-damage-tool/1.0",
      },
    });
    const body = await upstream.text();
    const ttlSeconds = readTtlSeconds(body);

    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": upstream.ok && ttlSeconds > 0 ? `public, max-age=${Math.min(ttlSeconds, 3600)}` : "no-store",
      },
    });
  } catch (error) {
    return json({ message: "Upstream request failed" }, 502);
  }
}

function readTtlSeconds(body) {
  try {
    const data = JSON.parse(body);
    const ttl = Number(data?.ttl);
    return Number.isFinite(ttl) ? Math.max(0, ttl) : 0;
  } catch (error) {
    return 0;
  }
}

function fetchGameAsset(request, env, url) {
  return env.ASSETS.fetch(request);
}

function fetchAssetPath(request, env, pathname) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = pathname;

  return env.ASSETS.fetch(new Request(assetUrl, request));
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function renderInfoPage(pathname, origin) {
  const page = INFO_PAGES[pathname];
  if (!page) return new Response("Not found", { status: 404 });
  const canonical = `${origin}${pathname}/`;
  return new Response(`<!DOCTYPE html>
<html lang="ja"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title}｜tetinet</title><meta name="description" content="${page.description}">
  <link rel="canonical" href="${canonical}"><link rel="stylesheet" href="/games/css/tetinet.css"><link rel="stylesheet" href="/games/css/info-pages.css">
  <link rel="icon" href="/games/images/icon/tetinet.ico"><script src="/games/js/theme.js"></script>
</head><body class="tetinet-page info-page"><div id="wrapper" style="display:block">
<header class="teti-site-header"><div class="teti-container teti-header-inner"><a class="teti-brand" href="/" aria-label="tetinet ホーム"><img src="/games/images/logo/tetinet_icon_purple_orange.webp" alt="" width="40" height="40"><span>tetinet</span></a><nav class="teti-nav" aria-label="メインナビゲーション"><a href="/">ホーム</a><a href="/games/">ゲーム</a><a href="/guides/">ガイド</a><a href="/about/">このサイトについて</a></nav><button class="teti-theme-toggle" type="button" data-theme-toggle aria-label="テーマを切り替える"><span class="theme-moon" aria-hidden="true">☾</span><span class="theme-sun" aria-hidden="true">☀</span></button></div></header>
<main class="teti-main teti-tool-main info-layout"><div class="teti-container"><nav class="teti-breadcrumb" aria-label="パンくず"><a href="/">ホーム</a><span>${page.title}</span></nav><section class="teti-page-header"><div><p class="teti-page-kicker">${page.kicker}</p><h1>${page.title}</h1><p>${page.lead}</p></div></section><div class="info-content">${page.content}</div></div></main>
<footer class="teti-site-footer"><div class="teti-container"><div class="teti-footer-grid"><div class="teti-footer-col"><div class="teti-footer-brand"><img src="/games/images/logo/tetinet_icon_white.webp" alt="" width="34" height="34"><span>tetinet</span></div><p>ゲーム・ツール・個人制作物をまとめるサイト。</p><div class="teti-social-links"><a href="https://x.com/tetinet_jp" target="_blank" rel="noopener noreferrer" aria-label="Xでtetinet_jpを開く">X</a></div></div><div class="teti-footer-col"><h3>コンテンツ</h3><a href="/">ホーム</a><a href="/games/">ゲーム・ツール一覧</a><a href="/about/">このサイトについて</a></div><div class="teti-footer-col"><h3>サポート</h3><a href="/guides/">使い方ガイド</a><a href="/updates/">更新履歴</a><a href="/faq/">よくある質問</a><a href="/contact/">お問い合わせ</a></div><div class="teti-footer-col"><h3>その他</h3><a href="/terms/">利用条件・免責事項</a><a href="/privacy/">プライバシーポリシー</a><a href="/links/">参考リンク</a><a href="/sitemap/">サイトマップ</a></div></div><div class="teti-footer-bottom">© 2026 tetinet. All rights reserved.</div></div></footer>
</div></body></html>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}

function renderTetinetHome() {
  return new Response(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>tetinet - ゲーム・ツール・個人制作物をまとめるサイト</title>
  <meta name="description" content="tetinetはゲームの便利ツールや個人制作物をまとめるサイトです。原神、崩壊：スターレイル、グラブル関連ツールへの入口を整理しています。">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@700;800;900&family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/games/css/tetinet.css">
  <link rel="icon" href="/games/images/icon/te_maru.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="/games/images/icon/te_maru.ico">
  <script src="/games/js/theme.js"></script>
</head>
<body class="tetinet-page">
  <header class="teti-site-header">
    <div class="teti-container teti-header-inner">
      <a class="teti-brand" href="/" aria-label="tetinet ホーム">
        <img src="/games/images/logo/tetinet_icon_purple_orange.webp" alt="" width="40" height="40">
        <span>tetinet</span>
      </a>
      <nav class="teti-nav" aria-label="メインナビゲーション">
        <a href="/" aria-current="page">ホーム</a>
        <a href="/games/">ゲーム</a>
        <a href="/games/">ツール</a>
        <a href="#about">このサイトについて</a>
      </nav>
      <button class="teti-theme-toggle" type="button" data-theme-toggle aria-label="テーマを切り替える">
        <span class="theme-moon" aria-hidden="true">moon</span>
        <span class="theme-sun" aria-hidden="true">sun</span>
      </button>
    </div>
  </header>

  <main class="teti-main">
    <section class="teti-hero">
      <div class="teti-container teti-hero-content">
        <div class="teti-hero-logo">
          <img src="/games/images/logo/tetinet_icon_white.webp" alt="" width="96" height="96">
          <h1>tetinet</h1>
        </div>
        <p>ゲーム・ツール・個人制作物をまとめるサイト。原神・崩壊：スターレイルなどのダメージ計算ツールや、ゲームに役立つ情報をわかりやすく整理しています。</p>
        <div class="teti-actions">
          <a class="teti-button teti-button-primary" href="/games/">ゲームツール一覧を見る <span aria-hidden="true">-&gt;</span></a>
          <a class="teti-button teti-button-secondary" href="#about">このサイトについて</a>
        </div>
      </div>
    </section>

    <section class="teti-section">
      <div class="teti-container">
        <div class="teti-section-header">
          <div>
            <h2>よく使う入口</h2>
            <p class="teti-muted">サイト全体の主なカテゴリへ移動できます。</p>
          </div>
          <a class="teti-button teti-button-secondary" href="/games/">すべて見る</a>
        </div>
        <div class="teti-grid teti-grid-3">
          <a class="teti-card teti-feature-card" href="/games/">
            <span class="teti-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M7 14h2v-2h2v-2H9V8H7v2H5v2h2v2Zm10-1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-3 3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM6.4 5h11.2c1.7 0 3 1.3 3.2 3l.7 6.2c.2 2-1.3 3.8-3.3 3.8-.9 0-1.7-.4-2.3-1l-1.1-1H9.2l-1.1 1c-.6.6-1.4 1-2.3 1-2 0-3.5-1.8-3.3-3.8L3.2 8c.2-1.7 1.5-3 3.2-3Z"/></svg>
            </span>
            <div class="teti-card-body">
              <h3>ゲームツール</h3>
              <p>各ゲームのダメージ計算や便利ツールをまとめています。</p>
              <span class="teti-text-link">ツール一覧へ <span aria-hidden="true">-&gt;</span></span>
            </div>
          </a>
          <a class="teti-card teti-feature-card" href="/games/formula/">
            <span class="teti-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 4v3h8V7H8Zm0 6v2h2v-2H8Zm4 0v2h4v-2h-4Zm-4 4v2h2v-2H8Zm4 0v2h4v-2h-4Z"/></svg>
            </span>
            <div class="teti-card-body">
              <h3>計算式・データ</h3>
              <p>ダメージ計算式や敵データなど、参考情報を公開しています。</p>
              <span class="teti-text-link">データを見る <span aria-hidden="true">-&gt;</span></span>
            </div>
          </a>
          <a class="teti-card teti-feature-card" href="#about">
            <span class="teti-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M8.7 16.6 4.1 12l4.6-4.6 1.4 1.4L6.9 12l3.2 3.2-1.4 1.4Zm6.6 0-1.4-1.4 3.2-3.2-3.2-3.2 1.4-1.4 4.6 4.6-4.6 4.6ZM11.2 19l-1.9-.6L12.8 5l1.9.6L11.2 19Z"/></svg>
            </span>
            <div class="teti-card-body">
              <h3>個人制作・開発</h3>
              <p>制作ツールや開発メモなど、個人制作の取り組みを紹介します。</p>
              <span class="teti-text-link">制作物を見る <span aria-hidden="true">-&gt;</span></span>
            </div>
          </a>
        </div>
      </div>
    </section>

    <section class="teti-section teti-section-compact" id="about">
      <div class="teti-container">
        <div class="teti-notice">
          <strong>お知らせ</strong>
          <p>サイトをリニューアルしました。新しいゲームツールやデータを順次追加していきます。</p>
        </div>
      </div>
    </section>
  </main>

  <footer class="teti-site-footer">
    <div class="teti-container">
      <div class="teti-footer-grid">
        <div class="teti-footer-col">
          <div class="teti-footer-brand">
            <img src="/games/images/logo/tetinet_icon_white.webp" alt="" width="34" height="34">
            <span>tetinet</span>
          </div>
          <p>ゲーム・ツール・個人制作物をまとめるサイト。</p>
          <div class="teti-social-links">
            <a href="https://x.com/tetinet_jp" target="_blank" rel="noopener noreferrer" aria-label="Xでtetinet_jpを開く">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 10.6 22 2h-1.7l-6.4 7.4L8.9 2H3l7.7 11.2L3 22h1.7l6.8-7.9 5.5 7.9h5.9l-8.2-11.4Zm-2.4 2.8-.8-1.1L5.4 3.3h2.7l4.9 7.2.8 1.1 6.4 9.2h-2.7l-5.2-7.4Z"/></svg>
            </a>
          </div>
        </div>
        <div class="teti-footer-col">
          <h3>コンテンツ</h3>
          <a href="/">ホーム</a>
          <a href="/games/">ゲーム一覧</a>
          <a href="/games/">ツール一覧</a>
          <a href="/#about">このサイトについて</a>
        </div>
        <div class="teti-footer-col">
          <h3>サポート</h3>
          <a href="/games/">使い方ガイド</a>
          <a href="/games/">更新履歴</a>
          <a href="/games/">よくある質問</a>
          <a href="/games/">お問い合わせ</a>
        </div>
        <div class="teti-footer-col">
          <h3>その他</h3>
          <a href="/games/privacy/">免責事項</a>
          <a href="/games/privacy/">プライバシーポリシー</a>
          <a href="/games/">リンク集</a>
          <a href="/games/">サイトマップ</a>
        </div>
      </div>
      <div class="teti-footer-bottom">© 2025 tetinet. All rights reserved.</div>
    </div>
  </footer>
</body>
</html>`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function renderHomePage() {
  return new Response(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>tetinet</title>
  <meta name="description" content="ゲーム・ツール・個人制作物をまとめるサイトです。">
  <link rel="stylesheet" href="/games/css/style.css">
  <link rel="stylesheet" href="/games/css/menu.css">
  <link rel="icon" href="/games/images/icon/te_maru.ico">
</head>
<body class="site-home theme-home">
  <div class="home-shell">
    <header class="home-header">
      <a class="home-logo" href="/">tetinet</a>
      <nav class="home-nav" aria-label="メインメニュー">
        <a href="/games/">ゲーム</a>
        <a href="/games/genshin/">原神</a>
        <a href="/games/hsr/">崩壊スターレイル</a>
        <a href="/games/gbf/">グラブル</a>
      </nav>
    </header>

    <main>
      <section class="home-hero">
        <div class="home-hero__content">
          <p class="home-kicker">Personal hub</p>
          <h1>tetinet</h1>
          <p class="home-lead">ゲーム・ツール・個人制作物をまとめるサイトです。よく使う計算ツールやデータページへ、ここからすぐ移動できます。</p>
          <div class="home-actions">
            <a class="home-primary-link" href="/games/">ゲームツールを見る</a>
            <a class="home-secondary-link" href="/games/privacy/">このサイトについて</a>
          </div>
        </div>
      </section>

      <section class="home-section" aria-labelledby="tools-heading">
        <div class="home-section-heading">
          <div>
            <p class="home-kicker">Tools</p>
            <h2 id="tools-heading">公開中のコンテンツ</h2>
          </div>
        </div>
        <div class="home-card-grid">
          <a class="home-card home-card--games" href="/games/">
            <span>Game Tools</span>
            <strong>ゲームツール</strong>
            <p>原神、崩壊スターレイル、グラブルなど、ゲーム別の便利ツールをまとめています。</p>
            <small>一覧を見る</small>
          </a>
          <a class="home-card home-card--formula" href="/games/formula/">
            <span>Formula & Data</span>
            <strong>計算式・データ</strong>
            <p>各ツールで使っている計算式や、補正項目の考え方を確認できます。</p>
            <small>参考情報を見る</small>
          </a>
          <a class="home-card home-card--future" href="/games/privacy/">
            <span>About</span>
            <strong>プライバシーポリシー</strong>
            <p>非公式ファンツールとしての注意事項、アクセス解析、UID取得機能についてまとめています。</p>
            <small>確認する</small>
          </a>
        </div>
      </section>
    </main>

    <footer class="home-footer">
      <div>
        <strong>tetinet</strong>
        <p>ゲーム・ツール・個人制作物を少しずつまとめています。</p>
      </div>
      <nav aria-label="フッター">
        <a href="/games/">ゲーム</a>
        <a href="/games/formula/">計算式</a>
        <a href="/games/enemies/">敵キャラ情報</a>
        <a href="/games/privacy/">プライバシーポリシー</a>
      </nav>
    </footer>
  </div>
</body>
</html>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
