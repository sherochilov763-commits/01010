// Karta: CardXabar xabarlarini tahlil qilish (card-feed.js) va saqlash/takrorlarni o'tkazib yuborish.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const breq = createRequire(path.resolve(here, "../../backend/package.json"));
const CF = breq("./card-feed.js");
const { parseCardXabar } = CF;

const PLATEZH = "🔴 Platezh\n➖ 2 022 000.00 UZS\n💳 ***8313\n📍 ATB HAMKORBANK PAYME AJ, UZ\n🕓 24.10.26 12:19\n💵 250 539.19 UZS";
const SPISANIE = "🔴 Spisanie c karty\n➖ 249 717.00 UZS\n💳 ***8313\n📍 PAYME P2P, UZ\n🕓 24.10.26 17:27\n💵 822.19 UZS";
const POPOLNENIE = "🟢 Popolnenie\n➕ 1 500 000.00 UZS\n💳 ***8313\n📍 UZCARD P2P, UZ\n🕓 25.10.26 09:05\n💵 1 500 822.19 UZS";

test("chiqim: Platezh — summa, karta, joy, vaqt, qoldiq", () => {
  const p = parseCardXabar(PLATEZH);
  assert.equal(p.dir, "out");
  assert.equal(p.kind, "Platezh");
  assert.equal(p.amount, 2022000);
  assert.equal(p.currency, "UZS");
  assert.equal(p.card, "8313");
  assert.equal(p.merchant, "ATB HAMKORBANK PAYME AJ, UZ");
  assert.equal(p.at, new Date("2026-10-24T12:19:00+05:00").toISOString());
  assert.equal(p.balance, 250539.19);
});

test("chiqim: Spisanie c karty — kichik qoldiq", () => {
  const p = parseCardXabar(SPISANIE);
  assert.equal(p.dir, "out");
  assert.equal(p.amount, 249717);
  assert.equal(p.balance, 822.19);
  assert.equal(p.merchant, "PAYME P2P, UZ");
});

test("kirim: ➕ / yashil belgi", () => {
  const p = parseCardXabar(POPOLNENIE);
  assert.equal(p.dir, "in");
  assert.equal(p.amount, 1500000);
  assert.equal(p.balance, 1500822.19);
});

test("belgisiz bo'lsa — so'zdan aniqlanadi; reklama va hisobot — null", () => {
  assert.equal(parseCardXabar("Zachislenie\n1 000,50 UZS\n***1234\n01.11.26 10:00").dir, "in");
  assert.equal(parseCardXabar("Xarajatlaringiz 19 Okt - 25 Okt\n5 893 000 so'm"), null);
  assert.equal(parseCardXabar("Salom! Yangi funksiya"), null);
  assert.equal(parseCardXabar(""), null);
});

function fakeApp() {
  const routes = {};
  const reg = (m) => (p, ...h) => { routes[`${m} ${p}`] = h[h.length - 1]; };
  return { routes, get: reg("GET"), post: reg("POST"), patch: reg("PATCH") };
}
function call(handler, { params = {}, body = {} } = {}) {
  return new Promise((resolve) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(d) { resolve({ code: this.code, data: d }); } };
    Promise.resolve(handler({ params, body, user: { name: "Admin" } }, res));
  });
}
function setup({ connected = true, chat = null } = {}) {
  const store = {};
  const getStmt = { get: (k) => (k in store ? { key: k, value: store[k] } : undefined) };
  const upsertStmt = { run: (k, v) => { store[k] = v; } };
  const bot = { isConnected: () => connected, fetchBotChat: async () => chat };
  const app = fakeApp();
  const pass = (req, res, next) => next && next();
  const api = CF(app, { getStmt, upsertStmt, requireAuth: pass, requireAdmin: pass, bots: [{ line: "UVIXPRINT", bot }] });
  return { api, app, store };
}
const msg = (tgId, text) => ({ chatId: "999", tgId, text, date: "2026-10-24T07:20:00.000Z", username: "CardXabarBot", name: "CardXabar" });

test("real vaqt: faqat CardXabar boti, takrorlar o'tkazib yuboriladi", async () => {
  const { api, app } = setup();
  const on = api.onBotMessage("UVIXPRINT");
  on(msg(1, PLATEZH));
  on(msg(1, PLATEZH)); // o'sha xabar
  on(msg(2, SPISANIE));
  on({ ...msg(3, POPOLNENIE), username: "OtherBot", name: "Boshqa" }); // boshqa bot
  const r = await call(app.routes["GET /api/card-tx"]);
  assert.equal(r.data.items.length, 2);
  assert.equal(r.data.items[0].tgId, 2); // yangisi birinchi
  assert.equal(r.data.items[0].sig, undefined); // ichki maydon tashqariga chiqmaydi
  assert.equal(r.data.status[0].found, true);
});

test("tarixni o'qish: chat topilmasa — found=false; topilsa — qo'shiladi, qayta o'qishda takrorlanmaydi", async () => {
  const none = setup({ chat: null });
  assert.deepEqual((await none.api.sync("UVIXPRINT")).found, false);

  const s = setup({ chat: { chatId: "999", name: "CardXabar", messages: [msg(1, PLATEZH), msg(2, SPISANIE), msg(3, "Reklama")] } });
  assert.equal((await s.api.sync("UVIXPRINT")).added, 2);
  assert.equal((await s.api.sync("UVIXPRINT")).added, 0);
  const off = setup({ connected: false });
  assert.equal((await off.api.sync("UVIXPRINT")).connected, false);
});

test("belgilash: shaxsiy, rasxod, buyurtma — faqat ruxsat etilgan maydonlar", async () => {
  const { api, app } = setup();
  api.onBotMessage("UVIXPRINT")(msg(1, PLATEZH));
  const id = (await call(app.routes["GET /api/card-tx"])).data.items[0].id;
  const r = await call(app.routes["PATCH /api/card-tx/:id"], { params: { id }, body: { txId: "tx1", label: "Kraska / UV kraska", amount: 5, personal: true } });
  assert.equal(r.data.item.txId, "tx1");
  assert.equal(r.data.item.personal, true);
  assert.equal(r.data.item.amount, 2022000); // summani o'zgartirib bo'lmaydi
  const un = await call(app.routes["PATCH /api/card-tx/:id"], { params: { id }, body: { txId: null } });
  assert.equal(un.data.item.txId, null);
  assert.equal((await call(app.routes["PATCH /api/card-tx/:id"], { params: { id: "x" }, body: {} })).code, 404);
});

test("karta uchun shaxsiy akkaunt: kirish → sessiya saqlanadi, faqat botlar o'qiladi; uzish → sessiya o'chadi", async () => {
  const store = { "uvix:settings": "{}" };
  const getStmt = { get: (k) => (k in store ? { key: k, value: store[k] } : undefined) };
  const upsertStmt = { run: (k, v) => { store[k] = v; } };
  const calls = [];
  let connected = false;
  const cardBot = {
    isConnected: () => connected, getStatus: () => ({ status: connected ? "connected" : "disconnected" }),
    connectFromSettings: async (settings, onNew, opts) => { calls.push({ settings, opts }); connected = true; return { ok: true }; },
    disconnect: async () => { connected = false; },
    fetchBotChat: async () => ({ chatId: "5", name: "CardXabar", messages: [msg(7, PLATEZH)] }),
  };
  let onSuccess = null;
  const cardLogin = { getState: () => ({ stage: "idle" }), startQr: async (a) => { onSuccess = a.onSuccess; return { stage: "qr", apiId: a.apiId }; }, cancel: async () => ({ stage: "idle" }) };
  const app = fakeApp();
  const pass = (req, res, next) => next && next();
  const api = CF(app, { getStmt, upsertStmt, deleteKey: (k) => { delete store[k]; }, requireAuth: pass, requireAdmin: pass, bots: [], cardBot, cardLogin, readCreds: () => ({ apiId: "123", apiHash: "h".repeat(32) }) });
  assert.equal((await call(app.routes["GET /api/card-tx/account"])).data.status, "disconnected");
  assert.equal((await call(app.routes["POST /api/card-tx/account/login/qr"])).data.apiId, "123");
  await onSuccess({ session: "SESS", apiId: 123, apiHash: "h".repeat(32), user: { name: "Sherzod" } });
  assert.equal(JSON.parse(store["uvix:cardTgSession"]).session, "SESS");
  assert.equal(calls[0].opts.botsOnly, true);
  assert.equal(calls[0].opts.session, "SESS");
  await new Promise((r) => setTimeout(r, 10));
  const list = await call(app.routes["GET /api/card-tx"]);
  assert.equal(list.data.items.length, 1);
  assert.equal(list.data.items[0].line, "CARD");
  const acc = await call(app.routes["GET /api/card-tx/account"]);
  assert.equal(acc.data.status, "connected");
  assert.equal(acc.data.user.name, "Sherzod");
  await call(app.routes["POST /api/card-tx/account/disconnect"]);
  assert.equal(store["uvix:cardTgSession"], undefined);
  assert.equal(connected, false);
  assert.equal((await call(app.routes["GET /api/card-tx"])).data.items.length, 1); // yozuvlar qoladi
  assert.equal((await api.connectCard()).ok, false);
});
