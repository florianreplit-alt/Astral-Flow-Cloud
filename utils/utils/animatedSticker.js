const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Downloads a video (mp4/gif) from a URL and converts it to an animated
 * WhatsApp sticker (webp, capped duration + size so WhatsApp accepts it).
 */
async function videoToAnimatedSticker(videoUrl) {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Failed to download media (${res.status})`);
  const inputBuffer = Buffer.from(await res.arrayBuffer());
  return bufferToAnimatedSticker(inputBuffer);
}

/**
 * Same conversion as videoToAnimatedSticker(), but for a buffer that's
 * already been downloaded (e.g. media pulled straight from a WhatsApp
 * message via Baileys) instead of fetched from a URL.
 */
async function bufferToAnimatedSticker(inputBuffer) {
  const tmpId = crypto.randomBytes(6).toString("hex");
  const inputPath = path.join(os.tmpdir(), `tenor_${tmpId}.mp4`);
  const outputPath = path.join(os.tmpdir(), `tenor_${tmpId}.webp`);

  await fs.writeFile(inputPath, inputBuffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .duration(6) // WhatsApp animated stickers should stay short
        .outputOptions([
          "-vcodec", "libwebp",
          "-vf", "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=white@0.0",
          "-loop", "0",
          "-preset", "default",
          "-an",
          "-vsync", "0",
        ])
        .toFormat("webp")
        .on("end", resolve)
        .on("error", reject)
        .save(outputPath);
    });

    return await fs.readFile(outputPath);
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

module.exports = { videoToAnimatedSticker, bufferToAnimatedSticker };
