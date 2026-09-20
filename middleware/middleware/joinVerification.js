const { getSettings } = require("../utils/groupSettings");
const { isBotAdmin } = require("../utils/groupPermissions");
const { addPending, getPending, removePending } = require("../utils/verificationStore");

const VERIFY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function randomMathQuestion() {
  const a = Math.floor(Math.random() * 8) + 1; // 1-8
  const b = Math.floor(Math.random() * 8) + 1; // 1-8
  return { a, b, answer: a + b };
}

function mention(jid) {
  return `@${jid.split("@")[0]}`;
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

  const { a, b, answer } = randomMathQuestion();

  const timeout = setTimeout(async () => {
    const entry = getPending(groupJid, userJid);
    if (!entry) return; // already verified or cleared
    removePending(groupJid, userJid);

    if (botAdmin) {
      try {
        await sock.groupParticipantsUpdate(groupJid, [userJid], "remove");
        await sock.sendMessage(groupJid, {
          text: `⏱️ ${mention(userJid)} didn't complete verification in time and was removed.`,
          mentions: [userJid],
        });
      } catch (err) {
        console.error("verification timeout kick failed:", err);
      }
    } else {
      await sock.sendMessage(groupJid, {
        text: `⏱️ ${mention(userJid)} didn't complete verification in time, but I'm not an admin here so I can't remove them.`,
        mentions: [userJid],
      });
    }
  }, VERIFY_TIMEOUT_MS);

  addPending(groupJid, userJid, { answer, stage: "math", timeout });

  await sock.sendMessage(groupJid, {
    text:
      `👋 Welcome ${mention(userJid)}!\n\n` +
      `To make sure you're human, please solve: *${a} + ${b} = ?*\n` +
      `Just reply with the number. You have 5 minutes.`,
    mentions: [userJid],
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

  if (entry.stage === "math") {
    const reply = text.trim();
    const num = Number(reply.match(/-?\d+/)?.[0]);

    if (!Number.isNaN(num) && num === entry.answer) {
      clearTimeout(entry.timeout);
      addPending(groupJid, userJid, { stage: "profile" }); // keep entry but drop the timer, no further kick risk

      await sock.sendMessage(groupJid, {
        text:
          `✅ ${mention(userJid)} verified, welcome aboard!\n\n` +
          `While you're here, tell us a bit about yourself:\n` +
          `• Your name\n` +
          `• Your age\n` +
          `• Best anime\n` +
          `• Worst anime\n` +
          `• Year you started watching anime`,
        mentions: [userJid],
      });
      return true;
    }

    // wrong answer — ignore and let them keep trying until the timeout fires
    return false;
  }

  if (entry.stage === "profile") {
    // Profile step is informational only — just acknowledge and clear.
    await sock.sendMessage(groupJid, {
      text: `🎉 Thanks for sharing, ${mention(userJid)}! Enjoy the group.`,
      mentions: [userJid],
    });
    removePending(groupJid, userJid);
    return true;
  }

  return false;
}

module.exports = { startVerification, checkVerificationReply };
