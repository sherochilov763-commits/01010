// excel-pro.js — serverdagi professional Excel (Telegram'ga har kuni boradigan hisobot). Brauzerdagi exportPro.js bilan bir xil uslub.
const ExcelJS = require("exceljs");
const DARK = "FF18181B", HEAD = "FF1F2937", GRID = "FFE5E5EA", ZEBRA = "FFF8F8FA";
const LINE = { UVIXPRINT: "1F5FD6", UVONYX: "0E7C6B" };
const tint = (h, k = 0.86) => "FF" + [0, 2, 4].map((i) => { const v = parseInt(h.slice(i, i + 2), 16); return Math.round(v + (255 - v) * k).toString(16).padStart(2, "0"); }).join("").toUpperCase();
const L = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const FMT = { money: '#,##0;[Red]-#,##0;"—"', num: "#,##0.##" };
const dmy = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : s || "");

// sheets: [{ name, title, columns: [{ key, label, type, total }], rows: [{ ..., __group }] }]
async function buildWorkbook({ title, meta = [], sheets }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UVIX";
  for (const sh of sheets) {
    const n = sh.columns.length;
    const ws = wb.addWorksheet(sh.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 4, showGridLines: false }], pageSetup: { paperSize: 9, orientation: n > 6 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.mergeCells(1, 1, 1, n);
    Object.assign(ws.getCell(1, 1), { value: `UVIX — ${title} · ${sh.name}` });
    ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
    ws.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
    ws.getCell(1, 1).alignment = { vertical: "middle", indent: 1 };
    ws.getRow(1).height = 30;
    ws.mergeCells(2, 1, 2, n);
    ws.getCell(2, 1).value = meta.join("  ·  ");
    ws.getCell(2, 1).font = { size: 10, color: { argb: "FF52525B" } };
    ws.getCell(2, 1).alignment = { indent: 1 };
    const widths = sh.columns.map((c) => Math.max(10, String(c.label).length + 3));
    sh.columns.forEach((c, i) => {
      const cell = ws.getCell(4, i + 1);
      cell.value = c.label;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD } };
      cell.alignment = { horizontal: c.type ? "right" : "left", vertical: "middle", wrapText: true };
    });
    ws.getRow(4).height = 24;
    let r = 5; const first = r; const data = [];
    let z = 0;
    for (const row of sh.rows) {
      if (row.__group) {
        ws.mergeCells(r, 1, r, n);
        const c = ws.getCell(r, 1); const col = LINE[row.__group] || "52525B";
        c.value = row.__group; c.font = { bold: true, color: { argb: "FF" + col } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tint(col) } };
        r++; z = 0; continue;
      }
      sh.columns.forEach((col, i) => {
        const c = ws.getCell(r, i + 1);
        let v = row[col.key];
        if (col.type === "date") v = dmy(v);
        if (col.type === "money" || col.type === "num") v = Number(v) || 0;
        c.value = v == null ? "" : v;
        if (FMT[col.type]) c.numFmt = FMT[col.type];
        c.alignment = { horizontal: col.type && col.type !== "date" ? "right" : "left" };
        c.border = { bottom: { style: "hair", color: { argb: GRID } } };
        if (z % 2) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
        widths[i] = Math.min(48, Math.max(widths[i], String(c.value).length + 3));
      });
      data.push(r); r++; z++;
    }
    if (data.length && sh.columns.some((c) => c.total)) {
      sh.columns.forEach((col, i) => {
        const c = ws.getCell(r, i + 1);
        if (i === 0) c.value = "JAMI";
        else if (col.total) { const contiguous = data.length === data[data.length - 1] - data[0] + 1; c.value = { formula: contiguous ? `SUM(${L(i + 1)}${first}:${L(i + 1)}${r - 1})` : `SUM(${data.map((x) => L(i + 1) + x).join(",")})` }; }
        if (FMT[col.type]) c.numFmt = FMT[col.type];
        c.font = { bold: true }; c.border = { top: { style: "medium", color: { argb: DARK } } };
        c.alignment = { horizontal: i ? "right" : "left" };
      });
    }
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    if (sh.rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: n } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
module.exports = { buildWorkbook };
