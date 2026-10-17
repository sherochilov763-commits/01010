// GeoTracker.jsx — telefon joyi (bitta umumiy kuzatuvchi) va ish vaqtidagi kuzatuv.
//  • usePosition(on) — «eng yaqin keyingi ish» uchun joriy joy (faqat shu ekranda, serverga yuborilmaydi).
//  • <GeoTracker> — kuzatuv yoqilgan + rozilik bor + «Keldim» bosilgan bo'lsa, ilova ochiq paytda joyni
//    serverga yuboradi (eng ko'pi daqiqasiga bir marta). Rozilik so'ralmagan bo'lsa — pastda bir marta so'raydi.
import { useEffect, useRef, useState } from "react";
import { MapPin, ShieldCheck } from "lucide-react";
import { fetchGeoMe, geoConsent, geoPing } from "../../storage.js";
import { THEME } from "../../theme.js";

// ---- umumiy watchPosition (bir nechta komponent bitta kuzatuvchidan foydalanadi) ----
let watchId = null, last = null;
const subs = new Set();
function start() {
  if (watchId != null || typeof navigator === "undefined" || !navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(
    (p) => { last = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() }; subs.forEach((f) => f(last)); },
    () => { /* ruxsat berilmagan — maslahat manzil bo'yicha qoladi */ },
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 30000 },
  );
}
function stop() { if (watchId != null && !subs.size) { navigator.geolocation.clearWatch(watchId); watchId = null; } }
export function subscribePos(fn) { subs.add(fn); if (last) fn(last); start(); return () => { subs.delete(fn); stop(); }; }

export function usePosition(on = true) {
  const [pos, setPos] = useState(on ? last : null);
  useEffect(() => (on ? subscribePos(setPos) : undefined), [on]);
  return on ? pos : null;
}

const SKIP_KEY = "uvix_geo_consent_later";
export function GeoTracker({ user }) {
  const [me, setMe] = useState(null);
  const [ask, setAsk] = useState(false);
  const sent = useRef(0);
  useEffect(() => {
    if (!user || user.role === "admin") return undefined;
    let alive = true;
    const load = () => fetchGeoMe().then((r) => { if (!alive) return; setMe(r); let later = false; try { later = sessionStorage.getItem(SKIP_KEY) === "1"; } catch { /* */ } setAsk(r.enabled && !r.consent && !later); }).catch(() => {});
    load();
    const t = setInterval(load, 120000);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [user?.id]);

  const tracking = !!(me?.enabled && me.consent && me.onShift);
  useEffect(() => {
    if (!tracking) return undefined;
    return subscribePos((p) => {
      if (Date.now() - sent.current < 60000) return;
      sent.current = Date.now();
      geoPing({ lat: p.lat, lng: p.lng, acc: p.acc }).catch(() => {});
    });
  }, [tracking]);

  if (!ask) return null;
  async function agree() { try { const r = await geoConsent(true); setMe((m) => ({ ...m, consent: r.consent })); } catch { /* */ } setAsk(false); }
  function later() { try { sessionStorage.setItem(SKIP_KEY, "1"); } catch { /* */ } setAsk(false); }
  return (
    <div data-testid="geo-consent" role="dialog" aria-label="Kuzatuvga rozilik"
      style={{ position: "fixed", left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))", zIndex: 900, maxWidth: 460, margin: "0 auto", background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 16, boxShadow: THEME.shadowLg || "0 12px 32px rgba(0,0,0,.2)", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      <b style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 7 }}><ShieldCheck size={18} style={{ color: "#0E7C6B" }} /> Ish vaqtida joylashuv</b>
      <div style={{ fontSize: 13.5, color: THEME.muted, lineHeight: 1.5 }}>
        Ish vaqtida (<b>«Keldim» → «Ketdim»</b>) joyim rahbarga ko'rinishiga roziman. Ish vaqtidan tashqari joy <b>olinmaydi</b>, tarix 30 kundan keyin o'chadi.
      </div>
      <div style={{ fontSize: 12.5, color: THEME.dim, display: "flex", gap: 6, alignItems: "center" }}><MapPin size={13} /> Telefon qulfda ham ishlashi uchun — Telegram botda «Jonli joylashuv» ulashing.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        <button type="button" onClick={later} data-testid="geo-later" style={{ flex: 1, height: 42, borderRadius: 11, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, fontFamily: "inherit", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Keyinroq</button>
        <button type="button" onClick={agree} data-testid="geo-agree" style={{ flex: 1.4, height: 42, borderRadius: 11, border: 0, background: "#0E7C6B", color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Roziman</button>
      </div>
    </div>
  );
}

// Sozlamalarda: rozilik holati, berish / qaytarib olish (kuzatuv yoqilgan bo'lsa ko'rinadi)
export function GeoConsentCard({ Card }) {
  const [me, setMe] = useState(null);
  useEffect(() => { fetchGeoMe().then(setMe).catch(() => {}); }, []);
  if (!me?.enabled) return null;
  async function toggle() { const r = await geoConsent(!me.consent).catch(() => null); if (r) setMe((m) => ({ ...m, consent: r.consent })); }
  return (
    <Card>
      <div data-testid="geo-consent-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <b style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 7 }}><ShieldCheck size={17} style={{ color: "#0E7C6B" }} /> Ish vaqtida joylashuv</b>
        <div style={{ fontSize: 13.5, color: THEME.muted, lineHeight: 1.5 }}>
          {me.consent ? <>Rozilik berilgan. Joyingiz faqat <b>«Keldim» → «Ketdim»</b> oralig'ida rahbarga ko'rinadi{me.onShift ? " — hozir ish vaqti" : " — hozir kuzatilmayapti"}.</> : <>Rozilik berilmagan — joyingiz olinmaydi.</>}
        </div>
        <button type="button" onClick={toggle} data-testid="geo-consent-toggle" style={{ alignSelf: "flex-start", height: 38, padding: "0 14px", borderRadius: 10, border: me.consent ? `1px solid ${THEME.border2}` : 0, background: me.consent ? THEME.card : "#0E7C6B", color: me.consent ? THEME.text : "#fff", fontFamily: "inherit", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>{me.consent ? "Rozilikni qaytarib olish" : "Roziman"}</button>
      </div>
    </Card>
  );
}
