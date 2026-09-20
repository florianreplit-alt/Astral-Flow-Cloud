require("dotenv").config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const path = require("path");

const { handleMessage } = require("./handlers/router");
const { startVerification } = require("./middleware/joinVerification");
const { getSettings } = require("./utils/groupSettings");

const { AUTH_DIR } = require("./utils/dataDir");

// Hardcoded bot number for pairing (digits only, country code + number, no + or spaces).
const BOT_NUMBER = "2347017869953";

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const silentLogger = pino({ level: "silent" });

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      // Rapid signal-session key lookups during pairing can desync without
      // this cache and cause WhatsApp to kill the connection almost
      // immediately (a fast 401 right after the code is issued) — this is
      // the most likely cause of the instant "couldn't link device" reject.
      keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
    },
    logger: silentLogger,
    printQRInTerminal: false,
    // A recognized Baileys browser preset instead of a custom identity
    // string — unrecognized browser identities are more likely to get
    // flagged by WhatsApp's pairing endpoint.
    browser: Browsers.ubuntu("Chrome"),
    markOnlineOnConnect: true,
    keepAliveIntervalMs: 25_000,
    // The actual "60 second timer": without this Baileys falls back to a
    // shorter default connect timeout, which can cut the handshake before
    // pairing finishes.
    connectTimeoutMs: 60_000,
  });

  // Pairing-code flow: only needed the first time, before a session exists.
  // Once auth_info/creds.json exists, sock.authState.creds.registered is
  // true and Baileys skips straight to reconnecting with the saved session.
  if (!sock.authState.creds.registered) {
    const requestCode = async (attempt = 1) => {
      try {
        console.log(`Requesting pairing code for +${BOT_NUMBER} (attempt ${attempt}) ...`);
        const code = await sock.requestPairingCode(BOT_NUMBER);
        console.log("═══════════════════════════════════");
        console.log(`  Pairing code: ${code}`);
        console.log("  Enter this in WhatsApp > Linked Devices > Link with phone number (within 60s)");
        console.log("═══════════════════════════════════");
      } catch (err) {
        if (attempt < 5) {
          console.log(`Pairing code request failed (${err.message}), retrying in 3s...`);
          setTimeout(() => requestCode(attempt + 1), 3000);
        } else {
          console.error("Failed to request pairing code after multiple attempts:", err);
        }
      }
    };

    // Give the socket a moment to establish its connection before asking
    // for a pairing code, otherwise WhatsApp can reject the request.
    setTimeout(() => requestCode(), 3000);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        "Connection closed. Reconnecting:",
        shouldReconnect,
        "| Status code:",
        statusCode
      );

      if (shouldReconnect) {
        startBot();
      } else {
        console.log("Logged out. Delete the auth_info folder and restart to re-pair.");
      }
    } else if (connection === "open") {
      console.log("✅ Astral Cloud is connected and online.");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    try {
      await handleMessage(sock, msg);
    } catch (err) {
      console.error("Error handling message:", err);
    }
  });

  sock.ev.on("group-participants.update", async (update) => {
    const { id: groupJid, participants, action } = update;
    if (action !== "add") return;

    try {
      const settings = getSettings(groupJid);
      if (!settings.welcome) return;

      for (const userJid of participants) {
        await startVerification(sock, groupJid, userJid);
      }
    } catch (err) {
      console.error("Error handling group join:", err);
    }
  });

  return sock;
}

startBot().catch((err) => {
  console.error("Fatal error starting Astral Cloud:", err);
  process.exit(1);
});
