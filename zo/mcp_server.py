"""MCP 伺服器（Model Context Protocol，stdio）：讓 Claude Desktop、Cursor 等 AI 工具操作「資料助秘文件office彙整」。

啟動：ZMSOfficeMCP.exe（安裝版）或 python main.py --mcp
需要環境變數 ZO_MCP_USER／ZO_MCP_PASSWORD（用一般使用者帳號登入，權限照帳號設定）。

工具：
  list_documents   列出文件（最近／我的／共用、種類、關鍵字）
  read_document    讀出文字內容（Word 段落、Excel 儲存格、PowerPoint 每頁文字、流程圖 XML）
  create_document  新增 Word（Markdown 段落）、Excel（表格）、PowerPoint（投影片大綱）
  append_to_word   在 Word 文件最後加段落
  update_cells     修改 Excel 儲存格（值或公式）
  add_slides       在簡報加投影片
  create_diagram   用 Mermaid 建立流程圖（在 DataDiagram 開啟時自動轉成可編輯圖形）

資料庫沒在執行時會自己啟動；結束時如果主程式沒開，就把資料庫關掉。
"""
import json
import os
import sys
import traceback

from . import APP_NAME, APP_VERSION

PROTOCOL = "2025-06-18"

TOOLS = [
    {"name": "list_documents", "description": "列出文件庫裡的文件。view: recent（最近）、mine（我的）、shared（與我共用）、starred；kind: word、cell、slide、pdf、diagram。",
     "inputSchema": {"type": "object", "properties": {"view": {"type": "string", "enum": ["recent", "mine", "shared", "starred"]},
                                                       "kind": {"type": "string"}, "query": {"type": "string"}}}},
    {"name": "read_document", "description": "讀取文件的文字內容（Word 段落、Excel 各工作表儲存格、PowerPoint 每頁文字、流程圖 XML、純文字／CSV）。",
     "inputSchema": {"type": "object", "properties": {"id": {"type": "integer"}, "max_chars": {"type": "integer"}}, "required": ["id"]}},
    {"name": "create_document", "description": "建立新文件並存入文件庫。kind=word：content 是 Markdown（# 標題、- 清單、一般段落）；kind=cell：rows 是二維陣列（可含 =公式）；kind=slide：slides 是 [{title, bullets[], notes}]。",
     "inputSchema": {"type": "object", "properties": {"kind": {"type": "string", "enum": ["word", "cell", "slide"]}, "name": {"type": "string"},
                                                       "content": {"type": "string"}, "rows": {"type": "array"}, "sheet": {"type": "string"},
                                                       "slides": {"type": "array"}}, "required": ["kind", "name"]}},
    {"name": "append_to_word", "description": "在 Word 文件（.docx）最後加上 Markdown 內容。", "inputSchema": {"type": "object",
     "properties": {"id": {"type": "integer"}, "content": {"type": "string"}}, "required": ["id", "content"]}},
    {"name": "update_cells", "description": "修改 Excel（.xlsx）儲存格。cells 例：{\"A1\": \"品名\", \"B5\": \"=SUM(B2:B4)\"}", "inputSchema": {"type": "object",
     "properties": {"id": {"type": "integer"}, "sheet": {"type": "string"}, "cells": {"type": "object"}}, "required": ["id", "cells"]}},
    {"name": "add_slides", "description": "在簡報（.pptx）最後加投影片：slides=[{title, bullets[], notes}]", "inputSchema": {"type": "object",
     "properties": {"id": {"type": "integer"}, "slides": {"type": "array"}}, "required": ["id", "slides"]}},
    {"name": "create_diagram", "description": "用 Mermaid 語法建立流程圖／循序圖／心智圖／甘特圖，存成 DataDiagram 流程圖（開啟時自動轉成可編輯圖形）。",
     "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}, "mermaid": {"type": "string"}}, "required": ["name", "mermaid"]}},
]


class MCPError(Exception):
    pass


# ==================================================================== 文件內容（python-docx／openpyxl／python-pptx）
def _style(doc, name):
    """編輯器產生的空白文件不一定有「Heading 1」等樣式 → 沒有就建立（Word 也認得這些名稱）。"""
    from docx.enum.style import WD_STYLE_TYPE
    from docx.shared import Pt, RGBColor
    try:
        return doc.styles[name]
    except KeyError:
        pass
    st = doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
    try:
        st.base_style = doc.styles["Normal"]
    except KeyError:
        pass
    if name.startswith("Heading"):
        lv = int(name.split()[-1])
        st.font.bold = True
        st.font.size = Pt({1: 20, 2: 16, 3: 14}.get(lv, 12))
        st.font.color.rgb = RGBColor(0x2B, 0x57, 0x9A)
        st.paragraph_format.space_before = Pt(12)
        st.paragraph_format.space_after = Pt(6)
    return st


def _md_to_docx(doc, md):
    for line in (md or "").splitlines():
        s = line.rstrip()
        if not s.strip():
            continue
        if s.startswith("#"):
            lv = min(len(s) - len(s.lstrip("#")), 4)
            doc.add_paragraph(s.lstrip("#").strip(), style=_style(doc, "Heading %d" % lv))
        elif s.lstrip().startswith(("- ", "* ", "• ")):
            doc.add_paragraph("• " + s.lstrip()[2:].strip())
        elif len(s) > 2 and s[0].isdigit() and s.lstrip("0123456789").startswith((". ", "、")):
            doc.add_paragraph(s.strip())
        else:
            doc.add_paragraph(s.strip())


def _blank(ext):
    from .settings import resource_dir
    return os.path.join(resource_dir(), "web", "assets", "blank", "blank." + ext)


def _add_slides(prs, slides):
    layout = prs.slide_layouts[1] if len(prs.slide_layouts) > 1 else prs.slide_layouts[0]
    from pptx.util import Pt
    for sd in slides or []:
        s = prs.slides.add_slide(layout)
        title = s.shapes.title
        body = next((ph for ph in s.placeholders if ph.placeholder_format.idx == 1), None)
        if title is not None:
            title.text = str(sd.get("title", ""))
        bullets = [str(b) for b in sd.get("bullets") or sd.get("points") or []]
        if body is not None:
            body.text = "\n".join(bullets)
        elif bullets:
            tb = s.shapes.add_textbox(Pt(50), Pt(130), prs.slide_width - Pt(100), prs.slide_height - Pt(180))
            tb.text_frame.text = "\n".join("• " + b for b in bullets)
        if sd.get("notes"):
            s.notes_slide.notes_text_frame.text = str(sd["notes"])


def read_text(path, ext, limit=40000):
    if ext == "docx":
        import docx
        d = docx.Document(path)
        out = [p.text for p in d.paragraphs if p.text.strip()]
        for ti, t in enumerate(d.tables):
            out.append("[表格 %d]" % (ti + 1))
            out += ["\t".join(c.text for c in r.cells) for r in t.rows]
        text = "\n".join(out)
    elif ext in ("xlsx", "xlsm"):
        import openpyxl
        wb = openpyxl.load_workbook(path, data_only=False)
        out = []
        for ws in wb.worksheets:
            out.append("[工作表 %s]" % ws.title)
            for row in ws.iter_rows():
                vals = ["%s=%s" % (c.coordinate, c.value) for c in row if c.value is not None]
                if vals:
                    out.append("  ".join(vals))
        text = "\n".join(out)
    elif ext == "pptx":
        import pptx
        prs = pptx.Presentation(path)
        out = []
        for i, s in enumerate(prs.slides, 1):
            out.append("[第 %d 頁]" % i)
            for sh in s.shapes:
                if sh.has_text_frame and sh.text_frame.text.strip():
                    out.append(sh.text_frame.text)
            if s.has_notes_slide and s.notes_slide.notes_text_frame.text.strip():
                out.append("（備註）" + s.notes_slide.notes_text_frame.text)
        text = "\n".join(out)
    elif ext in ("txt", "csv", "drawio", "mmd", "html", "htm", "md", "xml"):
        with open(path, encoding="utf-8-sig", errors="replace") as f:
            text = f.read()
    else:
        raise MCPError("這個格式（.%s）無法用 MCP 讀取文字，請在程式裡開啟" % ext)
    return text[:limit] + ("\n…（已截斷）" if len(text) > limit else "")


# ==================================================================== 伺服器
class Server:
    def __init__(self):
        self.lib = None
        self.db_started = None

    # ---------------------------------------------------------------- 連線與登入
    def _ensure(self):
        if self.lib:
            return self.lib
        from .database import DB
        from .dbserver import LocalDatabaseServer, listening
        from .library import Library
        from .settings import Settings
        st = Settings.load()
        if st.mode == "embedded" and not listening(st.host, st.port):
            srv = LocalDatabaseServer(st)
            srv.start()
            st.save()
            self.db_started = srv
        db = DB(st)
        db.prepare()
        lib = Library(db)
        uid, pw = os.environ.get("ZO_MCP_USER", ""), os.environ.get("ZO_MCP_PASSWORD", "")
        if not uid:
            raise MCPError("請在 MCP 設定的 env 加上 ZO_MCP_USER 與 ZO_MCP_PASSWORD（資料助秘文件office彙整的帳號密碼）")
        lib.login(uid, pw)
        self.lib = lib
        return lib

    def close(self):
        if not self.db_started:
            return
        from . import single
        from .settings import data_dir
        try:                                          # 主程式沒開（鎖拿得到）才關資料庫
            if single.acquire(wait=0, path=os.path.join(data_dir(), "instance.lock")):
                self.db_started.stop()
        except Exception:
            pass

    # ---------------------------------------------------------------- 工具
    def call(self, name, a):
        lib = self._ensure()
        if name == "list_documents":
            rows = lib.docs(a.get("view") or "recent", None, a.get("query") or "", a.get("kind") or "")
            return [{"id": d["id"], "name": d["filename"], "kind": d["kind"], "updated": d["updated_at"], "owner": d["owner"],
                     "size": d["size"]} for d in rows[:200]]
        if name == "read_document":
            info, path = lib.open_info(int(a["id"]))
            return {"name": info["filename"], "kind": info["kind"], "text": read_text(path, info["ext"], int(a.get("max_chars") or 40000))}
        if name == "create_document":
            kind = a["kind"]
            d = lib.create(kind, a.get("name") or "")
            _, path = lib.open_info(d["id"])
            if kind == "word" and a.get("content"):
                import docx
                doc = docx.Document(path)
                _md_to_docx(doc, a["content"])
                doc.save(path)
            elif kind == "cell" and a.get("rows"):
                import openpyxl
                wb = openpyxl.load_workbook(path)
                ws = wb.active
                if a.get("sheet"):
                    ws.title = a["sheet"][:31]
                for r in a["rows"]:
                    ws.append(list(r))
                wb.save(path)
            elif kind == "slide" and a.get("slides"):
                import pptx
                prs = pptx.Presentation(path)
                if len(prs.slides) == 1 and not any(sh.has_text_frame and sh.text_frame.text.strip() for sh in prs.slides[0].shapes):
                    sid = prs.slides._sldIdLst[0]           # 空白範本的第一張空投影片拿掉
                    prs.part.drop_rel(sid.rId)
                    prs.slides._sldIdLst.remove(sid)
                _add_slides(prs, a["slides"])
                prs.save(path)
            self._touch(d["id"], path)
            return {"id": d["id"], "name": d["filename"], "message": "已建立，可在「%s」的最近清單開啟" % APP_NAME}
        if name in ("append_to_word", "update_cells", "add_slides"):
            info, path = lib.open_info(int(a["id"]))
            if info["readonly"]:
                raise MCPError("這份文件正由 %s 編輯中或您沒有修改權限" % (info.get("locked_by") or "其他人"))
            need = {"append_to_word": "docx", "update_cells": "xlsx", "add_slides": "pptx"}[name]
            if info["ext"] != need:
                raise MCPError("這個工具只能用在 .%s" % need)
            with open(path, "rb") as f:
                old = f.read()
            if name == "append_to_word":
                import docx
                doc = docx.Document(path)
                _md_to_docx(doc, a["content"])
                doc.save(path)
            elif name == "update_cells":
                import openpyxl
                wb = openpyxl.load_workbook(path)
                ws = wb[a["sheet"]] if a.get("sheet") and a["sheet"] in wb.sheetnames else wb.active
                for k, v in (a.get("cells") or {}).items():
                    ws[k] = v
                wb.save(path)
            else:
                import pptx
                prs = pptx.Presentation(path)
                _add_slides(prs, a["slides"])
                prs.save(path)
            with open(path, "rb") as f:
                new = f.read()
            with open(path, "wb") as f:             # 經過文件庫存檔：保留上一版
                f.write(old)
            lib.save(info["id"], new)
            return {"id": info["id"], "message": "已更新（上一版保留在版本記錄）"}
        if name == "create_diagram":
            src = (a.get("mermaid") or "").strip()
            if not src:
                raise MCPError("mermaid 是空的")
            d = lib.create("diagram", a.get("name") or "")
            _, path = lib.open_info(d["id"])
            from xml.sax.saxutils import escape
            xml = ('<mxfile host="ZMSOffice"><diagram id="page-1" name="第 1 頁"><mxGraphModel><root><mxCell id="0"/>'
                   '<mxCell id="1" parent="0"/></root></mxGraphModel></diagram><zoMermaid>%s</zoMermaid></mxfile>' % escape(src))
            lib.save(d["id"], xml.encode("utf-8"))
            return {"id": d["id"], "name": d["filename"], "message": "已建立流程圖，在 DataDiagram 開啟時會自動轉成可編輯圖形"}
        raise MCPError("沒有這個工具：" + name)

    def _touch(self, did, path):
        import hashlib
        with open(path, "rb") as f:
            data = f.read()
        self.lib.db.exec("UPDATE zo_doc SET size=%s, sha1=%s, updated_at=NOW() WHERE id=%s",
                         (len(data), hashlib.sha1(data).hexdigest(), did))

    # ---------------------------------------------------------------- JSON-RPC
    def handle(self, msg):
        mid, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
        if method == "initialize":
            return {"protocolVersion": params.get("protocolVersion") or PROTOCOL,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": "zms-office", "title": APP_NAME, "version": APP_VERSION},
                    "instructions": "操作「%s」的文件庫：Word／Excel／PowerPoint／流程圖。先用 list_documents 找文件 id。" % APP_NAME}
        if method == "ping":
            return {}
        if method == "tools/list":
            return {"tools": TOOLS}
        if method == "tools/call":
            try:
                res = self.call(params.get("name"), params.get("arguments") or {})
                return {"content": [{"type": "text", "text": json.dumps(res, ensure_ascii=False, default=str, indent=1)}]}
            except Exception as e:
                if not isinstance(e, MCPError):
                    traceback.print_exc(file=sys.stderr)
                return {"content": [{"type": "text", "text": "錯誤：%s" % e}], "isError": True}
        if mid is None:
            return None                             # 通知（notifications/initialized 等）不用回
        raise KeyError(method)


def run():
    inp = sys.stdin.buffer
    out = sys.stdout.buffer
    srv = Server()
    try:
        for line in inp:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line.decode("utf-8"))
            except ValueError:
                continue
            try:
                res = srv.handle(msg)
                if res is None or msg.get("id") is None:
                    continue
                resp = {"jsonrpc": "2.0", "id": msg["id"], "result": res}
            except KeyError as e:
                resp = {"jsonrpc": "2.0", "id": msg.get("id"), "error": {"code": -32601, "message": "Method not found: %s" % e}}
            except Exception as e:
                resp = {"jsonrpc": "2.0", "id": msg.get("id"), "error": {"code": -32603, "message": str(e)}}
            out.write((json.dumps(resp, ensure_ascii=False) + "\n").encode("utf-8"))
            out.flush()
    finally:
        srv.close()
