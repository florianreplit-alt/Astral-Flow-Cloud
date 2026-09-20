const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./dataDir");

const DATA_FILE = path.join(DATA_DIR, "groupSettings.json");

const DEFAULT_SETTINGS = {
  antilink: true,
  antistatus: true,
  antichannel: true,
  antispam: true,
  welcome: false,
};

function loadAll() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveAll(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getSettings(groupJid) {
  const all = loadAll();
  return { ...DEFAULT_SETTINGS, ...(all[groupJid] || {}) };
}

function setSetting(groupJid, key, value) {
  const all = loadAll();
  all[groupJid] = { ...DEFAULT_SETTINGS, ...(all[groupJid] || {}), [key]: value };
  saveAll(all);
  return all[groupJid];
}

module.exports = { getSettings, setSetting, DEFAULT_SETTINGS };
