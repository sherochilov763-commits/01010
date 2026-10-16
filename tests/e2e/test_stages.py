# UVONYX bosqichlari: CRM (Murojaat → O'lchov → Smeta), buyurtma (Material, O'rnatish), vazifalar zanjiri
import asyncio, datetime, json
from common import *  # noqa: F401,F403
TODAY = datetime.date.today().isoformat()

def seed(adm):
    lst = orders(adm)
    lst.append({"id": "x1", "orderNumber": "ON-261015-001", "date": TODAY, "customer": "Oniks Mijoz", "subcategory": "UVONYX", "title": "Oniks stol", "agreementUzs": 1000000, "payments": [],
                "createdBy": "Administrator", "createdAt": "2026-10-15T10:00:00.000Z", "prodStage": "new", "leadId": "l3"})
    dbset("uvix:orders", lst)
    leads = json.loads(api("/api/kv/uvix:leads", token=adm)["value"])
    leads += [{"id": "l3", "customer": "Oniks Mijoz", "line": "UVONYX", "stage": "design", "orderIds": ["x1"], "createdAt": "2026-10-15T10:00:00Z", "createdBy": "Administrator"},
              {"id": "l4", "customer": "Yangi oniks murojaat", "phone": "+998901112233", "line": "UVONYX", "stage": "new", "createdAt": "2026-10-15T10:00:00Z", "createdBy": "Administrator"}]
    dbset("uvix:leads", leads)

def lead(adm, i): return [l for l in json.loads(api("/api/kv/uvix:leads", token=adm)["value"]) if l["id"] == i][0]
def stage(adm, i): return [o for o in orders(adm) if o["id"] == i][0].get("prodStage")

async def main():
    adm = admin_token()
    seed(adm)
    errs = []
    # ---------- Buyurtma: Material, O'rnatish ----------
    r = api("/api/orders/x1/stage", {"stage": "material"}, adm)
    ok("UVONYX buyurtma: «Material» bosqichi", stage(adm, "x1") == "material", r)
    # ---------- O'lchov vazifasi → lid «O'lchov» → bajarildi → «Smeta» ----------
    j = api("/api/jobs", {"kind": "measure", "leadId": "l4", "date": TODAY, "time": "11:00", "assigneeIds": ["jasur"]}, adm)["job"]
    ok("o'lchov vazifasi lidga bog'landi (UVONYX, nomi — mijoz)", j["leadId"] == "l4" and j["line"] == "UVONYX" and "Yangi oniks" in j["title"], j)
    ok("lid «O'lchov» bosqichiga o'tdi", lead(adm, "l4")["stage"] == "measure")
    api(f"/api/jobs/{j['id']}", {"status": "done"}, adm, method="PATCH")
    ok("o'lchov bajarildi → lid «Smeta» (muzokara)", lead(adm, "l4")["stage"] == "negotiation")
    # ---------- Montaj: boshlandi → «O'rnatish»; bajarildi → «Topshirildi» ----------
    api("/api/orders/x1/stage", {"stage": "ready"}, adm)
    m = api("/api/jobs", {"kind": "install", "orderId": "x1", "date": TODAY, "time": "14:00", "assigneeIds": ["jasur"]}, adm)["job"]
    api(f"/api/jobs/{m['id']}", {"status": "doing"}, adm, method="PATCH")
    ok("montaj boshlandi → buyurtma «O'rnatish»", stage(adm, "x1") == "install")
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append(str(e)))
        await dlogin(d, "Administrator", "0000")
        await nav(d, "CRM"); await d.wait_for_timeout(1500)
        ok("CRM: «O'lchov (UVONYX)» ustuni", await d.locator("[data-stage=measure]").count() >= 1)
        card = d.locator("[data-lead=l3] [data-testid=lead-next-job]")
        ok("lid kartasida keyingi ish: «Montaj · bugun 14:00 · Jasur»", await card.count() == 1 and "Montaj" in await card.inner_text() and "14:00" in await card.inner_text(), await card.inner_text() if await card.count() else "")
        # Lid kartasidan o'lchovga yuborish
        await d.locator("[data-lead=l4]").first.hover(); await d.wait_for_timeout(200)
        await d.locator("[data-lead-job=l4]").first.click(); await d.wait_for_timeout(500)
        ok("«O'lchov» formasi lid bilan ochildi", await d.locator("[data-testid=job-lead]").count() == 1 and "o'lchov" in (await d.locator("[data-testid=job-title]").input_value()).lower())
        await d.screenshot(path=OUT + "stages_crm_job.png")
        await d.keyboard.press("Escape"); await d.wait_for_timeout(300)
        await d.screenshot(path=OUT + "stages_crm.png")
        # Buyurtma panelida UVONYX bosqichlari
        await nav(d, "Buyurtmalar"); await d.wait_for_timeout(800)
        await d.locator("tr.uvix-row", has_text="ON-261015-001").first.click(); await d.wait_for_timeout(800)
        opts = await d.evaluate("[...document.querySelectorAll('[data-testid=order-stage-select] option')].map(o=>o.value).join()")
        ok("buyurtma paneli: UVONYX bosqichlari (Material, O'rnatish)", opts == "new,design,material,printing,ready,install,delivered", opts)
        await d.screenshot(path=OUT + "stages_order.png")
        await b.close()
    api(f"/api/jobs/{m['id']}", {"status": "done"}, adm, method="PATCH")
    ok("montaj bajarildi → «Topshirildi», lid «Yopilgan»", stage(adm, "x1") == "delivered" and lead(adm, "l3")["stage"] == "won", (stage(adm, "x1"), lead(adm, "l3")["stage"]))
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
