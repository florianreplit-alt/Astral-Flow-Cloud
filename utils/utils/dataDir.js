const fs = require("fs");
const path = require("path");

// Resolves where persistent files (auth session, JSON stores) should live.
//
// On platforms that mount a persistent volume at /data (Railway, Render,
// Fly.io, etc.), we store everything under /data so it survives restarts
// and redeploys, which otherwise wipe the container's own filesystem.
//
// Locally (or on a platform with no such volume), we fall back to a
// "data" folder inside the project so nothing breaks in dev.
//
// Override explicitly with the DATA_DIR env var if needed.

function resolveBaseDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (fs.existsSync("/data")) return "/data";
  return path.join(__dirname, "..", "..");
}

const BASE_DIR = resolveBaseDir();

const AUTH_DIR = path.join(BASE_DIR, "auth_info");
const DATA_DIR = path.join(BASE_DIR, "data");

// Make sure both exist up front so downstream fs.writeFileSync calls
// never fail on a missing parent directory.
fs.mkdirSync(AUTH_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

module.exports = { BASE_DIR, AUTH_DIR, DATA_DIR };
