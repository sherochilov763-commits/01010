// Chat xabarlari jadvali (chat-store.js) va chat tarixi muddati (chat-history.js) — 118-eskiz
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
const breq = createRequire(path.resolve(here, "../../backend/package.json"));
const { createChatStore, KEY_BAK, KEY_META } = breq("./chat-store.js");
const H = breq("./chat-history.js");
const CF = breq("./chat-files.js");
const Database = breq("better-sqlite3");

const DAY = 86400000;
const NOW = Date.parse("2026-10-28T10:00:00Z"); // Toshkent: 15:00
const iso = (daysAgo, min = 0) => new Date(NOW - daysAgo * DAY + min * 60000).toISOString();

function setup(blob) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uvix-cs-"));
  const db = new Database(path.join(dir, "u.db"));
  db.exec("CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const getStmt = db.prepare("SELECT value FROM kv_store WHERE key = ?");
  const upsertStmt = db.prepare("INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  if (blob) upsertStmt.run("uvix:telegramMessages", JSON.stringify(blob));
  let t = NOW;
  const clock = { now: () => t, set: (v) => { t = v; } };
  const store = createChatStore({ db, upsertStmt, now: clock.now });
  return { dir, db, getStmt, upsertStmt, store, clock };
}
const many = (n, daysAgo = 1) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, tgId: i + 1, text: `x${i}`, out: i % 2 === 1, date: iso(daysAgo, i) }));

test("ko'chirish: eski KV yozuvi jadvalga o'tadi, asl nusxa zaxirada, kalit o'chadi", () => {
  const { store, getStmt } = setup({ 7: many(3), "on:9": [{ id: "a", text: "salom", out: false, date: iso(2) }] });
  assert.equal(getStmt.get("uvix:telegramMessages"), undefined);
  assert.ok(getStmt.get(KEY_BAK), "zaxira bor");
  assert.equal(JSON.parse(getStmt.get(KEY_META).value).count, 4);
  assert.equal(store.count(), 4);
  assert.deepEqual(store.chatIds().sort(), ["7", "on:9"]);
  assert.deepEqual(store.list("7").map((m) => m.text), ["x0", "x1", "x2"], "eskisi birinchi");
});

test("ko'chirish: KV'ga yangi yozuv qo'yilsa (zaxiradan tiklash, testlar) — jadval shu bilan almashtiriladi", () => {
  const { store, upsertStmt } = setup({ 7: many(3) });
  upsertStmt.run("uvix:telegramMessages", JSON.stringify({ 8: many(1) }));
  assert.deepEqual(store.chatIds(), ["8"]);
});

test("list: so'nggi 50 ta; before — eskiroq sahifa; countBefore", () => {
  const { store } = setup({ 7: many(120) });
  const tail = store.list("7", { limit: 50 });
  assert.equal(tail.length, 50);
  assert.equal(tail[0].text, "x70"); assert.equal(tail.at(-1).text, "x119");
  assert.equal(store.countBefore("7", tail[0]), 70);
  const prev = store.list("7", { limit: 50, before: tail[0] });
  assert.equal(prev.at(-1).text, "x69"); assert.equal(prev[0].text, "x20");
  const first = store.list("7", { limit: 50, before: prev[0] });
  assert.equal(first.length, 20);
  assert.equal(store.countBefore("7", first[0]), 0);
});

test("merge: Telegram ID va matn+vaqt bo'yicha takror qo'shilmaydi; ID biriktiriladi", () => {
  const { store } = setup({ 7: [{ id: "a", tgId: null, text: "salom", out: true, date: iso(0) }] });
  const added = store.merge("7", [
    { tgId: 55, text: "salom", out: true, date: iso(0, 1) }, // shu xabar (±3 daqiqa) — ID biriktiriladi
    { tgId: 56, text: "yangi", out: false, date: iso(0, 2) },
  ], (m) => ({ ...m, id: `n${m.tgId}` }));
  assert.equal(added, 1);
  assert.equal(store.get("7", "a").tgId, 55);
  assert.equal(store.merge("7", [{ tgId: 56, text: "yangi", out: false, date: iso(0, 2) }]), 0);
  assert.equal(store.count("7"), 2);
});

test("summaries: oxirgi xabarlar va oxirgi kiruvchi sana; scanDesc — eng yangisidan", () => {
  const { store } = setup({ 7: many(20), 8: [{ id: "z", out: true, text: "biz", date: iso(0) }] });
  const s = store.summaries(5);
  assert.equal(s.get("7").recent.length, 5);
  assert.equal(s.get("7").recent.at(-1).text, "x19");
  assert.equal(s.get("7").lastIn, iso(1, 18));
  assert.equal(s.get("8").lastIn, null);
  const seen = [];
  store.scanDesc((id, m) => { seen.push(m.text); return seen.length >= 2; });
  assert.deepEqual(seen, ["biz", "x19"]);
  assert.equal(store.recentOut("8", iso(0, -5)), true);
  assert.equal(store.recentOut("7", iso(0, -5)), false);
});

test("markGone, pruneBefore (bog'langan chat qoladi), removeChats", () => {
  const { store } = setup({
    7: [{ id: "o", text: "", mediaType: "photo", mediaUrl: "/api/photos/tgold1.jpg", date: iso(40) }, { id: "n", text: "yangi", date: iso(1) }],
    8: [{ id: "k", text: "buyurtma", mediaUrl: "/api/photos/tgkeep1.jpg", date: iso(40) }],
    "on:9": [{ id: "q", text: "onyx", mediaUrl: "/api/photos/tgonyx1.jpg", date: iso(2) }],
  });
  assert.equal(store.markGone(new Set(["tgold1.jpg"])), 1);
  assert.equal(store.get("7", "o").mediaGone, true);
  store.update("7", "o", (m) => { m.mediaUrl = "/api/photos/tgold1.jpg"; delete m.mediaGone; });
  const r = store.pruneBefore(iso(30), (id) => id === "8");
  assert.equal(r.count, 1);
  assert.deepEqual([...r.media], ["tgold1.jpg"]);
  assert.equal(store.count("8"), 1, "bog'langan chat to'liq");
  const rc = store.removeChats((id) => id.startsWith("on:"));
  assert.equal(rc.chats, 1); assert.deepEqual([...rc.media], ["tgonyx1.jpg"]);
  assert.deepEqual(store.chatIds().sort(), ["7", "8"]);
});

test("dropBackup: ko'chirishdan 7 kun o'tgach eski nusxa o'chadi", () => {
  const { store, getStmt, clock } = setup({ 7: many(1) });
  assert.equal(store.dropBackup(7), false);
  clock.set(NOW + 8 * DAY);
  assert.equal(store.dropBackup(7), true);
  assert.equal(getStmt.get(KEY_BAK), undefined);
});

test("linkedChats: buyurtma, smeta, bitim — saqlanadi; oddiy lid — yo'q", () => {
  const m = H.linkedChats(
    [{ telegramChatId: "1", orderId: "o1" }, { telegramChatId: "2", quote: { no: "S-12" } }, { telegramChatId: "3", estimatedValue: 500 }, { telegramChatId: "4" }, { telegramChatId: "5", orderId: "x", deletedAt: "2026" }],
    [{ id: "o1", orderNumber: 1042 }, { id: "o2", orderNumber: 7, telegramChatId: "6" }],
  );
  assert.equal(m.get("1"), "Buyurtma #1042");
  assert.equal(m.get("2"), "Smeta S-12");
  assert.equal(m.get("3"), "Bitim");
  assert.equal(m.get("6"), "Buyurtma #7");
  assert.ok(!m.has("4") && !m.has("5"));
  assert.deepEqual(H.cleanConfig({ keepDays: 45 }), { keepDays: 30, keepLinked: true, autoPrune: true });
});

function historySetup({ connected = {} } = {}) {
  const env = setup({
    100: [{ id: "a", text: "eski", mediaUrl: "/api/photos/tgchatold.jpg", date: iso(45) }, { id: "b", text: "yangi", date: iso(2) }],
    200: [{ id: "c", text: "buyurtmali eski", date: iso(80) }],
    "on:300": [{ id: "d", text: "onyx", mediaUrl: "/api/photos/tgonyx.jpg", date: iso(3) }, { id: "e", text: "o", mediaUrl: "/api/photos/order9.jpg", date: iso(3) }],
    "on:400": [{ id: "f", text: "onyx buyurtma", date: iso(3) }],
  });
  const up = path.join(env.dir, "uploads"); fs.mkdirSync(up);
  for (const n of ["tgchatold.jpg", "tgonyx.jpg", "order9.jpg"]) fs.writeFileSync(path.join(up, n), "x".repeat(100));
  env.upsertStmt.run("uvix:leads", JSON.stringify([{ telegramChatId: "200", orderId: "o1" }, { telegramChatId: "on:400", quote: { no: "S-1" } }]));
  env.upsertStmt.run("uvix:orders", JSON.stringify([{ id: "o1", orderNumber: 1042, photos: [{ filename: "order9.jpg" }] }]));
  env.upsertStmt.run("uvix:telegramContacts", JSON.stringify({ "on:300": { name: "Onyx mijoz" }, 100: { name: "A" } }));
  const notes = [];
  const files = CF.createChatFiles({ db: env.db, getStmt: env.getStmt, upsertStmt: env.upsertStmt, store: env.store, uploadsDir: up, dbPath: path.join(env.dir, "u.db"), now: env.clock.now });
  const h = H.createChatHistory({ store: env.store, getStmt: env.getStmt, upsertStmt: env.upsertStmt, chatFiles: files, isConnected: (l) => !!connected[l], notify: (n) => notes.push(n), now: env.clock.now });
  return { ...env, up, h, notes };
}

test("chat tarixi: oldindan ko'rish va tozalash — 30 kundan eski o'chadi, buyurtmali chat qoladi, fayl ham o'chadi", () => {
  const { h, store, up } = historySetup({ connected: { UVIXPRINT: true, UVONYX: true } });
  assert.deepEqual(h.preview(), { total: 6, old: 2, oldLinked: 1, willDelete: 1, linkedChats: 2 });
  assert.deepEqual(h.keepInfo("200"), { keepDays: 30, linked: true, reason: "Buyurtma #1042", cutoff: iso(30) });
  assert.equal(h.keepInfo("100").linked, false);
  const r = h.prune({ who: "Admin" });
  assert.equal(r.count, 1); assert.equal(r.files.count, 1);
  assert.ok(!fs.existsSync(path.join(up, "tgchatold.jpg")));
  assert.equal(store.count("200"), 1);
  assert.deepEqual(store.list("100").map((m) => m.id), ["b"]);
});

test("har kecha: faqat 03:00–06:00 da va kuniga bir marta", () => {
  const { h, clock } = historySetup({ connected: { UVIXPRINT: true, UVONYX: true } });
  assert.equal(h.hourly().pruned, 0, "kunduzi (15:00) — o'zi o'chirmaydi");
  clock.set(Date.parse("2026-10-28T22:30:00Z")); // Toshkent 03:30
  assert.equal(h.hourly().pruned, 1);
  assert.equal(h.hourly().pruned, 0, "shu kecha qayta emas");
});

test("uzilgan akkaunt: hisob, ulangan bo'lsa tozalanmaydi, tasdiq bilan tozalash", () => {
  const conn = { UVIXPRINT: true, UVONYX: true };
  const env = historySetup({ connected: conn });
  assert.throws(() => env.h.purgeLine("UVONYX"), /ulangan/);
  conn.UVONYX = false;
  const info = env.h.lineInfo("UVONYX");
  assert.equal(info.connected, false); assert.equal(info.chats, 1); assert.equal(info.messages, 2); assert.equal(info.linkedChats, 1);
  assert.equal(info.files.count, 2); assert.equal(info.days, 0);
  const r = env.h.purgeLine("UVONYX", { who: "Admin" });
  assert.equal(r.chats, 1); assert.equal(r.count, 2);
  assert.equal(r.files.count, 1, "buyurtmaga biriktirilgan rasm qoldi");
  assert.ok(fs.existsSync(path.join(env.up, "order9.jpg")) && !fs.existsSync(path.join(env.up, "tgonyx.jpg")));
  assert.deepEqual(env.store.chatIds().filter((x) => x.startsWith("on:")), ["on:400"], "smetali chat qoldi");
  assert.equal(JSON.parse(env.getStmt.get("uvix:telegramContacts").value)["on:300"], undefined);
});

test("uzilgan akkaunt: 6-kuni ogohlantirish, 7-kuni o'zi tozalanadi; qayta ulansa — belgi o'chadi", () => {
  const conn = { UVIXPRINT: true, UVONYX: false };
  const env = historySetup({ connected: conn });
  env.h.hourly();
  assert.ok(JSON.parse(env.getStmt.get(H.KEY_DOWN).value).UVONYX.since);
  conn.UVONYX = true; env.h.hourly();
  assert.equal(JSON.parse(env.getStmt.get(H.KEY_DOWN).value).UVONYX, undefined, "ulandi — hisob qaytadan");
  conn.UVONYX = false; env.h.hourly();
  env.clock.set(NOW + 6 * DAY + 3600000); env.h.hourly();
  assert.equal(env.notes.length, 1); assert.match(env.notes[0].title, /6 kundan beri/);
  env.h.hourly();
  assert.equal(env.notes.length, 1, "ogohlantirish bir marta");
  assert.equal(env.store.count("on:300"), 2, "hali o'chmagan");
  env.clock.set(NOW + 7 * DAY + 3600000);
  const r = env.h.hourly();
  assert.equal(r.lines[0].line, "UVONYX");
  assert.equal(env.store.count("on:300"), 0);
  assert.equal(env.store.count("on:400"), 1);
});
