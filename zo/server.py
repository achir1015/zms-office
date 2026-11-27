"""本機網頁伺服器：程式畫面（web/）、ONLYOFFICE 編輯器（vendor/）、JSON API、文件檔案。

只聽 127.0.0.1；每次開程式產生一組金鑰（KEY），API 要帶（網址 ?k= 或標頭 X-Key），
避免電腦上其他網頁偷連。登入後另有工作階段代號（X-Session／?s=）。
"""
import json
import mimetypes
import os
import secrets
import threading
import traceback
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import APP_NAME, APP_VERSION, CREDIT, ai, maintenance
from .core import BizError
from .library import Library
from .seed import EXT_KIND, FUNCS, KINDS, ROLES
from .settings import program_dir, resource_dir

KEY = os.environ.get("ZO_KEY") or secrets.token_urlsafe(18)
WEB = os.path.join(resource_dir(), "web")
# 編輯器元件很大，安裝版放在程式旁的 vendor（不包進 PyInstaller）；開發時在專案的 vendor
VENDOR = next((d for d in (os.path.join(program_dir(), "vendor"),                          # Windows 安裝版
                            os.path.normpath(os.path.join(program_dir(), "..", "Resources", "vendor")),  # macOS .app
                            os.path.join(resource_dir(), "vendor"))
               if os.path.isdir(d)), os.path.join(resource_dir(), "vendor"))
STATE = {"db": None, "st": None, "ready": False, "error": "", "native": None}
SESSIONS = {}
for ext, t in ((".js", "text/javascript"), (".mjs", "text/javascript"), (".css", "text/css"),
               (".json", "application/json"), (".wasm", "application/wasm"), (".br", "application/wasm"),
               (".svg", "image/svg+xml"), (".woff2", "font/woff2"), (".mp3", "audio/mpeg"), (".m4a", "audio/mp4")):
    mimetypes.add_type(t, ext)


class ApiError(Exception):
    def __init__(self, msg, code=400):
        super().__init__(msg)
        self.code = code


def _sess(h, q):
    sid = h.headers.get("X-Session") or q.get("s", "")
    a = SESSIONS.get(sid)
    if not a or not a.user:
        raise ApiError("請先登入", 401)
    return a


def _need_ready():
    if not STATE["ready"]:
        raise ApiError(STATE["error"] or "資料庫啟動中，請稍候…", 503)


# ==================================================================== 帳號
def api_state(h, q, body):
    a = SESSIONS.get(h.headers.get("X-Session") or "")
    out = dict(ready=STATE["ready"], error=STATE["error"], app=APP_NAME, version=APP_VERSION, credit=CREDIT,
               native=bool(STATE["native"]), funcs=[dict(id=f[0], name=f[1], desc=f[2]) for f in FUNCS],
               roles=ROLES, kinds={k: v[1] for k, v in KINDS.items()})
    if STATE["ready"]:
        b = Library(STATE["db"])
        out["has_users"] = b.has_users()
        out["company"] = b.company().get("name", "")
    if a and a.user:
        out["user"] = dict(uid=a.uid, name=a.user["name"], is_admin=bool(a.user["is_admin"]),
                           perms={f[0]: a.level(f[0]) for f in FUNCS}, pref=a.pref())
    return out


def api_setup(h, q, body):
    _need_ready()
    Library(STATE["db"]).create_first_admin(body.get("uid"), body.get("name"), body.get("pw"))
    return api_login(h, q, body)


def api_login(h, q, body):
    _need_ready()
    a = Library(STATE["db"])
    a.login(body.get("uid"), body.get("pw"))
    sid = secrets.token_urlsafe(18)
    SESSIONS[sid] = a
    st = STATE["st"]
    if st:
        st.last_user = a.uid
        st.save()
    return dict(session=sid, uid=a.uid, name=a.user["name"])


def api_logout(h, q, body):
    a = SESSIONS.pop(h.headers.get("X-Session") or "", None)
    if a:
        a.logout()
    return {}


def api_last_user(h, q, body):
    return dict(uid=(STATE["st"].last_user if STATE["st"] else ""))


def api_password(h, q, body):
    _sess(h, q).change_password(body.get("old"), body.get("new"))
    return {}


def api_users(h, q, body):
    a = _sess(h, q)
    a.need("SYS", 1)
    rows = a.users()
    for r in rows:
        r["last_login"] = r["last_login"].strftime("%Y-%m-%d %H:%M") if r["last_login"] else ""
    return rows


def api_user_save(h, q, body):
    _sess(h, q).save_user(body.get("uid"), body.get("name"), body.get("role", ""), body.get("is_admin"),
                          body.get("active", 1), body.get("perms") or {}, pw=body.get("pw") or None,
                          is_new=body.get("is_new"), dept=body.get("dept", ""))
    return {}


def api_user_delete(h, q, body):
    _sess(h, q).delete_user(body.get("uid"))
    return {}


def api_audit(h, q, body):
    a = _sess(h, q)
    a.need("SYS", 1)
    rows = a.audit(300)
    for r in rows:
        r["at"] = r["at"].strftime("%Y-%m-%d %H:%M:%S")
    return rows


def api_company(h, q, body):
    a = _sess(h, q)
    if body:
        a.save_company(body.get("name"), body.get("out_dir"))
    c = a.company()
    return dict(name=c.get("name", ""), out_dir=c.get("out_dir", ""), root=a.root())


def api_pref(h, q, body):
    a = _sess(h, q)
    return a.save_pref(body) if body else a.pref()


# ==================================================================== 文件庫
def api_docs(h, q, body):
    return _sess(h, q).docs(q.get("view") or "recent", q.get("folder") or None, q.get("q") or "", q.get("kind") or "")


def api_folders(h, q, body):
    return _sess(h, q).folder_tree()


def api_folder_new(h, q, body):
    return dict(id=_sess(h, q).folder_create(body.get("name"), body.get("parent") or None))


def api_folder_rename(h, q, body):
    _sess(h, q).folder_rename(int(body["id"]), body.get("name"))
    return {}


def api_folder_share(h, q, body):
    _sess(h, q).folder_share(int(body["id"]), body.get("shared"))
    return {}


def api_folder_delete(h, q, body):
    _sess(h, q).folder_delete(int(body["id"]))
    return {}


def api_doc_new(h, q, body):
    return _sess(h, q).create(body.get("kind"), body.get("name") or "", body.get("folder") or None,
                              body.get("template") or None)


def api_doc_info(h, q, body):
    info, _ = _sess(h, q).open_info(int(q.get("id") or body.get("id")))
    return info


def api_import_paths(h, q, body):
    a = _sess(h, q)
    out, errors = [], []
    for p in body.get("paths") or []:
        try:
            out.append(a.import_file(p, body.get("folder") or None, link=bool(body.get("link"))))
        except BizError as e:
            errors.append(str(e))
    return dict(items=out, errors=errors)


def api_upload(h, q, data):
    """拖曳進來的檔案：原始位元組上傳到文件庫。"""
    a = _sess(h, q)
    name = os.path.basename(q.get("name") or "file")
    import tempfile
    d = tempfile.mkdtemp(prefix="zo-up-")
    try:
        p = os.path.join(d, name)
        with open(p, "wb") as f:
            f.write(data)
        return a.import_file(p, q.get("folder") or None, name=name)
    finally:
        import shutil
        shutil.rmtree(d, ignore_errors=True)


def api_save(h, q, data):
    return _sess(h, q).save(int(q["id"]), data)


def api_save_as(h, q, data):
    a = _sess(h, q)
    return a.save_as(int(q["id"]) if q.get("id") else None, data, q.get("name") or "未命名", q.get("ext"),
                     q.get("folder") or None)


def api_export_to(h, q, data):
    """另存到電腦（原生存檔對話框選好的路徑）。"""
    a = _sess(h, q)
    path = q.get("path") or ""
    if not path or not os.path.isdir(os.path.dirname(path)):
        raise BizError("請選擇存檔位置")
    return dict(path=a.export_copy(data, path))


def api_to_flipbook(h, q, data):
    """匯出到「資料助秘電子書翻頁」：PDF 放進翻頁工具的收件匣（inbox），有安裝就開啟它並帶 --import。

    交接約定（翻頁工具那邊讀取）：<翻頁資料夾>/inbox/<檔名>.pdf ＋ 同名 .json {title, source, created}
    Windows 翻頁資料夾＝%LOCALAPPDATA%\\ZMSFlipbook；macOS＝~/Library/Application Support/ZMSFlipbook。
    """
    import datetime
    import subprocess
    import sys as _sys
    a = _sess(h, q)
    if not data:
        raise BizError("沒有內容")
    if os.name == "nt":
        base = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "ZMSFlipbook")
        exes = [os.path.join(os.environ.get("LOCALAPPDATA") or "", "Programs", "ZMSFlipbook", "ZMSFlipbook.exe"),
                os.path.join(os.environ.get("ProgramFiles") or r"C:\Program Files", "ZMSFlipbook", "ZMSFlipbook.exe")]
    else:
        base = os.path.expanduser("~/Library/Application Support/ZMSFlipbook")
        exes = ["/Applications/ZMSFlipbook.app", os.path.expanduser("~/Applications/ZMSFlipbook.app")]
    inbox = os.path.join(base, "inbox")
    os.makedirs(inbox, exist_ok=True)
    from .library import clean_name
    name = clean_name(q.get("name") or "文件")
    path, i = os.path.join(inbox, name + ".pdf"), 1
    while os.path.exists(path):
        i += 1
        path = os.path.join(inbox, "%s (%d).pdf" % (name, i))
    with open(path, "wb") as f:
        f.write(data)
    with open(path[:-4] + ".json", "w", encoding="utf-8") as f:
        json.dump({"title": name, "source": "ZMSOffice", "user": a.uid,
                   "created": datetime.datetime.now().isoformat(timespec="seconds")}, f, ensure_ascii=False)
    exe = next((e for e in exes if os.path.exists(e)), "")
    launched = False
    if exe:
        try:
            if os.name == "nt":
                subprocess.Popen([exe, "--import", path], creationflags=0x00000008)
            else:
                subprocess.Popen(["open", "-a", exe, "--args", "--import", path])
            launched = True
        except OSError:
            launched = False
    a.log("to_flipbook", "", path)
    _ = _sys
    return dict(path=path, installed=bool(exe), launched=launched)


def api_heartbeat(h, q, body):
    return dict(ok=_sess(h, q).heartbeat(int(body["id"]), body.get("editing", True)))


def api_doc_rename(h, q, body):
    _sess(h, q).rename(int(body["id"]), body.get("name"))
    return {}


def api_doc_move(h, q, body):
    _sess(h, q).move(int(body["id"]), body.get("folder") or None)
    return {}


def api_doc_copy(h, q, body):
    return _sess(h, q).copy(int(body["id"]), body.get("folder"))


def api_doc_flag(h, q, body):
    _sess(h, q).set_flag(int(body["id"]), body.get("flag"), body.get("value"))
    return {}


def api_doc_trash(h, q, body):
    _sess(h, q).trash(int(body["id"]), restore=bool(body.get("restore")))
    return {}


def api_doc_purge(h, q, body):
    _sess(h, q).purge(int(body["id"]))
    return {}


def api_recent_forget(h, q, body):
    _sess(h, q).forget_recent(int(body["id"]))
    return {}


def api_versions(h, q, body):
    return _sess(h, q).versions(int(q.get("id") or body.get("id")))


def api_version_restore(h, q, body):
    return _sess(h, q).version_restore(int(body["id"]), int(body["vid"]))


def api_reveal(h, q, body):
    a = _sess(h, q)
    d = a.doc(int(body["id"]))
    if STATE["native"]:
        STATE["native"].reveal(a.abspath(d))
    return dict(path=a.abspath(d))


def api_templates(h, q, body):
    """內建範本清單（web/assets/templates/templates.json）＋公司範本。"""
    a = _sess(h, q)
    try:
        with open(os.path.join(WEB, "assets", "templates", "templates.json"), encoding="utf-8") as f:
            builtin = json.load(f)
    except OSError:
        builtin = []
    return dict(builtin=builtin, company=a.docs("templates"))


# ==================================================================== 巨集／Apps Script
def api_scripts(h, q, body):
    return _sess(h, q).scripts(q.get("kind") or "", q.get("doc") or None)


def api_script_save(h, q, body):
    return dict(id=_sess(h, q).script_save(body.get("id"), body.get("name"), body.get("code"), body.get("lang", "gas"),
                                           body.get("kind", "any"), body.get("doc_id"), body.get("shared", 0),
                                           body.get("shortcut", "")))


def api_script_delete(h, q, body):
    _sess(h, q).script_delete(int(body["id"]))
    return {}


# ==================================================================== AI
def api_ai_config(h, q, body):
    """讀取（金鑰只顯示末四碼）或儲存 AI 服務設定。"""
    a = _sess(h, q)
    if body:
        a.need("AI", 2)
        cfg = ai.merge_config(a.meta("ai", {}), body)
        a.set_meta("ai", cfg)
        a.log("ai_config", "", ",".join(sorted(cfg.get("providers", {}))))
    return ai.public_config(a.meta("ai", {}))


def api_ai_chat(h, q, body):
    a = _sess(h, q)
    a.need("AI", 1)
    return ai.chat(a.meta("ai", {}), body.get("provider"), body.get("model"), body.get("messages") or [],
                   body.get("system") or "", float(body.get("temperature") or 0.4))


def api_ai_test(h, q, body):
    a = _sess(h, q)
    a.need("AI", 2)
    return ai.test(a.meta("ai", {}), body.get("provider"))


# ==================================================================== 系統
def api_update_check(h, q, body):
    import urllib.error
    try:
        info = maintenance.check_update()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return dict(latest=True, info=None, current=APP_VERSION,
                        note="目前還沒有發佈到網路上的新版本，您使用的就是最新版。")
        raise ApiError("無法連到更新伺服器：%s" % e)
    except Exception as e:
        raise ApiError("無法連到更新伺服器：%s" % e)
    return dict(latest=info is None, info=info, current=APP_VERSION)


def api_update_install(h, q, body):
    a = _sess(h, q)
    a.need("SYS")
    info = maintenance.check_update()
    if not info or not info.get("name"):
        raise ApiError("找不到可以自動安裝的新版本，請到發佈頁下載")
    path = maintenance.download(info["url"])
    maintenance.launch_installer(path)
    threading.Timer(1.5, lambda: STATE.get("quit") and STATE["quit"]()).start()
    return dict(ok=True)


def api_backup(h, q, body):
    a = _sess(h, q)
    a.need("SYS")
    import datetime
    folder = body.get("folder") or a.root()
    path = os.path.join(folder, "文件office彙整資料庫備份-%s.sql.gz" % datetime.datetime.now().strftime("%Y%m%d-%H%M"))
    size = maintenance.backup(STATE["st"], path)
    a.log("backup", "", path)
    return dict(path=path, size=size)


def api_restore(h, q, body):
    a = _sess(h, q)
    a.need("SYS")
    p = body.get("path") or ""
    if not os.path.isfile(p):
        raise BizError("找不到備份檔")
    maintenance.restore(STATE["st"], p)
    a.log("restore", "", p)
    return {}


def api_mcp_info(h, q, body):
    """MCP 連線設定（給 Claude Desktop 等工具）：安裝版是程式旁的 ZMSOfficeMCP.exe。"""
    import sys as _sys
    _sess(h, q)
    if getattr(_sys, "frozen", False) and _sys.platform == "darwin":     # .app/Contents/Resources/mcp/ZMSOfficeMCP
        cmd, args = os.path.normpath(os.path.join(os.path.dirname(_sys.executable), "..", "Resources", "mcp", "ZMSOfficeMCP")), []
    elif getattr(_sys, "frozen", False):
        cmd, args = os.path.join(os.path.dirname(_sys.executable), "ZMSOfficeMCP.exe"), []
    else:
        cmd, args = _sys.executable, [os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "main.py")), "--mcp"]
    return dict(command=cmd, args=args)


def api_open_queue(h, q, body):
    """在檔案總管按兩下檔案、但程式已經開著時，新開的程式把路徑放進 open-queue.json 交給這裡。"""
    from .settings import data_dir
    _sess(h, q)
    p = os.path.join(data_dir(), "open-queue.json")
    if not os.path.isfile(p):
        return []
    try:
        files = json.load(open(p, encoding="utf-8"))
    except ValueError:
        files = []
    os.remove(p)
    return [f for f in files if os.path.isfile(f)]


def api_shortcut(h, q, body):
    maintenance.create_desktop_shortcut()
    return {}


ROUTES = {n[4:]: f for n, f in globals().items() if n.startswith("api_") and callable(f)}
RAW = {"upload", "save", "save_as", "export_to", "to_flipbook"}
GET_OK = {"state", "docs", "folders", "doc_info", "versions", "users", "audit", "last_user", "pref", "company",
          "update_check", "templates", "scripts", "ai_config", "mcp_info", "open_queue"}


# ==================================================================== HTTP
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ZMSOffice"

    def log_message(self, *a):
        pass

    def _q(self):
        u = urllib.parse.urlsplit(self.path)
        return u.path, {k: v[-1] for k, v in urllib.parse.parse_qs(u.query).items()}

    def _send(self, code, data, ctype="application/json; charset=utf-8", extra=None):
        if not isinstance(data, (bytes, bytearray)):
            data = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _key_ok(self, q):
        return (self.headers.get("X-Key") or q.get("k")) == KEY

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path, q = self._q()
        if path.startswith("/api/"):
            return self._api(path[5:], q, None)
        if path.startswith("/file/"):
            return self._docfile(path, q)
        if path.startswith("/vendor/"):
            return self._static(path[len("/vendor/"):], VENDOR, cache=True)
        return self._static(path, WEB, cache=False)

    def do_POST(self):
        path, q = self._q()
        if not path.startswith("/api/"):
            return self._send(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        return self._api(path[5:], q, raw, post=True)

    def _api(self, name, q, raw, post=False):
        if not self._key_ok(q):
            return self._send(403, {"error": "金鑰不正確"})
        f = ROUTES.get(name)
        if not f or (not post and name not in GET_OK):
            return self._send(404, {"error": "沒有這個功能：" + name})
        try:
            body = (raw or b"") if name in RAW else (json.loads(raw.decode("utf-8")) if raw else {})
            res = f(self, q, body)
            return self._send(200, {"ok": True, "data": res})
        except ApiError as e:
            return self._send(e.code, {"ok": False, "error": str(e)})
        except BizError as e:
            return self._send(400, {"ok": False, "error": str(e)})
        except Exception as e:
            traceback.print_exc()
            return self._send(500, {"ok": False, "error": "程式錯誤：%s" % e})
        finally:
            if STATE["db"]:
                STATE["db"].close()            # 每個請求結束就歸還連線（執行緒會被重複使用）

    def _docfile(self, path, q):
        """/file/<id>（目前版本）或 /file/<id>?v=<版本 id>：給編輯器讀取文件內容。"""
        if not self._key_ok(q):
            return self._send(403, {"error": "金鑰不正確"})
        try:
            a = _sess(self, q)
            did = int(path.rsplit("/", 1)[-1].split(".")[0])
            fp = a.version_file(did, int(q["v"])) if q.get("v") else a.abspath(a.doc(did))
        except Exception:
            fp = None
        finally:
            if STATE["db"]:
                STATE["db"].close()
        if not fp or not os.path.isfile(fp):
            return self._send(404, {"error": "找不到文件"})
        self._file(fp, cache=False)

    def _static(self, path, base, cache):
        if path in ("", "/"):
            path = "/index.html"
        fp = os.path.normpath(os.path.join(base, urllib.parse.unquote(path).lstrip("/")))
        if not fp.startswith(os.path.normpath(base)) or not os.path.isfile(fp):
            return self._send(404, b"not found", "text/plain")
        self._file(fp, cache=cache)

    def _file(self, fp, cache):
        size = os.path.getsize(fp)
        ctype = mimetypes.guess_type(fp)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/json",):
            ctype += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "private, max-age=604800" if cache else "no-cache")
        self.end_headers()
        if self.command == "HEAD":
            return
        try:
            with open(fp, "rb") as f:
                while True:
                    chunk = f.read(512 * 1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False


def serve(port=0):
    srv = Server(("127.0.0.1", port), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def start_database(st=None):
    """啟動內建資料庫並建表（在背景執行緒呼叫）。"""
    from .database import DB
    from .dbserver import LocalDatabaseServer
    from .settings import Settings
    try:
        st = st or Settings.load()
        STATE["st"] = st
        srv = None
        if st.mode == "embedded":
            srv = LocalDatabaseServer(st)
            srv.start()
            st.save()
        db = DB(st)
        db.prepare()
        db.close()
        STATE["db"], STATE["dbserver"], STATE["ready"] = db, srv, True
    except Exception as e:
        traceback.print_exc()
        STATE["error"] = "資料庫啟動失敗：%s" % e


def stop_database():
    srv = STATE.get("dbserver")
    if srv:
        srv.stop()


_ = EXT_KIND
