// CRM ovozli yordamchisi: AI javobini tekshirish (server) va formalarga moslash (brauzer, esbuild bilan yig'iladi)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import http from "node:http";

const here = path.dirname(fileURLToPath(import.meta.url));
const breq = createRequire(path.resolve(here, "../../backend/package.json"));
const VC = breq("./voice-command.js");
const front = path.resolve(here, "../../frontend");
const freq = createRequire(path.join(front, "package.json"));
const esbuild = freq("esbuild");
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "uvix-voice-")), "v.mjs");
await esbuild.build({
  stdin: { contents: `export * from ${JSON.stringify(path.join(front, "src/lib/voice.js"))};`, resolveDir: front, loader: "js" },
  bundle: true, platform: "node", format: "esm", outfile: out, jsx: "automatic", loader: { ".js": "jsx" }, logLevel: "error",
});
const V = await import(out);

const CATS = { Material: ["Plyonka", "Akril"], Xodimlar: ["Oylik", "Avans"], Ijara: ["Sex"] };

test("server: buyurtma — o'lcham, dona, umumiy summa; noto'g'ri pozitsiya tashlanadi", () => {
  const r = VC.normalize({ action: "order", data: { customer: "Akmal", items: [
    { title: "Banner", unit: "m2", w: 2, h: 1, total: 250000 },
    { title: "Vizitka", qty: "500", price: 300 },
    { title: "Montaj", total: "150 000" },
    { title: "", material: "" },
    { title: "Lazer", unit: "m2", qty: 2, price: 5000 },
  ] } });
  assert.equal(r.action, "order");
  assert.deepEqual(r.data.items.map((i) => i.unit), ["m2", "pcs", "lump", "pcs"]);
  assert.deepEqual([r.data.items[1].qty, r.data.items[1].price, r.data.items[2].total], [500, 300, 150000]);
});

test("server: to'lov, rasxod (faqat mavjud kategoriya), vazifa, lid, noma'lum", () => {
  const p = VC.normalize({ action: "payment", data: { customer: "Akmal", amount: "300000", paymentType: "cash" } });
  assert.deepEqual([p.data.amount, p.data.paymentType], [300000, "naqd"]);
  assert.equal(VC.normalize({ action: "payment", data: { amount: 5 } }).action, "unknown", "kimdan — noma'lum bo'lsa");
  const e = VC.normalize({ action: "expense", data: { amount: 1200000, category: "material", subcategory: "PLYONKA" } }, { categories: CATS });
  assert.deepEqual([e.data.category, e.data.subcategory, e.data.paymentType], ["Material", "Plyonka", "karta"]);
  assert.equal(VC.normalize({ action: "expense", data: { amount: 5000, category: "Ovqat" } }, { categories: CATS }).data.category, null);
  const j = VC.normalize({ action: "job", data: { kind: "install", title: "Viveska", date: "2026-10-23", time: "9:00", assignees: ["Bekzod", "", 5] } });
  assert.deepEqual([j.data.kind, j.data.time, j.data.assignees], ["install", "09:00", ["Bekzod"]]);
  assert.equal(VC.normalize({ action: "job", data: { kind: "x", time: "10:00" } }).data.time, null, "sanasiz vaqt yo'q");
  assert.equal(VC.normalize({ action: "lead", data: { phone: "1" } }).action, "unknown");
  assert.deepEqual(VC.normalize({ action: "hack", data: { a: 1 } }), { action: "unknown", data: {}, reply: "" });
});

test("server: prompt — bugungi sana, mijozlar, xodimlar, kategoriyalar", () => {
  const p = VC.buildPrompt({ text: "Akmaldan 300 ming", now: new Date("2026-10-22T05:00:00Z"), customers: ["Akmal Karimov"], employees: ["Bekzod"], categories: CATS });
  assert.match(p, /2026-10-22 \(payshanba\), soat 10:00/);
  assert.match(p, /Akmal Karimov/);
  assert.match(p, /Material: Plyonka, Akril/);
  assert.match(p, /Gap: """Akmaldan 300 ming"""/);
});

test("server: /api/voice/command — faqat rahbar, matn → javob, ovoz → matnga o'giriladi", async () => {
  const express = breq("express");
  const app = express(); app.use(express.json());
  const users = { boss: { id: "boss", name: "Sherzod", role: "admin" }, op: { id: "op", name: "Op", role: "operator" } };
  const requireAuth = (req, res, next) => { req.user = users[req.headers["x-user"]]; return req.user ? next() : res.status(401).end(); };
  const kv = { "uvix:categories": JSON.stringify(CATS), "uvix:customers": JSON.stringify([{ name: "Akmal Karimov" }]) };
  const prompts = [];
  const ai = {
    status: () => ({ ready: true, voice: true }),
    transcribe: async (buf, mime) => `OVOZ ${buf.length} ${mime}`,
    extract: async (sys, user) => { prompts.push(user); return { action: "payment", data: { customer: "Akmal Karimov", amount: 300000, paymentType: "karta" }, reply: "ok" }; },
  };
  VC(app, { getStmt: { get: (k) => (kv[k] ? { value: kv[k] } : undefined) }, readEmployees: () => Object.values(users), requireAuth, ai, convert: async (b) => ({ buffer: b, mime: "audio/ogg" }) });
  const srv = http.createServer(app).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const st = await (await fetch(`${base}/api/voice/status`, { headers: { "x-user": "op" } })).json();
    assert.equal(st.enabled, false);
    const forb = await fetch(`${base}/api/voice/command`, { method: "POST", headers: { "x-user": "op", "Content-Type": "application/json" }, body: JSON.stringify({ text: "x" }) });
    assert.equal(forb.status, 403);
    const r = await (await fetch(`${base}/api/voice/command`, { method: "POST", headers: { "x-user": "boss", "Content-Type": "application/json" }, body: JSON.stringify({ text: "Akmaldan 300 ming karta" }) })).json();
    assert.deepEqual([r.action, r.data.amount, r.data.paymentType, r.transcript], ["payment", 300000, "karta", "Akmaldan 300 ming karta"]);
    assert.match(prompts[0], /Akmal Karimov/);
    const form = new FormData(); form.append("audio", new Blob([Buffer.alloc(1234)], { type: "audio/webm" }), "voice.webm");
    const v = await (await fetch(`${base}/api/voice/command`, { method: "POST", headers: { "x-user": "boss" }, body: form })).json();
    assert.equal(v.transcript, "OVOZ 1234 audio/ogg");
    const empty = await fetch(`${base}/api/voice/command`, { method: "POST", headers: { "x-user": "boss", "Content-Type": "application/json" }, body: JSON.stringify({ text: " " }) });
    assert.equal(empty.status, 400);
  } finally { srv.close(); }
});

const orders = [
  { id: "o1", customer: "Akmal Karimov", orderNumber: "UV-261020-001", date: "2026-10-20", agreementUzs: 500000, payments: [{ amount: 250000 }] },
  { id: "o2", customer: "Akmal Karimov", orderNumber: "UV-261021-004", date: "2026-10-21", agreementUzs: 300000, payments: [] },
  { id: "o3", customer: "Akmal Karimov", orderNumber: "UV-261001-002", date: "2026-10-01", agreementUzs: 100000, payments: [{ amount: 100000 }] },
  { id: "o4", customer: "Jasur", orderNumber: "UV-261015-003", date: "2026-10-15", agreementUzs: 800000, payments: [] },
];

test("brauzer: ism o'xshashligi", () => {
  assert.equal(V.nameScore("Akmal Karimov", "akmal  karimov"), 3);
  assert.equal(V.nameScore("Akmal", "Akmal Karimov"), 2.5);
  assert.equal(V.nameScore("Akmaljon", "Akmal Karimov"), 1);
  assert.equal(V.nameScore("Bobur", "Akmal Karimov"), 0);
  assert.equal(V.canonicalCustomer("akmal", [{ name: "Akmal Karimov" }, { name: "Jasur" }]), "Akmal Karimov");
  assert.equal(V.canonicalCustomer("Yangi Mijoz", [{ name: "Akmal Karimov" }]), "Yangi Mijoz");
});

test("brauzer: to'lov uchun buyurtma — raqam, yagona qarzdor, summa qarzga teng, tanlov", () => {
  assert.deepEqual(V.findPaymentOrders({ orderNumber: "001", customer: "x" }, orders).orders.map((o) => o.id), ["o1"]);
  const j = V.findPaymentOrders({ customer: "Jasur", amount: 100 }, orders);
  assert.deepEqual([j.exact, j.orders[0].id], [true, "o4"]);
  const a = V.findPaymentOrders({ customer: "Akmal", amount: 50000 }, orders);
  assert.equal(a.exact, false, "ikkita qarzdor buyurtma — so'raladi");
  assert.deepEqual(a.orders.map((o) => o.id), ["o2", "o1"], "yangisi tepada, to'langan ko'rsatilmaydi");
  const eq = V.findPaymentOrders({ customer: "Akmal", amount: 300000 }, orders);
  assert.deepEqual([eq.exact, eq.orders[0].id], [true, "o2"]);
  assert.deepEqual(V.findPaymentOrders({ customer: "Noma'lum" }, orders), { orders: [], exact: false });
});

test("brauzer: smeta pozitsiyalari — kalkulyator bilan bir xil hisob", () => {
  const items = V.quoteItems([
    { title: "Banner", unit: "m2", w: 2, h: 1, qty: 1, price: 80000 },
    { title: "Banner 2", unit: "m2", w: 3, h: 1, qty: 1, total: 250000 },
    { title: "Vizitka", unit: "pcs", qty: 500, price: 300 },
    { title: "Montaj", unit: "lump", qty: 1, total: 150000 },
    { title: "Narxsiz", unit: "pcs", qty: 2 },
  ]);
  assert.equal(items.length, 4, "summasiz pozitsiya qo'shilmaydi");
  assert.deepEqual(items.map((i) => i.total), [160000, 250000, 150000, 150000]);
  assert.equal(items[0].area, 2);
  assert.equal(items[1].manualTotal, true, "jami narxga bo'linmasa — «qo'lda» summa");
  assert.equal(items[3].unit, "lump");
});

test("brauzer: rasxod, vazifa va lid formalariga boshlang'ich qiymatlar", () => {
  const emps = [{ id: "b", name: "Bekzod Tursunov", role: "installer" }, { id: "s", name: "Sardor", role: "printer" }, { id: "boss", name: "Sherzod", role: "admin" }];
  assert.deepEqual(V.expensePreset({ amount: 2000000, employee: "Bekzod", paymentType: "naqd" }, emps), { category: "Xodimlar", subcategory: undefined, amount: 2000000, paymentType: "naqd", note: "", date: undefined, employeeId: "b" });
  const j = V.jobPreset({ kind: "install", title: "Viveska montaji", customer: "Jasur", date: "2026-10-23", time: "14:00", assignees: ["Bekzod", "Noma'lum"] }, emps);
  assert.deepEqual([j.kind, j.title, j.date, j.time, j.assigneeIds], ["install", "Jasur — Viveska montaji", "2026-10-23", "14:00", ["b"]]);
  assert.equal(V.jobPreset({ kind: "measure", title: "Jasur uyi", customer: "Jasur" }, emps).title, "Jasur uyi");
  assert.equal(V.leadPrefill({ customer: "akmal", estimatedValue: 1000000 }, [{ name: "Akmal Karimov" }]).customer, "Akmal Karimov");
  assert.match(V.summary({ action: "payment", data: { customer: "Akmal", amount: 300000, paymentType: "karta" } }), /Akmal · 300 000 so'm · karta/);
});
