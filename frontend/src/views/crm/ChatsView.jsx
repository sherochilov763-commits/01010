import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCheck, Info, Search, Send, X } from "lucide-react";
import { useIsMobile } from "../../components/ui.jsx";
import { useBackToClose } from "../../lib/history.js";
import { refreshTelegramNames } from "../../storage.js";
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

export function ChatsView({ leads, onFetchChats, onFetchMessages, onSendMessage, onMarkRead, onMoveLead }) {
  const [chats, setChats] = useState([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const isMobile = useIsMobile();
  const [infoOpen, setInfoOpen] = useState(false);
  function closeChat() { setSelectedChatId(null); setInfoOpen(false); }
  // Telefonda: "orqaga" avval mijoz ma'lumotini, keyin suhbatni yopadi — bo'limdan chiqmaydi
  useBackToClose(isMobile && !!selectedChatId, closeChat);
  useBackToClose(isMobile && infoOpen, () => setInfoOpen(false));

  useEffect(() => {
    onFetchChats().then((list) => { setChats(list); setLoadingChats(false); }).catch(() => setLoadingChats(false));
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
    setLoadingMessages(true);
    onFetchMessages(selectedChatId).then(setMessages).catch(() => setMessages([])).finally(() => setLoadingMessages(false));
    if (onMarkRead) {
      onMarkRead(selectedChatId);
      setChats((prev) => prev.map((c) => (c.chatId === selectedChatId ? { ...c, unread: false } : c)));
    }
  }, [selectedChatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function leadForChat(chatId) {
    return (leads || []).find((l) => l.telegramChatId === chatId);
  }

  const filteredChats = useMemo(() => {
    if (!search.trim()) return chats;
    const q = search.trim().toLowerCase();
    return chats.filter((c) => {
      const lead = leadForChat(c.chatId);
      return (lead?.customer || "").toLowerCase().includes(q) || (c.lastText || "").toLowerCase().includes(q);
    });
  }, [chats, search, leads]);

  async function send() {
    if (!text.trim() || !selectedChatId) return;
    setSending(true);
    setError("");
    const outgoing = text.trim();
    setText("");
    try {
      await onSendMessage(selectedChatId, outgoing);
      setMessages((prev) => [...prev, { id: uid(), text: outgoing, out: true, date: new Date().toISOString() }]);
      setChats((prev) => {
        const updated = prev.map((c) => (c.chatId === selectedChatId ? { ...c, lastText: outgoing, lastDate: new Date().toISOString() } : c));
        return updated.sort((a, b) => new Date(b.lastDate || 0) - new Date(a.lastDate || 0));
      });
    } catch (e) {
      setError(e?.message || "Yuborilmadi");
      setText(outgoing);
    } finally {
      setSending(false);
    }
  }

  const selectedLead = selectedChatId ? leadForChat(selectedChatId) : null;
  const unreadTotal = chats.filter((c) => c.unread).length;

  return (
    <div style={isMobile
      ? { borderRadius: 16, overflow: "hidden", boxShadow: THEME.shadowLg }
      : { display: "flex", height: "calc(100vh - 140px)", minHeight: 520, borderRadius: 16, overflow: "hidden", boxShadow: THEME.shadowLg }}>
      {/* Chap panel — suhbatlar royxati */}
      <div style={{ width: isMobile ? "100%" : 300, minHeight: isMobile ? "60vh" : undefined, flexShrink: 0, display: "flex", flexDirection: "column", background: TG_DARK_SIDEBAR }}>
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
              {chats.length === 0 ? "Hali suhbat yo'q. Telegram orqali mijozdan xabar kelganda shu yerda paydo bo'ladi." : "Hech narsa topilmadi"}
            </div>
          ) : (
            filteredChats.map((chat) => {
              const lead = leadForChat(chat.chatId);
              const name = lead?.customer || "Noma'lum";
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
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                      {chat.lastDate && <div style={{ fontSize: 10.5, color: TG_DARK_MUTED, flexShrink: 0, marginLeft: 6 }}>{new Date(chat.lastDate).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}</div>}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                      <div style={{ fontSize: 12, color: TG_DARK_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{chat.lastText}</div>
                      {chat.unread && <span style={{ width: 8, height: 8, borderRadius: "50%", background: TG_BLUE, flexShrink: 0, marginLeft: 6 }} />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Ortadagi panel — tanlangan suhbat */}
      {(!isMobile || selectedChatId) && (
      <div style={isMobile
        ? { position: "fixed", inset: 0, zIndex: 160, display: "flex", flexDirection: "column", background: TG_DARK_BG, paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }
        : { flex: 1, display: "flex", flexDirection: "column", background: TG_DARK_BG, borderLeft: `1px solid ${TG_DARK_BORDER}`, borderRight: `1px solid ${TG_DARK_BORDER}` }}>
        {!selectedChatId ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: TG_DARK_MUTED, fontSize: 13.5 }}>
            Suhbatni tanlang
          </div>
        ) : (
          <>
            <div style={{ padding: isMobile ? "8px 10px" : "14px 20px", background: TG_DARK_SIDEBAR, color: "#fff", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${TG_DARK_BORDER}` }}>
              {isMobile && (
                <button type="button" onClick={closeChat} aria-label="Suhbatlar ro'yxatiga qaytish"
                  style={{ width: 44, height: 44, border: 0, background: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                  <ArrowLeft size={22} />
                </button>
              )}
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: TG_BLUE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
                {(selectedLead?.customer || "?").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{selectedLead?.customer || "Noma'lum"}</div>
                <div style={{ fontSize: 11, color: TG_DARK_MUTED }}>
                  {selectedLead?.telegramUsername ? `@${selectedLead.telegramUsername}` : "Telegram akkaunt"}
                </div>
              </div>
              {isMobile && (
                <button type="button" onClick={() => setInfoOpen(true)} aria-label="Mijoz ma'lumotlari"
                  style={{ marginLeft: "auto", width: 44, height: 44, border: 0, background: "none", color: TG_DARK_MUTED, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                  <Info size={21} />
                </button>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              {loadingMessages ? (
                <div style={{ textAlign: "center", color: TG_DARK_MUTED, fontSize: 12.5, marginTop: 20 }}>Yuklanmoqda...</div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: "center", color: TG_DARK_MUTED, fontSize: 12.5, marginTop: 20 }}>Hali xabar yo'q</div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} style={{ alignSelf: m.out ? "flex-end" : "flex-start", maxWidth: isMobile ? "82%" : "62%" }}>
                    {m.mediaUrl ? (
                      <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${TG_DARK_BORDER}` }}>
                        <img src={m.mediaUrl} alt="" style={{ display: "block", maxWidth: 280, maxHeight: 320, width: "100%", objectFit: "cover" }} />
                        {m.text && !m.text.startsWith("📷") && (
                          <div style={{ background: m.out ? TG_OUT_BUBBLE : TG_IN_BUBBLE, color: TG_DARK_TEXT, padding: "6px 10px", fontSize: 13 }}>{m.text}</div>
                        )}
                      </div>
                    ) : (
                      <div style={{
                        background: m.out ? TG_OUT_BUBBLE : TG_IN_BUBBLE,
                        color: TG_DARK_TEXT,
                        padding: "8px 12px", borderRadius: 14,
                        borderBottomRightRadius: m.out ? 4 : 14, borderBottomLeftRadius: m.out ? 14 : 4,
                        fontSize: 13.5, wordBreak: "break-word",
                      }}>
                        {m.text}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3, justifyContent: m.out ? "flex-end" : "flex-start" }}>
                      <span style={{ fontSize: 10, color: TG_DARK_MUTED }}>
                        {new Date(m.date).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {m.out && <CheckCheck size={12} color={TG_BLUE} />}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>
            {error && <div style={{ color: THEME.rose, fontSize: 11.5, padding: "0 18px" }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, padding: 14, background: TG_DARK_SIDEBAR, borderTop: `1px solid ${TG_DARK_BORDER}` }}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                placeholder="Xabar yozing..."
                style={{ flex: 1, minWidth: 0, background: TG_DARK_HOVER, border: "none", borderRadius: 20, padding: "10px 16px", fontSize: isMobile ? 16 : 13.5, outline: "none", color: TG_DARK_TEXT }}
              />
              <button
                onClick={send}
                disabled={sending || !text.trim()}
                style={{ width: 40, height: 40, borderRadius: "50%", background: TG_BLUE, border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: sending || !text.trim() ? "default" : "pointer", opacity: sending || !text.trim() ? 0.5 : 1, flexShrink: 0 }}
              >
                <Send size={16} />
              </button>
            </div>
          </>
        )}
      </div>
      )}

      {/* Ong panel — mijoz malumoti */}
      {selectedChatId && (!isMobile || infoOpen) && (
        <div style={isMobile
          ? { position: "fixed", inset: 0, zIndex: 170, background: TG_DARK_SIDEBAR, overflowY: "auto", padding: "calc(12px + env(safe-area-inset-top, 0px)) 20px calc(20px + env(safe-area-inset-bottom, 0px))" }
          : { width: 280, flexShrink: 0, background: TG_DARK_SIDEBAR, overflowY: "auto", padding: 20 }}>
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
              {(selectedLead?.customer || "?").slice(0, 1).toUpperCase()}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{selectedLead?.customer || "Noma'lum"}</div>
          </div>

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
              <div style={{ fontSize: 13, color: "#fff", marginTop: 2 }}>{selectedLead?.phone || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: TG_DARK_MUTED, textTransform: "uppercase" }}>Username</div>
              <div style={{ fontSize: 13, color: "#fff", marginTop: 2 }}>{selectedLead?.telegramUsername ? `@${selectedLead.telegramUsername}` : "—"}</div>
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
