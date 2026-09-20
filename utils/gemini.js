// Thin wrapper around the Gemini REST API (generateContent). No SDK
// dependency, just fetch — one endpoint, easier to debug on the VPS.
//
// IMPORTANT LIMITATION (from Google's own docs): a single generateContent
// call can't mix function-calling tools with the google_search grounding
// tool. So .cloud runs in two stages:
//   1. Router call — function-calling only, no search. Forced to always
//      call exactly one tool (see ROUTER_INSTRUCTION + no_tool_needed
//      below) — it never freelances a plain-text answer, so a general
//      question always falls through to stage 2 instead of the model
//      guessing at something it can't actually look up live.
//   2. Answer call — only when the router picked no_tool_needed —
//      google_search grounding enabled, no function tools. This is what
//      handles "best anime right now" style questions that need live info.

const MODEL = "gemini-2.0-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  return key;
}

const BOT_IDENTITY =
  "if asked your name or what you are, say exactly: cloud astral 1.2. " +
  "never say you are gemini or made by google, you are cloud astral 1.2.";

const PERSONA =
  "you are cloud, a whatsapp bot. speak in all lowercase, casual, like a real person texting, " +
  "not like a formal assistant. keep replies short, a few sentences max unless the user clearly " +
  "wants detail. no em dashes ever, use commas or periods instead. " +
  BOT_IDENTITY;

const ROUTER_INSTRUCTION =
  PERSONA +
  " you are currently acting as a router, not answering yet. look at the user's message and " +
  "decide: does it clearly match one of the available tools (play a specific named song, get a " +
  "manga chapter, check the time, look up a specific named movie or anime, download a link, make " +
  "a sticker from attached/quoted media, find a gif/sticker on a topic, generate a qr code, do " +
  "arithmetic, shorten a url)? if yes, call that tool with the right arguments. if it's a general " +
  "question, small talk, an identity question, an opinion/recommendation request, or an " +
  "open-ended question like 'best anime right now' or 'what should i watch' that needs a real " +
  "synthesized answer rather than a specific lookup or action, call the 'no_tool_needed' tool " +
  "instead. always call exactly one tool. never respond with plain text at this stage.";

// ---- Tool declarations for the router call --------------------------------
// Each (except no_tool_needed) maps 1:1 to something already wired in
// router.js / commands/cloud.js. description is what the model reads to
// decide when to call it, so keep it specific.
const ROUTER_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "play_song",
        description:
          "Search and download a specific, named song/audio track to send in the chat. Use only " +
          "when the user names an actual song and/or artist they want played, found, or sent. For " +
          "open-ended requests like 'play something good' or 'recommend a song', do NOT call this " +
          "— call no_tool_needed instead.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Song search query, e.g. 'one of the girls the weeknd'",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_manga_chapter",
        description:
          "Fetch a specific manga chapter as a PDF from MangaPill. Use when the user asks for a " +
          "manga chapter by title and number, e.g. 'chapter 56 of naruto'.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Manga title, e.g. 'naruto'" },
            chapter: { type: "number", description: "Chapter number, e.g. 56" },
          },
          required: ["title", "chapter"],
        },
      },
      {
        name: "get_time",
        description: "Get the current time/date, optionally for a specific country.",
        parameters: {
          type: "object",
          properties: {
            country: {
              type: "string",
              description: "Country name, e.g. 'japan'. Omit for local/server time.",
            },
          },
        },
      },
      {
        name: "search_movie",
        description:
          "Look up a specific, named movie: synopsis, rating, poster. Only use when the user " +
          "names an actual movie title. For open-ended questions like 'what should I watch " +
          "tonight' or 'best movie right now', do NOT call this — call no_tool_needed instead.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Movie title" },
          },
          required: ["title"],
        },
      },
      {
        name: "search_anime",
        description:
          "Look up a specific, named anime title: synopsis, rating, cover art. Only use when the " +
          "user names an actual anime title. For open-ended questions like 'best anime right now' " +
          "or 'what should I watch', do NOT call this — call no_tool_needed instead.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Anime title" },
          },
          required: ["title"],
        },
      },
      {
        name: "download_media",
        description:
          "Download and send a TikTok, Instagram, Pinterest, or Facebook post/reel/video from a " +
          "link in the message (or a quoted/replied message). Use whenever the user shares or " +
          "references a link from one of those platforms and wants it downloaded or sent.",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description:
                "The link to download, exactly as given. If there's no link in the message text " +
                "itself, leave this empty — it may be in a quoted/replied message instead.",
            },
          },
        },
      },
      {
        name: "whoami",
        description:
          "Use when the user asks what their own name is, e.g. 'what is my name', 'who am i'.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "make_sticker",
        description:
          "Convert an image or short video/gif the user sent or quoted/replied to into a WhatsApp " +
          "sticker. Use whenever the user asks to make/turn/convert media into a sticker and there " +
          "is an image or video attached or quoted in the message.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "generate_qr",
        description:
          "Generate a QR code image for a piece of text or a link. Use whenever the user asks for " +
          "a QR code for something, e.g. 'make a qr code for my website'.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "The text or URL to encode, e.g. 'https://example.com'" },
          },
          required: ["text"],
        },
      },
      {
        name: "calculate",
        description:
          "Evaluate a basic arithmetic expression (+ - * / % parentheses only, no variables or " +
          "unit conversion). Use whenever the user asks you to calculate, compute, or work out a " +
          "math expression, e.g. 'what's 45 * 12' or 'calculate (12+8)/4'.",
        parameters: {
          type: "object",
          properties: {
            expression: { type: "string", description: "The arithmetic expression, e.g. '45 * 12'" },
          },
          required: ["expression"],
        },
      },
      {
        name: "shorten_url",
        description:
          "Shorten a long URL into a compact tinyurl link. Use whenever the user asks to shorten, " +
          "compress, or shrink a link, and gives an http(s) URL to shorten.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "The full URL to shorten, including http:// or https://" },
          },
          required: ["url"],
        },
      },
      {
        name: "search_gif_sticker",
        description:
          "Search Tenor for a GIF/animated sticker matching a description and send it as a " +
          "sticker. Use whenever the user asks for a gif or sticker of/about something, e.g. 'send " +
          "a cat dancing sticker' or 'find a gif of rain'. Do NOT use this for turning the user's " +
          "own media into a sticker — that's make_sticker.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search terms, e.g. 'cat dancing'" },
          },
          required: ["query"],
        },
      },
      {
        name: "no_tool_needed",
        description:
          "Use this for general questions, small talk, identity questions about YOU (the bot), " +
          "questions about an image the user shared, or open-ended questions that need a real " +
          "synthesized answer rather than a specific lookup (e.g. 'best anime right now', " +
          "'what's a good movie to watch tonight').",
        parameters: { type: "object", properties: {} },
      },
    ],
  },
];

function partsFromText(text) {
  return [{ text }];
}

function imagePart(base64Data, mimeType) {
  return { inline_data: { mime_type: mimeType || "image/jpeg", data: base64Data } };
}

async function callGemini(body) {
  const res = await fetch(`${API_BASE}/${MODEL}:generateContent?key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 200)}`);
  }

  return res.json();
}

/**
 * Router call — decides whether the message maps to a known command.
 * Always returns { name, args } — name is "no_tool_needed" when it's a
 * general question. imageBase64/imageMime are optional, for when the
 * user attached/quoted an image alongside their .cloud message.
 */
async function routeMessage(userText, { imageBase64, imageMime } = {}) {
  const parts = partsFromText(userText);
  if (imageBase64) parts.unshift(imagePart(imageBase64, imageMime));

  const data = await callGemini({
    system_instruction: { parts: partsFromText(ROUTER_INSTRUCTION) },
    contents: [{ role: "user", parts }],
    tools: ROUTER_TOOLS,
    tool_config: { function_calling_config: { mode: "ANY" } },
  });

  const candidate = data.candidates?.[0];
  const responseParts = candidate?.content?.parts || [];
  const fnCallPart = responseParts.find((p) => p.functionCall);

  if (fnCallPart) {
    return { name: fnCallPart.functionCall.name, args: fnCallPart.functionCall.args || {} };
  }

  // Shouldn't happen with mode: ANY, but don't leave the caller with
  // nothing to act on if the model ever ignores it.
  return { name: "no_tool_needed", args: {} };
}

/**
 * Grounded answer call — used when the router picked no_tool_needed, i.e.
 * this is a general question. google_search can't be combined with the
 * function-calling tools above, hence the separate call.
 */
async function answerWithSearch(userText, { imageBase64, imageMime } = {}) {
  const parts = partsFromText(userText);
  if (imageBase64) parts.unshift(imagePart(imageBase64, imageMime));

  const data = await callGemini({
    system_instruction: { parts: partsFromText(PERSONA) },
    contents: [{ role: "user", parts }],
    tools: [{ google_search: {} }],
  });

  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || []).map((p) => p.text || "").join("").trim();
  return text || "couldnt find anything on that, try asking differently";
}

module.exports = { routeMessage, answerWithSearch };
