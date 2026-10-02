import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, MessageCircle, Package, Pencil, Phone, Plus, Send, Trash2, X } from "lucide-react";
import { Button, Card, ConfirmDialog, Field, Incremental, Modal, getInputStyle, initials, useIsMobile } from "../../components/ui.jsx";
import { LEAD_STAGES, ORDER_READY_STAGES, isWorkerRole } from "../../constants.js";
import { fmt, money, moneyCompact, uid } from "../../lib/format.js";
import { TaskChips } from "./TaskAssignModal.jsx";
import { LeadArchive } from "./LeadArchive.jsx";
import { closedDate, inPeriod, isClosed, periodRange, periodStats, staleInfo } from "../../lib/leads.js";
import { PeriodPicker } from "./PeriodPicker.jsx";
import { LEAD_SOURCES, SourceChip, TgHandle, isAutoTgNote, sourceMeta } from "../../components/LeadSource.jsx";

// Faol bosqichda uzoq turib qolgan lid belgisi
function StaleBadge({ lead, big = false }) {
  const st = staleInfo(lead);
  if (!st) return null;
  const danger = st.level === "danger";
  return (
    <span data-testid="stale-badge" title="Oxirgi harakatdan beri o'tgan kun"
      style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4, fontSize: big ? 12.5 : 11.5, fontWeight: 600, padding: big ? "2px 8px" : "1px 6px", borderRadius: 6,
        color: danger ? THEME.rose : THEME.amber, background: danger ? THEME.roseBg : THEME.amberBg }}>
      {st.days} kun harakatsiz
    </span>
  );
}
import { THEME } from "../../theme.js";

/* ---------------- PAYMENTS MODAL ---------------- */
export function LeadForm({ initial, employees, onClose, onSave }) {
  const isEdit = !!initial;
  const managerNames = employees ? employees.filter((e) => !isWorkerRole(e.role)).map((e) => e.name) : [];
  const [customer, setCustomer] = useState(initial?.customer || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [source, setSource] = useState(initial?.source || "");
  const [estimatedValueStr, setEstimatedValueStr] = useState(initial?.estimatedValue != null ? fmt(initial.estimatedValue) : "");
  const [manager, setManager] = useState(initial?.manager || managerNames[0] || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [error, setError] = useState("");

  function submit() {
    if (!customer.trim()) return setError("Mijoz ismini kiriting");
    const lead = {
      id: initial?.id || uid(),
      customer: customer.trim(),
      phone: phone.trim(),
      source: source.trim(),
      estimatedValue: parseInt(estimatedValueStr.replace(/\s/g, ""), 10) || 0,
      manager,
      notes: notes.trim(),
      stage: initial?.stage || "new",
      orderId: initial?.orderId || null,
      createdBy: initial?.createdBy,
      createdAt: initial?.createdAt,
    };
    onSave(lead, isEdit);
  }

  return (
    <Modal title={isEdit ? "Lidni tahrirlash" : "Yangi lid"} onClose={onClose} width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label="Mijoz ismi">
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} style={getInputStyle()} placeholder="Mijoz yoki kompaniya nomi" autoFocus />
        </Field>
        <Field label="Telefon">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={getInputStyle()} placeholder="+998 90 123 45 67" />
        </Field>
        <Field label="Manba (qayerdan kelgan)">
          <input value={source} onChange={(e) => setSource(e.target.value)} style={getInputStyle()} placeholder="Instagram, tavsiya, qo'ng'iroq..." />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
            {LEAD_SOURCES.map((x) => {
              const Icon = x.icon;
              const on = sourceMeta(source)?.key === x.key;
              return (
                <button key={x.key} type="button" onClick={() => setSource(x.label)} data-source={x.key}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px 4px 4px", borderRadius: 20, cursor: "pointer", fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
                    border: `1px solid ${on ? x.color : THEME.border}`, background: on ? `${x.color}22` : "transparent", color: THEME.text }}>
                  <span style={{ width: 17, height: 17, borderRadius: "50%", background: x.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon size={10} strokeWidth={2.4} /></span>
                  {x.label}
                </button>
              );
            })}
          </div>
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

export function CRMView({ quickAddNonce, onQuickAddHandled, leads, orders, employees, currentUser, isAdmin, onSaveLead, onDeleteLead, onMoveLead, onCreateOrderFromLead, onFetchTelegramMessages, onSendTelegramMessage, onAssignTask, onOpenChat }) {
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
    return { leadsByStage: map, archivedCount: archived };
  }, [leads, ordersById, period]);
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
        {!isMobile && <Button onClick={() => setModal(true)} style={{ marginLeft: "auto" }}><Plus size={14} /> Yangi lid</Button>}
      </div>

      {isMobile ? (
        <MobileLeadBoard
          leadsByStage={leadsByStage}
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
              {leadsByStage[stage.key].length === 0 ? (
                <div style={{ fontSize: 12.5, color: THEME.dim, padding: "16px 0", textAlign: "center", border: `1px dashed ${THEME.border2}`, borderRadius: 8 }}>Bo'sh</div>
              ) : (
                <Incremental list={leadsByStage[stage.key]} step={25} render={(lead) => {
                  const idx = stageIndex(lead.stage);
                  const linkedOrder = lead.orderId ? (orders || []).find((o) => o.id === lead.orderId) : null;
                  const st = staleInfo(lead);
                  const tel = telLink(lead.phone);
                  const note = lead.notes && !isAutoTgNote(lead) ? lead.notes : "";
                  return (
                    <div
                      key={lead.id}
                      className="uvix-lead-card"
                      data-lead={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead)}
                      onDragEnd={handleDragEnd}
                      onDoubleClick={() => setModal(lead)}
                      title={lead.phone ? `${lead.customer} · ${lead.phone}` : lead.customer}
                      style={{
                        position: "relative", background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8,
                        boxShadow: st ? `inset 3px 0 0 ${st.level === "danger" ? THEME.rose : THEME.amber}` : "none",
                        padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6,
                        cursor: "grab", opacity: draggedLeadId === lead.id ? 0.4 : 1, transition: "opacity 0.15s ease, border-color .15s ease",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{lead.customer}</div>
                        {lead.manager && <span title={`Menejer: ${lead.manager}`} className="uvix-lead-mgr" style={{ fontSize: 10.5, fontWeight: 600, color: THEME.mutedDark, background: THEME.chip, borderRadius: 10, padding: "0 6px", lineHeight: "18px", flexShrink: 0 }}>{initials(lead.manager)}</span>}
                      </div>
                      {lead.estimatedValue > 0 && (
                        <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{money(lead.estimatedValue)}</div>
                      )}
                      {note && <div style={{ fontSize: 12.5, color: THEME.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note}</div>}
                      <TaskChips lead={lead} employees={employees} compact onOpen={onAssignTask ? (kind) => onAssignTask(lead, kind) : null} />
                      {linkedOrder ? (
                        <div style={{ fontSize: 12, color: THEME.green, fontWeight: 600 }}>✓ Buyurtma {linkedOrder.orderNumber}</div>
                      ) : ORDER_READY_STAGES.includes(lead.stage) && (
                        <button type="button" onClick={() => onCreateOrderFromLead(lead)} className="uvix-lead-cta"
                          style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, border: 0, background: "none", padding: 0, color: THEME.violet, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          <Package size={13} /> Buyurtma yaratish
                        </button>
                      )}
                      {(lead.source || lead.telegramUsername || st) && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                          {lead.source && <SourceChip source={lead.source} />}
                          <TgHandle username={lead.telegramUsername} />
                          {st && <span data-testid="stale-badge" title="Oxirgi harakatdan beri o'tgan kun" style={{ fontSize: 12, fontWeight: 600, color: st.level === "danger" ? THEME.rose : THEME.amber, whiteSpace: "nowrap" }}>{st.days} kun turibdi</span>}
                        </div>
                      )}
                      <div className="uvix-lead-actions" onDoubleClick={(e) => e.stopPropagation()}>
                        {lead.telegramChatId && onFetchTelegramMessages ? (
                          <button type="button" onClick={() => openChat(lead)} title="Telegram chat" aria-label="Telegram chat"><MessageCircle size={14} /></button>
                        ) : tel ? (
                          <a href={tel} title="Qo'ng'iroq" aria-label="Qo'ng'iroq"><Phone size={14} /></a>
                        ) : null}
                        <button type="button" onClick={() => moveStage(lead, -1)} disabled={idx === 0} title="Oldingi bosqich" aria-label="Oldingi bosqich"><ArrowLeft size={14} /></button>
                        <button type="button" onClick={() => moveStage(lead, 1)} disabled={idx === LEAD_STAGES.length - 1} title="Keyingi bosqich" aria-label="Keyingi bosqich"><ArrowRight size={14} /></button>
                        <button type="button" onClick={() => setModal(lead)} title="Tahrirlash" aria-label="Tahrirlash"><Pencil size={14} /></button>
                        <button type="button" onClick={() => setConfirmDel(lead)} title="O'chirish" aria-label="O'chirish" className="danger"><Trash2 size={14} /></button>
                      </div>
                    </div>
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
      <style>{`
        .uvix-lead-card:hover { border-color: ${THEME.border2} !important; }
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

      {modal && (
        <LeadForm
          initial={modal === true ? null : modal}
          employees={employees}
          onClose={() => setModal(null)}
          onSave={saveLead}
        />
      )}
      {confirmDel && (
        <ConfirmDialog
          message={`"${confirmDel.customer}" lidini o'chirmoqchimisiz?`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { onDeleteLead(confirmDel); setConfirmDel(null); }}
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
function telegramLink(lead) {
  if (lead.telegramUsername) return `https://t.me/${lead.telegramUsername.replace(/^@/, "")}`;
  const digits = (lead.phone || "").replace(/\D/g, "");
  return digits.length >= 9 ? `https://t.me/+${digits.length === 9 ? "998" + digits : digits}` : null;
}

function MobileLeadBoard({ leadsByStage, stage, onStage, orders, onEdit, onDelete, onMove, onChat, onCreateOrder, employees, onAssignTask }) {
  const list = leadsByStage[stage] || [];
  const total = list.reduce((s, l) => s + (Number(l.estimatedValue) || 0), 0);
  const stageInfo = LEAD_STAGES.find((s) => s.key === stage) || LEAD_STAGES[0];
  const actionBtn = { height: 40, padding: "0 12px", borderRadius: 8, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 600, textDecoration: "none", cursor: "pointer", flexShrink: 0 };

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
          {<Incremental list={list} step={30} render={(lead) => {
            const linkedOrder = lead.orderId ? (orders || []).find((o) => o.id === lead.orderId) : null;
            const tel = telLink(lead.phone);
            const tg = lead.telegramChatId && onChat ? null : telegramLink(lead);
            const meta = lead.manager || "";
            return (
              <Card key={lead.id} style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.customer}</div>
                    {lead.phone && <div style={{ fontSize: 13, color: THEME.muted, marginTop: 2 }}>{lead.phone}</div>}
                    {(lead.source || lead.telegramUsername) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                        <SourceChip source={lead.source} size="md" />
                        <TgHandle username={lead.telegramUsername} size="md" />
                      </div>
                    )}
                    {meta && <div style={{ fontSize: 12, color: THEME.muted, marginTop: 4 }}>{meta}</div>}
                  </div>
                  {Number(lead.estimatedValue) > 0 && (
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: THEME.text, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{money(lead.estimatedValue)}</div>
                  )}
                </div>
                <StaleBadge lead={lead} big />
                {lead.notes && !isAutoTgNote(lead) && <div style={{ fontSize: 13, color: THEME.mutedDark, lineHeight: 1.45 }}>{lead.notes}</div>}
                <TaskChips lead={lead} employees={employees} onOpen={onAssignTask ? (kind) => onAssignTask(lead, kind) : null} />

                {linkedOrder ? (
                  <div style={{ fontSize: 12.5, color: THEME.green, fontWeight: 700, background: THEME.greenBg, padding: "6px 10px", borderRadius: 10, alignSelf: "flex-start" }}>
                    Buyurtma: {linkedOrder.orderNumber}
                  </div>
                ) : ORDER_READY_STAGES.includes(lead.stage) && (
                  <Button onClick={() => onCreateOrder(lead)} style={{ justifyContent: "center" }}><Package size={15} /> Buyurtma yaratish</Button>
                )}

                {(tel || tg || (lead.telegramChatId && onChat)) && (
                  <div style={{ display: "flex", gap: 8 }}>
                    {tel && <a href={tel} style={{ ...actionBtn, flex: 1 }}><Phone size={15} /> Qo'ng'iroq</a>}
                    {lead.telegramChatId && onChat ? (
                      <button type="button" onClick={() => onChat(lead)} style={{ ...actionBtn, flex: 1 }}><MessageCircle size={15} /> Chat</button>
                    ) : tg && (
                      <a href={tg} target="_blank" rel="noopener noreferrer" style={{ ...actionBtn, flex: 1 }}><Send size={15} /> Telegram</a>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select value={lead.stage || "new"} onChange={(e) => onMove(lead, e.target.value)} aria-label="Bosqichni o'zgartirish"
                    style={{ ...getInputStyle(), flex: 1, minWidth: 0, height: 40, padding: "0 10px", boxSizing: "border-box" }}>
                    {LEAD_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <button type="button" onClick={() => onEdit(lead)} aria-label="Tahrirlash" style={{ ...actionBtn, width: 40, padding: 0 }}><Pencil size={15} /></button>
                  <button type="button" onClick={() => onDelete(lead)} aria-label="O'chirish" style={{ ...actionBtn, width: 40, padding: 0 }}><Trash2 size={15} color={THEME.rose} /></button>
                </div>
              </Card>
            );
          }} />}
        </div>
      )}
    </div>
  );
}
