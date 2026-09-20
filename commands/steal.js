const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { getQuotedMedia } = require("../utils/quotedMessage");
const { applyStickerMeta } = require("../utils/stickerMeta");

/**
 * .steal — reply to any sticker to grab it: rewrites its pack/author EXIF
 * to the sender's name and sends it back as a "new" sticker under them.
 */
async function stealSticker(sock, msg) {
  const quotedMedia = getQuotedMedia(msg);
  const targetMsg = quotedMedia?.targetMsg;
  const stickerMsg = targetMsg?.message?.stickerMessage;

  if (!stickerMsg) {
    return { error: "⚠️ Reply to a sticker with .steal to grab it." };
  }

  const pushName = msg.pushName || "Astral Cloud";

  try {
    const buffer = await downloadMediaMessage(targetMsg, "buffer", {}, { logger: undefined });

    const finalBuffer = await applyStickerMeta(buffer, {
      author: pushName,
      pack: `${pushName}'s Pack`,
    });

    return { buffer: finalBuffer };
  } catch {
    return { error: "⚠️ Couldn't steal that sticker." };
  }
}

module.exports = { stealSticker };
