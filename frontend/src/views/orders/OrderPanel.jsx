// OrderPanel.jsx — buyurtma tafsiloti o'ng panelda (jadvaldan chiqmasdan ko'rish).
// Faqat ko'rinish: barcha amallar avvalgi oynalar orqali (To'lovlar, Hisob-faktura, Tahrirlash).
import { useEffect, useState } from "react";
import { FileText, Pencil, Trash2, X } from "lucide-react";
import { Avatar, Button } from "../../components/ui.jsx";
import { orderAddedValue, orderBrakSum, orderDebt, orderTotalPaid } from "../../lib/finance.js";
import { fmt, money, paymentTypeLabel, shortDateUz, usd } from "../../lib/format.js";
import { THEME } from "../../theme.js";
import { PROD_LABEL, PROD_STAGES, prodColors } from "../../lib/production.js";

const TASK_STATUS = { new: "navbatda", in_progress: "jarayonda", done: "tugadi", unassigned: "tayinlanmagan" };

const fmtTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
};

export function OrderPanel({ order, transactions, phone, canDelete, onClose, onPayments, onInvoice, onEdit, onDelete, stage, employees, siblings, onStage, onAssign, onSelectOrder }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (fn) => { setBusy(true); setErr(""); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".uvix-modal-backdrop")) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const paid = orderTotalPaid(order);
  const debt = orderDebt(order);
  const brak = orderBrakSum(order, transactions);
  const total = Math.max(0, (order.agreementUzs || 0) - brak);
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  const added = orderAddedValue(order, transactions);
  const pays = (order.payments || []).filter((p) => !p.deletedAt).slice().sort((a, b) => ((a.createdAt || a.date) < (b.createdAt || b.date) ? 1 : -1));
  const area = order.area ? `${String(order.area).replace(".", ",")} m²` : "";

  const row = (l, v, strong) => v || v === 0 ? (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, padding: "5px 0", fontSize: 13 }}>
      <span style={{ color: THEME.muted }}>{l}</span>
      <span style={{ color: THEME.text, fontWeight: strong ? 600 : 500, fontVariantNumeric: "tabular-nums", minWidth: 0, overflowWrap: "anywhere" }}>{v}</span>
    </div>
  ) : null;

  return (
    <aside className="uvix-order-panel" aria-label={`Buyurtma ${order.orderNumber}`} data-testid="order-panel"
      style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: THEME.radius + 2, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${THEME.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: THEME.dim, fontVariantNumeric: "tabular-nums" }}>{order.orderNumber} · {shortDateUz(order.date)}</span>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} aria-label="Panelni yopish" className="uvix-iconbtn" style={{ background: "none", border: 0, padding: 5, borderRadius: 6, cursor: "pointer", color: THEME.muted, display: "flex" }}><X size={16} /></button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <Avatar name={order.customer} size={34} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.customer || "Mijoz ko'rsatilmagan"}</div>
            {phone && <div style={{ fontSize: 12.5, color: THEME.dim }}>{phone}</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {order.subcategory && <Tag>{order.subcategory}</Tag>}
          {(order.materialType || area) && <Tag>{[order.materialType, area].filter(Boolean).join(" · ")}</Tag>}
          {order.groupId && order.groupSize > 1 && <Tag>{order.groupId} · {order.groupIdx}/{order.groupSize}</Tag>}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: debt > 0 ? THEME.rose : THEME.green }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor" }} />{debt > 0 ? "Qarzdor" : "To'langan"}
          </span>
        </div>
      </div>

      <div className="uvix-scroll" style={{ padding: "16px 18px", overflowY: "auto", flex: 1, minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: "hidden" }}>
          {[
            { l: "Summa", v: fmt(total), c: THEME.text },
            { l: "To'langan", v: fmt(paid), c: THEME.green },
            { l: "Qarz", v: debt > 0 ? fmt(debt) : "—", c: debt > 0 ? THEME.rose : THEME.dim },
          ].map((k, i) => (
            <div key={k.l} style={{ padding: "10px 12px", borderLeft: i ? `1px solid ${THEME.border}` : "none", minWidth: 0 }}>
              <div style={{ fontSize: 12, color: THEME.muted }}>{k.l}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: k.c, marginTop: 2, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={k.v}>{k.v}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 6, borderRadius: 3, background: THEME.chip, marginTop: 12, overflow: "hidden" }} aria-label={`${Math.round(pct)}% to'langan`}>
          <div style={{ width: `${pct}%`, height: "100%", background: debt > 0 ? THEME.violet : THEME.green }} />
        </div>

        {onStage && (
          <div data-testid="order-production" style={{ marginTop: 16, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Ishlab chiqarish</span>
              <select value={stage || ""} disabled={busy} onChange={(e) => e.target.value && run(() => onStage(e.target.value))} aria-label="Holat" data-testid="order-stage-select"
                style={{ height: 30, borderRadius: 15, border: 0, padding: "0 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: prodColors(stage).color, background: prodColors(stage).bg }}>
                {!stage && <option value="">Holat belgilanmagan</option>}
                {PROD_STAGES.map((s) => <option key={s} value={s}>{PROD_LABEL[s]}</option>)}
              </select>
            </div>
            {order.title && <div style={{ fontSize: 13, marginTop: 6 }}>{order.title}</div>}
            {[["design", "Dizayner", "designer"], ["print", "Pechatchi", "printer"]].map(([kind, label, role]) => {
              const t = order[kind];
              const people = (employees || []).filter((e) => e.role === role);
              if (!people.length) return null;
              return (
                <div key={kind} style={{ display: "grid", gridTemplateColumns: "84px 1fr", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13 }}>
                  <span style={{ color: THEME.muted }}>{label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <select value={t?.assigneeId || ""} disabled={busy} onChange={(e) => e.target.value && run(() => onAssign(kind, e.target.value))} aria-label={label} data-testid={`order-assign-${kind}`}
                      style={{ height: 30, flex: 1, minWidth: 0, borderRadius: 7, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, fontSize: 12.5, padding: "0 6px", fontFamily: "inherit" }}>
                      <option value="">— tayinlash</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {t && <span style={{ fontSize: 11.5, color: t.status === "done" ? THEME.green : THEME.dim, whiteSpace: "nowrap" }}>{t.status ? TASK_STATUS[t.status] || t.status : "keyin"}</span>}
                  </div>
                </div>
              );
            })}
            {stage === "ready" && <Button onClick={() => run(() => onStage("delivered"))} disabled={busy} style={{ width: "100%", marginTop: 10 }} data-testid="order-deliver">Mijozga topshirildi</Button>}
            {(stage === "printing" || stage === "new") && <Button variant="ghost" onClick={() => run(() => onStage("ready"))} disabled={busy} style={{ width: "100%", marginTop: 10 }}>Tayyor deb belgilash</Button>}
            {err && <div role="alert" style={{ color: THEME.rose, fontSize: 12.5, marginTop: 6 }}>{err}</div>}
            {siblings?.length > 1 && (
              <div style={{ marginTop: 12, borderTop: `1px solid ${THEME.border}`, paddingTop: 10 }}>
                <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 4 }}>Guruh {order.groupId}{order.quoteNo ? ` · smeta ${order.quoteNo}` : ""}</div>
                {siblings.map((o) => {
                  const c = prodColors(o.prodStage);
                  return (
                    <button key={o.id} type="button" onClick={() => onSelectOrder?.(o.id)} disabled={o.id === order.id}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 0", border: 0, background: "none", cursor: o.id === order.id ? "default" : "pointer", fontFamily: "inherit", fontSize: 12.5, color: THEME.text, textAlign: "left" }}>
                      <span style={{ fontWeight: o.id === order.id ? 700 : 500, fontVariantNumeric: "tabular-nums" }}>{o.orderNumber}</span>
                      <span style={{ flex: 1, minWidth: 0, color: THEME.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.title || o.materialType}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: c.color, background: c.bg, padding: "1px 7px", borderRadius: 8 }}>{PROD_LABEL[o.prodStage] || "—"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          {row("Menejer", order.manager)}
          {order.agreementUsd ? row("Kelishuv ($)", usd(order.agreementUsd)) : null}
          {brak > 0 && row("Asl summa", money(order.agreementUzs || 0))}
          {brak > 0 && row("Brak", `−${money(brak)}`)}
          {order.kraskaSum ? row("Kraska", money(order.kraskaSum)) : null}
          {order.materialSum ? row("Material", money(order.materialSum)) : null}
          {row("Qo'shilgan qiymat", money(added), true)}
          {row("Kiritgan", order.createdBy)}
          {order.note ? row("Izoh", order.note) : null}
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, margin: "18px 0 8px" }}>To'lovlar va tarix</div>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {pays.map((p) => (
            <li key={p.id} style={{ display: "flex", gap: 10, fontSize: 13 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: THEME.green, marginTop: 6, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div><b style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{money(p.amount)}</b> <span style={{ color: THEME.muted }}>· {paymentTypeLabel(p.paymentType)}</span></div>
                <div style={{ fontSize: 12, color: THEME.dim }}>{[shortDateUz(p.date), fmtTime(p.createdAt), p.createdBy, p.comment].filter(Boolean).join(" · ")}</div>
              </div>
            </li>
          ))}
          <li style={{ display: "flex", gap: 10, fontSize: 13 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: THEME.border2, marginTop: 6, flexShrink: 0 }} />
            <div>
              <div>Buyurtma yaratildi</div>
              <div style={{ fontSize: 12, color: THEME.dim }}>{[shortDateUz(order.date), fmtTime(order.createdAt), order.createdBy].filter(Boolean).join(" · ")}</div>
            </div>
          </li>
        </ol>
      </div>

      <div style={{ padding: "12px 18px", borderTop: `1px solid ${THEME.border}`, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={onPayments} style={{ flex: 1 }}>To'lov qabul qilish</Button>
        <Button variant="ghost" onClick={onInvoice} title="Hisob-faktura"><FileText size={14} /> Faktura</Button>
        <Button variant="ghost" onClick={onEdit} title="Tahrirlash" aria-label="Tahrirlash"><Pencil size={14} /></Button>
        {canDelete && <Button variant="ghost" onClick={onDelete} title="O'chirish" aria-label="O'chirish"><Trash2 size={14} color={THEME.rose} /></Button>}
      </div>
    </aside>
  );
}

function Tag({ children }) {
  return <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: THEME.chip, color: THEME.mutedDark }}>{children}</span>;
}
