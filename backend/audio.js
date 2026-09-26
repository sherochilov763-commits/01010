// audio.js — ovozli xabarlar formatini o'girish (ffmpeg orqali)
//
// • Brauzer yozgan ovoz (webm/opus yoki iPhone'da mp4/aac) → Telegram "voice" formati (OGG/Opus).
//   Faqat shu formatda Telegram uni to'lqinli ovozli xabar sifatida ko'rsatadi.
// • Telegram'dan kelgan ovoz (OGG/Opus) → M4A (AAC). iPhone Safari OGG'ni ijro eta olmaydi,
//   M4A esa hamma brauzerda ishlaydi.
// ffmpeg bo'lmasa — asl fayl ishlatiladi (ovoz baribir yuboriladi, faqat audio-fayl sifatida).
const { spawn, spawnSync } = require("child_process");

let ffmpegChecked = null;
function hasFfmpeg() {
  if (ffmpegChecked === null) {
    try {
      ffmpegChecked = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
    } catch {
      ffmpegChecked = false;
    }
    if (!ffmpegChecked) console.warn("ffmpeg topilmadi — ovozli xabarlar audio-fayl sifatida yuboriladi");
  }
  return ffmpegChecked;
}

function run(args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("ffmpeg vaqti tugadi")); }, timeoutMs);
    p.on("close", (code) => { clearTimeout(t); code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg ${code}`)); });
    p.on("error", (e) => { clearTimeout(t); reject(e); });
  });
}

// Davomiylik (soniya) — Telegram voice attribute uchun
function probeDuration(file) {
  try {
    const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8", timeout: 15000 });
    const d = parseFloat(r.stdout);
    return Number.isFinite(d) ? Math.max(1, Math.round(d)) : 0;
  } catch {
    return 0;
  }
}

async function toTelegramVoice(inputPath, outputPath) {
  if (!hasFfmpeg()) return null;
  await run(["-i", inputPath, "-vn", "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k", "-application", "voip", outputPath]);
  return outputPath;
}

async function toPlayableM4a(inputPath, outputPath) {
  if (!hasFfmpeg()) return null;
  await run(["-i", inputPath, "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", outputPath]);
  return outputPath;
}

module.exports = { hasFfmpeg, toTelegramVoice, toPlayableM4a, probeDuration };
