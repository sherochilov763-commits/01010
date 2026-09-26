import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, MessageCircle, Package, Pencil, Phone, Plus, Send, Trash2, X } from "lucide-react";
import { Button, Card, ConfirmDialog, Field, Modal, getInputStyle, useIsMobile } from "../../components/ui.jsx";
import { LEAD_STAGES, ORDER_READY_STAGES, isWorkerRole } from "../../constants.js";
import { fmt, money, uid } from "../../lib/format.js";
import { TaskChips } from "./TaskAssignModal.jsx";
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

export function CRMView({ leads, orders, employees, currentUser, isAdmin, onSaveLead, onDeleteLead, onMoveLead, onCreateOrderFromLead, onFetchTelegramMessages, onSendTelegramMessage, onAssignTask, onOpenChat }) {
  const [modal, setModal] = useState(null); // null | true (new) | lead (edit)
  const [confirmDel, setConfirmDel] = useState(null);
  const [chatFor, setChatFor] = useState(null);
  // Chat tugmasi: Chatlar bo'limiga o'tib, shu mijoz suhbatini ochadi
  const openChat = (lead) => (onOpenChat ? onOpenChat(lead) : setChatFor(lead));
  const [draggedLeadId, setDraggedLeadId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const isMobile = useIsMobile();
  const [mobileStage, setMobileStage] = useState("new");

  const leadsByStage = useMemo(() => {
    const map = {};
    LEAD_STAGES.forEach((s) => (map[s.key] = []));
    (leads || []).forEach((l) => {
      if (map[l.stage]) map[l.stage].push(l);
      else map.new.push(l);
    });
    return map;
  }, [leads]);

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        {!isMobile && <div style={{ fontSize: 13, color: THEME.muted }}>Savdo voronkasi — lidlarni bosqichlar bo'yicha kuzating</div>}
        <Button onClick={() => setModal(true)}><Plus size={14} /> Yangi lid</Button>
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
      ) : (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${LEAD_STAGES.length}, minmax(180px, 1fr))`, gap: 14, overflowX: "auto" }} className="uvix-scroll">
        {LEAD_STAGES.map((stage) => (
          <div
            key={stage.key}
            onDragOver={(e) => handleColumnDragOver(e, stage.key)}
            onDragLeave={() => setDragOverStage((prev) => (prev === stage.key ? null : prev))}
            onDrop={(e) => handleColumnDrop(e, stage.key)}
            style={{
              borderRadius: 14,
              transition: "background-color 0.15s ease",
              background: dragOverStage === stage.key ? THEME.violetSoft : "transparent",
              padding: dragOverStage === stage.key ? 6 : 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color, flexShrink: 0 }} />
              <span title={stage.label} style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{stage.label}</span>
              <span style={{ fontSize: 11, color: THEME.muted, background: THEME.surface, padding: "1px 8px", borderRadius: 20, flexShrink: 0 }}>{leadsByStage[stage.key].length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
              {leadsByStage[stage.key].length === 0 ? (
                <div style={{ fontSize: 11.5, color: THEME.muted, padding: "16px 0", textAlign: "center", border: `1.5px dashed ${THEME.border}`, borderRadius: 12 }}>Bo'sh</div>
              ) : (
                leadsByStage[stage.key].map((lead) => {
                  const idx = stageIndex(lead.stage);
                  const linkedOrder = lead.orderId ? (orders || []).find((o) => o.id === lead.orderId) : null;
                  return (
                    <Card
                      key={lead.id}
                      className="uvix-dash-card"
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead)}
                      onDragEnd={handleDragEnd}
                      style={{
                        padding: 12, display: "flex", flexDirection: "column", gap: 6,
                        cursor: "grab", opacity: draggedLeadId === lead.id ? 0.4 : 1,
                        transition: "opacity 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.customer}</div>
                        <button onClick={() => setConfirmDel(lead)} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: 2 }}><X size={13} color={THEME.muted} /></button>
                      </div>
                      {lead.phone && (
                        <div style={{ fontSize: 11.5, color: THEME.muted, display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} /> {lead.phone}</div>
                      )}
                      {lead.estimatedValue > 0 && (
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.violet }}>{money(lead.estimatedValue)}</div>
                      )}
                      {lead.manager && <div style={{ fontSize: 11, color: THEME.muted }}>Menejer: {lead.manager}</div>}
                      {lead.source && <div style={{ fontSize: 11, color: THEME.muted }}>Manba: {lead.source}</div>}
                      {lead.notes && <div style={{ fontSize: 11, color: THEME.muted, fontStyle: "italic" }}>{lead.notes}</div>}
                      <div style={{ marginTop: 8 }}>
                        <TaskChips lead={lead} employees={employees} compact onOpen={onAssignTask ? (kind) => onAssignTask(lead, kind) : null} />
                      </div>

                      {lead.telegramChatId && onFetchTelegramMessages && (
                        <Button variant="ghost" onClick={() => openChat(lead)} style={{ fontSize: 11.5, padding: "5px 10px", marginTop: 2 }}>
                          💬 Telegram chat
                        </Button>
                      )}

                      {linkedOrder ? (
                        <div style={{ fontSize: 11, color: THEME.green, fontWeight: 700, background: THEME.greenBg, padding: "3px 8px", borderRadius: 8, marginTop: 2 }}>
                          ✓ Buyurtma: {linkedOrder.orderNumber}
                        </div>
                      ) : (
                        ORDER_READY_STAGES.includes(lead.stage) && (
                          <Button onClick={() => onCreateOrderFromLead(lead)} style={{ fontSize: 11.5, padding: "5px 10px", marginTop: 2 }}>
                            <Package size={12} /> Buyurtma yaratish
                          </Button>
                        )
                      )}

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, borderTop: `1px dashed ${THEME.border}`, paddingTop: 6 }}>
                        <button onClick={() => moveStage(lead, -1)} disabled={idx === 0} style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.3 : 1, padding: 2 }}>
                          <ArrowLeft size={14} color={THEME.text} />
                        </button>
                        <button onClick={() => setModal(lead)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: THEME.violet, fontWeight: 700 }}>Tahrirlash</button>
                        <button onClick={() => moveStage(lead, 1)} disabled={idx === LEAD_STAGES.length - 1} style={{ background: "none", border: "none", cursor: idx === LEAD_STAGES.length - 1 ? "default" : "pointer", opacity: idx === LEAD_STAGES.length - 1 ? 0.3 : 1, padding: 2 }}>
                          <ArrowRight size={14} color={THEME.text} />
                        </button>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
      )}

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
  const actionBtn = { height: 40, padding: "0 12px", borderRadius: 10, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 600, textDecoration: "none", cursor: "pointer", flexShrink: 0 };

  return (
    <div>
      <div role="tablist" aria-label="Savdo bosqichlari" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -16px", padding: "2px 16px 4px", scrollbarWidth: "none" }}>
        {LEAD_STAGES.map((s) => {
          const on = s.key === stage;
          return (
            <button key={s.key} type="button" role="tab" aria-selected={on} onClick={() => onStage(s.key)}
              style={{ height: 38, padding: "0 14px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: on ? 600 : 500,
                border: `1px solid ${on ? s.color : THEME.border}`, background: on ? `${s.color}22` : THEME.card, color: THEME.text }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
              {s.label}
              <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>{(leadsByStage[s.key] || []).length}</span>
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 13, color: THEME.muted, margin: "12px 2px 10px" }}>
        {list.length} ta lid{total > 0 ? <> · taxminan <b style={{ color: THEME.text }}>{money(total)}</b></> : null}
      </div>

      {list.length === 0 ? (
        <div style={{ fontSize: 13.5, color: THEME.muted, padding: "32px 16px", textAlign: "center", border: `1.5px dashed ${THEME.border}`, borderRadius: 16 }}>
          "{stageInfo.label}" bosqichida hozircha lid yo'q
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((lead) => {
            const linkedOrder = lead.orderId ? (orders || []).find((o) => o.id === lead.orderId) : null;
            const tel = telLink(lead.phone);
            const tg = lead.telegramChatId && onChat ? null : telegramLink(lead);
            const meta = [lead.source, lead.manager].filter(Boolean).join(" · ");
            return (
              <Card key={lead.id} style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.customer}</div>
                    {lead.phone && <div style={{ fontSize: 13, color: THEME.muted, marginTop: 2 }}>{lead.phone}</div>}
                    {meta && <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>{meta}</div>}
                  </div>
                  {Number(lead.estimatedValue) > 0 && (
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: THEME.violet, whiteSpace: "nowrap" }}>{money(lead.estimatedValue)}</div>
                  )}
                </div>
                {lead.notes && <div style={{ fontSize: 13, color: THEME.mutedDark, lineHeight: 1.45 }}>{lead.notes}</div>}
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
          })}
        </div>
      )}
    </div>
  );
}
