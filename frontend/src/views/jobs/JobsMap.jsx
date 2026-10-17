// JobsMap.jsx — «Xarita» (menejer uchun): vazifalar joyi, bir nechtasini tanlab xodimga berish, xodimning kunlik yo'li
// va «Yo'lni tartiblash» (eng yaqin qo'shni). «Xodimlar · hozir» — faqat ish vaqtidagi kuzatuv (rahbar / katta menejer).
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPinOff, Navigation, Radar, Route, Users } from "lucide-react";
import { fetchGeoLive, fetchGeoTrail, saveGeoConfig } from "../../storage.js";
import { THEME } from "../../theme.js";
import { avatarColor, initials } from "../../auth/LoginScreen.jsx";
import { Avatar } from "./JobParts.jsx";
import { LeafletMap, avatarHtml, pinHtml } from "./LeafletMap.jsx";
import { JOB_KINDS, byWhen, isLate, isOpen, today, whenText } from "./jobsLib.js";
import { fmtKm, nearestOrder, okGeo, roadKm, routeKm, yandexRoute } from "./geoLib.js";

const panel = { background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 10 };
const secT = (t) => <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: THEME.muted }}>{t}</div>;
const sel = { height: 36, borderRadius: 10, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, fontFamily: "inherit", fontSize: 13.5, padding: "0 8px", minWidth: 0 };
const pbtn = (bg) => ({ height: 38, padding: "0 14px", borderRadius: 10, border: 0, background: bg, color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 });

export function JobsMap({ list, employees, canWatch, isAdmin, isMobile, onOpen, onPatch, onPlan }) {
  const [tab, setTab] = useState("jobs");
  return (
    <div data-testid="jobs-map">
      {canWatch && (
        <div role="group" style={{ display: "inline-flex", background: THEME.chip, borderRadius: 10, padding: 3, marginBottom: 10 }}>
          {[["jobs", "Vazifalar", Route], ["live", "Xodimlar · hozir", Radar]].map(([k, l, I]) => (
            <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} data-map-tab={k}
              style={{ height: 32, padding: "0 14px", border: 0, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 6, background: tab === k ? THEME.card : "transparent", color: tab === k ? THEME.text : THEME.muted, boxShadow: tab === k ? THEME.shadowSm : "none" }}><I size={15} />{l}</button>
          ))}
        </div>
      )}
      {tab === "live" && canWatch ? <LiveMap isAdmin={isAdmin} isMobile={isMobile} /> : <TasksMap list={list} employees={employees} isMobile={isMobile} onOpen={onOpen} onPatch={onPatch} onPlan={onPlan} />}
    </div>
  );
}

function TasksMap({ list, employees, isMobile, onOpen, onPatch, onPlan }) {
  const [picked, setPicked] = useState([]);
  const [to, setTo] = useState("");
  const [toDate, setToDate] = useState(today());
  const [who, setWho] = useState("");
  const [date, setDate] = useState(today());
  const [opt, setOpt] = useState(null);
  const [busy, setBusy] = useState(false);
  const field = list.filter((j) => !j.ro && isOpen(j));
  const withGeo = field.filter((j) => okGeo(j.geo));
  const noGeo = field.filter((j) => !okGeo(j.geo));
  const people = employees.filter((e) => e.role !== "admin");
  // Xodimning kunlik yo'li (vaqt tartibida)
  const route = useMemo(() => (who ? list.filter((j) => !j.ro && j.status !== "cancelled" && j.date === date && (j.assigneeIds || []).includes(who) && okGeo(j.geo)).sort(byWhen) : []), [who, date, list]);
  const shown = opt || route;
  const km = routeKm(null, shown);
  useEffect(() => setOpt(null), [who, date]);

  const markers = (who ? shown : withGeo).map((j, i) => {
    const k = JOB_KINDS[j.kind] || JOB_KINDS.other;
    const isSel = picked.includes(j.id);
    return { id: j.id, lat: j.geo.lat, lng: j.geo.lng, title: j.title, z: isSel ? 500 : 0,
      html: pinHtml(isLate(j) ? "#DC2626" : k.c, { label: who ? String(i + 1) : isSel ? "✓" : "", selected: isSel }),
      onClick: () => (who ? onOpen(j) : setPicked((p) => (p.includes(j.id) ? p.filter((x) => x !== j.id) : [...p, j.id]))) };
  });
  const lines = who && shown.length > 1 ? [{ points: shown.map((j) => [j.geo.lat, j.geo.lng]), color: "#0E7C6B", weight: 5 }] : [];

  async function assign() {
    if (!to || !picked.length) return;
    setBusy(true);
    for (const id of picked) { const j = field.find((x) => x.id === id); if (j) await onPatch(j, { assigneeIds: [...new Set([...(j.assigneeIds || []), to])], ...(j.date ? {} : { date: toDate }) }); }
    setBusy(false); setPicked([]);
  }
  async function applyOpt() {
    // vaqtlar to'plami saqlanadi — faqat tartib almashadi
    const times = route.map((j) => j.time).filter(Boolean).sort();
    if (times.length !== opt.length) return;
    setBusy(true);
    for (let i = 0; i < opt.length; i++) if (opt[i].time !== times[i]) await onPatch(opt[i], { time: times[i] });
    setBusy(false); setOpt(null);
  }
  const optimized = route.length > 2 ? nearestOrder(route[0].geo, route) : null;
  const saving = optimized ? routeKm(null, route) - routeKm(null, optimized) : 0;

  const side = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={panel}>
        {secT(`Xaritada ${withGeo.length} · joyi yo'q ${noGeo.length}`)}
        {!who && <div style={{ fontSize: 13, color: THEME.muted }}>Pinlarni bosib tanlang → xodimga bering.</div>}
        {picked.length > 0 && !who && (
          <div data-testid="map-selection" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <b style={{ fontSize: 14 }}>Tanlangan: {picked.length}</b>
            {picked.map((id) => { const j = field.find((x) => x.id === id); return j ? <button key={id} type="button" onClick={() => onOpen(j)} style={{ textAlign: "left", border: 0, background: "none", padding: 0, fontFamily: "inherit", fontSize: 13, color: THEME.text, cursor: "pointer" }}>• {j.title} <span style={{ color: THEME.muted }}>· {whenText(j)}</span></button> : null; })}
            <div style={{ display: "flex", gap: 6 }}>
              <select value={to} onChange={(e) => setTo(e.target.value)} style={{ ...sel, flex: 1 }} data-testid="map-to"><option value="">Kimga?</option>{people.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ ...sel, width: 138 }} title="Sanasi yo'qlariga" />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" disabled={!to || busy} onClick={assign} data-testid="map-assign" style={{ ...pbtn(to ? THEME.primarySolid || THEME.violet : THEME.border2), flex: 1 }}>{to ? `${people.find((e) => e.id === to)?.name.split(" ")[0]}ga →` : "Xodimni tanlang"}</button>
              <button type="button" onClick={() => setPicked([])} style={{ ...sel, cursor: "pointer" }}>Bekor</button>
            </div>
          </div>
        )}
      </div>
      <div style={panel} data-testid="map-route">
        {secT("Xodimning yo'li")}
        <div style={{ display: "flex", gap: 6 }}>
          <select value={who} onChange={(e) => setWho(e.target.value)} style={{ ...sel, flex: 1 }} data-testid="route-who"><option value="">— xodimni tanlang</option>{people.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...sel, width: 138 }} />
        </div>
        {who && !route.length && <div style={{ fontSize: 13, color: THEME.muted }}>Bu kunga joyi belgilangan ishi yo'q</div>}
        {who && shown.map((j, i) => (
          <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }} data-route-stop={j.id}>
            <span style={{ width: 22, height: 22, borderRadius: 11, background: "#0E7C6B", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><b>{(opt ? route.map((x) => x.time).filter(Boolean).sort()[i] : j.time) || "—"}</b> {j.title}</span>
            {i > 0 && <span style={{ fontSize: 12, color: THEME.muted, whiteSpace: "nowrap" }}>{fmtKm(roadKm(shown[i - 1].geo, j.geo))}</span>}
          </div>
        ))}
        {who && shown.length > 1 && <div style={{ fontSize: 13, color: THEME.muted }}>Jami ≈ <b style={{ color: THEME.text }} data-testid="route-km">{fmtKm(km)}</b> (yo'l bo'yicha taxminan)</div>}
        {optimized && !opt && saving > 0.3 && <button type="button" onClick={() => setOpt(optimized)} data-testid="route-opt" style={pbtn("#0E7C6B")}><Route size={15} /> Yo'lni tartiblash · −{fmtKm(saving)}</button>}
        {opt && <div style={{ display: "flex", gap: 6 }}><button type="button" disabled={busy} onClick={applyOpt} data-testid="route-apply" style={{ ...pbtn(THEME.greenSolid), flex: 1 }}>Qo'llash (vaqtlar almashadi)</button><button type="button" onClick={() => setOpt(null)} style={{ ...sel, cursor: "pointer" }}>Bekor</button></div>}
        {who && shown.length > 0 && <a href={yandexRoute(null, shown[0].geo)} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: THEME.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}><Navigation size={14} /> Yandex'da ochish</a>}
      </div>
      {noGeo.length > 0 && (
        <div style={panel} data-testid="map-nogeo">
          {secT(`Joyi belgilanmagan · ${noGeo.length}`)}
          {noGeo.slice(0, 8).map((j) => (
            <button key={j.id} type="button" onClick={() => onPlan(j)} data-nogeo={j.id} style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", border: 0, background: "none", padding: 0, fontFamily: "inherit", cursor: "pointer", color: THEME.text }}>
              <MapPinOff size={15} style={{ color: THEME.muted, flexShrink: 0 }} /><span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.title}</span><span style={{ fontSize: 12, color: THEME.blue }}>belgilash</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 330px", gap: 12, alignItems: "start" }}>
      <div style={{ position: "relative" }}>
        <LeafletMap height={isMobile ? 360 : 560} markers={markers} lines={lines} fitKey={`${who}|${date}|${(who ? shown : withGeo).map((j) => j.id).join()}`} />
        <div style={{ position: "absolute", left: 12, top: 12, zIndex: 400, background: THEME.card, borderRadius: 10, padding: "6px 10px", boxShadow: THEME.shadowMd, display: "flex", gap: 10, fontSize: 12, fontWeight: 600, flexWrap: "wrap", maxWidth: "70%" }}>
          {["measure", "install", "deliver", "other"].map((k) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><i style={{ width: 9, height: 9, borderRadius: 5, background: JOB_KINDS[k].c, display: "inline-block" }} />{JOB_KINDS[k].l}</span>)}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><i style={{ width: 9, height: 9, borderRadius: 5, background: "#DC2626", display: "inline-block" }} />kechikkan</span>
        </div>
      </div>
      {side}
    </div>
  );
}

// ---------- Xodimlar · hozir (faqat ish vaqtida) ----------
const ST = {
  onsite: ["ish joyida", "#0E7C6B", "#E3F4F1"], moving: ["yo'lda", "#1F5FD6", "#E9F0FC"], stopped: ["to'xtagan", "#D97706", "#FEF3C7"],
  workshop: ["sexda", "#71717A", "#F2F2F4"], none: ["joy kelmagan", "#A1A1AA", "#F2F2F4"], off: ["ishda emas", "#A1A1AA", "#F2F2F4"],
};
const agoTxt = (iso) => { if (!iso) return ""; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "hozir" : m < 60 ? `${m} daq oldin` : `${Math.floor(m / 60)} soat oldin`; };
function stText(x) {
  const s = x.status || {};
  if (s.s === "moving") return `yo'lda · ${s.speed} km/s`;
  if (s.s === "stopped") return s.min >= 5 ? `${s.min} daq bir joyda` : "joyida";
  return ST[s.s]?.[0] || "";
}

function LiveMap({ isAdmin, isMobile }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [selId, setSel] = useState(null);
  const [trail, setTrail] = useState([]);
  const load = useCallback(async () => { try { setData(await fetchGeoLive()); setErr(""); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (!selId) { setTrail([]); return; } fetchGeoTrail(selId).then(setTrail).catch(() => setTrail([])); }, [selId, data]);
  if (!data) return <div style={{ padding: 30, color: THEME.muted }}>{err || "Yuklanmoqda…"}</div>;
  if (!data.enabled) {
    return (
      <div style={{ ...panel, maxWidth: 620 }} data-testid="geo-disabled">
        <b style={{ fontSize: 16 }}>Kuzatuv o'chirilgan</b>
        <div style={{ fontSize: 14, color: THEME.muted, lineHeight: 1.55 }}>Yoqilsa: xodim <b>«Keldim»</b> bosgandan <b>«Ketdim»</b>gacha joyi shu yerda ko'rinadi (Telegram «jonli lokatsiya» yoki ilova ochiq paytda). Ish vaqtidan tashqari joy olinmaydi. Har xodim birinchi marta rozilik beradi. Tarix 30 kundan keyin o'chadi.</div>
        {isAdmin ? <button type="button" onClick={async () => { await saveGeoConfig({ enabled: true }); load(); }} data-testid="geo-enable" style={{ ...pbtn("#0E7C6B"), alignSelf: "flex-start" }}>Kuzatuvni yoqish</button> : <div style={{ fontSize: 13, color: THEME.muted }}>Yoqishni rahbar qiladi.</div>}
      </div>
    );
  }
  const staff = [...data.staff].sort((a, b) => (b.onShift - a.onShift) || (!!b.pos - !!a.pos) || a.name.localeCompare(b.name));
  const markers = staff.filter((x) => x.pos).map((x) => {
    const st = ST[x.status?.s] || ST.none;
    return { id: x.id, lat: x.pos.lat, lng: x.pos.lng, size: [0, 0], anchor: [0, 0], z: selId === x.id ? 600 : 0, title: x.name, onClick: () => setSel(selId === x.id ? null : x.id),
      html: avatarHtml(avatarColor(x.id), initials(x.name), stText(x), st[1]) };
  });
  if (data.workshop) markers.push({ id: "ws", lat: data.workshop.lat, lng: data.workshop.lng, html: pinHtml("#18181B", { label: "S", small: true }), size: [22, 22], title: "Sex" });
  const lines = trail.length > 1 ? [{ points: trail.map((p) => [p[1], p[2]]), color: "#6D28D9", dashed: true, weight: 4 }] : [];
  const selName = staff.find((x) => x.id === selId)?.name;
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "300px minmax(0,1fr)", gap: 12, alignItems: "start" }}>
      <div style={panel} data-testid="live-list">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Users size={16} /><b style={{ fontSize: 15, flex: 1 }}>Xodimlar · hozir</b><span style={{ fontSize: 12, fontWeight: 700, color: THEME.greenText, background: THEME.greenBg, borderRadius: 999, padding: "2px 8px" }}>● jonli</span></div>
        {staff.map((x) => {
          const st = x.onShift ? ST[x.status?.s] || ST.none : ST.off;
          return (
            <button key={x.id} type="button" onClick={() => x.pos && setSel(selId === x.id ? null : x.id)} data-live-row={x.id} data-live-status={x.onShift ? x.status?.s : "off"}
              style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", border: `1px solid ${selId === x.id ? THEME.blue : THEME.border}`, borderRadius: 11, background: THEME.card, color: THEME.text, fontFamily: "inherit", textAlign: "left", cursor: x.pos ? "pointer" : "default", opacity: x.onShift ? 1 : 0.55 }}>
              <Avatar id={x.id} name={x.name} size={30} />
              <span style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 13.5 }}>{x.name.split(" ")[0]}</b>
                <span style={{ display: "block", fontSize: 12, color: THEME.muted }}>{!x.onShift ? "ishda emas · kuzatuv yo'q" : !x.consent ? "rozilik berilmagan" : x.pos ? agoTxt(x.pos.at) + (x.pos.src === "tg" ? " · Telegram" : " · ilova") : "joy hali kelmagan"}</span></span>
              {x.onShift && <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap", background: st[2], color: st[1] }}>{stText(x) || st[0]}</span>}
            </button>
          );
        })}
        {!staff.length && <div style={{ fontSize: 13, color: THEME.muted }}>Xodim yo'q</div>}
        <div style={{ fontSize: 12, color: THEME.dim, lineHeight: 1.45 }}>Kuzatuv faqat «Keldim» → «Ketdim». Tarix 30 kun saqlanadi. Ko'radi: rahbar va katta menejer.</div>
        {isAdmin && <button type="button" onClick={async () => { await saveGeoConfig({ enabled: false }); load(); }} data-testid="geo-disable" style={{ ...sel, cursor: "pointer", alignSelf: "flex-start" }}>Kuzatuvni o'chirish</button>}
      </div>
      <div style={{ position: "relative" }}>
        <LeafletMap height={isMobile ? 360 : 560} markers={markers} lines={lines} fitKey={`${staff.filter((x) => x.pos).map((x) => x.id).join()}|${selId || ""}|${trail.length}`} testid="live-map" />
        {selId && <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 400, background: THEME.card, borderRadius: 10, padding: "7px 12px", boxShadow: THEME.shadowMd, fontSize: 13, fontWeight: 600 }} data-testid="trail-note"><Route size={14} style={{ verticalAlign: -2 }} /> {selName?.split(" ")[0]}ning bugungi yo'li · {trail.length} nuqta</div>}
      </div>
    </div>
  );
}
