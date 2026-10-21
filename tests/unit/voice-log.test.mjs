// Ovozli ish jurnali: AI javobini tekshirish, karta → saqlash oqimi, tuzatish, savollar, eslatmalar, AI xizmatlari
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(path.resolve(here, "../../backend/package.json"));
const VL = req("./voice-log.js");
const { createAi, resolveConfig, parseJson } = req("./voice-ai.js");
const { buildWorkbook } = req("./excel-pro.js");

// 2026-10-22 10:00 Toshkent
const NOW = new Date("2026-10-22T05:00:00Z");

function setup({ aiReplies = [], transcript = "", role = "admin", now = () => NOW, env = {} } = {}) {
  const kv = new Map();
  const getStmt = { get: (k) => (kv.has(k) ? { value: kv.get(k) } : undefined) };
  const upsertStmt = { run: (k, v) => kv.set(k, v) };
  const emps = [{ id: "boss", name: "Sherzod", role }, { id: "op", name: "Operator", role: "operator" }];
  kv.set("uvix:customers", JSON.stringify([{ id: "c1", name: "Akmal Karimov" }]));
  const calls = [];
  let msgId = 100;
  const bot = {
    api: async (method, body) => { calls.push({ method, body }); return method === "sendMessage" ? { message_id: ++msgId } : true; },
    downloadFile: async (id) => { calls.push({ method: "download", id }); return Buffer.from("OGG"); },
    sendToEmployee: async (empId, text, extra) => { calls.push({ method: "toEmp", empId, text, extra }); return true; },
    sendDocumentToEmployee: async (empId, buf, name) => { calls.push({ method: "doc", empId, name, size: buf.length }); return true; },
  };
  const prompts = [];
  const ai = {
    status: () => ({ ready: true, voice: true }),
    transcribe: async () => transcript,
    extract: async (system, user) => { prompts.push(user); return aiReplies.shift() || { intent: "other", reply: "?" }; },
  };
  const api = VL(null, { getStmt, upsertStmt, readEmployees: () => emps, bot, ai, buildWorkbook, now, interval: 0, env });
  const log = () => JSON.parse(kv.get(VL.KEY) || "[]");
  const drafts = () => JSON.parse(kv.get(VL.DRAFTS) || "{}");
  const lastText = () => [...calls].reverse().find((c) => c.body?.text)?.body;
  const press = (data) => api.handle({ empId: "boss", chatId: "1", callback: { id: "cb", data, message: { message_id: 101 } } });
  return { kv, calls, api, log, drafts, lastText, press, prompts };
}

test("normalize: summa, valyuta, birlik, noto'g'ri yozuvlar tashlanadi", () => {
  const r = VL.normalize({ intent: "log", entries: [
    { work: "Viveska tayyorladim", customer: "Akmal", qty: "3", unit: "dona", amount: "450 000", status: "done" },
    { work: "  ", amount: 5 },
    { work: "Montaj", amount: 200, currency: "usd", status: "todo", due: "2026-10-23", dueTime: "9:30", remindAt: "2026-10-23 08:00" },
    { work: "Xato sana", due: "2026-13-45", dueTime: "25:00" },
  ] }, NOW);
  assert.equal(r.intent, "log");
  assert.equal(r.entries.length, 3);
  assert.deepEqual([r.entries[0].qty, r.entries[0].amount, r.entries[0].currency], [3, 450000, "UZS"]);
  assert.deepEqual([r.entries[1].currency, r.entries[1].dueTime, r.entries[1].remindAt], ["USD", "09:30", "2026-10-23 08:00"]);
  assert.equal(r.entries[2].due, null);
  assert.equal(r.entries[2].dueTime, null);
  assert.equal(VL.normalize({ intent: "log", entries: [] }, NOW).intent, "other");
  assert.equal(VL.normalize({ intent: "hack" }, NOW).intent, "other");
});

test("normalize: «qolgan ishlar» kelajakdagilarni ham oladi, export standart 7 kun", () => {
  const q = VL.normalize({ intent: "query", query: { from: "2000-01-01", to: "2026-10-22", status: "todo" } }, NOW).query;
  assert.equal(q.to, "9999-12-31");
  const e = VL.normalize({ intent: "export" }, NOW).query;
  assert.deepEqual([e.from, e.to], ["2026-10-16", "2026-10-22"]);
  const sw = VL.normalize({ intent: "query", query: { from: "2026-10-22", to: "2026-10-01" } }, NOW).query;
  assert.deepEqual([sw.from, sw.to], ["2026-10-01", "2026-10-22"]);
});

test("eslatma vaqti: aytilgan vaqt / ishdan 1 soat oldin / kechiktirish / bajarilgan — yo'q", () => {
  assert.equal(VL.remindTime({ status: "todo", due: "2026-10-23", dueTime: "14:00" }), Date.parse("2026-10-23T13:00:00+05:00"));
  assert.equal(VL.remindTime({ status: "todo", remindAt: "2026-10-23 08:15" }), Date.parse("2026-10-23T08:15:00+05:00"));
  assert.equal(VL.remindTime({ status: "todo", due: "2026-10-23" }), null);
  assert.equal(VL.remindTime({ status: "todo", snoozeUntil: 123, remindAt: "2026-10-23 08:15" }), 123);
  assert.equal(VL.remindTime({ status: "done", due: "2026-10-23", dueTime: "14:00" }), null);
});

test("matn → karta → «Saqlash» → jurnalga yoziladi", async () => {
  const s = setup({ aiReplies: [{ intent: "log", entries: [{ work: "Viveska", customer: "Akmal Karimov", qty: 3, unit: "dona", amount: 450000, status: "done" }] }] });
  assert.equal(await s.api.handle({ empId: "boss", chatId: "1", message: { text: "Akmalga 3 ta viveska, 450 ming" } }), true);
  assert.match(s.prompts[0], /Bugun: 2026-10-22 \(payshanba\), soat 10:00/);
  assert.match(s.prompts[0], /Akmal Karimov/);
  const card = s.lastText();
  assert.match(card.text, /Yozib oldim/);
  assert.match(card.text, /450 000 so'm/);
  const id = Object.keys(s.drafts())[0];
  assert.equal(card.reply_markup.inline_keyboard[0][0].callback_data, `vl:s:${id}`);
  assert.equal(s.log().length, 0, "tasdiqlanmaguncha yozilmaydi");
  await s.press(`vl:s:${id}`);
  const log = s.log();
  assert.equal(log.length, 1);
  assert.deepEqual([log[0].empId, log[0].date, log[0].status, log[0].amount, log[0].source], ["boss", "2026-10-22", "done", 450000, "text"]);
  assert.ok(log[0].doneAt);
  assert.deepEqual(s.drafts(), {});
  assert.match(s.lastText().text, /Saqlandi/);
});

test("ovozli xabar yuklab olinadi va matnga aylantiriladi; «Bekor» — yozilmaydi", async () => {
  const s = setup({ transcript: "ertaga soat 14 da Jasurga montaj", aiReplies: [{ intent: "log", entries: [{ work: "Montaj", customer: "Jasur", status: "todo", due: "2026-10-23", dueTime: "14:00" }] }] });
  await s.api.handle({ empId: "boss", chatId: "1", message: { voice: { file_id: "F1", mime_type: "audio/ogg", file_size: 9000 } } });
  assert.ok(s.calls.some((c) => c.method === "download" && c.id === "F1"));
  assert.match(s.prompts[0], /ertaga soat 14 da Jasurga montaj/);
  const card = s.lastText().text;
  assert.match(card, /muddat 23\.10 14:00/);
  assert.match(card, /🔔 23\.10 13:00/);
  assert.match(card, /«ertaga soat 14 da Jasurga montaj»/);
  await s.press(`vl:x:${Object.keys(s.drafts())[0]}`);
  assert.equal(s.log().length, 0);
});

test("faqat rahbar: boshqa xodim va ulanmagan chat — bot avvalgidek (false)", async () => {
  const s = setup();
  assert.equal(await s.api.handle({ empId: "op", chatId: "2", message: { text: "salom" } }), false);
  assert.equal(await s.api.handle({ empId: null, chatId: "3", message: { text: "salom" } }), false);
  const only = setup({ env: { VOICE_LOG_OWNERS: "op" } });
  assert.equal(await only.api.handle({ empId: "boss", chatId: "1", message: { text: "salom" } }), false);
  assert.equal(s.calls.length, 0);
});

test("tuzatish: ✏️ → yangi gap → eski karta yopiladi, yangisi chiqadi", async () => {
  const s = setup({ aiReplies: [
    { intent: "log", entries: [{ work: "Pechat", amount: 300000 }] },
    { intent: "log", entries: [{ work: "Pechat", amount: 500000 }] },
  ] });
  await s.api.handle({ empId: "boss", chatId: "1", message: { text: "pechat 300 ming" } });
  const first = Object.keys(s.drafts())[0];
  await s.press(`vl:e:${first}`);
  assert.equal(s.drafts()[first].awaitingEdit, true);
  await s.api.handle({ empId: "boss", chatId: "1", message: { text: "summa 500 ming" } });
  assert.match(s.prompts[1], /Oldingi qoralama/);
  assert.match(s.prompts[1], /Tuzatish: """summa 500 ming"""/);
  const ids = Object.keys(s.drafts());
  assert.equal(ids.length, 1);
  assert.notEqual(ids[0], first);
  assert.equal(s.drafts()[ids[0]].entries[0].amount, 500000);
  assert.ok(s.calls.some((c) => c.method === "editMessageText" && /Tuzatildi/.test(c.body.text)));
});

test("savol va buyruqlar: /bugun, /ishlar, «Excel qil»", async () => {
  const s = setup({ aiReplies: [
    { intent: "log", entries: [{ work: "Viveska", amount: 100000 }, { work: "Montaj", status: "todo", due: "2026-10-25" }] },
    { intent: "export", query: { from: "2026-10-01", to: "2026-10-22" } },
  ] });
  await s.api.handle({ empId: "boss", chatId: "1", message: { text: "x" } });
  await s.press(`vl:s:${Object.keys(s.drafts())[0]}`);
  await s.api.handle({ empId: "boss", chatId: "1", message: { text: "/bugun" } });
  assert.match(s.lastText().text, /Viveska/);
  assert.doesNotMatch(s.lastText().text, /Montaj/, "kelajakdagi ish bugungi ro'yxatda emas");
  await s.api.handle({ empId: "boss", chatId: "1", message: { text: "/ishlar" } });
  assert.match(s.lastText().text, /Ochiq ishlar/);
  assert.match(s.lastText().text, /Montaj/);
  await s.api.handle({ empId: "boss", chatId: "1", message: { text: "oy jurnalini excel qil" } });
  const doc = s.calls.find((c) => c.method === "doc");
  assert.equal(doc.name, "ish-jurnali_2026-10-01_2026-10-22.xlsx");
  assert.ok(doc.size > 1000);
});

test("eslatma bir marta yuboriladi, «1 soatdan keyin» qayta eslatadi, «Bajarildi» yopadi", async () => {
  let t = new Date("2026-10-23T07:30:00Z"); // 12:30 Toshkent
  const s = setup({ now: () => t, aiReplies: [{ intent: "log", entries: [{ work: "Montaj", status: "todo", due: "2026-10-23", dueTime: "14:00" }] }] });
  await s.api.handle({ empId: "boss", chatId: "1", message: { text: "x" } });
  await s.press(`vl:s:${Object.keys(s.drafts())[0]}`);
  const rem = () => s.calls.filter((c) => c.method === "toEmp" && /Eslatma/.test(c.text));
  await s.api.tick();
  assert.equal(rem().length, 0, "13:00 dan oldin — yo'q");
  t = new Date("2026-10-23T08:01:00Z"); // 13:01
  await s.api.tick(); await s.api.tick();
  assert.equal(rem().length, 1);
  const btn = rem()[0].extra.reply_markup.inline_keyboard[0];
  await s.press(btn[1].callback_data); // 1 soatdan keyin
  await s.api.tick();
  assert.equal(rem().length, 1);
  t = new Date("2026-10-23T09:02:00Z"); // 14:02
  await s.api.tick();
  assert.equal(rem().length, 2);
  await s.press(btn[0].callback_data); // Bajarildi
  assert.equal(s.log()[0].status, "done");
});

test("kunlik ro'yxat 09:00 da bir marta; ochiq ish bo'lmasa — yuborilmaydi", async () => {
  let t = new Date("2026-10-23T03:00:00Z"); // 08:00
  const s = setup({ now: () => t });
  s.kv.set(VL.KEY, JSON.stringify([
    { id: "a", empId: "boss", date: "2026-10-20", work: "Kechikkan ish", status: "todo", due: "2026-10-21" },
    { id: "b", empId: "boss", date: "2026-10-20", work: "Bugungi ish", status: "todo", due: "2026-10-23" },
    { id: "c", empId: "boss", date: "2026-10-20", work: "Kelasi hafta", status: "todo", due: "2026-10-30" },
  ]));
  const dig = () => s.calls.filter((c) => c.method === "toEmp" && /Bugungi ishlar/.test(c.text));
  await s.api.tick();
  assert.equal(dig().length, 0);
  t = new Date("2026-10-23T04:05:00Z"); // 09:05
  await s.api.tick(); await s.api.tick();
  assert.equal(dig().length, 1);
  assert.match(dig()[0].text, /1 tasi kechikkan/);
  assert.match(dig()[0].text, /Bugungi ish/);
  assert.doesNotMatch(dig()[0].text, /Kelasi hafta/);
  const empty = setup({ now: () => t });
  await empty.api.tick();
  assert.equal(empty.calls.length, 0);
});

test("AI xizmati tanlovi va JSON o'qish", () => {
  assert.deepEqual([resolveConfig({ GEMINI_API_KEY: "g" }).llm, resolveConfig({ GEMINI_API_KEY: "g" }).stt], ["gemini", "gemini"]);
  const c = resolveConfig({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o", VOICE_AI_PROVIDER: "claude" });
  assert.deepEqual([c.llm, c.stt, c.sttModel], ["claude", "openai", "whisper-1"]);
  assert.equal(resolveConfig({ ANTHROPIC_API_KEY: "a" }).stt, null, "Claude ovozni o'zi eshitmaydi");
  assert.equal(resolveConfig({}).llm, null);
  assert.deepEqual(parseJson('Mana:\n```json\n{"intent":"log"}\n```'), { intent: "log" });
  assert.deepEqual(parseJson('gap {"a":1} gap'), { a: 1 });
  assert.equal(parseJson("yo'q"), null);
});

test("AI xizmatlari: Gemini, ChatGPT, Claude so'rovlari to'g'ri yuboriladi", async () => {
  const seen = [];
  const fetchImpl = async (url, opt) => {
    seen.push({ url, opt });
    const body = typeof opt.body === "string" ? JSON.parse(opt.body) : null;
    const out = '{"intent":"other","reply":"ok"}';
    if (url.includes("generativelanguage")) return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: body?.contents?.[0]?.parts?.[0]?.inline_data ? "salom dunyo" : out }] } }] }) };
    if (url.includes("audio/transcriptions")) return { ok: true, json: async () => ({ text: "salom" }) };
    if (url.includes("chat/completions")) return { ok: true, json: async () => ({ choices: [{ message: { content: out } }] }) };
    if (url.includes("anthropic")) return { ok: true, json: async () => ({ content: [{ type: "text", text: out }] }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const g = createAi({ env: { GEMINI_API_KEY: "G" }, fetchImpl });
  assert.equal(await g.transcribe(Buffer.from("x")), "salom dunyo");
  assert.deepEqual(await g.extract("sys", "u"), { intent: "other", reply: "ok" });
  assert.equal(seen[0].opt.headers["x-goog-api-key"], "G");
  const o = createAi({ env: { OPENAI_API_KEY: "O" }, fetchImpl });
  assert.equal(await o.transcribe(Buffer.from("x")), "salom");
  assert.equal((await o.extract("s", "u")).reply, "ok");
  const a = createAi({ env: { ANTHROPIC_API_KEY: "A" }, fetchImpl });
  assert.equal((await a.extract("s", "u")).reply, "ok");
  const last = seen[seen.length - 1];
  assert.equal(last.opt.headers["x-api-key"], "A");
  assert.equal(JSON.parse(last.opt.body).model, "claude-haiku-5-5");
  await assert.rejects(a.transcribe(Buffer.from("x")), /sozlanmagan/);
  const bad = createAi({ env: { OPENAI_API_KEY: "O" }, fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "kechirasiz" } }] }) }) });
  await assert.rejects(bad.extract("s", "u"), /o'qib bo'lmadi/);
});
