// card-feed.js — shaxsiy karta (Uzcard/Humo) kirim-chiqimi: CardXabar botining Telegram xabarlaridan.
//
// Qanday ishlaydi:
//   • CRM'ga ulangan Telegram akkaunt(lar)da CardXabar bot chati bo'lsa — har yangi xabar shu yerga keladi
//     (telegram-userbot.js → onBotMessage), summa/kirim-chiqim/joy/vaqt/qoldiq ajratib olinadi.
//   • Ulanganda va «Yangilash» bosilganda — chatning oxirgi xabarlari qayta o'qiladi (o'tkazib yuborilgan bo'lsa).
//   • Faqat rahbar (admin) ko'radi: bu shaxsiy karta.
//
// Xabar formati (CardXabar):
//   🔴 Platezh
//   ➖ 2 022 000.00 UZS
//   💳 ***8313
//   📍 ATB HAMKORBANK PAYME AJ, UZ
//   🕓 24.10.26 12:19
//   💵 250 539.19 UZS
//
// Saqlash (ichki kalit, KV orqali o'qib/yozib bo'lmaydi):
//   uvix:cardTx — { items: [...], meta: { [line]: { chatId, name, found, lastSyncAt, error } } }
//   uvix:cardTgSession — karta uchun alohida ulangan shaxsiy Telegram akkaunt sessiyasi (line = "CARD").
//     U faqat bot xabarlarini o'qiydi (botsOnly): odamlar bilan yozishmalar CRM'ga tushmaydi.
// Bu faylda fs yo'q.

const KEY = "uvix:cardTx";
const SESSION_KEY = "uvix:cardTgSession";
const CARD = "CARD";
const MAX_ITEMS = 5000;
const BOT_MATCH = /card\s*xabar/i;

// ---------------- Xabarni tahlil qilish ----------------
const MONEY_RE = /([+\-−–]?\s*\d[\d\s  ]*(?:[.,]\d{1,2})?)\s*(UZS|USD|EUR|RUB|so'?m|сум)\b/i;

function toNumber(s) {
  let t = String(s).replace(/[\s  ]/g, "").replace(/[−–]/g, "-");
  if (/,\d{1,2}$/.test(t) && !t.includes(".")) t = t.replace(",", ".");
  t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
const stripLead = (line) => line.replace(/^[^\p{L}\p{N}*+\-−–]+/u, "").trim();

const IN_WORDS = /popoln|zachisl|postupl|vozvrat|otmena|kirim|to['ʻ’]?ldir|qaytar|пополн|зачисл|поступл|возврат|отмена/i;
const OUT_WORDS = /platezh|spisan|oplata|pokupk|snyat|perevod\s+s\s+kart|to['ʻ’]?lov|yechib|платеж|списан|оплата|покупк|снят/i;

/**
 * CardXabar xabaridan kirim/chiqim ma'lumotini ajratadi. Tranzaksiya bo'lmasa (reklama, hisobot) — null.
 * @returns {{kind, dir: "in"|"out", amount, currency, card, merchant, at, balance}|null}
 */
function parseCardXabar(text) {
  const raw = String(text || "").replace(/\r/g, "");
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  let amount = null, currency = "UZS", dir = null, balance = null, amountLine = -1;
  lines.forEach((l, i) => {
    const m = l.match(MONEY_RE);
    if (!m) return;
    if (amountLine === -1) {
      amountLine = i;
      const v = toNumber(m[1]);
      amount = v == null ? null : Math.abs(v);
      currency = /so'?m|сум/i.test(m[2]) ? "UZS" : m[2].toUpperCase();
      if (/➖|^\s*[-−–]/.test(l) || /^[-−–]/.test(m[1].trim())) dir = "out";
      else if (/➕|^\s*\+/.test(l) || /^\+/.test(m[1].trim())) dir = "in";
    } else if (balance == null) {
      balance = toNumber(m[1]);
    }
  });
  if (!amount) return null;

  const head = lines[0];
  const kind = stripLead(head).slice(0, 60);
  if (!dir) {
    if (/🟢|✅|🟩/.test(head) || IN_WORDS.test(kind)) dir = "in";
    else if (/🔴|❌|🟥/.test(head) || OUT_WORDS.test(kind)) dir = "out";
  }
  if (!dir) return null;

  const cardM = raw.match(/\*{2,}\s?(\d{4})/);
  const timeM = raw.match(/(\d{2})\.(\d{2})\.(\d{2}|\d{4})\s+(\d{1,2}):(\d{2})/);
  let at = null;
  if (timeM) {
    const yy = timeM[3].length === 2 ? `20${timeM[3]}` : timeM[3];
    const d = new Date(`${yy}-${timeM[2]}-${timeM[1]}T${timeM[4].padStart(2, "0")}:${timeM[5]}:00+05:00`);
    if (!Number.isNaN(d.getTime())) at = d.toISOString();
  }
  // Joy: 📍 belgili qator; bo'lmasa — summa, karta, vaqt va qoldiq emas birinchi qator
  let merchant = "";
  const pin = lines.find((l) => /📍/.test(l));
  if (pin) merchant = stripLead(pin);
  else {
    const cand = lines.slice(1).find((l, i) => i + 1 !== amountLine && !MONEY_RE.test(l) && !/\*{2,}\d{4}/.test(l) && !/\d{2}\.\d{2}\.\d{2}/.test(l));
    if (cand) merchant = stripLead(cand);
  }
  if (!cardM && !at) return null;
  return { kind, dir, amount, currency, card: cardM ? cardM[1] : "", merchant: merchant.slice(0, 120), at, balance };
}

// ---------------- Saqlash va API ----------------
module.exports = function registerCardFeed(app, { getStmt, upsertStmt, deleteKey, requireAuth, requireAdmin, bots: crmBots, cardBot, cardLogin, readCreds }) {
  // crmBots: [{ line, bot }] — CRM chatlari uchun ulangan Telegram akkauntlar (ular orqali ham CardXabar o'qiladi)
  // cardBot / cardLogin — karta uchun alohida shaxsiy akkaunt (ixtiyoriy)
  const bots = [...crmBots, ...(cardBot ? [{ line: CARD, bot: cardBot }] : [])];
  function read() {
    try {
      const v = JSON.parse(getStmt.get(KEY)?.value || "{}");
      return { items: Array.isArray(v.items) ? v.items : [], meta: v.meta && typeof v.meta === "object" ? v.meta : {} };
    } catch { return { items: [], meta: {} }; }
  }
  function write(state) {
    state.items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    if (state.items.length > MAX_ITEMS) state.items.length = MAX_ITEMS;
    upsertStmt.run(KEY, JSON.stringify(state));
  }
  const sigOf = (p) => [p.card, p.at, p.dir, p.amount, p.balance].join("|");

  // Bir nechta xabarni qo'shadi (takrorlarini o'tkazib yuboradi). Qaytaradi: nechta yangi qo'shildi.
  function ingest(state, line, chatId, msgs) {
    const ids = new Set(state.items.map((x) => x.id));
    const sigs = new Set(state.items.map((x) => x.sig));
    let added = 0;
    for (const m of msgs) {
      const p = parseCardXabar(m.text);
      if (!p) continue;
      const id = `${line}:${chatId}:${m.tgId}`;
      const sig = sigOf({ ...p, at: p.at || m.date });
      if (ids.has(id) || sigs.has(sig)) continue;
      ids.add(id); sigs.add(sig);
      state.items.push({ id, line, tgId: m.tgId, ...p, at: p.at || m.date, msgAt: m.date, sig, receivedAt: new Date().toISOString() });
      added++;
    }
    return added;
  }

  // Real vaqt: bot xabari keldi
  function onBotMessage(line) {
    return (m) => {
      if (!BOT_MATCH.test(m.username) && !BOT_MATCH.test(m.name)) return;
      try {
        const state = read();
        state.meta[line] = { ...(state.meta[line] || {}), chatId: m.chatId, name: m.name, found: true, lastMsgAt: m.date };
        ingest(state, line, m.chatId, [m]);
        write(state);
      } catch (e) { console.error("CardXabar xabarini saqlashda xato:", e.message); }
    };
  }

  // Tarix: chatning oxirgi xabarlarini qayta o'qish
  async function sync(line, limit = 300) {
    const entry = bots.find((b) => b.line === line);
    if (!entry || !entry.bot.isConnected()) return { line, connected: false, added: 0 };
    const state = read();
    try {
      const chat = await entry.bot.fetchBotChat(BOT_MATCH, { limit });
      if (!chat) {
        state.meta[line] = { ...(state.meta[line] || {}), found: false, lastSyncAt: new Date().toISOString(), error: null };
        write(state);
        return { line, connected: true, found: false, added: 0 };
      }
      const added = ingest(state, line, chat.chatId, chat.messages);
      state.meta[line] = { ...(state.meta[line] || {}), chatId: chat.chatId, name: chat.name, found: true, lastSyncAt: new Date().toISOString(), error: null };
      write(state);
      return { line, connected: true, found: true, added };
    } catch (e) {
      state.meta[line] = { ...(state.meta[line] || {}), lastSyncAt: new Date().toISOString(), error: e.message };
      write(state);
      return { line, connected: true, found: !!state.meta[line].found, added: 0, error: e.message };
    }
  }
  const syncAll = () => Promise.all(bots.map((b) => sync(b.line)));

  // ---------------- Karta uchun shaxsiy Telegram akkaunt ----------------
  function readSession() {
    try { return JSON.parse(getStmt.get(SESSION_KEY)?.value || "null"); } catch { return null; }
  }
  let cardExpired = null;
  async function connectCard() {
    if (!cardBot) return { ok: false, error: "yo'q" };
    const saved = readSession();
    const creds = readCreds();
    if (!saved?.session || !creds.apiId || !creds.apiHash) return { ok: false, error: "Karta uchun akkaunt ulanmagan" };
    const settings = { telegramUserApiId: saved.apiId || creds.apiId, telegramUserApiHash: saved.apiHash || creds.apiHash };
    const r = await cardBot.connectFromSettings(settings, () => {}, {
      session: saved.session,
      botsOnly: true,
      onBotMessage: onBotMessage(CARD),
      onSessionDead: (info) => { cardExpired = info; deleteKey(SESSION_KEY); },
    });
    if (r.ok) { cardExpired = null; sync(CARD).catch((e) => console.error("CardXabar (karta akkaunti):", e.message)); }
    return r;
  }
  function accountState() {
    const saved = readSession();
    const st = cardBot ? cardBot.getStatus() : { status: "disconnected" };
    const creds = readCreds();
    return {
      status: st.status === "disconnected" && cardExpired ? "expired" : st.status,
      message: st.message || cardExpired?.message || "",
      user: saved?.user || null,
      hasApi: !!(creds.apiId && creds.apiHash),
      login: cardLogin ? cardLogin.getState() : { stage: "idle" },
    };
  }
  async function onCardLogin({ session, apiId, apiHash, user }) {
    upsertStmt.run(SESSION_KEY, JSON.stringify({ session, apiId: String(apiId), apiHash, user, savedAt: new Date().toISOString() }));
    const r = await connectCard();
    if (!r.ok) throw new Error(r.error || "Ulanib bo'lmadi");
  }
  const loginBody = (b) => {
    const c = readCreds();
    return { apiId: b?.apiId || c.apiId, apiHash: b?.apiHash || c.apiHash };
  };
  const route = (fn) => async (req, res) => {
    try { res.json(await fn(req)); } catch (e) { res.status(400).json({ error: "login_failed", message: e.message }); }
  };
  if (cardBot && cardLogin) {
    app.get("/api/card-tx/account", requireAuth, requireAdmin, (req, res) => res.json(accountState()));
    // Kirish oqimi — Sozlamalardagi Telegram ulash bilan bir xil (QR / telefon kodi / 2FA parol)
    app.get("/api/card-tx/account/login", requireAuth, requireAdmin, (req, res) => res.json(cardLogin.getState()));
    app.post("/api/card-tx/account/login/qr", requireAuth, requireAdmin, route((req) => cardLogin.startQr({ ...loginBody(req.body), onSuccess: onCardLogin })));
    app.post("/api/card-tx/account/login/phone", requireAuth, requireAdmin, route((req) => cardLogin.startPhone({ ...loginBody(req.body), phone: req.body?.phone, onSuccess: onCardLogin })));
    app.post("/api/card-tx/account/login/code", requireAuth, requireAdmin, route((req) => cardLogin.submitCode(req.body?.code)));
    app.post("/api/card-tx/account/login/password", requireAuth, requireAdmin, route((req) => cardLogin.submitPassword(req.body?.password)));
    app.post("/api/card-tx/account/login/cancel", requireAuth, requireAdmin, route(() => cardLogin.cancel()));
    // Uzish: serverdagi sessiya o'chiriladi (yozib olingan karta yozuvlari qoladi)
    app.post("/api/card-tx/account/disconnect", requireAuth, requireAdmin, route(async () => {
      await cardLogin.cancel().catch(() => {});
      await cardBot.disconnect().catch(() => {});
      deleteKey(SESSION_KEY);
      cardExpired = null;
      const state = read();
      if (state.meta[CARD]) { delete state.meta[CARD]; write(state); }
      return accountState();
    }));
  }

  function statusOf(state) {
    return bots.map(({ line, bot }) => ({ line, connected: bot.isConnected(), ...(state.meta[line] || {}) }));
  }

  app.get("/api/card-tx", requireAuth, requireAdmin, (req, res) => {
    const state = read();
    res.json({ items: state.items.map(({ sig, ...x }) => x), status: statusOf(state) }); // eslint-disable-line no-unused-vars
  });

  app.post("/api/card-tx/sync", requireAuth, requireAdmin, async (req, res) => {
    const results = await syncAll();
    const state = read();
    res.json({ results, items: state.items.map(({ sig, ...x }) => x), status: statusOf(state) }); // eslint-disable-line no-unused-vars
  });

  // Belgilash: shaxsiy / rasxodga yozilgan / buyurtma to'loviga bog'langan / izoh
  app.patch("/api/card-tx/:id", requireAuth, requireAdmin, (req, res) => {
    const state = read();
    const it = state.items.find((x) => x.id === req.params.id);
    if (!it) return res.status(404).json({ error: "not_found", message: "Yozuv topilmadi" });
    const b = req.body || {};
    const str = (v, n = 80) => (v == null || v === "" ? null : String(v).slice(0, n));
    if ("personal" in b) it.personal = !!b.personal;
    if ("txId" in b) it.txId = str(b.txId);
    if ("orderId" in b) it.orderId = str(b.orderId);
    if ("paymentId" in b) it.paymentId = str(b.paymentId);
    if ("label" in b) it.label = str(b.label, 120);
    if ("note" in b) it.note = str(b.note, 300);
    it.updatedAt = new Date().toISOString();
    it.updatedBy = req.user?.name || "";
    write(state);
    const { sig, ...out } = it; // eslint-disable-line no-unused-vars
    res.json({ item: out });
  });

  return { onBotMessage, sync, syncAll, connectCard };
};

module.exports.parseCardXabar = parseCardXabar;
module.exports.KEY = KEY;
module.exports.SESSION_KEY = SESSION_KEY;
