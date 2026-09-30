import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Info, Loader2, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Search, UserPlus, X } from "lucide-react";
import { LAYOUT_CSS, Resizer, useChatLayout } from "./chatLayout.jsx";
import { Incremental, useIsMobile } from "../../components/ui.jsx";
import { useBackToClose } from "../../lib/history.js";
import { fetchTelegramUserStatus, createLeadFromChat, fetchOlderTelegramMessages, fetchTelegramThread, reactTelegramMessage, refreshTelegramNames, sendTelegramLocation, sendTelegramMedia } from "../../storage.js";
import { CHAT_CSS, Composer, MessageList } from "./ChatConversation.jsx";
import { LEAD_STAGES } from "../../constants.js";
import { uid } from "../../lib/format.js";
import { THEME } from "../../theme.js";

export const TG_BLUE = "#0088CC";
export const TG_DARK_BG = "#0E1621";
export const TG_DARK_SIDEBAR = "#17212B";
export const TG_DARK_HOVER = "#202B36";
export const TG_DARK_SELECTED = "#2B5278";
export const TG_DARK_BORDER = "#101921";
export const TG_DARK_TEXT = "#E4ECF2";
export const TG_DARK_MUTED = "#6D7F91";
export const TG_OUT_BUBBLE = "#2B5278";
export const TG_IN_BUBBLE = "#182533";

// Ro'yxatdagi vaqt: bugun — soat, shu hafta — hafta kuni, undan eski — sana (Telegram'dagidek)
const WEEKDAYS = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];
function listTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= startOfToday) return d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
  const days = (startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000;
  if (days < 7) return WEEKDAYS[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return d.getFullYear() === now.getFullYear() ? `${dd}.${mm}` : `${dd}.${mm}.${String(d.getFullYear()).slice(2)}`;
}
const lastKey = (list) => (list.length ? `${list[list.length - 1].id}|${list.length}` : "");

export function ChatsView({ leads, onFetchChats, onSendMessage, onMarkRead, onMoveLead, onLeadCreated, initialChatId, onInitialChatHandled, isAdmin, onOpenSettings }) {
  // Telegram ulanish holati: sessiya tugagan bo'lsa — har so'rovda xato ko'rsatish o'rniga bitta tushunarli ogohlantirish
  const [tgStatus, setTgStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetchTelegramUserStatus().then((st) => alive && setTgStatus(st)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const tgDown = tgStatus && (tgStatus.status === "expired" || tgStatus.status === "disconnected" || tgStatus.status === "error");
  const [chats, setChats] = useState([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedChatId, setSelectedChatId] = useState(null);
  const selectedRef = useRef(null);
  selectedRef.current = selectedChatId;
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const lastCountRef = useRef(0);
  const lastMsgRef = useRef(""); // oxirgi xabar — faqat PASTGA yangi xabar qo'shilsa pastga aylantiramiz
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderReq = useRef(null); // { chatId, prevHeight, prevTop } — eski xabarlar qo'shilganda joyni saqlash
  const [addingLead, setAddingLead] = useState(false);
  const [justAdded, setJustAdded] = useState(null);
  const openedFromCrm = useRef(false); // CRM'dan kelinganmi — telefonda "orqaga" to'g'ri CRM'ga qaytarsin
  // CRM'dan "Chat" bosib kelinganda — shu mijoz suhbatini darhol ochamiz
  useEffect(() => {
    if (!initialChatId) return;
    openedFromCrm.current = true;
    setSelectedChatId(String(initialChatId));
    onInitialChatHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChatId]);
  const isMobile = useIsMobile();
  const [infoOpen, setInfoOpen] = useState(false);
  function closeChat() { setSelectedChatId(null); setInfoOpen(false); }
  // Telefonda: "orqaga" avval mijoz ma'lumotini, keyin suhbatni yopadi — bo'limdan chiqmaydi
  useBackToClose(isMobile && !!selectedChatId, () => {
    closeChat();
    if (openedFromCrm.current) {
      openedFromCrm.current = false;
      window.history.back(); // Chatlar ro'yxatida to'xtamasdan, kelgan joyga (CRM) qaytamiz
    }
  });
  useBackToClose(isMobile && infoOpen, () => setInfoOpen(false));

  // Telegram'dagi barcha shaxsiy suhbatlar; yangi yozganlar ro'yxatga tushishi uchun har 30 soniyada yangilanadi
  useEffect(() => {
    let alive = true;
    const load = () => onFetchChats().then((list) => {
      if (!alive) return;
      setChats((prev) => {
        // Ochiq suhbatda o'qilgan deb belgilangan holatni saqlaymiz
        const openId = selectedRef.current;
        const next = list.map((c) => (c.chatId === openId ? { ...c, unread: false } : c));
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
      setLoadingChats(false);
    }).catch(() => alive && setLoadingChats(false));
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // "Noma'lum (ID)" bo'lib qolgan mijozlar bo'lsa — ismlarini Telegram'dan qayta so'raymiz
  useEffect(() => {
    if ((leads || []).some((l) => l.telegramChatId && (l.customer || "").startsWith("Noma'lum"))) {
      refreshTelegramNames().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedChatId) return;
    setReplyTo(null);
    lastCountRef.current = 0;
    lastMsgRef.current = "";
    olderReq.current = null;
    setMessages([]);
    setHasOlder(false);
    setLoadingOlder(false);
    setLoadingMessages(true);
    const chatId = selectedChatId;
    fetchTelegramThread(chatId)
      .then((r) => { if (selectedRef.current !== chatId) return; setMessages(r.messages); setHasOlder(r.hasOlder); })
      .catch(() => selectedRef.current === chatId && setMessages([]))
      .finally(() => selectedRef.current === chatId && setLoadingMessages(false));
    // Ochiq suhbatni har 5 soniyada yangilaymiz — mijozning javobi sahifani yangilamasdan chiqadi
    const t = setInterval(() => {
      if (document.visibilityState !== "visible" || olderReq.current) return;
      fetchTelegramThread(chatId).then((r) => {
        if (selectedRef.current !== chatId || olderReq.current) return;
        setMessages((prev) => (prev.length > r.messages.length || JSON.stringify(prev) === JSON.stringify(r.messages) ? prev : r.messages));
      }).catch(() => {});
    }, 5000);
    if (onMarkRead) {
      onMarkRead(selectedChatId);
      setChats((prev) => prev.map((c) => (c.chatId === selectedChatId ? { ...c, unread: false } : c)));
    }
    return () => clearInterval(t);
  }, [selectedChatId]);

  // Eski xabarlar tepaga qo'shilganda ekrandagi joy siljimasin; yangi xabar pastga kelganda — pastga aylantiramiz
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const req = olderReq.current;
    if (el && req && req.done) {
      el.scrollTop = el.scrollHeight - req.prevHeight + req.prevTop;
      olderReq.current = null;
    } else if (lastKey(messages) && messages[messages.length - 1]?.id !== lastMsgRef.current.split("|")[0]) {
      bottomRef.current?.scrollIntoView({ behavior: lastCountRef.current ? "smooth" : "auto" });
    }
    lastCountRef.current = messages.length;
    lastMsgRef.current = lastKey(messages);
  }, [messages]);

  async function loadOlder() {
    const el = scrollRef.current;
    const chatId = selectedChatId;
    if (!el || !chatId || !hasOlder || loadingOlder || olderReq.current) return;
    olderReq.current = { chatId, prevHeight: el.scrollHeight, prevTop: el.scrollTop, done: false };
    setLoadingOlder(true);
    try {
      const oldest = messages.map((m) => m.tgId).filter((x) => Number.isInteger(x) && x > 0);
      const r = await fetchOlderTelegramMessages(chatId, oldest.length ? Math.min(...oldest) : undefined);
      if (selectedRef.current !== chatId) return;
      setHasOlder(r.hasMore);
      if (r.messages.length > messages.length) {
        const cur = scrollRef.current;
        olderReq.current = { ...olderReq.current, prevHeight: cur.scrollHeight, prevTop: cur.scrollTop, done: true };
        setMessages(r.messages);
        return;
      }
    } catch (e) {
      if (selectedRef.current === chatId) { setHasOlder(false); setError(e.message); }
    } finally {
      if (selectedRef.current === chatId) setLoadingOlder(false);
      if (olderReq.current && !olderReq.current.done) olderReq.current = null;
    }
  }
  function onMessagesScroll(e) {
    if (e.currentTarget.scrollTop < 150) loadOlder();
  }
  // Xabarlar ekranni to'ldirmasa (qisqa suhbat) — o'zi yana eskiroqlarini yuklaydi
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || loadingMessages || loadingOlder || !hasOlder) return;
    if (el.scrollHeight <= el.clientHeight + 150) loadOlder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, hasOlder, loadingMessages, loadingOlder]);

  async function addToCrm() {
    if (!selectedChatId || addingLead) return;
    setAddingLead(true);
    try {
      const lead = await createLeadFromChat(selectedChatId);
      if (lead) { onLeadCreated?.(lead); setJustAdded(selectedChatId); }
    } catch (e) {
      setError(e.message);
    } finally {
      setAddingLead(false);
    }
  }

  // chatId -> lid (har bir suhbat uchun butun ro'yxatni qidirmaslik uchun)
  const leadByChat = useMemo(() => {
    const m = new Map();
    (leads || []).forEach((l) => { if (l.telegramChatId && !m.has(String(l.telegramChatId))) m.set(String(l.telegramChatId), l); });
    return m;
  }, [leads]);
  function leadForChat(chatId) {
    return leadByChat.get(String(chatId));
  }
  // Ism: CRM'dagi mijoz nomi, bo'lmasa Telegram'dagi ismi
  function chatName(chatId) {
    const lead = leadForChat(chatId);
    if (lead?.customer) return lead.customer;
    return chats.find((c) => c.chatId === chatId)?.name || "Noma'lum";
  }

  const filteredChats = useMemo(() => {
    if (!search.trim()) return chats;
    const q = search.trim().toLowerCase();
    return chats.filter((c) => {
      const lead = leadForChat(c.chatId);
      return [lead?.customer, c.name, c.username, c.phone, lead?.phone, c.lastText].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [chats, search, leads]);

  // Yuborilgan xabarni ro'yxatga va suhbatlar ro'yxatidagi oxirgi matnga qo'shamiz
  function appendOutgoing(message, preview) {
    setMessages((prev) => [...prev, message]);
    setReplyTo(null);
    setChats((prev) => {
      const now = new Date().toISOString();
      const exists = prev.some((c) => c.chatId === selectedChatId);
      const updated = exists
        ? prev.map((c) => (c.chatId === selectedChatId ? { ...c, lastText: preview, lastDate: now } : c))
        : [{ chatId: selectedChatId, lastText: preview, lastDate: now, unread: false }, ...prev];
      return updated.sort((a, b) => new Date(b.lastDate || 0) - new Date(a.lastDate || 0));
    });
  }
  const replyId = () => replyTo?.tgId || undefined;
  async function handleSendText(t) {
    const data = await onSendMessage(selectedChatId, t, replyId());
    appendOutgoing(data?.message || { id: uid(), text: t, out: true, date: new Date().toISOString() }, t);
  }
  async function handleSendFile(kind, file, caption) {
    const m = await sendTelegramMedia(selectedChatId, kind, file, { caption, replyToTgId: replyId() });
    const preview = kind === "photo" ? (caption ? `📷 ${caption}` : "📷 Rasm") : kind === "video" ? (caption ? `🎥 ${caption}` : "🎥 Video") : `📎 ${file.name}`;
    appendOutgoing(m, preview);
  }
  async function handleSendVoice(blob, filename) {
    const m = await sendTelegramMedia(selectedChatId, "voice", blob, { filename, replyToTgId: replyId() });
    appendOutgoing(m, "🎤 Ovozli xabar");
  }
  async function handleSendLocation(lat, lng) {
    const m = await sendTelegramLocation(selectedChatId, lat, lng, replyId());
    appendOutgoing(m, "📍 Joylashuv");
  }
  async function handleReact(m, emoji) {
    const prev = m.myReaction || null;
    setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, myReaction: emoji } : x)));
    try {
      await reactTelegramMessage(selectedChatId, m.id, emoji);
    } catch (e) {
      setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, myReaction: prev } : x)));
      setError(e.message);
    }
  }

  const selectedLead = selectedChatId ? leadForChat(selectedChatId) : null;
  const selectedChat = selectedChatId ? chats.find((c) => c.chatId === selectedChatId) : null;
  const selectedName = selectedChatId ? chatName(selectedChatId) : "";
  const selectedUsername = selectedLead?.telegramUsername || selectedChat?.username || "";
  const selectedPhone = selectedLead?.phone || (selectedChat?.phone ? `+${String(selectedChat.phone).replace(/^\+/, "")}` : "");
  const addBtn = (full) => (
    <button type="button" onClick={addToCrm} disabled={addingLead} className="uc-addlead" data-full={full ? "1" : undefined}
      aria-label="CRM'ga lid sifatida qo'shish" title="CRM'ga lid sifatida qo'shish">
      {addingLead ? <Loader2 size={16} className="uc-spin" /> : <UserPlus size={16} />}
      {(full || !isMobile) && <span>CRM'ga qo'shish</span>}
    </button>
  );
  const unreadTotal = chats.filter((c) => c.unread).length;
  const { layout, update, fullscreen, setFullscreen } = useChatLayout();
  const containerRef = useRef(null);
  const showList = isMobile || !layout.listHidden;
  const showInfo = isMobile ? infoOpen : !layout.infoHidden;
  // Kompyuterda panellarni boshqarish tugmalari (sarlavhaning o'ng tomonida)
  const tools = !isMobile && (
    <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
      <button type="button" className="uc-tool" onClick={() => update((l) => ({ listHidden: !l.listHidden }))} aria-pressed={!layout.listHidden}
        aria-label={layout.listHidden ? "Suhbatlar ro'yxatini ko'rsatish" : "Suhbatlar ro'yxatini yashirish"} title={layout.listHidden ? "Ro'yxatni ko'rsatish" : "Ro'yxatni yashirish"}>
        {layout.listHidden ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
      </button>
      {selectedChatId && (
        <button type="button" className="uc-tool" onClick={() => update((l) => ({ infoHidden: !l.infoHidden }))} aria-pressed={!layout.infoHidden}
          aria-label={layout.infoHidden ? "Mijoz panelini ko'rsatish" : "Mijoz panelini yashirish"} title={layout.infoHidden ? "Mijoz panelini ko'rsatish" : "Mijoz panelini yashirish"}>
          {layout.infoHidden ? <PanelRightOpen size={19} /> : <PanelRightClose size={19} />}
        </button>
      )}
      <button type="button" className="uc-tool" onClick={() => setFullscreen((v) => !v)} aria-pressed={fullscreen}
        aria-label={fullscreen ? "To'liq ekrandan chiqish" : "To'liq ekran"} title={fullscreen ? "To'liq ekrandan chiqish (Esc)" : "To'liq ekran"}>
        {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>
    </div>
  );

  return (
    <div ref={containerRef} style={isMobile
      ? { borderRadius: 16, overflow: "hidden", boxShadow: THEME.shadowLg }
      : fullscreen
        ? { display: "flex", position: "fixed", inset: 0, zIndex: 250, background: TG_DARK_BG }
        : { display: "flex", height: "calc(100vh - 140px)", minHeight: 520, borderRadius: 16, overflow: "hidden", boxShadow: THEME.shadowLg }}>
      <style>{LAYOUT_CSS}</style>
      {/* Chap panel — suhbatlar royxati */}
      {showList && (<>
      <div style={{ width: isMobile ? "100%" : layout.listW, minHeight: isMobile ? "60vh" : undefined, flexShrink: 0, display: "flex", flexDirection: "column", background: TG_DARK_SIDEBAR, minWidth: 0 }}>
        {tgDown && (
          <div data-testid="tg-down" role="alert" style={{ margin: "12px 12px 0", padding: "10px 12px", borderRadius: 12, background: "rgba(229,72,77,0.14)", border: "1px solid rgba(229,72,77,0.35)", color: "#FFB4B6", fontSize: 12.5, lineHeight: 1.45 }}>
            <div style={{ fontWeight: 800, color: "#FFD2D3", marginBottom: 2 }}>
              {tgStatus.status === "expired" ? "Telegram ulanishi uzildi" : "Telegram akkaunt ulanmagan"}
            </div>
            <div>{tgStatus.status === "expired" ? tgStatus.message : "Yangi xabarlar kelmaydi va yuborib bo'lmaydi."} Saqlangan yozishmalar ko'rinib turadi.</div>
            {isAdmin && onOpenSettings ? (
              <button type="button" onClick={onOpenSettings} style={{ marginTop: 8, height: 32, padding: "0 14px", borderRadius: 9, border: "none", background: TG_BLUE, color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                Qayta ulash
              </button>
            ) : (
              <div style={{ marginTop: 4, color: TG_DARK_MUTED }}>Administratorga xabar bering.</div>
            )}
          </div>
        )}
        <div style={{ padding: "16px 16px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>Chatlar</div>
            {unreadTotal > 0 && (
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: TG_BLUE, padding: "2px 7px", borderRadius: 10 }}>{unreadTotal}</span>
            )}
          </div>
          <div style={{ position: "relative", marginTop: 10 }}>
            <Search size={13} color={TG_DARK_MUTED} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Qidirish"
              style={{ width: "100%", background: TG_DARK_HOVER, border: "none", borderRadius: 20, padding: isMobile ? "10px 12px 10px 32px" : "8px 12px 8px 30px", fontSize: isMobile ? 16 : 12.5, color: TG_DARK_TEXT, outline: "none" }}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loadingChats ? (
            <div style={{ textAlign: "center", color: TG_DARK_MUTED, fontSize: 12.5, marginTop: 30 }}>Yuklanmoqda...</div>
          ) : filteredChats.length === 0 ? (
            <div style={{ textAlign: "center", color: TG_DARK_MUTED, fontSize: 12.5, marginTop: 30, padding: "0 20px" }}>
              {chats.length === 0 ? "Suhbatlar yo'q. Sozlamalarda Telegram akkaunt ulanganini tekshiring." : "Hech narsa topilmadi"}
            </div>
          ) : (
            <Incremental list={filteredChats} step={40} render={(chat) => {
              const lead = leadForChat(chat.chatId);
              const name = lead?.customer || chat.name || "Noma'lum";
              const isSelected = selectedChatId === chat.chatId;
              return (
                <div
                  key={chat.chatId}
                  onClick={() => setSelectedChatId(chat.chatId)}
                  className="uvix-row"
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer",
                    background: isSelected ? TG_DARK_SELECTED : "transparent",
                  }}
                >
                  <div style={{ width: 46, height: 46, borderRadius: "50%", background: TG_BLUE, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, flexShrink: 0 }}>
                    {name.slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                        {lead && <span title="CRM'da lid bor" style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color: "#6AB3F3", border: "1px solid rgba(106,179,243,0.45)", borderRadius: 6, padding: "0 5px", lineHeight: "15px", flexShrink: 0 }}>CRM</span>}
                      </div>
                      {chat.lastDate && <div style={{ fontSize: 10.5, color: TG_DARK_MUTED, flexShrink: 0, marginLeft: 6 }}>{listTime(chat.lastDate)}</div>}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                      <div style={{ fontSize: 12, color: TG_DARK_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{chat.lastOut && chat.lastText ? <span style={{ color: "#8FA3B6" }}>Siz: </span> : null}{chat.lastText}</div>
                      {chat.unread && <span style={{ width: 8, height: 8, borderRadius: "50%", background: TG_BLUE, flexShrink: 0, marginLeft: 6 }} />}
                    </div>
                  </div>
                </div>
              );
            }} />
          )}
        </div>
      </div>
      {!isMobile && (
        <Resizer side="left" width={layout.listW} onChange={(w) => update({ listW: w })} containerRef={containerRef}
          otherWidth={selectedChatId && !layout.infoHidden ? layout.infoW : 0} />
      )}
      </>)}

      {/* Ortadagi panel — tanlangan suhbat */}
      {(!isMobile || selectedChatId) && (
      <div style={isMobile
        ? { position: "fixed", inset: 0, zIndex: 160, display: "flex", flexDirection: "column", background: TG_DARK_BG, paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }
        : { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: TG_DARK_BG }}>
        {!selectedChatId ? (
          <>
            {!isMobile && <div style={{ display: "flex", padding: "10px 14px", background: TG_DARK_SIDEBAR, borderBottom: `1px solid ${TG_DARK_BORDER}` }}>{tools}</div>}
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: TG_DARK_MUTED, fontSize: 13.5 }}>
              Suhbatni tanlang
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: isMobile ? "8px 10px" : "10px 14px 10px 20px", background: TG_DARK_SIDEBAR, color: "#fff", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${TG_DARK_BORDER}` }}>
              {isMobile && (
                <button type="button" onClick={() => window.history.back()} aria-label={openedFromCrm.current ? "CRM'ga qaytish" : "Suhbatlar ro'yxatiga qaytish"}
                  style={{ width: 44, height: 44, border: 0, background: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                  <ArrowLeft size={22} />
                </button>
              )}
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: TG_BLUE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
                {(selectedName || "?").slice(0, 1).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedName}</div>
                <div style={{ fontSize: 11, color: TG_DARK_MUTED }}>
                  {selectedUsername ? `@${selectedUsername}` : selectedLead ? "Telegram akkaunt" : "CRM'da yo'q"}
                </div>
              </div>
              {!selectedLead && <div style={{ marginLeft: isMobile ? "auto" : 8 }}>{addBtn(false)}</div>}
              {tools}
              {isMobile && (
                <button type="button" onClick={() => setInfoOpen(true)} aria-label="Mijoz ma'lumotlari"
                  style={{ marginLeft: selectedLead ? "auto" : 0, width: 44, height: 44, border: 0, background: "none", color: TG_DARK_MUTED, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                  <Info size={21} />
                </button>
              )}
            </div>
            <style>{CHAT_CSS + ADD_CSS}</style>
            <div ref={scrollRef} onScroll={onMessagesScroll} style={{ flex: 1, overflowY: "auto", overflowAnchor: "none", padding: isMobile ? "14px 10px" : 18, display: "flex", flexDirection: "column", gap: 8 }}>
              {!loadingMessages && messages.length > 0 && (
                <div aria-live="polite" style={{ alignSelf: "center", fontSize: 12, color: TG_DARK_MUTED, padding: "4px 12px", minHeight: 22, display: "flex", alignItems: "center", gap: 6 }}>
                  {loadingOlder ? (<><Loader2 size={14} className="uc-spin" /> Eski xabarlar yuklanmoqda…</>)
                    : hasOlder ? (<button type="button" onClick={loadOlder} style={{ border: 0, background: "rgba(255,255,255,0.06)", color: "#8FA3B6", borderRadius: 12, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}>Eski xabarlarni yuklash</button>)
                    : <span>Suhbat boshi</span>}
                </div>
              )}
              <MessageList
                messages={messages}
                loading={loadingMessages}
                isMobile={isMobile}
                customerName={selectedName || "Mijoz"}
                onReply={(m) => setReplyTo(m)}
                onReact={handleReact}
              />
              <div ref={bottomRef} />
            </div>
            {error && (
              <div role="alert" onClick={() => setError("")} style={{ color: "#FF9EA1", background: "rgba(229,72,77,0.12)", fontSize: 12.5, padding: "8px 18px", cursor: "pointer" }}>{error}</div>
            )}
            <Composer
              key={selectedChatId}
              isMobile={isMobile}
              customerName={selectedName || "Mijoz"}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              onSendText={handleSendText}
              onSendFile={handleSendFile}
              onSendVoice={handleSendVoice}
              onSendLocation={handleSendLocation}
            />
          </>
        )}
      </div>
      )}

      {/* Ong panel — mijoz malumoti */}
      {selectedChatId && showInfo && !isMobile && (
        <Resizer side="right" width={layout.infoW} onChange={(w) => update({ infoW: w })} containerRef={containerRef}
          otherWidth={showList ? layout.listW : 0} />
      )}
      {selectedChatId && showInfo && (
        <div style={isMobile
          ? { position: "fixed", inset: 0, zIndex: 170, background: TG_DARK_SIDEBAR, overflowY: "auto", padding: "calc(12px + env(safe-area-inset-top, 0px)) 20px calc(20px + env(safe-area-inset-bottom, 0px))" }
          : { width: layout.infoW, flexShrink: 0, background: TG_DARK_SIDEBAR, overflowY: "auto", padding: 20, boxSizing: "border-box" }}>
          {isMobile && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
              <button type="button" onClick={() => setInfoOpen(false)} aria-label="Yopish"
                style={{ width: 44, height: 44, border: 0, borderRadius: 12, background: TG_DARK_HOVER, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>
          )}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: TG_BLUE, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, margin: "0 auto 10px" }}>
              {(selectedName || "?").slice(0, 1).toUpperCase()}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{selectedName}</div>
          </div>

          {!selectedLead && (
            <div style={{ background: TG_DARK_HOVER, borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12.5, color: "#C5D2DD", lineHeight: 1.45, marginBottom: 10 }}>Bu suhbat CRM'da yo'q. Mijoz bo'lsa — lid sifatida qo'shing, bosqichi va buyurtmasini kuzatasiz.</div>
              {addBtn(true)}
            </div>
          )}
          {selectedLead && justAdded === selectedChatId && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#7BD88F", fontSize: 12.5, marginBottom: 12 }}><Check size={15} /> CRM'ga qo'shildi</div>
          )}

          {selectedLead && onMoveLead && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, color: TG_DARK_MUTED, textTransform: "uppercase", marginBottom: 5 }}>Bosqich</div>
              <select
                value={selectedLead.stage}
                onChange={(e) => onMoveLead(selectedLead, e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", minHeight: isMobile ? 44 : undefined, background: TG_DARK_HOVER, border: "none", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, color: "#fff", outline: "none" }}
              >
                {LEAD_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10.5, color: TG_DARK_MUTED, textTransform: "uppercase" }}>Telefon</div>
              <div style={{ fontSize: 13, color: "#fff", marginTop: 2 }}>{selectedPhone || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: TG_DARK_MUTED, textTransform: "uppercase" }}>Username</div>
              <div style={{ fontSize: 13, color: "#fff", marginTop: 2 }}>{selectedUsername ? `@${selectedUsername}` : "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: TG_DARK_MUTED, textTransform: "uppercase" }}>Menejer</div>
              <div style={{ fontSize: 13, color: "#fff", marginTop: 2 }}>{selectedLead?.manager || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: TG_DARK_MUTED, textTransform: "uppercase" }}>Manba</div>
              <div style={{ fontSize: 13, color: "#fff", marginTop: 2 }}>{selectedLead?.source || "—"}</div>
            </div>
          </div>

          <div style={{ marginTop: 18, borderTop: `1px solid ${TG_DARK_BORDER}`, paddingTop: 14 }}>
            <div style={{ fontSize: 10.5, color: TG_DARK_MUTED, textTransform: "uppercase", marginBottom: 8 }}>Bitim (buyurtma)</div>
            {selectedLead?.orderId ? (
              <div style={{ background: TG_DARK_HOVER, borderRadius: 10, padding: 10 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: THEME.green, background: THEME.greenBg, padding: "2px 8px", borderRadius: 8 }}>Bog'langan</span>
                <div style={{ fontSize: 12.5, color: "#fff", marginTop: 6 }}>Buyurtmaga o'tilgan</div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: TG_DARK_MUTED }}>Hali bitim yo'q</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const ADD_CSS = `
  .uc-addlead { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(106,179,243,0.5); background: rgba(0,136,204,0.14); color: #8CC8F5; font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; font-family: inherit; }
  .uc-addlead:hover:not(:disabled) { background: rgba(0,136,204,0.26); color: #fff; }
  .uc-addlead:disabled { opacity: .7; cursor: default; }
  .uc-addlead[data-full] { width: 100%; height: 42px; background: #0088CC; border-color: #0088CC; color: #fff; }
  .uc-addlead[data-full]:hover:not(:disabled) { background: #0A96DE; }
  @media (max-width: 768px) { .uc-addlead:not([data-full]) { width: 44px; height: 44px; padding: 0; border-radius: 12px; } }
  .uc-spin { animation: uc-spin 0.9s linear infinite; }
  @keyframes uc-spin { to { transform: rotate(360deg); } }
`;
