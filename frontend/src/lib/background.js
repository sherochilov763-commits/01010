// background.js — shaxsiy fon (oboi): tayyor fonlar, kun vaqtiga qarab o'zgaradigan fon, o'z rasmingiz.
// Shisha rejimi (Bitrix24 kabi): panellar shaffof, fon ko'rinib turadi, yozuvlar oq.
import { useEffect, useState } from "react";
import { fetchMyBackground, saveMyBackground } from "../storage.js";
import { assetUrl } from "./notify.js";

export const BG_PRESETS = [
  { key: "mesh", label: "Yumshoq gradient", url: assetUrl("wallpapers/mesh.svg") },
  { key: "land", label: "Tog' manzarasi", url: assetUrl("wallpapers/land.svg") },
];
export const DAY_PHASES = [
  { key: "tong", label: "Tong", from: 5, to: 9, url: assetUrl("wallpapers/tong.svg"), dark: false },
  { key: "kun", label: "Kun", from: 9, to: 17, url: assetUrl("wallpapers/kun.svg"), dark: false },
  { key: "oqshom", label: "Oqshom", from: 17, to: 20, url: assetUrl("wallpapers/oqshom.svg"), dark: true },
  { key: "tun", label: "Tun", from: 20, to: 5, url: assetUrl("wallpapers/tun.svg"), dark: true },
];
export const DEFAULT_BG = { kind: "none", preset: "mesh", glass: false, nightDark: true, dim: 0 };

function tashkentHour(d = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", hour12: false }).format(d)) % 24;
}
export function dayPhase(d = new Date()) {
  const h = tashkentHour(d);
  return DAY_PHASES.find((p) => (p.from < p.to ? h >= p.from && h < p.to : h >= p.from || h < p.to)) || DAY_PHASES[1];
}
// Hozirgi fon: { url, dark (fon qorong'imi), phase }
export function resolveBg(bg, now = new Date()) {
  if (!bg || bg.kind === "none") return null;
  if (bg.kind === "custom") return bg.image ? { url: bg.image, dark: true } : null;
  if (bg.kind === "dynamic") { const p = dayPhase(now); return { url: p.url, dark: p.dark, phase: p.key }; }
  const p = BG_PRESETS.find((x) => x.key === bg.preset) || BG_PRESETS[0];
  return { url: p.url, dark: false };
}

// Rasmni brauzerda kichraytirish (1920px, JPEG) — tez yuklansin, serverga og'ir bo'lmasin
export function shrinkImage(file, max = 1920, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error("Faqat rasm fayli tanlang"));
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        let q = quality, out = c.toDataURL("image/jpeg", q);
        while (out.length > 1_800_000 && q > 0.45) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
        resolve(out);
      };
      img.onerror = () => reject(new Error("Rasmni o'qib bo'lmadi"));
      img.src = r.result;
    };
    r.onerror = () => reject(new Error("Faylni o'qib bo'lmadi"));
    r.readAsDataURL(file);
  });
}

export function useBackground(enabled) {
  const [bg, setBg] = useState(DEFAULT_BG);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) { setBg(DEFAULT_BG); return; }
    let alive = true;
    fetchMyBackground().then((b) => alive && b && setBg({ ...DEFAULT_BG, ...b })).catch(() => {});
    return () => { alive = false; };
  }, [enabled]);
  // Kun vaqti o'zgarishini kuzatamiz (har 5 daqiqada)
  useEffect(() => {
    if (bg.kind !== "dynamic") return undefined;
    const t = setInterval(() => setTick((x) => x + 1), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [bg.kind]);
  async function save(next) {
    const prev = bg;
    setBg(next);
    try { const saved = await saveMyBackground(next.kind === "none" && !next.glass ? null : next); if (saved) setBg({ ...DEFAULT_BG, ...saved }); }
    catch (e) { setBg(prev); throw e; }
  }
  return { bg, resolved: resolveBg(bg), tick, save };
}
