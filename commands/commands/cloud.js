const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { routeMessage, answerWithSearch } = require("../utils/gemini");
const { getQuotedMedia } = require("../utils/quotedMessage");
const { playSong } = require("./downloaders/play");
const { downloadAuto } = require("./downloaders/media");
const { movieSearch } = require("./movie");
const { animeSearch } = require("./anime");
const { getTime, getTimeForCountry } = require("./datetime");
const {
  searchMangaPill,
  fetchSeriesInfo,
  fetchChapterImages,
  buildPDF,
} = require("./mangapill");
const { makeSticker } = require("./sticker");
const { generateQr } = require("./qr");
const { calculate } = require("./calc");
const { shortenUrl } = require("./shorten");
const { tenorSticker } = require("./tenor");

// If the user quoted an image, or sent .cloud as a caption directly on an
// image, grab it as base64 so it can go to Gemini as vision input.
async function extractImage(msg) {
  const directImg = msg.message?.imageMessage;
  if (directImg) {
    try {
      const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: undefined });
      return { base64: buffer.toString("base64"), mime: directImg.mimetype || "image/jpeg" };
    } catch {
      return null;
    }
  }

  const quotedMedia = getQuotedMedia(msg);
  const quotedImg = quotedMedia?.targetMsg?.message?.imageMessage;
  if (quotedMedia && quotedImg) {
    try {
      const buffer = await downloadMediaMessage(quotedMedia.targetMsg, "buffer", {}, { logger: undefined });
      return { base64: buffer.toString("base64"), mime: quotedImg.mimetype || "image/jpeg" };
    } catch {
      return null;
    }
  }

  return null;
}

// Grabs one chapter's images and turns them into a PDF, without going
// through mangapill.js's interactive search -> pick session flow (the
// chapter number is already known from the sentence).
async function getMangaChapter(title, chapterNum) {
  const results = await searchMangaPill(title);
  if (!results.length) throw new Error(`no manga found for "${title}"`);

  const series = await fetchSeriesInfo(results[0].url);
  const chapter = series.chapters.find((c) => c.number === Number(chapterNum));
  if (!chapter) {
    throw new Error(
      `couldnt find chapter ${chapterNum} of ${series.title}. it has ${series.chapters.length} chapters.`
    );
  }

  const images = await fetchChapterImages(chapter.url);
  if (!images.length) throw new Error(`no pages found for that chapter, site might be down`);

  const pdfBuffer = await buildPDF(images, chapter.url);
  return {
    document: pdfBuffer,
    mimetype: "application/pdf",
    fileName: `${series.title} - Chapter ${chapterNum}.pdf`.replace(/[\\/:*?"<>|]/g, "_"),
    caption: `📖 ${series.title} — chapter ${chapterNum}`,
  };
}

// Runs the tool the router picked, and returns whatever shape router.js's
// existing send logic already knows how to handle (text / image+caption /
// audio / document).
async function runTool(name, args, msg) {
  switch (name) {
    case "get_manga_chapter":
      return getMangaChapter(args.title, args.chapter);

    case "get_time":
      return { text: args.country ? getTimeForCountry(args.country) : getTime() };

    case "search_movie": {
      const result = await movieSearch(args.title);
      return typeof result === "string" ? { text: result } : result;
    }

    case "search_anime": {
      const result = await animeSearch(args.title);
      return typeof result === "string" ? { text: result } : result;
    }

    case "whoami": {
      const pushName = msg.pushName;
      return { text: pushName ? `your name's ${pushName}, at least thats what whatsapp told me` : `idk, whatsapp didnt give me a name for you` };
    }

    case "make_sticker": {
      const { buffer, error } = await makeSticker(sock, msg);
      return error ? { text: error } : { sticker: buffer };
    }

    case "generate_qr": {
      const { buffer, error } = await generateQr(args.text || "");
      return error ? { text: error } : { image: buffer, caption: "📱 here's your qr code" };
    }

    case "calculate": {
      return { text: calculate(args.expression || "") };
    }

    case "shorten_url": {
      return { text: await shortenUrl(args.url || "") };
    }

    default:
      return null;
  }
}

/**
 * .cloud <message> — natural-language entry point. Routes to an existing
 * command via Gemini function calling, or falls back to a grounded
 * (google_search) answer for general questions. Returns a Baileys-message
 * shaped object for router.js to send, same convention as the other
 * commands (text / image+caption / audio / document).
 */
async function cmdCloud(sock, msg, argText) {
  const query = (argText || "").trim();
  if (!query) return { text: "usage: .cloud <ask me anything>" };

  let image;
  try {
    image = await extractImage(msg);
  } catch {
    image = null;
  }

  let routed;
  try {
    routed = await routeMessage(query, {
      imageBase64: image?.base64,
      imageMime: image?.mime,
    });
  } catch (err) {
    return { text: `⚠️ cloud brain isnt working right now: ${err.message}` };
  }

  const { name, args } = routed;

  // General question / small talk / identity — needs a real answer, not a
  // tool. Grounded with google_search so stuff like "best anime right now"
  // gets live info instead of a stale guess.
  if (name === "no_tool_needed") {
    try {
      const answer = await answerWithSearch(query, {
        imageBase64: image?.base64,
        imageMime: image?.mime,
      });
      return { text: answer };
    } catch (err) {
      return { text: `⚠️ cloud brain isnt working right now: ${err.message}` };
    }
  }

  // play_song needs to send its own "searching / found" status updates
  // (it already does this internally), so call it directly here instead
  // of through runTool.
  if (name === "play_song") {
    return playSong(sock, msg, args.query);
  }

  // downloadAuto also sends its own message(s) on success (returns null),
  // or an error *string* (not an object) on failure — different shape
  // than everything else, so handle it here too.
  if (name === "download_media") {
    const err = await downloadAuto(sock, msg, args.url || "");
    return err ? { text: err } : null;
  }

  // tenorSticker sends its own sticker message(s) directly and only
  // returns something on failure (an error string) — same "handles its
  // own sending" convention as play_song/download_media above.
  if (name === "search_gif_sticker") {
    const err = await tenorSticker(sock, msg.key.remoteJid, msg, args.query || "");
    return err ? { text: err } : null;
  }

  try {
    const result = await runTool(name, args, msg);
    if (result) return result;
  } catch (err) {
    return { text: `⚠️ ${err.message || "that didnt work"}` };
  }

  return { text: "hm, not sure how to do that one yet." };
}

module.exports = { cmdCloud };
