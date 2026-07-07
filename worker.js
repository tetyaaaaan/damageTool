const GAMES_PREFIX = "/games";
const HSR_PROFILE_API_PATH = "/games/api/hsr-profile";
const GENSHIN_PROFILE_API_PATH = "/games/api/genshin-profile";

const LEGACY_REDIRECTS = new Map([
  ["/hsr.html", "/games/hsr/"],
  ["/formula.html", "/games/formula/"],
  ["/enemies.html", "/games/enemies/"],
  ["/privacy.html", "/games/privacy/"],
  ["/granblue/granblue.html", "/games/granblue/"],
  ["/api/hsr-profile", HSR_PROFILE_API_PATH],
  ["/api/genshin-profile", GENSHIN_PROFILE_API_PATH],
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/home" || url.pathname === "/home/") {
      return Response.redirect(`${url.origin}/`, 301);
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
        <a href="/games/granblue/">グラブル</a>
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
