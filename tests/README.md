# Testlar

Har bir yangilanishda GitHub o'zi ishga tushiradi (`.github/workflows/tests.yml`). Railway'da **Wait for CI**
yoqilgan bo'lsa, birorta test yiqilsa yangi versiya ishga chiqmaydi — eski versiya ishlashda davom etadi.

## Lokal ishga tushirish

```bash
npm ci --prefix backend && npm ci --prefix frontend
npm run test:unit                 # ~2 soniya
npm run build && npm run test:e2e # ~6 daqiqa, Python + Playwright kerak
```

E2E uchun bir marta: `pip install playwright==1.56.0 && python -m playwright install chromium`.
Faqat bittasini: `bash tests/e2e/run.sh test_money`.

## Nima tekshiriladi

| To'plam | Nima |
|---|---|
| `unit/themes.test.mjs` | 9 mavzu × 9 urg'u: 2 617 ta kontrast va mantiq sharti, avtomatik tun, shaxsiy/rol/kompaniya tartibi |
| `unit/money-guard.test.mjs` | Pul himoyasi: operator to'lov qo'sha oladi, o'zgartira/o'chira olmaydi; eskirgan nusxa; jurnal faqat qo'shiladi |
| `unit/nav.test.mjs` | Telefon pastki menyusi: rol standarti, qo'lda tanlangan panel |
| `unit/error-reports.test.mjs` | Bir xil xato bitta yozuv bo'lib yig'iladi |
| `e2e/test_money.py` | A1: so'rov → admin tasdig'i/rad, ilovani chetlab urinishlar rad etiladi, jurnal |
| `e2e/test_session.py` | A2: F5 dan keyin kirish saqlanadi, qulf ekrani, ochiq qurilmalar, chiqish |
| `e2e/test_errors.py` | A3: xato oynasi, xato kodi, adminga xabar, «So'nggi xatolar» |
| `e2e/test_mobile.py` | Telefon: ixcham qator + surish, pastki varaq, rolga mos menyu, «Yana» plitkalari |
| `e2e/test_themes.py` | Mavzular galereyasi, avtomatik tun, rol bo'yicha mavzu, shisha rejimi |

Har bir E2E to'plam toza bazada (vaqtinchalik papka) haqiqiy server bilan ishlaydi; ma'lumotlar `e2e/seed.py` dan.
Xato bo'lsa rasmlar va server logi `tests/e2e/out/` da (GitHub'da — «e2e-natijalar» arxivi).
