"""產生空白文件 web/assets/blank/blank.docx／xlsx／pptx（用編輯器本身匯出，預設樣式與編輯器一致）。

python tools/make_blanks.py
"""
import base64
import http.server
import os
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import devserver  # noqa: E402

OUT = os.path.join(ROOT, "web", "assets", "blank")


def main():
    from playwright.sync_api import sync_playwright
    os.makedirs(OUT, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), devserver.H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:%d" % srv.server_address[1]
    with sync_playwright() as p:
        b = p.chromium.launch(channel="msedge")
        for ext in ("docx", "xlsx", "pptx"):
            page = b.new_page()
            page.goto(base + "/web/t_editor.html?t=%s&lang=zh-TW" % ext)
            page.wait_for_function("window.__ready === true", timeout=90000)
            page.wait_for_timeout(1500)
            b64 = page.evaluate("""async (fmt) => {
              const w = document.querySelector('iframe[name="frameEditor"]').contentWindow;
              window.__saved = null;
              w.Asc.editor.asc_DownloadAs(new w.Asc.asc_CDownloadOptions(w.Asc.c_oAscFileType[fmt]));
              for (let i = 0; i < 120 && !window.__saved; i++) await new Promise(r => setTimeout(r, 250));
              const u = new Uint8Array(window.__saved.buffer); let s = '';
              for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
              return btoa(s);
            }""", ext.upper())
            data = base64.b64decode(b64)
            with open(os.path.join(OUT, "blank." + ext), "wb") as f:
                f.write(data)
            print(ext, len(data))
            page.close()
        b.close()
    srv.shutdown()


if __name__ == "__main__":
    main()
