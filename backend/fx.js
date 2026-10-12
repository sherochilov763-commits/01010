// fx.js — dollar kursi: Markaziy bank (cbu.uz) kursi avtomatik yoki Sozlamalardagi qo'lda kiritilgan kurs.
//
//  • Sozlamalar (uvix:settings): usdRate — qo'lda kurs; usdRateAuto — false bo'lsa faqat qo'lda kurs ishlatiladi.
//  • Markaziy bank kursi 3 soatda bir marta olinadi va uvix:fx da saqlanadi (internet uzilsa — oxirgi ma'lum kurs).
//  • Olib bo'lmasa (yoki hali hech qachon olinmagan bo'lsa) — qo'lda kurs ishlatiladi.
const CBU_URL = "https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/";
const KEY = "uvix:fx";
const TTL = 3 * 3600 * 1000;
const RETRY = 10 * 60 * 1000;

function parseCbu(json) {
  const row = Array.isArray(json) ? json.find((r) => r && r.Ccy === "USD") : null;
  const rate = row ? Number(String(row.Rate).replace(",", ".")) : NaN;
  if (!(rate > 1000 && rate < 1e6)) return null;
  const m = String(row.Date || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return { rate: Math.round(rate * 100) / 100, date: m ? `${m[3]}-${m[2]}-${m[1]}` : "" };
}

function createFx({ getStmt, upsertStmt, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  const readJson = (k, fb) => { try { const r = getStmt.get(k); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  let lastTry = 0;
  let inflight = null;

  async function refresh() {
    lastTry = now();
    try {
      const r = await fetchImpl(CBU_URL, { signal: AbortSignal.timeout(6000), headers: { accept: "application/json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const got = parseCbu(await r.json());
      if (!got) throw new Error("kurs topilmadi");
      const v = { ...got, fetchedAt: new Date(now()).toISOString() };
      upsertStmt.run(KEY, JSON.stringify(v));
      return v;
    } catch (e) {
      console.warn("[fx] Markaziy bank kursini olib bo'lmadi:", e.message);
      return null;
    }
  }

  // Kurs ma'lumoti (brauzerga beriladi)
  async function current() {
    const settings = readJson("uvix:settings", {}) || {};
    const manual = Number(settings.usdRate) > 0 ? Number(settings.usdRate) : 12700;
    const auto = settings.usdRateAuto !== false;
    let cbu = readJson(KEY, null);
    if (auto) {
      const age = cbu?.fetchedAt ? now() - new Date(cbu.fetchedAt).getTime() : Infinity;
      if (age > TTL && now() - lastTry > (cbu ? RETRY : 0)) {
        if (!inflight) inflight = refresh().finally(() => { inflight = null; });
        // Eski kurs bo'lsa — kutmaymiz, yangilanish orqada ketadi
        const fresh = cbu ? null : await inflight;
        if (fresh) cbu = fresh;
      }
    }
    const useCbu = auto && cbu && cbu.rate > 0;
    return {
      rate: useCbu ? cbu.rate : manual,
      source: useCbu ? "cbu" : "manual",
      auto,
      manual,
      cbu: cbu && cbu.rate ? { rate: cbu.rate, date: cbu.date || "", fetchedAt: cbu.fetchedAt || "" } : null,
    };
  }

  return { current, refresh, parseCbu };
}

module.exports = { createFx, parseCbu, CBU_URL };
