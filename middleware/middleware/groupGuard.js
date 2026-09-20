const { getSettings } = require("../utils/groupSettings");
const { detectViolation } = require("../utils/violationDetector");
const { recordAndCheckSpam } = require("../utils/spamTracker");
const { isBotAdmin, isSenderAdmin } = require("../utils/groupPermissions");

/**
 * Runs on every group message. Returns true if the message was actioned
 * (deleted/kicked) and should stop further processing (e.g. command routing).
 */
async function groupGuard(sock, msg) {
  const groupJid = msg.key.remoteJid;
  if (!groupJid?.endsWith("@g.us")) return false; // not a group

  const senderJid = msg.key.participant || msg.key.remoteJid;
  if (!senderJid) return false;

  // Never moderate group admins — avoids accidental self-lockout / admin conflicts.
  const senderIsAdmin = await isSenderAdmin(sock, groupJid, senderJid).catch(() => false);
  if (senderIsAdmin) return false;

  const settings = getSettings(groupJid);

  // Content-based violations (link, channel forward, status mention)
  const violation = detectViolation(msg.message, settings);

  // Spam violation (frequency-based, separate from content)
  const isSpam = settings.antispam && recordAndCheckSpam(groupJid, senderJid);

  const finalViolation = violation || (isSpam ? { type: "antispam", reason: "spamming messages" } : null);
  if (!finalViolation) return false;

  const botCanModerate = await isBotAdmin(sock, groupJid).catch(() => false);
  if (!botCanModerate) {
    // Bot isn't admin, can't delete/kick — silently skip enforcement.
    return false;
  }

  // Delete the offending message
  try {
    await sock.sendMessage(groupJid, { delete: msg.key });
  } catch (err) {
    console.error("Failed to delete message:", err);
  }

  // Kick the sender
  try {
    await sock.groupParticipantsUpdate(groupJid, [senderJid], "remove");
  } catch (err) {
    console.error("Failed to remove participant:", err);
  }

  // Notify the group
  try {
    await sock.sendMessage(groupJid, {
      text: `🚫 *${finalViolation.type}*\nRemoved a member for ${finalViolation.reason}.`,
    });
  } catch (err) {
    console.error("Failed to send moderation notice:", err);
  }

  return true;
}

module.exports = { groupGuard };
