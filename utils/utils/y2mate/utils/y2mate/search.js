// youtubei.js is ESM-only; this bot is CommonJS, so we load it via dynamic import.

let youtubeModulePromise;
let cachedClient;

const YOUTUBE_ID_RE = /(?:v=|\/embed\/|\/shorts\/|youtu\.be\/|\/v\/)([-_0-9A-Za-z]{11})/;

function extractVideoId(input) {
  const value = String(input || "").trim();
  if (/^[-_0-9A-Za-z]{11}$/.test(value)) return value;
  return value.match(YOUTUBE_ID_RE)?.[1] || null;
}

function isYoutubeInput(input) {
  return /(?:youtube\.com|youtu\.be)/i.test(String(input || ""));
}

async function loadYoutubeModule() {
  if (!youtubeModulePromise) {
    youtubeModulePromise = import("youtubei.js").catch((err) => {
      youtubeModulePromise = null;
      throw err;
    });
  }
  return youtubeModulePromise;
}

async function getClient() {
  if (cachedClient) return cachedClient;
  const youtube = await loadYoutubeModule();
  cachedClient = await youtube.Innertube.create({
    cache: new youtube.UniversalCache(false),
    generate_session_locally: true,
  });
  return cachedClient;
}

async function searchYoutube(query) {
  const input = String(query || "").trim();
  const directId = extractVideoId(input);

  // Direct URL or bare video ID — skip search, just confirm it resolves.
  if (isYoutubeInput(input) && directId) {
    try {
      const client = await getClient();
      const info = await client.getBasicInfo(directId);
      return {
        id: directId,
        title: info.basic_info?.title || directId,
        thumbnail: info.basic_info?.thumbnail?.[0]?.url || null,
        author: info.basic_info?.author || "",
      };
    } catch {
      return { id: directId, title: directId, thumbnail: null, author: "" };
    }
  }

  const client = await getClient();
  const searchResults = (await client.search(input, { type: "video" })).results || [];
  const result = searchResults.find((entry) => entry.id && entry.title);
  if (!result) throw new Error("No YouTube result found for that search");

  return {
    id: result.id,
    title: result.title?.text || result.title || input,
    thumbnail: result.thumbnails?.[0]?.url || null,
    author: result.author?.name || "",
  };
}

module.exports = { searchYoutube, extractVideoId };
