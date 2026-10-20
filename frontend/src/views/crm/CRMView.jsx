import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Rows3, Zap } from "lucide-react";
import { Button, ConfirmDialog, Field, Incremental, Modal, getInputStyle, initials, useIsMobile } from "../../components/ui.jsx";
import { isWorkerRole, leadStagesFor } from "../../constants.js";
import { LINES, LineContext, leadLineOf, useLine } from "../../lib/lines.js";
import { LineHeader } from "../../components/LineSelector.jsx";
import { LEAD_CARD_CSS, LeadCard, PriorityIcon, leadSignals } from "./LeadCard.jsx";
import { LeadPanel } from "./LeadPanel.jsx";
import { PRIORITIES, PRIORITY_KEYS, priorityOf, sortLeads } from "../../lib/leadPriority.js";
import { fetchChatTools, fetchJobs, fetchTelegramChats } from "../../storage.js";
import { JobForm } from "../jobs/JobsView.jsx";
import { fmt, money, moneyCompact, uid } from "../../lib/format.js";
import { LeadArchive } from "./LeadArchive.jsx";
import { closedDate, inPeriod, isClosed, periodRange, periodStats } from "../../lib/leads.js";
import { PeriodPicker } from "./PeriodPicker.jsx";
import { LEAD_SOURCES, sourceMeta } from "../../components/LeadSource.jsx";

import { THEME } from "../../theme.js";

/* ---------------- PAYMENTS MODAL ---------------- */
export function LeadForm({ initial, employees, onClose, onSave, leads = [] }) {
  const [srcAll, setSrcAll] = useState(false);
  const isEdit = !!initial;
  const managerNames = employees ? employees.filter((e) => !isWorkerRole(e.role)).map((e) => e.name) : [];
  const [customer, setCustomer] = useState(initial?.customer || "");
  const [title, setTitle] = useState(initial?.jobTitle || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [source, setSource] = useState(initial?.source || "");
  const [estimatedValueStr, setEstimatedValueStr] = useState(initial?.estimatedValue != null ? fmt(initial.estimatedValue) : "");
  const [manager, setManager] = useState(initial?.manager || managerNames[0] || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [priority, setPriority] = useState(priorityOf(initial));
  const [error, setError] = useState("");
  // Yo'nalish: xodim — o'zinikida (server ham shunday yozadi); rahbar — tanlaydi
  const { line: curLine } = useLine();
  const [leadLine, setLeadLine] = useState(initial?.line || (String(initial?.telegramChatId || "").startsWith("on:") ? "UVONYX" : curLine !== "all" ? curLine : "UVIXPRINT"));

  function submit() {
    if (!customer.trim()) return setError("Mijoz ismini kiriting");
    const lead = {
      id: initial?.id || uid(),
      customer: customer.trim(),
      jobTitle: title.trim() || undefined,
      phone: phone.trim(),
      source: source.trim(),
      estimatedValue: parseInt(estimatedValueStr.replace(/\s/g, ""), 10) || 0,
      manager,
      notes: notes.trim(),
      stage: initial?.stage || "new",
      orderId: initial?.orderId || null,
      createdBy: initial?.createdBy,
      createdAt: initial?.createdAt,
      line: leadLine,
      priority: priority === "mid" ? undefined : priority,
    };
    onSave(lead, isEdit);
  }

  return (
    <Modal title={isEdit ? "Lidni tahrirlash" : "Yangi lid"} onClose={onClose} width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label="Muhimlik">
          <div role="group" data-testid="lead-priority" style={{ display: "flex", gap: 5 }}>
            {PRIORITIES.map((x) => (
              <button key={x.key} type="button" onClick={() => setPriority(x.key)} aria-pressed={priority === x.key} data-priority-opt={x.key}
                style={{ flex: 1, height: 32, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 650, fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
                  border: `1.5px solid ${priority === x.key ? (x.key === "urgent" ? THEME.rose : THEME.text) : THEME.border}`, background: priority === x.key && x.key === "urgent" ? THEME.roseBg : THEME.card, color: x.key === "urgent" && priority === x.key ? THEME.rose : THEME.text }}>
                <PriorityIcon p={x.key} size={13} />{x.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Mijoz ismi">
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} style={getInputStyle()} placeholder="Mijoz yoki kompaniya nomi" autoFocus />
        </Field>
        <Field label="Nima ish (ixtiyoriy)">
          <input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="lead-title" maxLength={80} style={getInputStyle()} placeholder="Masalan: Oniks devor, ~12 kv/m" />
        </Field>
        {curLine === "all" && !initial?.telegramChatId && (
          <Field label="Yo'nalish">
            <div role="group" data-testid="lead-line" style={{ display: "flex", gap: 6 }}>
              {["UVIXPRINT", "UVONYX"].map((l) => (
                <button key={l} type="button" onClick={() => setLeadLine(l)} aria-pressed={leadLine === l} data-line={l}
                  style={{ flex: 1, height: 34, borderRadius: 9, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12.5, border: `1.5px solid ${leadLine === l ? THEME.text : THEME.border}`, background: THEME.card, color: THEME.text }}>{l}</button>
              ))}
            </div>
          </Field>
        )}
        <Field label="Telefon">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={getInputStyle()} placeholder="+998 90 123 45 67" />
        </Field>
        <Field label="Manba (qayerdan kelgan)">
          <input value={source} onChange={(e) => setSource(e.target.value)} style={getInputStyle()} placeholder="Instagram, tavsiya, qo'ng'iroq..." />
          {(() => {
            // Ko'p ishlatiladigan manbalar oldinda; 4 tasidan boshqasi yig'ilgan («+N»), tanlangani doim ko'rinadi
            const cnt = {};
            (leads || []).forEach((l) => { const k = sourceMeta(l.source)?.key; if (k) cnt[k] = (cnt[k] || 0) + 1; });
            const sorted = LEAD_SOURCES.map((x, i) => ({ x, i })).sort((a, b) => (cnt[b.x.key] || 0) - (cnt[a.x.key] || 0) || a.i - b.i).map((v) => v.x);
            const curKey = sourceMeta(source)?.key;
            const TOP = 4;
            const shown = srcAll ? sorted : sorted.filter((x, i) => i < TOP || x.key === curKey);
            const hidden = sorted.length - shown.length;
            return (
              <div data-testid="source-chips" style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                {shown.map((x) => {
                  const Icon = x.icon;
                  const on = curKey === x.key;
                  return (
                    <button key={x.key} type="button" onClick={() => setSource(x.label)} data-source={x.key}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px 4px 4px", borderRadius: 20, cursor: "pointer", fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
                        border: `1px solid ${on ? x.color : THEME.border}`, background: on ? `${x.color}22` : "transparent", color: THEME.text }}>
                      <span style={{ width: 17, height: 17, borderRadius: "50%", background: x.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon size={10} strokeWidth={2.4} /></span>
                      {x.label}{cnt[x.key] ? <span style={{ color: THEME.dim, fontWeight: 500 }}>{cnt[x.key]}</span> : null}
                    </button>
                  );
                })}
                {(hidden > 0 || srcAll) && (
                  <button type="button" onClick={() => setSrcAll((v) => !v)} data-testid="source-more"
                    style={{ padding: "4px 10px", borderRadius: 20, cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: "inherit", border: `1px dashed ${THEME.border2}`, background: "transparent", color: THEME.violet }}>
                    {srcAll ? "Kamroq" : `+${hidden} ta`}
                  </button>
                )}
              </div>
            );
          })()}
        </Field>
        <Field label="Taxminiy summa (so'm)">
          <input value={estimatedValueStr} onChange={(e) => setEstimatedValueStr(fmt(parseInt(e.target.value.replace(/\D/g, ""), 10) || 0))} style={getInputStyle()} placeholder="0" inputMode="numeric" />
        </Field>
        <Field label="Mas'ul menejer">
          <select value={manager} onChange={(e) => setManager(e.target.value)} style={getInputStyle()}>
            {managerNames.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Izoh">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...getInputStyle(), resize: "vertical" }} placeholder="Qo'shimcha ma'lumot (ixtiyoriy)" />
        </Field>
        {isEdit && initial.history?.length > 0 && (
          <details data-testid="lead-history" style={{ fontSize: 12.5, color: THEME.muted }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Tarix ({initial.history.length})</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, maxHeight: 150, overflowY: "auto" }}>
              {initial.history.slice().reverse().map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: THEME.dim, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{new Date(h.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  <span style={{ color: THEME.text }}>{h.by}: {h.kind === "priority" ? `muhimlik ${PRIORITIES.find((x) => x.key === h.from)?.label || h.from} → ${PRIORITIES.find((x) => x.key === h.to)?.label || h.to}` : `bosqich → ${h.toLabel || h.to}`}</span>
                </div>
              ))}
            </div>
          </details>
        )}
        {error && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={submit}>Saqlash</Button>
        </div>
      </div>
    </Modal>
  );
}

export function LeadChatModal({ lead, onClose, onFetchMessages, onSendMessage }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    onFetchMessages(lead.telegramChatId)
      .then((msgs) => { if (!cancelled) setMessages(msgs); })
      .catch((e) => { if (!cancelled) setError(e?.message || "Xabarlarni yuklab bo'lmadi"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lead.telegramChatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setError("");
    const outgoing = text.trim();
    setText("");
    try {
      await onSendMessage(lead.telegramChatId, outgoing);
      setMessages((prev) => [...prev, { id: uid(), text: outgoing, out: true, date: new Date().toISOString() }]);
    } catch (e) {
      setError(e?.message || "Yuborilmadi");
      setText(outgoing);
    } finally {
      setSending(false);
    }
  }

  const subtitle = [lead.phone, lead.telegramUsername ? `@${lead.telegramUsername}` : null].filter(Boolean).join(" · ");

  return (
    <Modal
      title={
        <div>
          <div>{lead.customer}</div>
          {subtitle && <div style={{ fontSize: 11.5, fontWeight: 500, color: THEME.muted, marginTop: 2 }}>{subtitle}</div>}
        </div>
      }
      onClose={onClose}
      width={640}
    >
      <div style={{ display: "flex", flexDirection: "column", height: 560 }}>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "4px 4px 12px" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: THEME.muted, fontSize: 12.5, marginTop: 20 }}>Yuklanmoqda...</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: "center", color: THEME.muted, fontSize: 12.5, marginTop: 20 }}>Hali xabar yo'q</div>
          ) : (
            messages.map((m) => (
              <div key={m.id} style={{ alignSelf: m.out ? "flex-end" : "flex-start", maxWidth: "78%" }}>
                <div style={{
                  background: m.out ? THEME.violet : THEME.surface,
                  color: m.out ? "#fff" : THEME.text,
                  padding: "8px 12px", borderRadius: 14,
                  borderBottomRightRadius: m.out ? 4 : 14, borderBottomLeftRadius: m.out ? 14 : 4,
                  fontSize: 13, wordBreak: "break-word",
                }}>
                  {m.text}
                </div>
                <div style={{ fontSize: 10, color: THEME.muted, marginTop: 2, textAlign: m.out ? "right" : "left" }}>
                  {new Date(m.date).toLocaleString("uz-UZ", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
        {error && <div style={{ color: THEME.rose, fontSize: 11.5, marginBottom: 6 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, borderTop: `1px solid ${THEME.border}`, paddingTop: 10 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Xabar yozing..."
            style={{ ...getInputStyle(), flex: 1 }}
          />
          <Button onClick={send} disabled={sending || !text.trim()}>{sending ? "..." : "Yuborish"}</Button>
        </div>
      </div>
    </Modal>
  );
}


// «Yonma-yon»: ikki yo'nalish — ikki alohida voronka (har biri o'z bosqichlari bilan), aralashmaydi
export function CRMView(props) {
  const ctx = useLine();
  if (!ctx.split) return <CRMBoard {...props} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {LINES.map((l, i) => (
        <LineContext.Provider key={l} value={{ ...ctx, line: l, view: l, split: false, isAll: false }}>
          <div data-crm-board={l}>
            <LineHeader line={l} />
            <div style={{ border: `1px solid ${THEME.border}`, borderTop: 0, borderRadius: "0 0 12px 12px", padding: 14 }}>
              <CRMBoard {...props} quickAddNonce={i === 0 ? props.quickAddNonce : 0} />
            </div>
          </div>
        </LineContext.Provider>
      ))}
    </div>
  );
}

function CRMBoard({ quickAddNonce, onQuickAddHandled, leads: allLeads, orders, employees, currentUser, isAdmin, onSaveLead, onDeleteLead, onMoveLead, onSetPriority, onCreateOrderFromLead, onFetchTelegramMessages, onSendTelegramMessage, onAssignTask, onOpenChat, onOpenOrder }) {
  // Bosqichlar yo'nalishga qarab (UVONYX: Murojaat → O'lchov → Smeta ...); lidlar ham tanlangan yo'nalish bo'yicha
  const { line } = useLine();
  const LEAD_STAGES = leadStagesFor(line);
  const leads = useMemo(() => (line === "all" ? allLeads || [] : (allLeads || []).filter((l) => leadLineOf(l) === line)), [allLeads, line]);
  // Muhimlik: «Faqat shoshilinch» filtri, ixcham rejim (shu brauzerda eslab qolinadi), 1–4 tugmalari
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [compact, setCompact] = useState(() => { try { return localStorage.getItem("uvix:crmCompact") === "1"; } catch { return false; } });
  const toggleCompact = () => setCompact((v) => { try { localStorage.setItem("uvix:crmCompact", v ? "0" : "1"); } catch { /* */ } return !v; });
  const [menuFor, setMenuFor] = useState(null);
  const hoverRef = useRef(null);
  // Vazifalar (o'lchov, montaj): lid kartasida keyingi ish ko'rinadi; «O'lchovga yuborish»
  const [jobs, setJobs] = useState([]);
  const [jobFor, setJobFor] = useState(null);
  const loadJobs = useCallback(() => fetchJobs().then((r) => setJobs(r.jobs || [])).catch(() => {}), []);
  useEffect(() => { loadJobs(); const t = setInterval(loadJobs, 60000); return () => clearInterval(t); }, [loadJobs]);
  // Telegram chatlari: kartada «Javob kutmoqda», «yangi xabar», oxirgi faollik (Telegram ulanmagan bo'lsa — jim)
  const [chatMap, setChatMap] = useState(() => new Map());
  const [sla, setSla] = useState(15);
  const hasTg = (allLeads || []).some((l) => l.telegramChatId);
  useEffect(() => {
    if (!hasTg) return undefined;
    let off = false;
    const load = () => document.visibilityState !== "hidden" && fetchTelegramChats().then((list) => { if (!off) setChatMap(new Map((list || []).map((c) => [String(c.chatId), c]))); }).catch(() => {});
    load();
    fetchChatTools().then((d) => { if (!off && d?.config?.slaMinutes) setSla(d.config.slaMinutes); }).catch(() => {});
    const t = setInterval(load, 30000);
    return () => { off = true; clearInterval(t); };
  }, [hasTg]);
  // Mijozning boshqa buyurtmalari (qayta mijoz belgisi uchun)
  const custStats = useMemo(() => {
    const m = new Map();
    (orders || []).forEach((o) => {
      if (o.deletedAt) return;
      const k = String(o.customer || "").trim().toLowerCase();
      if (!k) return;
      if (!m.has(k)) m.set(k, { list: [] });
      m.get(k).list.push(o);
    });
    return m;
  }, [orders]);
  const sigOf = (lead) => leadSignals(lead, { chat: lead.telegramChatId ? chatMap.get(String(lead.telegramChatId)) : null, sla, custStats: custStats.get(String(lead.customer || "").trim().toLowerCase()) });
  // Lid paneli (o'ngdan / telefonda pastdan)
  const [openId, setOpenId] = useState(null);
  const openLead = openId ? (leads || []).find((l) => l.id === openId) : null;
  useEffect(() => {
    if (!onSetPriority) return undefined;
    const onKey = (e) => {
      const k = PRIORITY_KEYS[e.key];
      if (!k || e.ctrlKey || e.metaKey || e.altKey || !hoverRef.current) return;
      const el = document.activeElement;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      const lead = leads.find((l) => l.id === hoverRef.current);
      if (!lead || !document.querySelector(`[data-lead="${CSS.escape(lead.id)}"]:hover, [data-lead="${CSS.escape(lead.id)}"]:focus`)) return;
      e.preventDefault();
      onSetPriority(lead, k);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [leads, onSetPriority]);
  const [modal, setModal] = useState(null); // null | true (new) | lead (edit)
  useEffect(() => {
    if (!quickAddNonce) return;
    setTab("board");
    setModal(true);
    onQuickAddHandled?.();
  }, [quickAddNonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const [confirmDel, setConfirmDel] = useState(null);
  const [chatFor, setChatFor] = useState(null);
  // Chat tugmasi: Chatlar bo'limiga o'tib, shu mijoz suhbatini ochadi
  const openChat = (lead) => (onOpenChat ? onOpenChat(lead) : setChatFor(lead));
  const [draggedLeadId, setDraggedLeadId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const isMobile = useIsMobile();
  const [mobileStage, setMobileStage] = useState("new");

  const [tab, setTab] = useState("board"); // "board" — voronka, "archive" — arxiv
  // Davr: faqat natijalarga (yopilgan/yo'qotilgan, ko'rsatkichlar, arxiv) ta'sir qiladi; tanlov shu qurilmada eslab qolinadi
  const [periodSel, setPeriodSel] = useState(() => {
    try { return JSON.parse(localStorage.getItem("uvix_crm_period")) || { mode: "month" }; } catch { return { mode: "month" }; }
  });
  const changePeriod = (v) => { setPeriodSel(v); try { localStorage.setItem("uvix_crm_period", JSON.stringify(v)); } catch { /* */ } };
  const period = useMemo(() => periodRange(periodSel.mode, periodSel), [periodSel]);
  const ordersById = useMemo(() => new Map((orders || []).map((o) => [o.id, o])), [orders]);
  // Voronkada: barcha faol lidlar + faqat TANLANGAN DAVRDA yopilgan/yo'qotilganlar. Qolganlari — Arxivda.
  const { leadsByStage, archivedCount } = useMemo(() => {
    const map = {};
    LEAD_STAGES.forEach((s) => (map[s.key] = []));
    let archived = 0;
    (leads || []).forEach((l) => {
      if (isClosed(l) && !inPeriod(closedDate(l, ordersById), period)) { archived++; return; }
      if (map[l.stage]) map[l.stage].push(l);
      else map.new.push(l);
    });
    // Yopilganlar — eng yangisi tepada
    ["won", "lost"].forEach((k) => map[k].sort((a, b) => String(closedDate(b, ordersById) || "").localeCompare(String(closedDate(a, ordersById) || ""))));
    // Faol ustunlarda: muhimlik → kechikkan ish → summa
    Object.keys(map).forEach((k) => { if (k !== "won" && k !== "lost") map[k] = sortLeads(map[k], jobs); });
    return { leadsByStage: map, archivedCount: archived };
  }, [leads, ordersById, period, jobs]);
  const urgentCount = useMemo(() => leads.filter((l) => priorityOf(l) === "urgent" && !isClosed(l)).length, [leads]);
  const shown = (list) => (urgentOnly ? list.filter((l) => priorityOf(l) === "urgent") : list);
  const pstats = useMemo(() => periodStats(leads, ordersById, period), [leads, ordersById, period]);
  const closedTotal = (leads || []).filter(isClosed).length;

  // Har bosqich bo'yicha lidlar summasi va voronkadagi (hali yopilmagan) jami
  const stageSums = useMemo(() => {
    const m = {};
    LEAD_STAGES.forEach((s) => (m[s.key] = leadsByStage[s.key].reduce((a, l) => a + (Number(l.estimatedValue) || 0), 0)));
    return m;
  }, [leadsByStage]);
  const openStages = LEAD_STAGES.filter((s) => s.key !== "won" && s.key !== "lost");
  const pipelineSum = openStages.reduce((a, s) => a + stageSums[s.key], 0);
  const pipelineCount = openStages.reduce((a, s) => a + leadsByStage[s.key].length, 0);

  function saveLead(lead, isEdit) {
    onSaveLead(lead, isEdit);
    setModal(null);
  }
  function stageIndex(key) {
    return LEAD_STAGES.findIndex((s) => s.key === key);
  }
  function handleDragStart(e, lead) {
    setDraggedLeadId(lead.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", lead.id);
  }
  function handleDragEnd() {
    setDraggedLeadId(null);
    setDragOverStage(null);
  }
  function handleColumnDragOver(e, stageKey) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStage !== stageKey) setDragOverStage(stageKey);
  }
  function handleColumnDrop(e, stageKey) {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("text/plain") || draggedLeadId;
    const lead = (leads || []).find((l) => l.id === leadId);
    if (lead && lead.stage !== stageKey) onMoveLead(lead, stageKey);
    setDraggedLeadId(null);
    setDragOverStage(null);
  }
  function moveStage(lead, dir) {
    const idx = stageIndex(lead.stage);
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= LEAD_STAGES.length) return;
    onMoveLead(lead, LEAD_STAGES[nextIdx].key);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 9, background: THEME.chip, width: "fit-content" }} role="tablist">
        {[["board", "Voronka"], ["archive", `Arxiv${closedTotal ? ` (${closedTotal})` : ""}`]].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} data-crmtab={k} onClick={() => setTab(k)}
            style={{ padding: "6px 14px", borderRadius: 7, border: 0, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              background: tab === k ? THEME.card : "transparent", color: tab === k ? THEME.text : THEME.muted, boxShadow: tab === k ? THEME.shadowSm : "none" }}>
            {label}
          </button>
        ))}
      </div>
      {isMobile && tab === "board" && <Button onClick={() => setModal(true)} style={{ padding: "8px 12px" }}><Plus size={14} /> Yangi lid</Button>}
      </div>
      {tab === "archive" ? (
        <LeadArchive leads={leads} orders={orders} period={period} periodSel={periodSel} onPeriod={changePeriod} onReopen={(lead) => onMoveLead(lead, "new")} />
      ) : (<>
      {/* Bitta ixcham boshqaruv qatori: davr · asosiy ko'rsatkichlar · yangi lid.
          Yopilganlar summasi alohida ko'rsatilmaydi — u "Yopilgan" ustuni sarlavhasida bor. */}
      <div className="uvix-crm-toolbar" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <PeriodPicker value={periodSel} onChange={changePeriod} />
        <div data-testid="crm-stats" className="uvix-crm-stats" style={{ flex: "1 1 360px", minWidth: 0, display: "flex", alignItems: "center", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
          {[
            { label: "Voronkada", value: moneyCompact(pipelineSum), extra: `${pipelineCount} lid`, title: "Faol bosqichlardagi lidlar — davrga bog'liq emas", color: THEME.text },
            { label: "Yangi lidlar", value: String(pstats.created), extra: period.label.toLowerCase(), title: `${period.label}: shu davrda kelgan lidlar`, color: LEAD_STAGES[0].color },
            { label: "O'rtacha yopilish", value: pstats.avgDays == null ? "—" : `${pstats.avgDays} kun`, title: "Lid kelgandan yopilgunicha o'rtacha", color: THEME.text },
          ].map((c, i) => (
            <div key={c.label} title={c.title} style={{ display: "flex", flexDirection: "column", padding: i ? "0 18px" : "0 18px 0 4px", borderLeft: i ? `1px solid ${THEME.border}` : "none", whiteSpace: "nowrap", flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: THEME.muted }}>{c.label}{c.extra ? <span style={{ color: THEME.dim }}> · {c.extra}</span> : null}</span>
              <b style={{ fontSize: 17, fontWeight: 600, color: THEME.text, fontFamily: THEME.fontNum, fontVariantNumeric: "tabular-nums", letterSpacing: -0.2 }}>{c.value}</b>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: isMobile ? 0 : "auto" }}>
          <button type="button" data-testid="urgent-only" aria-pressed={urgentOnly} onClick={() => setUrgentOnly((v) => !v)} title="Faqat shoshilinch lidlar"
            style={{ height: 34, padding: "0 11px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 650, display: "inline-flex", alignItems: "center", gap: 5,
              border: `1px solid ${urgentOnly ? THEME.rose : THEME.border2}`, background: urgentOnly ? THEME.roseBg : THEME.card, color: urgentOnly ? THEME.rose : THEME.text }}>
            <Zap size={13} /> Shoshilinch{urgentCount ? <b style={{ fontSize: 11, background: THEME.rose, color: "#fff", borderRadius: 9, padding: "0 6px", lineHeight: "16px" }}>{urgentCount}</b> : null}
          </button>
          {!isMobile && <button type="button" data-testid="crm-compact" aria-pressed={compact} onClick={toggleCompact} title="Ixcham rejim: faqat nom, summa, mas'ul"
            style={{ height: 34, width: 34, borderRadius: 9, cursor: "pointer", display: "inline-grid", placeItems: "center", border: `1px solid ${compact ? THEME.text : THEME.border2}`, background: compact ? THEME.chip : THEME.card, color: THEME.text }}><Rows3 size={15} /></button>}
          {!isMobile && <Button onClick={() => setModal(true)}><Plus size={14} /> Yangi lid</Button>}
        </div>
      </div>

      {isMobile ? (
        <MobileLeadBoard
          leadsByStage={urgentOnly ? Object.fromEntries(Object.entries(leadsByStage).map(([k, v]) => [k, shown(v)])) : leadsByStage}
          onPriority={onSetPriority}
          stage={mobileStage}
          onStage={setMobileStage}
          orders={orders}
          onEdit={(lead) => setModal(lead)}
          onDelete={(lead) => setConfirmDel(lead)}
          onMove={(lead, key) => onMoveLead(lead, key)}
          onChat={onFetchTelegramMessages || onOpenChat ? openChat : null}
          onCreateOrder={onCreateOrderFromLead}
          employees={employees}
          onAssignTask={onAssignTask}
          jobs={jobs}
          sigOf={sigOf}
          onOpen={(lead) => setOpenId(lead.id)}
          showLine={line === "all"}
        />
      ) : (<>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${LEAD_STAGES.length}, minmax(210px, 1fr))`, gap: 12, overflowX: "auto", paddingBottom: 6 }} className="uvix-scroll uvix-kanban">
        {LEAD_STAGES.map((stage) => (
          <div
            key={stage.key}
            data-stage={stage.key}
            onDragOver={(e) => handleColumnDragOver(e, stage.key)}
            onDragLeave={() => setDragOverStage((prev) => (prev === stage.key ? null : prev))}
            onDrop={(e) => handleColumnDrop(e, stage.key)}
            style={{
              borderRadius: 10, minWidth: 0,
              transition: "background-color 0.15s ease, outline-color 0.15s ease",
              background: dragOverStage === stage.key ? THEME.hover : "transparent",
              outline: `1.5px dashed ${dragOverStage === stage.key ? THEME.border2 : "transparent"}`, outlineOffset: 2,
            }}
          >
            <div style={{ padding: "2px 2px 8px", marginBottom: 10, borderBottom: `2px solid ${stage.color}` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span title={stage.label} style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{stage.label}</span>
                <span style={{ fontSize: 12.5, color: THEME.dim, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{leadsByStage[stage.key].length}</span>
              </div>
              <div title={`Bosqichdagi lidlar summasi: ${money(stageSums[stage.key])}`} style={{ marginTop: 2, fontSize: 12.5, color: THEME.muted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {money(stageSums[stage.key])}
              </div>
              {(stage.key === "won" || stage.key === "lost") && (
                <button type="button" onClick={() => setTab("archive")} style={{ marginTop: 2, padding: 0, border: 0, background: "none", cursor: "pointer", fontSize: 12, color: THEME.dim, fontFamily: "inherit" }}>
                  {period.label} · {archivedCount ? "qolganlari Arxivda →" : "Arxiv →"}
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
              {shown(leadsByStage[stage.key]).length === 0 ? (
                <div style={{ fontSize: 12.5, color: THEME.dim, padding: "16px 0", textAlign: "center", border: `1px dashed ${THEME.border2}`, borderRadius: 8 }}>Bo'sh</div>
              ) : (
                <Incremental list={shown(leadsByStage[stage.key])} step={25} render={(lead) => {
                  const idx = stageIndex(lead.stage);
                  return (
                    <LeadCard key={lead.id} lead={lead} line={leadLineOf(lead)} showLine={line === "all"} orders={orders} jobs={jobs} employees={employees} compact={compact}
                      sig={sigOf(lead)} selected={openId === lead.id} onOpen={() => setOpenId(lead.id)}
                      dragging={draggedLeadId === lead.id} first={idx === 0} last={idx === LEAD_STAGES.length - 1}
                      menuOpen={menuFor === lead.id} onMenu={setMenuFor} onPriority={(k) => onSetPriority?.(lead, k)}
                      onHover={(id) => { hoverRef.current = id; }}
                      onDragStart={(e) => handleDragStart(e, lead)} onDragEnd={handleDragEnd}
                      onEdit={() => setModal(lead)} onDelete={() => setConfirmDel(lead)} onMove={(d) => moveStage(lead, d)} onJob={() => setJobFor(lead)}
                      onChat={lead.telegramChatId && onFetchTelegramMessages ? () => openChat(lead) : null} telHref={telLink(lead.phone)}
                      onCreateOrder={() => onCreateOrderFromLead(lead)} onAssignTask={onAssignTask ? (kind) => onAssignTask(lead, kind) : null} />
                  );
                }} />
              )}
              {stage.key === "new" && (
                <button type="button" onClick={() => setModal(true)} style={{ height: 34, border: `1px dashed ${THEME.border2}`, borderRadius: 8, background: "transparent", color: THEME.dim, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>+ Lid qo'shish</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <style>{LEAD_CARD_CSS() + `
        .uvix-lead-actions { position: absolute; top: 6px; right: 6px; display: flex; gap: 2px; padding: 2px; border-radius: 7px; background: ${THEME.card}; border: 1px solid ${THEME.border}; box-shadow: ${THEME.shadowMd}; opacity: 0; pointer-events: none; transition: opacity .12s ease; }
        .uvix-lead-card:hover .uvix-lead-actions, .uvix-lead-card:focus-within .uvix-lead-actions { opacity: 1; pointer-events: auto; }
        .uvix-lead-actions button, .uvix-lead-actions a { width: 26px; height: 26px; border: 0; border-radius: 5px; background: none; color: ${THEME.muted}; display: grid; place-items: center; cursor: pointer; padding: 0; }
        .uvix-lead-actions button:hover:not(:disabled), .uvix-lead-actions a:hover { background: ${THEME.hover}; color: ${THEME.text}; }
        .uvix-lead-actions button:disabled { opacity: .3; cursor: default; }
        .uvix-lead-actions .danger:hover { color: ${THEME.rose} !important; }
        @media (hover: none) { .uvix-lead-actions { position: static; opacity: 1; pointer-events: auto; box-shadow: none; border: 0; padding: 0; margin-top: 2px; justify-content: flex-end; } }
      `}</style>
      </>      )}
      </>)}

      {openLead && (
        <LeadPanel lead={openLead} sig={sigOf(openLead)} stages={LEAD_STAGES} orders={orders} jobs={jobs} phone={isMobile}
          onClose={() => setOpenId(null)}
          onEdit={() => setModal(openLead)}
          onDelete={() => setConfirmDel(openLead)}
          onMoveTo={(k) => k !== openLead.stage && onMoveLead(openLead, k)}
          onPriority={onSetPriority ? (k) => onSetPriority(openLead, k) : null}
          onJob={() => setJobFor(openLead)}
          onChat={openLead.telegramChatId && (onFetchTelegramMessages || onOpenChat) ? () => openChat(openLead) : null}
          onCreateOrder={() => onCreateOrderFromLead(openLead)}
          onOpenOrder={onOpenOrder}
          onFetchMessages={onFetchTelegramMessages} />
      )}
      {jobFor && <JobForm job={null} preset={{ kind: "measure", leadId: jobFor.id, line: jobFor.line, title: `${jobFor.customer} — o'lchov`, phone: jobFor.phone || "" }} employees={employees} orders={orders} onClose={() => setJobFor(null)} onSaved={() => { setJobFor(null); loadJobs(); }} />}
      {modal && (
        <LeadForm
          initial={modal === true ? null : modal}
          employees={employees}
          leads={leads}
          onClose={() => setModal(null)}
          onSave={saveLead}
        />
      )}
      {confirmDel && (
        <ConfirmDialog
          message={`"${confirmDel.customer}" lidini o'chirmoqchimisiz?`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { onDeleteLead(confirmDel); if (openId === confirmDel.id) setOpenId(null); setConfirmDel(null); }}
        />
      )}
      {chatFor && (
        <LeadChatModal
          lead={chatFor}
          onClose={() => setChatFor(null)}
          onFetchMessages={onFetchTelegramMessages}
          onSendMessage={onSendTelegramMessage}
        />
      )}
    </div>
  );
}

/* ---------------- CRM — TELEFON KO'RINISHI ---------------- */
// Doskaning 4 ustuni telefonga sig'maydi: bosqichlar tab ko'rinishida, lidlar esa vertikal ro'yxatda.
function telLink(phone) {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

function MobileLeadBoard({ leadsByStage, stage, onStage, orders, employees, onAssignTask, onPriority, jobs, sigOf, onOpen, showLine, onCreateOrder }) {
  const [menuFor, setMenuFor] = useState(null);
  const LEAD_STAGES = leadStagesFor(useLine().line);
  const list = leadsByStage[stage] || [];
  const total = list.reduce((s, l) => s + (Number(l.estimatedValue) || 0), 0);
  const stageInfo = LEAD_STAGES.find((s) => s.key === stage) || LEAD_STAGES[0];

  return (
    <div>
      <div role="tablist" aria-label="Savdo bosqichlari" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -16px", padding: "2px 16px 4px", scrollbarWidth: "none" }}>
        {LEAD_STAGES.map((s) => {
          const on = s.key === stage;
          return (
            <button key={s.key} type="button" role="tab" aria-selected={on} onClick={() => onStage(s.key)}
              style={{ height: 36, padding: "0 13px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: on ? 600 : 500,
                border: `1px solid ${on ? THEME.text : THEME.border2}`, background: on ? THEME.text : THEME.card, color: on ? THEME.card : THEME.text }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
              {s.label}
              <span style={{ fontSize: 12, opacity: 0.7, fontWeight: 600 }}>{(leadsByStage[s.key] || []).length}</span>
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 13, color: THEME.muted, margin: "12px 2px 10px" }}>
        {list.length} ta lid{total > 0 ? <> · taxminan <b style={{ color: THEME.text }}>{money(total)}</b></> : null}
      </div>

      {list.length === 0 ? (
        <div style={{ fontSize: 13.5, color: THEME.muted, padding: "32px 16px", textAlign: "center", border: `1px dashed ${THEME.border2}`, borderRadius: 10 }}>
          "{stageInfo.label}" bosqichida hozircha lid yo'q
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Incremental list={list} step={30} render={(lead) => (
            <LeadCard key={lead.id} lead={lead} line={leadLineOf(lead)} showLine={showLine} orders={orders} jobs={jobs} employees={employees} touch
              sig={sigOf(lead)} onOpen={() => onOpen(lead)}
              menuOpen={menuFor === lead.id} onMenu={setMenuFor} onPriority={(k) => onPriority?.(lead, k)}
              onCreateOrder={() => onCreateOrder(lead)} onAssignTask={onAssignTask ? (kind) => onAssignTask(lead, kind) : null} />
          )} />
        </div>
      )}
      <style>{LEAD_CARD_CSS()}</style>
    </div>
  );
}
