# Ovozli yordamchi: mikrofon (soxta qurilma) → gap → to'ldirilgan forma. AI javobi brauzerda soxtalashtiriladi (kalit kerak emas).
import asyncio, json
from common import *  # noqa: F401,F403

# Gap → AI javobi (serverdagi /api/voice/command o'rniga)
REPLIES = {
    "malika": {"action": "payment", "data": {"customer": "Malika Interior", "amount": 50000, "paymentType": "naqd"}},
    "jahongir": {"action": "payment", "data": {"customer": "Jahongir Tursunov", "amount": 700000, "paymentType": "karta"}},
    "buyurtma": {"action": "order", "data": {"customer": "Sardor", "phone": None, "items": [
        {"title": "Banner", "material": "", "unit": "m2", "w": 2, "h": 1, "qty": 1, "price": 80000, "total": None},
        {"title": "Montaj", "material": "", "unit": "lump", "w": None, "h": None, "qty": 1, "price": None, "total": 150000}]}},
    "rasxod": {"action": "expense", "data": {"amount": 1200000, "category": "Material", "subcategory": "Plastik", "paymentType": "karta", "employee": None, "date": None, "note": "Plyonka"}},
    "vazifa": {"action": "job", "data": {"kind": "install", "title": "Viveska montaji", "customer": "Malika Interior", "date": "2026-10-23", "time": "14:00", "address": "Chilonzor 9", "phone": None, "assignees": ["Jasur"]}},
    "lid": {"action": "lead", "data": {"customer": "Dilshod", "phone": "+998901112233", "jobTitle": "Oniks devor", "estimatedValue": 5000000, "source": "Instagram", "notes": None}},
    "ovoz": {"action": "payment", "data": {"customer": "Jahongir", "amount": 100000, "paymentType": "naqd"}},
}
SEEN = []


async def fake_ai(route):
    req = route.request
    if req.url.endswith("/api/voice/status"):
        return await route.fulfill(json={"enabled": True, "ready": True, "voice": True})
    ct = req.headers.get("content-type", "")
    if "multipart" in ct:
        SEEN.append(("audio", len(req.post_data_buffer or b"")))
        text, key = "Jahongirdan 100 ming naqd oldim", "ovoz"
    else:
        text = json.loads(req.post_data or "{}").get("text", "")
        SEEN.append(("text", text))
        key = next((k for k in REPLIES if k in text.lower()), None)
    body = {"id": "x", "transcript": text, "reply": "", **(REPLIES[key] if key else {"action": "unknown", "data": {}, "reply": "Tushunmadim"})}
    await route.fulfill(json=body)


async def say(pg, text):
    if not await pg.locator("[data-testid=voice-panel]").count():
        await pg.locator("[data-testid=voice-fab]").click(); await pg.wait_for_timeout(400)
    await pg.locator("[data-testid=voice-text]").fill(text); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(1200)


async def open_text(pg):
    # Matn maydoni — «Qayta urinish» oynasida; mikrofon ruxsati yo'q holatni beramiz
    await pg.locator("[data-testid=voice-fab]").click(); await pg.wait_for_timeout(500)
    if await pg.locator("[data-testid=voice-stop]").count():
        await pg.locator("[data-testid=voice-stop]").click(); await pg.wait_for_timeout(1500)


async def input_values(pg):
    return await pg.evaluate("[...document.querySelectorAll('.uvix-modal-panel input, .uvix-modal-panel select, .uvix-modal-panel textarea, [data-testid=job-form] input')].map(i=>i.value)")


async def main():
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        # 1) operator — mikrofon ko'rinmaydi (haqiqiy server javobi)
        c0 = await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")
        op = await c0.new_page()
        await dlogin(op, "Aziza", "1234")
        ok("operator: mikrofon tugmasi yo'q", await op.locator("[data-testid=voice-fab]").count() == 0)
        await c0.close()

        # 2) rahbar — haqiqiy server: tugma bor, kalit yo'qligi tushunarli aytiladi
        ctx = await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent", permissions=["microphone"])
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        await dlogin(pg, "Administrator", "0000")
        ok("rahbar: mikrofon tugmasi bor", await pg.locator("[data-testid=voice-fab]").count() == 1)
        await pg.locator("[data-testid=voice-fab]").click(); await pg.wait_for_timeout(500)
        ok("kalit yo'q — tushunarli xabar", "GEMINI_API_KEY" in (await pg.locator("[data-testid=voice-msg]").inner_text()))
        r = api("/api/voice/command", {"text": "salom"}, admin_token())
        ok("server: kalitsiz 503", r.get("_code") == 503 and "GEMINI_API_KEY" in r.get("message", ""), r)
        await pg.keyboard.press("Escape")

        # Endi AI javobini soxtalashtiramiz
        await pg.route("**/api/voice/**", fake_ai)
        await pg.reload(); await pg.wait_for_timeout(2500)

        # 3) ovoz: soxta mikrofon → yozish → «Tayyor» → to'lov oynasi (yagona qarzdor buyurtma)
        await pg.locator("[data-testid=voice-fab]").click(); await pg.wait_for_timeout(1800)
        ok("yozish boshlandi", await pg.locator("[data-testid=voice-stop]").count() == 1)
        await pg.screenshot(path=S + "voice_rec.png")
        await pg.locator("[data-testid=voice-stop]").click(); await pg.wait_for_timeout(2000)
        ok("ovoz serverga fayl bo'lib ketdi", any(k == "audio" and n > 500 for k, n in SEEN), SEEN)
        title = await pg.locator(".uvix-modal-panel").first.inner_text() if await pg.locator(".uvix-modal-panel").count() else ""
        ok("ovoz → Jahongir to'lov oynasi ochildi", "UV-261012-001" in title, title[:200])
        vals = await input_values(pg)
        ok("summa 100 000 qo'yildi", "100 000" in vals, vals)
        await pg.screenshot(path=S + "voice_payment.png")
        await close_modal(pg)

        # 4) to'lov — bir nechta qarzdor buyurtma → tanlov
        await open_text(pg)
        await say(pg, "Malikadan 50 ming naqd")
        rows = await pg.locator("[data-testid=voice-pick] button").count()
        ok("Malika: 3 ta qarzdor buyurtma tanlovi", rows == 3, rows)
        await pg.screenshot(path=S + "voice_pick.png")
        await pg.locator("[data-testid=voice-pick] button", has_text="UV-261013-002").click(); await pg.wait_for_timeout(1500)
        title = await pg.locator(".uvix-modal-panel").first.inner_text()
        ok("tanlangan buyurtma to'lov oynasi", "UV-261013-002" in title)
        vals = await input_values(pg)
        ok("50 000 · naqd", "50 000" in vals and "naqd" in vals, vals)
        await close_modal(pg)

        # 5) buyurtma → smeta oynasi: mijoz bazadagi yozilishida, 2 pozitsiya, jami 310 000
        await open_text(pg); await say(pg, "Sardorga buyurtma: banner 2 ga 1, m² 80 ming, montaj 150 ming")
        await pg.wait_for_timeout(800)
        cust = await pg.locator("[data-testid=quote-customer]").input_value() if await pg.locator("[data-testid=quote-customer]").count() else ""
        ok("buyurtma: mijoz «Sardor Ahmedov»", cust == "Sardor Ahmedov", cust)
        tot = await pg.locator("[data-testid=quote-total]").inner_text() if await pg.locator("[data-testid=quote-total]").count() else ""
        ok("buyurtma: jami 310 000", "310 000" in tot, tot)
        await pg.screenshot(path=S + "voice_order.png")
        await close_modal(pg)

        # 6) rasxod → forma: Material / Plastik, 1 200 000, izoh
        await open_text(pg); await say(pg, "rasxod plyonkaga 1,2 million kartadan")
        vals = await input_values(pg)
        ok("rasxod: kategoriya, bo'lim, summa, izoh", "Material" in vals and "Plastik" in vals and "1 200 000" in vals and "Plyonka" in vals, vals)
        await pg.screenshot(path=S + "voice_expense.png")
        await close_modal(pg)

        # 7) vazifa → Vazifalar bo'limi, forma: nom, sana, vaqt, manzil, xodim
        await open_text(pg); await say(pg, "vazifa ertaga 14 da Jasurga montaj")
        await pg.wait_for_timeout(1500)
        ok("vazifa formasi ochildi", await pg.locator("[data-testid=job-form]").count() == 1)
        if await pg.locator("[data-testid=job-form]").count():
            ok("vazifa: sana va vaqt", await pg.locator("[data-testid=job-date]").input_value() == "2026-10-23" and await pg.locator("[data-testid=job-time]").input_value() == "14:00")
            vals = await input_values(pg)
            ok("vazifa: nom + manzil", any("Malika Interior — Viveska montaji" == v for v in vals) and "Chilonzor 9" in vals, vals)
            on = await pg.evaluate("[...document.querySelectorAll('[data-testid=job-people] [aria-pressed=true]')].map(b=>b.textContent)")
            ok("vazifa: Jasur tanlangan", any("Jasur" in t for t in on), on)
            await pg.screenshot(path=S + "voice_job.png")
            await close_modal(pg)

        # 8) lid → CRM, yangi lid formasi to'ldirilgan
        await open_text(pg); await say(pg, "yangi lid Dilshod oniks devor")
        vals = await input_values(pg)
        ok("lid: ism, telefon, nima kerak, summa", "Dilshod" in vals and "+998901112233" in vals and "Oniks devor" in vals and "5 000 000" in vals, vals)
        title = await pg.locator(".uvix-modal-panel").first.inner_text()
        ok("lid: «Yangi lid» (tahrirlash emas)", "Yangi lid" in title)
        await close_modal(pg)

        # 9) tushunarsiz gap — forma ochilmaydi, sabab ko'rsatiladi
        await open_text(pg); await say(pg, "bugun havo qanday")
        ok("tushunarsiz: xabar, forma yo'q", "Tushunmadim" in await pg.locator("[data-testid=voice-msg]").inner_text() and await pg.locator(".uvix-modal-panel").count() == 0)
        await pg.keyboard.press("Escape")

        # 10) telefon ko'rinishi
        m = await b.new_context(viewport={"width": 390, "height": 844}, timezone_id="Asia/Tashkent", is_mobile=True, has_touch=True, permissions=["microphone"])
        mp = await m.new_page(); await mp.route("**/api/voice/**", fake_ai)
        await mob_login(mp, "Administrator", "0000"); await mp.wait_for_timeout(2500)
        fab = await mp.locator("[data-testid=voice-fab]").bounding_box()
        nav_box = await mp.locator(".uvix-bottomnav").bounding_box() if await mp.locator(".uvix-bottomnav").count() else None
        ok("telefon: tugma pastki menyu ustida", fab and nav_box and fab["y"] + fab["height"] <= nav_box["y"], (fab, nav_box))
        await mp.screenshot(path=S + "voice_mobile.png")
        await mp.locator("[data-testid=voice-fab]").click(); await mp.wait_for_timeout(1500)
        await mp.screenshot(path=S + "voice_mobile_rec.png")
        ok("JS xatolari yo'q", not errs, errs)
        await b.close()
    finish()

asyncio.run(main())
