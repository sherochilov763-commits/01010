// LeadArchive.jsx — yopilgan va yo'qotilgan lidlar arxivi: oy/yil bo'yicha, qidiruv, oylik statistika, qayta ochish, Excel
import { useMemo, useState } from "react";
import { Download, RotateCcw, Search, Phone } from "lucide-react";
import { Button, Card, Incremental, getInputStyle, useIsMobile } from "../../components/ui.jsx";
import { LEAD_STAGES } from "../../constants.js";
import { money, moneyCompact } from "../../lib/format.js";
import { closedDate, inPeriod, isClosed, leadValue, monthKeyOf } from "../../lib/leads.js";
import { PeriodPicker } from "./PeriodPicker.jsx";
import { SourceChip, TgHandle } from "../../components/LeadSource.jsx";
import { exportRows } from "../../lib/excel.js";
import { THEME } from "../../theme.js";

const UZ_MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const monthTitle = (mk) => { const [y, m] = mk.split("-"); return `${UZ_MONTHS[Number(m) - 1] || "?"} ${y}`; };
const shortDate = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`; };
const WON = LEAD_STAGES.find((s) => s.key === "won");
const LOST = LEAD_STAGES.find((s) => s.key === "lost");

function stats(list) {
  const won = list.filter((x) => x.lead.stage === "won");
  const lost = list.filter((x) => x.lead.stage === "lost");
  const sum = (arr) => arr.reduce((a, x) => a + x.value, 0);
  const total = won.length + lost.length;
  return { won: won.length, wonSum: sum(won), lost: lost.length, lostSum: sum(lost), conv: total ? Math.round((won.length / total) * 100) : 0 };
}

export function LeadArchive({ leads, orders, period, periodSel, onPeriod, onReopen }) {
  const isMobile = useIsMobile();
  const ordersById = useMemo(() => new Map((orders || []).map((o) => [o.id, o])), [orders]);
  const all = useMemo(() => (leads || []).filter(isClosed).map((lead) => {
    const date = closedDate(lead, ordersById);
    return { lead, date, month: monthKeyOf(date) || "0000-00", value: leadValue(lead, ordersById) };
  }).sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))), [leads, ordersById]);

  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return all.filter((x) => {
      if (periodSel.mode !== "all" && !inPeriod(x.date, period)) return false;
      if (status !== "all" && x.lead.stage !== status) return false;
      if (!s) return true;
      const l = x.lead;
      return (l.customer || "").toLowerCase().includes(s) || (l.manager || "").toLowerCase().includes(s) || (digits.length >= 3 && (l.phone || "").replace(/\D/g, "").includes(digits));
    });
  }, [all, period, periodSel.mode, status, q]);

  const groups = useMemo(() => {
    const m = new Map();
    filtered.forEach((x) => { if (!m.has(x.month)) m.set(x.month, []); m.get(x.month).push(x); });
    return [...m.entries()];
  }, [filtered]);
  const total = stats(filtered);

  function exportExcel() {
    const rows = filtered.map((x) => ({
      "Sana": shortDate(x.date),
      "Oy": x.month !== "0000-00" ? monthTitle(x.month) : "",
      "Mijoz": x.lead.customer || "",
      "Telefon": x.lead.phone || "",
      "Holat": x.lead.stage === "won" ? "Yopilgan" : "Yo'qotilgan",
      "Summa (so'm)": x.value,
      "Menejer": x.lead.manager || "",
      "Manba": x.lead.source || "",
      "Izoh": x.lead.notes || "",
    }));
    exportRows(rows, "Arxiv", `UVIX_lidlar_arxivi_${periodSel.mode === "all" ? "barchasi" : `${period.from}_${period.to}`}.xlsx`);
  }

  const seg = (active) => ({ padding: "7px 12px", borderRadius: 9, border: 0, cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", background: active ? THEME.card : "transparent", color: active ? THEME.text : THEME.muted, boxShadow: active ? THEME.shadowSm : "none" });
  const statBox = (label, value, sub, color) => (
    <div style={{ flex: "1 1 150px", padding: "12px 14px", borderRadius: 14, background: THEME.card, border: `1px solid ${THEME.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || THEME.text, fontFamily: THEME.fontNum, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div data-testid="lead-archive" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <PeriodPicker value={periodSel} onChange={onPeriod} withAll />
        <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 11, background: THEME.surface }}>
          <button type="button" style={seg(status === "all")} onClick={() => setStatus("all")}>Hammasi</button>
          <button type="button" style={seg(status === "won")} onClick={() => setStatus("won")}>Yopilgan</button>
          <button type="button" style={seg(status === "lost")} onClick={() => setStatus("lost")}>Yo'qotilgan</button>
        </div>
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 180 }}>
          <Search size={14} color={THEME.muted} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mijoz, telefon yoki menejer" style={{ ...getInputStyle(), paddingLeft: 32 }} aria-label="Arxivdan qidirish" />
        </div>
        <Button variant="ghost" onClick={exportExcel} disabled={!filtered.length}><Download size={14} /> Excel</Button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {statBox("Yopilgan", `${total.won} ta`, money(total.wonSum), WON.color)}
        {statBox("Yo'qotilgan", `${total.lost} ta`, money(total.lostSum), LOST.color)}
        {statBox("Konversiya", `${total.conv}%`, "yopilgan / (yopilgan + yo'qotilgan)")}
      </div>

      {groups.length === 0 ? (
        <div style={{ fontSize: 13.5, color: THEME.muted, padding: "32px 16px", textAlign: "center", border: `1.5px dashed ${THEME.border}`, borderRadius: 16 }}>
          {all.length === 0 ? "Arxiv hozircha bo'sh — yopilgan lidlar oy tugagach shu yerga tushadi" : "Tanlangan filtr bo'yicha lid topilmadi"}
        </div>
      ) : groups.map(([month, list]) => {
        const st = stats(list);
        return (
          <Card key={month} style={{ padding: 0, overflow: "hidden" }}>
            <div data-testid="archive-month" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "12px 16px", borderBottom: `1px solid ${THEME.border}`, background: THEME.surface }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text }}>{month === "0000-00" ? "Sanasi noma'lum" : monthTitle(month)}</div>
              <div style={{ display: "flex", gap: 14, fontSize: 12.5, color: THEME.muted, flexWrap: "wrap" }}>
                <span><b style={{ color: WON.color }}>{st.won}</b> yopildi · <b style={{ color: WON.color, fontFamily: THEME.fontNum }}>{moneyCompact(st.wonSum)}</b></span>
                <span><b style={{ color: LOST.color }}>{st.lost}</b> yo'qotildi</span>
                <span>Konversiya <b style={{ color: THEME.text }}>{st.conv}%</b></span>
              </div>
            </div>
            <div>
              <Incremental list={list} step={25} render={(x) => {
                const l = x.lead;
                const won = l.stage === "won";
                return (
                  <div key={l.id} data-testid="archive-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderTop: `1px solid ${THEME.border}`, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: won ? WON.color : LOST.color, flexShrink: 0 }} title={won ? "Yopilgan" : "Yo'qotilgan"} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: THEME.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.customer}</div>
                      <div style={{ fontSize: 11.5, color: THEME.muted, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
                        <span>{shortDate(x.date)}</span>
                        {l.phone && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Phone size={10} /> {l.phone}</span>}
                        {l.manager && <span>{l.manager}</span>}
                        {l.source && <SourceChip source={l.source} />}
                        <TgHandle username={l.telegramUsername} />
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: won ? WON.color : THEME.muted, fontFamily: THEME.fontNum, whiteSpace: "nowrap" }}>{money(x.value)}</div>
                    <Button variant="ghost" onClick={() => onReopen(l)} style={{ padding: "7px 10px", fontSize: 12 }}>
                      <RotateCcw size={13} /> Qayta ochish
                    </Button>
                  </div>
                );
              }} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
