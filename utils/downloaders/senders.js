const {
  fetchTikTok,
  fetchInstagram,
  fetchPinterest,
  fetchFacebook,
} = require("./fetchers");

async function sendVideo(sock, from, msg, url) {
  return sock.sendMessage(from, { video: { url }, mimetype: "video/mp4" }, { quoted: msg });
}

async function sendImage(sock, from, msg, url) {
  return sock.sendMessage(from, { image: { url } }, { quoted: msg });
}

async function sendTikTok(sock, from, msg, url) {
  const r = await fetchTikTok(url);
  if (r.type === "video") {
    await sendVideo(sock, from, msg, r.data);
  } else {
    for (const img of r.data) {
      await sendImage(sock, from, msg, img);
    }
  }
}

async function sendInstagram(sock, from, msg, url) {
  const { urls, isVideo } = await fetchInstagram(url);
  if (!urls?.length) throw new Error("no media found");
  for (const link of urls) {
    if (isVideo) await sendVideo(sock, from, msg, link);
    else await sendImage(sock, from, msg, link);
  }
}

async function sendPinterest(sock, from, msg, url) {
  const meds = await fetchPinterest(url);
  if (!meds?.length) throw new Error("no media found");

  const imgs = meds.filter((m) => m.type === "image");
  if (imgs.length) {
    for (const img of imgs) {
      await sendImage(sock, from, msg, img.url);
    }
    return;
  }

  const vid = meds.find((m) => m.type === "video");
  const gif = meds.find((m) => m.type === "gif");
  if (vid) {
    await sendVideo(sock, from, msg, vid.url);
  } else if (gif) {
    await sock.sendMessage(from, { video: { url: gif.url }, gifPlayback: true }, { quoted: msg });
  }
}

async function sendFacebook(sock, from, msg, url) {
  const med = await fetchFacebook(url);
  if (med.video_hd || med.video_sd) {
    await sendVideo(sock, from, msg, med.video_hd || med.video_sd);
  } else if (med.photo_image) {
    await sendImage(sock, from, msg, med.photo_image);
  } else {
    throw new Error("no downloadable media found");
  }
}

const SENDERS = { tt: sendTikTok, ig: sendInstagram, pin: sendPinterest, fb: sendFacebook };

module.exports = { SENDERS, sendTikTok, sendInstagram, sendPinterest, sendFacebook };
