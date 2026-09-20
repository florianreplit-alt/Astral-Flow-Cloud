const axios = require("axios");
const sharp = require("sharp");
const { applyStickerMeta } = require("../utils/stickerMeta");

const DEFAULT_COUNT = 10;
const MAX_COUNT = 20;

// Matches the UA used by pinterest-dl v1.1.2
const UA =
  "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36";

// ── Pinterest session ───────────────────────────────────
// Mirrors pinterest-dl v1.1.2's Api constructor: a cookie handshake plus
// the x-pinterest-pws-handler header, which Pinterest has required on
// search calls since 2025-03-07.
async function getPinterestSession() {
  const BASE = "https://www.pinterest.com";
  const res = await axios.get(BASE, {
    timeout: 15000,
    headers: { "User-Agent": UA },
  });

  const raw = res.headers["set-cookie"] || [];
  const cookieStr = raw.map((c) => c.split(";")[0]).join("; ");

  const csrfMatch = cookieStr.match(/csrftoken=([^;]+)/);
  const csrf = csrfMatch ? csrfMatch[1] : "";

  return { cookieStr, csrf };
}

function buildSearchUrl(query, pageSize, bookmarks) {
  const source_url = `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
  const options = {
    appliedProductFilters: "---",
    auto_correction_disabled: false,
    bookmarks,
    page_size: pageSize,
    query,
    redux_normalize_feed: true,
    rs: "typed",
    scope: "pins",
    source_url,
  };
  const data = JSON.stringify({ options, context: {} });

  const params = new URLSearchParams({
    source_url,
    data,
    _: String(Date.now()),
  })
    .toString()
    .replace(/\+/g, "%20");

  return `https://www.pinterest.com/resource/BaseSearchResource/get/?${params}`;
}

async function searchPinterest(query, want) {
  const { cookieStr, csrf } = await getPinterestSession();

  const headers = {
    "User-Agent": UA,
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`,
    "X-Requested-With": "XMLHttpRequest",
    "X-Pinterest-AppState": "active",
    "x-pinterest-pws-handler": "www/[username]/[slug].js",
    ...(csrf ? { "X-CSRFToken": csrf } : {}),
    Cookie: cookieStr,
  };

  const urls = [];
  let bookmarks = [];
  const batchSize = Math.min(50, want * 2);
  const maxPasses = 3;

  for (let pass = 0; pass < maxPasses && urls.length < want; pass++) {
    const requestUrl = buildSearchUrl(query, batchSize, bookmarks);

    let data;
    try {
      const res = await axios.get(requestUrl, { headers, timeout: 20000 });
      data = res.data;
    } catch (e) {
      const status = e?.response?.status;
      throw new Error(`Pinterest API error${status ? ` (HTTP ${status})` : ""}: ${e.message}`);
    }

    const resourceResponse = data?.resource_response;
    if (!resourceResponse) throw new Error("Pinterest returned unexpected response format");
    if (resourceResponse?.error) {
      const err = resourceResponse.error;
      throw new Error(`Pinterest API: ${err.message || JSON.stringify(err)}`);
    }

    const results = resourceResponse?.data?.results || [];
    if (!results.length) break;

    for (const pin of results) {
      const img = pin?.images?.orig || pin?.images?.["736x"] || pin?.images?.["474x"];
      if (!img?.url) continue;

      const ratio = (img.width || 1) / (img.height || 1);
      if (ratio > 2.0) continue;

      if (!urls.includes(img.url)) urls.push(img.url);
      if (urls.length >= want) break;
    }

    const nextBookmarks = data?.resource?.options?.bookmarks;
    if (!Array.isArray(nextBookmarks) || nextBookmarks.includes("-end-")) break;
    bookmarks = nextBookmarks.slice(-3);

    if (urls.length >= want) break;
  }

  if (urls.length < want) {
    const relaxPass = await relaxedSearch(query, want - urls.length, headers, urls);
    urls.push(...relaxPass);
  }

  if (!urls.length) throw new Error(`no Pinterest results for "${query}"`);
  return urls;
}

// Second pass without the aspect-ratio filter, used when the first pass
// didn't return enough sticker-friendly candidates.
async function relaxedSearch(query, stillNeed, headers, alreadyHave) {
  const extra = [];
  try {
    const requestUrl = buildSearchUrl(query, 50, []);
    const { data } = await axios.get(requestUrl, { headers, timeout: 20000 });
    const results = data?.resource_response?.data?.results || [];
    for (const pin of results) {
      const img = pin?.images?.orig || pin?.images?.["736x"] || pin?.images?.["474x"];
      if (!img?.url || alreadyHave.includes(img.url) || extra.includes(img.url)) continue;
      extra.push(img.url);
      if (extra.length >= stillNeed) break;
    }
  } catch {
    // best-effort relaxed pass; a failure here just means fewer stickers
  }
  return extra;
}

async function downloadImage(url) {
  const { data } = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: {
      "User-Agent": UA,
      Referer: "https://www.pinterest.com/",
      Accept: "image/webp,image/avif,image/*,*/*;q=0.8",
    },
  });
  return Buffer.from(data);
}

async function imageToSticker(buffer, packName, author) {
  const webpBuffer = await sharp(buffer)
    .resize(512, 512, { fit: "cover" })
    .webp()
    .toBuffer();
  return applyStickerMeta(webpBuffer, { pack: packName, author });
}

/**
 * .stickerpack <name> / .stickerpack <n> <name> — searches Pinterest for
 * `name` and sends up to `n` (default 10, max 20) results back as
 * individually-authored stickers. Progress is reported via a single
 * edited status message. Returns nothing on success (stickers are sent
 * directly); returns a string on failure/usage error.
 */
async function generateStickerPack(sock, msg, argText) {
  const from = msg.key.remoteJid;
  const args = argText.trim().split(/\s+/).filter(Boolean);

  if (!args.length) {
    return (
      "📎 *Usage:*\n" +
      ".stickerpack <name>\n" +
      ".stickerpack <count> <name>  (max 20)\n\n" +
      "_e.g. .stickerpack naruto_ or _.stickerpack 20 naruto_"
    );
  }

  let count = DEFAULT_COUNT;
  let nameParts = [...args];
  const maybeCount = parseInt(args[0]);
  if (!isNaN(maybeCount) && args.length > 1) {
    count = Math.min(Math.max(maybeCount, 1), MAX_COUNT);
    nameParts = args.slice(1);
  }

  const query = nameParts.join(" ").trim();
  const packName = query.charAt(0).toUpperCase() + query.slice(1) + " Sticker Pack";
  const author = "Astral Cloud";

  const statusMsg = await sock.sendMessage(
    from,
    { text: `🔍 *${packName}*\nSearching Pinterest for ${count} images…` },
    { quoted: msg }
  );
  const statusKey = statusMsg?.key;
  const edit = (text) =>
    statusKey && sock.sendMessage(from, { text, edit: statusKey }).catch(() => {});

  let imageUrls;
  try {
    imageUrls = await searchPinterest(query, count * 2);
  } catch (e) {
    await edit(`❌ *${packName}*\n${e.message}`);
    return null;
  }

  if (!imageUrls.length) {
    await edit(`❌ No images found for "${query}".`);
    return null;
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < imageUrls.length && sent < count; i++) {
    await edit(
      `📥 *${packName}*\n${sent}/${count}${failed ? `  ⚠️ ${failed} failed` : ""}`
    );
    try {
      const buffer = await downloadImage(imageUrls[i]);
      const sticker = await imageToSticker(buffer, packName, author);
      await sock.sendMessage(from, { sticker }, { quoted: msg });
      sent++;
    } catch (e) {
      failed++;
      console.warn("[stickerpack] skipped:", e.message);
    }
  }

  if (sent === 0) {
    await edit("❌ No images could be converted — try a different query.");
    return null;
  }

  await edit(
    `✅ *${packName}*\nSent ${sent} stickers` + (failed ? `  ⚠️ ${failed} failed` : "")
  );
  return null;
}

module.exports = { generateStickerPack };
