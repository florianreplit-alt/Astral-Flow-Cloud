const sharp = require("sharp");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { getQuotedMedia } = require("../utils/quotedMessage");
const { bufferToAnimatedSticker } = require("../utils/animatedSticker");
const { applyStickerMeta } = require("../utils/stickerMeta");

/**
 * .sticker — converts an image or short video/gif into a WhatsApp sticker.
 * Works two ways: reply to media with .sticker, or send an image/video
 * directly with .sticker as the caption.
 */
async function makeSticker(sock, msg) {
  const quotedMedia = getQuotedMedia(msg);

  // Prefer the quoted (replied-to) message; fall back to the message itself
  // in case the user sent media directly with .sticker as the caption.
  const targetMsg = quotedMedia?.targetMsg || msg;
  const imageMsg = targetMsg.message?.imageMessage;
  const videoMsg = targetMsg.message?.videoMessage;

  if (!imageMsg && !videoMsg) {
    return {
      error: "⚠️ Reply to an image or short video with .sticker, or send one with .sticker as the caption.",
    };
  }

  const pushName = msg.pushName || "";

  try {
    const buffer = await downloadMediaMessage(targetMsg, "buffer", {}, { logger: undefined });

    const webpBuffer = videoMsg
      ? await bufferToAnimatedSticker(buffer)
      : await sharp(buffer)
          .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .webp()
          .toBuffer();

    const finalBuffer = await applyStickerMeta(webpBuffer, { author: pushName });
    return { buffer: finalBuffer };
  } catch {
    return { error: "⚠️ Couldn't convert that to a sticker." };
  }
}

module.exports = { makeSticker };
