// In-memory only — resets on restart, which is fine for spam bursts (not historical).
const userMessageLog = new Map(); // key: `${groupJid}:${senderJid}` -> array of timestamps

const SPAM_WINDOW_MS = 7000; // 7 second window
const SPAM_THRESHOLD = 6; // more than 6 messages in the window = spam

function recordAndCheckSpam(groupJid, senderJid) {
  const key = `${groupJid}:${senderJid}`;
  const now = Date.now();

  const timestamps = (userMessageLog.get(key) || []).filter(
    (t) => now - t < SPAM_WINDOW_MS
  );
  timestamps.push(now);
  userMessageLog.set(key, timestamps);

  return timestamps.length > SPAM_THRESHOLD;
}

module.exports = { recordAndCheckSpam };
