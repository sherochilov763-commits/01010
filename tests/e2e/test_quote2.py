# Smeta / Buyurtma (138–140-eskiz, C varianti): lid panelidan oyna, detallardan m², pechat «qatordan»,
# bitta buyurtma; $ va qo'lda kurs; xodim — avans kam bo'lsa rahbarga so'rov, rahbar tasdiqlaydi; telefon
import asyncio, datetime, json
from common import *  # noqa: F401,F403

now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
LEADS = [
    {"id": "q_l1", "customer": "Smeta Mijoz", "phone": "+998901112233", "jobTitle": "Peshlavha LED", "stage": "new", "source": "telegram", "line": "UVIXPRINT", "createdAt": now, "createdBy": "Administrator", "manager": "Aziza Karimova"},
    {"id": "q_l2", "customer": "Operator Mijoz", "phone": "+998904445566", "stage": "new", "source": "telegram", "line": "UVIXPRINT", "createdAt": now, "createdBy": "Aziza Karimova", "manager": "Aziza Karimova"},
]
def leads(tok): return json.loads(api("/api/kv/uvix:leads", token=tok)["value"])
def lead(tok, i): return [l for l in leads(tok) if l["id"] == i][0]

async def open_lead_quote(pg, lid):
    if await pg.locator("[data-testid=lead-panel]").count():
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(500)
    await nav(pg, "CRM"); await pg.wait_for_timeout(1200)
    await pg.locator(f"[data-lead={lid}]").first.click(); await pg.wait_for_timeout(700)
    await pg.locator("[data-testid=lead-panel-actions] [data-act=quote]").click(); await pg.wait_for_timeout(900)

async def main():
    adm = admin_token()
    cur = leads(adm)
    dbset("uvix:leads", LEADS + cur)
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        await open_lead_quote(d, "q_l1")
        sh = d.locator("[data-testid=quote-sheet2]")
        ok("lid panelidan «Smeta» → pastdan oyna (lid panel ustida)", await sh.count() == 1 and "Smeta Mijoz" in await sh.inner_text())
        box = await sh.bounding_box()
        ok("oyna deyarli butun ekran", box and box["width"] > 1300 and box["y"] < 40, box)
        ok("birinchi qator — Material, «Detallar» ochiq", await sh.locator("[data-testid=qs-row]").count() == 1 and await sh.locator("[data-testid=qs-details]").count() == 1)
        # 1-qator: Akril, 2 xil detal
        r1 = sh.locator("[data-testid=qs-row]").nth(0)
        await r1.locator("[data-testid=qs-name]").fill("Akril 3 mm")
        await r1.locator("[data-testid=qs-w]").nth(0).fill("1200"); await r1.locator("[data-testid=qs-h]").nth(0).fill("600"); await r1.locator("[data-testid=qs-n]").nth(0).fill("2")
        await r1.locator("[data-testid=qs-add-part]").click()
        await r1.locator("[data-testid=qs-w]").nth(1).fill("800"); await r1.locator("[data-testid=qs-h]").nth(1).fill("400"); await r1.locator("[data-testid=qs-n]").nth(1).fill("4")
        await r1.locator("[data-testid=qs-price]").fill("100000")
        ok("detallardan maydon: 2,72 m²", "2,72 m²" in await r1.locator("[data-testid=qs-area-sum]").inner_text())
        ok("qator summasi 272 000", (await r1.locator("[data-testid=qs-row-total]").inner_text()).replace(" ", " ") == "272 000")
        # Pechat — maydon 1-qatordan o'zi olinadi
        await sh.locator("[data-testid=qs-add] [data-add=pechat]").click(); await d.wait_for_timeout(200)
        r2 = sh.locator("[data-testid=qs-row]").nth(1)
        ok("pechat qatori: «2,72 m² — 1-qatordan»", "1-qatordan" in await r2.locator("[data-testid=qs-area-btn]").inner_text())
        await r2.locator("[data-testid=qs-price]").fill("50000")
        # Montaj — kelishilgan summa
        await sh.locator("[data-testid=qs-add] [data-add=montaj]").click(); await d.wait_for_timeout(200)
        r3 = sh.locator("[data-testid=qs-row]").nth(2)
        ok("montaj — «summa» usuli", await r3.locator("[data-testid=qs-calc] [aria-checked=true]").get_attribute("data-v") == "lump")
        await r3.locator("[data-testid=qs-price]").fill("200000")
        tot = (await sh.locator("[data-testid=quote-total]").inner_text()).replace(" ", " ")
        ok("jami 608 000", tot == "608 000 so'm", tot)
        bk = await sh.locator("[data-testid=qs-bykind]").inner_text()
        ok("xulosada turlar: Material, Pechat, Montaj", all(k in bk for k in ["Material", "Pechat", "Montaj"]), bk)
        await sh.locator("[data-testid=qs-adv]").fill("100000")
        ok("avans kam — ogohlantirish (50% = 304 000)", "304 000" in (await sh.locator("[data-testid=qs-short]").inner_text()).replace(" ", " "))
        await sh.locator("[data-testid=qs-adv]").fill("304000")
        ok("qoldiq — mijoz qarzi 304 000", "304 000" in (await sh.locator("[data-testid=qs-debt]").inner_text()).replace(" ", " "))
        await d.screenshot(path=OUT + "quote2_desktop.png")
        await sh.locator("[data-testid=qs-create]").click(); await d.wait_for_timeout(1800)
        os_ = [o for o in orders(adm) if o.get("customer") == "Smeta Mijoz"]
        o = os_[0] if os_ else {}
        ok("BITTA buyurtma: 608 000, 3 pozitsiya, avans 304 000", len(os_) == 1 and o.get("agreementUzs") == 608000 and len(o.get("items", [])) == 3 and o["payments"][0]["amount"] == 304000, o)
        ok("buyurtma maydoni — pechat m² (2,72), bo'yoq summasi yozilmaydi", o.get("area") == 2.72 and o.get("kraskaSum") == 0)
        ok("lid: smeta buyurtmaga aylandi", lead(adm, "q_l1")["quote"]["status"] == "converted")
        ok("oyna yopildi", await d.locator("[data-testid=quote-sheet2]").count() == 0)
        # Buyurtma panelida pozitsiyalar
        await d.keyboard.press("Escape"); await d.wait_for_timeout(400)
        await d.evaluate("window.history.length")
        # ---------- Yangi (lidsiz) smeta: $ va qo'lda kurs, saqlash ----------
        await nav(d, "Buyurtmalar"); await d.wait_for_timeout(900)
        await d.locator("[data-testid=new-order]").first.click(); await d.wait_for_timeout(800)
        sh = d.locator("[data-testid=quote-sheet2]")
        await sh.locator("[data-testid=quote-customer]").fill("Dollar Mijoz")
        r1 = sh.locator("[data-testid=qs-row]").nth(0)
        await r1.locator("[data-testid=qs-calc] [data-v=lump]").click()
        await r1.locator("[data-testid=qs-cur] [data-v=usd]").click()
        await r1.locator("[data-testid=qs-price]").fill("10.5")
        ok("$ qator — kurs bloki chiqadi", await sh.locator("[data-testid=qs-rate]").count() == 1)
        await sh.locator("[data-testid=qs-rate-mode] [data-v=manual]").click()
        await sh.locator("[data-testid=qs-rate-input]").fill("12840")
        tot = (await sh.locator("[data-testid=quote-total]").inner_text()).replace(" ", " ")
        ok("$10,5 × 12 840 = 134 820 → 135 000 (1 000 gacha)", tot == "135 000 so'm", tot)
        await d.screenshot(path=OUT + "quote2_usd.png")
        await sh.locator("[data-testid=qs-save]").click(); await d.wait_for_timeout(1500)
        nl = [l for l in leads(adm) if l["customer"] == "Dollar Mijoz"]
        q = nl[0]["quote"] if nl else {}
        ok("smeta yangi lidga saqlandi: v2, kurs 12 840 (qo'lda)", q.get("v") == 2 and q.get("rate") == 12840 and q.get("rateSrc") == "manual" and q.get("total") == 135000, q)
        await b.close()

        # ---------- Operator: avans kam → rahbarga so'rov; rahbar ilovada tasdiqlaydi ----------
        b = await p.chromium.launch()
        op = await (await b.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); op.on("pageerror", lambda e: errs.append("O:" + str(e)))
        await dlogin(op, "Aziza Karimova", "1234")
        await open_lead_quote(op, "q_l2")
        sh = op.locator("[data-testid=quote-sheet2]")
        r1 = sh.locator("[data-testid=qs-row]").nth(0)
        await r1.locator("[data-testid=qs-calc] [data-v=pcs]").click()
        await r1.locator("[data-testid=qs-qty]").fill("10"); await r1.locator("[data-testid=qs-price]").fill("50000")
        ok("operator: avans yo'q → «Rahbarga tasdiqqa yuborish»", await sh.locator("[data-testid=qs-request]").count() == 1 and await sh.locator("[data-testid=qs-create]").count() == 0)
        await sh.locator("[data-testid=qs-request]").click(); await op.wait_for_timeout(1500)
        l2 = lead(adm, "q_l2")
        ok("so'rov yuborildi: smeta lidda, holat «kutmoqda»", l2.get("quote", {}).get("request", {}).get("status") == "pending" and l2["quote"]["total"] == 500000, l2.get("quote"))
        await open_lead_quote(op, "q_l2")
        ok("operator: smeta qulflangan, «So'rovni bekor qilish»", await op.locator("[data-testid=qs-pending]").count() == 1 and await op.locator("[data-testid=qs-cancel-req]").count() == 1)
        await op.screenshot(path=OUT + "quote2_pending.png")
        await b.close()
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D2:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        await open_lead_quote(d, "q_l2")
        ok("rahbar: «Tasdiqlash / Rad etish»", await d.locator("[data-testid=qs-approve]").count() == 1)
        await d.locator("[data-testid=qs-approve]").click(); await d.wait_for_timeout(1800)
        o2 = [o for o in orders(adm) if o.get("customer") == "Operator Mijoz"]
        ok("tasdiqlandi → buyurtma ochildi (kiritgan — Aziza, tasdiqladi — Administrator)", len(o2) == 1 and o2[0].get("createdBy") == "Aziza Karimova" and o2[0].get("approvedBy") == "Administrator" and o2[0]["agreementUzs"] == 500000, o2)
        await b.close()

        # ---------- Telefon ----------
        b = await p.chromium.launch()
        m = await (await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, timezone_id="Asia/Tashkent")).new_page(); m.on("pageerror", lambda e: errs.append("M:" + str(e)))
        await mob_login(m, "Administrator", "0000"); await m.wait_for_timeout(2000)
        await m.locator("[data-testid=header-plus]").click(); await m.wait_for_timeout(400)
        await m.locator("[data-add=order]").click(); await m.wait_for_timeout(900)
        sh = m.locator("[data-testid=quote-sheet2]")
        ok("telefon: «+» → Buyurtma → to'liq ekran oyna", await sh.count() == 1)
        if await sh.count():
            await sh.locator("[data-testid=quote-customer]").fill("Telefon Mijoz")
            await sh.locator("[data-testid=qs-row]").first.click(); await m.wait_for_timeout(500)
            ed = m.locator("[data-testid=qs-edit]")
            ok("qator bosilsa — tahrir varag'i", await ed.count() == 1)
            await ed.locator("[data-testid=qs-w]").first.fill("1000"); await ed.locator("[data-testid=qs-h]").first.fill("500")
            await ed.locator("[data-testid=qs-price]").fill("120000")
            await m.screenshot(path=OUT + "quote2_phone_edit.png")
            await ed.locator("[data-testid=qs-edit-done]").click(); await m.wait_for_timeout(300)
            tot = (await sh.locator("[data-testid=quote-total]").inner_text()).replace(" ", " ")
            ok("telefon: 0,5 m² × 120 000 = 60 000", tot == "60 000 so'm", tot)
            ok("telefon: gorizontal aylantirish yo'q", await m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
            await m.screenshot(path=OUT + "quote2_phone.png")
        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
