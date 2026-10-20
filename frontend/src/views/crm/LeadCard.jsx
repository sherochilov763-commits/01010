// LeadCard.jsx — CRM voronkasidagi lid kartasi (eskiz 38 + 41; Pipedrive/Kommo/Linear g'oyalari):
// yo'nalish rangli chap chekka · muhimlik belgisi · nom + telefon · mas'ul avatari · summa + yo'nalish ·
// ish bosqichi + to'lov % · keyingi ish (yashil / qizil kechikdi / sariq yo'q) · bosqichda necha kun · manba ikonka.
import { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, CalendarCheck, Check, Hourglass, MessageCircle, Package, Pencil, Phone, Ruler, Trash2 } from "lucide-react";
import { LINE_META, lineColor } from "../../lib/lines.js";
import { PROD_LABEL, PROD_STAGES, prodColors } from "../../lib/production.js";
import { orderTotalPaid } from "../../lib/finance.js";
import { localDateStr, money } from "../../lib/format.js";
import { PRIORITIES, avatarOf, daysInStage, nextActivity, priorityOf, stageAgeLevel } from "../../lib/leadPriority.js";
import { isAutoTgNote, sourceMeta } from "../../components/LeadSource.jsx";
import { TaskChips } from "./TaskAssignModal.jsx";
import { THEME } from "../../theme.js";

const JOB_SHORT = { measure: "o'lchov", install: "montaj", deliver: "yetkazish", other: "vazifa" };
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
function dealOf(lead, orders) {
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

export function LeadCard({ lead, line, showLine, orders, jobs, employees, compact, dragging, first, last, menuOpen, onMenu, onPriority,
  onDragStart, onDragEnd, onHover, onEdit, onDelete, onMove, onJob, onChat, onCreateOrder, onAssignTask, telHref }) {
  const p = priorityOf(lead);
  const urgent = p === "urgent";
  const lc = lineColor(line, THEME.isDark);
  const av = lead.manager ? avatarOf(lead.manager) : null;
  const deal = dealOf(lead, orders);
  const act0 = nextActivity(lead, jobs);
  // Buyurtmalari ishlab chiqarishda bo'lsa — «keyingi qadam yo'q» emas (ish ketyapti)
  const act = act0.state === "none" && deal && deal.done < deal.list.length ? { ...act0, state: "busy" } : act0;
  const days = daysInStage(lead);
  const age = stageAgeLevel(days);
  const src = sourceMeta(lead.source);
  const SrcIcon = src?.icon;
  const note = lead.notes && !isAutoTgNote(lead) ? lead.notes : "";
  const closed = lead.stage === "won" || lead.stage === "lost";
  const q = lead.quote?.status === "open" ? lead.quote : null;

  const actView = (() => {
    if (closed) return null;
    const t = localDateStr(new Date()), tm = localDateStr(new Date(Date.now() + 864e5));
    if (act.state === "late" || act.state === "planned") {
      const j = act.job;
      const day = !j.date ? "sanasiz" : j.date === t ? "Bugun" : j.date === tm ? "Ertaga" : j.date.slice(5).split("-").reverse().join(".");
      const who = j.assignees?.length ? ` · ${j.assignees[0].name.split(" ")[0]}` : "";
      const late = act.state === "late";
      return (
        <span data-testid="lead-next-job" data-act={act.state} title={late ? "Vazifa muddati o'tib ketdi" : "Rejalashtirilgan keyingi ish"}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: late ? THEME.rose : THEME.greenText, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {late ? <AlertCircle size={13} style={{ flexShrink: 0 }} /> : <CalendarCheck size={13} style={{ flexShrink: 0 }} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{late ? `Kechikdi${act.lateDays ? ` ${act.lateDays} kun` : ""} · ${JOB_SHORT[j.kind] || "vazifa"}` : `${day}${j.time ? ` ${j.time}` : ""} ${JOB_SHORT[j.kind] || "vazifa"}`}{who}{act.more > 0 ? ` (+${act.more})` : ""}</span>
        </span>
      );
    }
    if (act.state === "busy") return null;
    return <span data-act="none" title="Keyingi qadam rejalashtirilmagan — o'lchov, qo'ng'iroq yoki vazifa qo'shing" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: THEME.amber, whiteSpace: "nowrap", minWidth: 0, overflow: "hidden" }}><AlertTriangle size={13} style={{ flexShrink: 0 }} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>Qadam yo'q</span></span>;
  })();

  return (
    <div className="uvix-lead-card" data-lead={lead.id} data-priority={p} draggable tabIndex={0}
      onDragStart={onDragStart} onDragEnd={onDragEnd} onDoubleClick={onEdit}
      onMouseEnter={() => onHover(lead.id)} onFocus={() => onHover(lead.id)}
      title={lead.phone ? `${lead.customer} · ${lead.phone}` : lead.customer}
      style={{
        position: "relative", background: THEME.card, borderRadius: 9, outline: "none",
        border: `1px solid ${urgent ? THEME.rose : THEME.border}`,
        boxShadow: `inset 3px 0 0 ${lc}${urgent ? `, 0 0 0 1px ${THEME.rose}55` : ""}`,
        padding: compact ? "8px 10px 8px 13px" : "10px 12px 10px 14px", display: "flex", flexDirection: "column", gap: compact ? 3 : 6,
        cursor: "grab", opacity: dragging ? 0.4 : 1, transition: "opacity 0.15s ease, border-color .15s ease",
      }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
        <button type="button" data-testid="priority-btn" onClick={(e) => { e.stopPropagation(); onMenu(menuOpen ? null : lead.id); }} onDoubleClick={(e) => e.stopPropagation()}
          title={`Muhimlik: ${PRIORITIES.find((x) => x.key === p).label} (1–4 tugmasi)`} aria-label="Muhimlik"
          style={{ border: 0, background: "none", padding: 0, marginTop: 1, cursor: "pointer", display: "inline-flex", flexShrink: 0 }}>
          <PriorityIcon p={p} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.customer}</div>
          {!compact && lead.phone && <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>{lead.phone}</div>}
        </div>
        {av && <span title={`Mas'ul: ${lead.manager}`} className="uvix-lead-mgr" style={{ width: 24, height: 24, borderRadius: "50%", background: av.color, color: "#fff", fontSize: 9.5, fontWeight: 800, display: "grid", placeItems: "center", flexShrink: 0, letterSpacing: 0.3 }}>{av.text}</span>}
      </div>
      {menuOpen && <PriorityMenu value={p} onPick={(k) => { onPriority(k); onMenu(null); }} onClose={() => onMenu(null)} />}
      {!compact && (p === "urgent" || p === "high") && (
        <span data-testid="priority-label" style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, color: urgent ? THEME.rose : THEME.text, background: urgent ? THEME.roseBg : THEME.chip, borderRadius: 5, padding: "1px 7px" }}>{urgent ? "Shoshilinch" : "Yuqori"}</span>
      )}
      {(lead.estimatedValue > 0 || showLine) && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
          {lead.estimatedValue > 0 && <><b style={{ fontSize: 14.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtNum(lead.estimatedValue)}</b><span style={{ fontSize: 11.5, color: THEME.muted }}>so'm</span></>}
          {showLine && <span data-testid="lead-line-tag" title={LINE_META[line]?.name} style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: lc, letterSpacing: 0.3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line === "UVONYX" ? "ONYX" : "UVIX"}</span>}
        </div>
      )}
      {!compact && <>
        {note && <div style={{ fontSize: 12, color: THEME.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note}</div>}
        {deal ? (
          <div data-testid="deal-progress" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexWrap: "wrap" }} title={deal.list.map((o) => `${o.orderNumber} — ${PROD_LABEL[o.prodStage] || "Navbatda"}`).join("\n")}>
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
        ) : (q || ["design", "printing", "ready"].includes(lead.stage)) && (
          <button type="button" onClick={onCreateOrder} className="uvix-lead-cta" data-testid="lead-quote-cta"
            style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, border: 0, background: "none", padding: 0, color: THEME.violet, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            <Package size={13} /> {q ? `Smeta ${q.no} · ${money(q.total)} — to'lov` : "Smeta / buyurtma"}
          </button>
        )}
        <TaskChips lead={lead} employees={employees} compact onOpen={onAssignTask} />
        {(actView || days != null || src) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {actView}
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {!closed && days != null && days >= 1 && (
                <span data-testid={age ? "stale-badge" : "stage-days"} title="Shu bosqichda necha kundan beri turibdi"
                  style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, fontWeight: 600, color: age === "danger" ? THEME.rose : age === "warn" ? THEME.amber : THEME.dim, fontVariantNumeric: "tabular-nums" }}>
                  <Hourglass size={11} />{days} kun
                </span>
              )}
              {src && <span data-testid="source-chip" title={`Manba: ${src.text}`} style={{ width: 18, height: 18, borderRadius: 5, background: `${src.color}1C`, color: src.color, display: "inline-grid", placeItems: "center" }}><SrcIcon size={10.5} strokeWidth={2.4} /></span>}
            </span>
          </div>
        )}
      </>}
      <div className="uvix-lead-actions" onDoubleClick={(e) => e.stopPropagation()}>
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
    </div>
  );
}
