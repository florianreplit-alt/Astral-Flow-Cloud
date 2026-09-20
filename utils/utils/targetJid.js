// Resolves which user a command is aimed at: mention > replied-to message >
// a raw phone number typed as the argument. Shared by group moderation
// commands and any DM-safe command that needs a "target user" (e.g.
// .givetrusted, .me on someone else).

function extractTargetJid(msg, argText) {
  const mentioned =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (mentioned) return mentioned;

  const quotedParticipant =
    msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (quotedParticipant) return quotedParticipant;

  if (argText) {
    const digits = argText.replace(/[^0-9]/g, "");
    if (digits) return `${digits}@s.whatsapp.net`;
  }

  return null;
}

function extractAllMentionedOrTarget(msg, argText) {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (mentioned && mentioned.length) return mentioned;

  const single = extractTargetJid(msg, argText);
  return single ? [single] : [];
}

module.exports = { extractTargetJid, extractAllMentionedOrTarget };
