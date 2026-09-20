const { getSettings } = require("../utils/groupSettings");
const { isBotAdmin, getGroupMetadata } = require("../utils/groupPermissions");
const { addPending, getPending, removePending } = require("../utils/verificationStore");

const VERIFY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function randomMathQuestion() {
  const a = Math.floor(Math.random() * 8) + 1; // 1-8
  const b = Math.floor(Math.random() * 8) + 1; // 1-8
  return { a, b, answer: a + b };
}

function bareDigits(jid) {
  return (jid || "").split("@")[0].split(":")[0];
}

// A joining participant's jid can come through as a "@lid" (WhatsApp's
// linked-device id) instead of their real phone-number jid, depending on
// their account/privacy settings. Tagging a raw @lid does nothing — the
// digits don't correspond to any real contact, so WhatsApp can't resolve
// it into an actual mention. Group metadata keeps the real phone jid
// alongside the lid for each participant, so we resolve through that
// whenever we're handed a lid.
async function resolveTaggableJid(sock, groupJid, userJid) {
  if (!userJid?.endsWith("@lid")) return userJid;

  try {
    const metadata = await getGroupMetadata(sock, groupJid);
    const participant = metadata.participants.find((p) => p.id === userJid);
    // Confirmed against Baileys' own Contact type (Types/Contact.d.ts):
    // `phoneNumber` is documented as "ID in PN format (@s.whatsapp.net)".
    const real = participant?.phoneNumber;
    if (real && real.endsWith("@s.whatsapp.net")) return real;
  } catch (err) {
    console.error("resolveTaggableJid: failed to read group metadata:", err);
  }

  // Couldn't resolve — fall back to the lid itself rather than crashing.
  // The tag text/mentions entry will be built from this, so it may not
  // render as a real tag, but everything else still works.
  return userJid;
}

function mention(jid) {
  return `@${bareDigits(jid)}`;
}

/**
 * Called from the group-participants.update event when someone joins.
 * Posts a welcome + math challenge, and schedules a removal if they don't
 * answer correctly within the timeout.
 */
async function startVerification(sock, groupJid, userJid) {
  const settings = getSettings(groupJid);
  if (!settings.welcome) return;

  // Don't bother challenging if the bot can't actually remove anyone anyway.
  const botAdmin = await isBotAdmin(sock, groupJid).catch(() => false);

  // Resolve once up front — used for every tag we send about this user.
  // Verification tracking below still keys off the original userJid, since
  // that's what Baileys will hand back as msg.key.participant on their reply.
  const taggableJid = await resolveTaggableJid(sock, groupJid, userJid);

  const { a, b, answer } = randomMathQuestion();

  const timeout = setTimeout(async () => {
    const entry = getPending(groupJid, userJid);
    if (!entry) return; // already verified or cleared
    removePending(groupJid, userJid);

    if (botAdmin) {
      try {
        await sock.groupParticipantsUpdate(groupJid, [userJid], "remove");
        await sock.sendMessage(groupJid, {
          text: `⏱️ ${mention(taggableJid)} didn't complete verification in time and was removed.`,
          mentions: [taggableJid],
        });
      } catch (err) {
        console.error("verification timeout kick failed:", err);
      }
    } else {
      await sock.sendMessage(groupJid, {
        text: `⏱️ ${mention(taggableJid)} didn't complete verification in time, but I'm not an admin here so I can't remove them.`,
        mentions: [taggableJid],
      });
    }
  }, VERIFY_TIMEOUT_MS);

  addPending(groupJid, userJid, { answer, stage: "math", timeout });

  await sock.sendMessage(groupJid, {
    text:
      `👋 Welcome ${mention(taggableJid)}!\n\n` +
      `To make sure you're human, please solve: *${a} + ${b} = ?*\n` +
      `Just reply with the number. You have 5 minutes.`,
    mentions: [taggableJid],
  });
}

/**
 * Called on every group message before command routing. Checks if the
 * sender has a pending verification and processes their reply if so.
 * Returns true if the message was consumed as a verification answer.
 */
async function checkVerificationReply(sock, msg, text) {
  const groupJid = msg.key.remoteJid;
  if (!groupJid?.endsWith("@g.us")) return false;

  const userJid = msg.key.participant || msg.key.remoteJid;
  const entry = getPending(groupJid, userJid);
  if (!entry) return false;

  const taggableJid = await resolveTaggableJid(sock, groupJid, userJid);

  if (entry.stage === "math") {
    const reply = text.trim();
    const num = Number(reply.match(/-?\d+/)?.[0]);

    if (!Number.isNaN(num) && num === entry.answer) {
      clearTimeout(entry.timeout);
      addPending(groupJid, userJid, { stage: "profile" }); // keep entry but drop the timer, no further kick risk

      await sock.sendMessage(groupJid, {
        text:
          `✅ ${mention(taggableJid)} verified, welcome aboard!\n\n` +
          `While you're here, tell us a bit about yourself:\n` +
          `• Your name\n` +
          `• Your age\n` +
          `• Best anime\n` +
          `• Worst anime\n` +
          `• Year you started watching anime`,
        mentions: [taggableJid],
      });
      return true;
    }

    // wrong answer — ignore and let them keep trying until the timeout fires
    return false;
  }

  if (entry.stage === "profile") {
    // Profile step is informational only — just acknowledge and clear.
    await sock.sendMessage(groupJid, {
      text: `🎉 Thanks for sharing, ${mention(taggableJid)}! Enjoy the group.`,
      mentions: [taggableJid],
    });
    removePending(groupJid, userJid);
    return true;
  }

  return false;
}

module.exports = { startVerification, checkVerificationReply };
