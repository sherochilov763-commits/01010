// Vazifalar: tezkor qo'shish satri, guruhlash, vaqt matnlari (esbuild bilan yig'iladi)
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
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "uvix-jobs-")), "j.mjs");
await esbuild.build({
  stdin: { contents: `export * from ${JSON.stringify(path.join(front, "src/views/jobs/jobsLib.js"))};`, resolveDir: front, loader: "js" },
  bundle: true, platform: "node", format: "esm", outfile: out, jsx: "automatic", loader: { ".js": "jsx" }, logLevel: "error",
});
const M = await import(out);
const T = "2026-10-16";
const employees = [{ id: "bekzod", name: "Bekzod Tursunov" }, { id: "sardor", name: "Sardor Qodirov" }];
const orders = [{ id: "o1", orderNumber: "ON-261016-001" }];

test("tezkor satr: tur, buyurtma, sana, vaqt, xodimlar", () => {
  const p = M.parseQuick("Montaj ON-261016-001 ertaga 14:00 @Bekzod @sard", { employees, orders, t: T });
  assert.equal(p.kind, "install");
  assert.equal(p.orderId, "o1");
  assert.equal(p.date, "2026-10-17");
  assert.equal(p.time, "14:00");
  assert.deepEqual(p.assigneeIds, ["bekzod", "sardor"]);
  assert.equal(p.title, "");
});
test("tezkor satr: o'lchov (apostrof bilan), sana 20.10, qolgani — nomi", () => {
  const p = M.parseQuick("O‘lchov 20.10 9:30 Dilshod uyi @Nomalum", { employees, orders, t: T });
  assert.equal(p.kind, "measure");
  assert.equal(p.date, "2026-10-20");
  assert.equal(p.time, "09:30");
  assert.equal(p.title, "Dilshod uyi @Nomalum");
});
test("tezkor satr: faqat vaqt → bugun; o'tgan sana → keyingi yil", () => {
  assert.equal(M.parseQuick("11:00 qo'ng'iroq", { t: T }).date, T);
  assert.equal(M.parseQuick("05.01 x", { t: T }).date, "2027-01-05");
});
test("guruhlash: kechikkan / bugun / ertaga / sanasiz / bajarilgan", () => {
  const L = [
    { id: "a", status: "new", date: "2026-10-15", time: "16:00" },
    { id: "b", status: "new", date: T, time: "09:00" },
    { id: "c", status: "doing", date: T, time: "18:00" },
    { id: "d", status: "new", date: "2026-10-17" },
    { id: "e", status: "new", date: null },
    { id: "f", status: "done", date: T, doneAt: "2026-10-16T10:00:00Z" },
    { id: "g", status: "new", date: "2026-10-25" },
  ];
  const g = Object.fromEntries(M.groupJobs(L, T, "12:00").map(([k, , a]) => [k, a.map((x) => x.id)]));
  assert.deepEqual(g, { late: ["a", "b"], today: ["c"], tomorrow: ["d"], later: ["g"], nodate: ["e"], done: ["f"] });
  assert.equal(M.weekDoneCount(L, T), 1);
});
test("vaqt matni", () => {
  assert.equal(M.whenText({ date: T, time: "14:00" }, T), "14:00");
  assert.equal(M.whenText({ date: "2026-10-15", time: "16:00" }, T), "kecha 16:00");
  assert.equal(M.whenText({ date: null }, T), "sanasiz");
  assert.equal(M.untilText({ date: T, time: "14:00" }, new Date("2026-10-16T12:40:00")), "1 soat 20 daqiqadan keyin");
});
