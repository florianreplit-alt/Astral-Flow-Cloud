// URL detection regexes for the four supported platforms.
const RE = {
  tt: /(?<!\S)https?:\/\/(www\.)?(vm\.|vt\.|m\.)?tiktok\.com\/[^\s]+/gi,
  ig: /https?:\/\/(www\.)?instagram\.com\/[^\s]+/gi,
  pin: /https?:\/\/(www\.)?(pinterest\.(com|fr|de|co\.uk|jp|ru|ca|it|com\.au|com\.mx|com\.br|es|pl)|pin\.it)\/[^\s]+/gi,
  fb: /(?<!\S)https?:\/\/(www\.|m\.|web\.)?facebook\.com\/[^\s]+/gi,
};

function cleanMatch(match) {
  return match?.[0]?.replace(/[.,!?]$/, "");
}

function detectPlatform(text) {
  if (!text) return null;

  let m = text.match(RE.tt);
  if (m) return { type: "tt", url: cleanMatch(m) };

  m = text.match(RE.ig);
  if (m && !cleanMatch(m).includes("/stories/")) return { type: "ig", url: cleanMatch(m) };

  m = text.match(RE.pin);
  if (m) return { type: "pin", url: cleanMatch(m) };

  m = text.match(RE.fb);
  if (m) {
    const url = cleanMatch(m);
    if (!url.includes("/login") && !url.includes("/dialog") && !url.includes("/plugins/")) {
      return { type: "fb", url };
    }
  }

  return null;
}

const PLATFORM_LABELS = {
  tt: "TikTok",
  ig: "Instagram",
  pin: "Pinterest",
  fb: "Facebook",
};

module.exports = { RE, detectPlatform, PLATFORM_LABELS };
