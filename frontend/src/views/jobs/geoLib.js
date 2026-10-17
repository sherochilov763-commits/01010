// geoLib.js — masofa, yo'l vaqti, xarita havolalari, eng yaqin ish va xodim tavsiyasi (React'siz, unit testda ham).
export function haversine(a, b) {
  const R = 6371000, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Yo'l bo'yicha taxminiy masofa (shahar ichida to'g'ri chiziqdan ~1.35 marta uzun) va vaqt (o'rtacha 25 km/soat)
export const ROAD = 1.35, SPEED = 25;
export const roadKm = (a, b) => (haversine(a, b) / 1000) * ROAD;
export const travelMin = (km) => Math.max(3, Math.round((km / SPEED) * 60));
export const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km`);
export const okGeo = (g) => !!g && Number.isFinite(g.lat) && Number.isFinite(g.lng);
// Navigator: Yandex (asosiy) va Google
export const yandexRoute = (from, to) => `https://yandex.uz/maps/?rtext=${from ? `${from.lat},${from.lng}` : ""}~${to.lat},${to.lng}&rtt=auto`;
export const googleRoute = (from, to) => `https://www.google.com/maps/dir/?api=1${from ? `&origin=${from.lat},${from.lng}` : ""}&destination=${to.lat},${to.lng}&travelmode=driving`;

export function parseMapLink(s) {
  let t = String(s || "");
  try { t = decodeURIComponent(t); } catch { /* */ }
  t = t.replace(/\+/g, " ");
  const num = "(-?\\d{1,3}\\.\\d+)";
  const pick = (lat, lng) => { const a = Number(lat), b = Number(lng); return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0) ? { lat: a, lng: b } : null; };
  let m;
  if (/yandex\./i.test(t)) {
    if ((m = new RegExp(`whatshere\\[point\\]=${num},${num}`).exec(t))) return pick(m[2], m[1]);
    if ((m = new RegExp(`[?&]pt=${num},${num}`).exec(t))) return pick(m[2], m[1]);
    if ((m = new RegExp(`[?&]ll=${num},${num}`).exec(t))) return pick(m[2], m[1]);
  }
  if ((m = new RegExp(`!3d${num}!4d${num}`).exec(t))) return pick(m[1], m[2]);
  if ((m = new RegExp(`@${num},${num}`).exec(t))) return pick(m[1], m[2]);
  if ((m = new RegExp(`[?&](?:q|query|ll|destination|center)=${num},\\s*${num}`).exec(t))) return pick(m[1], m[2]);
  if ((m = new RegExp(`^\\s*${num}\\s*[,; ]\\s*${num}\\s*$`).exec(t))) return pick(m[1], m[2]);
  return null;
}

// Joriy joydan eng yaqin keyingi ishlar (yaqinidan uzoqqa)
export function byDistance(from, jobs) {
  return jobs.filter((j) => okGeo(j.geo)).map((j) => { const km = roadKm(from, j.geo); return { j, km, min: travelMin(km) }; }).sort((a, b) => a.km - b.km);
}

// Yo'lni tartiblash: eng yaqin qo'shni usuli (start → eng yaqin → undan eng yaqin …)
export function routeKm(start, list) {
  let km = 0, cur = start;
  for (const j of list) { if (cur) km += roadKm(cur, j.geo); cur = j.geo; }
  return km;
}
export function nearestOrder(start, jobs) {
  const left = jobs.filter((j) => okGeo(j.geo));
  const out = []; let cur = start || left[0]?.geo;
  while (left.length) {
    let bi = 0, bd = Infinity;
    left.forEach((j, i) => { const d = haversine(cur, j.geo); if (d < bd) { bd = d; bi = i; } });
    const [j] = left.splice(bi, 1); out.push(j); cur = j.geo;
  }
  return out;
}

// Vazifaga xodim tavsiyasi: o'sha vaqtda bo'sh va eng yaqin (joriy joyi yoki o'sha kungi oldingi ishi joyi)
const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const dur = (j) => j.duration || (j.kind === "install" ? 120 : j.kind === "deliver" ? 40 : 60);
export function recommend({ target, date, time, duration = 60, people, jobs, live = {}, workshop = null, today = null, excludeId = null }) {
  if (!okGeo(target)) return [];
  const s = hm(time), e = s != null ? s + duration : null;
  return people.map((p) => {
    const mine = jobs.filter((j) => j.id !== excludeId && j.date === date && (j.assigneeIds || []).includes(p.id) && j.status !== "cancelled" && !j.ro);
    const busy = s != null && mine.some((j) => { const a = hm(j.time); return a != null && a < e && s < a + dur(j); });
    // qayerdan keladi: o'sha kundagi undan oldingi ishi → hozirgi joyi (bugun) → sex
    const before = s == null ? null : mine.filter((j) => okGeo(j.geo) && hm(j.time) != null && hm(j.time) <= s).sort((a, b) => hm(b.time) - hm(a.time))[0];
    const from = before ? { ...before.geo, src: "job" } : date === today && okGeo(live[p.id]) ? { ...live[p.id], src: "live" } : okGeo(workshop) ? { ...workshop, src: "workshop" } : null;
    const km = from ? roadKm(from, target) : null;
    // bo'sh oraliq (09:00–18:00 ichida, shu vaqtni o'z ichiga olgan)
    let freeFrom = 9 * 60, freeTo = 18 * 60;
    if (s != null) for (const j of mine) { const a = hm(j.time); if (a == null) continue; const b = a + dur(j); if (b <= s) freeFrom = Math.max(freeFrom, b); if (a >= (e ?? s)) freeTo = Math.min(freeTo, a); }
    return { p, km, from: from?.src || null, busy, jobsN: mine.length, freeFrom, freeTo };
  }).sort((a, b) => (a.busy - b.busy) || ((a.km ?? 1e9) - (b.km ?? 1e9)) || (a.jobsN - b.jobsN));
}

// «Mening kunim» tartibi: joriy joydan yaqinidan uzoqqa. Vaqti belgilangan ish kechikib qolmasin:
// eng yaqini boshqa ish bo'lsa va vaqt yetsa — «HH:MM gacha vaqt bor — avval …» maslahati; yetmasa — vaqtlisi birinchi.
export function planDay(from, jobs, nowMin) {
  const geo = jobs.filter((j) => okGeo(j.geo));
  if (!okGeo(from) || !geo.length) return { order: jobs, dist: {}, hint: null };
  const dist = Object.fromEntries(geo.map((j) => { const km = roadKm(from, j.geo); return [j.id, { km, min: travelMin(km) }]; }));
  const near = [...geo].sort((a, b) => dist[a.id].km - dist[b.id].km);
  const timed = geo.filter((j) => hm(j.time) != null).sort((a, b) => hm(a.time) - hm(b.time));
  const first = timed[0];
  let head = near[0], hint = null;
  if (first && first.id !== near[0].id) {
    const n = near[0];
    const back = travelMin(roadKm(n.geo, first.geo));
    const slack = hm(first.time) - (nowMin + dist[n.id].min + dur(n) + back);
    if (slack >= 0) hint = { time: first.time, job: n };
    else head = first;
  }
  const rest = near.filter((j) => j.id !== head.id);
  return { order: [head, ...rest, ...jobs.filter((j) => !okGeo(j.geo))], dist, nearestId: near[0].id, hint };
}
