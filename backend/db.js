// db.js — SQLite ma'lumotlar bazasini ochish/yaratish
const path = require("path");
const Database = require("better-sqlite3");

const fs = require("fs");

const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, "uvix.db"));
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const existedBefore = fs.existsSync(DB_PATH);
const db = new Database(DB_PATH);

// ---- Baza doimiy diskdami? ----
// Railway'da Volume ulanmagan bo'lsa, har bir deploy'da konteyner yangidan yaratiladi va
// baza fayli BO'SH holatga qaytadi (barcha buyurtma, rasxod, lidlar yo'qoladi).
// Railway Volume ulanganda RAILWAY_VOLUME_MOUNT_PATH o'zgaruvchisini o'zi beradi.
function storageStatus() {
  const onRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
  const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH ? path.resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH) : "";
  if (!onRailway) return { persistent: true, onRailway: false, problem: null };
  if (!mount) return { persistent: false, onRailway: true, problem: "no_volume" };
  if (!(DB_PATH === mount || DB_PATH.startsWith(mount + path.sep))) return { persistent: false, onRailway: true, problem: "db_not_on_volume", mount };
  return { persistent: true, onRailway: true, problem: null, mount };
}
const STORAGE = storageStatus();
if (!STORAGE.persistent) {
  const line = "!".repeat(78);
  console.error(`\n${line}\n DIQQAT: baza fayli DOIMIY DISKDA EMAS (${STORAGE.problem}).\n Har bir deploy'da barcha ma'lumotlar o'chib ketadi!\n Railway → Settings → Volumes: Mount path = /data, Variables: DB_PATH=/data/uvix.db\n Hozirgi DB_PATH: ${DB_PATH}${STORAGE.mount ? `, Volume: ${STORAGE.mount}` : ""}\n${line}\n`);
}

db.pragma("journal_mode = WAL");

// Oddiy key-value jadval: frontend har bir "bo'lim"ni (transactions, employees,
// categories, audit) bitta JSON qiymat sifatida shu yerda saqlaydi.
// Bu Claude artifact'dagi window.storage bilan bir xil ishlaydi, shuning
// uchun frontend kodini deyarli o'zgartirmasdan ko'chirish mumkin bo'ldi.
db.exec(`
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
module.exports.DB_PATH = DB_PATH;
module.exports.STORAGE = STORAGE;
module.exports.EXISTED_BEFORE = existedBefore;
