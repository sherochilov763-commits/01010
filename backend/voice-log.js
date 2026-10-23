// voice-log.js — Ovozli ish jurnali (shaxsiy yordamchi, faqat rahbar uchun).
//
// Oqim (mavjud UVIX boti orqali, alohida bot kerak emas):
//   1. Rahbar botga ovozli xabar (yoki oddiy matn) yuboradi.
//   2. Ovoz → matn (voice-ai.js), matn → yozuvlar: ish, mijoz, soni, summa, holat, muddat, eslatma.
//   3. Bot karta qaytaradi: ✅ Saqlash · ✏️ Tuzatish · ❌ Bekor. Faqat «Saqlash»dan keyin jurnalga yoziladi.
//   4. Savol berilsa («bugun nima qildim?», «qaysi ishlar qoldi?») — jurnaldan javob; «Excel qil» — fayl.
//   5. Muddatli ish: vaqti bo'lsa 1 soat oldin (yoki aytilgan vaqtda) eslatma; har kuni 09:00 da ochiq ishlar ro'yxati.
//
// Saqlash (ichki kalitlar, KV orqali ochilmaydi):
//   uvix:worklog        — [{ id, empId, at, date, source, transcript, work, customer, qty, unit, amount, currency,
//                            status: "done"|"todo", due, dueTime, remindAt, note, doneAt, remindedAt, snoozeUntil, deletedAt }]
//   uvix:worklogDrafts  — { [draftId]: { empId, chatId, msgId, transcript, source, entries, awaitingEdit, at } }
//   uvix:worklogDigest  — { [empId]: "YYYY-MM-DD" } — kunlik ro'yxat yuborilgan sana
//
// Kim ishlatadi: faqat rahbar (role = admin). VOICE_LOG_OWNERS=<id1,id2> bilan aniq hisoblarni ko'rsatish mumkin.
const crypto = require("crypto");

const KEY = "uvix:worklog";
const DRAFTS = "uvix:worklogDrafts";
const DIGEST = "uvix:worklogDigest";
const MAX_LOG = 20000;
const DRAFT_TTL = 48 * 3600e3;
const LATE_LIMIT = 6 * 3600e3; // shundan eski eslatma yuborilmaydi (server o'chib qolgan bo'lsa spam bo'lmasin)
const DIGEST_HM = "09:00";
const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

const rid = () => crypto.randomBytes(6).toString("hex");
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const dateOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") && !Number.isNaN(Date.parse(v)) ? v : null);
const timeOk = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim()); return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, "0")}:${m[2]}` : null; };
const numOk = (v) => { const n = typeof v === "string" ? Number(v.replace(/[\s,]/g, "")) : Number(v); return v !== null && v !== "" && Number.isFinite(n) && n >= 0 ? n : null; };
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const money = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const dm = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : "");
const atLocal = (date, hm) => Date.parse(`${date}T${hm}:00+05:00`);

function tashkent(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, hm: `${p.hour}:${p.minute}`, weekday: WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] };
}
function addDays(date, n) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// ---------- AI uchun ko'rsatma ----------
const SYSTEM = `Sen UVIX kompaniyasi rahbarining shaxsiy ish jurnali yordamchisisan. Rahbar ovoz yoki matn bilan nima qilganini, nima qilish kerakligini aytadi yoki jurnaldan so'raydi.
Faqat bitta JSON obyekt qaytar, boshqa hech narsa yozma:
{
  "intent": "log" | "query" | "export" | "other",
  "entries": [{
    "work": "ish qisqacha, o'zbek lotin yozuvida",
    "customer": "mijoz ismi yoki null",
    "qty": son yoki null,
    "unit": "dona" | "m²" | "metr" | "list" | boshqa qisqa birlik | null,
    "amount": summa (son) yoki null,
    "currency": "UZS" | "USD" | null,
    "status": "done" | "todo",
    "due": "YYYY-MM-DD" yoki null,
    "dueTime": "HH:MM" yoki null,
    "remindAt": "YYYY-MM-DD HH:MM" yoki null,
    "note": "qo'shimcha muhim gap yoki null"
  }],
  "query": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "status": "all" | "done" | "todo", "customer": "ism yoki null" } yoki null,
  "reply": "foydalanuvchiga juda qisqa o'zbekcha javob"
}
Qoidalar:
- "log": bajarilgan ish haqida xabar, yoki qilinishi kerak bo'lgan ish / eslatma. Har alohida ish — alohida yozuv.
- Bajarilgan ish → status "done". Kelajakdagi ish, "kerak", "qilish kerak", "eslat", "ertaga" → status "todo".
- "ming" = 1000, "million"/"mln" = 1000000 ("450 ming" → 450000, "1,5 million" → 1500000). "dollar", "$", "bucks" → currency "USD", aks holda summa bo'lsa "UZS".
- Sanalar bugungi kunga nisbatan: "ertaga", "indinga", "dushanba", "keyingi hafta" va h.k. Vaqt "soat 3 da" kunduzi bo'lsa 15:00, "ertalab 9" → 09:00.
- "remindAt" faqat aniq eslatish so'ralganda ("eslat", "eslatib qo'y"): aytilgan vaqt; vaqt aytilmasa — ish vaqtidan 1 soat oldin; ish vaqti ham bo'lmasa — o'sha kuni 09:00.
- "query": jurnaldan so'rash ("bugun nima qildim?", "bu hafta Akmalga nima qildik?", "qaysi ishlar qoldi?"). from/to — davr (bugun bo'lsa ikkalasi bugun). "qolgan/qilinmagan ishlar" → status "todo" va from — 2000-01-01.
- "export": jadval / Excel / fayl so'ralsa; davrni "query"ga yoz (aytilmasa — oxirgi 7 kun).
- "other": salom, rahmat va h.k. — "reply"da qisqa javob, entries bo'sh.
- Mijoz nomi ma'lum mijozlar ro'yxatidagiga o'xshasa, ro'yxatdagi yozilishini ol. Mijoz aytilmasa — null. Hech narsani o'ylab topma.
- Agar "Oldingi qoralama" berilgan bo'lsa — bu tuzatish: qoralamani tuzatish so'ziga ko'ra o'zgartirib, BARCHA yozuvlarni to'liq qaytar, intent "log".`;

function buildPrompt({ text, now = new Date(), userName = "", customers = [], prev = null }) {
  const t = tashkent(now);
  const lines = [`Bugun: ${t.date} (${t.weekday}), soat ${t.hm}, Toshkent vaqti.`];
  if (userName) lines.push(`Foydalanuvchi: ${userName}.`);
  if (customers.length) lines.push(`Ma'lum mijozlar: ${customers.slice(0, 200).join(", ")}.`);
  if (prev) lines.push(`Oldingi qoralama (JSON): ${JSON.stringify(prev)}`);
  lines.push(`${prev ? "Tuzatish" : "Xabar"}: """${String(text).slice(0, 4000)}"""`);
  return lines.join("\n");
}

// ---------- AI javobini tekshirish ----------
function cleanEntry(e = {}) {
  const work = str(e.work, 300);
  if (!work) return null;
  const amount = numOk(e.amount);
  const qty = numOk(e.qty);
  const cur = String(e.currency || "").toUpperCase();
  const due = dateOk(e.due);
  const remindAt = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(e.remindAt || "") && dateOk(e.remindAt.slice(0, 10)) && timeOk(e.remindAt.slice(11)) ? e.remindAt : null;
  return {
    work,
    customer: str(e.customer, 120) || null,
    qty: qty && qty > 0 ? Math.round(qty * 100) / 100 : null,
    unit: qty ? str(e.unit, 20) || null : null,
    amount: amount !== null && amount > 0 ? Math.round(amount * 100) / 100 : null,
    currency: amount ? (cur === "USD" ? "USD" : "UZS") : null,
    status: e.status === "todo" ? "todo" : "done",
    due,
    dueTime: due ? timeOk(e.dueTime) : null,
    remindAt,
    note: str(e.note, 500) || null,
  };
}

function normalize(raw, now = new Date()) {
  const today = tashkent(now).date;
  const r = raw && typeof raw === "object" ? raw : {};
  let intent = ["log", "query", "export", "other"].includes(r.intent) ? r.intent : "other";
  const entries = (Array.isArray(r.entries) ? r.entries : []).slice(0, 20).map(cleanEntry).filter(Boolean);
  if (intent === "log" && !entries.length) intent = "other";
  let query = null;
  if (intent === "query" || intent === "export") {
    const q = r.query && typeof r.query === "object" ? r.query : {};
    let from = dateOk(q.from) || (intent === "export" ? addDays(today, -6) : today);
    let to = dateOk(q.to) || today;
    if (from > to) [from, to] = [to, from];
    const status = ["done", "todo"].includes(q.status) ? q.status : "all";
    if (status === "todo" && to <= today) to = "9999-12-31"; // «qolgan ishlar» — kelajakdagilari ham
    query = { from, to, status, customer: str(q.customer, 120) || null };
  }
  return { intent, entries: intent === "log" ? entries : [], query, reply: str(r.reply, 500) };
}

// Eslatma vaqti (ms) yoki null
function remindTime(e) {
  if (!e || e.deletedAt || e.status !== "todo") return null;
  if (e.snoozeUntil) return e.snoozeUntil;
  if (e.remindAt) return atLocal(e.remindAt.slice(0, 10), e.remindAt.slice(11));
  if (e.due && e.dueTime) return atLocal(e.due, e.dueTime) - 3600e3;
  return null;
}

// ---------- Matnlar ----------
function entryLine(e, i) {
  const head = `${i != null ? `${i + 1}. ` : "• "}${e.status === "todo" ? "⏳" : "✅"} ${esc(e.work)}${e.customer ? ` · <b>${esc(e.customer)}</b>` : ""}`;
  const bits = [];
  if (e.qty) bits.push(`${e.qty} ${esc(e.unit || "")}`.trim());
  if (e.amount) bits.push(e.currency === "USD" ? `$${money(e.amount)}` : `${money(e.amount)} so'm`);
  if (e.due) bits.push(`muddat ${dm(e.due)}${e.dueTime ? ` ${e.dueTime}` : ""}`);
  const rt = remindTime({ ...e, status: "todo" });
  if (e.status === "todo" && rt) { const t = tashkent(new Date(rt)); bits.push(`🔔 ${dm(t.date)} ${t.hm}`); }
  if (e.note) bits.push(esc(e.note));
  return bits.length ? `${head}\n    ${bits.join(" · ")}` : head;
}

function cardText(draft) {
  const n = draft.entries.length;
  const out = [`📝 <b>Yozib oldim${n > 1 ? ` (${n} ta)` : ""}</b> — tekshiring:`, "", ...draft.entries.map((e, i) => entryLine(e, n > 1 ? i : null))];
  if (draft.transcript && draft.source === "voice") out.push("", `<i>«${esc(draft.transcript.slice(0, 600))}»</i>`);
  return out.join("\n");
}
const cardButtons = (id) => ({ inline_keyboard: [[{ text: "✅ Saqlash", callback_data: `vl:s:${id}` }, { text: "✏️ Tuzatish", callback_data: `vl:e:${id}` }, { text: "❌", callback_data: `vl:x:${id}` }]] });

function totals(list) {
  const uzs = list.reduce((s, e) => s + (e.amount && e.currency !== "USD" ? e.amount : 0), 0);
  const usd = list.reduce((s, e) => s + (e.amount && e.currency === "USD" ? e.amount : 0), 0);
  return [uzs ? `${money(uzs)} so'm` : "", usd ? `$${money(usd)}` : ""].filter(Boolean).join(" + ");
}

// Saralash kaliti: ochiq ish — muddati bo'yicha, bajarilgan — yozilgan kuni bo'yicha
const dayKey = (e) => (e.status === "todo" ? e.due || e.date : e.date);
function filterLog(log, { from, to, status = "all", customer = null, empId = null } = {}) {
  const c = customer ? customer.toLowerCase() : null;
  return log.filter((e) => !e.deletedAt
    && (!empId || e.empId === empId)
    && (status === "all" || e.status === status)
    && (!from || dayKey(e) >= from)
    && (!to || dayKey(e) <= to)
    && (!c || String(e.customer || "").toLowerCase().includes(c) || String(e.work).toLowerCase().includes(c)));
}

function listText(list, { title, max = 40 } = {}) {
  if (!list.length) return `${title ? `${title}\n\n` : ""}Hech narsa topilmadi.`;
  const byDate = new Map();
  for (const e of list.slice(0, max)) { const k = dayKey(e); if (!byDate.has(k)) byDate.set(k, []); byDate.get(k).push(e); }
  const out = title ? [title, ""] : [];
  for (const [d, items] of byDate) { out.push(`<b>${dm(d)}</b>`); items.forEach((e) => out.push(entryLine(e))); }
  if (list.length > max) out.push("", `… yana ${list.length - max} ta. To'liq ro'yxat: /hafta yoki «Excel qil».`);
  const done = list.filter((e) => e.status === "done").length;
  const sum = totals(list);
  out.push("", `Jami: ${list.length} ta${done !== list.length ? ` (${done} bajarilgan, ${list.length - done} ochiq)` : ""}${sum ? ` · ${sum}` : ""}`);
  return out.join("\n");
}

const HELP = `🎙 <b>Ish jurnali</b>
Ovozli xabar yoki matn yuboring — men yozib olaman:
• «Akmalga 3 ta viveska tayyorladim, 450 ming» → bajarilgan ish
• «Ertaga soat 14 da Jasurga montaj, eslatib qo'y» → muddatli ish + eslatma
• «Bugun nima qildim?», «Qaysi ishlar qoldi?» → jurnaldan javob
• «Bu oy jurnalini Excel qil» → fayl

Buyruqlar: /bugun · /ishlar (ochiq ishlar) · /hafta (Excel) · /oy (Excel)`;

// ---------- Modul ----------
function registerVoiceLog(app, { getStmt, upsertStmt, readEmployees, requireAuth, requireAdmin, bot, ai, buildWorkbook, env = process.env, now = () => new Date(), interval = 30000 }) {
  const read = (k, fb) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  const write = (k, v) => upsertStmt.run(k, JSON.stringify(v));
  const log = () => { const v = read(KEY, []); return Array.isArray(v) ? v : []; };
  const drafts = () => { const v = read(DRAFTS, {}); return v && typeof v === "object" ? v : {}; };

  const owners = () => require("./voice-ai").voiceOwners(readEmployees(), env);
  const isOwner = (empId) => !!empId && owners().some((e) => e.id === empId);
  const customerNames = () => {
    const list = read("uvix:customers", []);
    return [...new Set((Array.isArray(list) ? list : []).filter((c) => c && !c.deletedAt).map((c) => str(c.name, 60)).filter(Boolean))].slice(0, 200);
  };

  const send = (chatId, text, extra = {}) => bot.api("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
  // Tahrirlab bo'lmasa (xabar o'chirilgan va h.k.) — yangi xabar; «o'zgarmadi» xatosi esa e'tiborsiz
  const edit = (chatId, msgId, text, extra = {}) => bot.api("editMessageText", { chat_id: chatId, message_id: msgId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra })
    .catch((e) => (/not modified/i.test(e.message || "") ? null : send(chatId, text, extra)));

  function saveEntries(empId, draft) {
    const at = now().toISOString();
    const date = tashkent(now()).date;
    const items = draft.entries.map((e) => ({ id: rid(), empId, at, date, source: draft.source, transcript: str(draft.transcript, 2000), ...e, doneAt: e.status === "done" ? at : null, remindedAt: null, snoozeUntil: null, deletedAt: null }));
    write(KEY, [...items, ...log()].slice(0, MAX_LOG));
    return items;
  }

  async function exportFile({ from, to, status = "all", customer = null, empId = null }) {
    const list = filterLog(log(), { from, to, status, customer, empId });
    const emps = new Map(readEmployees().map((e) => [e.id, e.name]));
    const buf = await buildWorkbook({
      title: "Ish jurnali",
      meta: [`Davr: ${dm(from)}.${from.slice(0, 4)} — ${dm(to)}.${to.slice(0, 4)}`, `${list.length} ta yozuv`],
      sheets: [{
        name: "Ish jurnali",
        columns: [
          { key: "date", label: "Sana", type: "date" }, { key: "work", label: "Ish" }, { key: "customer", label: "Mijoz" },
          { key: "qty", label: "Soni", type: "num" }, { key: "unit", label: "Birlik" },
          { key: "uzs", label: "Summa (so'm)", type: "money", total: true }, { key: "usd", label: "Summa ($)", type: "money", total: true },
          { key: "statusL", label: "Holat" }, { key: "due", label: "Muddat", type: "date" }, { key: "note", label: "Izoh" }, { key: "who", label: "Kim" },
        ],
        rows: list.slice().reverse().map((e) => ({ ...e, uzs: e.currency === "USD" ? 0 : e.amount || 0, usd: e.currency === "USD" ? e.amount : 0, statusL: e.status === "done" ? "Bajarildi" : "Ochiq", due: e.due ? `${e.due}${e.dueTime ? ` ${e.dueTime}` : ""}` : "", who: emps.get(e.empId) || "" })),
      }],
    });
    return { buf, count: list.length, name: `ish-jurnali_${from}_${to}.xlsx` };
  }
  async function sendExport(empId, chatId, q) {
    const f = await exportFile({ ...q, empId });
    if (!f.count) return send(chatId, "Bu davrda yozuv yo'q.");
    const ok = await bot.sendDocumentToEmployee(empId, f.buf, f.name, `📊 Ish jurnali · ${dm(q.from)}–${dm(q.to)} · ${f.count} ta`);
    if (!ok) await send(chatId, "⚠️ Faylni yuborib bo'lmadi.");
  }

  function answerQuery(empId, q) {
    let list = filterLog(log(), { ...q, empId });
    // ochiq ishlar — eng yaqin muddat tepada
    if (q.status === "todo") list = list.slice().sort((a, b) => `${dayKey(a)} ${a.dueTime || "99"}`.localeCompare(`${dayKey(b)} ${b.dueTime || "99"}`));
    const t = tashkent(now()).date;
    const title = q.status === "todo" ? "⏳ <b>Ochiq ishlar</b>" : q.from === q.to ? `📋 <b>${q.from === t ? "Bugun" : dm(q.from)}</b>` : `📋 <b>${dm(q.from)} — ${dm(q.to)}</b>`;
    return listText(list, { title: q.customer ? `${title} · ${esc(q.customer)}` : title });
  }

  async function command(empId, chatId, text) {
    const cmd = text.split(/[\s@]/)[0].toLowerCase();
    const t = tashkent(now()).date;
    try {
      if (cmd === "/bugun") await send(chatId, answerQuery(empId, { from: t, to: t, status: "all" }));
      else if (cmd === "/ishlar") await send(chatId, answerQuery(empId, { from: "2000-01-01", to: "9999-12-31", status: "todo" }));
      else if (cmd === "/hafta") await sendExport(empId, chatId, { from: addDays(t, -6), to: t });
      else if (cmd === "/oy") await sendExport(empId, chatId, { from: `${t.slice(0, 8)}01`, to: t });
      else if (cmd === "/yordam" || cmd === "/help" || cmd === "/jurnal") await send(chatId, HELP);
      else return false;
    } catch (e) { console.error("Ish jurnali buyrug'i:", e.message); }
    return true;
  }

  // Bot xabari. true — biz ishladik; false — boshqa ishlovchilarga (masalan /start) qoldiramiz.
  async function handle({ empId, chatId, message, callback }) {
    if (!isOwner(empId)) return false;
    if (callback) { await onCallback(empId, chatId, callback); return true; }
    const m = message || {};
    const file = m.voice || m.audio || (m.document && /^audio\//.test(m.document.mime_type || "") ? m.document : null);
    const text = String(m.text || m.caption || "").trim();
    if (!file && !text) return false;
    if (!file && text.startsWith("/")) return command(empId, chatId, text);
    const st = ai.status();
    if (!st.ready || (file && !st.voice)) {
      await send(chatId, `⚙️ Ish jurnali hali sozlanmagan: serverga ${!st.ready ? "AI kaliti" : "ovozni o'girish uchun Gemini yoki OpenAI kaliti"} qo'shilishi kerak (Railway → Variables).`).catch(() => {});
      return true;
    }
    let status = null;
    try {
      status = await send(chatId, file ? "🎧 Eshityapman…" : "✍️ O'qiyapman…");
      let transcript = text;
      if (file) {
        if (file.file_size > 20 * 1024 * 1024) { await edit(chatId, status.message_id, "⚠️ Fayl juda katta (20 MB gacha)."); return true; }
        const buf = await bot.downloadFile(file.file_id);
        transcript = await ai.transcribe(buf, file.mime_type || "audio/ogg");
        if (!transcript) { await edit(chatId, status.message_id, "🤷 Ovozdan matn chiqmadi — qaytadan, aniqroq ayting."); return true; }
        await edit(chatId, status.message_id, `✍️ <i>«${esc(transcript.slice(0, 600))}»</i>`);
      }
      const all = drafts();
      const pendingId = Object.keys(all).find((k) => all[k].empId === empId && all[k].awaitingEdit);
      const pending = pendingId ? all[pendingId] : null;
      const emp = readEmployees().find((e) => e.id === empId);
      const raw = await ai.extract(SYSTEM, buildPrompt({ text: transcript, now: now(), userName: emp?.name || "", customers: customerNames(), prev: pending ? pending.entries : null }));
      const r = normalize(pending ? { ...raw, intent: "log" } : raw, now());

      if (pending && r.intent !== "log") {
        await edit(chatId, status.message_id, "🤔 Tuzatishni tushunmadim. Boshqacha ayting yoki eski kartada ❌ ni bosing.");
      } else if (r.intent === "log") {
        const cur = drafts();
        if (pendingId && cur[pendingId]) {
          // Tuzatish: eski kartani yopamiz, yangisini yuboramiz
          const old = cur[pendingId];
          await edit(old.chatId, old.msgId, "✏️ Tuzatildi — pastdagi yangi kartani ko'ring.");
          delete cur[pendingId];
        }
        const id = rid();
        const draft = { empId, chatId, msgId: status.message_id, transcript: pending ? `${pending.transcript}\n✏️ ${transcript}` : transcript, source: file || pending?.source === "voice" ? "voice" : "text", entries: r.entries, awaitingEdit: false, at: now().toISOString() };
        cur[id] = draft;
        write(DRAFTS, cur);
        await edit(chatId, status.message_id, cardText(draft), { reply_markup: cardButtons(id) });
      } else if (r.intent === "query") {
        await edit(chatId, status.message_id, answerQuery(empId, r.query));
      } else if (r.intent === "export") {
        await edit(chatId, status.message_id, `📊 Jadval tayyorlanmoqda: ${dm(r.query.from)}–${dm(r.query.to)}…`);
        await sendExport(empId, chatId, r.query);
      } else {
        await edit(chatId, status.message_id, r.reply ? esc(r.reply) : HELP);
      }
    } catch (e) {
      console.error("Ish jurnali:", e.message);
      const msg = `⚠️ Xatolik: ${esc(e.message || "noma'lum")}. Qaytadan urinib ko'ring.`;
      if (status?.message_id) await edit(chatId, status.message_id, msg).catch(() => {}); else await send(chatId, msg).catch(() => {});
    }
    return true;
  }

  async function onCallback(empId, chatId, cq) {
    const [ns, act, id] = String(cq.data || "").split(":");
    const ack = (text) => bot.api("answerCallbackQuery", { callback_query_id: cq.id, ...(text ? { text } : {}) }).catch(() => {});
    if (ns !== "vl" || !id) return ack();
    const msgId = cq.message?.message_id;
    if (["s", "x", "e"].includes(act)) {
      const all = drafts();
      const d = all[id];
      if (!d || d.empId !== empId) { await ack("Bu karta eskirgan"); return edit(chatId, msgId, "⌛ Bu karta eskirgan."); }
      if (act === "s") {
        const items = saveEntries(empId, d);
        delete all[id]; write(DRAFTS, all);
        await ack("Saqlandi");
        return edit(chatId, msgId, [`✅ <b>Saqlandi</b>${items.length > 1 ? ` · ${items.length} ta` : ""}`, "", ...items.map((e) => entryLine(e))].join("\n"));
      }
      if (act === "x") {
        delete all[id]; write(DRAFTS, all);
        await ack("Bekor qilindi");
        return edit(chatId, msgId, "❌ Bekor qilindi — jurnalga yozilmadi.");
      }
      Object.values(all).forEach((x) => { if (x.empId === empId) x.awaitingEdit = false; });
      d.awaitingEdit = true; write(DRAFTS, all);
      await ack();
      return send(chatId, "✏️ Nimani tuzatay? Yozing yoki ovoz bilan ayting.\nMasalan: «summa 500 ming», «mijoz Jasur», «ikkinchisini o'chir».");
    }
    if (act === "d" || act === "z") {
      const list = log();
      const e = list.find((x) => x.id === id && x.empId === empId && !x.deletedAt);
      if (!e) return ack("Yozuv topilmadi");
      const at = now();
      if (act === "d") { e.status = "done"; e.doneAt = at.toISOString(); e.snoozeUntil = null; }
      else { e.snoozeUntil = at.getTime() + 3600e3; e.remindedAt = null; }
      write(KEY, list);
      await ack(act === "d" ? "Bajarildi" : "1 soatdan keyin");
      return edit(chatId, msgId, `${act === "d" ? "✅ <b>Bajarildi</b>" : "⏰ <b>1 soatdan keyin yana eslataman</b>"}\n${entryLine(e)}`);
    }
    return ack();
  }

  // ---------- Eslatmalar ----------
  async function tick() {
    const nowD = now(); const nowMs = nowD.getTime();
    const t = tashkent(nowD);
    const ownerIds = new Set(owners().map((e) => e.id));
    // eskirgan qoralamalar
    const ds = drafts(); let dChanged = false;
    for (const [k, d] of Object.entries(ds)) if (!d.at || nowMs - Date.parse(d.at) > DRAFT_TTL) { delete ds[k]; dChanged = true; }
    if (dChanged) write(DRAFTS, ds);

    const due = log().filter((e) => ownerIds.has(e.empId) && !e.remindedAt && (() => { const r = remindTime(e); return r && r <= nowMs && nowMs - r < LATE_LIMIT; })());
    for (const e of due) {
      const ok = await bot.sendToEmployee(e.empId, `🔔 <b>Eslatma</b>\n${entryLine(e)}`, { reply_markup: { inline_keyboard: [[{ text: "✅ Bajarildi", callback_data: `vl:d:${e.id}` }, { text: "⏰ 1 soatdan keyin", callback_data: `vl:z:${e.id}` }]] } });
      // yuborilgani belgilanadi (o'qish-yozish orasida await yo'q)
      const list = log(); const x = list.find((y) => y.id === e.id);
      if (x) { x.remindedAt = new Date(nowMs).toISOString(); x.remindOk = !!ok; if (x.snoozeUntil && x.snoozeUntil <= nowMs) x.snoozeUntil = null; write(KEY, list); }
    }
    // Har kuni 09:00 — bugungi va kechikkan ochiq ishlar
    if (t.hm >= DIGEST_HM) {
      const sent = read(DIGEST, {}) || {};
      for (const id of ownerIds) {
        if (sent[id] === t.date) continue;
        const open = log().filter((e) => e.empId === id && !e.deletedAt && e.status === "todo" && e.due && e.due <= t.date);
        sent[id] = t.date; write(DIGEST, sent);
        if (!open.length) continue;
        const late = open.filter((e) => e.due < t.date).length;
        await bot.sendToEmployee(id, `☀️ <b>Bugungi ishlar</b>${late ? ` · ${late} tasi kechikkan` : ""}\n\n${open.slice(0, 30).map((e) => entryLine(e)).join("\n")}\n\nHammasi: /ishlar`);
      }
    }
  }
  if (interval > 0) { setTimeout(() => tick().catch((e) => console.error("Ish jurnali eslatma:", e.message)), 5000).unref?.(); setInterval(() => tick().catch((e) => console.error("Ish jurnali eslatma:", e.message)), interval).unref?.(); }

  // ---------- API (keyinchalik UVIX ichidagi «Ish jurnali» sahifasi uchun) ----------
  if (app) {
    const today = () => tashkent(now()).date;
    const range = (q) => { let from = dateOk(q.from) || addDays(today(), -29); let to = dateOk(q.to) || today(); if (from > to) [from, to] = [to, from]; return { from, to }; };
    app.get("/api/worklog", requireAuth, requireAdmin, (req, res) => {
      const { from, to } = range(req.query || {});
      const status = ["done", "todo"].includes(req.query?.status) ? req.query.status : "all";
      res.json({ entries: filterLog(log(), { from, to, status }), from, to, ai: ai.status(), owners: owners().map((e) => ({ id: e.id, name: e.name })) });
    });
    app.patch("/api/worklog/:id", requireAuth, requireAdmin, (req, res) => {
      const list = log();
      const e = list.find((x) => x.id === req.params.id && !x.deletedAt);
      if (!e) return res.status(404).json({ error: "not_found", message: "Yozuv topilmadi" });
      const c = cleanEntry({ ...e, ...(req.body || {}) });
      if (!c) return res.status(400).json({ error: "bad_request", message: "Ish nomi bo'sh bo'lmasin" });
      const wasDone = e.status === "done";
      const timeChanged = c.due !== e.due || c.dueTime !== e.dueTime || c.remindAt !== e.remindAt;
      Object.assign(e, c, { updatedAt: now().toISOString() });
      if (!wasDone && c.status === "done") e.doneAt = now().toISOString();
      if (c.status === "todo") e.doneAt = null;
      if (timeChanged) { e.remindedAt = null; e.snoozeUntil = null; }
      write(KEY, list);
      res.json({ entry: e });
    });
    app.delete("/api/worklog/:id", requireAuth, requireAdmin, (req, res) => {
      const list = log();
      const e = list.find((x) => x.id === req.params.id && !x.deletedAt);
      if (!e) return res.status(404).json({ error: "not_found", message: "Yozuv topilmadi" });
      e.deletedAt = now().toISOString();
      write(KEY, list);
      res.json({ ok: true });
    });
    app.get("/api/worklog/export.xlsx", requireAuth, requireAdmin, async (req, res) => {
      try {
        const f = await exportFile(range(req.query || {}));
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${f.name}"`);
        res.send(f.buf);
      } catch (e) { res.status(500).json({ error: "export", message: e.message }); }
    });
  }

  return { handle, tick, exportFile };
}

module.exports = registerVoiceLog;
Object.assign(module.exports, { SYSTEM, buildPrompt, normalize, cleanEntry, remindTime, cardText, entryLine, listText, filterLog, totals, tashkent, addDays, money, KEY, DRAFTS });
