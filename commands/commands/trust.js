const { isOwnerMessage } = require("../utils/owner");
const { extractTargetJid } = require("../utils/targetJid");
const { addTrusted, removeTrusted } = require("../utils/trustedUsers");

async function giveTrusted(msg, argText) {
  if (!isOwnerMessage(msg)) {
    return "⚠️ Only the owner can grant trusted status.";
  }

  const targetJid = extractTargetJid(msg, argText);
  if (!targetJid) {
    return "⚠️ Mention a user, reply to their message, or give a number to trust.";
  }

  addTrusted(targetJid);
  return `✅ @${targetJid.split("@")[0]} is now *trusted* — they can use .stickerpack and .pill.`;
}

async function removeTrustedUser(msg, argText) {
  if (!isOwnerMessage(msg)) {
    return "⚠️ Only the owner can revoke trusted status.";
  }

  const targetJid = extractTargetJid(msg, argText);
  if (!targetJid) {
    return "⚠️ Mention a user, reply to their message, or give a number to untrust.";
  }

  const removed = removeTrusted(targetJid);
  return removed
    ? `✅ @${targetJid.split("@")[0]} is no longer trusted.`
    : `ℹ️ @${targetJid.split("@")[0]} wasn't trusted.`;
}

module.exports = { giveTrusted, removeTrustedUser };
