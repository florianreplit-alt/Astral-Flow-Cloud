// In-memory store of pending verifications, keyed by `${groupJid}:${userJid}`.
// Verification state doesn't need to survive a restart — if the bot restarts
// mid-verification, the join event is gone anyway, so this is fine as a Map.
const pending = new Map();

function key(groupJid, userJid) {
  return `${groupJid}:${userJid}`;
}

function addPending(groupJid, userJid, data) {
  pending.set(key(groupJid, userJid), data);
}

function getPending(groupJid, userJid) {
  return pending.get(key(groupJid, userJid));
}

function removePending(groupJid, userJid) {
  const entry = pending.get(key(groupJid, userJid));
  if (entry?.timeout) clearTimeout(entry.timeout);
  pending.delete(key(groupJid, userJid));
}

module.exports = { addPending, getPending, removePending };
