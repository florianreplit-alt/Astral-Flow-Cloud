// Detects rule violations using Baileys' actual message shape.
// Returns { type, reason } if a violation is found, or null if clean.

const LINK_REGEX = /(https?:\/\/|www\.|chat\.whatsapp\.com\/|t\.me\/)\S+/i;

function getMessageText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    ""
  );
}

function detectLink(message) {
  const text = getMessageText(message);
  return LINK_REGEX.test(text);
}

function detectChannelForward(message) {
  // Any message type can carry contextInfo.forwardedNewsletterMessageInfo
  // when it originated from / was forwarded from a WhatsApp Channel.
  const contextInfo =
    message?.extendedTextMessage?.contextInfo ||
    message?.imageMessage?.contextInfo ||
    message?.videoMessage?.contextInfo ||
    message?.contextInfo;

  return !!contextInfo?.forwardedNewsletterMessageInfo;
}

function detectStatusMention(message) {
  // Present when a user reposts/mentions their WhatsApp Status into a chat.
  return !!message?.statusMentionMessage;
}

function detectViolation(message, settings) {
  if (settings.antilink && detectLink(message)) {
    return { type: "antilink", reason: "posting a link" };
  }
  if (settings.antichannel && detectChannelForward(message)) {
    return { type: "antichannel", reason: "forwarding a WhatsApp Channel post" };
  }
  if (settings.antistatus && detectStatusMention(message)) {
    return { type: "antistatus", reason: "sharing a Status update" };
  }
  return null;
}

module.exports = { detectViolation, detectLink, detectChannelForward, detectStatusMention };
