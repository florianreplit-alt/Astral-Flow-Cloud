const webp = require("node-webpmux");

const DEFAULT_PACK = "Astral Cloud";

/**
 * Stamps WhatsApp sticker EXIF (pack name + author) onto a webp buffer.
 * Used by both .sticker (new stickers) and .steal (re-authored stickers)
 * so pack metadata stays consistent across the bot.
 */
async function applyStickerMeta(webpBuffer, { pack = DEFAULT_PACK, author = "" } = {}) {
  const img = new webp.Image();
  await img.load(webpBuffer);

  const json = {
    "sticker-pack-id": `astral-cloud-${Date.now()}`,
    "sticker-pack-name": pack,
    "sticker-pack-publisher": author || DEFAULT_PACK,
    emojis: ["✨"],
  };

  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  const jsonBuffer = Buffer.from(JSON.stringify(json), "utf-8");
  exifAttr.writeUIntLE(jsonBuffer.length, 14, 4);
  const exif = Buffer.concat([exifAttr, jsonBuffer]);

  img.exif = exif;
  return img.save(null);
}

module.exports = { applyStickerMeta, DEFAULT_PACK };
