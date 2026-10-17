// 14-etap: masofa, «eng yaqin keyingi ish», xodim tavsiyasi, xarita havolalari, kuzatuv (faqat ish vaqtida)
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
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "uvix-geo-")), "g.mjs");
await esbuild.build({ entryPoints: [path.join(front, "src/views/jobs/geoLib.js")], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "error" });
const G = await import(out);
const requireB = createRequire(path.resolve(here, "../../backend/package.json"));
const registerGeo = requireB("./geo.js");

const ME = { lat: 41.3111, lng: 69.2797 };
const J = (id, lat, lng, extra = {}) => ({ id, kind: "measure", geo: { lat, lng }, ...extra });

test("masofa: yo'l bo'yicha taxmin va matn", () => {
  const km = G.roadKm(ME, { lat: 41.32, lng: 69.285 });
  assert.ok(km > 1.2 && km < 1.7, String(km));
  assert.equal(G.fmtKm(0.43), "430 m");
  assert.equal(G.fmtKm(2.44), "2,4 km");
  assert.equal(G.fmtKm(14.2), "14 km");
  assert.equal(G.travelMin(10), 24);
});

test("havolalar: Yandex (ll = lng,lat), Google @ va !3d, oddiy koordinata", () => {
  assert.deepEqual(G.parseMapLink("https://yandex.uz/maps/?ll=69.2860%2C41.3215&z=16"), { lat: 41.3215, lng: 69.286 });
  assert.deepEqual(G.parseMapLink("https://yandex.uz/maps/?whatshere%5Bpoint%5D=69.24%2C41.30&z=17"), { lat: 41.3, lng: 69.24 });
  assert.deepEqual(G.parseMapLink("https://www.google.com/maps/place/X/@41.3111,69.2797,17z"), { lat: 41.3111, lng: 69.2797 });
  assert.deepEqual(G.parseMapLink("https://www.google.com/maps/place/X/data=!3d41.29!4d69.21"), { lat: 41.29, lng: 69.21 });
  assert.deepEqual(G.parseMapLink(" 41.31, 69.24 "), { lat: 41.31, lng: 69.24 });
  assert.equal(G.parseMapLink("Chilonzor 9"), null);
  assert.deepEqual(registerGeo.parseMapLink("https://yandex.uz/maps/?pt=69.1,41.2"), { lat: 41.2, lng: 69.1 });
});

test("kun tartibi: yaqinidan uzoqqa; vaqt yetsa — maslahat, yetmasa — vaqtlisi birinchi", () => {
  const near = J("n", 41.32, 69.285), far = J("f", 41.23, 69.21), timed = J("t", 41.285, 69.204, { kind: "install", time: "14:00" }), nog = { id: "x", kind: "other" };
  let p = G.planDay(ME, [far, timed, near, nog], 9 * 60);
  assert.deepEqual(p.order.map((j) => j.id), ["n", "t", "f", "x"]);
  assert.equal(p.nearestId, "n");
  assert.equal(p.hint.time, "14:00");
  p = G.planDay(ME, [far, timed, near], 13 * 60 + 30); // vaqt yetmaydi
  assert.equal(p.order[0].id, "t");
  assert.equal(p.hint, null);
  assert.equal(G.planDay(null, [near], 0).nearestId, undefined);
});

test("tavsiya: bo'sh va eng yaqin; band bo'lsa pastga; manba — hozirgi joy / oldingi ish / sex", () => {
  const people = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }];
  const jobs = [{ id: "j1", date: "2026-10-17", time: "11:00", duration: 120, assigneeIds: ["a"], geo: { lat: 41.23, lng: 69.21 }, status: "new" }];
  const r = G.recommend({ target: { lat: 41.32, lng: 69.285 }, date: "2026-10-17", time: "12:00", duration: 60, people, jobs, live: { b: ME }, workshop: { lat: 41.35, lng: 69.35 }, today: "2026-10-17" });
  assert.equal(r[0].p.id, "b"); assert.equal(r[0].from, "live");
  assert.equal(r[r.length - 1].p.id, "a"); assert.equal(r[r.length - 1].busy, true); assert.equal(r[r.length - 1].from, "job");
  assert.equal(r.find((x) => x.p.id === "c").from, "workshop");
  // vaqtsiz vazifa: oldingi ish emas, hozirgi joy hisoblanadi
  const r2 = G.recommend({ target: ME, date: "2026-10-17", time: "", people: [{ id: "a", name: "A" }], jobs, live: { a: ME }, today: "2026-10-17" });
  assert.equal(r2[0].from, "live");
});

function mem() {
  const db = new Map();
  return { getStmt: { get: (k) => (db.has(k) ? { value: db.get(k) } : undefined) }, upsertStmt: { run: (k, v) => db.set(k, v) }, deleteStmt: { run: (k) => db.delete(k) }, db };
}
const app = { get() {}, post() {}, put() {} };

test("kuzatuv: o'chiq, rozilik, ish vaqti (Keldim → Ketdim), siyrak yozish, holat", () => {
  const m = mem();
  let shift = true, t = new Date("2026-10-17T05:00:00Z");
  const g = registerGeo(app, { ...m, readEmployees: () => [{ id: "e1", name: "E", role: "installer" }], requireAuth: () => {}, isWorker: () => true, onShift: () => shift, localDate: (d) => d.toISOString().slice(0, 10), now: () => t, interval: 0 });
  assert.equal(g.ingest("e1", { lat: 41.3, lng: 69.2 }).reason, "disabled");
  m.upsertStmt.run("uvix:geoConfig", JSON.stringify({ enabled: true }));
  assert.equal(g.ingest("e1", { lat: 41.3, lng: 69.2 }).reason, "consent");
  m.upsertStmt.run("uvix:geoConsent", JSON.stringify({ e1: "x" }));
  assert.equal(g.ingest("e1", { lat: 41.3, lng: 69.2, acc: 5000 }).reason, "inaccurate");
  assert.equal(g.ingest("e1", { lat: 41.3, lng: 69.2 }).ok, true);
  assert.equal(g.ingest("e1", { lat: 41.30001, lng: 69.2 }).skipped, true); // 20 s / 15 m ichida
  t = new Date("2026-10-17T05:05:00Z");
  assert.equal(g.onTelegramLocation("e1", { lat: 41.31, lng: 69.21 }).ok, true);
  const pts = JSON.parse(m.db.get("uvix:geo:2026-10-17")).e1;
  assert.equal(pts.length, 2); assert.equal(pts[1][3], "tg");
  shift = false;
  assert.equal(g.ingest("e1", { lat: 41.32, lng: 69.22 }).reason, "off_shift");
  // holat: ish joyida / yo'lda / to'xtagan
  const now = Date.parse("2026-10-17T06:00:00Z");
  assert.equal(registerGeo.statusOf([[now, 41.32, 69.285]], { jobs: [{ id: "j", geo: { lat: 41.3201, lng: 69.2851 } }], now }).s, "onsite");
  assert.equal(registerGeo.statusOf([[now - 300000, 41.30, 69.20], [now, 41.32, 69.24]], { now }).s, "moving");
  assert.equal(registerGeo.statusOf([[now - 1500000, 41.3, 69.2], [now, 41.3001, 69.2]], { now }).min, 25);
});
