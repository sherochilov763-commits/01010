// LeadPanel.jsx — lid kartasi bosilganda ochiladigan panel (eskiz 86, HubSpot uslubi):
// kompyuterda o'ngdan, telefonda pastdan. Tepada: raqam/bosqich, mijoz, ish nomi, tez amallar
// (Qo'ng'iroq · Telegram · Smeta · Buyurtma · Vazifa); ostida «maydon: qiymat» ro'yxati va oxirgi xabarlar.
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, Check, Plus, ChevronDown, Copy, ExternalLink, FileText, MessageCircle, Package, Pencil, Phone, Send, Trash2, X } from "lucide-react";
import { THEME } from "../../theme.js";
import { money } from "../../lib/format.js";
import { LINE_META, lineColor } from "../../lib/lines.js";
import { PROD_LABEL } from "../../lib/production.js";
import { PRIORITIES, avatarOf, nextActivity, openJobsOf, priorityOf } from "../../lib/leadPriority.js";
import { sourceMeta } from "../../components/LeadSource.jsx";
import { useBackToClose } from "../../lib/history.js";
import { FilesCard, TaskCards, roomTasks } from "../../components/TaskRoom.jsx";
import { TeamChat } from "../../components/TeamChat.jsx";
import { C } from "./chatPalette.js";
import { fetchTeamThreads } from "../../storage.js";
import { JOB_SHORT, PriorityIcon, agoLabel, deadlineInfo, dealOf, fullDate, leadTitle } from "./LeadCard.jsx";

function telegramLink(lead) {
  if (lead.telegramUsername) return `https://t.me/${lead.telegramUsername.replace(/^@/, "")}`;
  const digits = (lead.phone || "").replace(/\D/g, "");
  return digits.length >= 9 ? `https://t.me/+${digits.length === 9 ? "998" + digits : digits}` : null;
}
const telHref = (phone) => { const d = (phone || "").replace(/[^\d+]/g, ""); return d ? `tel:${d}` : null; };

export function LeadPanel({ lead, sig = {}, stages, orders, jobs, phone, onClose, onEdit, onDelete, onMoveTo, onPriority, onJob, onChat, onCreateOrder, onOpenOrder, onFetchMessages, onSendMessage = null, me = null, employees = [], onEditTask = null }) {
  // 131-B: pastdan suzib chiqadigan panel — chapda lid, o'rtada yozishmalar (tablar), o'ngda vazifa/buyurtma/fayllar
  const [shown, setShown] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); return () => cancelAnimationFrame(r); }, []);
  const close = useCallback(() => { setShown(false); setTimeout(onClose, 240); }, [onClose]);
  useBackToClose(true, close);
  const wide = useWide(1200);
  const [msgs, setMsgs] = useState(null);
  const [copied, setCopied] = useState(false);
  // Tablar: kompyuterda o'rta ustun (team | tg | hist); telefonda hammasi (info | team | tg | tasks)
  const [tab, setTab] = useState(phone ? "info" : "team");
  const [team, setTeam] = useState({ n: 0, unread: 0 });
  const [files, setFiles] = useState([]);
  const thread = `l:${lead.id}`;
  useEffect(() => {
    setTab(phone ? "info" : "team"); setTeam({ n: 0, unread: 0 }); setFiles([]);
    let off = false;
    fetchTeamThreads([thread]).then((t) => { if (!off && t[thread]) setTeam(t[thread]); }).catch(() => {});
    return () => { off = true; };
  }, [thread]);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape" && !document.querySelector(".uvix-modal-panel")) { e.stopPropagation(); close(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [close]);
  useEffect(() => {
    setMsgs(null);
    if (!lead.telegramChatId || !onFetchMessages) return undefined;
    let off = false;
    onFetchMessages(lead.telegramChatId).then((m) => { if (!off) setMsgs(m || []); }).catch(() => { if (!off) setMsgs([]); });
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
    ["Muddat (mijoz bilan)", (() => {
      const d = deadlineInfo(lead.deadline);
      if (!d) return <span style={{ color: THEME.dim }}>kiritilmagan</span>;
      const c = d.tone === "late" ? THEME.rose : d.tone === "soon" ? THEME.amber : null;
      return <span data-testid="lp-deadline"><b style={c ? { color: c } : undefined}>{d.full}</b> <span style={{ color: c || THEME.muted }}>· {d.left}</span></span>;
    })(), "deadline"],
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

  // Vazifalar: lidning dizayn/pechati (yoki liddan yaratilgan buyurtmaniki)
  const linkedOrder = (orders || []).find((o) => o && !o.deletedAt && o.leadId === lead.id && (o.design || o.print));
  const taskSrc = lead.design || lead.print ? lead : linkedOrder || lead;
  const tasks = roomTasks(taskSrc, employees, { customer: lead.customer || "Mijoz", promise: lead.deadline || null })
    .map((t) => ({ ...t, title: t.kind === "print" ? "bosma" : "maket", onEdit: taskSrc === lead && onEditTask ? () => onEditTask(t.kind) : null }));
  const jobsOpen = openJobsOf(lead, jobs);
  const secLbl = { fontSize: 11.5, fontWeight: 700, color: THEME.muted, letterSpacing: 0.5, margin: "4px 2px 0" };
  const box = { background: THEME.card, borderRadius: 12, border: `1px solid ${THEME.borderSoft}`, padding: "14px 16px", fontSize: 13.5 };
  const linkBtn = { border: 0, background: "none", padding: 0, color: THEME.blue, fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, textAlign: "left" };

  const header = (
    <div style={{ padding: phone ? "10px 16px 13px" : "16px 18px 14px", borderBottom: `1px solid ${THEME.border}` }}>
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
          <button type="button" onClick={close} title="Yopish (Esc)" aria-label="Yopish" data-testid="lead-panel-close" className="uvix-lp-ic"><X size={17} /></button>
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
      </div>
    </div>
  );
  const info = (
    <div data-testid="lead-panel-info" style={{ padding: "2px 18px 14px" }}>
      {rows.map(([k, v, tid]) => (
        <div key={k} data-testid={tid ? `lead-panel-${tid}` : undefined} style={{ display: "flex", gap: 12, padding: "9px 0", borderBottom: `1px solid ${THEME.borderSoft}`, fontSize: 13.5, alignItems: "flex-start" }}>
          <span style={{ width: phone ? 118 : 132, flexShrink: 0, color: THEME.muted }}>{k}</span>
          <span style={{ minWidth: 0, flex: 1, color: THEME.text, wordBreak: "break-word" }}>{v}</span>
        </div>
      ))}
    </div>
  );
  // O'ng ustun: vazifalar, buyurtmalar, fayllar
  const side = (
    <div data-testid="lead-panel-side" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={secLbl}>VAZIFALAR</span>
        {/* vazifa qo'shish faqat shu yerda — kompyuter va telefonda bir xil (135-eskiz, A) */}
        <button type="button" onClick={onJob} data-act="job" data-testid="side-add-job" title="O'lchov, montaj yoki boshqa vazifa" style={{ ...linkBtn, fontSize: 13, height: 28, padding: "0 10px", borderRadius: 8, background: `${THEME.blue}12` }}><Plus size={14} />Vazifa</button>
      </div>
      {tasks.map((t) => <TaskCards key={t.kind} t={t} />)}
      {jobsOpen.length > 0 && (
        <div style={{ ...box, display: "flex", flexDirection: "column", gap: 8 }} data-testid="lead-panel-jobs">
          {jobsOpen.map((j) => (
            <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CalendarClock size={15} style={{ color: THEME.blue, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}><b style={{ fontWeight: 600 }}>{JOB_SHORT[j.kind] || "Vazifa"}</b> · {j.date ? j.date.split("-").reverse().join(".") : "sanasiz"}{j.time ? ` ${j.time}` : ""}{j.assignees?.length ? <span style={{ color: THEME.muted }}> · {j.assignees.map((x) => x.name.split(" ")[0]).join(", ")}</span> : null}</span>
            </div>
          ))}
        </div>
      )}
      {!tasks.length && !jobsOpen.length && <div style={{ ...box, color: THEME.muted }}>Hali vazifa yo'q</div>}
      {/* O'lchov/boshqa vazifa — tepadagi «Vazifa» tugmasida (takrorlanmasin) */}
      {!tasks.length && onEditTask && <div style={{ padding: "0 2px" }}><button type="button" data-testid="room-assign" onClick={() => onEditTask("design")} style={linkBtn}><Pencil size={14} />Dizaynerga vazifa berish</button></div>}
      <div style={{ ...secLbl, marginTop: 8 }}>BUYURTMALAR</div>
      <div style={{ ...box, display: "flex", flexDirection: "column", gap: 8 }}>
        {deal ? deal.list.map((o) => (
          <button key={o.id} type="button" onClick={() => onOpenOrder?.(o)} style={{ ...linkBtn, justifyContent: "space-between", width: "100%" }}>
            <span><Package size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{o.orderNumber} · <span style={{ color: THEME.muted, fontWeight: 500 }}>{PROD_LABEL[o.prodStage] || "Navbatda"}</span></span>
            {Number(o.agreementUzs) > 0 && <span style={{ color: THEME.text }}>{money(o.agreementUzs)}</span>}
          </button>
        )) : <span style={{ color: THEME.muted }}>Hali yo'q{lead.quote?.status === "open" ? ` · smeta ${lead.quote.no} tayyor` : " — «Smeta» orqali yaratiladi"}</span>}
      </div>
      <FilesCard files={files} />
    </div>
  );
  const onTeamData = (d) => { setFiles((d.messages || []).filter((m) => m.file).slice().reverse()); setTeam((t) => ({ ...t, n: (d.messages || []).filter((m) => m.kind === "msg").length })); };
  const teamPane = <TeamChat bare thread={thread} me={me} onData={onTeamData} />;
  const tgPane = <ClientChat lead={lead} msgs={msgs} setMsgs={setMsgs} onSend={onSendMessage} onOpenFull={onChat} tgLink={tg} />;
  const histPane = <LeadHistory lead={lead} />;
  const TABS = [
    ...(phone ? [["info", "Ma'lumot"]] : []),
    ["team", phone ? "Muhokama" : "Muhokama (jamoa)", team.n],
    ["tg", phone ? "Telegram" : "Telegram (mijoz)"],
    phone ? ["tasks", "Vazifa"] : ["hist", "Tarix"],
  ];
  const tabBar = (
    <div role="tablist" data-testid="lead-panel-tabs" style={{ display: "flex", gap: phone ? 16 : 22, padding: phone ? "0 16px" : "0 20px", background: THEME.card, borderBottom: `1px solid ${THEME.border}`, flexShrink: 0, overflowX: "auto" }}>
      {TABS.map(([v, l, n]) => (
        <button key={v} type="button" role="tab" aria-selected={tab === v} data-tab={v} onClick={() => { setTab(v); if (v === "team") setTeam((t) => ({ ...t, unread: 0 })); }}
          style={{ border: 0, background: "none", padding: "12px 2px 10px", borderBottom: `2.5px solid ${tab === v ? THEME.text : "transparent"}`, color: tab === v ? THEME.text : THEME.muted, fontWeight: tab === v ? 700 : 600, fontSize: 14, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          {l}{n ? <span style={{ color: THEME.muted, fontWeight: 600 }}>· {n}</span> : null}
          {v === "team" && team.unread > 0 && tab !== "team" && <span data-testid="team-unread" style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: THEME.rose, color: "#fff", fontSize: 11, fontWeight: 700, display: "inline-grid", placeItems: "center" }}>{team.unread}</span>}
        </button>
      ))}
    </div>
  );
  const pane = tab === "tg" ? tgPane : tab === "hist" ? histPane : tab === "team" ? teamPane : null;

  return (
    <>
      <div className={`uvix-lp-scrim${shown ? " is-in" : ""}`} onClick={close} />
      {!phone && <button type="button" onClick={close} aria-label="Yopish" className={`uvix-lp-x${shown ? " is-in" : ""}`}><X size={19} /></button>}
      <aside className={`uvix-lp ${phone ? "is-phone" : ""}${shown ? " is-in" : ""}`} role="dialog" aria-modal="true" aria-label={`Lid: ${lead.customer}`} data-testid="lead-panel" data-lead-panel={lead.id}>
        {phone ? (
          <>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: THEME.border2, margin: "8px auto 0", flexShrink: 0 }} />
            {header}
            {tabBar}
            {tab === "info" && <div style={{ flex: 1, overflowY: "auto", background: THEME.card }}>{info}</div>}
            {tab === "tasks" && <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>{side}</div>}
            {pane && <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{pane}</div>}
            {/* fayllar ro'yxati uchun jamoa chati yuklanib turadi */}
            {tab !== "team" && <div style={{ display: "none" }}><TeamChat bare thread={thread} me={me} onData={onTeamData} /></div>}
          </>
        ) : (
          <>
            <div className="uvix-scroll" style={{ width: 380, flexShrink: 0, overflowY: "auto", background: THEME.card, borderRight: `1px solid ${THEME.border}` }}>
              {header}
              {info}
              {!wide && <div style={{ padding: "0 14px 16px", background: THEME.surface, paddingTop: 12 }}>{side}</div>}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: C.bg }}>
              {tabBar}
              {pane}
              {tab !== "team" && <div style={{ display: "none" }}><TeamChat bare thread={thread} me={me} onData={onTeamData} /></div>}
            </div>
            {wide && <div className="uvix-scroll" style={{ width: 340, flexShrink: 0, overflowY: "auto", padding: 14, borderLeft: `1px solid ${THEME.border}` }}>{side}</div>}
          </>
        )}
      </aside>
      <style>{LEAD_PANEL_CSS()}</style>
    </>
  );
}

function useWide(min) {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth));
  useEffect(() => { const on = () => setW(window.innerWidth); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return w >= min;
}
const dt = (iso) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// «Telegram (mijoz)» tabi — mijoz bilan yozishma shu yerning o'zida
function ClientChat({ lead, msgs, setMsgs, onSend, onOpenFull, tgLink }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const listRef = useRef(null);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [msgs]);
  if (!lead.telegramChatId) {
    return (
      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24, textAlign: "center", color: C.muted, fontSize: 13.5 }}>
        <div>Bu lid Telegram chatiga ulanmagan.{tgLink && <><br /><a href={tgLink} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, fontWeight: 600 }}>Telegram'da ochish →</a></>}</div>
      </div>
    );
  }
  async function send() {
    const t = text.trim();
    if (!t || busy || !onSend) return;
    setBusy(true); setErr("");
    try { await onSend(lead.telegramChatId, t); setText(""); setMsgs((m) => [...(m || []), { id: `l${Date.now()}`, text: t, out: true, date: new Date().toISOString() }]); }
    catch (e) { setErr(e?.message || "Yuborilmadi"); } finally { setBusy(false); }
  }
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div ref={listRef} className="uvix-scroll" data-testid="lead-panel-msgs" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: 14 }}>
        {onOpenFull && <button type="button" onClick={onOpenFull} style={{ alignSelf: "center", border: 0, background: C.dayBg, color: C.blue, borderRadius: 12, padding: "4px 12px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}><ExternalLink size={13} />Chatlar bo'limida ochish</button>}
        {msgs == null ? <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 20 }}>Yuklanmoqda…</div>
          : msgs.length === 0 ? <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 20 }}>Xabar yo'q</div>
          : msgs.map((m) => (
            <div key={m.id} data-tg-msg={m.out ? "out" : "in"} style={{ alignSelf: m.out ? "flex-end" : "flex-start", maxWidth: "78%", background: m.out ? C.outBubble : C.inBubble, color: C.text, borderRadius: 14, [m.out ? "borderBottomRightRadius" : "borderBottomLeftRadius"]: 4, padding: "7px 10px", fontSize: 13.5, lineHeight: 1.4, boxShadow: "0 1px 1px rgba(0,0,0,.04)", overflowWrap: "anywhere" }}>
              <div style={{ whiteSpace: "pre-wrap" }}>{m.text || (m.media || m.mediaType ? "📎 Fayl" : "")}</div>
              <div style={{ fontSize: 10.5, color: C.outMuted, textAlign: "right", marginTop: 2 }}>{dt(m.date)}</div>
            </div>
          ))}
      </div>
      {err && <div role="alert" style={{ padding: "6px 12px", fontSize: 12.5, color: C.red }}>{err}</div>}
      {onSend && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: C.panel, borderTop: `1px solid ${C.border}` }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Mijozga yozing…" data-testid="lead-tg-input"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            style={{ flex: 1, minWidth: 0, resize: "none", border: 0, outline: "none", borderRadius: 18, background: C.bg, color: C.text, padding: "9px 14px", fontSize: 14, fontFamily: "inherit", lineHeight: 1.35, maxHeight: 120 }} />
          <button type="button" onClick={send} disabled={busy || !text.trim()} aria-label="Yuborish" data-testid="lead-tg-send"
            style={{ width: 38, height: 38, border: 0, borderRadius: "50%", background: text.trim() ? C.blue : C.overlay2, color: text.trim() ? "#fff" : C.muted, cursor: text.trim() ? "pointer" : "default", display: "grid", placeItems: "center", flexShrink: 0 }}><Send size={17} /></button>
        </div>
      )}
    </div>
  );
}

// «Tarix» tabi — lid qachon kelgan, bosqich va muhimlik o'zgarishlari
function LeadHistory({ lead }) {
  const items = [
    ...(lead.createdAt ? [{ at: lead.createdAt, text: `Lid yaratildi${lead.createdBy ? ` — ${lead.createdBy}` : ""}` }] : []),
    ...(Array.isArray(lead.history) ? lead.history : []).map((h) => ({
      at: h.at,
      text: `${h.by || ""}: ${h.kind === "priority" ? `muhimlik ${PRIORITIES.find((x) => x.key === h.from)?.label || h.from} → ${PRIORITIES.find((x) => x.key === h.to)?.label || h.to}` : `bosqich → ${h.toLabel || h.to}`}`,
    })),
  ].filter((x) => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return (
    <div className="uvix-scroll" data-testid="lead-panel-history" style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      {items.length === 0 && <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 20 }}>Tarix bo'sh</div>}
      {items.map((x, i) => (
        <div key={i} style={{ display: "flex", gap: 12, background: C.panel, borderRadius: 10, padding: "9px 12px", fontSize: 13.5, color: C.text }}>
          <span style={{ color: C.muted, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{dt(x.at)}</span>
          <span>{x.text}</span>
        </div>
      ))}
    </div>
  );
}

const LEAD_PANEL_CSS = () => `
  .uvix-lp-scrim { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0); transition: background .25s ease; }
  .uvix-lp-scrim.is-in { background: rgba(0,0,0,${THEME.isDark ? 0.55 : 0.32}); }
  .uvix-lp { position: fixed; z-index: 201; left: 64px; right: 16px; top: 24px; bottom: 0; border-radius: 14px 14px 0 0; overflow: hidden;
    background: ${THEME.surface}; color: ${THEME.text}; box-shadow: 0 -12px 48px rgba(0,0,0,.22); display: flex;
    transform: translateY(100%); transition: transform .32s cubic-bezier(.2,.8,.2,1); }
  .uvix-lp.is-in { transform: translateY(0); }
  .uvix-lp.is-phone { left: 0; right: 0; top: calc(10px + env(safe-area-inset-top, 0px)); border-radius: 16px 16px 0 0; flex-direction: column; padding-bottom: env(safe-area-inset-bottom, 0px); }
  .uvix-lp-x { position: fixed; z-index: 202; left: 14px; top: 34px; width: 38px; height: 38px; border-radius: 50%; border: 0; background: ${THEME.blue}; color: #fff; cursor: pointer;
    display: grid; place-items: center; box-shadow: 0 4px 14px rgba(0,0,0,.25); opacity: 0; transition: opacity .2s; }
  .uvix-lp-x.is-in { opacity: 1; }
  .uvix-lp.is-phone .uvix-lp-acts { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .uvix-lp.is-phone .uvix-lp-acts > * { justify-content: center; height: 40px !important; }
  .uvix-lp-ic { width: 30px; height: 30px; border: 0; border-radius: 8px; background: none; color: ${THEME.muted}; display: grid; place-items: center; cursor: pointer; }
  .uvix-lp-ic:hover { background: ${THEME.hover}; color: ${THEME.text}; }
  .uvix-lp-ic.danger:hover { color: ${THEME.rose}; }
  @media (prefers-reduced-motion: reduce) { .uvix-lp, .uvix-lp-scrim { transition: none; } }
`;
