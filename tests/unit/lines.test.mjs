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
  stdin: { contents: `export * from ${src("lib/lines.js")}; export { generateOrderNumber } from ${src("lib/finance.js")}; export { predictNumbers } from ${src("lib/production.js")};`, resolveDir: front, loader: "js" },
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
