# 13-etap: Vazifalar ⚙️ — ko'rinishlarni yoqish/o'chirish, kartalar, ustunlar, «+ Ustun qo'shish», filtr, doska holati, «Hamma uchun», standartga qaytarish
import asyncio, datetime, json
from common import *  # noqa: F401,F403

IPH = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
TODAY = datetime.date.today().isoformat()

def get(tok): return api("/api/jobs", token=tok)
def job(tok, i): return [x for x in get(tok)["jobs"] if x["id"] == i][0]

async def main():
    adm = admin_token()
    el = json.loads(api("/api/kv/uvix:employees", token=adm)["value"])
    el += [{"id": "bekzod", "name": "Bekzod Tursunov", "role": "installer", "pin": "5555", "line": "UVONYX"}]
    api("/api/kv/uvix:employees", {"value": json.dumps(el)}, adm, method="PUT")
    j1 = api("/api/jobs", {"kind": "install", "title": "Oniks stol", "line": "UVONYX", "date": TODAY, "time": "23:40", "assigneeIds": ["bekzod"]}, adm)["job"]
    j2 = api("/api/jobs", {"kind": "measure", "title": "Yangi oniks murojaat", "line": "UVONYX", "date": TODAY, "time": "23:45", "assigneeIds": ["bekzod"]}, adm)["job"]
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1440, "height": 950}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        await nav(d, "Vazifalar"); await d.wait_for_timeout(1000)
        await d.locator("[data-testid=jobs-gear]").click(); await d.wait_for_timeout(400)
        st = d.locator("[data-testid=jobs-settings]")
        ok("⚙️ → «Bo'limni sozlash» paneli", await st.count() == 1)
        await st.locator("[data-toggle='views:board']").click(); await d.wait_for_timeout(300)
        ok("Doska o'chirildi → tugmasi ham yo'qoldi", await d.locator("[data-jobs-mode=board]").count() == 0 and await d.locator("[data-jobs-mode=brigade]").count() == 1)
        await st.locator("[data-card-toggle=tomorrow]").click(); await d.wait_for_timeout(300)
        ok("«Ertaga» kartasi o'chdi", await d.locator("[data-stat=tomorrow]").count() == 0 and await d.locator("[data-stat=today]").count() == 1)
        await d.wait_for_timeout(900)
        pr = get(adm)["prefs"]
        ok("sozlama serverda saqlandi (faqat menga)", pr and any(v["k"] == "board" and not v["on"] for v in pr["views"]) and any(c["k"] == "tomorrow" and not c["on"] for c in pr["cards"]), pr)

        # ---------- + Ustun qo'shish ----------
        await st.locator("[data-settings-tab=cols]").click(); await d.wait_for_timeout(200)
        await st.locator("[data-testid=field-add]").click(); await d.wait_for_timeout(300)
        fd = d.locator("[data-testid=field-dialog]")
        await fd.locator("[data-testid=field-name]").fill("Material")
        await d.screenshot(path=OUT + "jobs4_field.png")
        await fd.locator("[data-testid=field-save]").click(); await d.wait_for_timeout(900)
        cfg = get(adm)["config"]
        mat = [f for f in cfg["fields"] if f["name"] == "Material"]
        ok("yangi ustun: Material (matn, hamma vazifalarda)", len(mat) == 1 and mat[0]["type"] == "text" and mat[0]["kinds"] == [], cfg)
        mid = mat[0]["id"] if mat else "x"
        ok("ro'yxatda «Material ✦» ustuni", await d.locator(f"[data-col-head='f:{mid}']").count() == 1)
        # Tanlov turi, faqat montajda
        await st.locator("[data-testid=field-add]").click(); await d.wait_for_timeout(300)
        await fd.locator("[data-testid=field-name]").fill("Rang")
        await fd.locator("[data-field-type=select]").click()
        await fd.locator("[data-testid=field-options]").fill("Oq, Qora, Kulrang")
        await fd.locator("[data-field-kind=install]").click()
        await fd.locator("[data-testid=field-save]").click(); await d.wait_for_timeout(900)
        rang = [f for f in get(adm)["config"]["fields"] if f["name"] == "Rang"][0]
        ok("Tanlov ustuni: 3 variant, faqat Montaj", rang["type"] == "select" and rang["options"] == ["Oq", "Qora", "Kulrang"] and rang["kinds"] == ["install"], rang)
        # Doska holati
        await st.locator("[data-testid=stage-new]").fill("Mijoz tasdig'i"); await st.locator("[data-testid=stage-new]").press("Enter"); await d.wait_for_timeout(800)
        stg = get(adm)["config"]["stages"]
        ok("doska holati qo'shildi: «Mijoz tasdig'i»", len(stg) == 1 and stg[0]["name"] == "Mijoz tasdig'i", stg)
        # Holat ustunini yashirish
        await st.locator("[data-toggle='cols:status']").click(); await d.wait_for_timeout(300)
        ok("«Holat» ustuni yashirildi", await d.locator("[data-col-head=status]").count() == 0 and await d.locator("[data-col-head=when]").count() == 1)
        await st.screenshot(path=OUT + "jobs4_settings_cols.png")
        # Filtrlar: Rang bo'yicha
        await st.locator("[data-settings-tab=filters]").click(); await d.wait_for_timeout(200)
        await st.locator(f"[data-toggle='filters:f:{rang['id']}']").click(); await d.wait_for_timeout(300)
        ok("filtr paneliga «Rang» qo'shildi", await d.locator(f"[data-cf-filter='{rang['id']}']").count() == 1)
        await d.locator("[data-testid=settings-close]").click(); await d.wait_for_timeout(300)

        # ---------- Katakni bosib to'ldirish ----------
        await d.locator(f"[data-cf='{mid}'][data-cf-job='{j1['id']}']").click(); await d.wait_for_timeout(200)
        await d.locator(f"[data-cf-input='{mid}']").fill("Oniks 18 mm"); await d.locator(f"[data-cf-input='{mid}']").press("Enter"); await d.wait_for_timeout(1000)
        ok("katak to'ldirildi → serverda", job(adm, j1["id"]).get("custom", {}).get(mid) == "Oniks 18 mm")
        await d.locator(f"[data-cf='{rang['id']}'][data-cf-job='{j1['id']}']").click(); await d.wait_for_timeout(200)
        await d.locator(f"[data-cf-input='{rang['id']}']").select_option("Qora"); await d.wait_for_timeout(1000)
        ok("Tanlov katagi: Qora", job(adm, j1["id"]).get("custom", {}).get(rang["id"]) == "Qora")
        ok("O'lchovda «Rang» katagi yo'q (faqat montaj)", await d.locator(f"[data-cf='{rang['id']}'][data-cf-job='{j2['id']}']").count() == 0)
        await d.locator(f"[data-cf-filter='{rang['id']}']").select_option("Qora"); await d.wait_for_timeout(300)
        ok("filtr «Rang: Qora» → faqat montaj", await d.locator(f"[data-job='{j1['id']}']").count() == 1 and await d.locator(f"[data-job='{j2['id']}']").count() == 0)
        await d.locator(f"[data-cf-filter='{rang['id']}']").select_option(""); await d.wait_for_timeout(300)
        await d.screenshot(path=OUT + "jobs4_list_cols.png")
        # Server: noto'g'ri qiymat qabul qilinmaydi
        api(f"/api/jobs/{j1['id']}", {"custom": {rang["id"]: "Yashil"}}, adm, method="PATCH")
        ok("server: variantda yo'q qiymat rad etiladi", job(adm, j1["id"])["custom"][rang["id"]] == "Qora")
        # Panelda ham ✦ maydon
        await d.locator(f"[data-job='{j1['id']}']").click(); await d.wait_for_timeout(500)
        dr = d.locator("[data-testid=job-drawer]")
        ok("panelda: Material ✦ va Rang ✦", "Oniks 18 mm" in await dr.inner_text() and "Rang" in await dr.inner_text())
        await dr.locator(f"[data-drawer-stage='{stg[0]['id']}']").click(); await d.wait_for_timeout(900)
        jj = job(adm, j1["id"])
        ok("panel: «Mijoz tasdig'i» holati → doing + stage", jj["status"] == "doing" and jj.get("stage") == stg[0]["id"], jj)
        await d.locator("[data-testid=drawer-close]").click(); await d.wait_for_timeout(300)
        # Doskani qayta yoqib, holat ustunini ko'rish
        await d.locator("[data-testid=jobs-gear]").click(); await d.wait_for_timeout(300)
        await st.locator("[data-toggle='views:board']").click(); await d.wait_for_timeout(300)
        await d.locator("[data-testid=settings-close]").click()
        await d.locator("[data-jobs-mode=board]").click(); await d.wait_for_timeout(500)
        ok("doskada «Mijoz tasdig'i» ustuni va karta", await d.locator(f"[data-board-col='st:{stg[0]['id']}'] [data-board-card='{j1['id']}']").count() == 1)
        await d.screenshot(path=OUT + "jobs4_board_stage.png")
        await d.locator(f"[data-board-card='{j1['id']}']").drag_to(d.locator("[data-board-col=doing]")); await d.wait_for_timeout(1000)
        ok("«Jarayonda»ga sudrash → holat olib tashlandi", job(adm, j1["id"]).get("stage") is None)

        # ---------- Ustunni o'chirish — ma'lumot qoladi ----------
        await d.locator("[data-jobs-mode=list]").click(); await d.wait_for_timeout(300)
        await d.locator("[data-testid=jobs-gear]").click(); await d.wait_for_timeout(300)
        await st.locator("[data-settings-tab=cols]").click()
        await st.locator(f"[data-field-archive='{mid}']").click(); await d.wait_for_timeout(800)
        ok("ustun yashirildi, qiymat saqlangan", await d.locator(f"[data-col-head='f:{mid}']").count() == 0 and job(adm, j1["id"])["custom"].get(mid) == "Oniks 18 mm")
        # ---------- Hamma uchun ----------
        await st.locator("[data-scope=all]").click(); await d.wait_for_timeout(200)
        await st.locator("[data-settings-tab=view]").click()
        await st.locator("[data-toggle=compact]").click(); await d.wait_for_timeout(1300)
        r = get(adm)
        ok("«Hamma uchun» → standart ko'rinish serverda (ixcham)", r["config"]["defaults"] and r["config"]["defaults"]["compact"] is True and r["prefs"] is None, (r["config"]["defaults"], r["prefs"]))
        az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
        ra = get(az)
        ok("boshqa xodimga ham shu standart keladi", ra["prefs"] is None and ra["config"]["defaults"]["compact"] is True and ra["canConfig"] is False)
        r2 = api("/api/jobs/config", {"fields": []}, az, method="PUT")
        ok("operator ustunlarni o'zgartira olmaydi", r2.get("_code") == 403, r2)
        await st.locator("[data-testid=prefs-reset]").click(); await d.wait_for_timeout(900)
        ok("«Standartga qaytarish» → hamma uchun sozlama tozalandi", get(adm)["config"]["defaults"] is None)
        await d.locator("[data-testid=settings-close]").click()

        # ---------- Telefon: ishchi varag'ida ✦ maydon, ⚙️ sodda ----------
        w = await (await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=IPH, device_scale_factor=2, timezone_id="Asia/Tashkent")).new_page(); w.on("pageerror", lambda e: errs.append("W:" + str(e)))
        await mob_login(w, "Bekzod", "5555"); await w.wait_for_selector(".uvix-worker-nav", timeout=15000); await w.wait_for_timeout(2000)
        await w.locator(f"[data-myjob='{j1['id']}']").first.click(); await w.wait_for_timeout(500)
        sh = w.locator("[data-testid=job-drawer]")
        ok("ishchi varag'ida «Rang ✦» maydoni", "Rang" in await sh.inner_text() and "Qora" in await sh.inner_text())
        await w.screenshot(path=OUT + "jobs4_worker_sheet.png")
        m = await (await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=IPH, device_scale_factor=2, timezone_id="Asia/Tashkent")).new_page(); m.on("pageerror", lambda e: errs.append("M:" + str(e)))
        await mob_login(m, "Administrator", "0000"); await m.wait_for_timeout(2500)
        await m.locator(".uvix-bottomnav [data-tab=__more]").click(); await m.wait_for_timeout(500)
        await m.locator("[data-tile=jobs]").click(); await m.wait_for_timeout(1500)
        await m.locator("[data-testid=jobs-gear]").click(); await m.wait_for_timeout(400)
        ms = m.locator("[data-testid=jobs-settings]")
        ok("telefon ⚙️: sodda — ko'rinishlar + 2 tugma, ustun qo'shish yo'q", await ms.locator("[role=switch]").count() == 6 and await ms.locator("[data-testid=field-add]").count() == 0 and "kompyuterda" in await ms.inner_text())
        await m.screenshot(path=OUT + "jobs4_phone_gear.png")
        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
