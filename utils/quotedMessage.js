/**
 * Rebuilds the quoted message (if any) into a shape Baileys'
 * downloadMediaMessage() can consume directly, plus a few convenience
 * fields (fileName, mimetype) pulled from whichever media type it is.
 */
function getQuotedMedia(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (!quoted) return null;

  const targetMsg = {
    key: {
      remoteJid: msg.key.remoteJid,
      id: ctx.stanzaId,
      participant: ctx.participant,
    },
    message: quoted,
  };

  const mediaMsg =
    quoted.documentMessage ||
    quoted.videoMessage ||
    quoted.imageMessage ||
    quoted.audioMessage ||
    quoted.stickerMessage ||
    null;

  if (!mediaMsg) return null;

  return {
    targetMsg,
    fileName: mediaMsg.fileName || null,
    mimetype: mediaMsg.mimetype || null,
  };
}

module.exports = { getQuotedMedia };
