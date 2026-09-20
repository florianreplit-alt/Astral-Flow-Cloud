const fs = require("fs");
const path = require("path");
const { extractText } = require("../utils/extractText");
const { buildMenu, PREFIX } = require("../commands/menu");
const { getTime, getDate, getTimeForCountry } = require("../commands/datetime");
const { calculate } = require("../commands/calc");
const { shortenUrl } = require("../commands/shorten");
const { generateQr } = require("../commands/qr");
const { makeSticker } = require("../commands/sticker");
const { stealSticker } = require("../commands/steal");
const { generateStickerPack } = require("../commands/stickerpack");
const { cmdPill, cmdPillInfo, cmdPillUrl, cmdPillDl, cmdPillHelp } = require("../commands/mangapill");
const { giveTrusted, removeTrustedUser } = require("../commands/trust");
const { showProfile } = require("../commands/profile");
const { isOwnerMessage } = require("../utils/owner");
const { isTrusted } = require("../utils/trustedUsers");
const { extractTargetJid } = require("../utils/targetJid");
const { pingResponse, aboutText } = require("../commands/misc");
const {
  kickUser,
  promoteUser,
  demoteUser,
  addUser,
  tagAll,
  hideTag,
  muteGroup,
  unmuteGroup,
  setGroupName,
  setGroupDesc,
} = require("../commands/group/moderation");
const { playSong } = require("../commands/downloaders/play");
const { cmdCloud } = require("../commands/cloud");
const {
  downloadTikTok,
  downloadInstagram,
  downloadPinterest,
  downloadFacebook,
  downloadAuto,
} = require("../commands/downloaders/media");
const { toggleSetting } = require("../commands/group/settings");
const { groupGuard } = require("../middleware/groupGuard");
const { checkVerificationReply } = require("../middleware/joinVerification");
const { tenorSticker } = require("../commands/tenor");
const { sevenZip } = require("../commands/sevenzip");
const { animeSearch } = require("../commands/anime");
const { movieSearch } = require("../commands/movie");
const { playChess } = require("../commands/games/chess");
const { joinGroup, leaveGroup } = require("../commands/group/joinLeave");

const MENU_IMAGE = path.join(__dirname, "..", "assets", "cloud.jpg");

async function handleMessage(sock, msg) {
  const from = msg.key.remoteJid;

  // Moderation check runs on every group message, before command parsing.
  const actioned = await groupGuard(sock, msg).catch((err) => {
    console.error("groupGuard error:", err);
    return false;
  });
  if (actioned) return;

  const text = extractText(msg);

  // If the sender has a pending join-verification, treat their message as
  // an answer attempt instead of routing it as a command.
  const verificationHandled = await checkVerificationReply(sock, msg, text).catch((err) => {
    console.error("checkVerificationReply error:", err);
    return false;
  });
  if (verificationHandled) return;

  if (!text.startsWith(PREFIX)) return;

  // DMs (not groups) only work for the owner. A group JID ends in
  // "@g.us"; anything else here (mainly "@s.whatsapp.net") is a 1:1 chat.
  const isGroup = from.endsWith("@g.us");
  if (!isGroup && !isOwnerMessage(msg)) return;

  // React on every message that's actually going to be treated as a
  // command (passed the prefix + DM/owner checks above) — fire-and-forget,
  // a failed react shouldn't ever block the command itself from running.
  sock.sendMessage(from, { react: { text: "☁️", key: msg.key } }).catch(() => {});

  const startMs = Date.now();
  const [rawCommand, ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
  const command = rawCommand.toLowerCase();
  const argText = args.join(" ");

  const pushName = msg.pushName || "there";

  switch (command) {
    case "menu":
    case "help": {
      const menuText = buildMenu(pushName);

      if (fs.existsSync(MENU_IMAGE)) {
        await sock.sendMessage(
          from,
          { image: fs.readFileSync(MENU_IMAGE), caption: menuText },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(from, { text: menuText }, { quoted: msg });
      }
      break;
    }

    case "time": {
      const result = argText ? getTimeForCountry(argText) : getTime();
      await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "date": {
      await sock.sendMessage(from, { text: getDate() }, { quoted: msg });
      break;
    }

    case "ping": {
      await sock.sendMessage(from, { text: pingResponse(startMs) }, { quoted: msg });
      break;
    }

    case "about": {
      await sock.sendMessage(from, { text: aboutText() }, { quoted: msg });
      break;
    }

    case "calc": {
      const result = calculate(argText);
      await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "shorten": {
      const result = await shortenUrl(argText);
      await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "qr": {
      const { buffer, error } = await generateQr(argText);
      if (error) {
        await sock.sendMessage(from, { text: error }, { quoted: msg });
      } else {
        await sock.sendMessage(
          from,
          { image: buffer, caption: "📱 Here's your QR code" },
          { quoted: msg }
        );
      }
      break;
    }

    case "sticker":
    case "s": {
      const { buffer, error } = await makeSticker(sock, msg);
      if (error) {
        await sock.sendMessage(from, { text: error }, { quoted: msg });
      } else {
        await sock.sendMessage(from, { sticker: buffer }, { quoted: msg });
      }
      break;
    }

    case "steal": {
      const { buffer, error } = await stealSticker(sock, msg);
      if (error) {
        await sock.sendMessage(from, { text: error }, { quoted: msg });
      } else {
        await sock.sendMessage(from, { sticker: buffer }, { quoted: msg });
      }
      break;
    }

    case "stickerpack":
    case "sp": {
      const senderJid = msg.key.participant || msg.key.remoteJid;
      if (!isOwnerMessage(msg) && !isTrusted(senderJid)) {
        await sock.sendMessage(from, { text: "⚠️ This command is owner/trusted only." }, { quoted: msg });
        break;
      }
      const result = await generateStickerPack(sock, msg, argText);
      if (result) await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "pill":
    case "pilldl":
    case "pillurl":
    case "pillinfo":
    case "pillhelp": {
      const senderJid = msg.key.participant || msg.key.remoteJid;
      if (!isOwnerMessage(msg) && !isTrusted(senderJid)) {
        await sock.sendMessage(from, { text: "⚠️ This command is owner/trusted only." }, { quoted: msg });
        break;
      }
      let result;
      if (command === "pill") result = await cmdPill(sock, msg, argText);
      else if (command === "pilldl") result = await cmdPillDl(sock, msg, argText);
      else if (command === "pillurl") result = await cmdPillUrl(sock, msg, argText);
      else if (command === "pillinfo") result = cmdPillInfo(msg);
      else result = cmdPillHelp();
      if (result) await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "givetrusted": {
      const result = await giveTrusted(msg, argText);
      const targetJid = extractTargetJid(msg, argText);
      await sock.sendMessage(from, { text: result, mentions: targetJid ? [targetJid] : [] }, { quoted: msg });
      break;
    }

    case "removetrusted": {
      const result = await removeTrustedUser(msg, argText);
      const targetJid = extractTargetJid(msg, argText);
      await sock.sendMessage(from, { text: result, mentions: targetJid ? [targetJid] : [] }, { quoted: msg });
      break;
    }

    case "me":
    case "info": {
      const { image, caption, mentions } = await showProfile(sock, msg, argText);
      if (image) {
        await sock.sendMessage(from, { image, caption, mentions }, { quoted: msg });
      } else {
        await sock.sendMessage(from, { text: caption, mentions }, { quoted: msg });
      }
      break;
    }

    case "kick": {
      const result = await kickUser(sock, msg, argText);
      await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "promote": {
      const result = await promoteUser(sock, msg, argText);
      await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "demote": {
      const result = await demoteUser(sock, msg, argText);
      await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "add": {
      const result = await addUser(sock, msg, argText);
      await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "tagall": {
      const result = await tagAll(sock, msg, argText);
      await sock.sendMessage(from, result, { quoted: msg });
      break;
    }

    case "hidetag": {
      const result = await hideTag(sock, msg, argText);
      await sock.sendMessage(from, result, { quoted: msg });
      break;
    }

    case "mute": {
      const result = await muteGroup(sock, msg);
      await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "unmute": {
      const result = await unmuteGroup(sock, msg);
      await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "setname": {
      const result = await setGroupName(sock, msg, argText);
      await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "setdesc": {
      const result = await setGroupDesc(sock, msg, argText);
      await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "antilink":
    case "antistatus":
    case "antichannel":
    case "antispam":
    case "welcome": {
      const label = command.charAt(0).toUpperCase() + command.slice(1);
      const result = await toggleSetting(sock, msg, command, argText, label);
      await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "play": {
      const result = await playSong(sock, msg, argText);
      if (result.audio) {
        await sock.sendMessage(from, result, { quoted: msg });
      } else {
        await sock.sendMessage(from, { text: result.text }, { quoted: msg });
      }
      break;
    }

    case "cloud": {
      // cmdCloud can return a text / image+caption / audio / document
      // shaped object depending on what it routed to, or null when the
      // underlying command already sent its own message (e.g. a
      // successful download_media call) — all are already valid Baileys
      // message objects, so just spread whichever comes back.
      const result = await cmdCloud(sock, msg, argText);
      if (result) await sock.sendMessage(from, result, { quoted: msg });
      break;
    }

    case "tiktok":
    case "tt": {
      const error = await downloadTikTok(sock, msg, argText);
      if (error) await sock.sendMessage(from, { text: error }, { quoted: msg });
      break;
    }

    case "ig":
    case "instagram": {
      const error = await downloadInstagram(sock, msg, argText);
      if (error) await sock.sendMessage(from, { text: error }, { quoted: msg });
      break;
    }

    case "pinterest":
    case "pin": {
      const error = await downloadPinterest(sock, msg, argText);
      if (error) await sock.sendMessage(from, { text: error }, { quoted: msg });
      break;
    }

    case "fb":
    case "facebook": {
      const error = await downloadFacebook(sock, msg, argText);
      if (error) await sock.sendMessage(from, { text: error }, { quoted: msg });
      break;
    }

    case "dl":
    case "download": {
      const error = await downloadAuto(sock, msg, argText);
      if (error) await sock.sendMessage(from, { text: error }, { quoted: msg });
      break;
    }

    case "tenor": {
      const error = await tenorSticker(sock, from, msg, argText);
      if (error) await sock.sendMessage(from, { text: error }, { quoted: msg });
      break;
    }

    case "7zip": {
      const result = await sevenZip(sock, msg, argText);
      if (result) await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "anime": {
      const result = await animeSearch(argText);
      if (typeof result === "string") {
        await sock.sendMessage(from, { text: result }, { quoted: msg });
      } else {
        await sock.sendMessage(from, { image: { url: result.image }, caption: result.caption }, { quoted: msg });
      }
      break;
    }

    case "movie":
    case "omdb": {
      const result = await movieSearch(argText);
      if (typeof result === "string") {
        await sock.sendMessage(from, { text: result }, { quoted: msg });
      } else {
        await sock.sendMessage(from, { image: { url: result.image }, caption: result.caption }, { quoted: msg });
      }
      break;
    }

    case "chess": {
      const result = await playChess(sock, msg, argText);
      if (result) {
        await sock.sendMessage(from, result, { quoted: msg });
      }
      break;
    }

    case "join": {
      const result = await joinGroup(sock, msg, argText);
      if (result) await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    case "leave": {
      const result = await leaveGroup(sock, msg);
      if (result) await sock.sendMessage(from, { text: result }, { quoted: msg });
      break;
    }

    default: {
      await sock.sendMessage(
        from,
        { text: `❓ Unknown command. Type *${PREFIX}menu* to see what I can do.` },
        { quoted: msg }
      );
    }
  }
}

module.exports = { handleMessage };
