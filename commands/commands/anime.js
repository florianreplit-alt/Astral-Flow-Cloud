const ANILIST_URL = "https://graphql.anilist.co";

const SEARCH_QUERY = `
query ($search: String) {
  Media(search: $search, type: ANIME) {
    idMal
    title { userPreferred romaji english native }
    description(asHtml: false)
    averageScore
    format
    status
    episodes
    seasonYear
    genres
    coverImage { extraLarge large }
    siteUrl
  }
}
`;

// AniList descriptions come with HTML tags and <br> line breaks — strip and
// truncate to keep the WhatsApp caption short.
function cleanSynopsis(desc, maxLen = 300) {
  if (!desc) return "No synopsis available.";
  const plain = desc.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").trim();
  return plain.length > maxLen ? `${plain.slice(0, maxLen).trim()}…` : plain;
}

async function searchAnime(query) {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: query } }),
  });

  const data = await res.json();
  if (!res.ok || data.errors) {
    const notFound = data.errors?.some((e) => e.status === 404);
    throw new Error(notFound ? "No anime found with that title." : data.errors?.[0]?.message || `AniList API error (${res.status})`);
  }

  return data.data?.Media || null;
}

/**
 * .anime <title> — searches AniList and returns a poster image with a
 * caption: title, short synopsis, rating. Returns { image, caption } on
 * success, or a string error message on failure/no-match.
 */
async function animeSearch(argText) {
  const query = (argText || "").trim();
  if (!query) return "📎 *Usage:* .anime <title>\n_e.g. .anime Frieren_";

  let media;
  try {
    media = await searchAnime(query);
  } catch (err) {
    return `❌ ${err.message || "AniList search failed."}`;
  }

  if (!media) return `❌ No anime found for "${query}".`;

  const title = media.title.userPreferred || media.title.english || media.title.romaji || media.title.native;
  const score = media.averageScore ? `${media.averageScore}/100` : "N/A";
  const cover = media.coverImage?.extraLarge || media.coverImage?.large;
  const malLink = media.idMal ? `\n🔗 *MAL:* https://myanimelist.net/anime/${media.idMal}` : "";

  const caption =
    `🎬 *${title}*\n\n` +
    `${cleanSynopsis(media.description)}\n\n` +
    `⭐ *Rating:* ${score}${malLink}`;

  if (!cover) return caption;
  return { image: cover, caption };
}

module.exports = { animeSearch };
