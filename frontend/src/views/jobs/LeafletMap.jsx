// LeafletMap.jsx — yengil xarita (Leaflet + OpenStreetMap, kalit kerak emas).
// markers: [{ id, lat, lng, html, size, onClick, title, z }]; lines: [{ points: [[lat,lng]], color, dashed, weight }]
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { THEME } from "../../theme.js";

export const TASHKENT = { lat: 41.3111, lng: 69.2797 };

export function LeafletMap({ markers = [], lines = [], center, zoom = 12, fit = true, fitKey = "", onClick, height = 420, style, testid = "leaflet-map", rounded = 16 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const fitted = useRef("");

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([(center || TASHKENT).lat, (center || TASHKENT).lng], zoom);
    L.control.zoom({ position: "bottomright" }).addTo(m);
    // Ilova «Referrer-Policy: same-origin» yuboradi — OSM esa Referer'siz so'rovlarni bloklaydi (403 «Access blocked»).
    // Shuning uchun xarita rasmlariga sayt manzili (origin) yuboriladi; OSM baribir rad etsa — CARTO xaritasiga o'tiladi.
    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap", referrerPolicy: "strict-origin-when-cross-origin" });
    let fails = 0, switched = false;
    osm.on("tileerror", () => {
      if (switched || ++fails < 3) return;
      switched = true;
      m.removeLayer(osm);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 20, subdomains: "abcd", attribution: "© OpenStreetMap · © CARTO", referrerPolicy: "strict-origin-when-cross-origin" }).addTo(m);
    });
    osm.on("tileload", () => { fails = 0; });
    osm.addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on("click", (e) => clickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    // konteyner o'lchami keyin o'zgarsa (panel ochilganda)
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => m.invalidateSize()) : null;
    ro?.observe(el.current);
    return () => { ro?.disconnect(); m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current; if (!m || !g) return;
    g.clearLayers();
    for (const ln of lines) {
      if (!ln.points?.length) continue;
      L.polyline(ln.points, { color: ln.color || THEME.blue, weight: ln.weight || 4, opacity: ln.opacity ?? 0.85, dashArray: ln.dashed ? "6 9" : null, lineCap: "round" }).addTo(g);
    }
    for (const mk of markers) {
      const size = mk.size || [30, 30];
      const icon = L.divIcon({ className: "uvix-pin", html: mk.html || "", iconSize: size, iconAnchor: mk.anchor || [size[0] / 2, size[1]] });
      const marker = L.marker([mk.lat, mk.lng], { icon, title: mk.title || "", zIndexOffset: mk.z || 0, keyboard: !!mk.onClick }).addTo(g);
      if (mk.onClick) marker.on("click", (e) => { L.DomEvent.stopPropagation(e); mk.onClick(mk); });
    }
    const key = fitKey || markers.map((x) => x.id).join(",");
    if (fit && key !== fitted.current) {
      fitted.current = key;
      const pts = [...markers.map((x) => [x.lat, x.lng]), ...lines.flatMap((l) => l.points || [])];
      if (pts.length === 1) m.setView(pts[0], 14);
      else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts).pad(0.18), { maxZoom: 15 });
    }
  }, [markers, lines, fit, fitKey]);

  useEffect(() => { if (center && map.current && !fit) map.current.setView([center.lat, center.lng], map.current.getZoom()); }, [center?.lat, center?.lng, fit]);

  return <div ref={el} data-testid={testid} style={{ height, width: "100%", borderRadius: rounded, overflow: "hidden", background: THEME.chip, zIndex: 0, ...style }} />;
}

// Rangli tomchi-pin (raqamli yoki tanlangan)
export function pinHtml(color, { label = "", selected = false, small = false } = {}) {
  const s = small ? 22 : 30;
  return `<div style="position:relative;width:${s}px;height:${s}px">
    <div style="position:absolute;inset:0;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:${selected ? 3 : 2.5}px solid ${selected ? "#111" : "#fff"};box-shadow:0 3px 8px rgba(0,0,0,.3)"></div>
    <div style="position:absolute;inset:0;display:grid;place-items:center;color:#fff;font:800 ${small ? 10 : 12}px/1 Onest,system-ui,sans-serif">${label}</div></div>`;
}
export function avatarHtml(color, initials, text, dot) {
  return `<div style="display:inline-flex;align-items:center;gap:5px;background:#fff;border-radius:999px;padding:3px 9px 3px 3px;box-shadow:0 4px 12px rgba(0,0,0,.22);font:700 11.5px/1 Onest,system-ui,sans-serif;color:#18181B;white-space:nowrap;transform:translate(-14px,-14px)">
    <span style="width:24px;height:24px;border-radius:50%;background:${color};color:#fff;display:grid;place-items:center;font-size:9.5px;font-weight:800">${initials}</span>
    ${dot ? `<i style="width:7px;height:7px;border-radius:50%;background:${dot};display:inline-block"></i>` : ""}${text || ""}</div>`;
}
export const meHtml = () => `<div style="width:18px;height:18px;border-radius:50%;background:#1F5FD6;border:3px solid #fff;box-shadow:0 0 0 6px rgba(31,95,214,.22)"></div>`;
