// Fetch functions ported from the original plugin's upstream APIs
// (tikwm, api-faa.my.id) — same endpoints, adapted to native fetch + CommonJS.

const BROWSER_UA = "Mozilla/5.0";

async function getJson(url, params = {}, timeoutMs = 30000) {
  const query = new URLSearchParams(params).toString();
  const fullUrl = query ? `${url}?${query}` : url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(fullUrl, {
      headers: { "User-Agent": BROWSER_UA },
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTikTok(url) {
  const d = await getJson("https://tikwm.com/api/", { url });
  if (d.code !== 0 || !d.data) throw new Error(d.msg || "TikTok API error");
  return d.data.images?.length
    ? { type: "images", data: d.data.images }
    : { type: "video", data: d.data.play };
}

async function fetchInstagram(url) {
  const d = await getJson("https://api-faa.my.id/faa/igdl", { url });
  if (!d.status || !d.result?.url) throw new Error(d.message || "Instagram API error");
  return { urls: d.result.url, isVideo: d.result.metadata?.isVideo };
}

async function fetchPinterest(url) {
  const d = await getJson("https://api-faa.my.id/faa/pin-down", { url });
  if (!d.status || !d.result?.medias) throw new Error(d.message || "Pinterest API error");
  return d.result.medias;
}

async function fetchFacebook(url) {
  const d = await getJson("https://api-faa.my.id/faa/fbdownload", { url });
  if (!d.status || !d.result?.media) throw new Error(d.message || "Facebook API error");
  return d.result.media;
}

module.exports = { fetchTikTok, fetchInstagram, fetchPinterest, fetchFacebook };
