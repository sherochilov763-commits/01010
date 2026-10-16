// tg-folders.js — Telegram papkalarini (dialog filters) UVIX chatlar ro'yxatiga moslash.
// Telegram qoidalari: papkaga (a) aniq qo'shilgan chatlar, (b) «Kontaktlar» / «Kontakt emaslar» turi bo'yicha chatlar kiradi;
// keyin chiqarib tashlanganlar, «ovozsiz», «o'qilgan», «arxivlangan» filtrlari qo'llanadi. Aniq qo'shilganlar filtrlardan ustun.
// UVIX faqat shaxsiy (odam bilan) chatlarni ko'rsatadi — guruh/kanal/bot turlari bu yerda e'tiborga olinmaydi.
function folderChats(def, dialogs) {
  if (def.kind === "all") return dialogs.filter((d) => !d.archived).map((d) => d.chatId);
  const explicit = new Set([...(def.pinned || []), ...(def.include || [])]);
  const excluded = new Set(def.exclude || []);
  const out = [];
  for (const d of dialogs) {
    if (explicit.has(d.chatId)) { out.push(d.chatId); continue; }
    if (excluded.has(d.chatId)) continue;
    const byType = (def.contacts && d.contact) || (def.nonContacts && !d.contact);
    if (!byType) continue;
    if (def.excludeMuted && d.muted) continue;
    if (def.excludeRead && !(d.unreadCount > 0 || d.unreadMark)) continue;
    if (def.excludeArchived && d.archived) continue;
    out.push(d.chatId);
  }
  // mahkamlanganlar Telegram'dagidek tepada
  const pin = def.pinned || [];
  return [...pin.filter((id) => out.includes(id)), ...out.filter((id) => !pin.includes(id))];
}
function buildFolders(defs, dialogs) {
  const list = (defs || []).slice().sort((a, b) => a.order - b.order);
  if (!list.some((d) => d.kind === "all")) list.unshift({ id: 0, kind: "all", order: -1 });
  return list.map((d) => ({ id: d.id, kind: d.kind, title: d.kind === "all" ? "Barchasi" : d.title || "Papka", emoticon: d.emoticon || "", chatIds: folderChats(d, dialogs) }));
}

function registerTgFolders(app, { requireAuth, requireStaff, userbot, getDialogs }) {
  let cache = { at: 0, defs: null, err: "" };
  async function defs() {
    if (cache.defs && Date.now() - cache.at < 60 * 1000) return cache.defs;
    try { cache = { at: Date.now(), defs: await userbot.getFolderDefs(), err: "" }; }
    catch (e) { cache = { at: Date.now() - 45 * 1000, defs: cache.defs, err: e.message }; }
    return cache.defs;
  }
  app.get("/api/telegram-user/folders", requireAuth, requireStaff, async (req, res) => {
    // Papkalar — asosiy (UVIXPRINT) akkauntniki; UVONYX xodimiga ko'rsatilmaydi
    if (req.lineScope === "UVONYX") return res.json({ connected: true, folders: [] });
    if (!userbot.isConnected()) return res.json({ connected: false, folders: [] });
    const [d, dialogs] = await Promise.all([defs(), getDialogs()]);
    if (!d) return res.json({ connected: true, folders: [], error: cache.err || "Papkalarni olib bo'lmadi" });
    // Telegram'da faqat «Все чаты» bo'lsa (papka yaratilmagan) — panel kerak emas
    const folders = buildFolders(d, dialogs || []);
    res.json({ connected: true, folders: folders.length > 1 ? folders : [] });
  });
}

module.exports = { registerTgFolders, buildFolders, folderChats };
