import { useEffect, useState } from "react";
import { Droplet, Plus, Search, X } from "lucide-react";
import { guessPaintItem, loadPaintItems } from "../../lib/paintStore.js";
import { Button, Field, Modal, PaymentTypeSelector, getIconBtn, getInputStyle } from "../../components/ui.jsx";
import { fmt, todayStr, uid } from "../../lib/format.js";
import { THEME } from "../../theme.js";

/* ---------------- RASXOD FORMASI (faqat chiqim uchun) ---------------- */
export function TransactionForm({ initial, preset, currentUser, categories, orders, onAddCategory, onAddSubcategory, onClose, onSave }) {
  const catNames = categories ? Object.keys(categories) : [];
  const [date, setDate] = useState(initial?.date || todayStr());
  const [category, setCategory] = useState(initial?.category || (preset?.category && catNames.includes(preset.category) ? preset.category : catNames[0]) || "");
  const [subcategory, setSubcategory] = useState(initial?.subcategory || (preset?.category && categories?.[preset.category] ? preset.subcategory || categories[preset.category][0] : (categories?.[catNames[0]] || [])[0]) || "");
  const [amountStr, setAmountStr] = useState(initial ? fmt(initial.amount) : "");
  const [paymentType, setPaymentType] = useState(initial?.paymentType || "karta");
  const [note, setNote] = useState(initial?.note || "");
  const [error, setError] = useState("");
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newSubOpen, setNewSubOpen] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [linkedOrderId, setLinkedOrderId] = useState(initial?.relatedOrderId || "");
  const [orderQuery, setOrderQuery] = useState(() => {
    if (initial?.relatedOrderId) {
      const found = (orders || []).find((o) => o.id === initial.relatedOrderId);
      if (found) return `${found.customer} (${found.orderNumber})`;
    }
    return "";
  });
  const [showOrderSuggestions, setShowOrderSuggestions] = useState(false);

  const isBrak = category === "Brak";
  const isPaint = category === "Kraska";
  // Bo'yoq omboriga kirim: qaysi bo'yoqdan necha litr olindi (bitta to'lovda bir nechta bo'yoq bo'lishi mumkin)
  const [paintItems, setPaintItems] = useState(null);
  const [paintLines, setPaintLines] = useState(() => (initial?.paintLines || []).map((l) => ({ itemId: l.itemId, liters: String(l.liters).replace(".", ",") })));
  useEffect(() => {
    if (!isPaint || paintItems) return;
    loadPaintItems().then((items) => {
      setPaintItems(items.filter((i) => i.active));
      setPaintLines((cur) => (cur.length ? cur : [{ itemId: guessPaintItem(subcategory, items), liters: "" }]));
    }).catch(() => setPaintItems([]));
  }, [isPaint, paintItems, subcategory]);
  useEffect(() => {
    // subkategoriya o'zgarsa — bitta bo'sh qatordagi bo'yoqni moslab qo'yamiz
    if (!paintItems) return;
    setPaintLines((cur) => (cur.length === 1 && !cur[0].liters ? [{ ...cur[0], itemId: guessPaintItem(subcategory, paintItems) || cur[0].itemId }] : cur));
  }, [subcategory, paintItems]);
  const setPaintLine = (i, k, v) => setPaintLines((cur) => cur.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const orderSuggestions = orderQuery.trim()
    ? (orders || []).filter((o) =>
        (o.customer || "").toLowerCase().includes(orderQuery.trim().toLowerCase()) ||
        (o.orderNumber || "").toLowerCase().includes(orderQuery.trim().toLowerCase())
      ).slice(0, 8)
    : (orders || []).slice(0, 8);
  function pickOrder(o) {
    setLinkedOrderId(o.id);
    setOrderQuery(`${o.customer} (${o.orderNumber})`);
    setShowOrderSuggestions(false);
  }

  function handleAmountChange(e) {
    const digits = e.target.value.replace(/\D/g, "");
    setAmountStr(digits ? fmt(parseInt(digits, 10)) : "");
  }
  function handleCategoryChange(cat) {
    setCategory(cat);
    setSubcategory((categories[cat] || [])[0] || "");
  }
  function submitNewCategory() {
    const clean = newCatName.trim();
    if (!clean) return;
    if (catNames.includes(clean)) { setCategory(clean); setSubcategory((categories[clean] || [])[0] || ""); }
    else {
      onAddCategory(clean);
      setCategory(clean);
      setSubcategory("Umumiy");
    }
    setNewCatName("");
    setNewCatOpen(false);
  }
  function submitNewSubcategory() {
    const clean = newSubName.trim();
    if (!clean || !category) return;
    const existing = categories[category] || [];
    if (!existing.includes(clean)) onAddSubcategory(category, clean);
    setSubcategory(clean);
    setNewSubName("");
    setNewSubOpen(false);
  }

  function submit() {
    if (!date) return setError("Sanani tanlang");
    const amount = parseInt(amountStr.replace(/\s/g, ""), 10);
    if (!amount || amount <= 0) return setError("Summani to'g'ri kiriting (0 dan katta)");
    if (!category) return setError("Kategoriyani tanlang");
    if (isBrak && !linkedOrderId) return setError("Brak qaysi buyurtmaga tegishli ekanini tanlang");
    let cleanPaint = [];
    if (isPaint) {
      for (const l of paintLines) {
        const liters = Number(String(l.liters || "").replace(",", "."));
        if (!l.itemId && !l.liters) continue;
        if (!l.itemId) return setError("Bo'yoq omboriga: qaysi bo'yoq ekanini tanlang");
        if (!liters || liters <= 0 || liters > 5000) return setError("Bo'yoq omboriga: litrni to'g'ri kiriting");
        cleanPaint.push({ itemId: l.itemId, liters: Math.round(liters * 100) / 100 });
      }
    }
    const tx = {
      id: initial?.id || uid(),
      type: "chiqim",
      date,
      amount,
      paymentType,
      note: note.trim(),
      createdBy: initial?.createdBy || currentUser.name,
      createdAt: initial?.createdAt || new Date().toISOString(),
      category,
      subcategory,
      relatedOrderId: isBrak ? linkedOrderId : (initial?.relatedOrderId || undefined),
      ...(cleanPaint.length ? { paintLines: cleanPaint } : {}),
    };
    onSave(tx);
  }

  return (
    <Modal title={(initial ? "Tahrirlash" : "Yangi") + " rasxod"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Sana">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={getInputStyle()} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Kategoriya">
            <div style={{ display: "flex", gap: 6 }}>
              <select value={category} onChange={(e) => handleCategoryChange(e.target.value)} style={getInputStyle()}>
                {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="button" onClick={() => setNewCatOpen((v) => !v)} title="Yangi kategoriya" style={{ ...getIconBtn(), flexShrink: 0, padding: "0 10px" }}>
                <Plus size={14} />
              </button>
            </div>
            {newCatOpen && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input
                  autoFocus
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submitNewCategory())}
                  placeholder="Yangi kategoriya nomi"
                  style={{ ...getInputStyle(), fontSize: 12.5 }}
                />
                <Button type="button" onClick={submitNewCategory} style={{ padding: "8px 12px", fontSize: 12 }}>Qo'shish</Button>
              </div>
            )}
          </Field>
          <Field label="Subkategoriya">
            <div style={{ display: "flex", gap: 6 }}>
              <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} style={getInputStyle()}>
                {(categories[category] || []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="button" onClick={() => setNewSubOpen((v) => !v)} title="Yangi subkategoriya" style={{ ...getIconBtn(), flexShrink: 0, padding: "0 10px" }}>
                <Plus size={14} />
              </button>
            </div>
            {newSubOpen && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input
                  autoFocus
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submitNewSubcategory())}
                  placeholder="Yangi subkategoriya nomi"
                  style={{ ...getInputStyle(), fontSize: 12.5 }}
                />
                <Button type="button" onClick={submitNewSubcategory} style={{ padding: "8px 12px", fontSize: 12 }}>Qo'shish</Button>
              </div>
            )}
          </Field>
        </div>
        {isBrak && (
          <Field label="Qaysi buyurtmaga tegishli?">
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: THEME.muted }} />
              <input
                value={orderQuery}
                onChange={(e) => { setOrderQuery(e.target.value); setLinkedOrderId(""); setShowOrderSuggestions(true); }}
                onFocus={() => setShowOrderSuggestions(true)}
                onBlur={() => setTimeout(() => setShowOrderSuggestions(false), 150)}
                placeholder="Mijoz yoki buyurtma № bo'yicha qidiring..."
                style={{ ...getInputStyle(), paddingLeft: 30, borderColor: linkedOrderId ? THEME.violet : undefined }}
              />
              {showOrderSuggestions && orderSuggestions.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 11, boxShadow: THEME.shadowLg, zIndex: 20, maxHeight: 200, overflowY: "auto", padding: 4 }} className="uvix-scroll">
                  {orderSuggestions.map((o) => (
                    <button
                      key={o.id}
                      onMouseDown={() => pickOrder(o)}
                      type="button"
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "none", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", textAlign: "left" }}
                      className="uvix-row"
                    >
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{o.customer}</span>
                      <span style={{ fontSize: 11.5, color: THEME.muted }}>{o.orderNumber}</span>
                    </button>
                  ))}
                </div>
              )}
              {showOrderSuggestions && orderQuery.trim() && orderSuggestions.length === 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 11, padding: "10px 14px", fontSize: 12, color: THEME.muted, zIndex: 20 }}>
                  Buyurtma topilmadi
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
              Bu summa shu buyurtmaning "Qo'shilgan qiymat" hisobidan avtomatik ayiriladi va buyurtmalar ro'yxatida ko'rsatiladi.
            </div>
          </Field>
        )}
        {isPaint && (
          <div data-testid="paint-intake" style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
              <Droplet size={15} style={{ color: THEME.violet }} /> Bo'yoq omboriga kirim
              <span style={{ fontWeight: 500, color: THEME.muted, fontSize: 11.5 }}>(qoldiqqa qo'shiladi)</span>
            </div>
            {paintItems == null ? <div style={{ fontSize: 12, color: THEME.muted }}>Yuklanmoqda…</div> : paintLines.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px 30px", gap: 6, alignItems: "center" }}>
                <select value={l.itemId} onChange={(e) => setPaintLine(i, "itemId", e.target.value)} style={getInputStyle()} data-paintline-item={i}>
                  <option value="">— bo'yoqni tanlang —</option>
                  {paintItems.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
                <div style={{ position: "relative" }}>
                  <input value={l.liters} onChange={(e) => setPaintLine(i, "liters", e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="0" data-paintline-liters={i}
                    style={{ ...getInputStyle(), paddingRight: 22, textAlign: "right", fontWeight: 700 }} />
                  <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: THEME.muted }}>L</span>
                </div>
                <button type="button" onClick={() => setPaintLines((cur) => cur.filter((_, j) => j !== i))} title="Olib tashlash" style={{ ...getIconBtn(), padding: 0, width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
              </div>
            ))}
            {paintItems != null && (
              <button type="button" onClick={() => setPaintLines((cur) => [...cur, { itemId: "", liters: "" }])} style={{ alignSelf: "flex-start", border: 0, background: "none", color: THEME.violet, fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
                <Plus size={13} /> Yana bo'yoq
              </button>
            )}
            <div style={{ fontSize: 11, color: THEME.muted }}>Omborga tegishli bo'lmasa (masalan, boshqa xarajat) — qatorni olib tashlang.</div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Summa (so'm)">
            <input value={amountStr} onChange={handleAmountChange} placeholder="0" inputMode="numeric" style={{ ...getInputStyle(), fontSize: 17, fontWeight: 700 }} />
          </Field>
          <Field label="To'lov turi">
            <PaymentTypeSelector value={paymentType} onChange={setPaymentType} />
          </Field>
        </div>
        <Field label="Izoh">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Qo'shimcha izoh (ixtiyoriy)" style={{ ...getInputStyle(), resize: "vertical" }} />
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
