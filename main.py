"""資料助秘文件office彙整 — 程式進入點。

桌面版：python main.py（開一個視窗；關閉視窗時資料庫一起停止）
網頁測試：python main.py --web 8730（只開本機伺服器，用瀏覽器開 http://127.0.0.1:8730/?k=dev）
用檔案開啟：python main.py 報告.docx（安裝版的檔案關聯會這樣呼叫）
MCP 伺服器：python main.py --mcp（給 Claude Desktop 等 AI 工具用；安裝版是 ZMSOfficeMCP.exe）
"""
import os
import sys
import threading

if not os.environ.get("SSL_CERT_FILE"):
    try:
        import certifi
        os.environ["SSL_CERT_FILE"] = certifi.where()
    except Exception:
        pass

DOC_TYPES = ("Office 文件 (*.docx;*.doc;*.docm;*.dotx;*.odt;*.ott;*.rtf;*.txt;*.html;*.htm;*.epub;*.xlsx;*.xls;*.xlsm;"
             "*.xltx;*.ods;*.ots;*.csv;*.pptx;*.ppt;*.pptm;*.ppsx;*.potx;*.odp;*.otp;*.pdf;*.xps;*.djvu;*.ofd)",
             "Word 文件 (*.docx;*.doc;*.docm;*.dotx;*.odt;*.ott;*.rtf;*.txt;*.html;*.htm;*.epub)",
             "Excel 試算表 (*.xlsx;*.xls;*.xlsm;*.xltx;*.ods;*.ots;*.csv)",
             "PowerPoint 簡報 (*.pptx;*.ppt;*.pptm;*.ppsx;*.potx;*.odp;*.otp)",
             "PDF (*.pdf;*.xps;*.djvu;*.ofd)", "所有檔案 (*.*)")


def _log_to_file():
    """打包版沒有主控台：錯誤寫到資料夾裡的 app.log。"""
    if getattr(sys, "frozen", False):
        from zo.settings import data_dir
        f = open(os.path.join(data_dir(), "app.log"), "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr = f


def _startup_files():
    return [os.path.abspath(a) for a in sys.argv[1:] if not a.startswith("-") and os.path.isfile(a)]


class NativeApi:
    """給畫面呼叫的電腦功能（選檔、選資料夾、存檔位置、在檔案總管顯示、開網頁）。"""

    def __init__(self):
        self._window = None

    def pick_files(self, kind="docs", multiple=True):
        import webview
        types = {"docs": DOC_TYPES, "backup": ("資料庫備份 (*.sql.gz;*.sql)", "所有檔案 (*.*)"),
                 "script": ("Apps Script／巨集 (*.gs;*.js;*.txt)", "所有檔案 (*.*)"),
                 "image": ("圖片 (*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.webp;*.svg)", "所有檔案 (*.*)")}.get(kind, ("所有檔案 (*.*)",))
        r = self._window.create_file_dialog(webview.FileDialog.OPEN, allow_multiple=bool(multiple), file_types=types)
        return list(r or [])

    def pick_folder(self, start=""):
        import webview
        r = self._window.create_file_dialog(webview.FileDialog.FOLDER, directory=start or "")
        return r[0] if r else ""

    def save_dialog(self, filename, ext):
        """另存到電腦：回傳使用者選的完整路徑（取消回傳空字串）。"""
        import webview
        ext = (ext or "").lower().lstrip(".")
        r = self._window.create_file_dialog(webview.FileDialog.SAVE, save_filename=filename,
                                           file_types=("%s 檔案 (*.%s)" % (ext.upper(), ext), "所有檔案 (*.*)"))
        if not r:
            return ""
        p = r if isinstance(r, str) else r[0]
        if not p.lower().endswith("." + ext):
            p += "." + ext
        return p

    def startup_files(self):
        return _startup_files()

    def reveal(self, path):
        import subprocess
        if os.name == "nt":
            if os.path.isfile(path):
                subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])
            else:
                os.startfile(path)
        elif os.path.isfile(path):
            subprocess.Popen(["open", "-R", path])
        else:
            subprocess.Popen(["open", path])
        return True

    def open_file(self, path):
        """用電腦預設程式開（例如 Microsoft Word）。"""
        if os.name == "nt":
            os.startfile(path)
        else:
            import subprocess
            subprocess.Popen(["open", path])
        return True

    def open_url(self, url):
        import webbrowser
        if url.startswith(("https://", "http://")):
            webbrowser.open(url)
        return True

    def toggle_fullscreen(self):
        self._window.toggle_fullscreen()
        return True


def run_web(port):
    os.environ.setdefault("ZO_KEY", "dev")
    from zo import server
    server.KEY = os.environ["ZO_KEY"]
    threading.Thread(target=server.start_database, daemon=True).start()
    srv = server.serve(port)
    print("http://127.0.0.1:%d/?k=%s" % (srv.server_address[1], server.KEY), flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        server.stop_database()


def run_desktop():
    from zo import APP_NAME, single
    if not single.acquire():
        files = _startup_files()
        if files:                                   # 程式已經開著：把要開的檔案交給它（主畫面每 2 秒檢查一次）
            from zo.settings import data_dir
            import json
            q = os.path.join(data_dir(), "open-queue.json")
            try:
                old = json.load(open(q, encoding="utf-8")) if os.path.isfile(q) else []
            except ValueError:
                old = []
            json.dump(old + files, open(q, "w", encoding="utf-8"), ensure_ascii=False)
        single.activate_existing()
        sys.exit(0)
    _log_to_file()
    if getattr(sys, "frozen", False) and os.name == "nt":
        try:
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ZMS.Office")
        except Exception:
            pass
    import webview
    from zo import server
    threading.Thread(target=server.start_database, daemon=True).start()
    srv = server.serve(0)
    url = "http://127.0.0.1:%d/?k=%s" % (srv.server_address[1], server.KEY)
    api = NativeApi()
    win = webview.create_window(APP_NAME, url, js_api=api, width=1400, height=880, min_size=(1000, 640),
                                background_color="#f3f3f3", maximized=True)
    api._window = win
    server.STATE["native"] = api
    server.STATE["quit"] = lambda: win.destroy()

    def on_closed():
        srv.shutdown()
        server.stop_database()

    win.events.closed += on_closed
    from zo.settings import data_dir
    webview.start(gui="edgechromium" if os.name == "nt" else None, private_mode=False,
                  storage_path=os.path.join(data_dir(), "webview"), debug=bool(os.environ.get("ZO_DEBUG")))
    server.stop_database()
    os._exit(0)


if __name__ == "__main__":
    if "--mcp" in sys.argv:
        from zo import mcp_server
        mcp_server.run()
    elif "--web" in sys.argv:
        i = sys.argv.index("--web")
        run_web(int(sys.argv[i + 1]) if len(sys.argv) > i + 1 and sys.argv[i + 1].isdigit() else 8730)
    else:
        run_desktop()
