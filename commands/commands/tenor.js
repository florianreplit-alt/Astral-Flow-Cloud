const { videoToAnimatedSticker } = require("../utils/animatedSticker");

const TENOR_KEY = "LIVDSRZULELA";
const USAGE = "📎 *Usage:* .tenor <search terms>[, count]\n_e.g. .tenor cat dancing_ or _.tenor cat dancing, 3_";

async function searchTenor(query, limit) {
  const params = new URLSearchParams({
    q: query,
    key: TENOR_KEY,
    limit: String(limit),
  });
  const res = await fetch(`https://g.tenor.com/v1/search?${params.toString()}`);
  if (!res.ok) throw new Error(`Tenor API error (${res.status})`);
  return res.json();
}

/**
 * .tenor <query>[, count] — searches Tenor and sends back animated stickers.
 * Sends each result as it's converted rather than waiting for all of them,
 * and skips individual failures instead of aborting the whole batch.
 */
async function tenorSticker(sock, from, msg, argText) {
  const input = (argText || "").trim();
  if (!input) return USAGE;

  const [rawQuery, rawLimit] = input.split(",");
  const query = rawQuery.trim();
  const limitNum = Number(rawLimit);
  const limit = rawLimit && !Number.isNaN(limitNum) ? Math.max(1, Math.min(limitNum, 10)) : 1;

  if (!query) return USAGE;

  let results;
  try {
    const data = await searchTenor(query, limit);
    results = data?.results || [];
  } catch (err) {
    return `❌ *Tenor search failed:* ${err.message || "unknown error"}`;
  }

  if (!results.length) return `❌ No Tenor results for "${query}".`;

  if (results.length > 1) {
    await sock.sendMessage(from, { text: `_Sending ${results.length} stickers from Tenor..._` }, { quoted: msg });
  }

  let sentAny = false;
  for (const r of results) {
    const mp4Url = r.media?.[0]?.mp4?.url;
    if (!mp4Url) continue;

    try {
      const webpBuffer = await videoToAnimatedSticker(mp4Url);
      await sock.sendMessage(from, { sticker: webpBuffer }, { quoted: msg });
      sentAny = true;
    } catch {
      // skip this result, try the next one
    }
  }

  if (!sentAny) return "❌ Couldn't convert any of those results to stickers.";
  return null;
}

module.exports = { tenorSticker };
