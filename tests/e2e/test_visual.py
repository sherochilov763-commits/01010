# Buyurtmani tez tanish (24-band): rasm/kichik nusxa, katta nom, joy yorlig'i, qadash, yaqinda ochilgan,
# tez ko'rish, aqlli qidiruv, Ctrl K; rasm siqish va Sozlamalar → «Xotira» (25-band)
import asyncio, io, json, random
from common import *  # noqa: F401,F403
from PIL import Image

def put_orders(lst, tok): r = api("/api/kv/uvix:orders", {"value": json.dumps(lst)}, tok, "PUT"); assert "value" in r, r
def orders_(tok): return json.loads(api("/api/kv/uvix:orders", token=tok)["value"])

async def rows(pg): return await pg.evaluate("[...document.querySelectorAll('tr[data-order]')].map(e=>e.dataset.order)")

async def main():
    adm = admin_token()
    errs = []
    lst = orders_(adm)
    for o in lst:
        if o["id"] in ("o1", "o2"): o["place"] = "Ofis · Yunusobod"
        if o["id"] == "o3": o["place"] = "Uy · Chilonzor"
    put_orders(lst, adm)
    # Katta rasm (≈3000×2000, shovqinli — yaxshi siqilmaydi)
    big = OUT + "big_photo.jpg"
    rnd = random.Random(7)
    im = Image.effect_noise((3000, 2000), 60).convert("RGB")
    im.save(big, "JPEG", quality=95)
    orig = len(open(big, "rb").read())

    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1440, "height": 950})).new_page(); d.on("pageerror", lambda e: errs.append(str(e)))
        await dlogin(d, "Administrator", "0000")
        # Buyurtmalar har safar «Mijoz bo'yicha» ochiladi
        await d.evaluate("localStorage.removeItem('uvix_orders_view_def')")
        await nav(d, "Buyurtmalar"); await d.wait_for_timeout(800)
        ok("Buyurtmalar — sukut bo'yicha «Mijoz bo'yicha»", await d.locator("[data-view=customers][aria-pressed=true]").count() == 1 and await d.locator("[data-testid=customer-groups]").count() == 1)
        await d.locator("[data-view=list]").click(); await d.wait_for_timeout(300)
        await nav(d, "Dashboard"); await nav(d, "Buyurtmalar"); await d.wait_for_timeout(600)
        ok("qayta ochilganda yana «Mijoz bo'yicha»", await d.locator("[data-view=customers][aria-pressed=true]").count() == 1)
        await d.evaluate("localStorage.setItem('uvix_orders_view_def','list')")
        await nav(d, "Dashboard"); await nav(d, "Buyurtmalar"); await d.wait_for_timeout(800)
        r = await rows(d)
        ok("ro'yxat: har qatorda rasm/material belgisi", await d.locator("tr[data-order] [data-thumb]").count() == len(r) and len(r) >= 5, r)
        t1 = await d.locator("tr[data-order='UV-261013-004'] [data-otitle]").inner_text()
        ok("nom katta (raqam emas)", t1 == "Stiker (logotip)", t1)
        ok("joy yorlig'i: Ofis · Yunusobod ×2, Uy · Chilonzor", await d.locator("tr[data-order] [data-place='Ofis · Yunusobod']").count() == 2 and await d.locator("tr[data-order] [data-place='Uy · Chilonzor']").count() == 1)
        await d.screenshot(path=OUT + "v_list.png")
        # Aqlli qidiruv
        s = d.locator("[data-testid=orders-search]")
        await s.fill("chilonzor"); await d.wait_for_timeout(300)
        ok("qidiruv: joy bo'yicha («chilonzor»)", await rows(d) == ["UV-261013-002"], await rows(d))
        await s.fill("749700"); await d.wait_for_timeout(300)
        ok("qidiruv: summa bo'yicha", await rows(d) == ["UV-261013-002"], await rows(d))
        await s.fill("oniks sardor"); await d.wait_for_timeout(300)
        ok("qidiruv: bir nechta so'z (material + mijoz)", await rows(d) == ["UV-261009-001"], await rows(d))
        await s.fill(""); await d.wait_for_timeout(300)
        # Qadash
        row5 = d.locator("tr[data-order='UV-261009-001']")
        await row5.hover(); await d.wait_for_timeout(200)
        await row5.locator("[data-pin]").click(); await d.wait_for_timeout(700)
        r = await rows(d)
        ok("📌 qadalgan — ro'yxat boshida", r[0] == "UV-261009-001", r)
        ok("qadash brauzerda saqlandi", "o5" in (await d.evaluate("localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('uvix:pins:')))") or ""))
        # Tez ko'rish
        await d.mouse.move(5, 5); await d.wait_for_timeout(300)
        await d.locator("tr[data-order='UV-261013-002'] [data-otitle]").hover(); await d.wait_for_timeout(800)
        pk = d.locator("[data-testid=order-peek]")
        ok("tez ko'rish: sichqoncha to'xtasa chiqadi", await pk.count() == 1 and "Oshxona fartugi" in await pk.inner_text() and "qarz" in await pk.inner_text())
        await d.screenshot(path=OUT + "v_peek.png")
        await d.mouse.move(5, 5); await d.wait_for_timeout(300)
        ok("tez ko'rish: chiqib ketilsa yopiladi", await pk.count() == 0)
        # Yaqinda ochilgan
        await d.locator("tr[data-order='UV-261013-003']").click(); await d.wait_for_timeout(700)
        ok("panel sarlavhasi — buyurtma nomi", (await d.locator("[data-testid=panel-title]").inner_text()) == "LED peshlavha")
        await d.locator("tr[data-order='UV-261013-003']").click(); await d.wait_for_timeout(500)
        ok("«Yaqinda ochilgan» — shu buyurtma", await d.locator("[data-testid=recent-orders] [data-recent='UV-261013-003']").count() == 1)
        # Rasm yuklash: brauzerda siqiladi + kichik nusxa
        row3 = d.locator("tr[data-order='UV-261013-002']")
        await row3.hover(); await row3.locator("[aria-label=Tahrirlash]").click(); await d.wait_for_timeout(700)
        ok("formada «Nomi» va «Joy» maydonlari", await d.locator("[data-testid=order-title]").input_value() == "Oshxona fartugi" and await d.locator("[data-testid=order-place]").input_value() == "Uy · Chilonzor")
        await d.locator(".uvix-modal-panel input[type=file]").set_input_files(big); await d.wait_for_timeout(3500)
        ok("rasm formada ko'rindi", await d.locator(".uvix-modal-panel img").count() >= 1)
        await d.locator(".uvix-modal-panel button", has_text="Saqlash").click(); await d.wait_for_timeout(1500)
        o3 = [o for o in orders_(adm) if o["id"] == "o3"][0]
        ph = (o3.get("photos") or [{}])[0]
        ok("rasm + kichik nusxa saqlandi", ph.get("url") and ph.get("thumbUrl") and ph.get("thumbFilename"), ph)
        big_sz = len(api(ph["url"], raw=True)); th_sz = len(api(ph["thumbUrl"], raw=True))
        ok(f"siqildi: {orig // 1024} KB → {big_sz // 1024} KB, kichik nusxa {th_sz // 1024} KB", big_sz < orig / 2 and th_sz < 80 * 1024, (orig, big_sz, th_sz))
        jpg = Image.open(io.BytesIO(api(ph["url"], raw=True)))
        ok("o'lcham ≤2400 px (chizma o'qiladi)", max(jpg.size) <= 2400, jpg.size)
        ok("qatorda endi haqiqiy rasm", await d.locator("tr[data-order='UV-261013-002'] [data-thumb=photo] img").count() == 1)
        await d.screenshot(path=OUT + "v_photo.png")
        # Buyurtma ichida rasm — to'liq ekranda, kattalashtirib ko'rish
        await d.locator("tr[data-order='UV-261013-002']").click(); await d.wait_for_timeout(700)
        ok("buyurtma panelida «Rasmlar va chizmalar»", await d.locator("[data-testid=order-panel] [data-testid=order-photos] [data-photo]").count() == 1)
        await d.locator("[data-testid=order-panel] [data-photo='0']").click(); await d.wait_for_timeout(700)
        pvw = d.locator("[data-testid=photo-viewer]")
        ok("rasm bosilsa — to'liq ekran", await pvw.count() == 1 and await d.locator("[data-testid=pv-img]").evaluate("i => i.naturalWidth") >= 1000)
        await d.locator("[data-testid=pv-zoom-in]").click(); await d.locator("[data-testid=pv-zoom-in]").click(); await d.wait_for_timeout(300)
        ok("kattalashtirish (+)", "%" in await d.locator("[data-testid=pv-count]").inner_text(), await d.locator("[data-testid=pv-count]").inner_text())
        await d.screenshot(path=OUT + "v_viewer.png")
        await d.keyboard.press("Escape"); await d.wait_for_timeout(400)
        ok("Escape — faqat ko'ruvchi yopildi, panel ochiq", await pvw.count() == 0 and await d.locator("[data-testid=order-panel]").count() == 1)
        await d.locator("tr[data-order='UV-261013-002']").click(); await d.wait_for_timeout(400)
        # Ctrl K — rasm bilan
        await d.keyboard.press("Control+k"); await d.wait_for_timeout(300); await d.keyboard.type("oshxona chilonzor"); await d.wait_for_timeout(400)
        ok("Ctrl K: «oshxona chilonzor» → buyurtma rasmi bilan", await d.locator("[data-cmdk-order='UV-261013-002'] [data-thumb=photo]").count() == 1)
        await d.screenshot(path=OUT + "v_cmdk.png")
        await d.keyboard.press("Enter"); await d.wait_for_timeout(900)
        ok("Enter → buyurtma ochildi", await d.locator("[data-testid=panel-title]").count() == 1 and (await d.locator("[data-testid=panel-title]").inner_text()) == "Oshxona fartugi")
        # Tahrirlash: mijozning avvalgi joylari taklif qilinadi
        await nav(d, "Buyurtmalar"); await d.wait_for_timeout(600)
        row1 = d.locator("tr[data-order='UV-261013-004']")
        await row1.hover(); await row1.locator("[aria-label=Tahrirlash]").click(); await d.wait_for_timeout(700)
        sug = await d.locator("[data-testid=order-place-suggest] [data-place]").evaluate_all("els=>els.map(e=>e.dataset.place)")
        ok("formada: mijozning joylari taklif", "Uy · Chilonzor" in sug and "Ofis · Yunusobod" in sug, sug)
        await d.locator("[data-testid=order-place-suggest] [data-place='Uy · Chilonzor']").click()
        ok("taklif bosilsa — maydonga tushdi", await d.locator("[data-testid=order-place]").input_value() == "Uy · Chilonzor")
        if await d.locator(".uvix-modal-panel").count(): await close_modal(d)
        # Xotira
        st = api("/api/system/storage?fresh=1", token=adm)
        ok("server: xotira hisobi (2 fayl — rasm va kichik nusxa)", st["files"]["orderPhotos"]["count"] == 2 and st["db"]["orders"] >= 6 and st["total"] > 0, st)
        await nav(d, "Sozlamalar"); await d.wait_for_timeout(800)
        await d.locator("text=Ma'lumotlar").first.click(); await d.wait_for_timeout(1200)
        sec = d.locator("[data-testid=storage-section]")
        ok("Sozlamalar → Ma'lumotlar → «Xotira»", await sec.count() == 1 and "Buyurtma rasmlari" in await sec.inner_text() and "2 fayl" in await sec.locator("[data-storage=photos]").inner_text())
        await sec.screenshot(path=OUT + "v_storage.png")
        # CRM: lid manbalari — ko'p ishlatilgani oldinda, qolgani yig'ilgan
        await nav(d, "CRM"); await d.wait_for_timeout(900)
        await d.locator("button", has_text="Yangi lid").first.click(); await d.wait_for_timeout(600)
        chips = d.locator("[data-testid=source-chips] [data-source]")
        ok("manba: 4 ta ko'rinadi + «+6 ta»", await chips.count() == 4 and (await d.locator("[data-testid=source-more]").inner_text()).strip() == "+6 ta", await chips.count())
        await d.locator("[data-testid=source-more]").click(); await d.wait_for_timeout(200)
        ok("«+6 ta» → hammasi (10)", await chips.count() == 10)
        await d.locator("[data-source=office]").click(); await d.locator("[data-testid=source-more]").click(); await d.wait_for_timeout(200)
        ok("yig'ilganda ham tanlangani ko'rinadi", await chips.count() == 5 and await d.locator("[data-source=office]").count() == 1)
        await d.screenshot(path=OUT + "v_sources.png")
        await b.close()
    # operatorga ruxsat yo'q
    az = [e for e in api("/api/auth/employees")["employees"] if e["name"].startswith("Aziza")][0]["id"]
    tok = api("/api/auth/login", {"employeeId": az, "pin": "1234"})["token"]
    ok("operatorga «Xotira» yopiq", api("/api/system/storage", token=tok).get("_code") == 403)
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
