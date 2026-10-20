// Hisob-kitob auditi (2026-10): o'chirilgan to'lovlar, davr, material, ortiqcha to'lov, kassa ayniyati, P&L oldingi davr, lid muhimligi
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
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "uvix-fin-")), "f.mjs");
const src = (p) => JSON.stringify(path.join(front, "src", p));
await esbuild.build({
  stdin: { contents: `export * from ${src("lib/finance.js")}; export { kassaReport, computeKassa } from ${src("lib/kassa.js")}; export { computePnlMonths, monthsBetween } from ${src("lib/pnl.js")}; export * from ${src("lib/leadPriority.js")}; export { leadLineOf } from ${src("lib/lines.js")};`, resolveDir: front, loader: "js" },
  bundle: true, platform: "node", format: "esm", outfile: out, jsx: "automatic", loader: { ".js": "jsx" }, logLevel: "error",
  define: { "import.meta.env": JSON.stringify({ VITE_API_BASE: "/api", BASE_URL: "/" }) },
});
const F = await import(out);

const order = (id, date, sum, payments, extra = {}) => ({ id, orderNumber: id, date, agreementUzs: sum, subcategory: "UVIXPRINT", payments, ...extra });

test("o'chirilgan to'lov hisoblanmaydi, to'lov sanasi bo'yicha davr", () => {
  const o1 = order("A", "2026-09-10", 1_000_000, [{ id: 1, date: "2026-09-10", amount: 300_000, paymentType: "naqd" }, { id: 2, date: "2026-10-05", amount: 500_000, paymentType: "naqd", deletedAt: "x" }, { id: 3, date: "2026-10-06", amount: 200_000, paymentType: "perechisleniye" }]);
  const st = F.computeFinanceStats([], [], { payOrders: [o1], from: "2026-10-01", to: "2026-10-31" });
  assert.equal(st.periodPaid, 200_000); // eski buyurtmaga oktabrda kelgan to'lov ham davrga kiradi, o'chirilgani — yo'q
  assert.equal(st.bankPaid, 200_000); // perechisleniye → bank
  assert.equal(F.orderTotalPaid(o1), 500_000);
});

test("ortiqcha to'lov: qarz 0, ortiqcha alohida, yig'ilgan % 100 dan oshmaydi", () => {
  const o = order("B", "2026-10-01", 100, [{ id: 1, date: "2026-10-01", amount: 130 }]);
  assert.equal(F.orderDebt(o), 0);
  assert.equal(F.orderOverpaid(o), 30);
  const st = F.computeFinanceStats([o], []);
  assert.equal(st.totalOverpaid, 30);
  assert.equal(st.collectionRatePct, 100);
});

test("material: bog'langan Material rasxodidan (eskirgan materialSum emas)", () => {
  const o = order("C", "2026-10-01", 1000, [], { materialSum: 400 });
  const txs = [{ id: "t1", category: "Material", amount: 250, relatedOrderId: "C" }, { id: "t2", category: "Brak", amount: 99, relatedOrderId: "C" }, { id: "t3", category: "Material", amount: 50, relatedOrderId: "C", deletedAt: "x" }];
  assert.equal(F.orderMaterialSum(o, txs), 250);
  assert.equal(F.orderMaterialSum(o, []), 400); // bog'langan rasxod yo'q — eski maydon
});

test("kassa hisoboti: boshlang'ich + kirim − chiqim ± o'tkazma = yakuniy", () => {
  const orders = [order("D", "2026-09-01", 1e6, [{ date: "2026-09-02", amount: 400, paymentType: "naqd" }, { date: "2026-10-03", amount: 300, paymentType: "karta" }])];
  const txs = [{ date: "2026-10-04", amount: 100, paymentType: "naqd", line: "UVIXPRINT" }, { date: "2026-09-20", amount: 50, paymentType: "karta", line: "common" }];
  const transfers = [{ date: "2026-10-05", amount: 70, from: { line: "UVIXPRINT", type: "karta" }, to: { line: "UVONYX", type: "naqd" } }];
  const r = F.kassaReport(orders, txs, transfers, { from: "2026-10-01", to: "2026-10-31" });
  for (const l of ["UVIXPRINT", "UVONYX"]) for (const t of ["naqd", "karta", "bank"]) {
    const x = r.rows[l][t];
    assert.equal(x.open + x.in - x.out + x.tin - x.tout, x.close, `${l}/${t}`);
  }
  assert.equal(r.rows.UVIXPRINT.naqd.open, 400);
  assert.equal(r.rows.UVIXPRINT.karta.open, -50);
  assert.equal(r.rows.UVONYX.naqd.close, 70);
  assert.equal(r.total.close, F.computeKassa(orders, txs, transfers, { to: "2026-10-31" }).totals.all);
});

test("P&L: oraliq oylar va oldingi davr bilan farq", () => {
  assert.deepEqual(F.monthsBetween("2026-08-15", "2026-10-02"), ["2026-08", "2026-09", "2026-10"]);
  const orders = [order("E", "2026-09-01", 1e6, [{ date: "2026-09-05", amount: 1000 }, { date: "2026-10-05", amount: 3000 }])];
  const p = F.computePnlMonths(orders, [], ["2026-10"], null);
  assert.equal(p.total.profit, 3000);
  assert.equal(p.total.prevProfit, 1000);
  assert.equal(p.total.diff, 2000);
});

test("lid muhimligi: ustunda shoshilinch → kechikkan ish → summa", () => {
  const leads = [
    { id: "a", estimatedValue: 900 },
    { id: "b", estimatedValue: 100, priority: "urgent" },
    { id: "c", estimatedValue: 50 },
    { id: "d", estimatedValue: 5000, priority: "low" },
  ];
  const jobs = [{ id: "j", leadId: "c", status: "new", date: "2020-01-01", kind: "measure" }];
  assert.deepEqual(F.sortLeads(leads, jobs).map((l) => l.id), ["b", "c", "a", "d"]);
  assert.equal(F.nextActivity(leads[2], jobs).state, "late");
  assert.equal(F.nextActivity(leads[0], jobs).state, "none");
  assert.equal(F.priorityOf({}), "mid");
  assert.equal(F.leadLineOf({ telegramChatId: "on:123" }), "UVONYX");
  assert.equal(F.leadLineOf({ line: "UVONYX" }), "UVONYX");
  assert.equal(F.leadLineOf({}), "UVIXPRINT");
});
