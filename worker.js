const GAMES_PREFIX = "/games";
const HSR_PROFILE_API_PATH = "/games/api/hsr-profile";
const GENSHIN_PROFILE_API_PATH = "/games/api/genshin-profile";
const ROOT_STATIC_SECTIONS = new Set([
  "/about", "/contact", "/guides", "/faq", "/updates",
  "/privacy", "/terms", "/links", "/sitemap",
]);

const LEGACY_REDIRECTS = new Map([
  ["/hsr.html", "/games/hsr/"],
  ["/formula.html", "/games/formula/"],
  ["/enemies.html", "/games/enemies/"],
  ["/privacy.html", "/privacy/"],
  ["/games/privacy", "/privacy/"],
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

    if (url.pathname.startsWith("/guides/")) {
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

  const upstreamUrl = `https://enka.network/api/hsr/uid/${encodeURIComponent(uid)}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "tetinet-damage-tool/1.0",
      },
    });
    const body = await upstream.text();

    if (upstream.ok) {
      const data = JSON.parse(body);
      const ttlSeconds = Math.max(0, Number(data?.ttl) || 0);
      return json({ ...data, _tetinetProvider: "enka" }, 200, ttlSeconds);
    }

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

function json(data, status, ttlSeconds = 0) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 && ttlSeconds > 0 ? `public, max-age=${Math.min(ttlSeconds, 300)}` : "no-store",
    },
  });
}
