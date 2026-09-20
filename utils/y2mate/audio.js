// y2mate-based audio downloader.
// Ported to CommonJS from a working Levanter-style plugin's fallback path
// (the part confirmed working: search -> y2mate scrape -> resolve stream -> download buffer).

const Y2MATE_BASE = "https://yt1d.io";
const Y2MATE_AJAX = `${Y2MATE_BASE}/wp-admin/admin-ajax.php`;
const Y2MATE_RENDER_HOST = "https://fpa-balancer.flashydl.space/get-server";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const YOUTUBE_ID_RE = /(?:v=|\/embed\/|\/shorts\/|youtu\.be\/|\/v\/)([-_0-9A-Za-z]{11})/;

const y2mateCache = new Map();

function extractVideoId(input) {
  const value = String(input || "").trim();
  if (/^[-_0-9A-Za-z]{11}$/.test(value)) return value;
  return value.match(YOUTUBE_ID_RE)?.[1] || value;
}

function safeFilename(value, fallback = "track") {
  return (
    String(value || fallback)
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || fallback
  );
}

async function getY2mateNonces() {
  const response = await fetch(`${Y2MATE_BASE}/`, {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
  });
  const html = await response.text();
  return {
    path: new URL(response.url).pathname,
    nonce: html.match(/name="yt1_nonce" value="([^"]+)"/)?.[1],
    mergeNonce: html.match(/"merge_nonce":"([^"]+)"/)?.[1],
  };
}

async function fetchY2mateOptions(videoId) {
  const { path, nonce, mergeNonce } = await getY2mateNonces();
  if (!nonce) throw new Error("y2mate did not return a nonce (site structure may have changed)");

  const response = await fetch(`${Y2MATE_BASE}/results/`, {
    method: "POST",
    headers: {
      "User-Agent": BROWSER_UA,
      "content-type": "application/x-www-form-urlencoded",
      Origin: Y2MATE_BASE,
      Referer: `${Y2MATE_BASE}${path}`,
    },
    body: new URLSearchParams({
      yt1_nonce: nonce,
      _wp_http_referer: path,
      yt_video_url: `https://www.youtube.com/watch?v=${videoId}`,
    }),
  });

  const html = await response.text();
  return [...html.matchAll(/<[^>]*data-token="[^"]*"[^>]*>/g)]
    .map(([tag]) => {
      const attr = (name) => tag.match(new RegExp(`data-${name}="([^"]*)"`))?.[1];
      return {
        token: attr("token"),
        quality: attr("quality"),
        hasAudio: attr("has-audio") === "1",
        size: Number.parseInt(attr("filesize"), 10) || 0,
        title: attr("title"),
        mergeId: attr("merge-id"),
        mergeNonce: attr("merge-nonce") || mergeNonce,
      };
    })
    .filter((option) => option.token && option.quality);
}

async function getY2mateInfo(idOrUrl) {
  const cacheKey = String(idOrUrl);
  if (y2mateCache.has(cacheKey)) return y2mateCache.get(cacheKey);

  const videoId = extractVideoId(idOrUrl);
  const options = await fetchY2mateOptions(videoId);
  if (!options.length) return null;

  const audio = {};
  for (const option of options) {
    if (option.quality === "MP3") audio["128kbps mp3"] = option;
  }

  const info = {
    id: videoId,
    title: options[0].title || videoId,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    audio,
  };
  y2mateCache.set(cacheKey, info);
  return info;
}

async function resolveY2mateStreams(option) {
  const body = new URLSearchParams();
  body.append("action", "yt1_resolve_streams");
  body.append("nonce", option.mergeNonce);
  body.append("token", option.token);
  body.append("quality", option.quality);

  const response = await fetch(Y2MATE_AJAX, {
    method: "POST",
    headers: {
      "User-Agent": BROWSER_UA,
      Referer: `${Y2MATE_BASE}/results/`,
    },
    body,
  });
  const json = await response.json().catch(() => ({}));
  if (!json.success || !json.data) throw new Error("y2mate stream resolution failed");

  return {
    audioUrl: json.data.audio_url || "",
  };
}

async function startY2mateRender(request, nonce) {
  const body = new URLSearchParams();
  body.append("action", "process_video_merge");
  body.append("nonce", nonce);
  body.append("request_data", JSON.stringify(request));

  const response = await fetch(Y2MATE_AJAX, {
    method: "POST",
    headers: {
      "User-Agent": BROWSER_UA,
      Referer: `${Y2MATE_BASE}/results/`,
    },
    body,
  });
  const json = await response.json().catch(() => ({}));
  if (!json.success) {
    throw new Error(
      `y2mate render start failed: ${JSON.stringify(json.data || json).slice(0, 160)}`
    );
  }
}

async function waitForY2mateResult(jobId, timeoutMs = 180000) {
  const WebSocket = require("ws");

  const hostResponse = await fetch(Y2MATE_RENDER_HOST, {
    headers: { "User-Agent": BROWSER_UA },
  });
  const host = (await hostResponse.text()).trim();
  if (!host) throw new Error("y2mate did not return a render host");

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`wss://${host}/pub/render/status_ws/${jobId}`, {
      headers: { "User-Agent": BROWSER_UA },
    });

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("y2mate render timed out"));
    }, timeoutMs);

    socket.on("message", (raw) => {
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (data.status === "done" && data.output?.url) {
        clearTimeout(timer);
        socket.close();
        resolve(data.output.url);
      } else if (data.error) {
        clearTimeout(timer);
        socket.close();
        reject(new Error(JSON.stringify(data.error)));
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function downloadAudioUrl(idOrUrl) {
  const info = y2mateCache.get(String(idOrUrl)) || (await getY2mateInfo(idOrUrl));
  if (!info) return null;

  const option = info.audio["128kbps mp3"] || Object.values(info.audio)[0];
  if (!option) return null;

  const streams = await resolveY2mateStreams(option);
  if (!streams.audioUrl) throw new Error("y2mate returned no audio stream");

  const request = {
    id: `${option.mergeId}_${option.quality}`,
    ttl: 3600000,
    chunk: { size: 209715200, concurrency: 3 },
    inputs: [{ url: streams.audioUrl, ext: "m4a" }],
    output: {
      ext: "mp3",
      downloadName: `${safeFilename(option.title)}_MP3.mp3`,
      chunkUpload: { size: 209715200, concurrency: 3 },
    },
    operation: { type: "no_process" },
  };

  await startY2mateRender(request, option.mergeNonce);
  return waitForY2mateResult(request.id);
}

async function downloadUrlToBuffer(url, timeout = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) throw new Error("The media response was empty");
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  extractVideoId,
  getY2mateInfo,
  downloadAudioUrl,
  downloadUrlToBuffer,
  safeFilename,
};
