// voice-command.js — CRM ichidagi ovozli yordamchi: gap → qaysi forma + qaysi maydonlar.
//
// Brauzer mikrofon tugmasidan ovozni (yoki yozilgan matnni) yuboradi:
//   POST /api/voice/command   multipart: audio=<fayl>   yoki   JSON: { text }
// Javob: { transcript, action, data, reply }
//   action: "order" | "payment" | "expense" | "job" | "lead" | "unknown"
// Server hech narsani SAQLAMAYDI — brauzer tegishli formani to'ldirilgan holda ochadi,
// foydalanuvchi tekshirib «Saqlash»ni o'zi bosadi (formalarning odatiy tekshiruvi va huquqlari ishlaydi).
//
// Kim foydalanadi: voiceOwners() — standart barcha rahbarlar (VOICE_LOG_OWNERS bilan aniq hisoblar).
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { voiceOwners } = require("./voice-ai");
const { tashkent } = require("./voice-log");

const ACTIONS = ["order", "payment", "expense", "job", "lead", "unknown"];
const PAY_TYPES = ["naqd", "karta", "bank"];
const JOB_KINDS = ["measure", "install", "deliver", "other"];
const UNITS = ["m2", "pcs", "lump"];

const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const num = (v) => { const n = typeof v === "string" ? Number(v.replace(/[\s,]/g, (c) => (c === "," ? "." : ""))) : Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const dateOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") && !Number.isNaN(Date.parse(v)) ? v : null);
const timeOk = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim()); return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, "0")}:${m[2]}` : null; };
const list = (v, n, max) => (Array.isArray(v) ? v.map((x) => str(x, n)).filter(Boolean).slice(0, max) : []);

function systemPrompt() {
  return `Sen UVIX CRM tizimining ovozli yordamchisisan (reklama, UV pechat, lazer kesish, viveska, montaj ishlab chiqarishi). Foydalanuvchi bitta gap aytadi — sen qaysi formani ochish kerakligini va maydonlarini aniqlaysan.
Faqat bitta JSON obyekt qaytar:
{
  "action": "order" | "payment" | "expense" | "job" | "lead" | "unknown",
  "data": { ... quyidagi turga mos maydonlar ... },
  "reply": "o'zbekcha juda qisqa izoh: nimani tushunding (masalan «To'lov: Akmal, 300 000 naqd»)"
}
Turlar:
- "order" — yangi buyurtma / smeta: {"customer": ism|null, "phone": tel|null, "items": [{"title": nima (masalan "Banner"), "material": material|null, "unit": "m2" | "pcs" | "lump", "w": eni METRDA|null, "h": bo'yi METRDA|null, "qty": soni|null, "price": 1 birlik narxi|null, "total": jami summa|null}]}
  unit: o'lcham (eni × bo'yi) aytilsa "m2"; dona aytilsa "pcs"; faqat xizmat va summa bo'lsa (montaj, dizayn, yetkazish) "lump". O'lcham sm/mm da aytilsa metrga o'gir (200 sm → 2). "m² narxi 80 ming" → price 80000.
- "payment" — mijozdan pul olindi: {"customer": ism|null, "orderNumber": buyurtma raqami agar aytilsa|null, "amount": summa, "paymentType": "naqd" | "karta" | "bank", "date": "YYYY-MM-DD"|null, "comment": izoh|null}
  "olindi", "to'ladi", "berdi", "avans", "qarzini uzdi" — payment. "Click", "Payme", "kartaga" → "karta"; "perechisleniye", "hisob raqamga", "bank orqali" → "bank"; aks holda "naqd".
- "expense" — korxona puli sarflandi: {"amount": summa, "category": RO'YXATDAGI kategoriya|null, "subcategory": shu kategoriyaning RO'YXATDAGI bo'limi|null, "paymentType": "naqd" | "karta" | "bank", "employee": xodim ismi (oylik/avans bo'lsa)|null, "date": "YYYY-MM-DD"|null, "note": izoh|null}
  Xarajat uchun to'lov turi aytilmasa "karta". Oylik, avans, bonus → "Xodimlar". Kategoriya faqat ro'yxatdan; mos kelmasa null.
- "job" — vazifa (o'lchov, montaj, yetkazish va h.k.): {"kind": "measure" | "install" | "deliver" | "other", "title": qisqa nomi, "customer": ism|null, "date": "YYYY-MM-DD"|null, "time": "HH:MM"|null, "address": manzil|null, "phone": tel|null, "assignees": [RO'YXATDAGI xodim ismlari]}
  O'lchov/zamer → measure; montaj/o'rnatish → install; yetkazish/olib borish/dostavka → deliver.
- "lead" — yangi murojaat/mijoz (hali buyurtma emas, "so'radi", "qiziqdi", "qo'ng'iroq qildi"): {"customer": ism, "phone": tel|null, "jobTitle": nima kerak|null, "estimatedValue": taxminiy summa|null, "source": "Instagram" | "Telegram" | "Qo'ng'iroq" | "Tanish" | "Ustaxona" | boshqa|null, "notes": izoh|null}
- "unknown" — boshqa narsa yoki tushunarsiz: data {}; reply'da qisqa sabab.
Umumiy qoidalar:
- "ming" = 1000, "million"/"mln" = 1000000, "yarim million" = 500000, "1,5 million" = 1500000. Summa — so'mda butun son.
- Sanalar bugungi kunga nisbatan ("ertaga", "indinga", "dushanba", "kecha"). "soat 3 da" kunduzi — 15:00, "ertalab 9" — 09:00. Sana aytilmasa — null.
- Ism ma'lum mijozlar yoki xodimlar ro'yxatidagiga o'xshasa — ro'yxatdagi yozilishini ol (masalan "Akmalga" → "Akmal Karimov"). Grammatik qo'shimchalarni olib tashla ("Akmalga", "Akmaldan" → "Akmal").
- Hech narsani o'ylab topma: aytilmagan maydon — null.`;
}

function buildPrompt({ text, now = new Date(), userName = "", customers = [], employees = [], categories = {} }) {
  const t = tashkent(now);
  const cats = Object.entries(categories || {}).slice(0, 40).map(([k, v]) => `${k}: ${(Array.isArray(v) ? v : []).slice(0, 15).join(", ")}`).join("; ");
  return [
    `Bugun: ${t.date} (${t.weekday}), soat ${t.hm}, Toshkent vaqti.`,
    userName ? `Foydalanuvchi: ${userName}.` : "",
    customers.length ? `Ma'lum mijozlar: ${customers.slice(0, 250).join(", ")}.` : "",
    employees.length ? `Xodimlar: ${employees.slice(0, 60).join(", ")}.` : "",
    cats ? `Rasxod kategoriyalari (kategoriya: bo'limlar): ${cats}.` : "",
    `Gap: """${String(text).slice(0, 3000)}"""`,
  ].filter(Boolean).join("\n");
}

// AI javobini qat'iy tekshiramiz — brauzerga faqat toza qiymatlar boradi
function normalize(raw, { categories = {} } = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  let action = ACTIONS.includes(r.action) ? r.action : "unknown";
  const d = r.data && typeof r.data === "object" ? r.data : {};
  let data = {};
  if (action === "order") {
    const items = (Array.isArray(d.items) ? d.items : []).slice(0, 15).map((it) => {
      if (!it || typeof it !== "object") return null;
      const title = str(it.title, 120), material = str(it.material, 120);
      if (!title && !material) return null;
      let unit = UNITS.includes(it.unit) ? it.unit : null;
      const w = num(it.w), h = num(it.h), qty = num(it.qty), price = num(it.price), total = num(it.total);
      if (!unit) unit = w && h ? "m2" : qty ? "pcs" : "lump";
      if (unit === "m2" && !(w && h)) unit = qty ? "pcs" : "lump";
      return { title, material, unit, w: unit === "m2" ? Math.min(w, 100) : null, h: unit === "m2" ? Math.min(h, 100) : null, qty: unit === "lump" ? 1 : Math.max(1, Math.round(qty || 1)), price: price ? Math.round(price) : null, total: total ? Math.round(total) : null };
    }).filter(Boolean);
    data = { customer: str(d.customer, 120) || null, phone: str(d.phone, 40) || null, items };
    if (!data.customer && !items.length) action = "unknown";
  } else if (action === "payment") {
    data = { customer: str(d.customer, 120) || null, orderNumber: str(d.orderNumber, 40) || null, amount: num(d.amount) ? Math.round(num(d.amount)) : null,
      paymentType: PAY_TYPES.includes(d.paymentType) ? d.paymentType : "naqd", date: dateOk(d.date), comment: str(d.comment, 300) || null };
    if (!data.customer && !data.orderNumber) action = "unknown";
  } else if (action === "expense") {
    // Kategoriya faqat mavjudlaridan (katta-kichik harf farqi yo'q)
    const cats = Object.keys(categories || {});
    const cat = cats.find((c) => c.toLowerCase() === str(d.category, 80).toLowerCase()) || null;
    const subs = cat && Array.isArray(categories[cat]) ? categories[cat] : [];
    const sub = cat ? subs.find((s) => s.toLowerCase() === str(d.subcategory, 80).toLowerCase()) || null : null;
    data = { amount: num(d.amount) ? Math.round(num(d.amount)) : null, category: cat, subcategory: sub, paymentType: PAY_TYPES.includes(d.paymentType) ? d.paymentType : "karta",
      employee: str(d.employee, 80) || null, date: dateOk(d.date), note: str(d.note, 300) || null };
    if (!data.amount && !data.category) action = "unknown";
  } else if (action === "job") {
    const date = dateOk(d.date);
    data = { kind: JOB_KINDS.includes(d.kind) ? d.kind : "other", title: str(d.title, 120), customer: str(d.customer, 120) || null, date, time: date ? timeOk(d.time) : null,
      address: str(d.address, 200) || null, phone: str(d.phone, 40) || null, assignees: list(d.assignees, 80, 6) };
  } else if (action === "lead") {
    data = { customer: str(d.customer, 120) || null, phone: str(d.phone, 40) || null, jobTitle: str(d.jobTitle, 160) || null, estimatedValue: num(d.estimatedValue) ? Math.round(num(d.estimatedValue)) : null,
      source: str(d.source, 40) || null, notes: str(d.notes, 500) || null };
    if (!data.customer) action = "unknown";
  }
  return { action, data: action === "unknown" ? {} : data, reply: str(r.reply, 300) };
}

// Brauzer yozgan ovoz (webm / mp4) → OGG (Gemini webm'ni qabul qilmaydi). ffmpeg bo'lmasa — asl holicha.
async function toOgg(buffer, mime) {
  if (/ogg|mpeg|mp3|wav|flac/.test(mime || "")) return { buffer, mime };
  const audio = require("./audio");
  if (!audio.hasFfmpeg()) return { buffer, mime };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uvix-voice-"));
  const inp = path.join(dir, `in${/mp4|m4a|aac/.test(mime || "") ? ".m4a" : ".webm"}`), out = path.join(dir, "out.ogg");
  try {
    fs.writeFileSync(inp, buffer);
    await audio.toTelegramVoice(inp, out);
    return { buffer: fs.readFileSync(out), mime: "audio/ogg" };
  } catch { return { buffer, mime }; } finally { fs.rm(dir, { recursive: true, force: true }, () => {}); }
}

// Shaxsiy sozlama (Sozlamalar → Ko'rinish → Ovozli yordamchi): on — umuman yoqilgan, fab — burchakdagi tugma, hotkey — F2.
// O'chiq bo'lsa yordamchi hamma joydan yo'qoladi (telefon, kompyuter). "uvix:voicepref:<xodim id>" kalitida.
const PREF_DEFAULTS = { on: true, fab: true, hotkey: true };
function cleanPrefs(p) {
  const out = { ...PREF_DEFAULTS };
  if (p && typeof p === "object" && !Array.isArray(p)) for (const k of Object.keys(PREF_DEFAULTS)) if (typeof p[k] === "boolean") out[k] = p[k];
  return out;
}

function registerVoiceCommand(app, { getStmt, upsertStmt, readEmployees, requireAuth, ai, env = process.env, now = () => new Date(), convert = toOgg }) {
  const read = (k, fb) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  const allowed = (user) => !!user && voiceOwners(readEmployees(), env).some((e) => e.id === user.id);
  const context = () => {
    const names = new Set();
    for (const c of read("uvix:customers", []) || []) if (c && !c.deletedAt && c.name) names.add(str(c.name, 60));
    const orders = (read("uvix:orders", []) || []).filter((o) => o && !o.deletedAt).slice(-400);
    for (const o of orders.reverse()) if (o.customer) names.add(str(o.customer, 60));
    const cats = read("uvix:categories", null);
    return {
      customers: [...names].filter(Boolean).slice(0, 250),
      employees: readEmployees().filter((e) => e && !e.deletedAt && !e.archived).map((e) => e.name).filter(Boolean),
      categories: cats && typeof cats === "object" && !Array.isArray(cats) ? cats : {},
    };
  };
  const multer = require("multer");
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  const gate = (req, res, next) => (allowed(req.user) ? next() : res.status(403).json({ error: "forbidden", message: "Ovozli yordamchi faqat rahbar uchun" }));

  app.get("/api/voice/status", requireAuth, (req, res) => {
    const st = ai.status();
    res.json({ enabled: allowed(req.user), ready: st.ready, voice: st.voice, llm: st.llm, stt: st.stt, prefs: cleanPrefs(read(`uvix:voicepref:${req.user.id}`, null)) });
  });
  app.put("/api/voice/prefs", requireAuth, gate, (req, res) => {
    if (!upsertStmt) return res.status(501).json({ error: "no_storage" });
    const prefs = cleanPrefs({ ...cleanPrefs(read(`uvix:voicepref:${req.user.id}`, null)), ...(req.body?.prefs || {}) });
    upsertStmt.run(`uvix:voicepref:${req.user.id}`, JSON.stringify(prefs));
    res.json({ prefs });
  });

  app.post("/api/voice/command", requireAuth, gate, (req, res) => {
    upload.single("audio")(req, res, async (err) => {
      if (err) return res.status(400).json({ error: "upload", message: err.code === "LIMIT_FILE_SIZE" ? "Ovoz juda uzun (10 MB gacha)" : err.message });
      const st = ai.status();
      if (!st.ready) return res.status(503).json({ error: "no_ai", message: "AI kaliti sozlanmagan (Railway → Variables: GEMINI_API_KEY yoki OPENAI_API_KEY)" });
      try {
        let transcript = str(req.body?.text, 3000);
        if (req.file) {
          if (!st.voice) return res.status(503).json({ error: "no_stt", message: "Ovozni o'girish uchun GEMINI_API_KEY yoki OPENAI_API_KEY kerak" });
          const a = await convert(req.file.buffer, req.file.mimetype || "audio/webm");
          transcript = str(await ai.transcribe(a.buffer, a.mime), 3000);
        }
        if (!transcript) return res.status(400).json({ error: "empty", message: req.file ? "Ovozdan matn chiqmadi — qaytadan, aniqroq ayting" : "Matn bo'sh" });
        const ctx = context();
        const raw = await ai.extract(systemPrompt(), buildPrompt({ text: transcript, now: now(), userName: req.user.name || "", ...ctx }));
        const r = normalize(raw, ctx);
        res.json({ id: crypto.randomBytes(6).toString("hex"), transcript, ...r });
      } catch (e) {
        console.error("Ovozli yordamchi:", e.message);
        res.status(502).json({ error: "ai", message: `AI xizmati javob bermadi: ${e.message}` });
      }
    });
  });
  return { normalize, buildPrompt, cleanPrefs };
}

module.exports = registerVoiceCommand;
Object.assign(module.exports, { normalize, buildPrompt, systemPrompt, toOgg });
