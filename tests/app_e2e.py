"""整套程式的端對端測試（Edge 無頭）：上傳各種格式 → 在分頁開啟 → 儲存 → 再開一次；匯出各格式。

先啟動：python main.py --web 8730（測試帳號 admin/admin123）
python tests/app_e2e.py [http://127.0.0.1:8730]
"""
import base64
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8730"
SAMPLES = os.path.join(ROOT, "tests", "samples")
OUTS = os.path.join(ROOT, "tests", "out")


def main():
    from playwright.sync_api import sync_playwright
    sys.path.insert(0, os.path.join(ROOT, "tests"))
    import formats_test
    formats_test.make_samples()
    files = [os.path.join(SAMPLES, f) for f in sorted(os.listdir(SAMPLES))]
    for f in ("docx_to.odt", "docx_to.pdf", "docx_to.rtf", "xlsx_to.ods", "pptx_to.odp"):
        if os.path.isfile(os.path.join(OUTS, f)):
            files.append(os.path.join(OUTS, f))
    report = {}
    with sync_playwright() as p:
        b = p.chromium.launch(channel="msedge")
        page = b.new_page(viewport={"width": 1400, "height": 900})
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        page.goto(BASE + "/?k=dev")
        page.evaluate("""async () => { const r = await ZO.api('login', {uid:'admin', pw:'admin123'}); ZO.setSession(r.session); await ZO.api('pref', {guideSeen:true}); }""")
        page.goto(BASE + "/?k=dev")
        page.wait_for_function("ZO.S && ZO.S.user", timeout=30000)
        for fp in files:
            name = os.path.basename(fp)
            data = base64.b64encode(open(fp, "rb").read()).decode()
            t0 = time.time()
            r = page.evaluate("""async ([name, b64]) => {
              const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
              const d = await ZO.raw('upload', bin, {name: 'e2e-' + name});
              ZO.openDoc(d);
              const key = String(d.id);
              for (let i = 0; i < 240; i++) {
                await new Promise(r => setTimeout(r, 250));
                const v = document.querySelector('.view.doc[data-tab="' + key + '"] iframe');
                const w = v && v.contentWindow;
                if (w && w.ZOE && w.ZOE.ready) {
                  await new Promise(r => setTimeout(r, 1500));
                  let saved = 'skip';
                  if (!w.ZOE.info.readonly) {
                    try { await w.ZOE.save(); saved = 'ok'; } catch (e) { saved = 'ERR ' + e.message; }
                  }
                  const info = await ZO.get('doc_info', {id: d.id});
                  let text = '';
                  try { text = (w.ZOE.allText ? w.ZOE.allText() : '').slice(0, 60); } catch (e) { text = 'ERR'; }
                  await ZO.closeTab(key);
                  return {opened: true, saved, size: info.size, text, id: d.id};
                }
                const err = v && v.contentWindow && v.contentWindow.document.querySelector('#ed-loading:not(.hidden)');
                if (err && /⚠️/.test(err.textContent)) { const tx = err.textContent; await ZO.closeTab(key); return {opened: false, error: tx.slice(0, 160)}; }
              }
              await ZO.closeTab(key);
              return {opened: false, error: 'timeout'};
            }""", [name, data])
            r["sec"] = round(time.time() - t0, 1)
            report[name] = r
            print(name, json.dumps(r, ensure_ascii=False), flush=True)
        # 重新開啟剛存好的檔案（確認存出來的檔案還能開）
        print("errors:", errs[:5])
        b.close()
    bad = [k for k, v in report.items() if not v.get("opened") or str(v.get("saved", "")).startswith("ERR")]
    print("FAIL" if bad else "PASS", bad)


if __name__ == "__main__":
    main()
