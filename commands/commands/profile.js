const { extractTargetJid } = require("../utils/targetJid");
const { isTrusted } = require("../utils/trustedUsers");
const { isOwnerJid } = require("../utils/owner");

/**
 * .me / .info — shows a user's display name, WhatsApp bio, current profile
 * picture, and a trusted/owner badge. Targets the sender by default, or
 * whoever is mentioned/replied-to.
 */
async function showProfile(sock, msg, argText) {
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const targetJid = extractTargetJid(msg, argText) || senderJid;
  const pushName = targetJid === senderJid ? (msg.pushName || "Unknown") : targetJid.split("@")[0];

  let bio = "No bio set.";
  try {
    // fetchStatus() returns { list: [{ id, status: { status, setAt } }] }
    const result = await sock.fetchStatus(targetJid);
    const statusText = result?.list?.[0]?.status?.status;
    if (statusText) bio = statusText;
  } catch {
    // bio unavailable (privacy settings, or user not reachable) — keep default
  }

  let ppUrl = null;
  try {
    ppUrl = await sock.profilePictureUrl(targetJid, "image");
  } catch {
    // no profile picture set, or privacy settings block it
  }

  let badge = "";
  if (isOwnerJid(targetJid)) badge = "👑 Owner";
  else if (isTrusted(targetJid)) badge = "✅ Trusted";

  const caption =
    `👤 *${pushName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    (badge ? `${badge}\n` : "") +
    `📝 *Bio:* ${bio}`;

  return {
    image: ppUrl ? { url: ppUrl } : null,
    caption,
    mentions: [targetJid],
  };
}

module.exports = { showProfile };
