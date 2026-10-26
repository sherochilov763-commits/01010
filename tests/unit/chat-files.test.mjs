// Chat fayllari (chat-files.js): guruhlash, tozalash — biriktirilgan fayl hech qachon o'chmaydi
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
const breq = createRequire(path.resolve(here, "../../backend/package.json"));
const CF = breq("./chat-files.js");
const Database = breq("better-sqlite3");

const DAY = 86400000;
const NOW = Date.parse("2026-10-27T12:00:00Z");
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();

test("classify: biriktirilgan / eski / yangi / yetim", () => {
  const files = [
    { name: "order1.jpg", size: 10, mtimeMs: NOW - 100 * DAY }, // buyurtmada
    { name: "tgold.mp4", size: 100, mtimeMs: NOW - 90 * DAY }, // faqat chatda, 90 kun
    { name: "tgnew.jpg", size: 20, mtimeMs: NOW - 2 * DAY }, // faqat chatda, 2 kun
    { name: "dup123.jpg", size: 50, mtimeMs: NOW - 5 * DAY }, // hech qayerda — yetim
    { name: "fresh99.jpg", size: 5, mtimeMs: NOW - 3600 * 1000 }, // hech qayerda, lekin 1 soatlik — yetim emas
    { name: "both11.jpg", size: 7, mtimeMs: NOW - 200 * DAY }, // chatda ham, dizayn vazifasida ham — biriktirilgan
  ];
  const msgs = { 1: [
    { mediaUrl: "/api/photos/tgold.mp4", date: iso(90) },
    { mediaUrl: "/api/photos/tgnew.jpg", date: iso(2) },
    { mediaUrl: "/api/photos/both11.jpg", date: iso(200) },
  ] };
  const otherText = JSON.stringify({ orders: [{ photos: [{ filename: "order1.jpg" }] }], design: { att: "/api/photos/both11.jpg" } });
  const g = CF.classify({ files, otherText, msgs, keepDays: 60, now: NOW });
  const names = (k) => g[k].map((f) => f.name).sort();
  assert.deepEqual(names("attached"), ["both11.jpg", "order1.jpg"]);
  assert.deepEqual(names("old"), ["tgold.mp4"]);
  assert.deepEqual(names("orphan"), ["dup123.jpg"]);
  assert.deepEqual(names("recent"), ["fresh99.jpg", "tgnew.jpg"]);
  const forever = CF.classify({ files, otherText, msgs, keepDays: 0, now: NOW });
  assert.equal(forever.old.length, 0, "cheksiz — eski yo'q");
});

test("cleanConfig: standart 60 kun, video ochilganda, avtomatik; noto'g'ri qiymat — standart", () => {
  assert.deepEqual(CF.cleanConfig(null), { lazyDocs: true, keepDays: 60, autoClean: true });
  assert.equal(CF.cleanConfig({ keepDays: 45 }).keepDays, 60);
  assert.equal(CF.cleanConfig({ keepDays: 0 }).keepDays, 0);
});

test("clean: yetim va eski o'chadi, xabarda «mediaGone», buyurtma rasmi qoladi", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uvix-cf-"));
  const up = path.join(dir, "uploads"); fs.mkdirSync(up);
  const put = (n, daysAgo) => { const p = path.join(up, n); fs.writeFileSync(p, "x".repeat(10)); const t = (NOW - daysAgo * DAY) / 1000; fs.utimesSync(p, t, t); };
  put("order1.jpg", 100); put("tgold.mp4", 90); put("tgnew.jpg", 1); put("dup123.jpg", 5);
  const db = new Database(path.join(dir, "u.db"));
  db.exec("CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const getStmt = db.prepare("SELECT value FROM kv_store WHERE key = ?");
  const upsertStmt = db.prepare("INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  upsertStmt.run("uvix:orders", JSON.stringify([{ id: "o1", photos: [{ filename: "order1.jpg" }] }]));
  upsertStmt.run("uvix:telegramMessages", JSON.stringify({ 7: [
    { id: "a", tgId: 1, mediaType: "video", mediaUrl: "/api/photos/tgold.mp4", date: iso(90) },
    { id: "b", tgId: 2, mediaType: "photo", mediaUrl: "/api/photos/tgnew.jpg", date: iso(1) },
  ] }));
  let policy = null;
  const cf = CF.createChatFiles({ db, getStmt, upsertStmt, uploadsDir: up, dbPath: path.join(dir, "u.db"), now: () => NOW, onPolicy: (p) => { policy = p; } });
  assert.deepEqual(policy, { lazyDocs: true }, "ishga tushganda siyosat beriladi");
  const s = cf.analyze().summary;
  assert.equal(s.orphan.count, 1); assert.equal(s.old.count, 1); assert.equal(s.attached.count, 1); assert.equal(s.recent.count, 1);
  const r = cf.clean({ orphans: true, old: true, who: "Admin" });
  assert.equal(r.count, 2);
  assert.ok(fs.existsSync(path.join(up, "order1.jpg")), "buyurtma rasmi qoldi");
  assert.ok(fs.existsSync(path.join(up, "tgnew.jpg")), "yangi chat fayli qoldi");
  assert.ok(!fs.existsSync(path.join(up, "tgold.mp4")) && !fs.existsSync(path.join(up, "dup123.jpg")));
  const msgs = JSON.parse(getStmt.get("uvix:telegramMessages").value)[7];
  assert.equal(msgs[0].mediaUrl, null); assert.equal(msgs[0].mediaGone, true);
  assert.equal(msgs[1].mediaUrl, "/api/photos/tgnew.jpg");
  const log = JSON.parse(getStmt.get(CF.KEY_LOG).value);
  assert.equal(log.at(-1).count, 2); assert.equal(log.at(-1).who, "Admin");
});

test("fetchMedia: o'chirilgan fayl Telegram'dan qayta olinadi, belgi olib tashlanadi", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uvix-cf2-"));
  const db = new Database(path.join(dir, "u.db"));
  db.exec("CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const getStmt = db.prepare("SELECT value FROM kv_store WHERE key = ?");
  const upsertStmt = db.prepare("INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  upsertStmt.run("uvix:telegramMessages", JSON.stringify({ 7: [{ id: "a", tgId: 1, mediaType: "video", mediaUrl: null, mediaGone: true, date: iso(90) }] }));
  const cf = CF.createChatFiles({ db, getStmt, upsertStmt, uploadsDir: dir, dbPath: path.join(dir, "u.db"), now: () => NOW, loadMedia: async () => ({ mediaUrl: "/api/photos/tgabc.mp4", fileSize: 99 }) });
  const r = await cf.fetchMedia("7", 1);
  assert.equal(r.mediaUrl, "/api/photos/tgabc.mp4");
  const m = JSON.parse(getStmt.get("uvix:telegramMessages").value)[7][0];
  assert.equal(m.mediaGone, undefined); assert.equal(m.mediaUrl, "/api/photos/tgabc.mp4");
  await assert.rejects(() => cf.fetchMedia("7", 99), /topilmadi/);
});
