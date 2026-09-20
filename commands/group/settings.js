const { getSettings, setSetting } = require("../../utils/groupSettings");
const { isSenderAdmin } = require("../../utils/groupPermissions");

async function toggleSetting(sock, msg, settingKey, argText, label) {
  const groupJid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (!groupJid?.endsWith("@g.us")) {
    return "⚠️ This command only works in groups.";
  }

  const senderIsAdmin = await isSenderAdmin(sock, groupJid, senderJid).catch(() => false);
  if (!senderIsAdmin) {
    return "⚠️ Only group admins can change this setting.";
  }

  const arg = argText.trim().toLowerCase();

  if (!arg) {
    const current = getSettings(groupJid)[settingKey];
    return `ℹ️ *${label}* is currently *${current ? "ON" : "OFF"}*.\nUse "on" or "off" to change it.`;
  }

  if (arg !== "on" && arg !== "off") {
    return `⚠️ Usage: .${settingKey} on  |  .${settingKey} off`;
  }

  const newValue = arg === "on";
  setSetting(groupJid, settingKey, newValue);
  return `✅ *${label}* is now *${newValue ? "ON" : "OFF"}*.`;
}

module.exports = { toggleSetting };
