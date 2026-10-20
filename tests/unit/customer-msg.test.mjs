// Mijozga xabarlar: sukut bo'yicha hech narsa avtomatik ketmaydi — navbat, qayta tekshirish, to'xtatish
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const registerCustomerMsg = require("../../backend/customer-msg.js");

function setup(initial = {}) {
  const db = { ...initial };
  const getStmt = { get: (k) => (db[k] !== undefined ? { value: db[k] } : undefined) };
  const upsertStmt = { run: (k, v) => { db[k] = v; } };
  const sent = [];
  const sender = { isConnected: () => true, sendText: async (peer, text) => { sent.push({ peer, text }); }, sendImage: async () => {} };
  const routes = {};
  const app = { get: (p, ...h) => (routes[`GET ${p}`] = h[h.length - 1]), post: (p, ...h) => (routes[`POST ${p}`] = h[h.length - 1]), put: (p, ...h) => (routes[`PUT ${p}`] = h[h.length - 1]) };
  const now = new Date("2026-10-20T09:00:00Z");
  const api = registerCustomerMsg(app, { getStmt, upsertStmt, requireAuth: null, requireAdmin: null, sender, nowFn: () => now, pauseMs: 0 });
  const call = async (key, { params = {}, body = {}, user = { name: "Aziza", role: "operator" } } = {}) => {
    let out = { code: 200, data: null };
    const res = { status(c) { out.code = c; return res; }, json(d) { out.data = d; return res; } };
    await routes[key]({ params, body, user, can: () => true }, res);
    return out;
  };
  const q = () => JSON.parse(db["uvix:custMsgQueue"] || "[]");
  return { db, api, sent, call, q, now };
}
const leads = JSON.stringify([{ id: "l1", customer: "Madina", telegramChatId: "111" }]);
const order = (payments, extra = {}) => ({ id: "o1", orderNumber: "UV-1", customer: "Madina", subcategory: "UVIXPRINT", agreementUzs: 1000000, date: "2026-10-01", payments, ...extra });
const pay = (id, amount, extra = {}) => ({ id, amount, date: "2026-10-20", paymentType: "naqd", createdAt: "2026-10-20T08:59:00Z", ...extra });

test("yangi to'lov — mijozga darhol ketmaydi, navbatga tushadi", async () => {
  const t = setup({ "uvix:leads": leads });
  const before = JSON.stringify([order([])]);
  const after = JSON.stringify([order([pay("p1", 300000)])]);
  t.db["uvix:orders"] = after;
  await t.api.onOrdersChanged(before, after);
  assert.equal(t.sent.length, 0);
  const q = t.q();
  assert.equal(q.length, 1);
  assert.equal(q[0].type, "receipt");
  assert.match(q[0].text, /300 000 so'm/);
  assert.match(q[0].text, /Qoldiq: 700 000 so'm/);
});

test("to'lov o'chirilsa — navbatdagi kvitansiya bekor bo'ladi va yuborilmaydi", async () => {
  const t = setup({ "uvix:leads": leads });
  const after = JSON.stringify([order([pay("p1", 300000)])]);
  t.db["uvix:orders"] = after;
  await t.api.onOrdersChanged(JSON.stringify([order([])]), after);
  const deleted = JSON.stringify([order([pay("p1", 300000, { deletedAt: "x" })])]);
  t.db["uvix:orders"] = deleted;
  await t.api.onOrdersChanged(after, deleted);
  const q = t.q();
  assert.equal(q[0].status, "cancelled");
  const r = await t.call("POST /api/customer-msg/queue/:id/send", { params: { id: q[0].id } });
  assert.equal(r.code, 404);
  assert.equal(t.sent.length, 0);
});

test("summa o'zgarsa — matn yangilanadi; eski matn bilan yuborishga urinsa, avval yangisi ko'rsatiladi", async () => {
  const t = setup({ "uvix:leads": leads });
  const after = JSON.stringify([order([pay("p1", 300000)])]);
  t.db["uvix:orders"] = after;
  await t.api.onOrdersChanged(JSON.stringify([order([])]), after);
  const oldText = t.q()[0].text;
  t.db["uvix:orders"] = JSON.stringify([order([pay("p1", 500000)])]);
  const r = await t.call("POST /api/customer-msg/queue/:id/send", { params: { id: t.q()[0].id }, body: { text: oldText } });
  assert.equal(r.code, 409);
  assert.match(r.data.text, /500 000 so'm/);
  const r2 = await t.call("POST /api/customer-msg/queue/:id/send", { params: { id: t.q()[0].id }, body: { text: r.data.text } });
  assert.equal(r2.code, 200);
  assert.equal(t.sent.length, 1);
  assert.match(t.sent[0].text, /500 000 so'm/);
  assert.equal(t.q()[0].status, "sent");
});

test("shubhali: ortiqcha to'lov va kelishuv 0 belgilanadi", async () => {
  const t = setup({ "uvix:leads": leads });
  const after = JSON.stringify([order([pay("p1", 1500000)])]);
  t.db["uvix:orders"] = after;
  await t.api.onOrdersChanged(JSON.stringify([order([])]), after);
  assert.match(t.q()[0].flags.join(" "), /ortiqcha to'langan 500 000/);
});

test("avtomatik yoqilgan bo'lsa ham shubhali xabar navbatda qoladi; to'xtatilganda hech narsa ketmaydi", async () => {
  const t = setup({ "uvix:leads": leads, "uvix:custMsgConfig": JSON.stringify({ auto: { receipt: true } }) });
  const ok = JSON.stringify([order([pay("p1", 300000)])]);
  t.db["uvix:orders"] = ok;
  await t.api.onOrdersChanged(JSON.stringify([order([])]), ok);
  assert.equal(t.sent.length, 1); // oddiy — avtomatik ketdi
  const over = JSON.stringify([order([pay("p1", 300000), pay("p2", 900000)])]);
  t.db["uvix:orders"] = over;
  await t.api.onOrdersChanged(ok, over);
  assert.equal(t.sent.length, 1); // ortiqcha to'lov — navbatda
  assert.equal(t.q().filter((x) => x.status === "pending").length, 1);
  t.db["uvix:custMsgConfig"] = JSON.stringify({ paused: true });
  const r = await t.call("POST /api/customer-msg/queue/:id/send", { params: { id: t.q()[0].id } });
  assert.equal(r.code, 502);
  assert.equal(t.sent.length, 1);
});

test("qarz eslatmasi (qo'lda): ONYX mijoziga «UVONYX» nomi, kelishuvi 0 buyurtma qarz emas", async () => {
  const t = setup({ "uvix:leads": leads, "uvix:orders": JSON.stringify([order([], { subcategory: "UVONYX", agreementUzs: 2000000 }), { id: "o2", orderNumber: "ON-2", customer: "Madina", subcategory: "UVONYX", agreementUzs: 0, date: "2026-10-01", payments: [] }]) });
  const r = await t.call("POST /api/customer-msg/queue/remind", { body: { customer: "Madina" } });
  assert.equal(r.code, 200);
  const x = t.q()[0];
  assert.match(x.text, /UVONYX'dan eslatma/);
  assert.doesNotMatch(x.text, /ON-2/);
  assert.equal(t.sent.length, 0);
});
