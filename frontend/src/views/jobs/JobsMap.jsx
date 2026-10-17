// JobsMap.jsx — «Xarita» (menejer uchun). Xarita ajratilgan joyni to'liq egallaydi (ekran pastigacha),
// boshqaruvlar xarita ustida suzib turadi: chap tepada — rejim (Vazifalar / Xodimlar · hozir), pastda — belgilar,
// o'ngda — yig'iladigan panel (telefonda — pastki varaq). Sex (ishxona) — davomatdagi kenglik/uzunlik bo'yicha doim belgilanadi.
//  • Vazifalar: joyi bor ochiq ishlar, bir nechtasini tanlab xodimga berish, xodimning kunlik yo'li (sexdan), «Yo'lni tartiblash».
//  • Xodimlar · hozir: faqat ish vaqtidagi kuzatuv (rahbar / katta menejer).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, MapPinOff, Navigation, PanelRightClose, PanelRightOpen, Radar, Route, Users } from "lucide-react";
import { fetchGeoConfig, fetchGeoLive, fetchGeoTrail, saveGeoConfig } from "../../storage.js";
import { THEME } from "../../theme.js";
import { avatarColor, initials } from "../../auth/LoginScreen.jsx";
import { Avatar } from "./JobParts.jsx";
import { LeafletMap, avatarHtml, pinHtml, workshopCircle, workshopMarker } from "./LeafletMap.jsx";
import { JOB_KINDS, byWhen, isLate, isOpen, today, whenText } from "./jobsLib.js";
import { fmtKm, nearestOrder, okGeo, roadKm, routeKm, yandexRoute } from "./geoLib.js";

const secT = (t) => <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: THEME.muted }}>{t}</div>;
const sel = { height: 36, borderRadius: 10, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, fontFamily: "inherit", fontSize: 13.5, padding: "0 8px", minWidth: 0 };
const pbtn = (bg) => ({ height: 38, padding: "0 14px", borderRadius: 10, border: 0, background: bg, color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 });
const float = { position: "absolute", zIndex: 500, background: THEME.card, borderRadius: 14, boxShadow: THEME.shadowLg || "0 12px 32px rgba(0,0,0,.18)", border: `1px solid ${THEME.border}` };
const block = { display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${THEME.border}` };

// Xarita ekran pastigacha cho'zilsin: element tepasidan oyna oxirigacha (telefonda — pastki menyu ustigacha)
function useFillHeight(ref, isMobile) {
  const [h, setH] = useState(560);
  useLayoutEffect(() => {
    const calc = () => {
      if (!ref.current) return;
      const top = ref.current.getBoundingClientRect().top + window.scrollY;
      const nav = document.querySelector(".uvix-bottomnav");
      const bottom = isMobile && nav ? nav.getBoundingClientRect().height + 8 : 16;
      setH(Math.max(isMobile ? 380 : 460, Math.round(window.innerHeight - top - bottom)));
    };
    calc();
    const t = setTimeout(calc, 300);
    window.addEventListener("resize", calc);
    return () => { clearTimeout(t); window.removeEventListener("resize", calc); };
  }, [ref, isMobile]);
  return h;
}

export function JobsMap({ list, employees, canWatch, isAdmin, isMobile, onOpen, onPatch, onPlan }) {
  const [tab, setTab] = useState("jobs");
  const [ws, setWs] = useState(null);
  const [panel, setPanel] = useState(!isMobile);
  const box = useRef(null);
  const height = useFillHeight(box, isMobile);
  useEffect(() => { fetchGeoConfig().then((r) => setWs(r.workshop || null)).catch(() => {}); }, []);
  // Xarita ustidagi panel va tugmalar ostida pin qolib ketmasin
  const fitPad = isMobile ? { tl: [24, 64], br: [24, panel ? Math.round(height * 0.52) + 16 : 70] } : { tl: [40, 70], br: [panel ? 370 : 40, 56] };
  const common = { isMobile, ws, height, panel, setPanel, fitPad };
  return (
    <div ref={box} data-testid="jobs-map" className="uvix-jobsmap" style={{ position: "relative", height, borderRadius: isMobile ? 14 : 18, overflow: "hidden", border: `1px solid ${THEME.border}`, background: THEME.chip }}>
      <style>{`.uvix-jobsmap .leaflet-top.leaflet-left{top:${canWatch ? 50 : 0}px}`}</style>
      {tab === "live" && canWatch ? <LiveMap {...common} isAdmin={isAdmin} /> : <TasksMap {...common} list={list} employees={employees} onOpen={onOpen} onPatch={onPatch} onPlan={onPlan} />}
      {canWatch && (
        <div role="group" style={{ ...float, left: 12, top: 12, display: "inline-flex", padding: 3, gap: 2, borderRadius: 12 }}>
          {[["jobs", "Vazifalar", Route], ["live", "Xodimlar · hozir", Radar]].map(([k, l, I]) => (
            <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} data-map-tab={k}
              style={{ height: 32, padding: "0 12px", border: 0, borderRadius: 9, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6, background: tab === k ? THEME.text : "transparent", color: tab === k ? THEME.card : THEME.muted }}><I size={14} />{l}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// O'ng panel (kompyuter) yoki pastki varaq (telefon) — yig'iladi
function SidePanel({ isMobile, panel, setPanel, title, children, testid }) {
  if (isMobile) {
    return (
      <div data-testid={testid} style={{ ...float, left: 8, right: 8, bottom: 22, maxHeight: panel ? "52%" : 46, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <button type="button" onClick={() => setPanel(!panel)} style={{ height: 46, flexShrink: 0, border: 0, background: "none", display: "flex", alignItems: "center", gap: 8, padding: "0 14px", fontFamily: "inherit", fontWeight: 700, fontSize: 14, color: THEME.text, cursor: "pointer" }}>
          <span style={{ flex: 1, textAlign: "left" }}>{title}</span>{panel ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
        {panel && <div style={{ overflowY: "auto", borderTop: `1px solid ${THEME.border}` }}>{children}</div>}
      </div>
    );
  }
  if (!panel) {
    return (
      <button type="button" onClick={() => setPanel(true)} data-testid="panel-open" title="Panelni ochish"
        style={{ ...float, right: 12, top: 12, height: 40, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, color: THEME.text, cursor: "pointer" }}>
        <PanelRightOpen size={16} /> {title}
      </button>
    );
  }
  return (
    <div data-testid={testid} style={{ ...float, right: 12, top: 12, bottom: 12, width: 340, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 10px 10px 14px", borderBottom: `1px solid ${THEME.border}` }}>
        <b style={{ flex: 1, fontSize: 15 }}>{title}</b>
        <button type="button" onClick={() => setPanel(false)} aria-label="Panelni yig'ish" data-testid="panel-close" style={{ width: 32, height: 32, borderRadius: 9, border: 0, background: THEME.chip, color: THEME.muted, display: "grid", placeItems: "center", cursor: "pointer" }}><PanelRightClose size={16} /></button>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>{children}</div>
    </div>
  );
}

function Legend({ isMobile, ws }) {
  return (
    <div style={{ ...float, left: 12, bottom: isMobile ? 76 : 12, maxWidth: isMobile ? "calc(100% - 24px)" : 520, padding: "6px 10px", display: "flex", gap: isMobile ? 8 : 10, fontSize: isMobile ? 11 : 12, fontWeight: 600, flexWrap: "wrap", borderRadius: 10 }}>
      {["measure", "install", "deliver", "other"].map((k) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><i style={{ width: 9, height: 9, borderRadius: 5, background: JOB_KINDS[k].c, display: "inline-block" }} />{JOB_KINDS[k].l}</span>)}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><i style={{ width: 9, height: 9, borderRadius: 5, background: "#DC2626", display: "inline-block" }} />kechikkan</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} data-testid="legend-ws" data-ws={ws ? "1" : "0"}><i style={{ width: 10, height: 10, borderRadius: 3, background: "#18181B", display: "inline-block" }} />{ws ? "sex" : "sex belgilanmagan (Davomat sozlamalari)"}</span>
    </div>
  );
}

function TasksMap({ list, employees, isMobile, ws, height, panel, setPanel, fitPad, onOpen, onPatch, onPlan }) {
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
  // Xodimning kunlik yo'li (vaqt tartibida); sex belgilangan bo'lsa — yo'l sexdan boshlanadi
  const route = useMemo(() => (who ? list.filter((j) => !j.ro && j.status !== "cancelled" && j.date === date && (j.assigneeIds || []).includes(who) && okGeo(j.geo)).sort(byWhen) : []), [who, date, list]);
  const shown = opt || route;
  const km = routeKm(ws, shown);
  useEffect(() => setOpt(null), [who, date]);

  const markers = (who ? shown : withGeo).map((j, i) => {
    const k = JOB_KINDS[j.kind] || JOB_KINDS.other;
    const isSel = picked.includes(j.id);
    return { id: j.id, lat: j.geo.lat, lng: j.geo.lng, title: j.title, z: isSel ? 500 : 0,
      html: pinHtml(isLate(j) ? "#DC2626" : k.c, { label: who ? String(i + 1) : isSel ? "✓" : "", selected: isSel }),
      onClick: () => (who ? onOpen(j) : setPicked((p) => (p.includes(j.id) ? p.filter((x) => x !== j.id) : [...p, j.id]))) };
  });
  const wsM = workshopMarker(ws);
  if (wsM) markers.push(wsM);
  const pts = who ? [...(ws ? [[ws.lat, ws.lng]] : []), ...shown.map((j) => [j.geo.lat, j.geo.lng])] : [];
  const lines = pts.length > 1 ? [{ points: pts, color: "#0E7C6B", weight: 5 }] : [];

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
  const optimized = route.length > 2 ? nearestOrder(ws || route[0].geo, route) : null;
  const saving = optimized ? routeKm(ws, route) - routeKm(ws, optimized) : 0;

  return (
    <>
      <LeafletMap fitPad={fitPad} zoomPos="topleft" height={height} rounded={0} markers={markers} lines={lines} circles={workshopCircle(ws)} fitKey={`${who}|${date}|${(who ? shown : withGeo).map((j) => j.id).join()}|${ws ? "ws" : ""}|${panel}`} />
      <Legend isMobile={isMobile} ws={ws} />
      <SidePanel isMobile={isMobile} panel={panel} setPanel={setPanel} testid="map-panel" title={`Xaritada ${withGeo.length} · joyi yo'q ${noGeo.length}`}>
        {!who && <div style={block}>
          {!picked.length && <div style={{ fontSize: 13, color: THEME.muted }}>Pinlarni bosib tanlang → xodimga bering.</div>}
          {picked.length > 0 && (
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
        </div>}
        <div style={block} data-testid="map-route">
          {secT("Xodimning yo'li")}
          <div style={{ display: "flex", gap: 6 }}>
            <select value={who} onChange={(e) => setWho(e.target.value)} style={{ ...sel, flex: 1 }} data-testid="route-who"><option value="">— xodimni tanlang</option>{people.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...sel, width: 138 }} />
          </div>
          {who && !route.length && <div style={{ fontSize: 13, color: THEME.muted }}>Bu kunga joyi belgilangan ishi yo'q</div>}
          {who && ws && route.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: THEME.muted }}><span style={{ width: 22, height: 22, borderRadius: 6, background: "#18181B", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 11, flexShrink: 0 }}>S</span>Sexdan chiqish</div>}
          {who && shown.map((j, i) => (
            <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }} data-route-stop={j.id}>
              <span style={{ width: 22, height: 22, borderRadius: 11, background: "#0E7C6B", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><b>{(opt ? route.map((x) => x.time).filter(Boolean).sort()[i] : j.time) || "—"}</b> {j.title}</span>
              {(i > 0 || ws) && <span style={{ fontSize: 12, color: THEME.muted, whiteSpace: "nowrap" }}>{fmtKm(roadKm(i > 0 ? shown[i - 1].geo : ws, j.geo))}</span>}
            </div>
          ))}
          {who && shown.length > 0 && (shown.length > 1 || ws) && <div style={{ fontSize: 13, color: THEME.muted }}>Jami ≈ <b style={{ color: THEME.text }} data-testid="route-km">{fmtKm(km)}</b> (yo'l bo'yicha taxminan{ws ? ", sexdan" : ""})</div>}
          {optimized && !opt && saving > 0.3 && <button type="button" onClick={() => setOpt(optimized)} data-testid="route-opt" style={pbtn("#0E7C6B")}><Route size={15} /> Yo'lni tartiblash · −{fmtKm(saving)}</button>}
          {opt && <div style={{ display: "flex", gap: 6 }}><button type="button" disabled={busy} onClick={applyOpt} data-testid="route-apply" style={{ ...pbtn(THEME.greenSolid), flex: 1 }}>Qo'llash (vaqtlar almashadi)</button><button type="button" onClick={() => setOpt(null)} style={{ ...sel, cursor: "pointer" }}>Bekor</button></div>}
          {who && shown.length > 0 && <a href={yandexRoute(ws, shown[0].geo)} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: THEME.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}><Navigation size={14} /> Yandex'da ochish</a>}
        </div>
        {noGeo.length > 0 && (
          <div style={{ ...block, borderBottom: 0 }} data-testid="map-nogeo">
            {secT(`Joyi belgilanmagan · ${noGeo.length}`)}
            {noGeo.slice(0, 12).map((j) => (
              <button key={j.id} type="button" onClick={() => onPlan(j)} data-nogeo={j.id} style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", border: 0, background: "none", padding: 0, fontFamily: "inherit", cursor: "pointer", color: THEME.text }}>
                <MapPinOff size={15} style={{ color: THEME.muted, flexShrink: 0 }} /><span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.title}</span><span style={{ fontSize: 12, color: THEME.blue }}>belgilash</span>
              </button>
            ))}
          </div>
        )}
      </SidePanel>
    </>
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

function LiveMap({ isAdmin, isMobile, ws: wsCfg, height, panel, setPanel, fitPad }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [selId, setSel] = useState(null);
  const [trail, setTrail] = useState([]);
  const load = useCallback(async () => { try { setData(await fetchGeoLive()); setErr(""); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (!selId) { setTrail([]); return; } fetchGeoTrail(selId).then(setTrail).catch(() => setTrail([])); }, [selId, data]);
  const ws = data?.workshop || wsCfg;
  const wsM = workshopMarker(ws);
  if (!data || !data.enabled) {
    return (
      <>
        <LeafletMap fitPad={fitPad} zoomPos="topleft" height={height} rounded={0} markers={wsM ? [wsM] : []} circles={workshopCircle(ws)} fitKey={ws ? "ws" : ""} testid="live-map" />
        <div style={{ ...float, left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(520px, calc(100% - 32px))", padding: 18, display: "flex", flexDirection: "column", gap: 10 }} data-testid={data ? "geo-disabled" : undefined}>
          {!data ? <div style={{ color: THEME.muted }}>{err || "Yuklanmoqda…"}</div> : (
            <>
              <b style={{ fontSize: 16 }}>Kuzatuv o'chirilgan</b>
              <div style={{ fontSize: 14, color: THEME.muted, lineHeight: 1.55 }}>Yoqilsa: xodim <b>«Keldim»</b> bosgandan <b>«Ketdim»</b>gacha joyi shu yerda ko'rinadi (Telegram «jonli lokatsiya» yoki ilova ochiq paytda). Ish vaqtidan tashqari joy olinmaydi. Har xodim birinchi marta rozilik beradi. Tarix 30 kundan keyin o'chadi.</div>
              {isAdmin ? <button type="button" onClick={async () => { await saveGeoConfig({ enabled: true }); load(); }} data-testid="geo-enable" style={{ ...pbtn("#0E7C6B"), alignSelf: "flex-start" }}>Kuzatuvni yoqish</button> : <div style={{ fontSize: 13, color: THEME.muted }}>Yoqishni rahbar qiladi.</div>}
            </>
          )}
        </div>
      </>
    );
  }
  const staff = [...data.staff].sort((a, b) => (b.onShift - a.onShift) || (!!b.pos - !!a.pos) || a.name.localeCompare(b.name));
  const markers = staff.filter((x) => x.pos).map((x) => {
    const st = ST[x.status?.s] || ST.none;
    return { id: x.id, lat: x.pos.lat, lng: x.pos.lng, size: [0, 0], anchor: [0, 0], z: selId === x.id ? 600 : 0, title: x.name, onClick: () => setSel(selId === x.id ? null : x.id),
      html: avatarHtml(avatarColor(x.id), initials(x.name), stText(x), st[1]) };
  });
  if (wsM) markers.push(wsM);
  const lines = trail.length > 1 ? [{ points: trail.map((p) => [p[1], p[2]]), color: "#6D28D9", dashed: true, weight: 4 }] : [];
  const selName = staff.find((x) => x.id === selId)?.name;
  const onShiftN = staff.filter((x) => x.onShift).length;
  return (
    <>
      <LeafletMap fitPad={fitPad} zoomPos="topleft" height={height} rounded={0} markers={markers} lines={lines} circles={workshopCircle(ws)} fitKey={`${staff.filter((x) => x.pos).map((x) => x.id).join()}|${selId || ""}|${trail.length}|${panel}`} testid="live-map" />
      {selId && <div style={{ ...float, left: 12, bottom: isMobile ? 76 : 12, padding: "7px 12px", fontSize: 13, fontWeight: 600, borderRadius: 10 }} data-testid="trail-note"><Route size={14} style={{ verticalAlign: -2 }} /> {selName?.split(" ")[0]}ning bugungi yo'li · {trail.length} nuqta</div>}
      <SidePanel isMobile={isMobile} panel={panel} setPanel={setPanel} testid="live-list" title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Users size={16} />Xodimlar · ishda {onShiftN}<span style={{ fontSize: 11.5, fontWeight: 700, color: THEME.greenText, background: THEME.greenBg, borderRadius: 999, padding: "2px 8px" }}>● jonli</span></span>}>
        <div style={{ ...block, gap: 8, borderBottom: 0 }}>
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
          <div style={{ fontSize: 12, color: THEME.dim, lineHeight: 1.45 }}>Kuzatuv faqat «Keldim» → «Ketdim». Tarix 30 kun saqlanadi. Ko'radi: rahbar va katta menejer.{!ws && " Sex joyi belgilanmagan — Davomat sozlamalarida kiriting."}</div>
          {isAdmin && <button type="button" onClick={async () => { await saveGeoConfig({ enabled: false }); load(); }} data-testid="geo-disable" style={{ ...sel, cursor: "pointer", alignSelf: "flex-start" }}>Kuzatuvni o'chirish</button>}
        </div>
      </SidePanel>
    </>
  );
}
