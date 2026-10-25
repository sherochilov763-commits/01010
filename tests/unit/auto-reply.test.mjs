// Chatlar: avtojavoblar (auto-reply.js) — qoidalar, cheklovlar, yo'nalish bo'yicha matn. Telegram soxtalashtiriladi.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const breq = createRequire(path.resolve(here, "../../backend/package.json"));
const AR = breq("./auto-reply.js");

// Toshkent vaqti: 10:00 — ish vaqti, 22:00 — ishdan tashqari (UTC+5)
const T = (hhmm, day = "2026-10-26") => new Date(`${day}T${hhmm}:00+05:00`);

function setup({ at = T("10:00"), cfg = null, history = 1, typing = false, messages = {} } = {}) {
  const db = { "uvix:telegramMessages": messages, ...(cfg ? { "uvix:autoReply": cfg } : {}) };
  const sent = [];
  const clock = { t: at };
  const chatCfg = { slaMinutes: 15, workFrom: "09:00", workTo: "19:00", workDays: [1, 2, 3, 4, 5, 6] };
  const isWorkTime = (c) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(clock.t).map((x) => [x.type, x.value]));
    const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
    const hm = `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`;
    return c.workDays.includes(dow) && hm >= c.workFrom && hm < c.workTo;
  };
  const waiting = [];
  const ar = AR.createAutoReply({
    read: (k, d) => (k in db ? JSON.parse(JSON.stringify(db[k])) : d),
    write: (k, v) => { db[k] = JSON.parse(JSON.stringify(v)); },
    now: () => clock.t,
    chatTools: { config: () => chatCfg, isWorkTime, typingActive: () => typing, waitingChats: () => waiting },
    send: async (chatId, text) => { sent.push({ chatId, text }); return { tgId: 100 + sent.length }; },
    store: (chatId, msg) => { (db["uvix:telegramMessages"][chatId] ||= []).push({ ...msg, out: true, date: clock.t.toISOString() }); return msg; },
    historyCount: async () => history,
  });
  return { ar, db, sent, clock, waiting };
}
const on = (rules) => ({ on: true, rules: Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, { on: v }])) });

test("yangi o'rnatish: hammasi o'chiq — hech narsa yuborilmaydi", async () => {
  const { ar, sent } = setup({ at: T("22:00") });
  assert.equal(ar.config().on, false);
  assert.equal(await ar.onIncoming("123"), null);
  assert.equal(sent.length, 0);
});

test("asosiy o'chirgich o'chiq bo'lsa — qoidalar yoqilgan bo'lsa ham yuborilmaydi", async () => {
  const { ar, sent } = setup({ at: T("22:00"), cfg: { on: false, rules: { away: { on: true } } } });
  await ar.onIncoming("123");
  assert.equal(sent.length, 0);
});

test("ish vaqtidan tashqari: kuniga 1 marta, {ish_boshi} o'rniga ish boshlanishi", async () => {
  const { ar, sent, clock } = setup({ at: T("22:00"), cfg: on({ away: true }) });
  const m = await ar.onIncoming("123");
  assert.equal(m.auto, "away");
  assert.match(sent[0].text, /09:00 da menejerimiz/);
  clock.t = T("23:30");
  assert.equal(await ar.onIncoming("123"), null, "o'sha kuni ikkinchi marta — yo'q");
  clock.t = T("21:00", "2026-10-27");
  assert.ok(await ar.onIncoming("123"), "ertasi kuni — yana");
  assert.equal(sent.length, 2);
});

test("salomlashish: faqat yangi mijozga (Telegram tarixida 1 ta xabar), 1 marta", async () => {
  const fresh = setup({ cfg: on({ greet: true }), history: 1 });
  assert.equal((await fresh.ar.onIncoming("5")).auto, "greet");
  assert.match(fresh.sent[0].text, /UVIX'ga xush kelibsiz/);
  assert.equal(await fresh.ar.onIncoming("5"), null, "ikkinchi marta — yo'q");
  const old = setup({ cfg: on({ greet: true }), history: 3 });
  assert.equal(await old.ar.onIncoming("5"), null, "eski mijoz — yo'q");
  const unknown = setup({ cfg: on({ greet: true }), history: null });
  assert.equal(await unknown.ar.onIncoming("5"), null, "aniqlab bo'lmasa — yubormaymiz");
});

test("ONYX chati (on:) — ONYX matni", async () => {
  const { ar, sent } = setup({ cfg: on({ greet: true }) });
  await ar.onIncoming("on:77");
  assert.match(sent[0].text, /ONYX'ga xush kelibsiz/);
  assert.doesNotMatch(sent[0].text, /UVIX/);
});

test("menejer yozayotgan yoki 10 daqiqa ichida yozgan bo'lsa — yuborilmaydi", async () => {
  const typing = setup({ at: T("22:00"), cfg: on({ away: true }), typing: true });
  assert.equal(await typing.ar.onIncoming("9"), null);
  const recent = setup({ at: T("22:00"), cfg: on({ away: true }), messages: { 9: [{ out: true, text: "Salom", date: T("21:55").toISOString() }] } });
  assert.equal(await recent.ar.onIncoming("9"), null);
  const older = setup({ at: T("22:00"), cfg: on({ away: true }), messages: { 9: [{ out: true, text: "Salom", date: T("21:40").toISOString() }] } });
  assert.ok(await older.ar.onIncoming("9"));
});

test("«Bu chatda avtojavob» o'chirilgan chatga — hech narsa", async () => {
  const { ar, sent } = setup({ at: T("22:00"), cfg: on({ away: true }) });
  ar.setChatOff("9", true);
  assert.equal(await ar.onIncoming("9"), null);
  ar.setChatOff("9", false);
  assert.ok(await ar.onIncoming("9"));
  assert.equal(sent.length, 1);
});

test("javob kechiksa: har mijoz xabariga 1 marta, ish vaqtidan tashqarida — yo'q", async () => {
  const { ar, sent, waiting, clock } = setup({ cfg: on({ late: true }) });
  waiting.push({ chatId: "9", lastId: "m1", mins: 16 });
  assert.equal(await ar.tick(), 1);
  assert.equal(await ar.tick(), 0, "o'sha xabarga ikkinchi marta — yo'q");
  waiting[0] = { chatId: "9", lastId: "m2", mins: 20 };
  clock.t = T("11:00");
  assert.equal(await ar.tick(), 1, "mijozning yangi xabari — yana");
  clock.t = T("20:00");
  waiting[0] = { chatId: "9", lastId: "m3", mins: 20 };
  assert.equal(await ar.tick(), 0);
  assert.equal(sent.length, 2);
});

test("1 mijozga kuniga 3 tadan ko'p avtojavob yo'q", async () => {
  const { ar, sent, waiting, clock } = setup({ cfg: on({ late: true }) });
  for (let i = 0; i < 5; i++) { waiting[0] = { chatId: "9", lastId: `m${i}`, mins: 16 }; clock.t = T(`1${i}:00`); await ar.tick(); }
  assert.equal(sent.length, 3);
});

test("avtojavob xabarda belgi bilan saqlanadi; lastReal uni hisobga olmaydi", async () => {
  const { ar, db } = setup({ at: T("22:00"), cfg: on({ away: true }), messages: { 9: [{ out: false, text: "Narxi qancha?", date: T("21:59").toISOString() }] } });
  await ar.onIncoming("9");
  const list = db["uvix:telegramMessages"]["9"];
  assert.equal(list.at(-1).auto, "away");
  assert.equal(AR.lastReal(list).text, "Narxi qancha?");
});

test("sozlamani tozalash: noma'lum maydonlar tashlanadi, bo'sh matn — standart, uzun matn qisqartiriladi", () => {
  const c = AR.cleanConfig({ on: "ha", hack: 1, rules: { greet: { on: true, texts: { UVIXPRINT: "  ", UVONYX: "x".repeat(5000) } }, evil: { on: true } } });
  assert.equal(c.on, false);
  assert.equal(c.hack, undefined);
  assert.equal(c.rules.evil, undefined);
  assert.equal(c.rules.greet.on, true);
  assert.equal(c.rules.greet.texts.UVIXPRINT, AR.DEFAULT_TEXTS.greet.UVIXPRINT);
  assert.equal(c.rules.greet.texts.UVONYX.length, 1000);
  assert.equal(c.rules.late.on, false, "javob kechiksa — standart o'chiq");
});
