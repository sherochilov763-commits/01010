// attendance.js — xodimlar davomati: "Keldim"/"Ketdim" (sex hududida ekanini joylashuv bilan tekshirib),
// kechikish / erta ketish / kech ketish (qo'shimcha vaqt) hisobi, admin qo'lda to'g'rilashi,
// Telegram'ga kunlik ("kim kelmadi"), haftalik va oylik hisobotlar.
//
// Joylashuv FAQAT tugma bosilgan lahzada olinadi — kun bo'yi kuzatilmaydi.
//
// Saqlash (ichki kalitlar, KV orqali o'qib/yozib bo'lmaydi):
//   uvix:attConfig        — sozlamalar (sex joylashuvi, radius, jadval, imtiyoz, xodimga alohida jadval)
//   uvix:att:YYYY-MM      — { [employeeId]: { [YYYY-MM-DD]: { in, out, inDist, outDist, manual } } }
//   uvix:attSent          — qaysi hisobot qachon yuborilgani (qayta yubormaslik uchun)

const TZ = "Asia/Tashkent";
const DAY_NAMES = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

const DEFAULT_CONFIG = {
  enabled: true,
  office: null, // { lat, lng, radius }
  schedule: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5, 6] }, // 0 = yakshanba
  grace: 15, // shu daqiqagacha kechikish hisoblanmaydi
  overrides: {}, // { [employeeId]: { start, end, days, track } }
  dailyAt: "09:30",
  reports: { daily: true, weekly: true, monthly: true },
  reportChatId: "", // bo'sh bo'lsa — Sozlamalardagi bot chat ID
  photo: true, // "Keldim"da selfi majburiy
  photoDays: 60, // selfilar shuncha kundan keyin o'chiriladi
  // Xodimning o'ziga Telegram (UVIX boti orqali, xodim botni ulagan bo'lsa) va adminga shaxsiy xabarlar
  personal: { pre: true, notStarted: true, late: true, forgotOut: true, weekly: true, adminAbsent: true, confirm: true, manualNotice: true, monthly: true },
  autoOut: true, // «Ketdim» unutilsa — ish tugaganidan 3 soat keyin jadval bo'yicha tugash vaqti yoziladi («avto»)
  outAnywhere: true, // «Ketdim»ni sexdan tashqarida ham bosish mumkin (adminga masofa bilan ko'rinadi)
  faceIdIn: false, // «Keldim»dan oldin Face ID tasdig'i (Face ID yoqilgan telefonlarda)
  appUrl: "", // xabardagi havola (admin sozlamani saqlaganda o'zi yoziladi)
  since: null, // davomat boshlangan kun (sex joylashuvi birinchi marta belgilangan) — undan oldingi kunlar hisoblanmaydi
};

// ---------- vaqt (Toshkent) ----------
const fmtParts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function local(d = new Date()) {
  const p = Object.fromEntries(fmtParts.formatToParts(d).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  const hm = `${p.hour}:${p.minute}`;
  return { date, hm, min: Number(p.hour) * 60 + Number(p.minute), weekday: weekdayOf(date) };
}
const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
const toMin = (hm) => { const [h, m] = String(hm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const hmOf = (iso) => (iso ? local(new Date(iso)).hm : null);
const minOf = (iso) => (iso ? local(new Date(iso)).min : null);
function addDays(date, n) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dateRange(from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }
const dayLabel = (date) => { const [, m, d] = date.split("-").map(Number); return `${d}-${MONTHS[m - 1]}, ${DAY_NAMES[weekdayOf(date)]}`; };
// Davomiylik: «1 kun 2 soat 15 daq». 1 kun = xodimning ish kuni (jadval bo'yicha, masalan 9 soat).
function fmtDur(min, dayMin = 0) {
  min = Math.max(0, Math.round(min || 0));
  if (!min) return "0 daq";
  const d = dayMin > 0 ? Math.floor(min / dayMin) : 0;
  const rest = min - d * dayMin;
  const h = Math.floor(rest / 60), m = rest % 60;
  return [d ? `${d} kun` : "", h ? `${h} soat` : "", m ? `${m} daq` : ""].filter(Boolean).join(" ");
}
const dayLen = (sch) => Math.max(60, toMin(sch.end) - toMin(sch.start));

function haversine(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

module.exports = function registerAttendance(app, { getStmt, upsertStmt, readEmployees, requireAuth, requireAdmin, requireView = null, requireManage = null, sendTelegram, nowFn = () => new Date(), photoStore = null, notifyEmployee = async () => false, bio = null, onConfigChanged = () => {}, onChecked = () => {} }) {
  // Selfilar saqlash joyi tashqaridan beriladi (serverda — disk, demo'da — brauzer xotirasi):
  //   photoStore.save(empId, date, base64) -> { id } | { error }
  //   photoStore.send(res, id)              -> rasmni javob sifatida yuboradi
  //   photoStore.cleanup(cutoffDate)        -> o'chirilganlar soni
  function savePhoto(dataUrl, empId, date) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
    if (!m) return { error: "Selfi rasm formati noto'g'ri" };
    const approx = Math.floor((m[1].length * 3) / 4);
    if (approx < 2000 || approx > 600 * 1024) return { error: "Selfi rasm hajmi noto'g'ri" };
    if (!m[1].startsWith("/9j/")) return { error: "Selfi JPEG emas" }; // JPEG FFD8FF
    if (!photoStore) return { error: "Rasm saqlash sozlanmagan" };
    return photoStore.save(String(empId).replace(/[^a-zA-Z0-9_-]/g, ""), date, m[1]);
  }
  const cleanupPhotos = (days) => (photoStore ? photoStore.cleanup(addDays(local(nowFn()).date, -days)) : 0);

  const readJson = (key, fb) => { try { const r = getStmt.get(key); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
  const config = () => {
    const c = { ...DEFAULT_CONFIG, ...readJson("uvix:attConfig", {}) };
    c.schedule = { ...DEFAULT_CONFIG.schedule, ...(c.schedule || {}) };
    c.reports = { ...DEFAULT_CONFIG.reports, ...(c.reports || {}) };
    c.personal = { ...DEFAULT_CONFIG.personal, ...(c.personal || {}) };
    c.overrides = c.overrides || {};
    return c;
  };
  const monthKey = (date) => `uvix:att:${date.slice(0, 7)}`;
  const readMonth = (date) => readJson(monthKey(date), {});
  const writeMonth = (date, data) => upsertStmt.run(monthKey(date), JSON.stringify(data));

  // Xodimning jadvali (umumiy + alohida) va kuzatiladimi (admin — standart bo'yicha kuzatilmaydi)
  function scheduleFor(emp, cfg) {
    const o = cfg.overrides[emp.id] || {};
    const track = o.track !== undefined ? !!o.track : emp.role !== "admin";
    return { start: o.start || cfg.schedule.start, end: o.end || cfg.schedule.end, days: Array.isArray(o.days) && o.days.length ? o.days : cfg.schedule.days, track, custom: !!(o.start || o.end || (o.days && o.days.length)) };
  }

  // Bitta kun natijasi
  function evalDay(emp, date, rec, cfg, now) {
    const sch = scheduleFor(emp, cfg);
    const today = local(now);
    const workday = sch.days.includes(weekdayOf(date));
    const start = toMin(sch.start), end = toMin(sch.end);
    const inMin = minOf(rec?.in), outMin = minOf(rec?.out);
    const r = { date, workday, in: hmOf(rec?.in), out: hmOf(rec?.out), inDist: rec?.inDist ?? null, outDist: rec?.outDist ?? null, outFar: !!rec?.outFar, outAuto: !!rec?.outAuto, manual: rec?.manual || null, photo: rec?.inPhoto || null, inAt: rec?.in || null,
      status: "", lateMin: 0, earlyMin: 0, overMin: 0, workedMin: 0, missingOut: false };
    if (inMin != null && outMin != null && outMin > inMin) r.workedMin = outMin - inMin;
    if (inMin == null) {
      if (!workday) r.status = "dayoff";
      else if (date < today.date || (date === today.date && today.min >= end)) r.status = "absent";
      else if (date === today.date && today.min > start + cfg.grace) r.status = "notyet";
      else r.status = "pending";
      return r;
    }
    if (!workday) { r.status = "extra"; if (r.workedMin) r.overMin = r.workedMin; return r; }
    r.status = inMin > start + cfg.grace ? "late" : "ontime";
    if (r.status === "late") r.lateMin = inMin - start;
    if (outMin != null) {
      if (outMin < end) r.earlyMin = end - outMin;
      if (outMin > end) r.overMin = outMin - end;
    } else if (date < today.date) r.missingOut = true;
    return r;
  }

  function report(from, to, { employeeId } = {}) {
    const cfg = config();
    const now = nowFn();
    const today = local(now).date;
    const last = to > today ? today : to;
    const months = {};
    const emps = readEmployees().filter((e) => (employeeId ? e.id === employeeId : scheduleFor(e, cfg).track));
    const rows = emps.map((emp) => {
      const sch = scheduleFor(emp, cfg);
      const empSince = emp.createdAt ? String(emp.createdAt).slice(0, 10) : "0000-00-00";
      const since = cfg.since && cfg.since > empSince ? cfg.since : empSince;
      const days = last < from ? [] : dateRange(from, last).filter((d) => d >= since).map((d) => {
        const mk = d.slice(0, 7);
        if (!months[mk]) months[mk] = readMonth(d);
        return evalDay(emp, d, months[mk][emp.id]?.[d], cfg, now);
      });
      const sum = { workdays: 0, present: 0, late: 0, lateMin: 0, early: 0, earlyMin: 0, overMin: 0, workedMin: 0, absent: 0, missingOut: 0 };
      days.forEach((d) => {
        if (d.workday && d.status !== "pending") sum.workdays++;
        if (d.in) sum.present++;
        if (d.lateMin) { sum.late++; sum.lateMin += d.lateMin; }
        if (d.earlyMin) { sum.early++; sum.earlyMin += d.earlyMin; }
        sum.overMin += d.overMin;
        sum.workedMin += d.workedMin;
        if (d.status === "absent") sum.absent++;
        if (d.missingOut) sum.missingOut++;
      });
      sum.dayMin = dayLen(sch);
      return { employee: { id: emp.id, name: emp.name, role: emp.role }, schedule: sch, days, sum };
    });
    return { from, to, today, grace: cfg.grace, rows };
  }

  // ---------- Telegram hisobot matnlari ----------
  function dailyText(date) {
    const r = report(date, date);
    const on = [], late = [], notyet = [];
    r.rows.forEach((row) => {
      const d = row.days[0];
      if (!d || !d.workday) return;
      if (d.status === "ontime") on.push(`${row.employee.name} (${d.in})`);
      else if (d.status === "late") late.push(`${row.employee.name} — ${d.in}, ${fmtDur(d.lateMin)} kech`);
      else notyet.push(row.employee.name);
    });
    if (!on.length && !late.length && !notyet.length) return null;
    const lines = [`📋 <b>Davomat — ${dayLabel(date)}</b>`, "", `✅ O'z vaqtida: ${on.length}${on.length ? `\n   ${on.join(", ")}` : ""}`];
    if (late.length) lines.push("", `⏰ Kechikdi: ${late.length}`, ...late.map((x) => `   • ${x}`));
    if (notyet.length) lines.push("", `❌ Hali belgilamadi: ${notyet.length}`, ...notyet.map((x) => `   • ${x}`));
    return lines.join("\n");
  }
  function periodText(title, from, to) {
    const r = report(from, to);
    if (!r.rows.length) return null;
    const rows = [...r.rows].sort((a, b) => b.sum.lateMin - a.sum.lateMin || b.sum.absent - a.sum.absent);
    const lines = [`📊 <b>${title}</b>`, `${dayLabel(from)} — ${dayLabel(to)}`, ""];
    rows.forEach((row) => {
      const s = row.sum;
      const parts = [
        `${s.present}/${s.workdays} kun keldi`,
        s.late ? `⏰ ${s.late} marta kech (${fmtDur(s.lateMin, s.dayMin)})` : "⏰ kechikmadi",
        s.early ? `↩️ ${s.early} marta erta ketdi (${fmtDur(s.earlyMin, s.dayMin)})` : null,
        s.overMin ? `➕ ${fmtDur(s.overMin, s.dayMin)} qo'shimcha` : null,
        s.absent ? `❌ ${s.absent} kun kelmadi` : null,
        s.missingOut ? `⚠️ ${s.missingOut} kun "Ketdim" belgilanmagan` : null,
        `🕒 ${fmtDur(s.workedMin, s.dayMin)} ishladi`,
      ].filter(Boolean);
      lines.push(`<b>${row.employee.name}</b>`, `   ${parts.join(" · ")}`, "");
    });
    return lines.join("\n").trim();
  }
  const prevWeek = (date) => { const wd = weekdayOf(date) || 7; const mon = addDays(date, -(wd - 1) - 7); return { from: mon, to: addDays(mon, 6), key: mon }; };
  const prevMonth = (date) => { const [y, m] = date.split("-").map(Number); const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y; const last = new Date(Date.UTC(py, pm, 0)).getUTCDate(); const mk = `${py}-${String(pm).padStart(2, "0")}`; return { from: `${mk}-01`, to: `${mk}-${last}`, key: mk, label: `${MONTHS[pm - 1]} ${py}` }; };

  // kind: "daily" | "reports" | "absent" — server qaysi chatga (guruh / admin shaxsiy) yuborishni shu bo'yicha tanlaydi
  async function send(text, kind = "reports") {
    const cfg = config();
    if (!text) return false;
    return sendTelegram(text, cfg.reportChatId || undefined, kind);
  }

  // Har daqiqada tekshiradi: vaqti kelgan hisobotni bir marta yuboradi (server qayta ishga tushsa ham takrorlanmaydi)
  async function tick() {
    const cfg = config();
    if (!cfg.enabled || !cfg.office) return; // sex joylashuvi belgilanmaguncha davomat ishlatilmayapti — hisobot/eslatma yo'q
    const now = local(nowFn());
    const sent = readJson("uvix:attSent", {});
    let changed = false;
    if (cfg.reports.daily && sent.daily !== now.date && now.hm >= cfg.dailyAt && now.hm < "13:00" && cfg.schedule.days.includes(now.weekday)) {
      sent.daily = now.date; changed = true;
      await send(dailyText(now.date), "daily");
    }
    if (cfg.reports.weekly && now.weekday === 1 && now.hm >= "09:00") {
      const w = prevWeek(now.date);
      if (sent.weekly !== w.key) { sent.weekly = w.key; changed = true; await send(periodText("Haftalik davomat", w.from, w.to)); }
    }
    if (cfg.reports.monthly && now.date.endsWith("-01") && now.hm >= "09:05") {
      const pm = prevMonth(now.date);
      if (sent.monthly !== pm.key) { sent.monthly = pm.key; changed = true; await send(periodText(`Oylik davomat — ${pm.label}`, pm.from, pm.to)); }
    }
    // ---- Shaxsiy eslatmalar (har xodim, har kun — bir martadan) ----
    const P = cfg.personal;
    sent.personal = sent.personal && sent.personal.date === now.date ? sent.personal : { date: now.date, by: {} };
    const link = cfg.appUrl ? `\n${cfg.appUrl}` : "";
    const absentForAdmin = [];
    const todayData = readMonth(now.date);
    for (const emp of readEmployees()) {
      const sch = scheduleFor(emp, cfg);
      if (!sch.track || !sch.days.includes(now.weekday)) continue;
      const rec = todayData[emp.id]?.[now.date] || {};
      const start = toMin(sch.start), end = toMin(sch.end);
      const flags = sent.personal.by[emp.id] || (sent.personal.by[emp.id] = {});
      const first = String(emp.name || "").split(" ")[0];
      const mark = (k) => { flags[k] = true; changed = true; };
      if (P.pre && !rec.in && !flags.pre && now.min >= start - 15 && now.min < start) {
        mark("pre"); await notifyEmployee(emp.id, `⏰ ${first}, 15 daqiqadan so'ng ish boshlanadi (${sch.start}).\nSexga kelganingizda UVIX'da «Keldim»ni bosing.${link}`);
      }
      if (P.notStarted && !rec.in && !flags.notStarted && now.min >= start + cfg.grace && now.min < end) {
        mark("notStarted"); await notifyEmployee(emp.id, `❗ ${first}, ish ${sch.start} da boshlangan — siz hali «Keldim» bosmadingiz.\nKechikish hisoblanmoqda: ${now.min - start} daqiqa.${link}`);
      }
      if (P.adminAbsent && !rec.in && !flags.adminAbsent && now.min >= start + 30 && now.min < end) {
        mark("adminAbsent"); absentForAdmin.push(`${emp.name} (ish ${sch.start} da boshlangan)`);
      }
      if (P.forgotOut && rec.in && !rec.out && !flags.forgotOut && now.min >= end + 30) {
        mark("forgotOut");
        const btn = /^https:\/\//.test(cfg.appUrl || "") ? { reply_markup: { inline_keyboard: [[{ text: "👋 Ketdim", url: `${cfg.appUrl.replace(/\/$/, "")}/?checkout=1` }]] } } : undefined;
        await notifyEmployee(emp.id, `🕕 ${first}, ish ${sch.end} da tugadi — «Ketdim» bosishni unutmang.${cfg.autoOut ? `\nBosilmasa, ${sch.end} ketish vaqti deb avtomatik yoziladi.` : "\nAks holda bugungi ish vaqtingiz to'liq hisoblanmaydi."}${btn ? "" : link}`, btn);
      }
    }
    if (absentForAdmin.length) await send(`⚠️ <b>Hali kelmadi (${now.hm})</b>\n${absentForAdmin.map((x) => `• ${x}`).join("\n")}`, "absent");
    // Shaxsiy xulosa: haftalik (dushanba 09:00) va oylik (har oyning 1-kuni 09:05) — har xodimga bir marta
    const personalSummary = async (title, from, to) => {
      for (const row of report(from, to).rows) {
        const s = row.sum;
        if (!s.workdays) continue;
        const dm = s.dayMin;
        const lines = [`📊 <b>${title}</b> (${dayLabel(from)} — ${dayLabel(to)})`, "",
          `✅ Keldingiz: ${s.present}/${s.workdays} kun`,
          s.late ? `⏰ Kechikish: ${s.late} marta (${fmtDur(s.lateMin, dm)})` : "⏰ Kechikish yo'q — barakalla!",
          s.early ? `↩️ Erta ketish: ${s.early} marta (${fmtDur(s.earlyMin, dm)})` : null,
          s.overMin ? `➕ Qo'shimcha: ${fmtDur(s.overMin, dm)}` : null,
          s.absent ? `❌ Kelmagan kun: ${s.absent}` : null,
          `🕒 Ishladingiz: ${fmtDur(s.workedMin, dm)}`].filter(Boolean);
        await notifyEmployee(row.employee.id, lines.join("\n"));
      }
    };
    if (P.weekly && now.weekday === 1 && now.hm >= "09:00") {
      const w = prevWeek(now.date);
      if (sent.weeklyPersonal !== w.key) { sent.weeklyPersonal = w.key; changed = true; await personalSummary("O'tgan hafta", w.from, w.to); }
    }
    if (P.monthly && now.date.endsWith("-01") && now.hm >= "09:05") {
      const pm = prevMonth(now.date);
      if (sent.monthlyPersonal !== pm.key) { sent.monthlyPersonal = pm.key; changed = true; await personalSummary(`${pm.label[0].toUpperCase()}${pm.label.slice(1)} — oylik xulosa`, pm.from, pm.to); }
    }
    // Avtomatik «Ketdim»: bugun ish tugaganidan 3 soat keyin yoki o'tgan kunlar (server o'chiq bo'lgan bo'lsa)
    if (cfg.autoOut) {
      const emps = readEmployees();
      for (const d of [addDays(now.date, -1), now.date]) {
        const data = readMonth(d);
        let dirty = false;
        for (const emp of emps) {
          const rec = data[emp.id]?.[d];
          if (!rec?.in || rec.out) continue;
          const sch = scheduleFor(emp, cfg);
          const end = toMin(sch.end);
          if (d === now.date && now.min < end + 180) continue;
          const inMin = minOf(rec.in);
          const outHm = inMin > end ? hmOf(rec.in) : sch.end;
          rec.out = new Date(`${d}T${outHm}:00+05:00`).toISOString();
          rec.outAuto = true;
          dirty = true;
          if (P.forgotOut) await notifyEmployee(emp.id, `🤖 «Ketdim» bosilmagani uchun ${d === now.date ? "bugungi" : "kechagi"} ketish vaqti <b>${outHm}</b> deb yozildi («avto»). Qo'shimcha vaqt hisoblanmadi.`);
        }
        if (dirty) writeMonth(d, data);
      }
    }
    if (sent.cleanup !== now.date) {
      sent.cleanup = now.date; changed = true;
      try { const n = cleanupPhotos(cfg.photoDays || 60); if (n) console.log(`Davomat: ${n} ta eski selfi o'chirildi`); } catch (e) { console.error("Selfilarni tozalash:", e.message); }
    }
    if (changed) upsertStmt.run("uvix:attSent", JSON.stringify(sent));
  }
  const timer = setInterval(() => tick().catch((e) => console.error("Davomat hisoboti:", e.message)), 60 * 1000);
  if (timer.unref) timer.unref();

  // ==================== API ====================
  const publicConfig = (cfg) => ({ enabled: cfg.enabled, officeSet: !!cfg.office, radius: cfg.office?.radius || 150, schedule: cfg.schedule, grace: cfg.grace, photo: !!cfg.photo, outAnywhere: cfg.outAnywhere !== false, faceIdIn: !!cfg.faceIdIn });

  // Mening bugungi holatim va shu oy tarixim
  app.get("/api/attendance/me", requireAuth, (req, res) => {
    const cfg = config();
    const emp = readEmployees().find((e) => e.id === req.user.id);
    if (!emp) return res.status(404).json({ error: "not_found" });
    const today = local(nowFn()).date;
    const month = /^\d{4}-\d{2}$/.test(req.query.month || "") ? req.query.month : today.slice(0, 7);
    const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    const r = report(`${month}-01`, `${month}-${lastDay}`, { employeeId: emp.id });
    const row = r.rows[0];
    const todayRow = row?.days.find((d) => d.date === today) || evalDay(emp, today, null, cfg, nowFn());
    const sch = scheduleFor(emp, cfg);
    res.json({ config: publicConfig(cfg), schedule: sch, dayMin: dayLen(sch), today: todayRow, month, days: row?.days || [], sum: row?.sum || null, faceIdRequired: !!cfg.faceIdIn && !!bio?.hasPasskey(emp.id) });
  });

  // Keldim / Ketdim
  app.post("/api/attendance/check", requireAuth, (req, res) => {
    const cfg = config();
    const { type, lat, lng, accuracy, dryRun, photo } = req.body || {};
    if (!cfg.enabled) return res.status(400).json({ error: "disabled", message: "Davomat o'chirilgan" });
    if (!["in", "out"].includes(type)) return res.status(400).json({ error: "bad_type" });
    if (!cfg.office) return res.status(400).json({ error: "no_office", message: "Administrator hali sex joylashuvini belgilamagan" });
    if (typeof lat !== "number" || typeof lng !== "number") return res.status(400).json({ error: "no_location", message: "Joylashuv aniqlanmadi — telefonda joylashuvga ruxsat bering" });
    const acc = Math.max(0, Number(accuracy) || 0);
    if (acc > 500) return res.status(400).json({ error: "inaccurate", message: `Joylashuv aniq emas (±${Math.round(acc)} m). Ochiq joyda yoki Wi-Fi yoqilgan holda qayta urining.` });
    const dist = Math.round(haversine({ lat, lng }, cfg.office));
    const allowed = cfg.office.radius + Math.min(acc, 100);
    const far = dist > allowed;
    if (far && !(type === "out" && cfg.outAnywhere !== false)) {
      const far = dist >= 1000 ? `${(dist / 1000).toFixed(1).replace(".", ",")} km` : `${dist} m`;
      return res.status(403).json({ error: "too_far", distance: dist, message: `Siz sexdan ${far} uzoqdasiz. Belgilash faqat sex hududida (${cfg.office.radius} m) mumkin.` });
    }
    const now = nowFn();
    const { date } = local(now);
    const data = readMonth(date);
    const mine = data[req.user.id] || (data[req.user.id] = {});
    const existing = mine[date] || {};
    // Avval joylashuvni tekshirib olamiz — selfi keyin olinadi (uzoqda turib bekorga rasm tushirmasin)
    // Face ID tasdig'i (yoqilgan bo'lsa va xodimda Face ID bor bo'lsa) — faqat «Keldim»
    const needBio = type === "in" && !!cfg.faceIdIn && !!bio?.hasPasskey(req.user.id) && !existing.in;
    if (dryRun) return res.json({ ok: true, dryRun: true, distance: dist, far, needPhoto: type === "in" && !!cfg.photo && !existing.in, needBio, already: type === "in" && !!existing.in });
    const rec = mine[date] || (mine[date] = {});
    if (type === "in") {
      if (rec.in) return res.json({ ok: true, already: true, record: rec });
      if (needBio && !bio.recentlyVerified(req.user.id)) return res.status(403).json({ error: "bio_required", message: "Avval Face ID bilan tasdiqlang" });
      if (cfg.photo) {
        if (!photo) return res.status(400).json({ error: "photo_required", message: "Selfi kerak — kamerani yoqib, rasmga tushing" });
        const saved = savePhoto(photo, req.user.id, date);
        if (saved.error) return res.status(400).json({ error: "bad_photo", message: saved.error });
        rec.inPhoto = saved.id;
      }
      rec.in = now.toISOString(); rec.inDist = dist;
    } else {
      rec.out = now.toISOString(); rec.outDist = dist; // oxirgi "Ketdim" hisobga olinadi
      if (far) rec.outFar = true; else delete rec.outFar;
      delete rec.outAuto;
    }
    writeMonth(date, data);
    const emp = readEmployees().find((e) => e.id === req.user.id);
    const today = evalDay(emp, date, rec, cfg, now);
    res.json({ ok: true, record: rec, today });
    try { onChecked(req.user.id, type); } catch { /* ixtiyoriy */ }
    // Xodimning o'ziga tasdiq: kechikkan bo'lsa — kechikish (shu oydagi jami bilan), aks holda oddiy tasdiq
    const dm = dayLen(scheduleFor(emp, cfg));
    if (type === "in" && today.status === "late" && cfg.personal.late) {
      const m = report(`${date.slice(0, 7)}-01`, date, { employeeId: emp.id }).rows[0]?.sum;
      notifyEmployee(emp.id, `⏰ Keldingiz: ${today.in} — bugun <b>${fmtDur(today.lateMin)}</b> kechikdingiz.${m ? `\nBu oy: ${m.late} marta, jami ${fmtDur(m.lateMin, dm)}.` : ""}`).catch(() => {});
    } else if (type === "in" && cfg.personal.confirm) {
      notifyEmployee(emp.id, `✅ Keldingiz: <b>${today.in}</b>. Ishingizga omad!`).catch(() => {});
    } else if (type === "out" && cfg.personal.confirm) {
      const farTxt = far ? `\n📍 Sexdan tashqarida belgilandi (${dist >= 1000 ? `${(dist / 1000).toFixed(1).replace(".", ",")} km` : `${dist} m`}).` : "";
      notifyEmployee(emp.id, `👋 Ketdingiz: <b>${today.out}</b>. Bugun ishladingiz: ${fmtDur(today.workedMin)}${today.overMin ? ` (+${fmtDur(today.overMin)} qo'shimcha)` : ""}.${farTxt}`).catch(() => {});
    }
  });

  // ---- Admin ----
  const canView = requireView || requireAdmin, canManage = requireManage || requireAdmin;
  app.get("/api/attendance/config", requireAuth, canView, (req, res) => res.json({ config: config() }));
  app.put("/api/attendance/config", requireAuth, canManage, (req, res) => {
    const b = req.body?.config || {};
    const hm = (v, d) => (/^\d{2}:\d{2}$/.test(v || "") ? v : d);
    const days = (arr) => (Array.isArray(arr) ? [...new Set(arr.map(Number).filter((n) => n >= 0 && n <= 6))].sort() : undefined);
    const cur = config();
    const next = {
      enabled: b.enabled !== undefined ? !!b.enabled : cur.enabled,
      office: b.office === null ? null : b.office && typeof b.office.lat === "number" && typeof b.office.lng === "number"
        ? { lat: b.office.lat, lng: b.office.lng, radius: Math.min(2000, Math.max(30, Number(b.office.radius) || 150)) } : cur.office,
      schedule: b.schedule ? { start: hm(b.schedule.start, cur.schedule.start), end: hm(b.schedule.end, cur.schedule.end), days: days(b.schedule.days) || cur.schedule.days } : cur.schedule,
      grace: b.grace !== undefined ? Math.min(120, Math.max(0, Number(b.grace) || 0)) : cur.grace,
      overrides: {},
      dailyAt: hm(b.dailyAt, cur.dailyAt),
      reports: b.reports ? { daily: !!b.reports.daily, weekly: !!b.reports.weekly, monthly: !!b.reports.monthly } : cur.reports,
      reportChatId: b.reportChatId !== undefined ? String(b.reportChatId || "").trim().slice(0, 40) : cur.reportChatId,
      photo: b.photo !== undefined ? !!b.photo : cur.photo,
      personal: b.personal ? Object.fromEntries(Object.keys(DEFAULT_CONFIG.personal).map((k) => [k, !!b.personal[k]])) : cur.personal,
      appUrl: (() => { const o = req.get("origin"); return o && /^https?:\/\//.test(o) ? o : cur.appUrl; })(),
      photoDays: b.photoDays !== undefined ? Math.min(365, Math.max(7, Number(b.photoDays) || 60)) : cur.photoDays,
      autoOut: b.autoOut !== undefined ? !!b.autoOut : cur.autoOut,
      outAnywhere: b.outAnywhere !== undefined ? !!b.outAnywhere : cur.outAnywhere,
      faceIdIn: b.faceIdIn !== undefined ? !!b.faceIdIn : cur.faceIdIn,
      since: cur.since || null,
    };
    // Sex joylashuvi birinchi marta belgilangan kun — hisob shu kundan boshlanadi
    if (!next.since && next.office) next.since = local(nowFn()).date;
    Object.entries(b.overrides || cur.overrides || {}).forEach(([id, o]) => {
      if (!o || typeof o !== "object") return;
      const clean = {};
      if (/^\d{2}:\d{2}$/.test(o.start || "")) clean.start = o.start;
      if (/^\d{2}:\d{2}$/.test(o.end || "")) clean.end = o.end;
      const d = days(o.days); if (d && d.length) clean.days = d;
      if (o.track !== undefined) clean.track = !!o.track;
      if (Object.keys(clean).length) next.overrides[String(id).slice(0, 60)] = clean;
    });
    upsertStmt.run("uvix:attConfig", JSON.stringify(next));
    onConfigChanged(req.user?.name, cur, next);
    res.json({ config: next });
  });

  app.get("/api/attendance/report", requireAuth, canView, (req, res) => {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const { from, to } = req.query;
    if (!re.test(from || "") || !re.test(to || "") || from > to) return res.status(400).json({ error: "bad_range" });
    if (dateRange(from, to).length > 400) return res.status(400).json({ error: "range_too_long" });
    const r = report(from, to);
    // «O'z yo'nalishi» — faqat shu yo'nalish va «Umumiy» xodimlar
    const myLine = req.baseLine || (req.user.line && req.user.line !== "common" ? req.user.line : null);
    if (req.perms && req.perms["att.view"] === "line" && myLine) {
      const lineOf = new Map(readEmployees().map((e) => [e.id, e.line || "UVIXPRINT"]));
      r.rows = r.rows.filter((x) => [myLine, "common"].includes(lineOf.get(x.employee.id)));
    }
    res.json(r);
  });

  // Qo'lda to'g'rilash (telefoni o'chib qolgan va h.k.) — sababi bilan, kim o'zgartirgani yoziladi
  app.post("/api/attendance/manual", requireAuth, canManage, (req, res) => {
    const { employeeId, date, in: inHm, out: outHm, reason } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return res.status(400).json({ error: "bad_date" });
    if (!readEmployees().some((e) => e.id === employeeId)) return res.status(404).json({ error: "no_employee" });
    if (!String(reason || "").trim()) return res.status(400).json({ error: "no_reason", message: "Sababini yozing" });
    // Toshkent vaqti UTC+5 (yozgi vaqt yo'q)
    const iso = (hm) => (/^\d{2}:\d{2}$/.test(hm || "") ? new Date(`${date}T${hm}:00+05:00`).toISOString() : null);
    const data = readMonth(date);
    const mine = data[employeeId] || (data[employeeId] = {});
    const prev = mine[date] || {};
    const rec = { ...prev, in: inHm === "" ? undefined : iso(inHm) || prev.in, out: outHm === "" ? undefined : iso(outHm) || prev.out,
      manual: { by: req.user.name, reason: String(reason).trim().slice(0, 200), at: new Date().toISOString() } };
    delete rec.outAuto; delete rec.outFar;
    if (!rec.in && !rec.out) delete mine[date]; else mine[date] = rec;
    writeMonth(date, data);
    res.json({ ok: true, record: rec });
    // Shaffoflik: xodimga admin nimani o'zgartirganini yuboramiz
    if (config().personal.manualNotice) {
      const was = [prev.in ? `kelish ${hmOf(prev.in)}` : "kelish —", prev.out ? `ketish ${hmOf(prev.out)}` : "ketish —"].join(", ");
      const now2 = [rec.in ? `kelish ${hmOf(rec.in)}` : "kelish —", rec.out ? `ketish ${hmOf(rec.out)}` : "ketish —"].join(", ");
      notifyEmployee(employeeId, `✏️ <b>${req.user.name}</b> ${dayLabel(date)} davomatingizni o'zgartirdi:\n${was} → <b>${now2}</b>\nSabab: ${String(reason).trim().slice(0, 200).replace(/[<>&]/g, "")}`).catch(() => {});
    }
  });

  // Selfi (faqat admin)
  app.get("/api/attendance/photo/:month/:file", requireAuth, canView, (req, res) => {
    const { month, file } = req.params;
    if (!photoStore || !/^\d{4}-\d{2}$/.test(month) || !/^[a-zA-Z0-9_-]+_\d{4}-\d{2}-\d{2}_in\.jpg$/.test(file)) return res.status(400).end();
    photoStore.send(res, `${month}/${file}`);
  });

  // Hisobotni hozir ko'rish / yuborish (sinash uchun)
  app.post("/api/attendance/send-report", requireAuth, canManage, async (req, res) => {
    const type = req.body?.type;
    const today = local(nowFn()).date;
    let text = null;
    if (type === "daily") text = dailyText(today);
    else if (type === "weekly") { const w = prevWeek(today); text = periodText("Haftalik davomat", w.from, w.to); }
    else if (type === "monthly") { const pm = prevMonth(today); text = periodText(`Oylik davomat — ${pm.label}`, pm.from, pm.to); }
    else return res.status(400).json({ error: "bad_type" });
    if (!text) return res.json({ ok: false, message: "Hisobot uchun ma'lumot yo'q" });
    const ok = await send(text, type === "daily" ? "daily" : "reports");
    res.json({ ok: !!ok, text, message: ok ? "Yuborildi" : "Yuborilmadi — Sozlamalarda bot token, guruh chat ID yoki shaxsiy Telegram'ingizni ulang" });
  });

  // Hozir ishdami: bugun «Keldim» bor va undan keyin «Ketdim» yo'q
  function onShift(empId, t = nowFn()) {
    const { date } = local(t);
    const rec = readMonth(date)?.[empId]?.[date];
    if (!rec?.in || Date.parse(rec.in) > t.getTime() + 60000) return false;
    return !rec.out || Date.parse(rec.out) < Date.parse(rec.in);
  }
  return { report, tick, dailyText, periodText, local, cleanupPhotos, fmtDur, onShift, office: () => config().office || null };
};
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
module.exports.fmtDur = fmtDur;
