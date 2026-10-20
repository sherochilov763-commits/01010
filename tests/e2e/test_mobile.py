# Mobil 1-bosqich: ixcham qator + surish, pastki varaq, rolga mos menyu va «Yana» plitkalari (haqiqiy backend)
import asyncio, json, time, datetime
from common import *  # noqa: F401,F403

async def mob_login(pg, name, pin):
    await pg.goto(B); await pg.evaluate(LIST_DEFAULT); await pg.wait_for_selector(".ul-person, .ul-pad", timeout=15000)
    if await pg.locator(".ul-person").count(): await pg.locator(".ul-person", has_text=name).click()
    for d in pin: await pg.locator(f".ul-key[aria-label='{d}']").click()
    await pg.locator(".ul-primary", has_text="Kirish").click()
    await pg.wait_for_selector(".uvix-bottomnav", timeout=15000); await pg.wait_for_timeout(1500)

async def tabs(pg):
    return await pg.evaluate("[...document.querySelectorAll('.uvix-bottomnav [data-tab]')].map(b=>b.dataset.tab)")

async def drag(pg, sel, dx, dy=0, steps=8, hold=0):
    box = await pg.locator(sel).first.bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + min(box["height"] / 2, 40)
    await pg.mouse.move(x, y); await pg.mouse.down()
    if hold: await pg.wait_for_timeout(hold)
    for i in range(1, steps + 1):
        await pg.mouse.move(x + dx * i / steps, y + dy * i / steps); await pg.wait_for_timeout(16)
    await pg.mouse.up(); await pg.wait_for_timeout(350)

async def touch_swipe(pg, cdp, sel, dx):
    box = await pg.locator(sel).first.bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + 30
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    for i in range(1, 11):
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + dx * i / 10, "y": y + i * 0.4}]}); await pg.wait_for_timeout(16)
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); await pg.wait_for_timeout(400)


async def go(pg, tab):
    await pg.locator(f".uvix-bottomnav [data-tab={tab}]").click(); await pg.wait_for_timeout(900)

async def main():
    errs = []
    aid = [e for e in api("/api/auth/employees")["employees"] if e["role"] == "admin"][0]["id"]
    adm = api("/api/auth/login", {"employeeId": aid, "pin": "0000"})["token"]
    az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
    api("/api/me/nav", {"prefs": None}, az, "PUT"); api("/api/me/nav", {"prefs": None}, adm, "PUT")
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, timezone_id="Asia/Tashkent")
        m = await ctx.new_page(); m.on("pageerror", lambda e: errs.append("M:" + str(e)))
        cdp = await ctx.new_cdp_session(m)
        await mob_login(m, "Aziza", "1234")
        # ---- 02 rolga mos menyu
        t = await tabs(m)
        ok("operator paneli: Asosiy · Chatlar · + · Buyurtma · CRM · Yana", t == ["dashboard", "chats", "orders", "crm", "__more"], t)
        ok("chat raqami = 2", (await m.locator("[data-testid=tab-badge-chats]").inner_text()).strip() == "2")
        await m.screenshot(path=S + "s1_dash_operator.png")

        # ---- 03 buyurtmalar: ixcham qator
        await go(m, "orders")
        rows = m.locator(".uvix-swipe")
        ok("6 ta ixcham qator", await rows.count() == 6, await rows.count())
        ok("qatordan mayda ikonkalar olindi", await m.locator(".uvix-swipe [aria-label=\"O'chirish\"], .uvix-swipe [data-invoice]").count() == 0)
        h = (await rows.first.bounding_box())["height"]
        ok("qator balandligi ≤ 90px", h <= 90, h)
        first = await rows.first.inner_text()
        ok("qatorda summa + qarz", "171 000" in first and "qarz" in first, first)
        await m.screenshot(path=S + "s2_orders.png")

        # o'ngga surish → To'lov
        R2 = "[data-order-row='UV-261013-003'] .uvix-swipe-fg"
        await drag(m, R2, 140)
        ok("o'ngga surish → «To'lov» ochildi", await m.locator("[data-order-row='UV-261013-003']").get_attribute("data-open") == "left")
        await m.screenshot(path=S + "s3_swipe_pay.png")
        await m.locator("[data-testid=swipe-pay]").click(); await m.wait_for_timeout(600)
        ok("To'lov oynasi ochildi", await m.locator(".uvix-modal-backdrop").count() == 1)
        await close_modal(m)
        ok("To'lovdan keyin qator yopiq", await m.locator("[data-order-row='UV-261013-003']").get_attribute("data-open") is None)

        # chapga surish (sensorli) → Topshirildi + Telegram + Qo'ng'iroq
        R1 = "[data-order-row='UV-261013-004'] .uvix-swipe-fg"
        await touch_swipe(m, cdp, R1, -230)
        ok("sensorli chapga surish → amallar", await m.locator("[data-order-row='UV-261013-004']").get_attribute("data-open") == "right")
        ok("tayyor buyurtmada «Topshirildi» + Telegram + Qo'ng'iroq", await m.locator("[data-order-row='UV-261013-004'] [data-testid=m-deliver]").count() == 1 and await m.locator("[data-order-row='UV-261013-004'] [data-testid=swipe-tg]").count() == 1 and await m.locator("[data-order-row='UV-261013-004'] [data-testid=swipe-call]").get_attribute("href") == "tel:+998907778899")
        await m.screenshot(path=S + "s4_swipe_actions.png")
        # boshqa qatorni surish → avvalgisi yopiladi
        await drag(m, R2, 140)
        o1 = await m.locator("[data-order-row='UV-261013-004']").get_attribute("data-open"); o2 = await m.locator("[data-order-row='UV-261013-003']").get_attribute("data-open")
        ok("bir vaqtda bitta qator ochiq", o1 is None and o2 == "left", (o1, o2))
        # ochiq turganda boshqa qatorni bosish — faqat yopadi
        await m.locator("[data-order-row='UV-261009-001'] .uvix-swipe-fg").click(); await m.wait_for_timeout(400)
        ok("bosish avval ochiq qatorni yopadi", await m.locator("[data-order-row='UV-261013-003']").get_attribute("data-open") is None and await m.locator("[data-testid=order-sheet]").count() == 0)
        # mijozda telefon/Telegram yo'q — chapga surilmaydi
        await drag(m, "[data-order-row='UV-261005-001'] .uvix-swipe-fg", -200)
        ok("aloqa yo'q mijoz — chapga surilsa faqat «Qadash»", await m.locator("[data-order-row='UV-261005-001'] [data-testid=swipe-tg]").count() == 0 and await m.locator("[data-order-row='UV-261005-001'] [data-testid=swipe-call]").count() == 0 and await m.locator("[data-order-row='UV-261005-001'] [data-testid=swipe-pin]").count() == 1)
        await m.locator("[data-order-row='UV-261005-001'] [data-testid=swipe-pin]").click(); await m.wait_for_timeout(700)
        first = await m.evaluate("document.querySelector('[data-order-row]').dataset.orderRow")
        ok("«Qadash» → buyurtma ro'yxat boshida", first == "UV-261005-001", first)
        await m.locator("[data-order-row='UV-261005-001']").first.wait_for()
        await drag(m, "[data-order-row='UV-261005-001'] .uvix-swipe-fg", -200)
        await m.locator("[data-order-row='UV-261005-001'] [data-testid=swipe-pin]").click(); await m.wait_for_timeout(700)
        # Topshirildi
        await touch_swipe(m, cdp, R1, -230)
        await m.locator("[data-order-row='UV-261013-004'] [data-testid=m-deliver]").click(); await m.wait_for_timeout(1200)
        st = await m.locator("[data-order-row='UV-261013-004'] [data-stage]").get_attribute("data-stage")
        ok("surib «Topshirildi» → holat delivered", st == "delivered", st)
        # vertikal aylantirish qatorni ochmaydi
        await drag(m, "[data-order-row='UV-261012-001'] .uvix-swipe-fg", 6, -120)
        ok("vertikal harakat surishni boshlamaydi", await m.locator("[data-order-row='UV-261012-001']").get_attribute("data-open") is None)

        # ---- 04 pastki varaq
        await m.evaluate("window.scrollTo(0,0)"); await m.wait_for_timeout(200)
        await m.locator(R2).click(); await m.wait_for_timeout(700)
        sh = m.locator("[data-testid=order-sheet]")
        ok("qator bosilganda pastki varaq ochildi", await sh.count() == 1)
        txt = await sh.inner_text()
        ok("varaqda summa/to'langan/qarz", "228 000" in txt and "119 091" in txt and "108 909" in txt, txt[:300])
        ok("varaqda telefon", "+998 90 777 88 99" in txt)
        stp = await m.evaluate("[...document.querySelectorAll('[data-testid=prod-steps] [data-step]')].map(x=>x.dataset.step+':'+x.dataset.state)")
        ok("bosqichlar: dizayn ✓, pechat — hozir", stp == ["design:done", "printing:now", "ready:todo", "delivered:todo"], stp)
        ok("pechat bosqichida ijrochi", "Jasur" in txt)
        ok("ishlab chiqarish boshqaruvi saqlangan", await sh.locator("[data-testid=order-stage-select]").count() == 1 and await sh.locator("[data-testid=order-assign-print]").count() == 1)
        bb = await sh.bounding_box()
        ok("varaq pastga yopishgan", abs(bb["y"] + bb["height"] - 844) < 2, bb)
        await m.screenshot(path=S + "s5_sheet.png")
        await m.locator("[data-testid=sheet-more]").click(); await m.wait_for_timeout(300)
        items = await m.evaluate("[...document.querySelectorAll('[data-testid=sheet-menu] [role=menuitem]')].map(x=>x.dataset.testid)")
        ok("«⋯»: faktura, tahrirlash, QR yorliq, qo'ng'iroq, o'chirish", items == ["sheet-invoice", "sheet-edit", "sheet-label", "sheet-call", "sheet-delete"], items)
        await m.screenshot(path=S + "s6_sheet_menu.png")
        await m.locator("[data-testid=sheet-invoice]").click(); await m.wait_for_timeout(800)
        ok("Faktura oynasi varaq ustida", await m.locator(".uvix-modal-backdrop").count() >= 1)
        await close_modal(m)
        ok("faktura yopilgach varaq turibdi", await sh.count() == 1)
        await m.locator("[data-testid=sheet-pay]").click(); await m.wait_for_timeout(600)
        ok("«To'lov qabul qilish» → To'lov oynasi", await m.locator(".uvix-modal-backdrop").count() == 1)
        await close_modal(m)
        # bosqichni varaqdan o'zgartirish
        await sh.locator("[data-testid=order-stage-select]").select_option("ready"); await m.wait_for_timeout(1200)
        stp = await m.evaluate("[...document.querySelectorAll('[data-testid=prod-steps] [data-step]')].map(x=>x.dataset.state)")
        ok("varaqdan holat → Tayyor", stp == ["done", "done", "now", "todo"], stp)
        # tutqichdan pastga tortib yopish
        await drag(m, "[data-testid=sheet-handle]", 0, 260)
        await m.wait_for_timeout(400)
        ok("pastga tortib yopildi", await m.locator("[data-testid=order-sheet]").count() == 0)
        # «orqaga» bilan yopish
        await m.locator(R2).click(); await m.wait_for_timeout(600)
        await m.go_back(); await m.wait_for_timeout(600)
        ok("«orqaga» varaqni yopadi, bo'lim o'zgarmaydi", await m.locator("[data-testid=order-sheet]").count() == 0 and await m.locator(".uvix-swipe").count() == 6)
        # kichik siljish yopmaydi
        await m.locator(R2).click(); await m.wait_for_timeout(600)
        await drag(m, "[data-testid=sheet-handle]", 0, 50, steps=10)
        await m.wait_for_timeout(300)
        ok("kichik tortish — varaq joyiga qaytadi", await m.locator("[data-testid=order-sheet]").count() == 1)
        # fonni bosib yopish
        await m.mouse.click(195, 30); await m.wait_for_timeout(500)
        ok("fonni bosib yopildi", await m.locator("[data-testid=order-sheet]").count() == 0)
        # Telegram tugmasi → Chatlar
        await m.locator(R2).click(); await m.wait_for_timeout(600)
        await m.locator("[data-testid=sheet-tg]").click(); await m.wait_for_timeout(1200)
        ok("Telegram → Chatlar bo'limi", await m.locator(".uvix-bottomnav [data-tab=chats][aria-current=page]").count() == 1)
        ok("Chatlar ochilgach raqam yo'qoldi", await m.locator("[data-testid=tab-badge-chats]").count() == 0)
        ok("mijoz suhbati ochildi", await m.locator("[data-testid=composer-input]").count() == 1)
        await m.screenshot(path=S + "s6b_chat.png")
        await m.go_back(); await m.wait_for_timeout(700)
        await go(m, "orders")
        # Mijoz bo'yicha → varaq
        await m.locator("[data-view=customers]").click(); await m.wait_for_timeout(400)
        await m.locator("[data-customer='Malika Interior']").click(); await m.wait_for_timeout(300)
        await m.locator("[data-order-row='UV-261013-002']").click(); await m.wait_for_timeout(600)
        ok("«Mijoz bo'yicha»dan ham varaq ochiladi", await m.locator("[data-testid=order-sheet]").count() == 1)
        await m.keyboard.press("Escape"); await m.wait_for_timeout(400)
        await m.locator("[data-view=list]").click(); await m.wait_for_timeout(300)
        # filtrlar yopishib turadi
        await m.set_viewport_size({"width": 390, "height": 520}); await m.wait_for_timeout(300)
        await m.evaluate("window.scrollTo(0, 400)"); await m.wait_for_timeout(300)
        fb = await m.locator("[data-testid=m-filters]").bounding_box()
        ok("filtrlar tepada yopishib turadi", fb and abs(fb["y"]) < 2, fb)
        ok("gorizontal siljish yo'q", await m.evaluate("document.documentElement.scrollWidth <= 390"))
        await m.screenshot(path=S + "s6c_sticky.png")
        await m.set_viewport_size({"width": 390, "height": 844})
        await m.evaluate("window.scrollTo(0, 0)")

        # ---- 02 «Yana» plitkalari
        await m.locator(".uvix-bottomnav [data-tab=__more]").click(); await m.wait_for_timeout(500)
        ms = m.locator("[data-testid=more-sheet]")
        ok("«Yana» → plitkalar varag'i", await ms.count() == 1)
        tiles = await m.evaluate("[...document.querySelectorAll('[data-tile]')].map(x=>x.dataset.tile)")
        ok("operatorga admin bo'limlari ko'rinmaydi", "report" not in tiles and "employees" not in tiles and "orders" in tiles and len(tiles) >= 9, tiles)
        pinned = await m.evaluate("[...document.querySelectorAll('[data-tile][data-pinned]')].map(x=>x.dataset.tile)")
        ok("pastki menyudagilar belgilangan", sorted(pinned) == sorted(["dashboard", "chats", "orders", "crm"]), pinned)
        ok("Mijozlar plitkasida qarzdorlar soni", await m.locator("[data-testid=tile-badge-customers]").count() == 1)
        await m.screenshot(path=S + "s7_more.png")
        await m.locator("[data-testid=more-search]").fill("pul"); await m.wait_for_timeout(200)
        tiles = await m.evaluate("[...document.querySelectorAll('[data-tile]')].map(x=>x.dataset.tile)")
        ok("qidiruv «pul» → Rasxod, Operatsiyalar", set(tiles) >= {"expense", "operations"} and "orders" not in tiles, tiles)
        await m.locator("[data-testid=more-search]").fill(""); await m.wait_for_timeout(200)
        # ushlab turish → pastki menyuga qo'shish
        box = await m.locator("[data-tile=customers]").bounding_box()
        await m.mouse.move(box["x"] + box["width"] / 2, box["y"] + 20); await m.mouse.down(); await m.wait_for_timeout(650); await m.mouse.up(); await m.wait_for_timeout(500)
        ok("ushlab turish varaqni yopmaydi", await ms.count() == 1)
        hint = await m.locator("[data-testid=more-hint]").inner_text()
        ok("xabar: qo'shildi", "qo'shildi" in hint, hint)
        t = await tabs(m)
        ok("pastki menyu: eng eskisi o'rniga Mijozlar", t == ["chats", "orders", "crm", "customers", "__more"], t)
        await m.wait_for_timeout(700)
        nv = api("/api/me/nav", token=az)["prefs"]
        ok("serverda saqlandi (barSet)", nv and nv.get("barSet") is True and nv["mobileBar"] == ["chats", "orders", "crm", "customers"], nv)
        await m.screenshot(path=S + "s8_more_pinned.png")
        # yana ushlab turish → olib tashlash
        await m.mouse.move(box["x"] + box["width"] / 2, box["y"] + 20); await m.mouse.down(); await m.wait_for_timeout(650); await m.mouse.up(); await m.wait_for_timeout(400)
        t = await tabs(m)
        ok("ushlab turish → olib tashlandi", t == ["chats", "orders", "crm", "__more"], t)
        # plitkani bosish → bo'lim
        await m.locator("[data-tile=attendance]").click(); await m.wait_for_timeout(900)
        ok("plitka → Davomat, varaq yopildi", await ms.count() == 0 and await m.locator(".uvix-bottomnav [data-tab=__more][aria-current=page]").count() == 1)
        # Escape va «orqaga»
        await m.locator(".uvix-bottomnav [data-tab=__more]").click(); await m.wait_for_timeout(400)
        await m.keyboard.press("Escape"); await m.wait_for_timeout(400)
        ok("Escape yopadi", await ms.count() == 0)
        await m.locator(".uvix-bottomnav [data-tab=__more]").click(); await m.wait_for_timeout(400)
        await m.go_back(); await m.wait_for_timeout(500)
        ok("«orqaga» yopadi", await ms.count() == 0)
        # tutqichdan tortib yopish
        await m.locator(".uvix-bottomnav [data-tab=__more]").click(); await m.wait_for_timeout(400)
        hb = await ms.bounding_box()
        await m.mouse.move(195, hb["y"] + 10); await m.mouse.down()
        for i in range(1, 9): await m.mouse.move(195, hb["y"] + 10 + i * 30); await m.wait_for_timeout(16)
        await m.mouse.up(); await m.wait_for_timeout(500)
        ok("tutqichdan tortib yopildi", await ms.count() == 0)
        # Menyuni sozlash → yon panel tahrirlash rejimida
        await m.locator(".uvix-bottomnav [data-tab=__more]").click(); await m.wait_for_timeout(400)
        await m.locator("[data-testid=more-edit-menu]").click(); await m.wait_for_timeout(900)
        ok("«Menyuni sozlash» → tahrirlovchi ochiq", await m.locator(".uvix-sidebar-open .uvix-naveditor").count() == 1)
        await m.screenshot(path=S + "s9_editor.png")
        # Standartga qaytarish → rol standarti
        await m.locator(".uvix-sidebar-open .uvix-naveditor button", has_text="Standart").click(); await m.wait_for_timeout(700)
        t = await tabs(m)
        ok("Standart → operator paneli qaytdi", t == ["dashboard", "chats", "orders", "crm", "__more"], t)

        # ---- Admin telefonda
        c2 = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, timezone_id="Asia/Tashkent")
        a = await c2.new_page(); a.on("pageerror", lambda e: errs.append("A:" + str(e)))
        await mob_login(a, "Administrator", "0000")
        t = await tabs(a)
        ok("admin paneli (iOS): Bugun · Buyurtma · CRM · Operatsiya · Yana", t == ["dashboard", "orders", "crm", "operations", "__more"], t)
        ok("o'rtadagi «+» yo'q — 5 ta teng tab", await a.locator(".uvix-bottomnav button").count() == 5)
        ws = await a.evaluate("[...document.querySelectorAll('.uvix-bottomnav .uvix-tab')].map(e=>Math.round(e.getBoundingClientRect().width))")
        ok("tablar kengligi teng", max(ws) - min(ws) <= 1, ws)
        # Operatsiyalar (telefon): katta forma o'rniga qidiruv + filtr varag'i, kunlar bo'yicha
        await a.locator(".uvix-bottomnav [data-tab=operations]").click(); await a.wait_for_timeout(900)
        ok("Operatsiyalar telefonda: ixcham ko'rinish", await a.locator("[data-testid=ops-phone]").count() == 1 and await a.locator("[data-opday]").count() >= 1)
        await a.locator("[data-type=kirim]").click(); await a.wait_for_timeout(300)
        ok("«Kirim» — faqat kirimlar", await a.locator("[data-op^=exp-]").count() == 0 and await a.locator("[data-op^=pay-]").count() >= 1)
        await a.locator("[data-type=all]").click()
        await a.locator("[data-testid=ops-filter-btn]").click(); await a.wait_for_timeout(400)
        await a.locator("[data-per=today]").click(); await a.wait_for_timeout(300)
        btxt = await a.locator("[data-testid=ops-filter-apply]").inner_text()
        await a.screenshot(path=S + "s10b_ops_filter.png")
        await a.locator("[data-testid=ops-filter-apply]").click(); await a.wait_for_timeout(400)
        ok("filtr: «Bugun» → natija soni tugmada, nuqta yoqildi", "natijani" in btxt and await a.locator("[data-testid=ops-filter-btn] i").count() == 1, btxt)
        ok("gorizontal siljish yo'q (operatsiyalar)", await a.evaluate("document.documentElement.scrollWidth <= 390"))
        # «Yana» ichidagi bo'lim — «‹ Yana» orqaga
        await a.locator(".uvix-bottomnav [data-tab=__more]").click(); await a.wait_for_timeout(400)
        await a.locator("[data-tile=kassa]").click(); await a.wait_for_timeout(900)
        ok("ichki sahifa: «‹ Yana» tugmasi", await a.locator("[data-testid=ios-back]").is_visible() and "Yana" in await a.locator("[data-testid=ios-back]").inner_text())
        await a.locator("[data-testid=ios-back]").click(); await a.wait_for_timeout(500)
        ok("«‹ Yana» → «Yana» varag'i ochiladi", await a.locator("[data-testid=more-sheet]").count() == 1)
        await a.keyboard.press("Escape"); await a.wait_for_timeout(300)
        ok("admin: Chatlar panelda yo'q → «Yana» ustida raqam", await a.locator("[data-testid=tab-badge-__more]").count() == 1)
        # eski saqlangan standart (qo'lda tanlanmagan) → rol standarti
        api("/api/me/nav", {"prefs": {"layout": "side", "order": [], "hidden": [], "mobileBar": ["dashboard", "orders", "expense", "crm"]}}, adm, "PUT")
        await a.reload(); await a.wait_for_timeout(500)
        if await a.locator(".ul-person, .ul-pad").count(): await mob_login(a, "Administrator", "0000")
        t = await tabs(a)
        ok("eski standart saqlangan admin → rol standarti", t == ["dashboard", "orders", "crm", "operations", "__more"], t)
        # qo'lda tanlangan panel saqlanadi
        api("/api/me/nav", {"prefs": {"layout": "side", "order": [], "hidden": [], "mobileBar": ["orders", "expense"], "barSet": True}}, adm, "PUT")
        await a.reload(); await a.wait_for_timeout(500)
        if await a.locator(".ul-person, .ul-pad").count(): await mob_login(a, "Administrator", "0000")
        t = await tabs(a)
        ok("qo'lda tanlangan panel o'zgarmaydi", t == ["orders", "expense", "__more"], t)
        await a.locator(".uvix-bottomnav [data-tab=__more]").click(); await a.wait_for_timeout(400)
        tiles = await a.evaluate("[...document.querySelectorAll('[data-tile]')].map(x=>x.dataset.tile)")
        ok("admin plitkalarida Hisobot va Xodimlar", "report" in tiles and "employees" in tiles, tiles)
        await a.screenshot(path=S + "s10_admin_more.png")
        api("/api/me/nav", {"prefs": None}, adm, "PUT")
        # «Hamma uchun» standart (admin) — operatorga qo'llanadi
        stv = json.loads(api("/api/kv/uvix:settings", token=adm)["value"])
        stv["navDefaults"] = {"layout": "side", "order": [], "hidden": [], "mobileBar": ["orders", "customers", "chats", "crm"], "barSet": True}
        api("/api/kv/uvix:settings", {"value": json.dumps(stv)}, adm, "PUT")
        await m.reload(); await m.wait_for_timeout(500)
        if await m.locator(".ul-person, .ul-pad").count(): await mob_login(m, "Aziza", "1234")
        t = await tabs(m)
        ok("admin «Hamma uchun» tanlagan panel operatorga", t == ["orders", "customers", "chats", "crm", "__more"], t)
        stv.pop("navDefaults"); api("/api/kv/uvix:settings", {"value": json.dumps(stv)}, adm, "PUT")
        await b.close()
    ok("JS xatolari yo'q", not errs, errs)
if __name__ == "__main__":
    asyncio.run(main())
    finish()
