const GAMES_PREFIX = "/games";
const HSR_PROFILE_API_PATH = "/games/api/hsr-profile";

const LEGACY_REDIRECTS = new Map([
  ["/hsr.html", "/games/hsr/"],
  ["/formula.html", "/games/formula/"],
  ["/enemies.html", "/games/enemies/"],
  ["/privacy.html", "/games/privacy/"],
  ["/api/hsr-profile", HSR_PROFILE_API_PATH],
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return renderHomePage();
    }

    const legacyRedirect = LEGACY_REDIRECTS.get(url.pathname);
    if (legacyRedirect) {
      return Response.redirect(`${url.origin}${legacyRedirect}${url.search}`, 301);
    }

    if (url.pathname === HSR_PROFILE_API_PATH) {
      return fetchHsrProfile(url);
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
      headers: { Accept: "application/json" },
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

function fetchGameAsset(request, env, url) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = url.pathname.slice(GAMES_PREFIX.length) || "/";

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
<body class="site-home">
  <div class="home-shell">
    <header class="home-header">
      <a class="home-logo" href="/">tetinet</a>
      <nav class="home-nav" aria-label="メインメニュー">
        <a href="/games/">ゲーム</a>
        <a href="/games/genshin/">原神</a>
        <a href="/games/hsr/">崩壊スターレイル</a>
        <a href="/games/privacy/">プライバシー</a>
      </nav>
    </header>
    <main>
      <section class="home-hero">
        <div class="home-hero__content">
          <p class="home-kicker">Personal hub</p>
          <h1>tetinet</h1>
          <p class="home-lead">ゲーム・ツール・個人制作物をまとめるサイトです。</p>
          <div class="home-actions">
            <a class="home-primary-link" href="/games/">ゲームツールを見る</a>
            <a class="home-secondary-link" href="/games/genshin/">原神ツールへ</a>
          </div>
        </div>
      </section>
      <section class="home-section" aria-labelledby="tools-heading">
        <div class="home-section-heading">
          <p class="home-kicker">Tools</p>
          <h2 id="tools-heading">公開中のツール</h2>
        </div>
        <div class="home-card-grid">
          <a class="home-card home-card--genshin" href="/games/genshin/">
            <span>Genshin Impact</span>
            <strong>原神 ダメージ計算</strong>
            <p>蒸発・溶解・激化などの条件を入力して、ダメージの目安を確認できます。</p>
            <small>開く</small>
          </a>
          <a class="home-card home-card--hsr" href="/games/hsr/">
            <span>Honkai: Star Rail</span>
            <strong>崩壊:スターレイル ダメージ計算</strong>
            <p>UID取得と手入力を組み合わせて、戦闘ステータスを確認できます。</p>
            <small>開く</small>
          </a>
          <a class="home-card" href="/games/">
            <span>Coming next</span>
            <strong>今後追加予定</strong>
            <p>ゲームや小さなWebツールを、ここから探せるように整理していきます。</p>
            <small>一覧へ</small>
          </a>
        </div>
      </section>
    </main>
  </div>
</body>
</html>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
