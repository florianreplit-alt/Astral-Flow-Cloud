// ═══════════════════════════════════════════════════════
//   .join <invite link or code>   — owner only
//   .leave                        — owner only, leaves current group
// ═══════════════════════════════════════════════════════
const { isOwnerMessage } = require("../../utils/owner");

// Accepts a full https://chat.whatsapp.com/XXXXXXXX link or a bare code.
function extractInviteCode(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const linkMatch = trimmed.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i);
  if (linkMatch) return linkMatch[1];
  // Bare code (letters/digits only, no spaces)
  if (/^[A-Za-z0-9]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

async function joinGroup(sock, msg, argText) {
  if (!isOwnerMessage(msg)) {
    return "⚠️ Owner only.";
  }

  const code = extractInviteCode(argText);
  if (!code) {
    return "⚠️ Usage: .join <group invite link>\nExample: .join https://chat.whatsapp.com/AbCdEfGhIjK";
  }

  try {
    const groupJid = await sock.groupAcceptInvite(code);
    if (!groupJid) return "⚠️ Couldn't join — the invite may be invalid or expired.";
    return `✅ Joined the group successfully.`;
  } catch (err) {
    console.error("groupAcceptInvite error:", err);
    return "⚠️ Failed to join. The link may be invalid, expired, or I may be banned from that group.";
  }
}

async function leaveGroup(sock, msg) {
  if (!isOwnerMessage(msg)) {
    return "⚠️ Owner only.";
  }

  const groupJid = msg.key.remoteJid;
  if (!groupJid?.endsWith("@g.us")) {
    return "⚠️ This command only works inside a group.";
  }

  try {
    // Send a goodbye message before leaving, since we can't send anything after.
    await sock.sendMessage(groupJid, { text: "👋 Leaving this group, bye!" }, { quoted: msg });
    await sock.groupLeave(groupJid);
    return null; // nothing more to send — we've left
  } catch (err) {
    console.error("groupLeave error:", err);
    return "⚠️ Failed to leave the group.";
  }
}

module.exports = { joinGroup, leaveGroup };
