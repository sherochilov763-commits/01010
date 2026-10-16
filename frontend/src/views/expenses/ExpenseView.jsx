import { useMemo, useState, useEffect } from "react";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Pagination, getIconBtn, usePagination, useIsMobile, MobileRow } from "../../components/ui.jsx";
import { exportWorkbook } from "../../lib/excel.js";
import { money, paymentTypeBadgeColors, paymentTypeLabel, todayStr, shortDateUz } from "../../lib/format.js";
import { THEME } from "../../theme.js";
import { TransactionForm } from "./TransactionForm.jsx";
import { LINE_META, lineColor, lineOfOrder, txLine, useLine } from "../../lib/lines.js";
import { LineTag } from "../../components/LineSwitcher.jsx";

/* ---------------- EXPENSE VIEW ---------------- */
export function ExpenseView({ quickAddNonce, onQuickAddHandled, transactions, orders, employees, currentUser, categories, onAddCategory, onAddSubcategory, onSave, onDelete }) {
  const isMobile = useIsMobile();
  const [modal, setModal] = useState(null);
  // Pastki menyudagi "+" tugmasidan kelinganda — formani darhol ochamiz
  useEffect(() => {
    if (!quickAddNonce) return;
    setModal({});
    onQuickAddHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAddNonce]);
  const [confirmDel, setConfirmDel] = useState(null);
  // Yo'nalish belgisi: «Ikkalasi» rejimida hammasiga, bitta yo'nalishda — faqat «Umumiy»ga
  const { line: curLine } = useLine();
  const lineById = useMemo(() => new Map((orders || []).map((o) => [o.id, lineOfOrder(o)])), [orders]);
  // Rahbar: Barchasi / UVIXPRINT / UVONYX / Umumiy filtri (tanlov shu qurilmada eslab qolinadi)
  const [lineF, setLineFRaw] = useState(() => { try { return localStorage.getItem("uvix_exp_line") || "all"; } catch { return "all"; } });
  const setLineF = (v) => { setLineFRaw(v); try { localStorage.setItem("uvix_exp_line", v); } catch { /* */ } };
  const list = transactions.filter((t) => t.type === "chiqim" && (curLine !== "all" || lineF === "all" || txLine(t, lineById) === lineF)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const { page, setPage, totalPages, pageItems } = usePagination(list, [transactions.length, lineF]);
  const orderById = useMemo(() => {
    const map = {};
    (orders || []).forEach((o) => { map[o.id] = o; });
    return map;
  }, [orders]);
  const tagOf = (t) => { const l = txLine(t, lineById); return curLine === "all" || l === "common" ? <LineTag line={l} /> : null; };

  function exportExcel() {
    exportWorkbook([], list, categories, "Rasxodlar", `UVIX_rasxodlar_${todayStr()}.xlsx`);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {curLine === "all" && (
          <div role="group" aria-label="Yo'nalish" data-testid="exp-line" style={{ display: "flex", gap: 6, marginRight: "auto", flexWrap: "wrap" }}>
            {[["all", "Barchasi"], ["UVIXPRINT", "UVIXPRINT"], ["UVONYX", "UVONYX"], ["common", "Umumiy"]].map(([v, l]) => {
              const on = lineF === v;
              return (
                <button key={v} type="button" onClick={() => setLineF(v)} aria-pressed={on} data-line={v} className="uvix-fchip"
                  style={{ height: 32, padding: "0 12px", borderRadius: 16, whiteSpace: "nowrap", cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6,
                    border: `1px solid ${on ? THEME.text : THEME.border2}`, background: on ? THEME.text : THEME.card, color: on ? THEME.card : THEME.mutedDark }}>
                  {LINE_META[v] && <span style={{ width: 7, height: 7, borderRadius: "50%", background: lineColor(v, THEME.isDark) }} />}{l}
                </button>
              );
            })}
          </div>
        )}
        <Button variant="ghost" onClick={exportExcel} disabled={list.length === 0}><Download size={14} /> Excel</Button>
        <Button onClick={() => setModal({})}><Plus size={15} /> Yangi rasxod</Button>
      </div>
      <Card style={{ padding: 0, overflowX: "auto" }} className="uvix-scroll">
        {list.length === 0 ? <EmptyState text="Hali rasxod kiritilmagan" /> : isMobile ? (
          <div>
            {pageItems.map((t) => {
              const linkedOrder = t.relatedOrderId ? orderById[t.relatedOrderId] : null;
              const pc = paymentTypeBadgeColors(t.paymentType);
              return (
                <MobileRow key={t.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{t.category}{t.subcategory && t.subcategory !== "Umumiy" ? <span style={{ color: THEME.muted, fontWeight: 500 }}> · {t.subcategory}</span> : null} {tagOf(t)}</div>
                      <div style={{ fontSize: 12, color: THEME.muted, marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {shortDateUz(t.date)}
                        <Badge color={pc.color} bg={pc.bg}>{paymentTypeLabel(t.paymentType)}</Badge>
                        {t.paintLines?.length ? <Badge color={THEME.violet} bg={THEME.violetSoft}>+{t.paintLines.reduce((s, l) => s + l.liters, 0).toLocaleString("ru-RU")} L omborga</Badge> : null}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: THEME.rose, whiteSpace: "nowrap" }}>−{money(t.amount)}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setModal({ edit: t })} aria-label="Tahrirlash" className="uvix-iconbtn" style={getIconBtn()}><Pencil size={14} /></button>
                        <button onClick={() => setConfirmDel(t)} aria-label="O'chirish" className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                      </div>
                    </div>
                  </div>
                  {(linkedOrder || t.note) && (
                    <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 8, lineHeight: 1.45 }}>
                      {linkedOrder && <div>{linkedOrder.customer} <span style={{ opacity: 0.8 }}>({linkedOrder.orderNumber})</span></div>}
                      {t.note && <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note}</div>}
                    </div>
                  )}
                </MobileRow>
              );
            })}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "transparent", borderBottom: `1.5px solid ${THEME.border}` }}>
                {["Sana", "Kategoriya", "Subkategoriya", "Mijoz / Buyurtma", "To'lov turi", "Summa", "Izoh", ""].map((h) => (
                  <th key={h} style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t) => {
                const linkedOrder = t.relatedOrderId ? orderById[t.relatedOrderId] : null;
                return (
                <tr key={t.id} className="uvix-row" style={{ borderBottom: `1px solid ${THEME.border}` }}>
                  <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>{t.date}</td>
                  <td style={{ padding: "13px 16px", fontWeight: 600 }}>{t.category} {tagOf(t)}</td>
                  <td style={{ padding: "13px 16px", color: THEME.muted }}>{t.subcategory}{t.paintLines?.length ? <div style={{ fontSize: 11.5, color: THEME.violet, fontWeight: 700 }}>+{t.paintLines.reduce((s, l) => s + l.liters, 0).toLocaleString("ru-RU")} L omborga</div> : null}</td>
                  <td style={{ padding: "13px 16px" }}>
                    {linkedOrder ? (
                      <span style={{ fontSize: 12.5 }}>{linkedOrder.customer} <span style={{ color: THEME.muted }}>({linkedOrder.orderNumber})</span></span>
                    ) : <span style={{ color: THEME.muted }}>-</span>}
                  </td>
                  <td style={{ padding: "13px 16px" }}>
                    <Badge color={paymentTypeBadgeColors(t.paymentType).color} bg={paymentTypeBadgeColors(t.paymentType).bg}>
                      {paymentTypeLabel(t.paymentType)}
                    </Badge>
                  </td>
                  <td style={{ padding: "13px 16px", fontWeight: 700, color: THEME.rose, whiteSpace: "nowrap" }}>-{money(t.amount)}</td>
                  <td style={{ padding: "13px 16px", color: THEME.muted, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note || "-"}</td>
                  <td style={{ padding: "13px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setModal({ edit: t })} className="uvix-iconbtn" style={getIconBtn()}><Pencil size={14} /></button>
                      <button onClick={() => setConfirmDel(t)} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} totalCount={list.length} />
      </Card>
      {modal && (
        <TransactionForm
          initial={modal.edit}
          currentUser={currentUser}
          categories={categories}
          orders={orders}
          employees={employees}
          onAddCategory={onAddCategory}
          onAddSubcategory={onAddSubcategory}
          onClose={() => setModal(null)}
          onSave={(tx) => { onSave(tx, !!modal.edit); setModal(null); }}
        />
      )}
      {confirmDel && (
        <ConfirmDialog
          message={`${confirmDel.date} sanadagi ${money(confirmDel.amount)} rasxodni o'chirmoqchimisiz?`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { onDelete(confirmDel); setConfirmDel(null); }}
        />
      )}
    </div>
  );
}
