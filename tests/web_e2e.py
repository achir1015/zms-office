"""線上版（docs/，純前端＋IndexedDB）端對端測試：新增 → 編輯 → 儲存 → 重新整理 → 內容還在；上傳 CSV；流程圖。

python tests/web_e2e.py [--webkit] [--phone]
"""
import http.server
import json
import os
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")


class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm", ".js": "text/javascript",
                      ".mjs": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json"}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DOCS, **kw)

    def log_message(self, *a):
        pass


WAIT_TAB = """async (id) => {
  for (let i = 0; i < 240; i++) {
    await new Promise(r => setTimeout(r, 250));
    const f = document.querySelector('.view.doc[data-tab="' + id + '"] iframe');
    const w = f && f.contentWindow;
    if (w && w.ZOE && (w.ZOE.ready || (w.ZOE.kind === 'diagram' && w.ZOE.info))) return true;
  }
  return false;
}"""


def main():
    from playwright.sync_api import sync_playwright
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:%d/" % srv.server_address[1]
    res = {}
    with sync_playwright() as p:
        b = p.webkit.launch() if "--webkit" in sys.argv else p.chromium.launch(channel="msedge")
        ctx = b.new_context(**(p.devices["iPhone 15 Pro Max"] if "--phone" in sys.argv else {"viewport": {"width": 1400, "height": 900}}))
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:160]))
        page.goto(base)
        page.wait_for_function("window.ZO && ZO.S && ZO.S.user", timeout=30000)
        print('pref:', page.evaluate("async () => { try { return JSON.stringify(await ZO.api('pref', {guideSeen: true})); } catch (e) { return 'ERR ' + String(e) + ' ' + (e && e.stack); } }"))
        for kind, code in (("word", "var p=Api.CreateParagraph(); p.AddText('線上版測試文字'); Api.GetDocument().Push(p);"),
                           ("cell", "Api.GetActiveSheet().GetRange('A1').SetValue('線上版'); Api.GetActiveSheet().GetRange('B1').SetValue(42);"),
                           ("slide", "var s=Api.CreateSlide(); Api.GetPresentation().AddSlide(s);")):
            d = page.evaluate("(k) => ZO.api('doc_new', {kind: k, name: 'web-' + k})", kind)
            page.evaluate("(d) => ZO.openDoc(d)", d)
            ok = page.evaluate(WAIT_TAB, str(d["id"]))
            if not ok:
                res[kind] = "open FAIL"
                continue
            page.wait_for_timeout(1200)
            r = page.evaluate("""async ([id, code]) => {
              const w = document.querySelector('.view.doc[data-tab="' + id + '"] iframe').contentWindow;
              w.ZOE.runBuilder(code);
              await w.ZOE.save();
              const info = await ZO.get('doc_info', {id});
              await ZO.closeTab(String(id));
              return {size: info.size, version: info.version};
            }""", [d["id"], code])
            res[kind] = r
        # 重新整理後再開，內容還在
        page.reload()
        page.wait_for_function("window.ZO && ZO.S && ZO.S.user", timeout=30000)
        docs = page.evaluate("ZO.get('docs', {view: 'recent'})")
        w = next(x for x in docs if x["name"] == "web-word")
        page.evaluate("(d) => ZO.openDoc(d)", w)
        page.evaluate(WAIT_TAB, str(w["id"]))
        page.wait_for_timeout(1500)
        res["word_reload_text"] = page.evaluate("(id) => document.querySelector('.view.doc[data-tab=\"' + id + '\"] iframe').contentWindow.ZOE.allText().slice(0, 40)", str(w["id"]))
        page.evaluate("(id) => ZO.closeTab(String(id))", w["id"])
        # 上傳 CSV
        d = page.evaluate("async () => { const f = new File([new TextEncoder().encode('品名,數量\\n蘋果,12\\n')], 'web.csv'); return ZO.upload(f, ''); }")
        page.evaluate("(d) => ZO.openDoc(d)", d)
        res["csv_open"] = page.evaluate(WAIT_TAB, str(d["id"]))
        page.wait_for_timeout(1200)
        res["csv_text"] = page.evaluate("(id) => document.querySelector('.view.doc[data-tab=\"' + id + '\"] iframe').contentWindow.ZOE.allText()", str(d["id"]))
        # 流程圖
        d = page.evaluate("ZO.api('doc_new', {kind: 'diagram', name: 'web-diagram'})")
        page.evaluate("(d) => ZO.openDoc(d)", d)
        page.wait_for_timeout(9000)
        res["diagram_loaded"] = page.evaluate("(id) => { const f = document.querySelector('.view.doc[data-tab=\"' + id + '\"] iframe'); return !!f.contentWindow.document.getElementById('dio').contentWindow.__zoUi; }", str(d["id"]))
        res["versions_word"] = len(page.evaluate("(id) => ZO.get('versions', {id})", w["id"]))
        res["errors"] = errs[:5]
        b.close()
    srv.shutdown()
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
