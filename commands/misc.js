function pingResponse(startMs) {
  const ms = Date.now() - startMs;
  return `🏓 *Pong!*\n${ms}ms`;
}

function aboutText() {
  return `☁️ *Astral Cloud*
A small, fast WhatsApp utility bot.

Built with Baileys.
Type *.menu* to see what I can do.`;
}

module.exports = { pingResponse, aboutText };
