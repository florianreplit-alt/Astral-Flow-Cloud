const QRCode = require("qrcode");

async function generateQr(text) {
  if (!text || !text.trim()) {
    return { error: "⚠️ Usage: .qr your text or link here" };
  }

  try {
    const buffer = await QRCode.toBuffer(text.trim(), {
      width: 512,
      margin: 2,
    });
    return { buffer };
  } catch {
    return { error: "⚠️ Couldn't generate a QR code for that." };
  }
}

module.exports = { generateQr };
