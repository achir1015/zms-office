"""格式測試：用 Edge（無頭）開 ONLYOFFICE 編輯器，開啟範例檔 → 匯出成各種格式 → 再開回來。

python tests/formats_test.py            # 全部
python tests/formats_test.py docx       # 只測一種來源
"""
import http.server
import json
import os
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tests", "out")
SAMPLES = os.path.join(ROOT, "tests", "samples")
sys.path.insert(0, os.path.join(ROOT, "tools"))
import devserver  # noqa: E402

TARGETS = {
    "word": ["DOCX", "ODT", "RTF", "TXT", "PDF", "PDFA", "DOCM", "DOTX", "OTT", "FB2", "EPUB", "HTML"],
    "cell": ["XLSX", "ODS", "CSV", "PDF", "XLSM", "XLTX", "OTS"],
    "slide": ["PPTX", "ODP", "PDF", "PPSX", "POTX", "OTP", "PPTM", "PNG", "JPG"],
}
KIND = {"docx": "word", "odt": "word", "rtf": "word", "txt": "word", "html": "word", "epub": "word", "doc": "word",
        "xlsx": "cell", "ods": "cell", "csv": "cell", "xls": "cell",
        "pptx": "slide", "odp": "slide", "ppt": "slide", "pdf": "pdf"}


def make_samples():
    os.makedirs(SAMPLES, exist_ok=True)
    import docx
    d = docx.Document()
    d.add_heading("資料助秘文件測試", 1)
    d.add_paragraph("臺灣繁體字：龜鑑灣麵、English 123。")
    t = d.add_table(rows=2, cols=2)
    t.cell(0, 0).text, t.cell(0, 1).text, t.cell(1, 0).text, t.cell(1, 1).text = "品名", "數量", "蘋果", "12"
    d.save(os.path.join(SAMPLES, "sample.docx"))
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "銷售"
    ws.append(["品名", "數量", "單價", "金額"])
    for i, (n, q, p) in enumerate([("蘋果", 12, 30), ("香蕉", 5, 20), ("芒果", 8, 45)], start=2):
        ws.append([n, q, p, "=B%d*C%d" % (i, i)])
    ws.append(["合計", "=SUM(B2:B4)", "", "=SUM(D2:D4)"])
    wb.save(os.path.join(SAMPLES, "sample.xlsx"))
    import pptx
    pr = pptx.Presentation()
    s = pr.slides.add_slide(pr.slide_layouts[1])
    s.shapes.title.text = "資料助秘簡報"
    s.placeholders[1].text = "第一點：免費使用\n第二點：相容 PowerPoint"
    pr.save(os.path.join(SAMPLES, "sample.pptx"))
    with open(os.path.join(SAMPLES, "sample.csv"), "w", encoding="utf-8-sig", newline="") as f:
        f.write("品名,數量\n蘋果,12\n香蕉,5\n")
    with open(os.path.join(SAMPLES, "sample.txt"), "w", encoding="utf-8") as f:
        f.write("純文字測試\n第二行：臺灣\n")
    with open(os.path.join(SAMPLES, "sample.html"), "w", encoding="utf-8") as f:
        f.write("<html><body><h1>網頁測試</h1><p>段落<b>粗體</b></p><table border=1><tr><td>甲</td><td>乙</td></tr></table></body></html>")


PAGE = "/web/t_editor.html?t=%s&f=%s"


def open_doc(page, base, ext, url):
    page.goto(base + PAGE % (ext, url))
    page.wait_for_function("window.__ready === true", timeout=90000)


def export(page, fmt):
    return page.evaluate("""async (fmt) => {
      const w = document.querySelector('iframe[name="frameEditor"]').contentWindow;
      const T = w.Asc.c_oAscFileType;
      if (T[fmt] === undefined) return {err: 'no code'};
      window.__saved = null;
      try { w.Asc.editor.asc_DownloadAs(new w.Asc.asc_CDownloadOptions(T[fmt])); } catch (e) { return {err: 'throw ' + e.message}; }
      for (let i = 0; i < 80 && !window.__saved; i++) {
        await new Promise(r => setTimeout(r, 250));
        const dlg = w.document.querySelector('.asc-window.modal:not(.hidden) .footer .btn.primary, .asc-window.modal:not(.hidden) .footer button');
        if (dlg && i > 4) dlg.click();
      }
      if (!window.__saved) return {err: 'timeout'};
      const b = new Uint8Array(window.__saved.buffer);
      let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      return {name: window.__saved.fileName, b64: btoa(s)};
    }""", fmt)


def main():
    import base64
    from playwright.sync_api import sync_playwright
    make_samples()
    os.makedirs(OUT, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), devserver.H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:%d" % srv.server_address[1]
    only = [a for a in sys.argv[1:] if not a.startswith("-")] or ["docx", "xlsx", "pptx", "csv", "txt", "html"]
    if "--only-fmt" in sys.argv:
        for k in TARGETS:
            TARGETS[k] = TARGETS[k][:1]
    report = {}
    with sync_playwright() as p:
        b = p.chromium.launch(channel="msedge")
        for src in only:
            page = b.new_page()
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)[:200]))
            page.on("console", lambda m: m.type == "error" and errs.append(m.text[:200]))
            t0 = time.time()
            try:
                open_doc(page, base, src, "/tests/samples/sample." + src)
            except Exception as e:
                report[src] = {"open": "FAIL %s %s" % (str(e)[:80], errs[:2])}
                print(src, json.dumps(report[src], ensure_ascii=False), flush=True)
                page.close()
                continue
            r = {"open": "ok %.1fs" % (time.time() - t0)}
            for fmt in TARGETS[KIND[src]]:
                page.close()
                page = b.new_page()
                page.on("console", lambda m: m.type == "error" and errs.append(m.text[:200]))
                open_doc(page, base, src, "/tests/samples/sample." + src)
                errs.clear()
                res = export(page, fmt)
                if res.get("err"):
                    res["err"] += " " + " | ".join(e for e in errs if "unload" not in e)[:160]
                if res.get("err"):
                    r[fmt] = res["err"]
                    continue
                data = base64.b64decode(res["b64"])
                fn = os.path.join(OUT, "%s_to.%s" % (src, res["name"].rsplit(".", 1)[-1]))
                with open(fn, "wb") as f:
                    f.write(data)
                r[fmt] = len(data)
            page.close()
            report[src] = r
            print(src, json.dumps(r, ensure_ascii=False), flush=True)
        # 匯出的檔案再開回來
        back = {}
        for fn in sorted(os.listdir(OUT)):
            ext = fn.rsplit(".", 1)[-1].lower()
            if ext not in KIND or ext == "pdf":
                if ext != "pdf":
                    continue
            page = b.new_page()
            try:
                open_doc(page, base, ext, "/tests/out/" + fn)
                back[fn] = "ok"
            except Exception as e:
                back[fn] = "FAIL " + str(e)[:60]
            page.close()
        print("reopen", json.dumps(back, ensure_ascii=False, indent=1))
        b.close()
    srv.shutdown()


if __name__ == "__main__":
    main()
