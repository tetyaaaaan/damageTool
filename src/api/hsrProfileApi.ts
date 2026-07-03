import type { HsrProfileApiResponse } from "../types/hsr";

const MIHOMO_ENDPOINT = "https://api.mihomo.me/sr_info_parsed";
const SAME_ORIGIN_PROXY_ENDPOINT = "./api/hsr-profile";

export async function fetchHsrProfile(uid: string): Promise<HsrProfileApiResponse> {
  const proxyResponse = await fetchFromSameOriginProxy(uid);
  if (proxyResponse) {
    return proxyResponse;
  }

  const response = await fetch(`${MIHOMO_ENDPOINT}/${encodeURIComponent(uid)}?lang=ja`, {
    method: "GET",
  });

  if (response.status === 404) {
    throw new Error("PROFILE_NOT_FOUND");
  }

  if (!response.ok) {
    throw new Error("PROFILE_UNAVAILABLE");
  }

  return response.json() as Promise<HsrProfileApiResponse>;
}

async function fetchFromSameOriginProxy(uid: string): Promise<HsrProfileApiResponse | null> {
  try {
    const response = await fetch(`${SAME_ORIGIN_PROXY_ENDPOINT}?uid=${encodeURIComponent(uid)}`, {
      method: "GET",
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(response.status === 400 ? "PROFILE_NOT_FOUND" : "PROFILE_UNAVAILABLE");
    }

    return response.json() as Promise<HsrProfileApiResponse>;
  } catch (error) {
    if (error instanceof TypeError) {
      return null;
    }
    throw error;
  }
}
