const { detectPlatform, RE, PLATFORM_LABELS } = require("../../utils/downloaders/platformDetect");
const { SENDERS } = require("../../utils/downloaders/senders");

function getQuotedText(msg) {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  return quoted?.conversation || quoted?.extendedTextMessage?.text || "";
}

/**
 * Runs a download for a specific platform type (tt/ig/pin/fb), or auto-detects
 * when forcedType is null (used by .dl).
 */
async function runDownload(sock, msg, argText, forcedType) {
  const from = msg.key.remoteJid;
  const quotedText = getQuotedText(msg);
  const input = (argText || "").trim() || quotedText;

  let type = forcedType;
  let url = input;

  if (!type) {
    if (!input) {
      return "📥 *Usage:* .dl <url>\nSupports: TikTok · Instagram · Pinterest · Facebook\n_Tip: replying to a message with a link also works_";
    }
    const detected = detectPlatform(input);
    if (!detected) return "❌ Unsupported or invalid URL.";
    type = detected.type;
    url = detected.url;
  } else {
    if (!input) {
      return `❌ *Usage:* .${forcedType === "tt" ? "tiktok" : forcedType === "ig" ? "ig" : forcedType === "pin" ? "pinterest" : "fb"} <url>`;
    }
    const re = RE[type];
    if (re) {
      re.lastIndex = 0;
      if (!re.test(input)) return `❌ That doesn't look like a ${PLATFORM_LABELS[type]} link.`;
      re.lastIndex = 0;
    }
  }

  try {
    await SENDERS[type](sock, from, msg, url);
    return null; // success, nothing more to send
  } catch (err) {
    return `❌ *${PLATFORM_LABELS[type] || "Download"} failed:* ${err.message || "unknown error"}`;
  }
}

const downloadTikTok = (sock, msg, argText) => runDownload(sock, msg, argText, "tt");
const downloadInstagram = (sock, msg, argText) => runDownload(sock, msg, argText, "ig");
const downloadPinterest = (sock, msg, argText) => runDownload(sock, msg, argText, "pin");
const downloadFacebook = (sock, msg, argText) => runDownload(sock, msg, argText, "fb");
const downloadAuto = (sock, msg, argText) => runDownload(sock, msg, argText, null);

module.exports = {
  downloadTikTok,
  downloadInstagram,
  downloadPinterest,
  downloadFacebook,
  downloadAuto,
};
