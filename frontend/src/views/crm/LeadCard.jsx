// LeadCard.jsx — CRM voronkasidagi lid kartasi (eskiz 85: Linear/Attio kartasi + HubSpot ichki paneli):
// 1-qator «Kelgan: bugun 09:15» · mas'ul · 2-qator «Mijoz — nima ish» · summa · «Javob kutmoqda» ·
// bir xil o'lchamdagi belgilar: muhimlik · yo'nalish · keyingi ish · yangi xabar · sovish · qayta mijoz · smeta · manba.
// Kartani bosish — o'ngdan (telefonda pastdan) lid paneli ochiladi (LeadPanel.jsx).
import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, CalendarClock, Check, FileText, MessageCircle, Pencil, Phone, Repeat, Ruler, Snowflake, Timer, Trash2 } from "lucide-react";
import { LINE_META, lineColor } from "../../lib/lines.js";
import { PROD_LABEL, PROD_STAGES, prodColors } from "../../lib/production.js";
import { orderTotalPaid } from "../../lib/finance.js";
import { localDateStr, money } from "../../lib/format.js";
import { lastActivity } from "../../lib/leads.js";
import { PRIORITIES, avatarOf, nextActivity, priorityOf } from "../../lib/leadPriority.js";
import { isAutoTgNote, sourceMeta } from "../../components/LeadSource.jsx";
import { TaskChips } from "./TaskAssignModal.jsx";
import { THEME } from "../../theme.js";

export const JOB_SHORT = { measure: "o'lchov", install: "montaj", deliver: "yetkazish", other: "vazifa" };
const fmtNum = (v) => Math.round(Number(v) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// Muhimlik belgisi: Shoshilinch — qizil «!», qolganlari — 3 ustunli signal (Linear)
export function PriorityIcon({ p, size = 16 }) {
  if (p === "urgent") return <span style={{ width: size, height: size, borderRadius: 4, background: THEME.rose, color: "#fff", display: "inline-grid", placeItems: "center", fontSize: size * 0.72, fontWeight: 900, lineHeight: 1 }}>!</span>;
  const n = p === "high" ? 3 : p === "low" ? 1 : 2;
  const c = p === "high" ? THEME.text : p === "low" ? THEME.dim : THEME.muted;
  return (
    <span style={{ width: size, height: size, display: "inline-flex", alignItems: "flex-end", justifyContent: "center", gap: 1.5, paddingBottom: 2, boxSizing: "border-box" }}>
      {[0.4, 0.7, 1].map((h, i) => <i key={i} style={{ width: size * 0.18, height: size * 0.75 * h, borderRadius: 1, background: i < n ? c : THEME.border2 }} />)}
    </span>
  );
}

export function PriorityMenu({ value, onPick, onClose, anchorRight = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);
  return (
    <div ref={ref} role="menu" data-testid="priority-menu" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", top: 28, [anchorRight ? "right" : "left"]: 4, zIndex: 40, width: 190, background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 10, boxShadow: THEME.shadowLg, padding: 4 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: THEME.dim, letterSpacing: 0.6, padding: "5px 8px 3px" }}>MUHIMLIK</div>
      {PRIORITIES.map((p, i) => (
        <button key={p.key} type="button" role="menuitem" data-priority-opt={p.key} onClick={() => onPick(p.key)}
          style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 8px", border: 0, borderRadius: 7, background: value === p.key ? THEME.hover : "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: THEME.text, textAlign: "left" }} className="uvix-row">
          <PriorityIcon p={p.key} size={15} />
          <span style={{ flex: 1, fontWeight: p.key === "urgent" ? 700 : 500 }}>{p.label}</span>
          <kbd style={{ fontSize: 10.5, color: THEME.dim, fontFamily: "inherit" }}>{i + 1}</kbd>
          {value === p.key && <Check size={13} color={THEME.green} />}
        </button>
      ))}
    </div>
  );
}

// Bitim holati: bog'langan buyurtmalarning eng orqadagi ish bosqichi + to'lov %
export function dealOf(lead, orders) {
  const ids = [...new Set([...(lead.orderIds || []), lead.orderId].filter(Boolean))];
  const list = ids.map((id) => (orders || []).find((o) => o.id === id)).filter((o) => o && !o.deletedAt);
  if (!list.length) return null;
  const idx = Math.min(...list.map((o) => Math.max(0, PROD_STAGES.indexOf(o.prodStage || "new"))));
  const stage = PROD_STAGES[idx] || "new";
  const total = list.reduce((s, o) => s + (Number(o.agreementUzs) || 0), 0);
  const paid = list.reduce((s, o) => s + orderTotalPaid(o), 0);
  const done = list.filter((o) => ["ready", "delivered"].includes(o.prodStage)).length;
  return { list, stage, total, paid, pct: total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : null, done };
}


const MON = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
const hm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
// «bugun 09:15» · «kecha 18:20» · «14-okt» · «14.10.25»
export function cameLabel(iso, now = new Date()) {
  const d = new Date(iso || 0);
  if (!iso || isNaN(d)) return null;
  const t = localDateStr(now), y = localDateStr(new Date(now.getTime() - 864e5)), ds = localDateStr(d);
  if (ds === t) return { text: `bugun ${hm(d)}`, today: true };
  if (ds === y) return { text: `kecha ${hm(d)}` };
  if (d.getFullYear() === now.getFullYear()) return { text: `${d.getDate()}-${MON[d.getMonth()]}` };
  return { text: `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}` };
}
export const fullDate = (iso) => {
  const d = new Date(iso || 0);
  if (!iso || isNaN(d)) return "—";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} · ${hm(d)}`;
};
export const agoLabel = (mins) => (mins < 60 ? `${Math.max(1, mins)} daq` : mins < 1440 ? `${Math.floor(mins / 60)} soat` : `${Math.floor(mins / 1440)} kun`);
// Lid nomi: «Nima ish» (jobTitle — dizayn/pechat vazifasidagi ish nomi bilan bir xil), bo'lmasa izohning birinchi qatori
export function leadTitle(lead) {
  const t = String(lead.jobTitle || lead.title || "").trim();
  if (t) return t;
  const n = lead.notes && !isAutoTgNote(lead) ? String(lead.notes).split("\n")[0].trim() : "";
  return n.length > 60 ? `${n.slice(0, 58)}…` : n;
}
// Chat va mijoz tarixidan signallar: javob kutmoqda, yangi xabar, sovish, qayta mijoz
export function leadSignals(lead, { chat, sla = 15, custStats, now = Date.now() } = {}) {
  const closed = lead.stage === "won" || lead.stage === "lost";
  let wait = 0;
  if (!closed && chat && !chat.lastOut && chat.lastDate && !chat.noReply) {
    const m = Math.floor((now - new Date(chat.lastDate).getTime()) / 60000);
    if (m >= sla && m < 60 * 24 * 3) wait = m;
  }
  const lastT = Math.max(lastActivity(lead) || 0, chat?.lastDate ? new Date(chat.lastDate).getTime() || 0 : 0);
  const coldDays = !closed && lastT ? Math.floor((now - lastT) / 864e5) : 0;
  const own = new Set([...(lead.orderIds || []), lead.orderId].filter(Boolean));
  const prev = custStats ? custStats.list.filter((o) => !own.has(o.id)) : [];
  return {
    wait, unread: !!chat?.unread, coldDays: coldDays >= 3 ? coldDays : 0,
    prevCount: prev.length, prevSum: prev.reduce((a, o) => a + (Number(o.agreementUzs) || 0), 0),
    chat,
  };
}

const ICE = () => (THEME.isDark ? "#22D3EE" : "#0E7490");
const chipBase = { position: "relative", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, borderRadius: 6, padding: "0 7px", lineHeight: "21px", whiteSpace: "nowrap", border: "1px solid", flexShrink: 0 };
function Chip({ tone = "plain", tip, children, testid, ...rest }) {
  const T = {
    plain: [THEME.muted, THEME.card, THEME.border],
    late: [THEME.rose, THEME.roseBg, THEME.roseBorder],
    none: [THEME.amber, THEME.amberBg, `${THEME.amber}55`],
    ok: [THEME.greenText, THEME.card, THEME.border],
    msg: ["#fff", THEME.blue, THEME.blue],
    cold: [ICE(), `${ICE()}14`, `${ICE()}55`],
    rep: [THEME.amber, THEME.amberBg, `${THEME.amber}55`],
    quote: [THEME.violet, `${THEME.violet}12`, `${THEME.violet}44`],
  }[tone];
  return <span data-tip={tip} data-testid={testid} {...rest} style={{ ...chipBase, color: T[0], background: T[1], borderColor: T[2], ...(rest.style || {}) }}>{children}</span>;
}

export function LeadCard({ lead, line, showLine, orders, jobs, employees, compact, dragging, first, last, menuOpen, onMenu, onPriority, sig = {}, selected, touch,
  onOpen, onDragStart, onDragEnd, onHover, onEdit, onDelete, onMove, onJob, onChat, onCreateOrder, onAssignTask, telHref }) {
  const p = priorityOf(lead);
  const urgent = p === "urgent";
  const lc = lineColor(line, THEME.isDark);
  const av = lead.manager ? avatarOf(lead.manager) : null;
  const deal = dealOf(lead, orders);
  const act0 = nextActivity(lead, jobs);
  // Buyurtmalari ishlab chiqarishda bo'lsa — «keyingi qadam yo'q» emas (ish ketyapti)
  const act = act0.state === "none" && deal && deal.done < deal.list.length ? { ...act0, state: "busy" } : act0;
  const src = sourceMeta(lead.source);
  const SrcIcon = src?.icon;
  const closed = lead.stage === "won" || lead.stage === "lost";
  const q = lead.quote?.status === "open" ? lead.quote : null;
  const came = cameLabel(lead.createdAt);
  const title = leadTitle(lead);
  const stop = (fn) => (e) => { e.stopPropagation(); fn?.(e); };

  const actChip = (() => {
    if (closed || act.state === "busy") return null;
    if (act.state === "late" || act.state === "planned") {
      const j = act.job;
      const t = localDateStr(new Date()), tm = localDateStr(new Date(Date.now() + 864e5));
      const day = !j.date ? "" : j.date === t ? "bugun" : j.date === tm ? "ertaga" : j.date.slice(5).split("-").reverse().join(".");
      const who = j.assignees?.length ? j.assignees[0].name.split(" ")[0] : "";
      const late = act.state === "late";
      const kind = JOB_SHORT[j.kind] || "vazifa";
      const tip = `Keyingi ish: ${kind}${who ? ` · ${who}` : ""}\n${day || "sanasiz"}${j.time ? ` ${j.time}` : ""}${late ? ` · kechikdi${act.lateDays ? ` ${act.lateDays} kun` : ""}` : ""}${act.more > 0 ? `\nYana ${act.more} ta vazifa` : ""}`;
      return (
        <Chip tone={late ? "late" : "ok"} tip={tip} testid="lead-next-job" data-act={act.state}>
          <CalendarClock size={11} />{[day, j.time].filter(Boolean).join(" ") || "sanasiz"} {kind}{act.more > 0 ? ` +${act.more}` : ""}
        </Chip>
      );
    }
    return <Chip tone="none" tip={"Keyingi ish belgilanmagan\nO'lchov, qo'ng'iroq yoki vazifa qo'shing"} data-act="none"><CalendarClock size={11} />Vazifa yo'q</Chip>;
  })();

  return (
    <div className="uvix-lead-card" data-lead={lead.id} data-priority={p} draggable={!touch} tabIndex={0} role="button" aria-label={`${lead.customer}${title ? ` — ${title}` : ""}`}
      onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) onOpen?.(); }}
      onMouseEnter={() => onHover?.(lead.id)} onFocus={() => onHover?.(lead.id)}
      style={{
        position: "relative", background: THEME.card, borderRadius: 10, outline: "none",
        border: `1px solid ${selected ? THEME.blue : urgent ? THEME.rose : THEME.border}`,
        boxShadow: selected ? `0 0 0 3px ${THEME.blue}2E` : urgent ? `0 0 0 1px ${THEME.rose}40` : THEME.shadowSm,
        padding: compact ? "8px 11px" : "10px 12px 11px", display: "flex", flexDirection: "column", gap: compact ? 4 : 7,
        cursor: "pointer", opacity: dragging ? 0.4 : 1, transition: "opacity .15s ease, border-color .15s ease, box-shadow .15s ease",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: THEME.dim, minWidth: 0 }}>
        {came && <span data-testid="lead-came" title={`Kelgan: ${fullDate(lead.createdAt)}`} style={{ fontWeight: 600, color: came.today ? THEME.greenText : THEME.muted, whiteSpace: "nowrap" }}>Kelgan: {came.text}</span>}
        {showLine && <span data-testid="lead-line-tag" title={LINE_META[line]?.name} style={{ fontSize: 10, fontWeight: 800, color: lc, letterSpacing: 0.3, whiteSpace: "nowrap" }}>· {line === "UVONYX" ? "ONYX" : "UVIX"}</span>}
        {av && <span data-tip={`Mas'ul: ${lead.manager}`} className="uvix-lead-mgr" style={{ marginLeft: "auto", width: 22, height: 22, borderRadius: "50%", background: av.color, color: "#fff", fontSize: 9, fontWeight: 800, display: "grid", placeItems: "center", flexShrink: 0, letterSpacing: 0.3, position: "relative" }}>{av.text}</span>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 650, lineHeight: 1.3, color: THEME.text, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" }}>
        {lead.customer}{title ? <span style={{ color: THEME.muted, fontWeight: 500 }}> — {title}</span> : null}
      </div>
      {lead.estimatedValue > 0 && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <b style={{ fontSize: compact ? 14 : 15.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: -0.2, whiteSpace: "nowrap" }}>{fmtNum(lead.estimatedValue)}</b><span style={{ fontSize: 11.5, color: THEME.muted }}>so'm</span>
        </div>
      )}
      {menuOpen && <PriorityMenu value={p} onPick={(k) => { onPriority(k); onMenu(null); }} onClose={() => onMenu(null)} />}
      {!compact && <>
        {sig.wait > 0 && (
          <div data-testid="lead-waiting" title="Mijoz yozgan, javob berilmagan" style={{ minWidth: 0, fontSize: 12, color: THEME.rose, fontWeight: 650, display: "flex", alignItems: "center", gap: 4, background: THEME.roseBg, borderRadius: 6, padding: "3px 7px" }}>
            <Timer size={13} style={{ flexShrink: 0 }} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Javob kutmoqda · {agoLabel(sig.wait)}</span>
          </div>
        )}
        {deal && (
          <div data-testid="deal-progress" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }} title={deal.list.map((o) => `${o.orderNumber} — ${PROD_LABEL[o.prodStage] || "Navbatda"}`).join("\n")}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 650, color: THEME.text, background: THEME.chip, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>
              <i style={{ width: 7, height: 7, borderRadius: "50%", background: deal.stage === "delivered" ? THEME.muted : prodColors(deal.stage).color }} />
              {PROD_LABEL[deal.stage] || "Navbatda"}{deal.list.length > 1 ? ` · ${deal.done}/${deal.list.length}` : ""}
            </span>
            {deal.pct != null && (
              <span data-testid="deal-pay" title={`To'langan: ${money(deal.paid)} / ${money(deal.total)}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: deal.pct >= 100 ? THEME.greenText : deal.pct >= 50 ? THEME.amber : THEME.rose }}>
                <span style={{ width: 30, height: 5, borderRadius: 3, background: THEME.chip, overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${deal.pct}%`, background: "currentColor" }} /></span>{deal.pct}%
              </span>
            )}
          </div>
        )}
        <TaskChips lead={lead} employees={employees} compact onOpen={onAssignTask} />
        <div className="uvix-lead-chips" style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", minWidth: 0 }}>
          <button type="button" data-testid="priority-btn" data-tip={`Muhimlik: ${PRIORITIES.find((x) => x.key === p).label}${touch ? "" : "\n1–4 tugmasi bilan o'zgartiring"}`} aria-label="Muhimlik"
            onClick={stop(() => onMenu?.(menuOpen ? null : lead.id))}
            style={{ position: "relative", border: 0, background: "none", padding: "0 2px 0 0", cursor: "pointer", display: "inline-flex", flexShrink: 0 }}>
            <PriorityIcon p={p} size={15} />
          </button>
          {actChip}
          {sig.unread && <Chip tone="msg" tip="Mijozdan o'qilmagan xabar bor" testid="lead-unread"><MessageCircle size={11} />yangi</Chip>}
          {sig.coldDays > 0 && !sig.wait && <Chip tone="cold" tip={`${sig.coldDays} kundan beri harakat yo'q — lid sovib qolmasin`} testid={sig.coldDays >= 14 ? "stale-badge" : "lead-cold"}><Snowflake size={11} />{sig.coldDays} kun</Chip>}
          {sig.prevCount > 0 && <Chip tone="rep" tip={`Qayta mijoz: avval ${sig.prevCount} ta buyurtma\nJami ${money(sig.prevSum)}`} testid="lead-repeat"><Repeat size={11} />{sig.prevCount + 1}-marta</Chip>}
          {!deal && q && <Chip tone="quote" tip={`Smeta ${q.no} · ${money(q.total)}\nBosing — to'lov / buyurtma`} testid="lead-quote-cta" onClick={stop(onCreateOrder)} style={{ cursor: "pointer" }}><FileText size={11} />{q.no}</Chip>}
          {src && <span data-testid="source-chip" data-tip={`Manba: ${src.text}`} style={{ position: "relative", marginLeft: "auto", width: 20, height: 20, borderRadius: 6, background: `${src.color}1C`, color: src.color, display: "inline-grid", placeItems: "center", flexShrink: 0 }}><SrcIcon size={11} strokeWidth={2.4} /></span>}
        </div>
      </>}
      {!touch && (
        <div className="uvix-lead-actions" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          {onChat ? (
            <button type="button" onClick={onChat} title="Telegram chat" aria-label="Telegram chat"><MessageCircle size={14} /></button>
          ) : telHref ? (
            <a href={telHref} title="Qo'ng'iroq" aria-label="Qo'ng'iroq"><Phone size={14} /></a>
          ) : null}
          <button type="button" onClick={() => onMove(-1)} disabled={first} title="Oldingi bosqich" aria-label="Oldingi bosqich"><ArrowLeft size={14} /></button>
          <button type="button" onClick={() => onMove(1)} disabled={last} title="Keyingi bosqich" aria-label="Keyingi bosqich"><ArrowRight size={14} /></button>
          <button type="button" onClick={onJob} title="O'lchov / vazifa" aria-label="O'lchov / vazifa" data-lead-job={lead.id}><Ruler size={14} /></button>
          <button type="button" onClick={onEdit} title="Tahrirlash" aria-label="Tahrirlash"><Pencil size={14} /></button>
          <button type="button" onClick={onDelete} title="O'chirish" aria-label="O'chirish" className="danger"><Trash2 size={14} /></button>
        </div>
      )}
    </div>
  );
}

// Belgilar izohi (sichqoncha olib borilganda) — faqat sichqonchali qurilmalarda
export const LEAD_CARD_CSS = () => `
  .uvix-lead-card:hover { border-color: ${THEME.border2}; }
  .uvix-lead-card:focus-visible { outline: 2px solid ${THEME.blue}; outline-offset: 2px; }
  @media (hover: hover) {
    .uvix-lead-card [data-tip]:hover::after { content: attr(data-tip); position: absolute; bottom: calc(100% + 7px); left: 0;
      background: ${THEME.isDark ? "#F4F4F5" : "#18181B"}; color: ${THEME.isDark ? "#18181B" : "#fff"}; font-size: 12px; font-weight: 500; line-height: 1.45; letter-spacing: 0;
      border-radius: 7px; padding: 6px 9px; white-space: pre; z-index: 30; pointer-events: none; box-shadow: 0 6px 18px rgba(0,0,0,.22); text-align: left; }
    .uvix-lead-card [data-testid=source-chip][data-tip]:hover::after { left: auto; right: -4px; transform: none; }
    .uvix-lead-card .uvix-lead-mgr[data-tip]:hover::after { left: auto; right: -4px; transform: none; bottom: auto; top: calc(100% + 7px); }
    .uvix-lead-card [data-testid=priority-btn][data-tip]:hover::after { left: -4px; transform: none; }
  }
`;
