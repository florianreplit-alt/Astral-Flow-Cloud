const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./dataDir");

const DATA_FILE = path.join(DATA_DIR, "trustedUsers.json");

function bareDigits(jid) {
  return (jid || "").split("@")[0].split(":")[0];
}

function loadAll() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveAll(list) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

function isTrusted(jid) {
  const digits = bareDigits(jid);
  if (!digits) return false;
  return loadAll().includes(digits);
}

function addTrusted(jid) {
  const digits = bareDigits(jid);
  if (!digits) return false;
  const all = loadAll();
  if (!all.includes(digits)) {
    all.push(digits);
    saveAll(all);
  }
  return true;
}

function removeTrusted(jid) {
  const digits = bareDigits(jid);
  const all = loadAll();
  const next = all.filter((d) => d !== digits);
  saveAll(next);
  return next.length !== all.length;
}

module.exports = { isTrusted, addTrusted, removeTrusted };
