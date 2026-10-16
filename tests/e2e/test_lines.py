# Ikki yo'nalish (UVIXPRINT / UVONYX): almashtirgich, ajratilgan buyurtma/rasxod/hisob, ON- raqamlash (haqiqiy backend)
import asyncio, datetime, json
from common import *  # noqa: F401,F403

IPH = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
TODAY = datetime.date.today()
M = TODAY.strftime("%Y-%m")
D = lambda d: f"{M}-{d:02d}" if d <= TODAY.day else TODAY.isoformat()

def extra(adm):
    lst = orders(adm)
    for o in lst:  # bu oydagi to'lovlar: UVIXPRINT 600 000
        if o["id"] == "o1": o["payments"] = [{"id": "p1", "amount": 600000, "date": D(1), "paymentType": "naqd", "createdBy": "Aziza Karimova"}]
    lst.append({"id": "x1", "orderNumber": "ON-261015-001", "date": D(1), "customer": "Oniks Mijoz", "subcategory": "UVONYX", "title": "Oniks stol", "materialType": "Oniks",
                "agreementUzs": 1000000, "payments": [{"id": "px1", "amount": 400000, "date": D(1), "paymentType": "karta", "createdBy": "Aziza Karimova"}],
                "createdBy": "Aziza Karimova", "createdAt": "2026-10-01T10:00:00.000Z", "manager": "Aziza Karimova", "prodStage": "new"})
    dbset("uvix:orders", lst)
    dbset("uvix:transactions", [
        {"id": "e1", "type": "chiqim", "date": D(1), "amount": 50000, "paymentType": "karta", "category": "Material", "subcategory": "Shisha", "line": "UVONYX", "createdBy": "Administrator", "createdAt": "2026-10-01T10:00:00Z"},
        {"id": "e2", "type": "chiqim", "date": D(1), "amount": 1000000, "paymentType": "naqd", "category": "Ijara", "subcategory": "Sex", "line": "common", "createdBy": "Administrator", "createdAt": "2026-10-01T10:00:00Z"},
        {"id": "e3", "type": "chiqim", "date": D(1), "amount": 70000, "paymentType": "naqd", "category": "Kraska", "subcategory": "UV kraska", "line": "UVIXPRINT", "createdBy": "Administrator", "createdAt": "2026-10-01T10:00:00Z"},
    ])

async def rows(pg):
    return await pg.evaluate("[...document.querySelectorAll('tr.uvix-row')].map(r => r.innerText.split('\\n')[0]).join(' | ')")

async def main():
    adm = admin_token()
    extra(adm)
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        ok("rahbar: standart — «Ikkalasi», chiziq yo'q", "Ikkalasi" in await d.locator("[data-testid=line-card]").inner_text() and await d.locator("[data-testid=line-stripe]").count() == 0)
        await d.locator("[data-testid=line-card]").click(); await d.wait_for_timeout(300)
        opts = await d.evaluate("[...document.querySelectorAll('[data-testid=line-menu] [data-line-option]')].map(e=>e.dataset.lineOption).join()")
        ok("tanlov: UVIXPRINT, UVONYX, Ikkalasi", opts == "UVIXPRINT,UVONYX,all", opts)
        await d.screenshot(path=OUT + "lines_menu.png")
        await d.locator("[data-line-option=UVONYX]").click(); await d.wait_for_timeout(900)
        ok("UVONYX: rangli chiziq va karta", await d.locator("[data-testid=line-stripe][data-line=UVONYX]").count() == 1 and "UVONYX" in await d.locator("[data-testid=line-card]").inner_text())
        dash = await d.locator(".uvix-hero").first.inner_text()
        ok("Dashboard: faqat UVONYX buyurtmalari (1 000 000)", "1 000 000" in dash, dash[:200])
        ok("Dashboard: yo'nalish belgisi", await d.locator(".uvix-hero [data-line-tag=UVONYX]").count() == 1)
        # Karta qoldig'i: 400 000 − 50 000 = 350 000; Naqd: 0 − ijara ulushi (400/1000 × 1 000 000 = 400 000) = −400 000
        inc = {"UVIXPRINT": 0, "UVONYX": 0}
        for o in orders(adm):
            for pmt in o.get("payments", []):
                if str(pmt.get("date", "")).startswith(M) and not pmt.get("deletedAt"): inc["UVONYX" if o.get("subcategory") == "UVONYX" else "UVIXPRINT"] += pmt["amount"]
        share_cash = round(1000000 * inc["UVONYX"] / (inc["UVONYX"] + inc["UVIXPRINT"]))
        exp_cash = f"-{share_cash:,}".replace(",", " ")
        ok("qoldiq: karta 400 000 − 50 000; naqd − ijaraning UVONYX ulushi (tushumga qarab)", "350 000" in dash and exp_cash in dash.replace("−", "-"), (exp_cash, dash))
        ok("Bo'yoq ombori UVONYX'da yo'q", await d.locator(".uvix-nav-item", has_text="Bo'yoq").count() == 0)
        await nav(d, "Buyurtmalar")
        r = await rows(d)
        ok("Buyurtmalar: faqat ON- buyurtma", "ON-261015-001" in r and "UV-" not in r, r)
        await d.screenshot(path=OUT + "lines_orders.png")
        await nav(d, "Rasxod")
        txt = await d.locator("table").first.inner_text()
        ok("Rasxod: UVONYX + Umumiy (to'liq summa), UVIXPRINT'niki yo'q", "50 000" in txt and "1 000 000" in txt and "70 000" not in txt and "Umumiy" in txt, txt)
        await d.locator("button", has_text="Yangi rasxod").click(); await d.wait_for_timeout(500)
        g = d.locator("[data-testid=tx-line]")
        ok("yangi rasxod: «Faqat UVONYX» tanlangan, Umumiy ham bor", await g.locator("[data-line=UVONYX][aria-pressed=true]").count() == 1 and await g.locator("[data-line=common]").count() == 1 and await g.locator("[data-line=UVIXPRINT]").count() == 0)
        await d.locator(".uvix-modal-panel input[inputmode=numeric], .uvix-modal-panel input[placeholder='0']").first.fill("120000")
        await d.locator(".uvix-modal-panel button", has_text="Saqlash").last.click(); await d.wait_for_timeout(1200)
        tx = json.loads(api("/api/kv/uvix:transactions", token=adm)["value"])
        nw = [t for t in tx if t["id"] not in ("e1", "e2", "e3")]
        ok("saqlandi: line = UVONYX", len(nw) == 1 and nw[0].get("line") == "UVONYX" and nw[0]["amount"] == 120000, nw)
        # Ctrl+1 → UVIXPRINT, qayta yuklashda eslab qolinadi
        await d.keyboard.press("Control+1"); await d.wait_for_timeout(800)
        ok("Ctrl+1 → UVIXPRINT", await d.locator("[data-testid=line-stripe][data-line=UVIXPRINT]").count() == 1)
        await d.reload(); await d.wait_for_timeout(2500)
        ok("qayta ochilganda — UVIXPRINT eslab qolingan", await d.locator("[data-testid=line-stripe][data-line=UVIXPRINT]").count() == 1)
        ok("UVIXPRINT'da Bo'yoq ombori bor", await d.locator(".uvix-nav-item", has_text="Bo'yoq").count() == 1)
        await nav(d, "Buyurtmalar")
        r = await rows(d)
        ok("UVIXPRINT buyurtmalari, ON- yo'q", "ON-261015-001" not in r and "UV-261013-003" in r, r)
        await d.keyboard.press("Control+3"); await d.wait_for_timeout(800)
        r = await rows(d)
        ok("Ctrl+3 (rahbar) → ikkalasi", "ON-261015-001" in r and "UV-261013-003" in r)
        # ---------- Operator (telefon) ----------
        m = await (await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=IPH, device_scale_factor=2, timezone_id="Asia/Tashkent")).new_page(); m.on("pageerror", lambda e: errs.append("M:" + str(e)))
        await mob_login(m, "Aziza", "1234"); await m.wait_for_selector(".uvix-bottomnav", timeout=15000); await m.wait_for_timeout(1500)
        pill = m.locator("[data-testid=line-pill]")
        ok("telefon: tepada yo'nalish yorlig'i (operator standarti — UVIXPRINT)", await pill.is_visible() and "UVIXPRINT" in await pill.inner_text())
        await pill.click(); await m.wait_for_timeout(400)
        opts = await m.evaluate("[...document.querySelectorAll('[data-testid=line-sheet] [data-line-option]')].map(e=>e.dataset.lineOption).join()")
        ok("operatorda «Ikkalasi» yo'q", opts == "UVIXPRINT,UVONYX", opts)
        await m.screenshot(path=OUT + "lines_sheet.png")
        await m.locator("[data-testid=line-sheet] [data-line-option=UVONYX]").click(); await m.wait_for_timeout(1200)
        ok("UVONYX'ga o'tdi", "UVONYX" in await pill.inner_text() and await m.locator("[data-testid=line-stripe][data-line=UVONYX]").count() == 1)
        await m.screenshot(path=OUT + "lines_today.png")
        # ---------- Server: ON- raqamlash ----------
        az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
        r = api("/api/quotes/convert", {"customer": "Yangi Oniks", "subcategory": "UVONYX", "items": [{"id": "i1", "unit": "lump", "title": "Oniks panno", "price": 500000}], "payments": [{"amount": 500000, "paymentType": "naqd"}], "force": True}, adm)
        nums = [o["orderNumber"] for o in r.get("orders", [])]
        ok("server: UVONYX buyurtmasi ON- raqam bilan", len(nums) == 1 and nums[0].startswith("ON-"), r)
        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
