// Smeta / Buyurtma serveri (quotes.js): bitta buyurtma, summa serverda qayta hisoblanadi, avans qoidasi,
// avanssiz buyurtma — rahbar so'rovi va Telegram tugmasi bilan tasdiqlash
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const breq = createRequire(path.resolve(here, "../../backend/package.json"));
const registerQuotes = breq("./quotes.js");

const EMPS = [{ id: "adm", name: "Admin", role: "admin" }, { id: "op", name: "Aziza", role: "operator" }];
function setup({ advancePct = 50 } = {}) {
  const kv = new Map([["uvix:sales", JSON.stringify({ advancePct })], ["uvix:leads", JSON.stringify([{ id: "L1", customer: "Dilshod", phone: "+998", stage: "new", line: "UVIXPRINT" }])], ["uvix:orders", "[]"]]);
  const routes = {};
  const reg = (m) => (p, ...h) => { routes[`${m} ${p}`] = h[h.length - 1]; };
  const app = { get: reg("GET"), put: reg("PUT"), post: reg("POST"), delete: reg("DELETE") };
  const sent = []; const handlers = []; const apiCalls = [];
  const bot = { sendToEmployee: async (id, text, extra) => { sent.push({ id, text, extra }); return true; }, onMessage: (fn) => handlers.push(fn), api: async (m, b) => { apiCalls.push({ m, b }); return {}; } };
  registerQuotes(app, {
    getStmt: { get: (k) => (kv.has(k) ? { value: kv.get(k) } : undefined) }, upsertStmt: { run: (k, v) => kv.set(k, v) },
    readEmployees: () => EMPS, requireAuth: () => {}, requireAdmin: () => {}, requireStaff: () => {}, bot, now: () => new Date("2026-11-01T10:00:00Z"),
  });
  const call = (key, { body = {}, params = {}, user = EMPS[0] } = {}) => new Promise((resolve) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(d) { resolve({ code: this.code, data: d }); } };
    Promise.resolve(routes[key]({ body, params, user, can: () => true, lineScope: null }, res));
  });
  const read = (k) => JSON.parse(kv.get(k) || "null");
  return { call, read, sent, handlers, apiCalls };
}
const ITEMS = [
  { id: "a", kind: "material", name: "Akril", calc: "m2", cur: "uzs", price: 100000, parts: [{ w: 1200, h: 600, n: 2 }, { w: 800, h: 400, n: 4 }] },
  { id: "b", kind: "pechat", name: "UV", calc: "m2", cur: "uzs", price: 50000, areaFrom: "a" },
  { id: "c", kind: "montaj", calc: "lump", cur: "uzs", price: 200000, total: 999 }, // brauzer summasiga ishonilmaydi
];

test("buyurtma: smeta → BITTA buyurtma, summa serverda, pechat m² — maydon", async () => {
  const t = setup();
  const r = await t.call("POST /api/quotes/convert", { body: { leadId: "L1", items: ITEMS, payments: [{ amount: 304000, paymentType: "naqd" }] } });
  assert.equal(r.code, 200, JSON.stringify(r.data));
  const orders = t.read("uvix:orders");
  assert.equal(orders.length, 1);
  const o = orders[0];
  assert.equal(o.agreementUzs, 272000 + 136000 + 200000);
  assert.equal(o.items.length, 3); assert.equal(o.items[2].total, 200000);
  assert.equal(o.area, 2.72); assert.equal(o.kraskaSum, 0);
  assert.equal(o.payments[0].amount, 304000);
  assert.match(o.orderNumber, /^UV-261101-001$/);
  const lead = t.read("uvix:leads").find((l) => l.id === "L1");
  assert.equal(lead.quote.status, "converted"); assert.deepEqual(lead.orderIds, [o.id]);
});

test("avans kam: xodimga 409 (canForce yo'q), rahbar force bilan ochadi; avans > jami — xato", async () => {
  const t = setup();
  let r = await t.call("POST /api/quotes/convert", { body: { leadId: "L1", items: ITEMS, payments: [{ amount: 1000, paymentType: "naqd" }] }, user: EMPS[1] });
  assert.equal(r.code, 409); assert.equal(r.data.error, "advance_required"); assert.equal(r.data.canForce, false); assert.equal(r.data.need, 304000);
  r = await t.call("POST /api/quotes/convert", { body: { leadId: "L1", items: ITEMS, payments: [], force: true }, user: EMPS[1] });
  assert.equal(r.code, 409, "xodimning force'i hisobga olinmaydi");
  r = await t.call("POST /api/quotes/convert", { body: { leadId: "L1", items: ITEMS, payments: [{ amount: 9e6, paymentType: "naqd" }] } });
  assert.equal(r.code, 400); assert.match(r.data.message, /ko'p/);
  r = await t.call("POST /api/quotes/convert", { body: { leadId: "L1", items: ITEMS, payments: [], force: true } });
  assert.equal(r.code, 200); assert.equal(t.read("uvix:orders")[0].payments.length, 0);
});

test("so'rov → Telegram tugmasi «Tasdiqlash» → buyurtma ochiladi (kiritgan — xodim)", async () => {
  const t = setup();
  const r = await t.call("POST /api/quotes/request", { body: { leadId: "L1", items: ITEMS, payments: [] }, user: EMPS[1] });
  assert.equal(r.code, 200, JSON.stringify(r.data));
  await new Promise((ok) => setTimeout(ok, 10));
  const msg = t.sent.find((s) => s.id === "adm");
  assert.ok(msg && /Avanssiz buyurtma/.test(msg.text));
  const kb = msg.extra.reply_markup.inline_keyboard[0];
  assert.match(kb[0].callback_data, /^oreq:a:/);
  // So'rov kutilayotganda smeta qulflangan
  const put = await t.call("PUT /api/quotes/:leadId", { params: { leadId: "L1" }, body: { items: ITEMS }, user: EMPS[1] });
  assert.equal(put.code, 409);
  // Xodim tugmani bossa — rad
  const h = t.handlers[0];
  assert.equal(await h({ empId: "op", chatId: "2", callback: { id: "q0", data: kb[0].callback_data, message: { message_id: 5, text: "x" } } }), true);
  assert.equal(t.read("uvix:orders").length, 0);
  // Rahbar bosadi
  assert.equal(await h({ empId: "adm", chatId: "1", callback: { id: "q1", data: kb[0].callback_data, message: { message_id: 7, text: msg.text } } }), true);
  const o = t.read("uvix:orders")[0];
  assert.ok(o, "buyurtma ochildi");
  assert.equal(o.createdBy, "Aziza"); assert.equal(o.approvedBy, "Admin"); assert.equal(o.agreementUzs, 608000);
  assert.equal(t.read("uvix:orderRequests")[0].status, "approved");
  assert.ok(t.apiCalls.some((c) => c.m === "editMessageText" && /Tasdiqlandi/.test(c.b.text)));
  // Qayta bosish — ikkinchi buyurtma yo'q
  await h({ empId: "adm", chatId: "1", callback: { id: "q2", data: kb[0].callback_data, message: { message_id: 7, text: "" } } });
  assert.equal(t.read("uvix:orders").length, 1);
  // Boshqa tugmalar (ovozli jurnal) — bu ishlovchiga tegishli emas
  assert.equal(await h({ empId: "adm", chatId: "1", callback: { id: "q3", data: "wl:save:1" } }), false);
});

test("so'rov rad etilsa — buyurtma yo'q, smeta ochiq qoladi va yana tahrirlanadi", async () => {
  const t = setup();
  const r = await t.call("POST /api/quotes/request", { body: { leadId: "L1", items: ITEMS, payments: [{ amount: 5000, paymentType: "karta" }] }, user: EMPS[1] });
  const d = await t.call("POST /api/quotes/requests/:id/:action(approve|reject|cancel)", { params: { id: r.data.request.id, action: "reject" } });
  assert.equal(d.code, 200);
  assert.equal(t.read("uvix:orders").length, 0);
  const lead = t.read("uvix:leads").find((l) => l.id === "L1");
  assert.equal(lead.quote.status, "open"); assert.equal(lead.quote.request.status, "rejected");
  const put = await t.call("PUT /api/quotes/:leadId", { params: { leadId: "L1" }, body: { items: ITEMS }, user: EMPS[1] });
  assert.equal(put.code, 200);
  // Xodim tasdiqlay olmaydi
  const r2 = await t.call("POST /api/quotes/request", { body: { leadId: "L1", items: ITEMS, payments: [] }, user: EMPS[1] });
  const x = await t.call("POST /api/quotes/requests/:id/:action(approve|reject|cancel)", { params: { id: r2.data.request.id, action: "approve" }, user: EMPS[1] });
  assert.equal(x.code, 403);
});

test("smeta saqlash: v2, $ kurs bilan; noto'g'ri qator — 400", async () => {
  const t = setup();
  const r = await t.call("PUT /api/quotes/:leadId", { params: { leadId: "L1" }, body: { items: [{ id: "u", kind: "ish", calc: "lump", cur: "usd", price: 10 }], rate: 12500, rateSrc: "manual" } });
  assert.equal(r.code, 200);
  const q = t.read("uvix:leads")[0].quote;
  assert.equal(q.v, 2); assert.equal(q.total, 125000); assert.equal(q.rate, 12500); assert.equal(q.rateSrc, "manual"); assert.equal(q.status, "open");
  const bad = await t.call("PUT /api/quotes/:leadId", { params: { leadId: "L1" }, body: { items: [{ kind: "material", calc: "m2", cur: "uzs", price: 5, parts: [] }] } });
  assert.equal(bad.code, 400); assert.match(bad.data.message, /o'lchamlarni/);
});
