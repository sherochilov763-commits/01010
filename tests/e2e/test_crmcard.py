# CRM lid kartasi (eskiz 85–86): «Kelgan» sana, «Mijoz — nima ish», belgilar, qayta mijoz,
# kartani bosganda o'ngdan panel (maydonlar, tez amallar, bosqich), Esc bilan yopish, telefonda pastdan varaq.
import asyncio, datetime, json
from common import *  # noqa: F401,F403

NOW = datetime.datetime.now(datetime.timezone.utc)
iso = lambda dt: dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")

def seed(adm):
    lst = orders(adm)
    lst.append({"id": "cc_o1", "orderNumber": "UV-261001-901", "date": "2026-10-01", "customer": "Qayta Mijoz MCHJ", "subcategory": "UVIXPRINT", "title": "Vitrina",
                "agreementUzs": 2500000, "payments": [], "createdBy": "Administrator", "createdAt": "2026-10-01T10:00:00.000Z", "prodStage": "delivered"})
    dbset("uvix:orders", lst)
    leads = json.loads(api("/api/kv/uvix:leads", token=adm)["value"])
    leads = [l for l in leads if not str(l.get("id", "")).startswith("cc_")]
    leads += [
        {"id": "cc_l1", "customer": "Bugungi Mijoz", "jobTitle": "Oniks devor, ~12 kv/m", "phone": "+998901234567", "source": "Tavsiya", "estimatedValue": 8000000,
         "manager": "Administrator", "line": "UVIXPRINT", "stage": "new", "createdAt": iso(NOW - datetime.timedelta(minutes=30)), "createdBy": "Administrator"},
        {"id": "cc_l2", "customer": "Qayta Mijoz MCHJ", "notes": "Ofis uchun lavha", "estimatedValue": 3000000, "line": "UVIXPRINT", "stage": "new",
         "createdAt": iso(NOW - datetime.timedelta(days=6)), "stageAt": iso(NOW - datetime.timedelta(days=6)), "createdBy": "Administrator"},
    ]
    dbset("uvix:leads", leads)

def lead(adm, i): return [l for l in json.loads(api("/api/kv/uvix:leads", token=adm)["value"]) if l["id"] == i][0]

async def main():
    adm = admin_token()
    seed(adm)
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append(str(e)))
        await dlogin(d, "Administrator", "0000")
        await nav(d, "CRM"); await d.wait_for_timeout(1500)
        c1 = d.locator("[data-lead=cc_l1]").first
        came = await c1.locator("[data-testid=lead-came]").inner_text()
        ok("kartada «Kelgan: bugun HH:MM»", came.startswith("Kelgan: bugun "), came)
        txt = await c1.text_content()
        ok("kartada «Mijoz — nima ish» va summa", "Bugungi Mijoz" in txt and "Oniks devor" in txt and "8 000 000" in txt, txt)
        ok("yangi lidda (2 kungacha) «Vazifa yo'q» yo'q — CRM-1", await c1.locator("[data-act=none]").count() == 0)
        ok("6 kunlik vazifasiz lidda «Vazifa yo'q» bor", await d.locator("[data-lead=cc_l2] [data-act=none]").count() == 1)
        ok("kartada «O'chirish» tugmasi yo'q — CRM-4", await c1.locator(".uvix-lead-actions [aria-label=\"O'chirish\"]").count() == 0)
        ok("manba belgisi va izohi", await c1.locator("[data-testid=source-chip][data-tip*='Tavsiya']").count() == 1)
        c2 = d.locator("[data-lead=cc_l2]").first
        ok("nima ish bo'lmasa — izoh ko'rinadi", "Ofis uchun lavha" in await c2.inner_text())
        ok("sana: «Kelgan: 6 kun oldingi kun»", "Kelgan: " in await c2.locator("[data-testid=lead-came]").inner_text() and "bugun" not in await c2.locator("[data-testid=lead-came]").inner_text())
        rep = c2.locator("[data-testid=lead-repeat]")
        ok("qayta mijoz belgisi: «2-marta»", await rep.count() == 1 and "2-marta" in await rep.inner_text())
        ok("sovish belgisi (6 kun)", await c2.locator("[data-testid=lead-cold]").count() == 1 and "6 kun" in await c2.locator("[data-testid=lead-cold]").inner_text())
        await d.screenshot(path=OUT + "crmcard_board.png")
        # ---------- Panel ----------
        await c1.click(); await d.wait_for_timeout(600)
        pn = d.locator("[data-testid=lead-panel]")
        ok("kartani bosish → pastdan panel (131-B)", await pn.count() == 1 and await pn.get_attribute("data-lead-panel") == "cc_l1")
        box = await pn.bounding_box()
        ok("panel deyarli butun ekran: 3 ustun", box and box["width"] >= 1300 and 20 <= box["y"] <= 30 and await pn.locator("[data-testid=lead-panel-side]").count() == 1 and await pn.locator("[data-testid=lead-panel-tabs]").count() == 1, box)
        ptxt = await pn.inner_text()
        ok("panel maydonlari: Summa, Kelgan sana, Yo'nalish, Telefon, Keyingi ish", all(k in ptxt for k in ["Summa", "Kelgan sana", "Yo'nalish", "Telefon", "Keyingi ish", "Avvalgi buyurtmalar"]), ptxt)
        acts = await d.evaluate("[...document.querySelectorAll('[data-testid=lead-panel-actions] [data-act]')].map(e=>e.dataset.act).join()")
        ok("tez amallar: qo'ng'iroq, telegram, smeta (vazifa — o'ngda, «Vazifalar» yonida)", acts == "call,tg,quote" and "Vazifa" in await d.locator("[data-testid=side-add-job]").inner_text(), acts)
        ok("qo'ng'iroq — tel: havola", (await pn.locator("[data-act=call]").get_attribute("href")) == "tel:+998901234567")
        await d.screenshot(path=OUT + "crmcard_panel.png")
        await pn.locator("[data-testid=lead-panel-stage]").select_option("negotiation"); await d.wait_for_timeout(1200)
        ok("paneldan bosqich o'zgardi", lead(adm, "cc_l1")["stage"] == "negotiation")
        await pn.locator("[data-act=job]").click(); await d.wait_for_timeout(600)
        ok("«Vazifa» — forma lid bilan: mijoz o'zi, buyurtma maydoni yo'q (124)", await d.locator("[data-testid=job-customer]").count() == 1 and "Bugungi Mijoz" in await d.locator("[data-testid=job-customer]").inner_text() and await d.locator("[data-testid=job-order]").count() == 0)
        ok("Muzokara bosqichida tur — «Boshqa», nomi «— vazifa»", await d.locator("[data-kind=other][aria-pressed=true]").count() == 1 and (await d.locator("[data-testid=job-title]").input_value()).endswith("vazifa"))
        await d.locator("[data-kind=install]").click(); await d.wait_for_timeout(200)
        ok("Montaj → buyurtma maydoni (shu mijoz), nomi «— montaj»", await d.locator("[data-testid=job-order]").count() == 1 and (await d.locator("[data-testid=job-title]").input_value()).endswith("montaj"))
        await d.keyboard.press("Escape"); await d.wait_for_timeout(300)
        ok("forma ochiq — Esc panelni yopmaydi", await pn.count() == 1)
        while await d.locator(".uvix-modal-panel").count(): await close_modal(d)
        ok("forma yopildi, panel qoldi", await d.locator("[data-testid=job-form]").count() == 0 and await pn.count() == 1)
        await d.keyboard.press("Escape"); await d.wait_for_timeout(400)
        ok("Esc → panel yopildi", await d.locator("[data-testid=lead-panel]").count() == 0)
        # ---------- Tahrirlash: «Nima ish» maydoni ----------
        await c2.click(); await d.wait_for_timeout(500)
        await d.locator("[data-testid=lead-panel-edit]").click(); await d.wait_for_timeout(500)
        await d.locator("[data-testid=lead-title]").fill("Ofis lavhasi, 2 dona")
        await d.locator(".uvix-modal-panel button", has_text="Saqlash").click(); await d.wait_for_timeout(1200)
        ok("«Nima ish» saqlandi (jobTitle)", lead(adm, "cc_l2").get("jobTitle") == "Ofis lavhasi, 2 dona")
        ok("panel yangilandi", "Ofis lavhasi, 2 dona" in await d.locator("[data-testid=lead-panel]").inner_text())
        await d.locator("[data-testid=lead-panel-close]").click(); await d.wait_for_timeout(300)
        # ---------- Telefon ----------
        m = await (await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, timezone_id="Asia/Tashkent")).new_page(); m.on("pageerror", lambda e: errs.append(str(e)))
        await mob_login(m, "Administrator", "0000"); await m.wait_for_timeout(2500)
        await m.locator(".uvix-bottomnav [data-tab=crm]").click(); await m.wait_for_timeout(1300)
        mc = m.locator("[data-lead=cc_l2]").first
        ok("telefon: xuddi shu karta", await mc.count() == 1 and await mc.locator("[data-testid=lead-came]").count() == 1)
        await mc.click(); await m.wait_for_timeout(700)
        mp = m.locator("[data-testid=lead-panel]")
        bb = await mp.bounding_box() if await mp.count() else None
        ok("telefon: panel pastdan (to'liq kenglik)", bb and bb["width"] >= 389 and bb["y"] >= 8, bb)
        ok("telefon (135-A): tepada «Vazifa» yo'q, tugmalar bitta qatorda", await mp.locator("[data-testid=lead-panel-actions] [data-act=job]").count() == 0)
        await mp.locator("[data-testid=lead-panel-tabs] [data-tab=tasks]").click(); await m.wait_for_timeout(400)
        ok("telefon: «Vazifa» tabida «+ Vazifa»", await mp.locator("[data-testid=side-add-job]").count() == 1)
        await mp.locator("[data-testid=lead-panel-tabs] [data-tab=info]").click(); await m.wait_for_timeout(300)
        await m.screenshot(path=OUT + "crmcard_phone.png")
        await m.go_back(); await m.wait_for_timeout(500)
        ok("telefon: «orqaga» — panel yopildi", await m.locator("[data-testid=lead-panel]").count() == 0)
        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
