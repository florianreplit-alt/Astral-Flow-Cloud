// Baileys GroupParticipant.admin is 'admin' | 'superadmin' | null
async function getGroupMetadata(sock, groupJid) {
  return sock.groupMetadata(groupJid);
}

function isParticipantAdmin(metadata, jid) {
  const participant = metadata.participants.find((p) => p.id === jid);
  return !!participant && (participant.admin === "admin" || participant.admin === "superadmin");
}

async function isSenderAdmin(sock, groupJid, senderJid) {
  const metadata = await getGroupMetadata(sock, groupJid);
  return isParticipantAdmin(metadata, senderJid);
}

async function isBotAdmin(sock, groupJid) {
  const metadata = await getGroupMetadata(sock, groupJid);
  const botJid = sock.user?.id;
  // botJid may be in the form "1234:5@s.whatsapp.net" — normalize to match participant ids
  const normalizedBotJid = botJid?.split(":")[0] + "@s.whatsapp.net";
  return (
    isParticipantAdmin(metadata, botJid) || isParticipantAdmin(metadata, normalizedBotJid)
  );
}

module.exports = { getGroupMetadata, isParticipantAdmin, isSenderAdmin, isBotAdmin };
