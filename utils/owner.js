// Owner identity check.
//
// WhatsApp identifies senders two ways depending on context:
//   - a phone-number JID, e.g. "2347062301848@s.whatsapp.net"
//   - a LID (linked-device id), e.g. "87209327755401@lid"
// Baileys gives you whichever one the message actually carries, so we
// check against both configured values.

const OWNER_NUMBER = (process.env.OWNER_NUMBERS || "").replace(/\D/g, "");
const OWNER_LID = (process.env.OWNER_LID || "").replace(/\D/g, "");

function bareDigits(jid) {
  return (jid || "").split("@")[0].split(":")[0];
}

function isOwnerJid(jid) {
  if (!jid) return false;
  const digits = bareDigits(jid);
  if (process.env.OWNER_DEBUG) {
    console.log(`[owner-check] incoming jid="${jid}" digits="${digits}" | OWNER_NUMBER="${OWNER_NUMBER}" OWNER_LID="${OWNER_LID}"`);
  }
  if (OWNER_NUMBER && digits === OWNER_NUMBER) return true;
  if (OWNER_LID && digits === OWNER_LID) return true;
  return false;
}

// Checks both the direct sender and, in groups, the participant field.
function isOwnerMessage(msg) {
  const participant = msg.key.participant || msg.key.remoteJid;
  return isOwnerJid(participant);
}

module.exports = { isOwnerJid, isOwnerMessage };
