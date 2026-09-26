import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Upload, X } from "lucide-react";
import { Button, Field, Modal, MultiPaymentLines, PaymentTypeSelector, getIconBtn, getInputStyle } from "../../components/ui.jsx";
import { generateOrderNumber, orderBrakSum, orderTotalPaid } from "../../lib/finance.js";
import { fmt, money, todayStr, uid, usd } from "../../lib/format.js";
import { isWorkerRole } from "../../constants.js";
import { THEME } from "../../theme.js";

/* ---------------- ORDER FORM ---------------- */
export function OrderForm({ initial, currentUser, categories, employees, settings, allOrders, transactions, onAddSubcategory, onClose, onSave, onUploadPhotos, onDeletePhoto, prefillCustomer }) {
  const isEdit = !!initial;
  const [orderId] = useState(() => initial?.id || uid());
  const [photos, setPhotos] = useState(initial?.photos || []);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileInputRef = useRef(null);

  async function handlePhotoSelect(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (photos.length + files.length > 10) {
      setPhotoError("Bitta buyurtmaga maksimum 10 ta rasm yuklash mumkin");
      e.target.value = "";
      return;
    }
    setPhotoError("");
    setPhotoUploading(true);
    try {
      const uploaded = await onUploadPhotos(orderId, files);
      setPhotos((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setPhotoError(err?.message || "Rasm yuklashda xato yuz berdi");
    } finally {
      setPhotoUploading(false);
      e.target.value = "";
    }
  }
  async function handlePhotoDelete(photo) {
    try {
      await onDeletePhoto(photo.filename || photo.id);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (err) {
      setPhotoError(err?.message || "Rasmni o'chirishda xato yuz berdi");
    }
  }

  const linkedExpense = isEdit ? (transactions || []).find((t) => t.relatedOrderId === initial.id) : null;
  const materialOptions = (categories && categories["Material"]) || ["Boshqa material"];
  const managerNames = employees ? employees.filter((e) => !isWorkerRole(e.role)).map((e) => e.name) : [];
  const defaultUsdRate = (settings && settings.usdRate) || 12700;
  const BIZ_LINES = ["UVIXPRINT", "UVONYX"];

  function sanitizeDecimal(v) {
    let s = v.replace(/[^0-9.,]/g, "").replace(",", ".");
    const parts = s.split(".");
    if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
    return s;
  }

  const [date, setDate] = useState(initial?.date || todayStr());
  const [customer, setCustomer] = useState(initial?.customer || prefillCustomer || "");
  const [bizLine, setBizLine] = useState(initial?.subcategory || BIZ_LINES[0]);
  const [manager, setManager] = useState(initial?.manager || managerNames[0] || "");

  const [materialLines, setMaterialLines] = useState(
    initial?.materialLines?.length
      ? initial.materialLines.map((l) => ({ id: uid(), materialType: l.materialType || materialOptions[0] || "", areaStr: l.area != null ? String(l.area) : "", priceStr: l.priceUsd != null ? String(l.priceUsd) : "" }))
      : [{ id: uid(), materialType: materialOptions[0] || "", areaStr: "", priceStr: "" }]
  );
  const [kraskaStr, setKraskaStr] = useState(initial?.kraskaSum != null ? fmt(initial.kraskaSum) : "");
  const [kraskaTouched, setKraskaTouched] = useState(false);

  const [exchangeRateStr, setExchangeRateStr] = useState(
    initial?.exchangeRate != null ? fmt(initial.exchangeRate) : (defaultUsdRate ? fmt(defaultUsdRate) : "")
  );
  const [agreementStr, setAgreementStr] = useState(initial?.agreementUzs != null ? fmt(initial.agreementUzs) : "");

  const [addInitialPayment, setAddInitialPayment] = useState(false);
  const [initPaymentLines, setInitPaymentLines] = useState([{ id: uid(), methodType: "naqd", amountStr: "" }]);

  const [addMaterialExpense, setAddMaterialExpense] = useState(false);
  const [matExpType, setMatExpType] = useState(linkedExpense?.subcategory || materialOptions[0] || "");
  const [matExpAmountStr, setMatExpAmountStr] = useState(
    linkedExpense ? fmt(linkedExpense.amount) : (initial?.materialSum != null ? fmt(initial.materialSum) : "")
  );
  const [matExpPaymentType, setMatExpPaymentType] = useState(linkedExpense?.paymentType || "naqd");
  const [newMatExpOpen, setNewMatExpOpen] = useState(false);
  const [newMatExpName, setNewMatExpName] = useState("");
  const [newMatLineOpen, setNewMatLineOpen] = useState(null);
  const [newMatLineName, setNewMatLineName] = useState("");

  const [note, setNote] = useState(initial?.note || "");
  const [error, setError] = useState("");

  const materialLinesComputed = materialLines.map((l) => {
    const area = parseFloat((l.areaStr || "").replace(",", ".")) || 0;
    const price = parseFloat((l.priceStr || "").replace(",", ".")) || 0;
    return { ...l, area, price, lineTotalUsd: area * price };
  });
  const totalArea = materialLinesComputed.reduce((s, l) => s + l.area, 0);
  const totalUsdNum = materialLinesComputed.reduce((s, l) => s + l.lineTotalUsd, 0);
  const exchangeRateNum = parseInt(exchangeRateStr.replace(/\s/g, ""), 10) || 0;
  const autoTotalUzs = Math.round(totalUsdNum * exchangeRateNum);
  const agreementUzs = parseInt(agreementStr.replace(/\s/g, ""), 10) || 0;

  const kraskaSumTotal = parseInt(kraskaStr.replace(/\s/g, ""), 10) || 0;
  const matExpAmountNum = parseInt(matExpAmountStr.replace(/\s/g, ""), 10) || 0;
  const materialSumForCalc = matExpAmountNum;
  const brakSumForCalc = isEdit ? orderBrakSum(initial, transactions) : 0;
  const addedValueUzs = agreementUzs - kraskaSumTotal - materialSumForCalc - brakSumForCalc;
  const initPaymentNum = initPaymentLines.reduce((s, l) => s + (parseInt((l.amountStr || "").replace(/\s/g, ""), 10) || 0), 0);
  const alreadyPaidUzs = isEdit ? orderTotalPaid(initial) : (addInitialPayment ? initPaymentNum : 0);
  const debtUzs = Math.max(0, agreementUzs - alreadyPaidUzs);

  useEffect(() => {
    if (!kraskaTouched && autoTotalUzs > 0) {
      setKraskaStr(fmt(autoTotalUzs));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTotalUzs]);

  function handleKraskaChange(e) {
    const digits = e.target.value.replace(/\D/g, "");
    setKraskaStr(digits ? fmt(parseInt(digits, 10)) : "");
    setKraskaTouched(true);
  }
  function resetKraska() {
    setKraskaTouched(false);
    setKraskaStr(fmt(autoTotalUzs));
  }

  function updateMaterialLine(id, field, value) {
    setMaterialLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }
  function addMaterialLine() {
    setMaterialLines((prev) => [...prev, { id: uid(), materialType: materialOptions[0] || "", areaStr: "", priceStr: "" }]);
  }
  function removeMaterialLine(id) {
    setMaterialLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  }
  function submitNewMaterialLine(lineId) {
    const clean = newMatLineName.trim();
    if (!clean) return;
    if (!materialOptions.includes(clean)) onAddSubcategory("Material", clean);
    updateMaterialLine(lineId, "materialType", clean);
    setNewMatLineName("");
    setNewMatLineOpen(null);
  }
  function handleAgreementChange(e) {
    const digits = e.target.value.replace(/\D/g, "");
    setAgreementStr(digits ? fmt(parseInt(digits, 10)) : "");
  }
  function handleExchangeRateChange(e) {
    const digits = e.target.value.replace(/\D/g, "");
    setExchangeRateStr(digits ? fmt(parseInt(digits, 10)) : "");
  }
  function submitNewMatExp() {
    const clean = newMatExpName.trim();
    if (!clean) return;
    if (!materialOptions.includes(clean)) onAddSubcategory("Material", clean);
    setMatExpType(clean);
    setNewMatExpName("");
    setNewMatExpOpen(false);
  }
  function handleMatExpAmountChange(e) {
    const digits = e.target.value.replace(/\D/g, "");
    setMatExpAmountStr(digits ? fmt(parseInt(digits, 10)) : "");
  }

  function submit() {
    if (!date) return setError("Sanani tanlang");
    if (!customer.trim()) return setError("Mijoz nomini kiriting");
    if (!agreementUzs || agreementUzs <= 0) return setError("Umumiy buyurtma summasini kiriting");
    if (totalUsdNum > 0 && (!exchangeRateNum || exchangeRateNum <= 0)) return setError("Kraska hisob-kitobida $ narx kiritilgan bo'lsa, USD kursini ham kiriting");
    if (addMaterialExpense && (!matExpAmountNum || matExpAmountNum <= 0)) return setError("Material xarajati summasini kiriting");
    if (addInitialPayment && (!initPaymentNum || initPaymentNum <= 0)) return setError("Boshlang'ich to'lov summasini kiriting");

    const order = {
      id: orderId,
      orderNumber: initial?.orderNumber || generateOrderNumber(allOrders, date),
      date,
      customer: customer.trim(),
      subcategory: bizLine,
      materialType: materialLinesComputed.map((l) => l.materialType).filter(Boolean).join(", "),
      materialLines: materialLinesComputed.map((l) => ({ materialType: l.materialType, area: l.area, priceUsd: l.price, totalUsd: l.lineTotalUsd })),
      manager,
      area: totalArea,
      exchangeRate: exchangeRateNum,
      agreementUsd: totalUsdNum,
      agreementUzs,
      kraskaLines: kraskaSumTotal > 0 ? [{ amount: kraskaSumTotal }] : [],
      kraskaSum: kraskaSumTotal,
      materialSum: matExpAmountNum,
      payments: initial?.payments || [],
      note: note.trim(),
      createdBy: initial?.createdBy || currentUser.name,
      createdAt: initial?.createdAt || new Date().toISOString(),
      photos: photos,
    };

    if (!isEdit && addInitialPayment && initPaymentNum > 0) {
      order.payments = initPaymentLines
        .filter((l) => (parseInt((l.amountStr || "").replace(/\s/g, ""), 10) || 0) > 0)
        .map((l) => ({
          id: uid(), amount: parseInt(l.amountStr.replace(/\s/g, ""), 10), date, paymentType: l.methodType,
          comment: "Boshlang'ich to'lov", createdBy: currentUser.name, createdAt: new Date().toISOString(),
        }));
    }

    let linkedExpenseTx = null;
    if (linkedExpense) {
      // Mavjud bog'liq xarajat — qiymatlarni yangilaymiz (agar summa 0 bo'lsa, eskisiga tegmaymiz)
      if (matExpAmountNum > 0) {
        linkedExpenseTx = {
          ...linkedExpense, category: "Material", subcategory: matExpType,
          amount: matExpAmountNum, paymentType: matExpPaymentType, date: linkedExpense.date,
        };
      }
    } else if (addMaterialExpense && matExpAmountNum > 0) {
      linkedExpenseTx = {
        id: uid(), type: "chiqim", date, category: "Material", subcategory: matExpType,
        amount: matExpAmountNum, paymentType: matExpPaymentType,
        note: `Buyurtma ${order.orderNumber} (${customer.trim()}) uchun material xarajati`,
        createdBy: currentUser.name, createdAt: new Date().toISOString(), relatedOrderId: order.id,
      };
    }
    onSave(order, linkedExpenseTx);
  }

  return (
    <Modal title={isEdit ? `Buyurtmani tahrirlash — ${initial.orderNumber}` : "Yangi buyurtma"} onClose={onClose} width={720}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Sana">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={getInputStyle()} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Mijoz">
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Mijoz ismi" style={getInputStyle()} />
          </Field>
          <Field label="Sub kategoriya">
            <div style={{ display: "flex", gap: 6, background: THEME.surface, borderRadius: 11, padding: 3 }}>
              {BIZ_LINES.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setBizLine(opt)}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                    background: bizLine === opt ? THEME.card : "transparent",
                    color: bizLine === opt ? THEME.violet : THEME.muted,
                    boxShadow: bizLine === opt ? THEME.shadowSm : "none",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Mas'ul menedjer">
          {managerNames.length > 0 ? (
            <select value={manager} onChange={(e) => setManager(e.target.value)} style={getInputStyle()}>
              {managerNames.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Menedjer ismi" style={getInputStyle()} />
          )}
          <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
            Ushbu buyurtma uchun mas'ul bo'lgan menedjer — "Xodimlar" bo'limida qo'shilgan xodimlar ro'yxatidan tanlanadi.
          </div>
        </Field>

        {/* 1) UMUMIY BUYURTMA SUMMASI — hodim tomonidan to'g'ridan-to'g'ri kiritiladi */}
        <Field label="Umumiy buyurtma summasi (so'm)">
          <input
            value={agreementStr}
            onChange={handleAgreementChange}
            placeholder="0"
            inputMode="numeric"
            style={{ ...getInputStyle(), fontSize: 20, fontWeight: 800, color: THEME.violet, padding: "13px 14px" }}
          />
          <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 4 }}>
            Mijoz bilan kelishilgan umumiy summani shu yerga kiriting.
          </div>
        </Field>

        {/* 2) BOSHLANG'ICH TO'LOV / AVANS — Umumiy buyurtma summasidan keyin, darhol */}
        {!isEdit && (
          <div style={{ borderTop: `1px dashed ${THEME.border}`, paddingTop: 12, marginTop: 2 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: THEME.text }}>
              <input type="checkbox" checked={addInitialPayment} onChange={(e) => setAddInitialPayment(e.target.checked)} style={{ width: 16, height: 16 }} />
              Boshlang'ich to'lov (avans) bor
            </label>
            {addInitialPayment && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, padding: 12, background: THEME.surface, borderRadius: 11 }}>
                <div style={{ fontSize: 11, color: THEME.muted, marginBottom: -4 }}>
                  Mijoz bir nechta usul orqali to'lagan bo'lsa (masalan qisman naqd, qisman karta), har birini alohida qator sifatida kiriting.
                </div>
                <MultiPaymentLines lines={initPaymentLines} onChange={setInitPaymentLines} bg={THEME.card} />
                {initPaymentLines.length > 1 && initPaymentNum > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 800, textAlign: "right", color: THEME.violet }}>
                    Jami: {money(initPaymentNum)}
                  </div>
                )}
                <div style={{ fontSize: 11, color: THEME.muted }}>
                  Keyingi to'lovlarni buyurtma ochilgandan so'ng "To'lovlar" oynasidan qo'shishingiz mumkin.
                </div>
              </div>
            )}
          </div>
        )}
        {isEdit && (
          <div style={{ borderTop: `1px dashed ${THEME.border}`, paddingTop: 12, marginTop: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>To'lovlar (avans)</div>
            <div style={{ padding: 12, background: THEME.surface, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: THEME.green }}>{money(orderTotalPaid(initial))}</div>
                <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 2 }}>
                  {(initial.payments || []).filter((p) => !p.deletedAt).length} ta to'lov qayd etilgan — bu joyda o'chirilmagan, faqat forma ichida ko'rinmaydi
                </div>
              </div>
              <div style={{ fontSize: 11, color: THEME.muted, maxWidth: 220 }}>
                To'lov qo'shish, o'chirish yoki tarixini ko'rish uchun buyurtmalar ro'yxatida <b style={{ color: THEME.text }}>"To'lovlar"</b> tugmasidan foydalaning.
              </div>
            </div>
          </div>
        )}

        {/* Qo'shimcha $ hisob-kitobi (ixtiyoriy) — Kraska hisob-kitobiga asos bo'ladi */}
        <div style={{ borderTop: `1px dashed ${THEME.border}`, paddingTop: 12, marginTop: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Qo'shimcha $ hisob-kitobi (ixtiyoriy) — Material turlari va kv/m</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {materialLinesComputed.map((line) => (
              <div key={line.id} style={{ padding: 10, background: THEME.surface, borderRadius: 11 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr auto", gap: 8, alignItems: "start" }}>
                  <div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <select value={line.materialType} onChange={(e) => updateMaterialLine(line.id, "materialType", e.target.value)} style={{ ...getInputStyle(), background: THEME.card }}>
                        {materialOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <button type="button" onClick={() => setNewMatLineOpen(newMatLineOpen === line.id ? null : line.id)} title="Yangi material turi" style={{ ...getIconBtn(), flexShrink: 0, padding: "0 10px", background: THEME.card }}>
                        <Plus size={14} />
                      </button>
                    </div>
                    {newMatLineOpen === line.id && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <input
                          autoFocus
                          value={newMatLineName}
                          onChange={(e) => setNewMatLineName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submitNewMaterialLine(line.id))}
                          placeholder="Yangi material turi nomi"
                          style={{ ...getInputStyle(), fontSize: 12.5, background: THEME.card }}
                        />
                        <Button type="button" onClick={() => submitNewMaterialLine(line.id)} style={{ padding: "8px 12px", fontSize: 12 }}>Qo'shish</Button>
                      </div>
                    )}
                  </div>
                  <input
                    value={line.areaStr}
                    onChange={(e) => updateMaterialLine(line.id, "areaStr", sanitizeDecimal(e.target.value))}
                    placeholder="Kv/m"
                    inputMode="decimal"
                    style={{ ...getInputStyle(), background: THEME.card }}
                  />
                  <input
                    value={line.priceStr}
                    onChange={(e) => updateMaterialLine(line.id, "priceStr", sanitizeDecimal(e.target.value))}
                    placeholder="$ / m²"
                    inputMode="decimal"
                    style={{ ...getInputStyle(), background: THEME.card }}
                  />
                  <button
                    type="button"
                    onClick={() => removeMaterialLine(line.id)}
                    disabled={materialLines.length <= 1}
                    className="uvix-iconbtn"
                    style={{ ...getIconBtn(), background: THEME.card, opacity: materialLines.length <= 1 ? 0.35 : 1, marginTop: 0 }}
                  >
                    <X size={14} color={THEME.rose} />
                  </button>
                </div>
                {line.lineTotalUsd > 0 && (
                  <div style={{ fontSize: 11, color: THEME.muted, marginTop: 6, textAlign: "right" }}>
                    {line.area} m² × {usd(line.price)} = <b style={{ color: THEME.text }}>{usd(line.lineTotalUsd)}</b>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addMaterialLine} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, background: "none", border: "none", color: THEME.violet, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>
            <Plus size={14} /> Yana material turi qo'shish
          </button>
          {totalUsdNum > 0 && (
            <div style={{ marginTop: 10 }}>
              <Field label="USD kursi (1 $ = ? so'm)">
                <input
                  value={exchangeRateStr}
                  onChange={handleExchangeRateChange}
                  placeholder="12 700"
                  inputMode="numeric"
                  style={{ ...getInputStyle(), fontSize: 15, fontWeight: 700 }}
                />
              </Field>
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
                Jami: {usd(totalUsdNum)}{exchangeRateNum > 0 ? ` ≈ ${money(autoTotalUzs)}` : ""}
              </div>
            </div>
          )}
        </div>

        {/* KRASKA HISOB-KITOBI — yuqoridagi $ hisob-kitobi jamisidan avtomatik olinadi */}
        <Field label="Kraska hisob-kitobi (so'm)">
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={kraskaStr}
              onChange={handleKraskaChange}
              placeholder="0"
              inputMode="numeric"
              style={{ ...getInputStyle(), fontSize: 16, fontWeight: 700 }}
            />
            {kraskaTouched && autoTotalUzs > 0 && (
              <button type="button" onClick={resetKraska} title="Avtomatik hisoblanganga qaytarish" style={{ ...getIconBtn(), flexShrink: 0, padding: "0 10px" }}>
                <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} />
              </button>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 4 }}>
            {kraskaTouched ? "Qo'lda kiritilgan qiymat" : "Qo'shimcha $ hisob-kitobi jamisidan avtomatik olinadi — kerak bo'lsa qo'lda o'zgartirishingiz mumkin"}
          </div>
        </Field>

        {/* 4) QARZDORLIK */}
        <Field label="Qarzdorlik">
          <div style={{
            padding: "10px 12px", borderRadius: 11, fontSize: 17, fontWeight: 800,
            background: debtUzs > 0 ? THEME.roseBg : THEME.greenBg,
            color: debtUzs > 0 ? THEME.rose : THEME.green,
            border: debtUzs > 0 ? `1.5px solid ${THEME.roseBorder}` : `1.5px solid ${THEME.border}`,
          }}>
            {money(debtUzs)}
          </div>
          <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
            Umumiy buyurtma − {isEdit ? "hozirgacha to'langan summalar" : "boshlang'ich to'lov"}
          </div>
        </Field>

        {/* 5) QO'SHILGAN QIYMAT */}
        <Field label="Qo'shilgan qiymat (avtomatik)">
          <div style={{
            padding: "10px 12px", borderRadius: 11, fontSize: 16, fontWeight: 800,
            background: addedValueUzs >= 0 ? THEME.greenBg : THEME.roseBg,
            color: addedValueUzs >= 0 ? THEME.green : THEME.rose,
            border: addedValueUzs >= 0 ? `1.5px solid ${THEME.border}` : `1.5px solid ${THEME.roseBorder}`,
          }}>
            {money(addedValueUzs)}
          </div>
          <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
            Umumiy buyurtma − Kraska summasi − Material xarajati{brakSumForCalc > 0 ? ` − Brak (${money(brakSumForCalc)})` : ""}
          </div>
        </Field>


        <div style={{ borderTop: `1px dashed ${THEME.border}`, paddingTop: 12, marginTop: 2 }}>
          {linkedExpense ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>Material xarajati (MATERIALGA PUL XARAJATLARI)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, background: THEME.surface, borderRadius: 11 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Material turi">
                    <div style={{ display: "flex", gap: 6 }}>
                      <select value={matExpType} onChange={(e) => setMatExpType(e.target.value)} style={{ ...getInputStyle(), background: THEME.card }}>
                        {materialOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <button type="button" onClick={() => setNewMatExpOpen((v) => !v)} title="Yangi material turi" style={{ ...getIconBtn(), flexShrink: 0, padding: "0 10px", background: THEME.card }}>
                        <Plus size={14} />
                      </button>
                    </div>
                    {newMatExpOpen && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <input
                          autoFocus
                          value={newMatExpName}
                          onChange={(e) => setNewMatExpName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submitNewMatExp())}
                          placeholder="Yangi material turi nomi"
                          style={{ ...getInputStyle(), fontSize: 12.5, background: THEME.card }}
                        />
                        <Button type="button" onClick={submitNewMatExp} style={{ padding: "8px 12px", fontSize: 12 }}>Qo'shish</Button>
                      </div>
                    )}
                  </Field>
                  <Field label="Xarajat summasi (so'm)">
                    <input value={matExpAmountStr} onChange={handleMatExpAmountChange} placeholder="0" inputMode="numeric" style={{ ...getInputStyle(), background: THEME.card }} />
                  </Field>
                </div>
                <Field label="To'lov turi (material uchun)">
                  <PaymentTypeSelector value={matExpPaymentType} onChange={setMatExpPaymentType} size="small" />
                </Field>
                <div style={{ fontSize: 11, color: THEME.muted }}>
                  Bu buyurtmaga bog'liq material xarajati Rasxod → Material bo'limida ham avtomatik yangilanadi.
                </div>
              </div>
            </>
          ) : (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: THEME.text }}>
                <input type="checkbox" checked={addMaterialExpense} onChange={(e) => setAddMaterialExpense(e.target.checked)} style={{ width: 16, height: 16 }} />
                Ushbu buyurtma uchun material xarajatini ham shu yerda kiritish (MATERIALGA PUL XARAJATLARI)
              </label>
              {addMaterialExpense && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, padding: 12, background: THEME.surface, borderRadius: 11 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Field label="Material turi">
                      <div style={{ display: "flex", gap: 6 }}>
                        <select value={matExpType} onChange={(e) => setMatExpType(e.target.value)} style={getInputStyle()}>
                          {materialOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <button type="button" onClick={() => setNewMatExpOpen((v) => !v)} title="Yangi material turi" style={{ ...getIconBtn(), flexShrink: 0, padding: "0 10px", background: THEME.card }}>
                          <Plus size={14} />
                        </button>
                      </div>
                      {newMatExpOpen && (
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <input
                            autoFocus
                            value={newMatExpName}
                            onChange={(e) => setNewMatExpName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submitNewMatExp())}
                            placeholder="Yangi material turi nomi"
                            style={{ ...getInputStyle(), fontSize: 12.5, background: THEME.card }}
                          />
                          <Button type="button" onClick={submitNewMatExp} style={{ padding: "8px 12px", fontSize: 12 }}>Qo'shish</Button>
                        </div>
                      )}
                    </Field>
                    <Field label="Xarajat summasi (so'm)">
                      <input value={matExpAmountStr} onChange={handleMatExpAmountChange} placeholder="0" inputMode="numeric" style={{ ...getInputStyle(), background: THEME.card }} />
                    </Field>
                  </div>
                  <Field label="To'lov turi (material uchun)">
                    <PaymentTypeSelector value={matExpPaymentType} onChange={setMatExpPaymentType} size="small" />
                  </Field>
                  <div style={{ fontSize: 11, color: THEME.muted }}>
                    Bu xarajat avtomatik ravishda Rasxod → Material bo'limiga ham qo'shiladi.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <Field label="Kommentariya">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Qo'shimcha izoh (ixtiyoriy)" style={{ ...getInputStyle(), resize: "vertical" }} />
        </Field>

        {onUploadPhotos && (
          <div style={{ borderTop: `1px dashed ${THEME.border}`, paddingTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: THEME.text }}>Fotolar ({photos.length}/10)</label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading || photos.length >= 10}
                style={{ display: "flex", alignItems: "center", gap: 5, background: THEME.violetSoft, color: THEME.violet, border: "none", borderRadius: 9, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: photoUploading ? "not-allowed" : "pointer", opacity: photoUploading || photos.length >= 10 ? 0.6 : 1 }}
              >
                <Upload size={13} /> {photoUploading ? "Yuklanmoqda..." : "Rasm qo'shish"}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoSelect} style={{ display: "none" }} />
            </div>
            {photoError && <div style={{ color: THEME.rose, fontSize: 12, marginBottom: 8 }}>{photoError}</div>}
            {photos.length === 0 ? (
              <div style={{ fontSize: 12, color: THEME.muted, padding: "10px 0" }}>Hali rasm yuklanmagan — jarayon yoki tayyor mahsulot suratlarini qo'shishingiz mumkin.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8 }}>
                {photos.map((p) => (
                  <div key={p.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: `1px solid ${THEME.border}` }}>
                    <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <button
                      type="button"
                      onClick={() => handlePhotoDelete(p)}
                      style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(20,16,30,0.7)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
