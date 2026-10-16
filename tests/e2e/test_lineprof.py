# 10-etap: yo'nalish sozlamalari — rang, buyurtma raqami prefiksi, logo, rekvizitlar
import asyncio, base64, datetime, json, os
from common import *  # noqa: F401,F403
TODAY = datetime.date.today().isoformat()
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAGklEQVR42mP8z8DwnwEJMDIyMjIyMDIyMgAAj/QB/1ky0AEAAAAASUVORK5CYII=")

def kv(key, tok): return json.loads(api("/api/kv/" + key, token=tok)["value"])

async def main():
    adm = admin_token()
    dbset("uvix:transactions", [{"id": "e1", "type": "chiqim", "date": TODAY, "amount": 50000, "paymentType": "karta", "category": "Material", "line": "UVONYX", "createdBy": "Administrator", "createdAt": "2026-10-01T10:00:00Z"}])
    logo = os.path.join(OUT, "logo_test.png"); open(logo, "wb").write(PNG)
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        await nav(d, "Sozlamalar"); await d.locator("[data-section=savdo]").click(); await d.wait_for_timeout(800)
        on = d.locator("[data-line-profile=UVONYX]")
        await on.locator("[data-field=prefix]").fill("UV")
        await d.locator("[data-testid=line-profiles-save]").click(); await d.wait_for_timeout(500)
        ok("bir xil prefiks — rad etiladi", "bir xil" in await d.locator("[data-testid=line-profiles]").inner_text())
        await on.locator("[data-field=prefix]").fill("OX")
        await on.locator("[data-field=color]").evaluate("(e) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, '#aa3355'); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }")
        await on.locator("[data-field=cardNumber]").fill("8600 0000 1111 2222")
        await on.locator("[data-field=logo]").set_input_files(logo); await d.wait_for_timeout(600)
        await d.locator("[data-testid=line-profiles-save]").click(); await d.wait_for_timeout(1200)
        st = kv("uvix:settings", adm).get("lineProfiles", {})
        ok("saqlandi: UVONYX prefiksi OX, rang, karta, logo", st.get("UVONYX", {}).get("prefix") == "OX" and st["UVONYX"].get("color") == "#aa3355" and st["UVONYX"].get("cardNumber") == "8600 0000 1111 2222" and str(st["UVONYX"].get("logo", "")).startswith("data:image/png"), {k: (v if k != "logo" else str(v)[:30]) for k, v in st.get("UVONYX", {}).items()})
        await d.locator("[data-line-profile]").first.screenshot(path=OUT + "lineprof_section.png")
        # Rang butun ilovada: rasxod ro'yxatidagi UVONYX belgisi
        await nav(d, "Rasxod"); await d.wait_for_timeout(600)
        col = await d.locator("[data-line-tag=UVONYX]").first.evaluate("(e) => getComputedStyle(e).color")
        ok("UVONYX belgisi yangi rangda", col == "rgb(170, 51, 85)", col)
        await b.close()
    # Server: smeta → buyurtma — yangi prefiks
    r = api("/api/quotes/convert", {"customer": "Yangi Oniks", "subcategory": "UVONYX", "items": [{"id": "i1", "unit": "lump", "title": "Oniks panno", "price": 500000}], "payments": [{"amount": 500000, "paymentType": "naqd"}], "force": True}, adm)
    nums = [o["orderNumber"] for o in r.get("orders", [])]
    ok("server: UVONYX buyurtmasi OX- raqam bilan", len(nums) == 1 and nums[0].startswith("OX-"), r)
    r = api("/api/quotes/convert", {"customer": "Banner mijoz", "subcategory": "UVIXPRINT", "items": [{"id": "i1", "unit": "lump", "title": "Banner", "price": 100000}], "payments": [{"amount": 100000, "paymentType": "naqd"}], "force": True}, adm)
    ok("UVIXPRINT — avvalgidek UV-", r.get("orders", [{}])[0].get("orderNumber", "").startswith("UV-"), r)
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
