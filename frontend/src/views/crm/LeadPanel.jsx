// LeadPanel.jsx — lid kartasi bosilganda ochiladigan panel (eskiz 86, HubSpot uslubi):
// kompyuterda o'ngdan, telefonda pastdan. Tepada: raqam/bosqich, mijoz, ish nomi, tez amallar
// (Qo'ng'iroq · Telegram · Smeta · Buyurtma · O'lchov); ostida «maydon: qiymat» ro'yxati va oxirgi xabarlar.
import { useEffect, useState } from "react";
import { CalendarClock, Check, ChevronDown, Copy, FileText, MessageCircle, Package, Pencil, Phone, Ruler, Send, Trash2, X } from "lucide-react";
import { THEME } from "../../theme.js";
import { money } from "../../lib/format.js";
import { LINE_META, lineColor } from "../../lib/lines.js";
import { PROD_LABEL } from "../../lib/production.js";
import { PRIORITIES, avatarOf, nextActivity, priorityOf } from "../../lib/leadPriority.js";
import { sourceMeta } from "../../components/LeadSource.jsx";
import { useBackToClose } from "../../lib/history.js";
import { JOB_SHORT, PriorityIcon, agoLabel, dealOf, fullDate, leadTitle } from "./LeadCard.jsx";

function telegramLink(lead) {
  if (lead.telegramUsername) return `https://t.me/${lead.telegramUsername.replace(/^@/, "")}`;
  const digits = (lead.phone || "").replace(/\D/g, "");
  return digits.length >= 9 ? `https://t.me/+${digits.length === 9 ? "998" + digits : digits}` : null;
}
const telHref = (phone) => { const d = (phone || "").replace(/[^\d+]/g, ""); return d ? `tel:${d}` : null; };

export function LeadPanel({ lead, sig = {}, stages, orders, jobs, phone, onClose, onEdit, onDelete, onMoveTo, onPriority, onJob, onChat, onCreateOrder, onOpenOrder, onFetchMessages }) {
  useBackToClose(true, onClose);
  const [msgs, setMsgs] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape" && !document.querySelector(".uvix-modal-panel")) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  useEffect(() => {
    setMsgs(null);
    if (!lead.telegramChatId || !onFetchMessages) return undefined;
    let off = false;
    onFetchMessages(lead.telegramChatId).then((m) => { if (!off) setMsgs((m || []).slice(-4)); }).catch(() => { if (!off) setMsgs([]); });
    return () => { off = true; };
  }, [lead.id, lead.telegramChatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const st = stages.find((s) => s.key === lead.stage) || stages[0];
  const line = lead.line || "UVIXPRINT";
  const lc = lineColor(line, THEME.isDark);
  const av = lead.manager ? avatarOf(lead.manager) : null;
  const src = sourceMeta(lead.source);
  const deal = dealOf(lead, orders);
  const act = nextActivity(lead, jobs);
  const q = lead.quote?.status === "open" ? lead.quote : lead.quote || null;
  const title = leadTitle(lead);
  const tel = telHref(lead.phone);
  const tg = telegramLink(lead);
  const p = priorityOf(lead);
  const chat = sig.chat;

  const copyPhone = () => {
    navigator.clipboard?.writeText(lead.phone).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  const actText = (() => {
    if (act.state === "planned" || act.state === "late") {
      const j = act.job;
      const who = j.assignees?.length ? ` · ${j.assignees.map((a) => a.name.split(" ")[0]).join(", ")}` : "";
      return <span style={{ color: act.state === "late" ? THEME.rose : THEME.text, fontWeight: act.state === "late" ? 650 : 500 }}>{JOB_SHORT[j.kind] || "Vazifa"} · {j.date ? j.date.split("-").reverse().join(".") : "sanasiz"}{j.time ? ` ${j.time}` : ""}{who}{act.state === "late" ? " — kechikdi" : ""}</span>;
    }
    if (act.state === "busy") return <span>Ish jarayonda</span>;
    return <span style={{ color: THEME.amber, fontWeight: 600 }}>Belgilanmagan</span>;
  })();
  const lastAct = chat?.lastDate
    ? <span style={{ color: sig.wait ? THEME.rose : THEME.text, fontWeight: sig.wait ? 650 : 500 }}>{agoLabel(Math.floor((Date.now() - new Date(chat.lastDate).getTime()) / 60000))} oldin — {chat.lastOut ? "siz yozdingiz" : "mijoz yozdi"}</span>
    : sig.coldDays ? <span>{sig.coldDays} kun oldin</span> : <span style={{ color: THEME.dim }}>yaqinda</span>;

  const rows = [
    ["Summa", lead.estimatedValue > 0 ? <b>{money(lead.estimatedValue)}</b> : <span style={{ color: THEME.dim }}>kiritilmagan</span>],
    ["Kelgan sana", <span>{fullDate(lead.createdAt)}</span>, "came"],
    ["Yo'nalish", <b style={{ color: lc }}>{LINE_META[line]?.name || line}</b>],
    ["Muhimlik", <button type="button" onClick={() => onPriority?.(PRIORITIES[(PRIORITIES.findIndex((x) => x.key === p) + 1) % PRIORITIES.length].key)} title="Bosing — keyingisiga o'tadi" style={{ display: "inline-flex", alignItems: "center", gap: 6, border: 0, background: "none", padding: 0, cursor: "pointer", color: THEME.text, fontFamily: "inherit", fontSize: "inherit" }}><PriorityIcon p={p} size={14} />{PRIORITIES.find((x) => x.key === p).label}</button>],
    ["Manba", src ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 18, height: 18, borderRadius: 5, background: `${src.color}1C`, color: src.color, display: "inline-grid", placeItems: "center" }}><src.icon size={10.5} strokeWidth={2.4} /></span>{src.text}</span> : <span style={{ color: THEME.dim }}>—</span>],
    ["Mas'ul", av ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 20, height: 20, borderRadius: "50%", background: av.color, color: "#fff", fontSize: 8.5, fontWeight: 800, display: "grid", placeItems: "center" }}>{av.text}</span>{lead.manager}</span> : <span style={{ color: THEME.dim }}>—</span>],
    ["Telefon", lead.phone ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ fontVariantNumeric: "tabular-nums", userSelect: "all" }}>{lead.phone}</span><button type="button" onClick={copyPhone} aria-label="Nusxalash" title="Nusxalash" style={{ border: 0, background: "none", padding: 2, cursor: "pointer", color: copied ? THEME.green : THEME.dim, display: "inline-flex" }}>{copied ? <Check size={13} /> : <Copy size={13} />}</button></span> : <span style={{ color: THEME.dim }}>—</span>],
    ["Keyingi ish", actText],
    ["Oxirgi faollik", lastAct],
    ["Smeta", q ? <span>{q.no} · {money(q.total)}{q.status === "open" ? "" : ` · ${q.status === "converted" ? "buyurtma bo'ldi" : q.status}`}</span> : <span style={{ color: THEME.dim }}>hali yo'q</span>],
    ["Buyurtmalar", deal ? <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>{deal.list.map((o) => <button key={o.id} type="button" onClick={() => onOpenOrder?.(o)} style={{ border: 0, background: "none", padding: 0, cursor: onOpenOrder ? "pointer" : "default", color: THEME.blue, fontFamily: "inherit", fontSize: "inherit", textAlign: "left" }}>{o.orderNumber} · {PROD_LABEL[o.prodStage] || "Navbatda"}</button>)}</span> : <span style={{ color: THEME.dim }}>yo'q</span>],
    ["Avvalgi buyurtmalar", sig.prevCount ? <span>{sig.prevCount} ta · {money(sig.prevSum)}</span> : <span style={{ color: THEME.dim }}>yo'q (yangi mijoz)</span>],
  ];
  if (lead.notes && lead.notes !== title) rows.push(["Izoh", <span style={{ whiteSpace: "pre-wrap" }}>{lead.notes}</span>]);

  const actBtn = { display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 11px", borderRadius: 9, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" };
  const linked = deal?.list?.[0];

  return (
    <>
      <div className="uvix-lp-scrim" onClick={onClose} />
      <aside className={`uvix-lp ${phone ? "is-phone" : ""}`} role="dialog" aria-label={`Lid: ${lead.customer}`} data-testid="lead-panel" data-lead-panel={lead.id}>
        {phone && <div style={{ width: 38, height: 4, borderRadius: 2, background: THEME.border2, margin: "8px auto 0" }} />}
        <div style={{ padding: "14px 18px 13px", borderBottom: `1px solid ${THEME.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: THEME.dim }}>
            <label title="Bosqichni o'zgartirish" style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 20, padding: "3px 8px 3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: st.color, background: `${st.color}1F`, whiteSpace: "nowrap", maxWidth: "70%" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{st.label}</span><ChevronDown size={13} style={{ flexShrink: 0 }} />
              <select value={lead.stage || "new"} onChange={(e) => onMoveTo(e.target.value)} data-testid="lead-panel-stage" aria-label="Bosqich"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: 0, fontSize: 16 }}>
                {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              <button type="button" onClick={onEdit} title="Tahrirlash" aria-label="Tahrirlash" data-testid="lead-panel-edit" className="uvix-lp-ic"><Pencil size={15} /></button>
              <button type="button" onClick={onDelete} title="O'chirish" aria-label="O'chirish" className="uvix-lp-ic danger"><Trash2 size={15} /></button>
              <button type="button" onClick={onClose} title="Yopish (Esc)" aria-label="Yopish" data-testid="lead-panel-close" className="uvix-lp-ic"><X size={17} /></button>
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10, lineHeight: 1.25, wordBreak: "break-word" }}>{lead.customer}</div>
          {title && <div style={{ fontSize: 14, color: THEME.muted, marginTop: 2 }}>{title}</div>}
          {sig.wait > 0 && <div style={{ marginTop: 9, fontSize: 12.5, color: THEME.rose, fontWeight: 650, display: "inline-flex", alignItems: "center", gap: 5, background: THEME.roseBg, borderRadius: 6, padding: "4px 9px" }}>Javob kutmoqda · {agoLabel(sig.wait)}</div>}
          <div data-testid="lead-panel-actions" className="uvix-lp-acts" style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {tel && <a href={tel} style={actBtn} data-act="call"><Phone size={14} />Qo'ng'iroq</a>}
            {lead.telegramChatId && onChat
              ? <button type="button" style={actBtn} onClick={onChat} data-act="tg"><MessageCircle size={14} />Telegram</button>
              : tg && <a href={tg} target="_blank" rel="noopener noreferrer" style={actBtn} data-act="tg"><Send size={14} />Telegram</a>}
            {!linked && <button type="button" style={actBtn} onClick={onCreateOrder} data-act="quote"><FileText size={14} />{lead.quote?.status === "open" ? `Smeta ${lead.quote.no}` : "Smeta"}</button>}
            {linked
              ? <button type="button" style={actBtn} onClick={() => onOpenOrder?.(linked)} data-act="order"><Package size={14} />Buyurtma</button>
              : lead.quote?.status === "open" && <button type="button" style={actBtn} onClick={onCreateOrder} data-act="order"><Check size={14} />Buyurtma</button>}
            <button type="button" style={actBtn} onClick={onJob} data-act="job"><Ruler size={14} />O'lchov</button>
          </div>
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "2px 18px 20px" }}>
          {rows.map(([k, v, tid]) => (
            <div key={k} data-testid={tid ? `lead-panel-${tid}` : undefined} style={{ display: "flex", gap: 12, padding: "9px 0", borderBottom: `1px solid ${THEME.borderSoft}`, fontSize: 13.5, alignItems: "flex-start" }}>
              <span style={{ width: phone ? 118 : 140, flexShrink: 0, color: THEME.muted }}>{k}</span>
              <span style={{ minWidth: 0, flex: 1, color: THEME.text, wordBreak: "break-word" }}>{v}</span>
            </div>
          ))}
          {lead.telegramChatId && (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: THEME.muted, letterSpacing: 0.5, margin: "16px 0 8px", display: "flex", alignItems: "center", gap: 6 }}><CalendarClock size={12} />OXIRGI XABARLAR</div>
              {msgs == null ? <div style={{ fontSize: 12.5, color: THEME.dim }}>Yuklanmoqda…</div>
                : msgs.length === 0 ? <div style={{ fontSize: 12.5, color: THEME.dim }}>Xabar yo'q</div>
                : <div data-testid="lead-panel-msgs" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {msgs.map((m) => (
                    <div key={m.id} style={{ alignSelf: m.out ? "flex-end" : "flex-start", maxWidth: "86%", background: m.out ? `${THEME.blue}1C` : THEME.chip, borderRadius: m.out ? "12px 12px 4px 12px" : "12px 12px 12px 4px", padding: "8px 11px", fontSize: 13.5, wordBreak: "break-word" }}>
                      {m.text || (m.media ? "📎 Fayl" : "")}
                      <div style={{ fontSize: 11, color: THEME.dim, marginTop: 3 }}>{m.out ? "Siz · " : ""}{new Date(m.date).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  ))}
                  {onChat && <button type="button" onClick={onChat} style={{ alignSelf: "flex-start", border: 0, background: "none", padding: 0, color: THEME.blue, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 2 }}>Butun yozishmani ochish →</button>}
                </div>}
            </>
          )}
        </div>
      </aside>
      <style>{LEAD_PANEL_CSS()}</style>
    </>
  );
}

const LEAD_PANEL_CSS = () => `
  .uvix-lp-scrim { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,${THEME.isDark ? 0.45 : 0.18}); animation: uvixLpFade .18s ease; }
  .uvix-lp { position: fixed; top: 0; right: 0; bottom: 0; z-index: 201; width: min(440px, 100vw); background: ${THEME.card}; color: ${THEME.text};
    box-shadow: -14px 0 40px rgba(0,0,0,${THEME.isDark ? 0.5 : 0.12}); display: flex; flex-direction: column; animation: uvixLpIn .24s cubic-bezier(.2,.8,.2,1);
    padding-top: env(safe-area-inset-top, 0px); }
  .uvix-lp.is-phone { top: auto; left: 0; width: 100%; height: 92vh; height: 92dvh; border-radius: 18px 18px 0 0; animation-name: uvixLpUp; padding-top: 0; padding-bottom: env(safe-area-inset-bottom, 0px); }
  .uvix-lp.is-phone .uvix-lp-acts { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .uvix-lp.is-phone .uvix-lp-acts > * { justify-content: center; height: 40px !important; }
  .uvix-lp-ic { width: 30px; height: 30px; border: 0; border-radius: 8px; background: none; color: ${THEME.muted}; display: grid; place-items: center; cursor: pointer; }
  .uvix-lp-ic:hover { background: ${THEME.hover}; color: ${THEME.text}; }
  .uvix-lp-ic.danger:hover { color: ${THEME.rose}; }
  @keyframes uvixLpIn { from { transform: translateX(100%); } }
  @keyframes uvixLpUp { from { transform: translateY(100%); } }
  @keyframes uvixLpFade { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .uvix-lp, .uvix-lp-scrim { animation: none; } }
`;
