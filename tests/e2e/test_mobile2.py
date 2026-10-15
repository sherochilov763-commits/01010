# Mobil 2–3-bosqich: «Bugun» bosh ekrani, chat + smeta bir ekranda, QR yorliq va ishchi skaneri (haqiqiy backend)
import asyncio, datetime, json, os, sqlite3
from common import *  # noqa: F401,F403
from qrcam import qr_y4m

IPH = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
AND = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"
PHONE = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, timezone_id="Asia/Tashkent")

def extra_state():
    now = datetime.datetime.utcnow()
    iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    ago = lambda **kw: iso(now - datetime.timedelta(**kw))
    c = sqlite3.connect(DB)
    lst = json.loads(c.execute("select value from kv_store where key='uvix:orders'").fetchone()[0])
    for o in lst:
        if o["id"] == "o5": o["date"] = (now - datetime.timedelta(days=10)).strftime("%Y-%m-%d")  # eski qarz
        if o["id"] == "o3": o["prodAt"] = ago(hours=4)  # dizaynda qolib ketgan
    c.commit(); c.close()
    dbset("uvix:orders", lst)
    dbset("uvix:telegramMessages", {
        "777001": [{"id": "m1", "tgId": 1, "text": "Assalomu alaykum, oshxona fartugi uchun shisha panel qancha turadi?", "out": False, "date": ago(hours=3)},
                   {"id": "m2", "tgId": 2, "text": "O'lchamlarini yuboring, hisoblab beraman.", "out": True, "date": ago(hours=2, minutes=50)},
                   {"id": "m3", "tgId": 3, "text": "3 metr x 60 sm. Rasmli bo'lsa yaxshi.", "out": False, "date": ago(hours=2)}],
        "777002": [{"id": "m4", "tgId": 4, "text": "Salom, peshlavha qilasizlarmi?", "out": False, "date": ago(minutes=40)}],
        "777003": [{"id": "m5", "tgId": 5, "text": "Rahmat!", "out": False, "date": ago(hours=1)}, {"id": "m6", "tgId": 6, "text": "Arzimaydi", "out": True, "date": ago(minutes=50)}],
    })
    dbset("uvix:telegramContacts", {"777001": {"name": "Malika Interior", "username": "malika_int"}, "777002": {"name": "Dilshod Karimov", "username": "dilshod"}, "777003": {"name": "Nodira", "username": ""}})

async def phone_login(pg, name, pin, sel=".uvix-bottomnav"):
    await mob_login(pg, name, pin)
    await pg.wait_for_selector(sel, timeout=15000); await pg.wait_for_timeout(1800)

async def main():
    extra_state()
    adm = admin_token()
    errs = []
    cam = OUT + "qr_o2.y4m"
    qr_y4m(B + "/?o=o2", cam)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-video-capture=" + cam])
        # ---------- 1. «Bugun» (operator, telefon) ----------
        m = await (await b.new_context(user_agent=IPH, device_scale_factor=2, **PHONE)).new_page(); m.on("pageerror", lambda e: errs.append("M:" + str(e)))
        await phone_login(m, "Aziza", "1234")
        await m.wait_for_selector("[data-attn=chats]", timeout=10000)
        ok("Bugun: salomlashish va sana", "Aziza" in await m.locator("[data-testid=today-greet]").inner_text())
        ok("Bugun: pastki menyuda «Bugun»", (await m.locator(".uvix-bottomnav [data-tab=dashboard]").inner_text()).strip() == "Bugun")
        ok("Bugun: 3 ta raqamli karta (tushum, qarz, buyurtmalar)", await m.locator("[data-testid=today-cards] [data-card]").count() == 3)
        keys = await m.evaluate("[...document.querySelectorAll('[data-attn]')].map(e=>e.dataset.attn)")
        ok("Diqqat: chatlar, tayyor, eski qarz, dizayn, vazifasiz", keys == ["chats", "ready", "debt", "design", "queue"], keys)
        t = await m.locator("[data-attn=chats]").inner_text()
        ok("javobsiz chatlar: 2 ta, eng uzoq kutgani birinchi (javob berilgani yo'q)", "2 ta chat javobsiz" in t and t.index("Malika") < t.index("Dilshod") and "Nodira" not in t, t)
        ok("eski qarz summasi", "2 000 000" in await m.locator("[data-attn=debt]").inner_text())
        ok("dizaynda 4 soatdan beri — dizayner ismi bilan", "4 soat" in (txt := await m.locator("[data-attn=design]").inner_text()) and "Kamola" in txt, txt)
        ok("to'liq hisobot yashirin (telefon)", await m.locator("text=Buyurtmalar summasi").count() == 0)
        ok("tezkor amallar: Buyurtma, To'lov, Rasxod, Skaner", await m.evaluate("[...document.querySelectorAll('[data-quick]')].map(e=>e.dataset.quick).join()") == "order,pay,expense,scan")
        await m.screenshot(path=OUT + "m2_today.png")
        await m.locator("[data-attn=ready]").click(); await m.wait_for_timeout(1200)
        ok("«Topshirish» → shu buyurtmaning pastki varag'i", await m.locator("[data-testid=order-sheet]").count() == 1 and "UV-261013-004" in await m.locator("[data-testid=order-sheet]").inner_text())
        await m.locator("[data-testid=order-sheet] [aria-label='Panelni yopish']").click(); await m.wait_for_timeout(500)
        await m.locator(".uvix-bottomnav [data-tab=dashboard]").click(); await m.wait_for_timeout(1000)
        await m.locator("[data-attn=debt]").click(); await m.wait_for_timeout(1200)
        rows = await m.evaluate("[...document.querySelectorAll('[data-order-row]')].map(e=>e.dataset.orderRow)")
        ok("«Ko'rish» → qarzdor buyurtmalar filtri", len(rows) > 0 and "UV-261005-001" not in rows, rows)
        await m.locator(".uvix-bottomnav [data-tab=dashboard]").click(); await m.wait_for_timeout(1000)
        await m.locator("[data-testid=today-report]").click(); await m.wait_for_timeout(1200)
        ok("«Batafsil hisobot» → to'liq Dashboard", await m.locator("text=Buyurtmalar summasi").count() >= 1)
        await m.locator("[data-testid=today-report]").click(); await m.wait_for_timeout(500)
        # ---------- 2. Chat + smeta ----------
        await m.locator("[data-attn=chats]").click(); await m.wait_for_timeout(1500)
        await m.locator("text=Malika Interior").first.click(); await m.wait_for_timeout(1500)
        chips = await m.evaluate("[...document.querySelectorAll('[data-testid=quick-replies] [data-chip]')].map(e=>e.dataset.chip)")
        ok("tezkor javob tugmalari klaviatura ustida", len(chips) >= 3 and "narx" in chips, chips)
        await m.locator("[data-chip=narx]").click(); await m.wait_for_timeout(300)
        ok("tugma → tayyor matn maydonga tushdi", "UV bosma narxi" in await m.locator("[data-testid=composer-input]").input_value())
        ok("matn yozilganda tugmalar yashirinadi", await m.locator("[data-testid=quick-replies]").count() == 0)
        await m.locator("[data-testid=composer-input]").fill(""); await m.wait_for_timeout(200)
        await m.locator("[data-testid=chat-quote-btn]").click(); await m.wait_for_timeout(1000)
        sheet = m.locator("[data-testid=quote-sheet]")
        ok("smeta chat ostidagi varaqda", await sheet.count() == 1 and await sheet.locator("[data-testid=chat-quote]").count() == 1)
        sb = await sheet.bounding_box(); last = await m.locator("#uc-msg-3").bounding_box()
        ok("mijozning oxirgi xabari smeta ustida ko'rinib turadi", last and last["y"] + last["height"] <= sb["y"] and last["y"] > 0, (last, sb))
        await m.screenshot(path=OUT + "m2_chat_quote.png")
        await m.locator("[data-testid=quote-sheet-size]").click(); await m.wait_for_timeout(400)
        ok("varaqni kattalashtirish", await sheet.get_attribute("data-size") == "full")
        await m.locator("[data-testid=quote-sheet-close]").click(); await m.wait_for_timeout(400)
        ok("yopilgach — yozish maydoni qaytdi", await m.locator("[data-testid=composer-input]").count() == 1 and await m.locator("[data-testid=quote-sheet]").count() == 0)
        await m.locator("[data-testid=chat-quote-btn]").click(); await m.wait_for_timeout(500)
        await m.go_back(); await m.wait_for_timeout(600)
        ok("telefonning «orqaga»si avval smetani yopadi", await m.locator("[data-testid=quote-sheet]").count() == 0 and await m.locator("[data-testid=composer-input]").count() == 1)
        await m.locator("[aria-label=\"Mijoz ma'lumotlari\"]").click(); await m.wait_for_timeout(600)
        await m.locator("[data-testid=info-open-quote]").click(); await m.wait_for_timeout(900)
        ok("mijoz ma'lumotidan «Smeta» — chat yonida ochiladi", await m.locator("[data-testid=quote-sheet]").count() == 1)
        # ---------- 3. Kompyuter: o'zgarmagan + QR yorliq ----------
        d = await (await b.new_context(viewport={"width": 1280, "height": 860}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await d.add_init_script("window.__uvixPrintHook = (h) => { window.__printed = h; };")
        await dlogin(d, "Administrator", "0000")
        ok("kompyuterda — odatiy Dashboard («Bugun» yo'q)", await d.locator("[data-testid=today]").count() == 0 and await d.locator("text=Buyurtmalar summasi").count() >= 1)
        await nav(d, "Buyurtmalar")
        await d.locator("tr.uvix-row", has_text="UV-261013-003").click(); await d.wait_for_timeout(700)
        await d.locator("[data-testid=order-label]").click(); await d.wait_for_selector("[data-testid=label-preview] svg", timeout=8000)
        prev = await d.locator("[data-testid=label-preview]").inner_text()
        ok("yorliq: raqam, ish, mijoz — summasiz", "UV-261013-003" in prev and "LED peshlavha" in prev and "Malika Interior" in prev and "228" not in prev, prev)
        await d.locator("[data-size='100x70']").click(); await d.locator("[data-testid=label-copies]").fill("2")
        await d.locator("[data-testid=label-print]").click(); await d.wait_for_timeout(300)
        html = await d.evaluate("window.__printed || ''")
        ok("chop etish: 100×70 mm sahifa, 2 nusxa", "size: 100mm 70mm" in html and html.count('data-label="UV-261013-003"') == 2, html[:200])
        await d.screenshot(path=OUT + "m2_label.png")
        await close_modal(d)
        # QR — haqiqiy kamera oqimi orqali (yorliqdagi havola bilan bir xil)
        mq = await (await b.new_context(user_agent=AND, permissions=["camera"], **PHONE)).new_page(); mq.on("pageerror", lambda e: errs.append("Q:" + str(e)))
        await phone_login(mq, "Aziza", "1234")
        await mq.locator("[data-quick=scan]").click()
        await mq.wait_for_selector("[data-testid=order-sheet]", timeout=10000)
        ok("xodim: QR skanerlandi → buyurtma varag'i ochildi", "UV-261013-003" in await mq.locator("[data-testid=order-sheet]").inner_text())
        # Telefon kamerasi havolasi (?o=) — kirishdan keyin ham ochiladi
        mo = await (await b.new_context(user_agent=IPH, **PHONE)).new_page(); mo.on("pageerror", lambda e: errs.append("O:" + str(e)))
        await mo.goto(B + "/?o=o2"); await mo.wait_for_timeout(500)
        ok("?o= havolasi manzil satridan olib tashlandi", "?o=" not in mo.url)
        await phone_login(mo, "Aziza", "1234", "[data-testid=order-sheet]")
        ok("havola bilan ochilganda — kirishdan keyin buyurtma varag'i", "UV-261013-003" in await mo.locator("[data-testid=order-sheet]").inner_text())
        # ---------- 4. Ishchi (pechatchi): skaner → Boshlash → Tayyor ----------
        w = await (await b.new_context(user_agent=AND, permissions=["camera"], device_scale_factor=2, **PHONE)).new_page(); w.on("pageerror", lambda e: errs.append("W:" + str(e)))
        await phone_login(w, "Jasur", "2222", ".uvix-worker-nav")
        ok("ishchi: pastki menyu Vazifalar · Skaner · Profil", await w.evaluate("[...document.querySelectorAll('.uvix-worker-nav [data-wtab]')].map(e=>e.dataset.wtab).join()") == "tasks,scan,profile")
        await w.locator("[data-wtab=scan]").click()
        await w.wait_for_selector("[data-testid=scan-task]", timeout=10000); await w.wait_for_timeout(500)
        ok("skanerlandi → o'z vazifasi: raqam va holat", (await w.locator("[data-testid=scan-no]").inner_text()).startswith("UV-261013-003") and "Navbatda" in await w.locator("[data-testid=scan-status]").inner_text())
        await w.screenshot(path=OUT + "m2_worker_scan.png")
        await w.locator("[data-testid=scan-start]").click(); await w.wait_for_timeout(1200)
        o2 = order(adm, "UV-261013-003")
        ok("«Boshlash» → serverda jarayonda", o2["print"]["status"] == "in_progress", o2.get("print"))
        await w.locator("[data-testid=scan-done]").click(); await w.wait_for_timeout(500)
        ok("«Tayyor» birinchi bosishda — faqat tasdiq so'raydi", order(adm, "UV-261013-003")["print"]["status"] == "in_progress" and "Tasdiqlang" in await w.locator("[data-testid=scan-done]").inner_text())
        await w.locator("[data-testid=scan-done]").click(); await w.wait_for_timeout(1300)
        o2 = order(adm, "UV-261013-003")
        ok("ikkinchi bosish → vazifa tugadi, buyurtma «Tayyor»", o2["print"]["status"] == "done" and o2["prodStage"] == "ready", (o2.get("print"), o2.get("prodStage")))
        ok("xabar: «Tayyor — buyurtma yakunlandi»", "yakunlandi" in await w.locator("[data-testid=scan-msg]").inner_text())
        await w.locator("[data-testid=scan-task] [aria-label=Yopish]").click(); await w.wait_for_timeout(300)
        await w.evaluate("window.dispatchEvent(new CustomEvent('uvix:order-scan', { detail: { id: 'o3' } }))"); await w.wait_for_timeout(1500)
        ok("boshqa xodimning ishi — «sizga vazifa yo'q»", await w.locator("[data-testid=scan-none]").count() == 1)
        r = api("/api/tasks/o:o3/design/status", {"status": "done"}, api("/api/auth/login", {"employeeId": "jasur", "pin": "2222"})["token"])
        ok("server: boshqaning vazifasini o'zgartirib bo'lmaydi", r.get("_code") == 403, r)
        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
