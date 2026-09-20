const OMDB_URL = "https://www.omdbapi.com/";

async function fetchOmdb(title) {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) throw new Error("OMDb API key not configured (set OMDB_API_KEY).");

  const params = new URLSearchParams({ apikey: apiKey, t: title, plot: "short" });
  const res = await fetch(`${OMDB_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`OMDb API error (${res.status})`);

  const data = await res.json();
  if (data.Response === "False") throw new Error(data.Error || "Movie not found.");

  return data;
}

/**
 * .movie <title> — searches OMDb and returns a poster image with a
 * caption: title, short synopsis, rating. Returns { image, caption } on
 * success, or a string error message on failure/no-match.
 */
async function movieSearch(argText) {
  const title = (argText || "").trim();
  if (!title) return "📎 *Usage:* .movie <title>\n_e.g. .movie The Matrix_";

  let data;
  try {
    data = await fetchOmdb(title);
  } catch (err) {
    return `❌ ${err.message || "OMDb search failed."}`;
  }

  const rating = data.imdbRating && data.imdbRating !== "N/A" ? `${data.imdbRating}/10` : "N/A";
  const year = data.Year ? ` (${data.Year})` : "";

  const caption =
    `🎬 *${data.Title}${year}*\n\n` +
    `${data.Plot && data.Plot !== "N/A" ? data.Plot : "No synopsis available."}\n\n` +
    `⭐ *IMDb Rating:* ${rating}`;

  if (!data.Poster || data.Poster === "N/A") return caption;
  return { image: data.Poster, caption };
}

module.exports = { movieSearch };
