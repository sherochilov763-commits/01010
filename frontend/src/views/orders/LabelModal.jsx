// LabelModal.jsx — buyurtma yorlig'i (QR kod bilan) — chop etish (mobil 3-bosqich, 6-band).
// Yorliq ishga yopishtiriladi: pechatchi/dizayner telefonda «Skaner» bilan o'qiydi va vazifasini darhol ochadi;
// xodim telefoni bilan o'qisa — buyurtma ochiladi. Yorliqda pul ma'lumoti yo'q.
// Bir nechta buyurtma (smetaning hammasi) bir varaqda chiqarilishi mumkin.
import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Button, Modal } from "../../components/ui.jsx";
import { orderQrUrl } from "../../components/PhoneToDesktop.jsx";
import { shortDateUz } from "../../lib/format.js";
import { THEME } from "../../theme.js";

export const LABEL_SIZES = [
  { key: "58x40", label: "58 × 40 mm", sub: "termoprinter", w: 58, h: 40 },
  { key: "100x70", label: "100 × 70 mm", sub: "katta yorliq", w: 100, h: 70 },
];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Yorliq matni — toza funksiya (testlanadi)
export function labelInfo(o) {
  const size = o.design?.format || "";
  const area = o.area ? `${String(Math.round(o.area * 100) / 100).replace(".", ",")} m²` : "";
  const deadline = o.print?.deadline || o.design?.deadline || "";
  return {
    no: o.orderNumber || "",
    part: o.groupSize > 1 ? `${o.groupIdx}/${o.groupSize}` : "",
    title: o.title || o.materialType || o.subcategory || "Buyurtma",
    spec: [o.title && o.materialType && o.materialType !== o.title ? o.materialType : "", size, area].filter(Boolean).join(" · "),
    customer: o.customer || "",
    date: shortDateUz(o.date),
    deadline: deadline ? shortDateUz(deadline) : "",
  };
}

let qrLib = null;
async function qrSvg(text) {
  if (!qrLib) qrLib = (await import("qrcode-generator")).default;
  const qr = qrLib(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

function labelHtml(o, svg, size) {
  const L = labelInfo(o);
  const big = size.w >= 90;
  return `<section class="lbl" data-label="${esc(L.no)}">
    <div class="qr">${svg}</div>
    <div class="txt">
      <div class="no">${esc(L.no)}${L.part ? ` <span>${esc(L.part)}</span>` : ""}</div>
      <div class="ti">${esc(L.title)}</div>
      ${L.spec ? `<div class="sp">${esc(L.spec)}</div>` : ""}
      <div class="cu">${esc(L.customer)}</div>
      <div class="dt">${esc(L.date)}${L.deadline ? ` · muddat ${esc(L.deadline)}` : ""}${big ? " · UVIX" : ""}</div>
    </div>
  </section>`;
}

export function labelsDocument(parts, size) {
  const s = size;
  const qr = Math.min(s.h - 6, s.w * 0.42);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Yorliqlar</title><style>
  @page { size: ${s.w}mm ${s.h}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lbl { width: ${s.w}mm; height: ${s.h}mm; padding: 2.5mm; display: flex; gap: 2.5mm; align-items: center; overflow: hidden; page-break-after: always; break-after: page; }
  .lbl:last-child { page-break-after: auto; break-after: auto; }
  .qr { width: ${qr}mm; height: ${qr}mm; flex-shrink: 0; } .qr svg { width: 100%; height: 100%; display: block; }
  .txt { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: ${s.w >= 90 ? 1.6 : 0.8}mm; }
  .no { font-family: "Courier New", monospace; font-weight: 700; font-size: ${s.w >= 90 ? 15 : 9.5}pt; letter-spacing: -0.3pt; white-space: nowrap; }
  .no span { font-family: Arial, sans-serif; font-size: 0.8em; border: 0.3mm solid #000; border-radius: 1mm; padding: 0 0.8mm; }
  .ti { font-weight: 700; font-size: ${s.w >= 90 ? 14 : 8.5}pt; line-height: 1.12; max-height: 2.3em; overflow: hidden; }
  .sp, .cu, .dt { font-size: ${s.w >= 90 ? 10 : 6.5}pt; line-height: 1.2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .cu { font-weight: 700; }
  </style></head><body>${parts.join("")}</body></html>`;
}

// Chop etish: yashirin iframe (sahifadan chiqib ketmaydi). Testlar uchun window.__uvixPrintHook.
function printHtml(html) {
  if (typeof window.__uvixPrintHook === "function") { window.__uvixPrintHook(html); return; }
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(f);
  const d = f.contentDocument;
  d.open(); d.write(html); d.close();
  setTimeout(() => {
    try { f.contentWindow.focus(); f.contentWindow.print(); } catch { /* */ }
    setTimeout(() => f.remove(), 60000);
  }, 250);
}

export default function LabelModal({ order, group, onClose }) {
  const [all, setAll] = useState(false);
  const [size, setSize] = useState(() => { try { return LABEL_SIZES.find((s) => s.key === localStorage.getItem("uvix_label_size")) || LABEL_SIZES[0]; } catch { return LABEL_SIZES[0]; } });
  const [copies, setCopies] = useState(1);
  const [svgs, setSvgs] = useState(null);
  const [err, setErr] = useState("");
  const list = useMemo(() => (all && group?.length > 1 ? group : [order]).filter(Boolean), [all, group, order]);
  useEffect(() => {
    let alive = true;
    Promise.all(list.map((o) => qrSvg(orderQrUrl(o.id)))).then((r) => alive && setSvgs(r)).catch(() => alive && setErr("QR kodni yaratib bo'lmadi"));
    return () => { alive = false; };
  }, [list]);
  const pick = (s) => { setSize(s); try { localStorage.setItem("uvix_label_size", s.key); } catch { /* */ } };
  function print() {
    if (!svgs) return;
    const parts = [];
    list.forEach((o, i) => { for (let k = 0; k < copies; k++) parts.push(labelHtml(o, svgs[i], size)); });
    printHtml(labelsDocument(parts, size));
  }
  const seg = (on) => ({ flex: 1, minHeight: 44, borderRadius: 10, border: `1px solid ${on ? THEME.violet : THEME.border2}`, background: on ? THEME.violetSoft : THEME.card, color: THEME.text, cursor: "pointer", fontFamily: "inherit", padding: "6px 10px", textAlign: "left" });
  const L0 = list[0] ? labelInfo(list[0]) : null;
  const scale = size.w >= 90 ? 3.2 : 4.6; // ko'rinish: mm → px
  return (
    <Modal title={list.length > 1 ? `Yorliqlar · ${list.length} ta buyurtma` : "QR yorliq"} onClose={onClose} width={480}>
      <div data-testid="label-modal" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {L0 && (
          <div style={{ display: "flex", justifyContent: "center", padding: 14, background: THEME.chip, borderRadius: 12 }}>
            <div data-testid="label-preview" style={{ width: size.w * scale, height: size.h * scale, maxWidth: "100%", background: "#fff", color: "#000", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,.18)", padding: 10, display: "flex", gap: 10, alignItems: "center", boxSizing: "border-box", fontFamily: "Arial, sans-serif", overflow: "hidden" }}>
              <div style={{ width: Math.min(size.h * scale - 20, size.w * scale * 0.42), aspectRatio: "1 / 1", flexShrink: 0 }}
                dangerouslySetInnerHTML={{ __html: svgs ? svgs[0].replace("<svg ", '<svg style="width:100%;height:100%;display:block" ') : "" }} />
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ fontFamily: "'Courier New', monospace", fontWeight: 700, fontSize: size.w >= 90 ? 17 : 14, whiteSpace: "nowrap" }}>{L0.no}{L0.part && ` · ${L0.part}`}</div>
                <div style={{ fontWeight: 700, fontSize: size.w >= 90 ? 16 : 13, lineHeight: 1.15 }}>{L0.title}</div>
                {L0.spec && <div style={{ fontSize: 11.5 }}>{L0.spec}</div>}
                <div style={{ fontSize: 11.5, fontWeight: 700 }}>{L0.customer}</div>
                <div style={{ fontSize: 11 }}>{L0.date}{L0.deadline && ` · muddat ${L0.deadline}`}</div>
              </div>
            </div>
          </div>
        )}
        {group?.length > 1 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setAll(false)} aria-pressed={!all} style={seg(!all)}><div style={{ fontSize: 14, fontWeight: 700 }}>Faqat shu</div><div style={{ fontSize: 12, color: THEME.muted }}>{order.orderNumber}</div></button>
            <button type="button" onClick={() => setAll(true)} aria-pressed={all} data-testid="label-all" style={seg(all)}><div style={{ fontSize: 14, fontWeight: 700 }}>Smetaning hammasi</div><div style={{ fontSize: 12, color: THEME.muted }}>{group.length} ta buyurtma</div></button>
          </div>
        )}
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: THEME.muted, marginBottom: 6 }}>O'lcham</div>
          <div style={{ display: "flex", gap: 8 }}>
            {LABEL_SIZES.map((s) => (
              <button key={s.key} type="button" onClick={() => pick(s)} aria-pressed={size.key === s.key} data-size={s.key} style={seg(size.key === s.key)}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: THEME.muted }}>{s.sub}</div>
              </button>
            ))}
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
          <span style={{ flex: 1, color: THEME.muted, fontWeight: 600 }}>Har biridan nusxa</span>
          <input type="number" min={1} max={20} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(20, Math.round(Number(e.target.value) || 1))))} data-testid="label-copies"
            style={{ width: 80, height: 40, borderRadius: 10, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, textAlign: "center", fontFamily: "inherit", fontSize: 15 }} />
        </label>
        <div style={{ fontSize: 12.5, color: THEME.muted, lineHeight: 1.5 }}>
          Yorliqni ishga yopishtiring. Pechatchi yoki dizayner telefonda <b style={{ color: THEME.text }}>Skaner</b> bilan o'qisa — vazifasi ochiladi va «Tayyor»ni bosadi. Yorliqda summa ko'rsatilmaydi.
        </div>
        {err && <div role="alert" style={{ color: THEME.rose, fontSize: 13 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>Yopish</Button>
          <Button onClick={print} disabled={!svgs} data-testid="label-print"><Printer size={15} /> Chop etish{list.length * copies > 1 ? ` (${list.length * copies})` : ""}</Button>
        </div>
      </div>
    </Modal>
  );
}
