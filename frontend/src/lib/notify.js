// notify.js — bildirishnomalar holati (qo'ng'iroqcha), ovozli signal va Web Push obunasi.
// Serverdan har 20 soniyada (sahifa ko'rinib tursa) yangilanadi; push kelganda darhol.
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchNotifications, markNotificationsRead, removePushSubscription, saveNotifyPrefs, savePushSubscription } from "../storage.js";

export const SOUND_LABELS = {
  marimba: "Marimba",
  chime: "Chime up",
  tink: "Tink",
  cash: "Pul tushdi",
  critical: "Muhim",
  none: "Ovozsiz",
};

// Ilova ildizidagi fayllar (public/). Demo (bitta faylli) nusxada nisbiy yo'l bo'ladi.
export const assetUrl = (p) => `${String(import.meta.env.BASE_URL || "/").replace(/^\.\/$/, "")}${p}`;

// ---------- Ovoz ----------
const audioCache = {};
export function playSound(name, volume = 0.8) {
  if (!name || name === "none" || typeof Audio === "undefined") return;
  try {
    const base = audioCache[name] || (audioCache[name] = new Audio(assetUrl(`sounds/${name}.mp3`)));
    const a = base.cloneNode();
    a.volume = Math.max(0, Math.min(1, volume));
    a.play().catch(() => {}); // brauzer foydalanuvchi bosmaguncha ovozga ruxsat bermasligi mumkin
  } catch { /* */ }
}

// ---------- Push ----------
export function pushSupport() {
  if (typeof window === "undefined") return { ok: false, reason: "browser" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
    return { ok: false, reason: ios && !standalone ? "ios-install" : "browser" };
  }
  return { ok: true, permission: Notification.permission };
}
function b64ToUint8(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
export async function currentPushSubscription() {
  if (!pushSupport().ok) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
export async function enablePush(publicKey) {
  const sup = pushSupport();
  if (!sup.ok) throw new Error(sup.reason === "ios-install" ? "iPhone'da avval «Ulashish → Bosh ekranga qo'shish» qiling, so'ng ilovani bosh ekrandan oching" : "Bu brauzer push bildirishnomalarni qo'llamaydi");
  if (!publicKey) throw new Error("Server push uchun sozlanmagan");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Bildirishnomalarga ruxsat berilmadi. Brauzer sozlamalaridan ruxsat bering.");
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(publicKey) });
  return savePushSubscription(sub.toJSON());
}
export async function disablePush() {
  const sub = await currentPushSubscription();
  if (sub) {
    await removePushSubscription(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}

// ---------- Holat ----------
export function useNotifications({ enabled, onNavigate }) {
  const [data, setData] = useState({ items: [], unread: 0, prefs: null, cats: {}, push: { available: false, publicKey: null, devices: 0 }, sounds: [] });
  const known = useRef(null); // birinchi yuklashdagi elementlar uchun ovoz chalinmaydi
  const navRef = useRef(onNavigate);
  navRef.current = onNavigate;

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const d = await fetchNotifications();
      const ids = new Set(d.items.map((n) => n.id));
      if (known.current) {
        const fresh = d.items.filter((n) => !known.current.has(n.id) && !n.read);
        if (fresh.length && document.visibilityState === "visible") {
          const top = fresh.find((n) => n.level === "critical") || fresh[0];
          const m = d.prefs?.matrix?.[top.cat];
          if (m && (!d.quietNow || top.level === "critical")) playSound(m.sound, d.prefs.volume);
        }
      }
      known.current = ids;
      setData(d);
    } catch { /* tarmoq uzilgan bo'lsa jim */ }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { known.current = null; return undefined; }
    refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 20000);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    const onMsg = (e) => {
      if (e.data?.type === "uvix-push") refresh();
      if (e.data?.type === "uvix-open" && e.data.view) navRef.current?.(e.data.view);
    };
    navigator.serviceWorker?.addEventListener?.("message", onMsg);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); navigator.serviceWorker?.removeEventListener?.("message", onMsg); };
  }, [enabled, refresh]);

  // Push bildirishnomasi bosilib ilova yangidan ochilganda: /?view=orders
  useEffect(() => {
    if (!enabled) return;
    try {
      const v = new URLSearchParams(window.location.search).get("view");
      if (v) { navRef.current?.(v); window.history.replaceState(window.history.state, "", window.location.pathname); }
    } catch { /* */ }
  }, [enabled]);

  const markRead = useCallback(async (ids) => {
    setData((d) => {
      const set = ids === "all" ? null : new Set(ids);
      const items = d.items.map((n) => (!set || set.has(n.id) ? { ...n, read: true } : n));
      return { ...d, items, unread: items.filter((n) => !n.read).length };
    });
    try { await markNotificationsRead(ids); } catch { /* */ }
  }, []);
  const savePrefs = useCallback(async (prefs) => {
    setData((d) => ({ ...d, prefs }));
    const r = await saveNotifyPrefs(prefs);
    setData((d) => ({ ...d, prefs: r.prefs }));
    refresh();
    return r.prefs;
  }, [refresh]);

  return { ...data, refresh, markRead, savePrefs };
}
