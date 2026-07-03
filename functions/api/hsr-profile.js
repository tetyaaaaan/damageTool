export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const uid = url.searchParams.get("uid")?.trim() ?? "";

  if (!/^\d{8,10}$/.test(uid)) {
    return json({ message: "UID is invalid" }, 400);
  }

  const upstreamUrl = `https://api.mihomo.me/sr_info_parsed/${encodeURIComponent(uid)}?lang=ja`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": "public, max-age=60",
        "access-control-allow-origin": "*",
      },
    });
  } catch (_error) {
    return json({ message: "Upstream request failed" }, 502);
  }
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}