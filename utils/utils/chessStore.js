const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./dataDir");

const DATA_FILE = path.join(DATA_DIR, "chessGames.json");

// In-memory cache, mirrored to disk so games survive restarts.
const GAMES = new Map(); // chatId -> game
const PLAYERS = new Map(); // jid -> chatId
const PENDING = new Map(); // challengerJid -> { target, chat, expiry }
const DRAW_OFFERS = new Map(); // chatId -> jid who offered the draw

function loadAllFromDisk() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    for (const [chatId, game] of Object.entries(data)) {
      GAMES.set(chatId, game);
      PLAYERS.set(game.white, chatId);
      PLAYERS.set(game.black, chatId);
    }
  } catch {
    // ignore corrupt file, start fresh
  }
}

function persist() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const obj = {};
  for (const [chatId, game] of GAMES.entries()) obj[chatId] = game;
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
}

loadAllFromDisk();

function getGame(chatId) {
  return GAMES.get(chatId) || null;
}

function saveGame(chatId, game) {
  GAMES.set(chatId, game);
  PLAYERS.set(game.white, chatId);
  PLAYERS.set(game.black, chatId);
  persist();
}

function endGame(chatId) {
  const game = GAMES.get(chatId);
  if (game) {
    PLAYERS.delete(game.white);
    PLAYERS.delete(game.black);
  }
  GAMES.delete(chatId);
  DRAW_OFFERS.delete(chatId);
  persist();
}

function isPlayerBusy(jid) {
  return PLAYERS.has(jid);
}

module.exports = {
  getGame,
  saveGame,
  endGame,
  isPlayerBusy,
  PENDING,
  DRAW_OFFERS,
};
