// Mobil 2–3-bosqich: «Bugun» hisoblari, yorliq matni va QR havolasini o'qish (esbuild bilan yig'iladi)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const front = path.resolve(here, "../../frontend");
const req = createRequire(path.join(front, "package.json"));
const esbuild = req("esbuild");
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "uvix-m2-")), "m2.mjs");
const src = (p) => JSON.stringify(path.join(front, "src", p));
await esbuild.build({
  stdin: { contents: `export { todayStats, attentionItems, waitingChats, waitText } from ${src("views/dashboard/TodayView.jsx")};
export { labelInfo, labelsDocument, LABEL_SIZES } from ${src("views/orders/LabelModal.jsx")};
export { orderIdFromText } from ${src("components/PhoneToDesktop.jsx")};`, resolveDir: front, loader: "js" },
  bundle: true, platform: "node", format: "esm", outfile: out, jsx: "automatic", loader: { ".js": "jsx" }, logLevel: "error",
  define: { "import.meta.env": JSON.stringify({ VITE_API_BASE: "/api", BASE_URL: "/" }) },
});
const M = await import(out);
const H = 3600000;
const NOW = new Date(2026, 9, 15, 14, 0, 0).getTime(); // 15-oktabr 14:00 (mahalliy)
const pay = (amount, date) => ({ amount, date });

test("bugungi tushum, kecha bilan farq, qarzdorlik va bugungi buyurtmalar", () => {
  const orders = [
    { customer: "A", date: "2026-10-15", agreementUzs: 1000, payments: [pay(400, "2026-10-15"), pay(100, "2026-10-14")] },
    { customer: "B", date: "2026-10-01", agreementUzs: 500, payments: [pay(200, "2026-10-14"), { amount: 999, date: "2026-10-15", deletedAt: "x" }] },
    { customer: "C", date: "2026-10-10", agreementUzs: 300, payments: [pay(300, "2026-10-10")] },
  ];
  const s = M.todayStats(orders, new Date(NOW));
  assert.equal(s.income, 400);
  assert.equal(s.prev, 300);
  assert.equal(s.change, 33);
  assert.equal(s.debt, 500 + 300);
  assert.equal(s.debtors, 2);
  assert.equal(s.newCount, 1);
  assert.equal(s.newSum, 1000);
  assert.equal(s.spark.length, 7);
  assert.equal(s.spark[6], 400);
  assert.equal(M.todayStats([], new Date(NOW)).change, null);
});

test("«Diqqat talab qiladi»: tayyor, eski qarz, dizaynda qolgan, vazifasiz", () => {
  const iso = (ms) => new Date(ms).toISOString();
  const orders = [
    { id: "r1", orderNumber: "N1", customer: "Malika", prodStage: "ready", readyAt: iso(NOW - 2 * H), agreementUzs: 0, payments: [] },
    { id: "d1", orderNumber: "N2", customer: "Sardor", date: "2026-10-05", prodStage: "delivered", agreementUzs: 1000, payments: [pay(100, "2026-10-05")] },
    { id: "d2", orderNumber: "N3", customer: "Yangi", date: "2026-10-14", prodStage: "delivered", agreementUzs: 1000, payments: [] },
    { id: "s1", orderNumber: "N4", title: "Fartuk", prodStage: "design", prodAt: iso(NOW - 4 * H), design: { assigneeId: "k" }, agreementUzs: 0, payments: [] },
    { id: "s2", orderNumber: "N5", prodStage: "design", prodAt: iso(NOW - 1 * H), agreementUzs: 0, payments: [] },
    { id: "q1", orderNumber: "N6", title: "Oniks", prodStage: "new", agreementUzs: 0, payments: [] },
    { id: "q2", orderNumber: "N7", prodStage: "new", print: { assigneeId: "j" }, agreementUzs: 0, payments: [] },
  ];
  const it = M.attentionItems(orders, { now: NOW, empById: new Map([["k", { name: "Kamola Sharipova" }]]) });
  const by = Object.fromEntries(it.map((x) => [x.key, x]));
  assert.deepEqual(it.map((x) => x.key), ["ready", "debt", "design", "queue"]);
  assert.equal(by.ready.title, "Buyurtma tayyor");
  assert.match(by.ready.sub, /Malika · 2 soatdan beri kutmoqda/);
  assert.equal(by.debt.count, 1); // 1 kunlik qarz hali «muddati o'tgan» emas
  assert.match(by.debt.sub, /900 so'm/);
  assert.equal(by.design.count, 1);
  assert.match(by.design.sub, /Fartuk · Kamola/);
  assert.equal(by.queue.count, 1); // pechatchisi tayinlangani hisoblanmaydi
  assert.equal(M.attentionItems([], { now: NOW }).length, 0);
});

test("javobsiz chatlar: mijoz oxirgi yozgan, 3 kundan yangi, eng uzoq kutgan birinchi", () => {
  const iso = (ms) => new Date(ms).toISOString();
  const w = M.waitingChats([
    { chatId: "1", lastOut: false, lastDate: iso(NOW - 40 * 60000) },
    { chatId: "2", lastOut: false, lastDate: iso(NOW - 2 * H) },
    { chatId: "3", lastOut: true, lastDate: iso(NOW - H) },
    { chatId: "4", lastOut: false, lastDate: iso(NOW - 80 * H) },
  ], NOW);
  assert.deepEqual(w.map((c) => c.chatId), ["2", "1"]);
  assert.equal(M.waitText(40 * 60000), "40 daq");
  assert.equal(M.waitText(3 * H), "3 soat");
  assert.equal(M.waitText(50 * H), "2 kun");
});

test("yorliq: pulsiz ma'lumot, smeta qismi, o'lcham sahifasi", () => {
  const o = { id: "x", orderNumber: "UV-261013-003", title: "LED peshlavha", materialType: "Akril", area: 0.6, customer: "Malika Interior", date: "2026-10-13", groupIdx: 2, groupSize: 3, agreementUzs: 228000, design: { format: "2000×300 mm" }, print: { deadline: "2026-10-20" } };
  const L = M.labelInfo(o);
  assert.equal(L.no, "UV-261013-003");
  assert.equal(L.part, "2/3");
  assert.equal(L.spec, "Akril · 2000×300 mm · 0,6 m²");
  assert.match(L.deadline, /20-oktabr/);
  const html = M.labelsDocument(["<section>a</section>"], M.LABEL_SIZES[0]);
  assert.match(html, /@page \{ size: 58mm 40mm/);
  assert.ok(!JSON.stringify(L).includes("228"), "yorliqda summa bo'lmasligi kerak");
});

test("QR matnidan buyurtma id: faqat ?o= havolasi", () => {
  assert.equal(M.orderIdFromText("https://uvix.uz/?o=o2"), "o2");
  assert.equal(M.orderIdFromText("https://uvix.uz/app?o=ab-12_C"), "ab-12_C");
  assert.equal(M.orderIdFromText("https://uvix.uz/?qr=abcdefgh123"), null);
  assert.equal(M.orderIdFromText("https://uvix.uz/?o=<script>"), null);
  assert.equal(M.orderIdFromText("o2"), null);
});

test("«Javob shart emas»: belgidan keyin mijoz yozmagan bo'lsa — kutmayapti", () => {
  const req2 = createRequire(path.join(here, "../../backend/package.json"));
  const { noReplyCovers } = req2("./chat-tools.js");
  assert.equal(noReplyCovers({ noReply: "2026-10-15T10:00:00Z" }, "2026-10-15T09:59:00Z"), true);
  assert.equal(noReplyCovers({ noReply: "2026-10-15T10:00:00Z" }, "2026-10-15T10:05:00Z"), false);
  assert.equal(noReplyCovers({}, "2026-10-15T10:05:00Z"), false);
  assert.equal(noReplyCovers(null, "2026-10-15T10:05:00Z"), false);
});
