const { createRequire } = require("module");
const { existsSync } = require("fs");
const { writeFile, readFile, rm, mkdir } = require("fs/promises");
const { randomUUID } = require("crypto");
const { tmpdir } = require("os");
const { join } = require("path");

const require2 = createRequire(__filename);
const ffmpeg = require2("fluent-ffmpeg");
const ffmpegBinary = require2("ffmpeg-static");

if (ffmpegBinary && existsSync(ffmpegBinary)) {
  ffmpeg.setFfmpegPath(ffmpegBinary);
}

const TEMP_DIR = join(tmpdir(), "astral-cloud-music");

function isMp3Buffer(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    (buffer.subarray(0, 3).toString() === "ID3" ||
      (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0))
  );
}

function convertWithFfmpeg(input, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(192)
      .audioFrequency(44100)
      .on("error", (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .on("end", resolve)
      .save(output);
  });
}

async function ensureMp3(buffer) {
  if (isMp3Buffer(buffer)) return buffer;

  // Some download services return AAC/M4A while labeling it MP3 — convert to be safe.
  await mkdir(TEMP_DIR, { recursive: true });
  const id = randomUUID();
  const source = join(TEMP_DIR, `${id}.source`);
  const output = join(TEMP_DIR, `${id}.mp3`);

  try {
    await writeFile(source, buffer);
    await convertWithFfmpeg(source, output);
    return await readFile(output);
  } finally {
    await Promise.all([
      rm(source, { force: true }).catch(() => {}),
      rm(output, { force: true }).catch(() => {}),
    ]);
  }
}

const { searchYoutube } = require("../../utils/y2mate/search");
const { getY2mateInfo, downloadAudioUrl, downloadUrlToBuffer } = require("../../utils/y2mate/audio");

// Baileys can embed a small JPEG as the audio message's thumbnail
// (jpegThumbnail), but not every client renders that on an audio
// message reliably. Sending the cover art as its own image with a
// caption first is what actually shows up as a visible thumbnail
// everywhere, so we do both.
async function fetchThumbnailBuffer(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function playSong(sock, msg, query) {
  const from = msg.key.remoteJid;

  if (!query || !query.trim()) {
    return { text: "⚠️ Usage: .play <song name or YouTube link>" };
  }

  await sock.sendMessage(from, { text: `🔍 Searching for *${query}*...` }, { quoted: msg });

  let video;
  try {
    video = await searchYoutube(query);
  } catch (err) {
    return { text: `⚠️ Couldn't find that song. ${err.message}` };
  }

  // Fetch thumbnail once, reuse for both the cover-art message and the
  // audio's embedded jpegThumbnail.
  const thumbBuffer = await fetchThumbnailBuffer(video.thumbnail);

  if (thumbBuffer) {
    await sock.sendMessage(
      from,
      {
        image: thumbBuffer,
        caption: `⬇️ Found *${video.title}*${video.author ? ` — ${video.author}` : ""}\ndownloading audio...`,
      },
      { quoted: msg }
    );
  } else {
    await sock.sendMessage(
      from,
      { text: `⬇️ Found *${video.title}* — downloading audio...` },
      { quoted: msg }
    );
  }

  try {
    const info = await getY2mateInfo(video.id);
    if (!info || !Object.keys(info.audio).length) {
      return { text: "⚠️ No audio format was available for that video." };
    }

    const streamUrl = await downloadAudioUrl(video.id);
    if (!streamUrl) {
      return { text: "⚠️ Download service returned no audio stream." };
    }

    const buffer = await downloadUrlToBuffer(streamUrl);
    const mp3Buffer = await ensureMp3(buffer);
    const title = info.title || video.title;

    return {
      audio: mp3Buffer,
      mimetype: "audio/mpeg",
      fileName: `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 100)}.mp3`,
      ptt: false,
      ...(thumbBuffer ? { jpegThumbnail: thumbBuffer } : {}),
    };
  } catch (err) {
    return { text: `⚠️ Download failed: ${err.message}` };
  }
}

module.exports = { playSong };
