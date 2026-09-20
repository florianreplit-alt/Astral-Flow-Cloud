const axios = require("axios");
const cheerio = require("cheerio");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");

const SITE = "https://mangapill.com";
const CDN = "cdn.readdetectiveconan.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: SITE + "/",
  "Cache-Control": "no-cache",
};

// Per-chat session store — tracks the currently loaded series so
// .pilldl/.pillinfo know what "it" refers to without re-searching.
const pillSessions = new Map();

// ── Search ───────────────────────────────────────────────
async function searchMangaPill(query) {
  const results = [];
  const seen = new Set();

  function parseLinks(html) {
    const $ = cheerio.load(html);
    $('a[href*="/manga/"]').each((_, el) => {
      const href = $(el).attr("href") || "";
      const m = href.match(/^\/manga\/(\d+)\/([^/?#]+)\/?$/);
      if (!m) return;
      const [, id, slug] = m;
      if (seen.has(id)) return;
      seen.add(id);
      const title =
        $(el).find("div, span, p").first().text().trim() ||
        $(el).attr("title") ||
        $(el).text().trim() ||
        slug.replace(/-/g, " ");
      const cover =
        $(el).find("img").attr("data-src") ||
        $(el).find("img").attr("src") ||
        `https://${CDN}/file/mangapill/i/${id}.jpeg`;
      results.push({
        id,
        slug,
        title,
        url: `${SITE}/manga/${id}/${slug}`,
        cover: cover.startsWith("http") ? cover : `https://${CDN}/file/mangapill/i/${id}.jpeg`,
      });
    });
  }

  try {
    const res = await axios.get(`${SITE}/quick-search`, {
      params: { title: query },
      headers: { ...HEADERS, "X-Requested-With": "XMLHttpRequest" },
      timeout: 30000,
    });
    parseLinks(res.data);
  } catch (e) {
    console.warn("[mangapill] quick-search failed:", e.message);
  }

  if (!results.length) {
    try {
      const res = await axios.get(`${SITE}/search`, {
        params: { q: query },
        headers: HEADERS,
        timeout: 30000,
      });
      parseLinks(res.data);
    } catch (e) {
      console.warn("[mangapill] /search failed:", e.message);
    }
  }

  return results.slice(0, 20);
}

// ── Series info + chapter list ──────────────────────────
async function fetchSeriesInfo(seriesUrl) {
  const res = await axios.get(seriesUrl, { headers: HEADERS, timeout: 45000 });
  const $ = cheerio.load(res.data);

  const title =
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.replace(/\s*[-|].*$/, "").trim() ||
    "Unknown";
  const status = $('[class*="status" i]').first().text().trim() || "";
  const genres = [];
  $('a[href*="/search?genre"]').each((_, el) => {
    const g = $(el).text().trim();
    if (g && !genres.includes(g)) genres.push(g);
  });

  const mangaId = seriesUrl.match(/\/manga\/(\d+)\//)?.[1] || "";
  const coverImg =
    $('img[src*="mangapill"]').first().attr("src") ||
    $('img[data-src*="mangapill"]').first().attr("data-src") ||
    (mangaId ? `https://${CDN}/file/mangapill/i/${mangaId}.jpeg` : "");

  const chapters = [];
  const seen = new Set();
  $('a[href*="/chapters/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/\/chapters\/(\d+)-(\d+)\/([^/?#]+)\/?$/);
    if (!m) return;
    const [, chapMangaId, numCode, chapSlug] = m;
    if (seen.has(numCode)) return;
    seen.add(numCode);

    // Decode chapter number: numCode = 10000000 + chapterNum * 1000
    const number = (parseInt(numCode) - 10000000) / 1000;
    const label = $(el).text().trim() || `Chapter ${number}`;

    chapters.push({
      number,
      numCode,
      slug: chapSlug,
      title: label,
      url: `${SITE}/chapters/${chapMangaId}-${numCode}/${chapSlug}`,
    });
  });

  chapters.sort((a, b) => a.number - b.number);

  return { title, cover: coverImg, status, genres: genres.slice(0, 5), chapters, url: seriesUrl };
}

// ── Chapter image fetching ──────────────────────────────
async function fetchChapterImages(chapterUrl) {
  const res = await axios.get(chapterUrl, {
    headers: { ...HEADERS, Referer: chapterUrl },
    timeout: 45000,
  });
  const html = res.data;
  const $ = cheerio.load(html);
  const imgs = [];
  const seen = new Set();

  function addImg(url) {
    if (!url || seen.has(url)) return;
    url = url.replace(/([^:])\/\/+/g, "$1/");
    if (!url.startsWith("http")) return;
    seen.add(url);
    imgs.push(url);
  }

  $("img[data-src]").each((_, el) => {
    const src = $(el).attr("data-src") || "";
    if (src.includes(CDN) || src.includes("mangapill")) addImg(src);
  });

  if (!imgs.length) {
    $("img[src]").each((_, el) => {
      const src = $(el).attr("src") || "";
      if ((src.includes(CDN) || src.includes("mangapill")) && !src.includes("favicon") && !src.includes("logo")) {
        addImg(src);
      }
    });
  }

  if (!imgs.length) {
    const re = new RegExp(`https://${CDN}/[^"'\\s>)]+`, "g");
    let m;
    while ((m = re.exec(html)) !== null) {
      const url = m[0].replace(/&amp;/g, "&");
      if (!url.includes("/i/") && !url.includes("favicon") && !url.includes("logo")) {
        addImg(url);
      }
    }
  }

  imgs.sort((a, b) => {
    const na = parseInt(a.match(/\/(\d+)\.[a-z]+(?:\?|$)/i)?.[1] || "0");
    const nb = parseInt(b.match(/\/(\d+)\.[a-z]+(?:\?|$)/i)?.[1] || "0");
    return na - nb;
  });

  return imgs;
}

// ── Image download + PDF builder ────────────────────────
async function downloadImageAsJpeg(imgUrl, chapterUrl) {
  const referer = chapterUrl || SITE + "/";
  let buffer, ctype;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.get(imgUrl, {
        responseType: "arraybuffer",
        timeout: 60000,
        headers: {
          "User-Agent": UA,
          Accept: "image/webp,image/avif,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: referer,
          "Cache-Control": "no-cache",
        },
      });
      buffer = Buffer.from(res.data);
      ctype = (res.headers["content-type"] || "image/jpeg").split(";")[0].trim().toLowerCase();
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }

  const isJpeg = ctype === "image/jpeg" || ctype === "image/jpg";
  const isPng = ctype === "image/png";
  if (!isJpeg && !isPng) {
    buffer = await sharp(buffer).jpeg({ quality: 88 }).toBuffer();
    return { buffer, mime: "image/jpeg" };
  }
  return { buffer, mime: ctype };
}

async function buildPDF(imageUrls, chapterUrl) {
  const pdfDoc = await PDFDocument.create();
  let added = 0;

  const BATCH = 8;
  const results = [];
  for (let i = 0; i < imageUrls.length; i += BATCH) {
    const batch = imageUrls.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map((url) => downloadImageAsJpeg(url, chapterUrl)));
    results.push(...settled);
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      console.warn("[mangapill] skipped image:", imageUrls[i], r.reason?.message);
      continue;
    }
    try {
      let { buffer, mime } = r.value;
      let image;
      try {
        image = mime === "image/png" ? await pdfDoc.embedPng(buffer) : await pdfDoc.embedJpg(buffer);
      } catch {
        try {
          const converted = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
          image = await pdfDoc.embedJpg(converted);
        } catch {
          continue;
        }
      }
      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      added++;
    } catch (e) {
      console.warn("[mangapill] skipped image embed:", imageUrls[i], e.message);
    }
  }

  if (added === 0) throw new Error("No images could be downloaded for this chapter.");
  return Buffer.from(await pdfDoc.save());
}

// ── Commands ─────────────────────────────────────────────

/** .pill <title> — search & auto-load the first result */
async function cmdPill(sock, msg, argText) {
  const jid = msg.key.remoteJid;
  const query = argText.trim();

  if (!query) {
    return (
      "📚 *MangaPill Commands*\n\n" +
      ".pill <title> — search & load series\n" +
      ".pilldl <n>-<m> — download chapter range\n" +
      ".pilldl <n>-end — download n to last chapter\n" +
      ".pillurl <chapter_url> — direct chapter PDF\n" +
      ".pillinfo — show loaded series\n\n" +
      "_Source: mangapill.com_"
    );
  }

  let results;
  try {
    results = await searchMangaPill(query);
  } catch (e) {
    return `❌ Search failed.\n_${e.message}_`;
  }

  if (!results.length) {
    return `❌ No results for *${query}* on MangaPill.`;
  }

  const picked = results[0];
  let info;
  try {
    info = await fetchSeriesInfo(picked.url);
  } catch (e) {
    return `❌ Failed to load series page.\n_${e.message}_`;
  }

  if (!info.chapters.length) {
    return `❌ No chapters found for *${info.title}*.`;
  }

  pillSessions.set(jid, {
    series: {
      title: info.title,
      cover: info.cover || picked.cover,
      url: picked.url,
      status: info.status,
      genres: info.genres,
      totalChapters: info.chapters.length,
      chapters: info.chapters,
    },
  });

  const s = pillSessions.get(jid).series;
  const caption =
    `📖 *${s.title}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    (s.status ? `📌 ${s.status}\n` : "") +
    (s.genres?.length ? `🏷️ ${s.genres.join(", ")}\n` : "") +
    `📖 *${s.totalChapters} chapters available*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 .pilldl 1-end to download all\n` +
    `💡 .pilldl 1-50 to download a range`;

  if (s.cover) {
    try {
      const res = await axios.get(s.cover, {
        responseType: "arraybuffer",
        timeout: 20000,
        headers: { "User-Agent": UA, Referer: SITE + "/" },
      });
      const imgBuf = Buffer.from(res.data);
      await sock.sendMessage(jid, { image: imgBuf, caption }, { quoted: msg });
      return null;
    } catch {
      return caption;
    }
  }

  return caption;
}

/** .pillinfo — show the currently loaded series */
function cmdPillInfo(msg) {
  const jid = msg.key.remoteJid;
  const session = pillSessions.get(jid);
  if (!session?.series) return "❌ No series loaded. Use .pill <title> first.";
  const s = session.series;
  return (
    `📚 *${s.title}*\n\n` +
    `🔗 ${s.url}\n` +
    `📖 ${s.totalChapters} chapters available\n` +
    `🔢 Ch${s.chapters[0]?.number} – Ch${s.chapters[s.chapters.length - 1]?.number}`
  );
}

/** .pillurl <chapter_url> — download a single chapter as PDF */
async function cmdPillUrl(sock, msg, argText) {
  const jid = msg.key.remoteJid;
  const url = argText.trim();

  if (!url || !url.includes("mangapill.com")) {
    return (
      "❌ Provide a valid MangaPill chapter URL.\n\n" +
      "Example:\n.pillurl https://mangapill.com/chapters/4143-10001000/spy-x-family-chapter-1"
    );
  }

  try {
    const imgs = await fetchChapterImages(url);

    if (!imgs.length) {
      return `❌ No images found at that URL.\n_${url}_`;
    }

    const m = url.match(/\/chapters\/(\d+)-(\d+)\/([^/?#]+)/);
    const numCode = m ? parseInt(m[2]) : null;
    const chNum = numCode ? (numCode - 10000000) / 1000 : "?";
    const chapterSlug = m ? m[3] : "chapter";
    const seriesName =
      pillSessions.get(jid)?.series?.title ||
      chapterSlug.replace(/-chapter-[\d.]+$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    const pdf = await buildPDF(imgs, url);
    const safe = seriesName.replace(/[^a-zA-Z0-9 ]/g, " ").trim().slice(0, 28);

    await sock.sendMessage(
      jid,
      {
        document: pdf,
        fileName: `${safe} - Ch${chNum}.pdf`,
        mimetype: "application/pdf",
        caption: `📖 *${seriesName}*\nChapter ${chNum}  •  🖼️ ${imgs.length} pages  •  📦 ${(pdf.length / 1048576).toFixed(1)} MB`,
      },
      { quoted: msg }
    );
    return null;
  } catch (e) {
    return `❌ Failed: _${e.message}_`;
  }
}

/** .pilldl <n>-<m> or <n>-end — download a chapter range as PDFs */
async function cmdPillDl(sock, msg, argText) {
  const jid = msg.key.remoteJid;
  const session = pillSessions.get(jid);

  if (!session?.series) return "❌ No series loaded. Use .pill <title> first.";

  const input = argText.trim();
  if (!input) {
    return "❌ Provide a chapter range.\n\nExamples:\n.pilldl 1-50\n.pilldl 1-end\n.pilldl 46-46";
  }

  const series = session.series;
  let from, to;
  if (input.includes("-")) {
    const [rawA, rawB] = input.split("-");
    from = parseFloat(rawA);
    const bIsEnd = rawB.trim().toLowerCase() === "end";
    to = bIsEnd ? Infinity : parseFloat(rawB);
    if (isNaN(from) || (!bIsEnd && isNaN(to)) || from > to) {
      return "❌ Invalid range. Example: .pilldl 1-50 or .pilldl 1-end";
    }
  } else {
    from = parseFloat(input);
    to = from;
    if (isNaN(from)) return "❌ Invalid chapter number.";
  }

  const targets = series.chapters.filter((c) => c.number >= from && c.number <= to);
  if (!targets.length) {
    return `❌ No chapters in range ${from}–${to === Infinity ? "end" : to}. Total loaded: ${series.totalChapters}`;
  }

  const lastNum = targets[targets.length - 1].number;
  const progressMsg = await sock.sendMessage(
    jid,
    {
      text:
        `📥 *${series.title}*\n` +
        `Downloading Ch${from}–${to === Infinity ? lastNum : to} (${targets.length} chapters)\n` +
        `⏳ Starting…`,
    },
    { quoted: msg }
  );
  const progressKey = progressMsg?.key;

  async function updateProgress(done, total, currentNum, failed) {
    if (!progressKey) return;
    const pct = Math.round((done / total) * 100);
    const bar = "█".repeat(Math.round((done / total) * 10)) + "░".repeat(10 - Math.round((done / total) * 10));
    await sock
      .sendMessage(jid, {
        text:
          `📥 *${series.title}*\n` +
          `Ch${from}–${to === Infinity ? lastNum : to} — ${done}/${total}\n` +
          `[${bar}] ${pct}%\n` +
          (currentNum !== null ? `📖 Ch${currentNum} done` : "") +
          (failed > 0 ? `  ⚠️ ${failed} failed` : ""),
        edit: progressKey,
      })
      .catch(() => {});
  }

  let ok = 0,
    failed = 0;
  for (let i = 0; i < targets.length; i++) {
    const ch = targets[i];
    try {
      await cmdPillUrl(sock, msg, ch.url);
      ok++;
    } catch (e) {
      failed++;
      console.warn(`[pilldl] Ch${ch.number} failed:`, e.message);
    }
    await updateProgress(i + 1, targets.length, ch.number, failed);
  }

  if (ok === 0) return "❌ No chapters could be downloaded.";
  return null;
}

/** .pillhelp — full command reference */
function cmdPillHelp() {
  return (
    "📚 *MangaPill — Help*\n\n" +
    ".pill <title>\n  Search & auto-load first result\n\n" +
    ".pilldl <n>-<m>\n  Download chapter range as PDFs\n\n" +
    ".pilldl <n>-end\n  Download from chapter n to last available\n\n" +
    ".pillurl <chapter_url>\n  Download a single chapter by direct URL\n\n" +
    ".pillinfo\n  Show currently loaded series\n\n" +
    "─── Notes ────────────────────\n" +
    "📦 PDFs sent one per chapter\n" +
    "🔢 Decimal chapters supported (e.g. 57.1)\n" +
    "⚡ Source: mangapill.com"
  );
}

module.exports = {
  cmdPill,
  cmdPillInfo,
  cmdPillUrl,
  cmdPillDl,
  cmdPillHelp,
  // Exported for commands/cloud.js — lets .cloud grab a specific chapter
  // in one shot ("bring chapter 56 of naruto") without going through the
  // interactive search -> pick -> download session flow above.
  searchMangaPill,
  fetchSeriesInfo,
  fetchChapterImages,
  buildPDF,
};
