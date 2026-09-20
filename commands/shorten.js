async function shortenUrl(url) {
  if (!url || !url.trim()) {
    return "⚠️ Usage: .shorten https://example.com/some/long/link";
  }

  const trimmed = url.trim();
  const looksLikeUrl = /^https?:\/\//i.test(trimmed);
  if (!looksLikeUrl) {
    return "⚠️ Please include http:// or https:// in the link.";
  }

  try {
    const res = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(trimmed)}`
    );

    if (!res.ok) {
      return "⚠️ Couldn't shorten that link right now. Try again shortly.";
    }

    const short = await res.text();
    return `🔗 *Shortened Link*\n${short}`;
  } catch {
    return "⚠️ Something went wrong reaching the shortener service.";
  }
}

module.exports = { shortenUrl };
