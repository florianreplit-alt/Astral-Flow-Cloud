const { isSenderAdmin } = require("../../utils/groupPermissions");
const { extractTargetJid, extractAllMentionedOrTarget } = require("../../utils/targetJid");

async function runParticipantAction(sock, msg, argText, action, label) {
  const groupJid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (!groupJid?.endsWith("@g.us")) {
    return "⚠️ This command only works in groups.";
  }

  const senderIsAdmin = await isSenderAdmin(sock, groupJid, senderJid).catch(() => false);
  if (!senderIsAdmin) {
    return "⚠️ Only group admins can use this command.";
  }

  const targetJid = extractTargetJid(msg, argText);
  if (!targetJid) {
    return `⚠️ Mention a user, reply to their message, or give a number to ${label}.`;
  }

  try {
    await sock.groupParticipantsUpdate(groupJid, [targetJid], action);
    return `✅ Done — ${label}ed successfully.`;
  } catch {
    return `⚠️ Couldn't ${label} that user. Make sure I'm a group admin.`;
  }
}

const kickUser = (sock, msg, argText) =>
  runParticipantAction(sock, msg, argText, "remove", "kick");

const promoteUser = (sock, msg, argText) =>
  runParticipantAction(sock, msg, argText, "promote", "promote");

const demoteUser = (sock, msg, argText) =>
  runParticipantAction(sock, msg, argText, "demote", "demote");

async function addUser(sock, msg, argText) {
  const groupJid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (!groupJid?.endsWith("@g.us")) {
    return "⚠️ This command only works in groups.";
  }

  const senderIsAdmin = await isSenderAdmin(sock, groupJid, senderJid).catch(() => false);
  if (!senderIsAdmin) {
    return "⚠️ Only group admins can use this command.";
  }

  const digits = argText.replace(/[^0-9]/g, "");
  if (!digits) {
    return "⚠️ Usage: .add 234xxxxxxxxxx";
  }

  try {
    await sock.groupParticipantsUpdate(groupJid, [`${digits}@s.whatsapp.net`], "add");
    return "✅ Done — user added.";
  } catch {
    return "⚠️ Couldn't add that user. Make sure I'm a group admin and the number is correct.";
  }
}

async function tagAll(sock, msg, argText) {
  const groupJid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (!groupJid?.endsWith("@g.us")) {
    return { text: "⚠️ This command only works in groups." };
  }

  const senderIsAdmin = await isSenderAdmin(sock, groupJid, senderJid).catch(() => false);
  if (!senderIsAdmin) {
    return { text: "⚠️ Only group admins can use this command." };
  }

  const metadata = await sock.groupMetadata(groupJid).catch(() => null);
  if (!metadata) {
    return { text: "⚠️ Couldn't fetch group members." };
  }

  const participantIds = metadata.participants.map((p) => p.id);
  const mentions = participantIds.map((id) => `@${id.split("@")[0]}`).join(" ");
  const message = argText ? `${argText}\n\n${mentions}` : mentions;

  return { text: message, mentions: participantIds };
}

async function hideTag(sock, msg, argText) {
  const groupJid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (!groupJid?.endsWith("@g.us")) {
    return { text: "⚠️ This command only works in groups." };
  }

  const senderIsAdmin = await isSenderAdmin(sock, groupJid, senderJid).catch(() => false);
  if (!senderIsAdmin) {
    return { text: "⚠️ Only group admins can use this command." };
  }

  const metadata = await sock.groupMetadata(groupJid).catch(() => null);
  if (!metadata) {
    return { text: "⚠️ Couldn't fetch group members." };
  }

  const participantIds = metadata.participants.map((p) => p.id);
  const text = argText || " ";

  return { text, mentions: participantIds };
}

async function muteGroup(sock, msg) {
  const groupJid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (!groupJid?.endsWith("@g.us")) {
    return "⚠️ This command only works in groups.";
  }

  const senderIsAdmin = await isSenderAdmin(sock, groupJid, senderJid).catch(() => false);
  if (!senderIsAdmin) {
    return "⚠️ Only group admins can use this command.";
  }

  try {
    await sock.groupSettingUpdate(groupJid, "announcement");
    return "🔇 Group muted — only admins can send messages now.";
  } catch {
    return "⚠️ Couldn't mute the group. Make sure I'm a group admin.";
  }
}

async function unmuteGroup(sock, msg) {
  const groupJid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (!groupJid?.endsWith("@g.us")) {
    return "⚠️ This command only works in groups.";
  }

  const senderIsAdmin = await isSenderAdmin(sock, groupJid, senderJid).catch(() => false);
  if (!senderIsAdmin) {
    return "⚠️ Only group admins can use this command.";
  }

  try {
    await sock.groupSettingUpdate(groupJid, "not_announcement");
    return "🔊 Group unmuted — everyone can send messages again.";
  } catch {
    return "⚠️ Couldn't unmute the group. Make sure I'm a group admin.";
  }
}

async function setGroupName(sock, msg, argText) {
  const groupJid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (!groupJid?.endsWith("@g.us")) {
    return "⚠️ This command only works in groups.";
  }

  const senderIsAdmin = await isSenderAdmin(sock, groupJid, senderJid).catch(() => false);
  if (!senderIsAdmin) {
    return "⚠️ Only group admins can use this command.";
  }

  if (!argText.trim()) {
    return "⚠️ Usage: .setname New Group Name";
  }

  try {
    await sock.groupUpdateSubject(groupJid, argText.trim());
    return "✅ Group name updated.";
  } catch {
    return "⚠️ Couldn't update the group name. Make sure I'm a group admin.";
  }
}

async function setGroupDesc(sock, msg, argText) {
  const groupJid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (!groupJid?.endsWith("@g.us")) {
    return "⚠️ This command only works in groups.";
  }

  const senderIsAdmin = await isSenderAdmin(sock, groupJid, senderJid).catch(() => false);
  if (!senderIsAdmin) {
    return "⚠️ Only group admins can use this command.";
  }

  if (!argText.trim()) {
    return "⚠️ Usage: .setdesc New group description";
  }

  try {
    await sock.groupUpdateDescription(groupJid, argText.trim());
    return "✅ Group description updated.";
  } catch {
    return "⚠️ Couldn't update the description. Make sure I'm a group admin.";
  }
}

module.exports = {
  kickUser,
  promoteUser,
  demoteUser,
  addUser,
  tagAll,
  hideTag,
  muteGroup,
  unmuteGroup,
  setGroupName,
  setGroupDesc,
};
