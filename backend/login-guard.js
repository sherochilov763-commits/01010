// login-guard.js — PIN'ni taxmin qilib topishdan himoya (brute-force).
//
// Avvalgi cheklov «IP + yozilgan ism» bo'yicha edi: ism oxiriga bo'sh joy qo'shilsa ("Ali ", "Ali  "),
// hisob qaytadan boshlanardi va PIN'ni cheksiz taxmin qilish mumkin edi. Endi hisob HAQIQIY xodim
// (uning ID'si) bo'yicha yuritiladi — qanday yozilganidan qat'i nazar. Uch qatlam:
//   1) IP + xodim:       10 daqiqada 8 ta xato  — oddiy foydalanuvchi uchun (o'zi adashsa)
//   2) xodim (hamma IP): 10 daqiqada 30 ta xato — ko'p IP'dan hujumga qarshi
//   3) xodim (hamma IP): 24 soatda 100 ta xato  — 24 soatga qulf + adminga xabar
//   + IP bo'yicha umumiy: 10 daqiqada 60 ta xato (mavjud bo'lmagan ismlar bilan ham)
// Faqat XATO urinishlar sanaladi. To'g'ri PIN — shu IP+xodim hisobini tozalaydi.

const MIN = 60 * 1000;
const WINDOW = 10 * MIN;
const DAY = 24 * 60 * MIN;

function createLoginGuard({ now = () => Date.now(), limits = {}, onDailyLock = () => {} } = {}) {
  const L = { ipEmp: 8, emp: 30, empDay: 100, ip: 60, ...limits };
  const buckets = new Map(); // key -> { n, resetAt }

  function sweep() {
    if (buckets.size < 5000) return;
    const t = now();
    for (const [k, b] of buckets) if (t > b.resetAt) buckets.delete(k);
  }
  function count(key) {
    const b = buckets.get(key);
    if (!b || now() > b.resetAt) return 0;
    return b.n;
  }
  function bump(key, ttl) {
    const t = now();
    const b = buckets.get(key);
    if (!b || t > b.resetAt) { buckets.set(key, { n: 1, resetAt: t + ttl }); return 1; }
    b.n += 1;
    return b.n;
  }
  function retryAfter(key) {
    const b = buckets.get(key);
    return b ? Math.max(1, Math.ceil((b.resetAt - now()) / 1000)) : 1;
  }
  const keys = (ip, empId) => ({
    ip: `ip:${ip}`,
    ipEmp: empId ? `ipemp:${ip}:${empId}` : null,
    emp: empId ? `emp:${empId}` : null,
    empDay: empId ? `empday:${empId}` : null,
  });

  /** Urinishdan OLDIN: ruxsat bormi? { ok: true } yoki { ok: false, retryAfter, daily } */
  function check(ip, empId) {
    const k = keys(ip || "unknown", empId);
    if (k.empDay && count(k.empDay) >= L.empDay) return { ok: false, retryAfter: retryAfter(k.empDay), daily: true };
    if (k.emp && count(k.emp) >= L.emp) return { ok: false, retryAfter: retryAfter(k.emp) };
    if (k.ipEmp && count(k.ipEmp) >= L.ipEmp) return { ok: false, retryAfter: retryAfter(k.ipEmp) };
    if (count(k.ip) >= L.ip) return { ok: false, retryAfter: retryAfter(k.ip) };
    return { ok: true };
  }
  /** Noto'g'ri PIN (yoki mavjud bo'lmagan xodim) */
  function fail(ip, empId) {
    sweep();
    const k = keys(ip || "unknown", empId);
    bump(k.ip, WINDOW);
    if (!empId) return;
    bump(k.ipEmp, WINDOW);
    bump(k.emp, WINDOW);
    if (bump(k.empDay, DAY) === L.empDay) {
      try { onDailyLock(empId); } catch { /* xabar ixtiyoriy */ }
    }
  }
  /** To'g'ri PIN — shu qurilmadagi (IP) hisob tozalanadi; umumiy hisoblar o'z muddatida tugaydi */
  function success(ip, empId) {
    const k = keys(ip || "unknown", empId);
    if (k.ipEmp) buckets.delete(k.ipEmp);
  }

  return { check, fail, success, _size: () => buckets.size };
}

// Ismni solishtirish uchun bir xil ko'rinishga keltirish: bo'sh joylar va katta-kichik harf ahamiyatsiz
const normName = (s) => String(s || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

module.exports = { createLoginGuard, normName };
