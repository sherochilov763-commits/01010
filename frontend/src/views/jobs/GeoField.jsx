// GeoField.jsx — vazifa joyini belgilash: xaritada bosish, Yandex/Google havolasi, manzildan qidirish.
import { useEffect, useState } from "react";
import { Link2, Loader2, MapPin, Search, X } from "lucide-react";
import { Modal } from "../../components/ui.jsx";
import { resolveMapLink } from "../../storage.js";
import { THEME } from "../../theme.js";
import { LeafletMap, pinHtml } from "./LeafletMap.jsx";
import { okGeo, parseMapLink } from "./geoLib.js";

const btn = { height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, fontFamily: "inherit", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" };

// OpenStreetMap qidiruvi (Nominatim) — brauzerdan, kalitsiz
async function geocode(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=uz&accept-language=uz&q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error("Qidiruv ishlamadi");
  return (await r.json()).map((x) => ({ lat: Number(x.lat), lng: Number(x.lon), name: x.display_name }));
}

export function GeoField({ value, onChange, address }) {
  const [picker, setPicker] = useState(false);
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function fromLink() {
    const u = (link || "").trim(); if (!u) return;
    setErr("");
    const g = parseMapLink(u);
    if (g) { onChange(g); setLink(null); return; }
    setBusy(true);
    try { const r = await resolveMapLink(u); onChange({ lat: r.lat, lng: r.lng }); setLink(null); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div data-testid="geo-field">
      {okGeo(value) ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: `1px solid ${THEME.border}`, borderRadius: 10, background: THEME.greenBg }}>
          <MapPin size={16} style={{ color: THEME.greenText }} />
          <span style={{ flex: 1, fontSize: 13.5, color: THEME.greenText, fontWeight: 600 }} data-testid="geo-set">Joyi belgilangan · {value.lat.toFixed(5)}, {value.lng.toFixed(5)}</span>
          <button type="button" onClick={() => setPicker(true)} style={{ ...btn, height: 30 }}>O'zgartirish</button>
          <button type="button" onClick={() => onChange(null)} aria-label="Joyni olib tashlash" style={{ ...btn, height: 30, width: 30, padding: 0, justifyContent: "center" }}><X size={14} /></button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setPicker(true)} style={btn} data-testid="geo-pick"><MapPin size={15} /> Xaritadan</button>
          <button type="button" onClick={() => setLink(link === null ? "" : null)} style={btn} data-testid="geo-link-btn"><Link2 size={15} /> Havola</button>
          {address && <button type="button" onClick={() => setPicker("search")} style={btn}><Search size={15} /> Manzildan topish</button>}
        </div>
      )}
      {link !== null && !okGeo(value) && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input autoFocus value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fromLink(); } }} placeholder="Yandex / Google xarita havolasi yoki 41.31, 69.24" data-testid="geo-link"
            style={{ flex: 1, height: 38, border: `1px solid ${THEME.border2}`, borderRadius: 10, padding: "0 10px", fontFamily: "inherit", fontSize: 13.5, background: THEME.card, color: THEME.text, outline: "none" }} />
          <button type="button" onClick={fromLink} disabled={busy} style={{ ...btn, background: THEME.text, color: THEME.card, border: 0 }} data-testid="geo-link-ok">{busy ? <Loader2 size={15} className="uvix-spin" /> : "OK"}</button>
        </div>
      )}
      {err && <div style={{ fontSize: 12.5, color: THEME.rose, marginTop: 6 }}>{err}</div>}
      <div style={{ fontSize: 12, color: THEME.dim, marginTop: 6 }}>Mijoz Telegram'da lokatsiya yuborgan bo'lsa — uni bosing, ochilgan havolani shu yerga qo'ying.</div>
      {picker && <MapPicker initial={okGeo(value) ? value : null} query={picker === "search" ? address : ""} onClose={() => setPicker(false)} onPick={(g) => { onChange(g); setPicker(false); }} />}
    </div>
  );
}

function MapPicker({ initial, query, onClose, onPick }) {
  const [pos, setPos] = useState(initial);
  const [q, setQ] = useState(query || "");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function search(text = q) {
    if (!text.trim()) return;
    setBusy(true); setErr("");
    try { const r = await geocode(text.includes("Toshkent") ? text : `${text}, Toshkent`); setRes(r); if (r[0]) setPos({ lat: r[0].lat, lng: r[0].lng }); if (!r.length) setErr("Topilmadi — xaritada o'zingiz bosing"); }
    catch { setErr("Qidiruv ishlamadi — xaritada bosib belgilang"); } finally { setBusy(false); }
  }
  useEffect(() => { if (query) search(query); }, []);
  return (
    <Modal title="Joyni xaritada belgilash" onClose={onClose} width={720}>
      <div data-testid="map-picker">
        <form onSubmit={(e) => { e.preventDefault(); search(); }} style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Manzil: Chilonzor 9, 12-uy" style={{ flex: 1, height: 40, border: `1px solid ${THEME.border2}`, borderRadius: 10, padding: "0 12px", fontFamily: "inherit", fontSize: 14, background: THEME.card, color: THEME.text, outline: "none" }} />
          <button type="submit" style={{ ...btn, height: 40 }}>{busy ? <Loader2 size={15} className="uvix-spin" /> : <Search size={15} />} Qidirish</button>
        </form>
        {res?.length > 1 && <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 8, maxHeight: 110, overflowY: "auto" }}>{res.map((r, i) => <button key={i} type="button" onClick={() => setPos({ lat: r.lat, lng: r.lng })} style={{ textAlign: "left", border: 0, background: "none", padding: "4px 2px", fontFamily: "inherit", fontSize: 12.5, color: THEME.blue, cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{r.name}</button>)}</div>}
        {err && <div style={{ fontSize: 12.5, color: THEME.amber, marginBottom: 6 }}>{err}</div>}
        <LeafletMap height={380} center={pos || undefined} markers={pos ? [{ id: "p", ...pos, html: pinHtml("#DC2626", { selected: true }) }] : []} fitKey={pos ? `${pos.lat},${pos.lng}` : ""} onClick={(g) => setPos(g)} testid="picker-map" />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <span style={{ flex: 1, fontSize: 13, color: THEME.muted }}>{pos ? `📍 ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : "Xaritada joyni bosing"}</span>
          <button type="button" onClick={onClose} style={{ ...btn, height: 42 }}>Bekor qilish</button>
          <button type="button" disabled={!pos} onClick={() => onPick(pos)} data-testid="picker-save" style={{ ...btn, height: 42, border: 0, background: pos ? THEME.blueSolid || THEME.blue : THEME.border2, color: "#fff" }}>Saqlash</button>
        </div>
      </div>
    </Modal>
  );
}
