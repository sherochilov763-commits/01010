// exportPro.js — professional Excel (exceljs) va PDF (jsPDF) eksport. Barcha bo'limlar shu bitta dvigateldan foydalanadi.
// Hujjat tavsifi:
//   { fileBase, title, meta: ["Davr: …", "Yo'nalish: …"], kpis: [{ label, value, tone }],
//     sheets: [{ name, sections: [{ title, color, columns: [{ key, label, type, width, total }], rows: [...], note }] }] }
//   type: "text" | "money" | "int" | "num" | "pct" | "date"; total: "sum" — «Jami» qatori formula bilan.
//   Qator { __group: "UVIXPRINT", __color: "#1F5FD6" } — guruh sarlavhasi (yo'nalish); { __bold: true } — qalin.
import { LINE_META } from "./lines.js";

const COMPANY = "UVIX";
const DARK = "FF18181B", HEAD = "FF1F2937", GRID = "FFE5E5EA", ZEBRA = "FFF8F8FA";
const hex = (c) => "FF" + String(c || "#64748B").replace("#", "").toUpperCase().slice(0, 6);
const tint = (c, k = 0.85) => {
  const h = String(c || "#64748B").replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const m = (v) => Math.round(v + (255 - v) * k).toString(16).padStart(2, "0");
  return ("FF" + m(r) + m(g) + m(b)).toUpperCase();
};
const nowLabel = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
export const dmy = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : s || "");
export const lineName = (l) => LINE_META[l]?.name || (l === "common" ? "Umumiy" : l || "");
const colLetter = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const NUMFMT = { money: '#,##0;[Red]-#,##0;"—"', int: "#,##0", num: "#,##0.##", pct: "0%" };
const sanitizeSheet = (n) => String(n || "Varaq").replace(/[\\/?*[\]:]/g, " ").slice(0, 31);

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

// ------------------------------------------------------------- Excel
export async function buildWorkbook(doc) {
  const ExcelJS = await (await import("exceljs")).default; // await — demo'da kutubxona keyin yuklanadi (thenable)
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY; wb.created = new Date();
  for (const sh of doc.sheets) {
    const maxCols = Math.max(...sh.sections.map((s) => s.columns.length), 2);
    const ws = wb.addWorksheet(sanitizeSheet(sh.name), {
      views: [{ state: "frozen", ySplit: 0, showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: maxCols > 6 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
      headerFooter: { oddFooter: `&L${COMPANY} · ${doc.title}&R&P / &N` },
    });
    // Sarlavha bloki
    ws.mergeCells(1, 1, 1, maxCols);
    const t = ws.getCell(1, 1);
    t.value = `${COMPANY} — ${doc.title}${sh.name && doc.sheets.length > 1 ? ` · ${sh.name}` : ""}`;
    t.font = { name: "Calibri", size: 15, bold: true, color: { argb: "FFFFFFFF" } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
    t.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(1).height = 30;
    const meta = [...(doc.meta || []), `Tuzildi: ${nowLabel()}${doc.user ? `, ${doc.user}` : ""}`].join("  ·  ");
    ws.mergeCells(2, 1, 2, maxCols);
    const m = ws.getCell(2, 1);
    m.value = meta; m.font = { size: 10, color: { argb: "FF52525B" } }; m.alignment = { indent: 1, vertical: "middle" };
    ws.getRow(2).height = 20;
    let r = 4;
    let firstHeader = 0;
    const widths = new Array(maxCols).fill(10);
    for (const sec of sh.sections) {
      if (sec.title) {
        ws.mergeCells(r, 1, r, maxCols);
        const c = ws.getCell(r, 1);
        c.value = sec.title;
        c.font = { bold: true, size: 12, color: { argb: sec.color ? hex(sec.color) : "FF18181B" } };
        if (sec.color) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tint(sec.color, 0.88) } };
        c.alignment = { indent: 1, vertical: "middle" };
        ws.getRow(r).height = 22;
        r++;
      }
      // Bosh qator
      sec.columns.forEach((col, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = col.label;
        c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10.5 };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD } };
        c.alignment = { vertical: "middle", horizontal: col.type && col.type !== "text" && col.type !== "date" ? "right" : "left", wrapText: true, indent: 0 };
        c.border = { bottom: { style: "thin", color: { argb: HEAD } } };
        widths[i] = Math.max(widths[i], col.width || Math.min(40, String(col.label).length + 4));
      });
      ws.getRow(r).height = 24;
      if (!firstHeader) firstHeader = r;
      const headRow = r;
      r++;
      const dataStart = r;
      let zebra = 0;
      const dataRows = [];
      for (const row of sec.rows) {
        if (row.__group) {
          ws.mergeCells(r, 1, r, sec.columns.length);
          const c = ws.getCell(r, 1);
          c.value = row.__label || lineName(row.__group);
          const col = row.__color || LINE_META[row.__group]?.color || "#52525B";
          c.font = { bold: true, color: { argb: hex(col) } };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tint(col, 0.86) } };
          c.alignment = { indent: 1 };
          r++; zebra = 0; continue;
        }
        sec.columns.forEach((col, i) => {
          const c = ws.getCell(r, i + 1);
          let v = row[col.key];
          if (col.type === "date" && v) v = dmy(v);
          if ((col.type === "money" || col.type === "int" || col.type === "num") && v !== "" && v != null && !(typeof v === "string" && /%$/.test(v))) v = Number(v) || 0;
          if (col.type === "pct" && v != null && v !== "") v = Number(v);
          c.value = v == null ? "" : v;
          if (NUMFMT[col.type]) c.numFmt = NUMFMT[col.type];
          c.alignment = { vertical: "middle", horizontal: col.type && col.type !== "text" && col.type !== "date" ? "right" : "left", wrapText: col.wrap || false };
          c.border = { bottom: { style: "hair", color: { argb: GRID } } };
          if (zebra % 2) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
          if (row.__bold || col.bold) c.font = { bold: true };
          if (col.color && row[`${col.key}__color`]) c.font = { ...(c.font || {}), color: { argb: hex(row[`${col.key}__color`]) } };
          const len = String(c.value ?? "").length + (col.type === "money" ? 4 : 2);
          widths[i] = Math.min(col.maxWidth || 48, Math.max(widths[i], len));
        });
        dataRows.push(r);
        r++; zebra++;
      }
      // Jami — formula bilan (Excel'da raqam o'zgarsa, o'zi qayta hisoblanadi)
      if (sec.columns.some((c) => c.total) && dataRows.length) {
        sec.columns.forEach((col, i) => {
          const c = ws.getCell(r, i + 1);
          const L = colLetter(i + 1);
          if (i === 0) c.value = sec.totalLabel || "JAMI";
          else if (col.total === "sum") {
            const contiguous = dataRows.length === dataRows[dataRows.length - 1] - dataRows[0] + 1;
            const f = contiguous ? `SUM(${L}${dataStart}:${L}${r - 1})` : `SUM(${dataRows.map((x) => `${L}${x}`).join(",")})`;
            const result = sec.rows.filter((x) => !x.__group).reduce((s, x) => s + (Number(x[col.key]) || 0), 0);
            c.value = { formula: f, result };
          } else if (typeof col.total === "string" && col.total.startsWith("=")) c.value = { formula: col.total.slice(1) };
          if (NUMFMT[col.type]) c.numFmt = NUMFMT[col.type];
          c.font = { bold: true, size: 11 };
          c.alignment = { horizontal: i === 0 ? "left" : "right", vertical: "middle" };
          c.border = { top: { style: "medium", color: { argb: DARK } } };
          if (sec.highlightLast && i === sec.columns.length - 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
        });
        ws.getRow(r).height = 22;
        r++;
      }
      if (sec.note) { ws.mergeCells(r, 1, r, maxCols); const c = ws.getCell(r, 1); c.value = sec.note; c.font = { italic: true, size: 9.5, color: { argb: "FF6E6E77" } }; r++; }
      if (sh.sections.length === 1 && sec.rows.length > 1) ws.autoFilter = { from: { row: headRow, column: 1 }, to: { row: headRow, column: sec.columns.length } };
      r += 1;
    }
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = Math.max(9, w); });
    if (firstHeader) {
      ws.views = [{ state: "frozen", ySplit: firstHeader, showGridLines: false }];
      ws.pageSetup.printTitlesRow = `${firstHeader}:${firstHeader}`;
    }
  }
  // «Ma'lumot» varag'i
  if (doc.info !== false) {
    const ws = wb.addWorksheet("Ma'lumot", { views: [{ showGridLines: false }] });
    ws.getColumn(1).width = 26; ws.getColumn(2).width = 60;
    const rows = [["Hisobot", doc.title], ...(doc.meta || []).map((x) => { const i = x.indexOf(":"); return i > 0 ? [x.slice(0, i), x.slice(i + 1).trim()] : ["", x]; }), ["Tuzildi", nowLabel()], ...(doc.user ? [["Kim tuzdi", doc.user]] : []), ["Dastur", "UVIX — moliya va ishlab chiqarish tizimi"]];
    rows.forEach(([a, b], i) => { ws.getCell(i + 1, 1).value = a; ws.getCell(i + 1, 1).font = { bold: true, color: { argb: "FF52525B" } }; ws.getCell(i + 1, 2).value = b; });
  }
  return wb;
}

export async function exportXlsx(doc) {
  const wb = await buildWorkbook(doc);
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${doc.fileBase}.xlsx`);
}

// ------------------------------------------------------------- PDF
const PDF_C = { ink: [24, 24, 27], muted: [110, 110, 119], line: [229, 229, 234], head: [31, 41, 55], zebra: [248, 248, 250], green: [21, 128, 61], rose: [220, 38, 38] };
const rgb = (h) => { const x = String(h || "#52525B").replace("#", ""); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };
const fmtN = (v) => { const n = Math.round(Number(v) || 0); return `${n < 0 ? "−" : ""}${Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`; };
const cellText = (col, v) => {
  if (v == null || v === "") return "";
  if (typeof v === "string" && /%$/.test(v)) return v;
  if (col.type === "money" || col.type === "int") return Number(v) === 0 && col.type === "money" ? "—" : fmtN(v);
  if (col.type === "num") return String(Math.round(Number(v) * 100) / 100).replace(".", ",");
  if (col.type === "pct") return `${Math.round(Number(v) * 100)}%`;
  if (col.type === "date") return dmy(v);
  return String(v);
};

export async function exportPdf(doc) {
  const [jm, auto, reg, bold] = await Promise.all([import("jspdf"), import("jspdf-autotable"), import("../assets/fonts/onestRegular.js"), import("../assets/fonts/onestBold.js")]);
  const autoTable = await (auto.default || auto.autoTable);
  const jsPDF = await jm.jsPDF;
  const wide = doc.sheets.some((s) => s.sections.some((x) => x.columns.length > 6));
  const pdf = new jsPDF({ orientation: wide ? "landscape" : "portrait", unit: "pt", format: "a4" });
  pdf.addFileToVFS("Onest-Regular.ttf", reg.default); pdf.addFont("Onest-Regular.ttf", "Onest", "normal");
  pdf.addFileToVFS("Onest-Bold.ttf", bold.default); pdf.addFont("Onest-Bold.ttf", "Onest", "bold");
  pdf.setFont("Onest", "normal");
  const W = pdf.internal.pageSize.getWidth(), M = 36;
  // Sarlavha
  pdf.setFillColor(24, 24, 27); pdf.roundedRect(M, M, 30, 30, 6, 6, "F");
  pdf.setTextColor(255, 255, 255); pdf.setFont("Onest", "bold"); pdf.setFontSize(10); pdf.text("UV", M + 15, M + 19, { align: "center" });
  pdf.setTextColor(...PDF_C.ink); pdf.setFontSize(17); pdf.text(doc.title, M + 42, M + 14);
  pdf.setFont("Onest", "normal"); pdf.setFontSize(9); pdf.setTextColor(...PDF_C.muted);
  pdf.text([...(doc.meta || []), `Tuzildi: ${nowLabel()}${doc.user ? `, ${doc.user}` : ""}`].join("  ·  "), M + 42, M + 28, { maxWidth: W - M * 2 - 42 });
  pdf.setDrawColor(24, 24, 27); pdf.setLineWidth(1.2); pdf.line(M, M + 40, W - M, M + 40);
  let y = M + 54;
  // KPI kartalar
  if (doc.kpis?.length) {
    const n = doc.kpis.length, gap = 8, w = (W - M * 2 - gap * (n - 1)) / n;
    doc.kpis.forEach((k, i) => {
      const x = M + i * (w + gap);
      const tone = k.tone === "rose" ? [254, 242, 242] : k.tone === "green" ? [240, 253, 244] : [244, 244, 245];
      pdf.setFillColor(...tone); pdf.roundedRect(x, y, w, 44, 6, 6, "F");
      pdf.setFontSize(8.5); pdf.setTextColor(...PDF_C.muted); pdf.text(k.label, x + 8, y + 15);
      pdf.setFont("Onest", "bold"); pdf.setFontSize(13); pdf.setTextColor(...(k.tone === "rose" ? PDF_C.rose : k.tone === "green" ? PDF_C.green : PDF_C.ink));
      pdf.text(String(k.value), x + 8, y + 34); pdf.setFont("Onest", "normal");
    });
    y += 58;
  }
  for (const sh of doc.sheets) {
    for (const sec of sh.sections) {
      const title = [doc.sheets.length > 1 && sh.sections.indexOf(sec) === 0 ? sh.name : null, sec.title].filter(Boolean).join(" · ");
      if (y > pdf.internal.pageSize.getHeight() - 90) { pdf.addPage(); y = M; }
      if (title) { pdf.setFont("Onest", "bold"); pdf.setFontSize(11.5); pdf.setTextColor(...(sec.color ? rgb(sec.color) : PDF_C.ink)); pdf.text(title, M, y + 4); y += 12; }
      const body = sec.rows.map((row) => row.__group
        ? [{ content: row.__label || lineName(row.__group), colSpan: sec.columns.length, styles: { fontStyle: "bold", textColor: rgb(row.__color || LINE_META[row.__group]?.color), fillColor: rgb(row.__color || LINE_META[row.__group]?.color).map((v) => Math.round(v + (255 - v) * 0.86)) } }]
        : sec.columns.map((c) => ({ content: cellText(c, row[c.key]), styles: { fontStyle: row.__bold ? "bold" : "normal", textColor: (c.type === "money" && Number(row[c.key]) < 0) ? PDF_C.rose : row[`${c.key}__color`] ? rgb(row[`${c.key}__color`]) : PDF_C.ink } })));
      const foot = sec.columns.some((c) => c.total) && sec.rows.some((r) => !r.__group)
        ? [sec.columns.map((c, i) => (i === 0 ? sec.totalLabel || "JAMI" : c.total === "sum" ? cellText(c, sec.rows.filter((x) => !x.__group).reduce((s, x) => s + (Number(x[c.key]) || 0), 0)) : ""))]
        : undefined;
      autoTable(pdf, {
        startY: y + 4, margin: { left: M, right: M },
        head: [sec.columns.map((c) => c.label)], body, foot,
        styles: { font: "Onest", fontSize: 8.5, cellPadding: 4, lineColor: PDF_C.line, lineWidth: 0, textColor: PDF_C.ink, overflow: "linebreak" },
        headStyles: { fillColor: PDF_C.head, textColor: [255, 255, 255], fontStyle: "bold" },
        footStyles: { fillColor: [255, 255, 255], textColor: PDF_C.ink, fontStyle: "bold", lineWidth: { top: 1.2 }, lineColor: PDF_C.ink },
        alternateRowStyles: { fillColor: PDF_C.zebra },
        columnStyles: Object.fromEntries(sec.columns.map((c, i) => [i, { halign: c.type && c.type !== "text" && c.type !== "date" ? "right" : "left", cellWidth: c.pdfWidth || "auto" }])),
        didParseCell: (d) => { if (d.section !== "body") d.cell.styles.halign = d.column.index && sec.columns[d.column.index]?.type && !["text", "date"].includes(sec.columns[d.column.index].type) ? "right" : "left"; },
      });
      y = pdf.lastAutoTable.finalY + 18;
      if (sec.note) { pdf.setFontSize(8); pdf.setTextColor(...PDF_C.muted); pdf.text(sec.note, M, y - 6, { maxWidth: W - M * 2 }); y += 6; }
    }
  }
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(...PDF_C.muted);
    const H = pdf.internal.pageSize.getHeight();
    pdf.text(`${COMPANY} · ${doc.title}`, M, H - 18); pdf.text(`${i} / ${pages}`, W - M, H - 18, { align: "right" });
  }
  pdf.save(`${doc.fileBase}.pdf`);
}

export async function exportDoc(doc, kind) { return kind === "pdf" ? exportPdf(doc) : exportXlsx(doc); }

// ------------------------------------------------------------- Yordamchilar: ro'yxatni yo'nalish bo'yicha guruhlash
// split=true — har yo'nalish alohida bo'lim (Yonma-yon). lineOf(row) → "UVIXPRINT" | "UVONYX" | "common".
export function splitSections(base, rows, lineOf, split) {
  if (!split) return [{ ...base, rows }];
  const order = ["UVIXPRINT", "UVONYX", "common"];
  return order.map((l) => ({ ...base, title: [base.title, lineName(l)].filter(Boolean).join(" · "), color: LINE_META[l]?.color || "#52525B", rows: rows.filter((r) => (lineOf(r) || "common") === l) })).filter((s) => s.rows.length);
}
export function periodMeta(range, line, split) {
  const p = range?.from && range?.to ? `Davr: ${dmy(range.from)} — ${dmy(range.to)}` : "Davr: barcha vaqt";
  const l = split ? "Yo'nalish: yonma-yon (alohida)" : line && line !== "all" ? `Yo'nalish: ${lineName(line)}` : "Yo'nalish: barchasi";
  return [p, l];
}
export const fileStamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

// ------------------------------------------------------------- Kassalar
export async function kassaDoc({ rep, moves, lines, range, months, orders, transactions, split, user, line }) {
  const { computePnlMonths } = await import("./pnl.js");
  const { pnlRowsPlain } = await import("./pnlRows.js");
  const TYPES = [["naqd", "Naqd"], ["karta", "Karta"], ["bank", "Bank"]];
  const cols = [
    { key: "k", label: "Kassa", width: 22 },
    { key: "open", label: "Boshida", type: "money", total: "sum" },
    { key: "in", label: "Kirim", type: "money", total: "sum" },
    { key: "out", label: "Chiqim", type: "money", total: "sum" },
    { key: "tr", label: "O'tkazma", type: "money", total: "sum" },
    { key: "close", label: "Oxirida", type: "money", total: "sum", bold: true },
  ];
  const rowsFor = (l) => TYPES.map(([t, n]) => { const r = rep.rows[l][t]; return { k: n, open: r.open, in: r.in, out: -r.out, tr: r.tin - r.tout, close: r.close }; });
  const balSections = split
    ? lines.map((l) => ({ title: lineName(l), color: LINE_META[l]?.color, columns: cols, rows: rowsFor(l), highlightLast: true }))
    : [{ columns: cols, rows: lines.flatMap((l) => [{ __group: l }, ...rowsFor(l)]), highlightLast: true, note: "Boshida + kirim − chiqim ± o'tkazma = oxirida. Umumiy rasxod — qaysi kassadan to'langan bo'lsa, o'shandan." }];
  const pnl = computePnlMonths(orders, transactions, months, null);
  const pl = lines.length === 1 ? lines : ["UVIXPRINT", "UVONYX"];
  const pnlCols = [{ key: "l", label: "Ko'rsatkich", width: 40 }, ...pl.map((l) => ({ key: l, label: lineName(l), type: "money" })), ...(pl.length > 1 ? [{ key: "total", label: "Jami", type: "money", bold: true }] : [])];
  const pnlRows = pnlRowsPlain(pnl).map((r) => ({ l: r.l, __bold: r.strong, ...Object.fromEntries([...pl, "total"].map((k) => [k, r.isPct ? (r.v(k === "total" ? pnl.total : pnl[k]) == null ? "" : `${Math.round(r.v(k === "total" ? pnl.total : pnl[k]) * 100)}%`) : r.v(k === "total" ? pnl.total : pnl[k])])) }));
  const PT = { naqd: "Naqd", karta: "Karta", bank: "Bank" };
  const mvCols = [
    { key: "date", label: "Sana", type: "date", width: 12 },
    { key: "kassa", label: "Kassa", width: 22 },
    { key: "title", label: "Tavsif", width: 44, maxWidth: 60 },
    { key: "who", label: "Kim", width: 16 },
    { key: "amount", label: "Summa", type: "money", total: "sum" },
  ];
  const mvRows = moves.filter((m) => line === "all" || !line || m.line === line || m.toLine === line).map((m) => ({ date: m.date, kassa: `${lineName(m.line)} · ${PT[m.type]}${m.kind === "transfer" ? ` > ${lineName(m.toLine)} · ${PT[m.toType]}` : ""}`, title: m.title, who: m.who, amount: m.kind === "out" ? -m.amount : m.kind === "in" ? m.amount : 0, amount__color: m.kind === "transfer" ? "#6E6E77" : null }));
  const tot = lines.reduce((a, l) => { const x = rep.lines[l]; a.open += x.open; a.in += x.in; a.out += x.out; a.close += x.close; return a; }, { open: 0, in: 0, out: 0, close: 0 });
  return {
    fileBase: `UVIX_Kassa_${range.from ? range.from.slice(0, 7) : "barcha"}_${fileStamp()}`,
    title: "Kassa hisoboti", user,
    meta: periodMeta(range, line, split),
    kpis: [{ label: "Boshida", value: fmtN(tot.open) }, { label: "Kirim", value: "+" + fmtN(tot.in), tone: "green" }, { label: "Chiqim", value: "−" + fmtN(tot.out), tone: "rose" }, { label: "Oxirida", value: fmtN(tot.close) }, { label: "Sof foyda", value: fmtN(lines.length === 1 ? pnl[lines[0]].profit : pnl.total.profit), tone: (lines.length === 1 ? pnl[lines[0]].profit : pnl.total.profit) < 0 ? "rose" : "green" }],
    sheets: [
      { name: "Qoldiqlar", sections: balSections },
      { name: "Foyda va zarar", sections: [{ columns: pnlCols, rows: pnlRows, note: "Tushum — davrda kelgan to'lovlar; umumiy rasxod har oy o'sha oy tushumi ulushida bo'linadi." }] },
      { name: "Harakatlar", sections: [{ columns: mvCols, rows: mvRows, totalLabel: "JAMI (kirim − chiqim)" }] },
    ],
  };
}
export async function exportKassaXlsx(a) { return exportXlsx(await kassaDoc({ ...a, line: a.lines.length === 1 ? a.lines[0] : "all" })); }
export async function exportKassaPdf(a) { return exportPdf(await kassaDoc({ ...a, line: a.lines.length === 1 ? a.lines[0] : "all" })); }
