// analytics-pdf.js — «Hisobot va tahlil» natijasidan A4 PDF (pdfkit, shriftlar backend/fonts ichida).
const path = require("path");
const PDFDocument = require("pdfkit");

const FONTS = path.join(__dirname, "fonts");
const C = { ink: "#17142A", muted: "#6B6880", line: "#E6E4EE", green: "#0B7A52", rose: "#C42B3F", violet: "#6A4BF0", soft: "#F4F3F8" };
const STRIP = ["#00AEEF", "#EC008C", "#FFD400", "#17142A", "#F2F1F6", "#6A4BF0"];
const num = (n) => `${n < 0 ? "-" : ""}${Math.round(Math.abs(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
const mln = (n) => (Math.abs(n || 0) >= 1e9 ? `${(Math.round((n || 0) / 1e8) / 10).toLocaleString("ru-RU")} mlrd` : `${(Math.round((n || 0) / 100000) / 10).toLocaleString("ru-RU")} mln`);
const pctS = (p) => (p == null ? "yangi" : `${p > 0 ? "+" : ""}${p.toFixed(1).replace(".", ",")}%`);
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const dLabel = (s) => { const [y, m, d] = s.split("-").map(Number); return `${d}-${MONTHS[m - 1]} ${y}`; };

module.exports = function makeAnalyticsPdf(r, { company = "UV bosma ustaxonasi", createdAt } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true, info: { Title: `UVIX hisobot — ${r.label}`, Author: "UVIX CRM" } });
    doc.registerFont("R", path.join(FONTS, "Onest-Regular.woff"));
    doc.registerFont("S", path.join(FONTS, "Onest-SemiBold.woff"));
    doc.registerFont("B", path.join(FONTS, "Onest-Bold.woff"));
    doc.registerFont("U", path.join(FONTS, "Unbounded-Bold.woff"));
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width, L = 48, R = W - 48, CW = R - L;
    const ensure = (h) => { if (doc.y + h > doc.page.height - 70) doc.addPage(); };
    const text = (s, x, y, o = {}) => doc.font(o.font || "R").fontSize(o.size || 10).fillColor(o.color || C.ink).text(s, x, y, { width: o.width, align: o.align || "left", lineBreak: o.lineBreak ?? false });

    // sarlavha
    text("UVIX", L, 48, { font: "U", size: 22 });
    text(company, L, 76, { size: 9.5, color: C.muted });
    text(r.mode === "yoy" ? "Hisobot (o'tgan yil bilan)" : "Hisobot", L, 48, { font: "B", size: 17, width: CW, align: "right" });
    text(`${r.label} · tuzildi ${dLabel(createdAt || r.to)}`, L, 72, { size: 9.5, color: C.muted, width: CW, align: "right" });
    doc.moveTo(L, 96).lineTo(R, 96).lineWidth(1.5).strokeColor(C.ink).stroke();

    // KPI kartalar
    const k = [
      ["Tushum", mln(r.cur.revenue), pctS(r.delta.revenue)],
      ["Qo'shilgan qiymat", mln(r.cur.added), pctS(r.delta.added)],
      ["Sof foyda", mln(r.cur.net), pctS(r.delta.net)],
      ["Marja", `${r.cur.margin.toFixed(1).replace(".", ",")}%`, `${(r.cur.margin - r.prev.margin) >= 0 ? "+" : ""}${(r.cur.margin - r.prev.margin).toFixed(1).replace(".", ",")} p.p.`],
    ];
    const kw = (CW - 24) / 4;
    k.forEach(([l, v, d], i) => {
      const x = L + i * (kw + 8), y = 112;
      doc.roundedRect(x, y, kw, 58, 8).lineWidth(0.8).strokeColor(C.line).stroke();
      text(l, x + 10, y + 9, { size: 8.5, color: C.muted });
      text(v, x + 10, y + 22, { font: "B", size: 14 });
      text(d, x + 10, y + 42, { font: "S", size: 8.5, color: d.startsWith("-") ? C.rose : C.green });
    });
    doc.y = 188;

    // jadval yordamchisi
    const cols = [L, R - 270, R - 160, R - 60];
    function row(cells, o = {}) {
      ensure(20);
      const y = doc.y;
      const f = o.bold ? "B" : "R";
      text(cells[0], cols[0] + (o.indent ? 12 : 0), y + 5, { font: f, size: o.size || 9.5, color: o.color || (o.indent ? "#55526A" : C.ink), width: cols[1] - cols[0] - 10 });
      for (let i = 1; i < cells.length; i++) text(cells[i], cols[i] - 90, y + 5, { font: f, size: o.size || 9.5, color: o.color || C.ink, width: (i === cells.length - 1 ? R : cols[i + 1] || R) - (cols[i] - 90) - (i === cells.length - 1 ? 0 : 10), align: "right" });
      const yy = y + (o.size ? 22 : 19);
      doc.moveTo(L, yy).lineTo(R, yy).lineWidth(o.strong ? 1.2 : 0.5).strokeColor(o.strong ? C.ink : C.line).stroke();
      doc.y = yy;
    }
    const h = (s, need = 60) => { ensure(need); doc.y += 14; text(s, L, doc.y, { font: "B", size: 12 }); doc.y += 20; };

    h("Foyda va zarar");
    row(["Modda", r.label, r.cmp.label, "O'zgarish"], { color: C.muted, size: 8.5 });
    row(["Tushum (buyurtmalar)", num(r.cur.revenue), num(r.prev.revenue), pctS(r.delta.revenue)]);
    row(["Kraska", num(-r.cur.kraska), num(-r.prev.kraska), pctS(r.delta.kraska)], { indent: true });
    row(["Material", num(-r.cur.material), num(-r.prev.material), pctS(r.delta.material)], { indent: true });
    row(["Brak", num(-r.cur.brak), num(-r.prev.brak), pctS(r.delta.brak)], { indent: true });
    row(["Qo'shilgan qiymat", num(r.cur.added), num(r.prev.added), pctS(r.delta.added)], { bold: true, strong: true });
    for (const c of r.cats) row([c.name, num(-c.cur), num(-c.prev), pctS(c.prev ? ((c.cur - c.prev) / c.prev) * 100 : c.cur ? null : 0)], { indent: true });
    row(["Operatsion rasxodlar", num(-r.cur.opex), num(-r.prev.opex), pctS(r.delta.opex)], { bold: true, strong: true });
    row(["Sof foyda", num(r.cur.net), num(r.prev.net), pctS(r.delta.net)], { bold: true, color: r.cur.net >= 0 ? C.green : C.rose, size: 11 });
    if (r.cur.owner) row(["Shaxsiy xarajatlar (foydadan olingan)", num(-r.cur.owner), num(-r.prev.owner), ""], { indent: true });

    h("Pul oqimi");
    row(["Kirgan to'lovlar", num(r.cur.cashIn), num(r.prev.cashIn), pctS(r.delta.cashIn)]);
    row(["To'langan rasxodlar (hammasi)", num(-r.cur.cashOut), num(-r.prev.cashOut), ""]);
    row(["Sof pul oqimi", num(r.cur.cashNet), num(r.prev.cashNet), ""], { bold: true, strong: true });
    row(["Davr oxiridagi qarzdorlik", num(r.cur.debt), num(r.prev.debt), `${r.delta.debt >= 0 ? "+" : ""}${num(r.delta.debt)}`]);

    if (r.managers.length) {
      h("Menejerlar", 80);
      const mc = [L, R - 330, R - 240, R - 150, R - 60];
      ensure(20);
      const hdr = ["Menejer", "Buyurtma", "Aylanma", "Yig'ilgan", "Konversiya"];
      let y = doc.y;
      hdr.forEach((s, i) => text(s, i ? mc[i] - 80 : L, y + 5, { size: 8.5, color: C.muted, width: i ? (mc[i + 1] || R) - (mc[i] - 80) - (i === 4 ? 0 : 10) : 200, align: i ? "right" : "left" }));
      doc.y = y + 19; doc.moveTo(L, doc.y).lineTo(R, doc.y).lineWidth(0.5).strokeColor(C.line).stroke();
      r.managers.slice(0, 12).forEach((m, idx) => {
        ensure(20); y = doc.y;
        const vals = [`${idx + 1}. ${m.name}`, String(m.orders), num(m.revenue), num(m.collected), m.conversion == null ? "—" : `${Math.round(m.conversion)}%`];
        vals.forEach((s, i) => text(s, i ? mc[i] - 80 : L, y + 5, { size: 9.5, font: i ? "R" : "S", width: i ? (mc[i + 1] || R) - (mc[i] - 80) - (i === 4 ? 0 : 10) : 220, align: i ? "right" : "left" }));
        doc.y = y + 19; doc.moveTo(L, doc.y).lineTo(R, doc.y).lineWidth(0.5).strokeColor(C.line).stroke();
      });
    }

    if (r.insights.length) {
      h("Xulosalar", 40 + r.insights.length * 30);
      for (const s of r.insights) {
        ensure(30);
        const y = doc.y;
        doc.circle(L + 3, y + 7, 2).fillColor(C.violet).fill();
        doc.font("R").fontSize(9.5).fillColor(C.ink).text(s, L + 12, y + 1, { width: CW - 12 });
        doc.y += 6;
      }
    }

    // pastki qism (har sahifada)
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const ph = doc.page.height;
      doc.page.margins.bottom = 0; // pastki yozuv yangi sahifa ochib yubormasin
      text("UVIX CRM · avtomatik tuzilgan hisobot · hisoblangan usul: buyurtma sanasi bo'yicha", L, ph - 40, { size: 7.5, color: "#9A97AC" });
      text(`${i + 1} / ${range.count}`, L, ph - 40, { size: 7.5, color: "#9A97AC", width: CW, align: "right" });
      const sw = W / STRIP.length;
      STRIP.forEach((c, j) => doc.rect(j * sw, ph - 8, sw + 1, 8).fill(c));
    }
    doc.end();
  });
};
