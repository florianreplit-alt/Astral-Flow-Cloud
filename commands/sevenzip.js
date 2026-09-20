const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const { promisify } = require("util");
const { exec: execCallback } = require("child_process");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { getQuotedMedia } = require("../utils/quotedMessage");

const exec = promisify(execCallback);

const FILE_TYPES = {
  video: { extensions: new Set(["mp4", "mkv", "avi", "webm"]), mimetype: "video/mp4" },
  image: { extensions: new Set(["jpg", "jpeg", "png", "gif", "webp"]), mimetype: "image/jpeg" },
  document: {
    extensions: new Set(["pdf", "epub", "docx", "txt", "apk", "apks"]),
    mimetypes: new Map([
      ["pdf", "application/pdf"],
      ["epub", "application/epub+zip"],
      ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["txt", "text/plain"],
      ["apk", "application/vnd.android.package-archive"],
    ]),
    defaultMimetype: "application/octet-stream",
  },
  audio: { extensions: new Set(["mp3", "wav", "ogg", "flac"]), mimetype: "audio/mpeg" },
};

function getFileDetails(fileName) {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  for (const [category, typeInfo] of Object.entries(FILE_TYPES)) {
    if (typeInfo.extensions.has(ext)) {
      return {
        category,
        mimetype: category === "document" ? typeInfo.mimetypes.get(ext) || typeInfo.defaultMimetype : typeInfo.mimetype,
      };
    }
  }
  return { category: "document", mimetype: FILE_TYPES.document.defaultMimetype };
}

// Sends a buffer back to the chat using the right Baileys message key
// (image/video/audio/document) for the detected file category.
async function sendFileByCategory(sock, from, msg, buffer, fileName, mimetype, caption) {
  const { category, mimetype: detectedMimetype } = getFileDetails(fileName);
  const finalMimetype = mimetype || detectedMimetype;

  if (category === "image") {
    await sock.sendMessage(from, { image: buffer, mimetype: finalMimetype, caption }, { quoted: msg });
  } else if (category === "video") {
    await sock.sendMessage(from, { video: buffer, mimetype: finalMimetype, caption }, { quoted: msg });
  } else if (category === "audio") {
    await sock.sendMessage(from, { audio: buffer, mimetype: finalMimetype }, { quoted: msg });
  } else {
    await sock.sendMessage(from, { document: buffer, fileName, mimetype: finalMimetype, caption }, { quoted: msg });
  }
}

class SevenZipUtility {
  constructor() {
    this.config = {
      tempDir: path.join(process.cwd(), "tmp"),
      maxFileSize: parseInt(process.env.MAX_UPLOAD, 10) * 1048576 || 100000000, // ~95MB default
      maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE, 10) || 50,
      compressTimeout: parseInt(process.env.COMPRESS_TIMEOUT, 10) || 300000, // 5 min
    };

    this.paths = {
      compressDir: path.join(this.config.tempDir, "compress_queue"),
      binDir: path.join(process.cwd(), "media", "bin", "7ZIP"),
      binaries: {
        windows: { x64: "7za.exe", arm64: "7za.exe" },
        linux: { x64: "7zzs", arm64: "7zzs" },
      },
    };

    this.queue = new Map();
    this.processing = false;
  }

  getBinaryPath() {
    const platform = os.platform();
    const arch = os.arch();
    const platformMap = platform === "win32" ? "windows" : "linux";
    const binaryName = this.paths.binaries[platformMap]?.[arch];

    if (!binaryName) throw new Error(`Unsupported platform: ${platform}-${arch}`);

    return path.join(
      this.paths.binDir,
      platformMap.charAt(0).toUpperCase() + platformMap.slice(1),
      arch,
      binaryName
    );
  }

  async ensureDirectories() {
    await Promise.all([
      fs.mkdir(this.config.tempDir, { recursive: true }),
      fs.mkdir(this.paths.compressDir, { recursive: true }),
      fs.mkdir(this.paths.binDir, { recursive: true }),
    ]);
  }

  async downloadBinaries() {
    const downloadUrl =
      "https://raw.githubusercontent.com/weskerty/MysticTools/ca1be99212b6c77c5822ae9f72cbceaa9dec1551/Utilidades/Binarios/7ZIP/7ZIP.tar";
    const tempTar = path.join(this.config.tempDir, "7ZIP.tar");

    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);

      const buffer = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(tempTar, buffer);
      await exec(`tar -xf "${tempTar}" -C "${path.dirname(this.paths.binDir)}"`);

      if (os.platform() !== "win32") {
        await exec(`chmod +x "${this.getBinaryPath()}"`);
      }
    } finally {
      await fs.unlink(tempTar).catch(() => {});
    }
  }

  async ensure7Zip() {
    try {
      const binaryPath = this.getBinaryPath();
      await fs.access(binaryPath);
      return binaryPath;
    } catch {
      await this.ensureDirectories();
      await this.downloadBinaries();
      return this.getBinaryPath();
    }
  }

  async addToQueue(sock, msg, filePath) {
    const quotedMedia = getQuotedMedia(msg);
    if (!quotedMedia) throw new Error("❌ Quote a file to add to the compression queue");

    if (!filePath || !filePath.trim()) throw new Error("❌ Specify a path and name for the file");

    const safePath = filePath
      .trim()
      .split(/[/\\]/)
      .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "_"))
      .join("/");

    const mediaBuffer = await downloadMediaMessage(quotedMedia.targetMsg, "buffer", {}, { logger: undefined });
    if (!mediaBuffer) throw new Error("❌ Error downloading the quoted file");

    if (mediaBuffer.length > this.config.maxFileSize) {
      throw new Error(`❌ Exceeds maximum size ${this.config.maxFileSize / 1048576}MB`);
    }

    if (this.queue.size >= this.config.maxQueueSize) {
      throw new Error(`❌ Full queue. Max ${this.config.maxQueueSize} files`);
    }

    const fullPath = path.join(this.paths.compressDir, safePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, mediaBuffer);

    this.queue.set(safePath, fullPath);
    return safePath;
  }

  async processQueue(sock, from, msg) {
    if (this.queue.size === 0) throw new Error("❌ There are no files in the compression queue");
    if (this.processing) throw new Error("❌ There is already a compression process underway");

    this.processing = true;
    const binaryPath = await this.ensure7Zip();
    const outputZip = path.join(this.config.tempDir, `compression_${Date.now()}.zip`);

    try {
      await sock.sendMessage(from, { text: "🔄 Compressing files..." }, { quoted: msg });

      const command = `"${binaryPath}" a "${outputZip}" "${this.paths.compressDir}/*"`;
      await Promise.race([
        exec(command),
        new Promise((_, reject) => setTimeout(() => reject(new Error("❌ Compression timed out")), this.config.compressTimeout)),
      ]);

      const fileBuffer = await fs.readFile(outputZip);
      await sock.sendMessage(
        from,
        {
          document: fileBuffer,
          fileName: path.basename(outputZip),
          mimetype: "application/zip",
          caption: `✅ ${this.queue.size} compressed files`,
        },
        { quoted: msg }
      );
    } finally {
      this.processing = false;
      this.queue.clear();
      await this.cleanup([outputZip, this.paths.compressDir]);
      await fs.mkdir(this.paths.compressDir, { recursive: true });
    }
  }

  async decompress(sock, from, msg) {
    const quotedMedia = getQuotedMedia(msg);
    if (!quotedMedia) {
      throw new Error(
        "ℹ️ Quote a compressed file to extract\n`.7zip add <path/name.ext>` to add\n`.7zip up` to compress and upload"
      );
    }

    const mediaBuffer = await downloadMediaMessage(quotedMedia.targetMsg, "buffer", {}, { logger: undefined });
    if (!mediaBuffer) throw new Error("❌ Error downloading the file");

    const binaryPath = await this.ensure7Zip();
    const fileName = quotedMedia.fileName || `archive_${Date.now()}.zip`;
    const tempPath = path.join(this.config.tempDir, fileName);
    const outputDir = path.join(this.config.tempDir, `extract_${Date.now()}`);

    try {
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(tempPath, mediaBuffer);

      await sock.sendMessage(from, { text: "🔄 Extracting..." }, { quoted: msg });
      await exec(`"${binaryPath}" x "${tempPath}" -o"${outputDir}" -y`);

      const processDirectory = async (dir, baseDir = "") => {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.join(baseDir, entry.name).replace(/\\/g, "/");

          if (entry.isFile()) {
            const fileBuffer = await fs.readFile(fullPath);
            await sendFileByCategory(sock, from, msg, fileBuffer, entry.name, null, `📁 ${relativePath}`);
          } else if (entry.isDirectory()) {
            await processDirectory(fullPath, relativePath);
          }
        }
      };

      await processDirectory(outputDir);
      await sock.sendMessage(from, { text: "✅ Extraction complete" }, { quoted: msg });
    } finally {
      await this.cleanup([tempPath, outputDir]);
    }
  }

  async cleanup(paths) {
    for (const p of paths) {
      await fs.rm(p, { recursive: true, force: true }).catch(() => {});
    }
  }
}

const sevenZipUtility = new SevenZipUtility();

/**
 * .7zip                       — extract a quoted archive
 * .7zip add <path/name.ext>   — add a quoted file to the compression queue
 * .7zip up                    — compress the queue and send it back as a zip
 */
async function sevenZip(sock, msg, argText) {
  const from = msg.key.remoteJid;
  const command = (argText || "").trim();

  try {
    if (command.startsWith("add ")) {
      const filePath = command.slice(4).trim();
      const safePath = await sevenZipUtility.addToQueue(sock, msg, filePath);
      return `✅ Added *${safePath}*`;
    } else if (command === "up") {
      await sevenZipUtility.processQueue(sock, from, msg);
      return null;
    } else {
      await sevenZipUtility.decompress(sock, from, msg);
      return null;
    }
  } catch (error) {
    console.error("Error in .7zip:", error);
    return error.message || "❌ 7zip command failed.";
  }
}

module.exports = { sevenZip, SevenZipUtility: sevenZipUtility };
