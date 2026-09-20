const fonts = require("../utils/fonts");

const PREFIX = ".";

function buildMenu(pushName) {
  return `${fonts.mono(`Hi ${pushName}, I'm Cloud`)} ☁️
${fonts.mono("your personal utility bot.")}

🌐 https://astralcloud.vercel.app/

⏰ ${fonts.mono("Time")}
${PREFIX}time · ${PREFIX}date

🔧 ${fonts.mono("Utilities")}
${PREFIX}sticker · ${PREFIX}steal · ${PREFIX}calc
${PREFIX}shorten · ${PREFIX}qr · ${PREFIX}tenor · ${PREFIX}7zip
${PREFIX}stickerpack 🔒 · ${PREFIX}pill 🔒

📥 ${fonts.mono("Downloaders")}
${PREFIX}play · ${PREFIX}tiktok · ${PREFIX}ig
${PREFIX}pinterest · ${PREFIX}fb · ${PREFIX}dl

🎮 ${fonts.mono("Games")}
${PREFIX}chess · ${PREFIX}anime · ${PREFIX}movie

🤖 ${fonts.mono("AI")}
${PREFIX}cloud <ask anything>

⚙️ ${fonts.mono("Settings")}
${PREFIX}kick · ${PREFIX}promote · ${PREFIX}demote · ${PREFIX}add
${PREFIX}tagall · ${PREFIX}hidetag · ${PREFIX}mute · ${PREFIX}unmute
${PREFIX}setname · ${PREFIX}setdesc
${PREFIX}antilink · ${PREFIX}antistatus · ${PREFIX}antichannel · ${PREFIX}antispam · ${PREFIX}welcome
${PREFIX}givetrusted · ${PREFIX}removetrusted 👑

ℹ️ ${fonts.mono("Info")}
${PREFIX}ping · ${PREFIX}about · ${PREFIX}me · ${PREFIX}join · ${PREFIX}leave

🔒 owner/trusted only · 👑 owner only`;
}

module.exports = { buildMenu, PREFIX };
