// Ikki yo'nalish: rasxodni bo'lish, buyurtma/rasxod ajratish, raqamlash (esbuild bilan yig'iladi)
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
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "uvix-lines-")), "l.mjs");
const src = (p) => JSON.stringify(path.join(front, "src", p));
await esbuild.build({
  stdin: { contents: `export * from ${src("lib/lines.js")}; export { generateOrderNumber } from ${src("lib/finance.js")}; export { predictNumbers } from ${src("lib/production.js")}; export { computePnl } from ${src("lib/pnl.js")};`, resolveDir: front, loader: "js" },
  bundle: true, platform: "node", format: "esm", outfile: out, jsx: "automatic", loader: { ".js": "jsx" }, logLevel: "error",
  define: { "import.meta.env": JSON.stringify({ VITE_API_BASE: "/api", BASE_URL: "/" }) },
});
const M = await import(out);
const pay = (amount, date) => ({ amount, date });
const orders = [
  { id: "a", subcategory: "UVIXPRINT", payments: [pay(600, "2026-10-05")] },
  { id: "b", subcategory: "UVONYX", payments: [pay(400, "2026-10-07")] },
  { id: "c", subcategory: "UVONYX", payments: [pay(100, "2026-09-07")] },
];
const tx = [
  { id: "t1", line: "UVONYX", amount: 50, date: "2026-10-10" },
  { id: "t2", line: "common", amount: 1000, date: "2026-10-01" },
  { id: "t3", amount: 300, date: "2026-10-02" }, // eski, yo'nalishsiz → umumiy
  { id: "t4", category: "Brak", relatedOrderId: "a", amount: 70, date: "2026-10-03" }, // buyurtmadan → UVIXPRINT
  { id: "t5", line: "common", amount: 200, date: "2026-08-01" }, // tushumsiz oy → 50/50
];

test("yo'nalishga ajratish: buyurtmalar, rasxodlar ro'yxati va ulushli hisob", () => {
  const on = M.scopeByLine("UVONYX", orders, tx, orders);
  assert.deepEqual(on.orders.map((o) => o.id), ["b", "c"]);
  assert.deepEqual(on.txList.map((t) => t.id), ["t1", "t2", "t3", "t5"]);
  const st = Object.fromEntries(on.txStats.map((t) => [t.id, t.amount]));
  assert.equal(st.t1, 50);
  assert.equal(st.t2, 400); // oktabr: 400/(600+400)
  assert.equal(st.t3, 120);
  assert.equal(st.t5, 100); // avgust — tushum yo'q, teng
  const uv = M.scopeByLine("UVIXPRINT", orders, tx, orders);
  const su = Object.fromEntries(uv.txStats.map((t) => [t.id, t.amount]));
  assert.equal(su.t4, 70);
  assert.equal(su.t2 + st.t2, 1000, "umumiy rasxod to'liq taqsimlanadi");
  assert.equal(su.t1, undefined);
});

test("«Ikkalasi»: hech narsa o'zgarmaydi", () => {
  const all = M.scopeByLine("all", orders, tx, orders);
  assert.equal(all.orders, orders);
  assert.equal(all.txStats, tx);
});

test("raqamlash: UVONYX — ON-, UVIXPRINT — UV-, har biri o'z ketma-ketligida", () => {
  const ex = [{ orderNumber: "UV-261016-001" }, { orderNumber: "UV-261016-002" }, { orderNumber: "ON-261016-001" }];
  assert.equal(M.generateOrderNumber(ex, "2026-10-16", "UVONYX"), "ON-261016-002");
  assert.equal(M.generateOrderNumber(ex, "2026-10-16", "UVIXPRINT"), "UV-261016-003");
  assert.equal(M.generateOrderNumber(ex, "2026-10-16"), "UV-261016-003");
  assert.deepEqual(M.predictNumbers(ex, "2026-10-16", 2, "UVONYX"), ["ON-261016-002", "ON-261016-003"]);
});

test("Foyda va zarar: yo'nalishlar, umumiy ulush, o'tgan oy, qarz", async () => {
  const { computePnl } = await import(out);
  const orders = [
    { id: "a", subcategory: "UVIXPRINT", agreementUzs: 1000, payments: [{ amount: 600, date: "2026-10-02" }, { amount: 100, date: "2026-09-02" }] },
    { id: "b", subcategory: "UVONYX", agreementUzs: 500, payments: [{ amount: 400, date: "2026-10-03" }] },
  ];
  const tx = [
    { id: "1", line: "UVONYX", amount: 50, date: "2026-10-01" },
    { id: "2", line: "common", amount: 1000, date: "2026-10-01" },
    { id: "3", relatedOrderId: "a", amount: 70, date: "2026-10-05" },
    { id: "4", line: "UVIXPRINT", amount: 20, date: "2026-09-05" },
  ];
  const p = computePnl(orders, tx, "2026-10");
  assert.equal(p.UVIXPRINT.income, 600); assert.equal(p.UVONYX.income, 400);
  assert.equal(p.UVIXPRINT.direct, 70); assert.equal(p.UVONYX.direct, 50);
  assert.equal(p.UVIXPRINT.common, 600); assert.equal(p.UVONYX.common, 400);
  assert.equal(p.UVIXPRINT.profit, -70); assert.equal(p.UVONYX.profit, -50);
  assert.equal(p.total.profit, -120); assert.equal(p.total.common, 1000);
  assert.equal(p.UVIXPRINT.change, (-70 - 80) / 80);
  assert.equal(p.UVONYX.change, null);
  assert.equal(p.UVIXPRINT.debt, 300); assert.equal(p.UVONYX.debt, 100); assert.equal(p.total.debt, 400);
});

test("Umumiy xodim oyligi — bajargan ishi nisbatida", async () => {
  const { computePnl, scopeByLine } = await import(out);
  const orders = [{ id: "a", subcategory: "UVIXPRINT", payments: [{ amount: 900, date: "2026-10-02" }] }, { id: "b", subcategory: "UVONYX", payments: [{ amount: 100, date: "2026-10-02" }] }];
  const tx = [{ id: "s", line: "common", employeeId: "j", amount: 1000, date: "2026-10-30" }, { id: "r", line: "common", amount: 100, date: "2026-10-01" }];
  const work = { "2026-10": { j: { UVIXPRINT: 3, UVONYX: 7 } } };
  const p = computePnl(orders, tx, "2026-10", work);
  assert.equal(p.UVIXPRINT.staff, 300); assert.equal(p.UVONYX.staff, 700);
  assert.equal(p.UVIXPRINT.common, 90); assert.equal(p.UVONYX.common, 10);
  assert.equal(p.hasStaff, true);
  const sc = scopeByLine("UVONYX", orders, tx, orders, work);
  assert.equal(sc.txStats.find((t) => t.id === "s").amount, 700);
  // Ish bo'lmasa — tushum ulushi
  const p2 = computePnl(orders, tx, "2026-10", null);
  assert.equal(p2.UVONYX.common, 110); assert.equal(p2.hasStaff, false);
});
