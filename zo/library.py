"""文件庫：資料夾、文件、版本、最近開啟、共用、資源回收筒、巨集專案、個人偏好。

文件實際存在磁碟：<文件庫>/<帳號>/<資料夾>/<檔名>.<副檔名>，用檔案總管看得到，
也可以直接用 Microsoft Word／Excel／PowerPoint 開。資料庫只記錄中繼資料。
「開啟電腦上的檔案」時可以選擇直接編輯原檔（linked＝1），存檔就寫回原位置。
"""
import datetime
import hashlib
import json
import os
import re
import shutil

from .core import Base, BizError
from .seed import EXT_KIND, KIND_FUNC
from .settings import resource_dir

BAD = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
KEEP_VERSIONS = 30
LOCK_SECONDS = 90           # 編輯心跳超過這麼久沒更新，就視為沒人在編輯


def clean_name(n, fallback="未命名"):
    n = BAD.sub("_", (n or "").strip()).strip(". ")
    return n[:150] or fallback


def sha1_file(p):
    h = hashlib.sha1()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def split_ext(filename):
    base, dot, ext = os.path.basename(filename or "").rpartition(".")
    if not dot:
        return filename, ""
    return base, ext.lower()


class Library(Base):
    # ================================================================ 位置
    def root(self):
        d = (self.company().get("out_dir") or "").strip() or os.path.join(os.path.expanduser("~"), "Documents",
                                                                          "資料助秘文件office彙整")
        os.makedirs(d, exist_ok=True)
        return d

    def default_out_dir(self):
        return self.root()

    def _folder_rel(self, fid):
        parts, seen = [], set()
        while fid and fid not in seen:
            seen.add(fid)
            r = self.db.row("SELECT parent_id, name, owner FROM zo_folder WHERE id=%s", (fid,))
            if not r:
                break
            parts.append(clean_name(r["name"]))
            fid = r["parent_id"]
        return list(reversed(parts))

    def _dir_for(self, owner, folder_id):
        return os.path.join(clean_name(owner, "user"), *self._folder_rel(folder_id))

    def abspath(self, d):
        return d["path"] if d["linked"] else os.path.join(self.root(), d["path"])

    def _unique(self, rel_dir, name, ext, skip=None):
        os.makedirs(os.path.join(self.root(), rel_dir), exist_ok=True)
        n, i = name, 1
        while True:
            rel = os.path.join(rel_dir, "%s.%s" % (n, ext))
            ap = os.path.join(self.root(), rel)
            if not os.path.exists(ap) or (skip and os.path.normcase(rel) == os.path.normcase(skip)):
                return n, rel
            i += 1
            n = "%s (%d)" % (name, i)

    # ================================================================ 權限
    def _can_doc(self, d, write=False):
        func = KIND_FUNC.get(d["kind"], "WORD")
        if not self.can(func, 2 if write else 1):
            return False
        if d["owner"] == self.uid or self.user["is_admin"]:
            return True
        if d["shared"] or self._folder_shared(d["folder_id"]):
            return self.can("SHARE", 2 if write else 1)
        return False

    def _folder_shared(self, fid):
        seen = set()
        while fid and fid not in seen:
            seen.add(fid)
            r = self.db.row("SELECT parent_id, shared FROM zo_folder WHERE id=%s", (fid,))
            if not r:
                return False
            if r["shared"]:
                return True
            fid = r["parent_id"]
        return False

    def doc(self, did, write=False):
        d = self.db.row("SELECT * FROM zo_doc WHERE id=%s", (int(did),))
        if not d:
            raise BizError("找不到這份文件")
        if not self._can_doc(d, write):
            raise BizError("您沒有%s這份文件的權限" % ("修改" if write else "開啟"))
        return d

    def _folder(self, fid, write=True):
        if not fid:
            return None
        f = self.db.row("SELECT * FROM zo_folder WHERE id=%s", (int(fid),))
        if not f:
            raise BizError("找不到資料夾")
        if f["owner"] != self.uid and not self.user["is_admin"]:
            if not self._folder_shared(f["id"]) or not self.can("SHARE", 2 if write else 1):
                raise BizError("您沒有這個資料夾的權限")
        return f

    # ================================================================ 資料夾
    def folders(self, parent=None, owner=None):
        if parent:
            self._folder(parent, write=False)
            return self.db.rows("SELECT * FROM zo_folder WHERE parent_id=%s ORDER BY name", (int(parent),))
        return self.db.rows("SELECT * FROM zo_folder WHERE parent_id IS NULL AND owner=%s ORDER BY name",
                            (owner or self.uid,))

    def folder_tree(self):
        """自己的資料夾＋別人共用的資料夾（側欄用）。"""
        rows = self.db.rows("SELECT id, parent_id, owner, name, shared FROM zo_folder WHERE owner=%s OR shared=1 "
                            "ORDER BY name", (self.uid,))
        return rows

    def folder_create(self, name, parent=None):
        p = self._folder(parent) if parent else None
        owner = p["owner"] if p else self.uid
        name = clean_name(name, "新資料夾")
        if self.db.value("SELECT 1 FROM zo_folder WHERE owner=%s AND name=%s AND parent_id <=> %s",
                         (owner, name, parent or None)):
            raise BizError("已經有同名的資料夾")
        fid = self.db.exec("INSERT INTO zo_folder (parent_id, owner, name) VALUES (%s, %s, %s)",
                           (parent or None, owner, name))
        os.makedirs(os.path.join(self.root(), self._dir_for(owner, fid)), exist_ok=True)
        self.log("folder_new", fid, name)
        return fid

    def folder_rename(self, fid, name):
        f = self._folder(fid)
        name = clean_name(name, f["name"])
        old = os.path.join(self.root(), self._dir_for(f["owner"], fid))
        self.db.exec("UPDATE zo_folder SET name=%s WHERE id=%s", (name, fid))
        new = os.path.join(self.root(), self._dir_for(f["owner"], fid))
        if os.path.isdir(old) and os.path.normcase(old) != os.path.normcase(new):
            if os.path.exists(new):
                self.db.exec("UPDATE zo_folder SET name=%s WHERE id=%s", (f["name"], fid))
                raise BizError("磁碟上已有同名資料夾")
            os.rename(old, new)
            self._repath_under(f["owner"], old, new)
        self.log("folder_rename", fid, name)

    def _repath_under(self, owner, old_abs, new_abs):
        root = self.root()
        o, n = os.path.relpath(old_abs, root), os.path.relpath(new_abs, root)
        for d in self.db.rows("SELECT id, path FROM zo_doc WHERE linked=0 AND owner=%s", (owner,)):
            if os.path.normcase(d["path"]).startswith(os.path.normcase(o) + os.sep):
                self.db.exec("UPDATE zo_doc SET path=%s WHERE id=%s", (n + d["path"][len(o):], d["id"]))

    def folder_share(self, fid, shared):
        f = self._folder(fid)
        if f["owner"] != self.uid and not self.user["is_admin"]:
            raise BizError("只有建立人可以設定共用")
        self.db.exec("UPDATE zo_folder SET shared=%s WHERE id=%s", (int(bool(shared)), fid))
        self.log("folder_share", fid, str(bool(shared)))

    def folder_delete(self, fid):
        f = self._folder(fid)
        if self.db.value("SELECT 1 FROM zo_folder WHERE parent_id=%s LIMIT 1", (fid,)) or \
                self.db.value("SELECT 1 FROM zo_doc WHERE folder_id=%s AND trashed=0 LIMIT 1", (fid,)):
            raise BizError("資料夾裡還有東西，請先移走或刪除")
        for d in self.db.rows("SELECT id FROM zo_doc WHERE folder_id=%s", (fid,)):
            self.db.exec("UPDATE zo_doc SET folder_id=NULL WHERE id=%s", (d["id"],))
        p = os.path.join(self.root(), self._dir_for(f["owner"], fid))
        self.db.exec("DELETE FROM zo_folder WHERE id=%s", (fid,))
        try:
            os.rmdir(p)
        except OSError:
            pass
        self.log("folder_delete", fid, f["name"])

    # ================================================================ 文件清單
    def _out(self, d):
        d = dict(d)
        for k in ("created_at", "updated_at", "editing_at", "opened_at"):
            if d.get(k) and hasattr(d[k], "strftime"):
                d[k] = d[k].strftime("%Y-%m-%d %H:%M")
        d["filename"] = "%s.%s" % (d["name"], d["ext"])
        d["mine"] = d["owner"] == self.uid
        d["can_write"] = self._can_doc(d, True) if "kind" in d else False
        if d.get("linked"):
            d["where"] = d["path"]
        return d

    def docs(self, view="recent", folder=None, q="", kind=""):
        where, args, join, order = ["d.trashed=0"], [], "", "d.updated_at DESC"
        if view == "recent":
            join = "JOIN zo_recent r ON r.doc_id=d.id AND r.uid=%s"
            args.append(self.uid)
            order = "r.opened_at DESC"
        elif view == "mine":
            where.append("d.owner=%s")
            args.append(self.uid)
            if folder:
                where.append("d.folder_id=%s")
                args.append(int(folder))
            elif not q:
                where.append("d.folder_id IS NULL")
        elif view == "folder":
            self._folder(folder, write=False)
            where.append("d.folder_id=%s")
            args.append(int(folder))
        elif view == "shared":
            where.append("d.owner<>%s AND (d.shared=1 OR d.folder_id IN (SELECT id FROM zo_folder WHERE shared=1))")
            args.append(self.uid)
        elif view == "starred":
            where.append("d.starred=1 AND d.owner=%s")
            args.append(self.uid)
        elif view == "templates":
            where.append("d.is_template=1")
        elif view == "trash":
            where = ["d.trashed=1", "d.owner=%s"]
            args.append(self.uid)
        if kind:
            where.append("d.kind=%s")
            args.append(kind)
        if q:
            where.append("d.name LIKE %s")
            args.append("%" + q.strip() + "%")
        sel = "d.*" + (", r.opened_at" if view == "recent" else "")
        rows = self.db.rows("SELECT %s FROM zo_doc d %s WHERE %s ORDER BY %s LIMIT 500"
                            % (sel, join, " AND ".join(where), order), tuple(args))
        out = []
        for d in rows:
            if self._can_doc(d) or view == "trash":
                out.append(self._out(d))
        return out

    # ================================================================ 新增、匯入
    def _insert(self, name, ext, folder, path, linked=0, size=0, sha1="", owner=None, is_template=0):
        kind = EXT_KIND.get(ext)
        if not kind:
            raise BizError("不支援的檔案格式：.%s" % ext)
        did = self.db.exec("INSERT INTO zo_doc (folder_id, owner, name, ext, kind, path, linked, size, sha1, "
                           "is_template, updated_by) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                           (folder or None, owner or self.uid, name, ext, kind, path, int(linked), size, sha1,
                            int(bool(is_template)), self.uid))
        return did

    def create(self, kind, name="", folder=None, template=None):
        """新增文件：空白文件或範本（內建範本 id 字串，或公司範本文件 id）。"""
        ext = {"word": "docx", "cell": "xlsx", "slide": "pptx", "diagram": "drawio"}.get(kind)
        if not ext:
            raise BizError("不明的文件種類")
        self.need(KIND_FUNC[kind], 2)
        f = self._folder(folder) if folder else None
        owner = f["owner"] if f else self.uid
        src = None
        if template and str(template).isdigit():
            t = self.doc(int(template))
            src, ext = self.abspath(t), t["ext"] if t["ext"] in ("docx", "xlsx", "pptx") else ext
            ext = {"dotx": "docx", "xltx": "xlsx", "potx": "pptx"}.get(ext, ext)
        elif template:
            src = os.path.join(resource_dir(), "web", "assets", "templates", os.path.basename(str(template)))
        if not src or not os.path.isfile(src):
            src = os.path.join(resource_dir(), "web", "assets", "blank", "blank." + ext)
        default = {"word": "文件", "cell": "活頁簿", "slide": "簡報", "diagram": "流程圖"}[kind]
        name, rel = self._unique(self._dir_for(owner, folder), clean_name(name, default), ext)
        ap = os.path.join(self.root(), rel)
        if os.path.isfile(src):
            shutil.copyfile(src, ap)
        else:
            open(ap, "wb").close()             # 空檔：編輯器會開新的空白文件
        did = self._insert(name, ext, folder, rel, size=os.path.getsize(ap), owner=owner)
        self.touch(did)
        self.log("doc_new", did, name + "." + ext)
        return self._out(self.doc(did))

    def import_file(self, path, folder=None, link=False, name=None):
        if not os.path.isfile(path):
            raise BizError("找不到檔案：" + path)
        base, ext = split_ext(name or path)
        kind = EXT_KIND.get(ext)
        if not kind:
            raise BizError("不支援的檔案格式：%s" % os.path.basename(path))
        self.need(KIND_FUNC[kind], 1)
        if link:
            ap = os.path.abspath(path)
            old = self.db.row("SELECT id FROM zo_doc WHERE linked=1 AND path=%s AND owner=%s AND trashed=0",
                              (ap, self.uid))
            if old:
                self.touch(old["id"])
                return self._out(self.doc(old["id"]))
            did = self._insert(clean_name(base), ext, None, ap, linked=1, size=os.path.getsize(ap))
        else:
            f = self._folder(folder) if folder else None
            owner = f["owner"] if f else self.uid
            nm, rel = self._unique(self._dir_for(owner, folder), clean_name(base), ext)
            shutil.copyfile(path, os.path.join(self.root(), rel))
            did = self._insert(nm, ext, folder, rel, size=os.path.getsize(path), sha1=sha1_file(path), owner=owner)
        self.touch(did)
        self.log("doc_import", did, os.path.basename(path))
        return self._out(self.doc(did))

    # ================================================================ 讀寫
    def touch(self, did):
        self.db.exec("REPLACE INTO zo_recent (uid, doc_id, opened_at) VALUES (%s, %s, NOW())", (self.uid, did))
        self.db.exec("DELETE FROM zo_recent WHERE uid=%s AND doc_id NOT IN (SELECT doc_id FROM (SELECT doc_id FROM "
                     "zo_recent WHERE uid=%s ORDER BY opened_at DESC LIMIT 200) x)", (self.uid, self.uid))

    def open_info(self, did):
        d = self.doc(did)
        ap = self.abspath(d)
        if not os.path.isfile(ap):
            raise BizError("磁碟上找不到這份文件（可能被移動或刪除）：%s" % ap)
        self.touch(d["id"])
        out = self._out(d)
        lock = d["editing_by"] and d["editing_by"] != self.uid and d["editing_at"] and \
            (datetime.datetime.now() - d["editing_at"]).total_seconds() < LOCK_SECONDS
        out["locked_by"] = self.db.value("SELECT name FROM sys_user WHERE uid=%s", (d["editing_by"],)) if lock else ""
        out["readonly"] = bool(lock) or not out["can_write"]
        return out, ap

    def heartbeat(self, did, editing=True):
        d = self.doc(did)
        if editing and self._can_doc(d, True):
            if d["editing_by"] in ("", self.uid) or not d["editing_at"] or \
                    (datetime.datetime.now() - d["editing_at"]).total_seconds() >= LOCK_SECONDS:
                self.db.exec("UPDATE zo_doc SET editing_by=%s, editing_at=NOW() WHERE id=%s", (self.uid, did))
                return True
            return False
        if d["editing_by"] == self.uid:
            self.db.exec("UPDATE zo_doc SET editing_by='', editing_at=NULL WHERE id=%s", (did,))
        return True

    def save(self, did, data, ext=None):
        """存檔：先把舊檔留成版本，再寫入新內容（先寫暫存檔再換名，存到一半當機也不會壞）。"""
        d = self.doc(did, write=True)
        if d["editing_by"] and d["editing_by"] != self.uid and d["editing_at"] and \
                (datetime.datetime.now() - d["editing_at"]).total_seconds() < LOCK_SECONDS:
            raise BizError("這份文件正由其他人編輯中，請另存新檔")
        if not data:
            raise BizError("存檔內容是空的")
        ap = self.abspath(d)
        if os.path.isfile(ap) and os.path.getsize(ap) > 0:
            self._keep_version(d, ap)
        tmp = ap + ".zo-saving"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, ap)
        h = hashlib.sha1(data).hexdigest()
        self.db.exec("UPDATE zo_doc SET size=%s, sha1=%s, version=version+1, updated_at=NOW(), updated_by=%s, "
                     "editing_by=%s, editing_at=NOW() WHERE id=%s", (len(data), h, self.uid, self.uid, did))
        self.log("doc_save", did, "%d bytes" % len(data))
        return self._out(self.doc(did))

    def _keep_version(self, d, ap):
        rel = os.path.join(".versions", str(d["id"]), "%d.%s" % (d["version"], d["ext"]))
        dst = os.path.join(self.root(), rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(ap, dst)
        self.db.exec("INSERT INTO zo_doc_version (doc_id, version, path, size, uid) VALUES (%s,%s,%s,%s,%s)",
                     (d["id"], d["version"], rel, os.path.getsize(dst), d["updated_by"] or d["owner"]))
        old = self.db.rows("SELECT id, path FROM zo_doc_version WHERE doc_id=%s ORDER BY version DESC LIMIT 1000 "
                           "OFFSET %s", (d["id"], KEEP_VERSIONS))
        for v in old:
            try:
                os.remove(os.path.join(self.root(), v["path"]))
            except OSError:
                pass
            self.db.exec("DELETE FROM zo_doc_version WHERE id=%s", (v["id"],))

    def versions(self, did):
        self.doc(did)
        rows = self.db.rows("SELECT v.*, u.name AS uname FROM zo_doc_version v LEFT JOIN sys_user u ON u.uid=v.uid "
                            "WHERE doc_id=%s ORDER BY version DESC", (did,))
        for r in rows:
            r["created_at"] = r["created_at"].strftime("%Y-%m-%d %H:%M:%S")
        return rows

    def version_file(self, did, vid):
        self.doc(did)
        v = self.db.row("SELECT * FROM zo_doc_version WHERE id=%s AND doc_id=%s", (vid, did))
        if not v:
            raise BizError("找不到這個版本")
        return os.path.join(self.root(), v["path"])

    def version_restore(self, did, vid):
        p = self.version_file(did, vid)
        with open(p, "rb") as f:
            data = f.read()
        self.log("doc_restore_ver", did, str(vid))
        return self.save(did, data)

    def save_as(self, did, data, name, ext, folder=None):
        """另存新檔（也用在「另存為其他格式」）：建立新文件。"""
        src = self.doc(did) if did else None
        ext = (ext or "").lower().lstrip(".")
        if ext not in EXT_KIND:
            raise BizError("不支援的格式：%s" % ext)
        self.need(KIND_FUNC[EXT_KIND[ext]], 2)
        if folder is None and src and src["owner"] == self.uid and not src["linked"]:
            folder = src["folder_id"]
        f = self._folder(folder) if folder else None
        owner = f["owner"] if f else self.uid
        nm, rel = self._unique(self._dir_for(owner, folder), clean_name(name), ext)
        ap = os.path.join(self.root(), rel)
        with open(ap, "wb") as fp:
            fp.write(data)
        nid = self._insert(nm, ext, folder, rel, size=len(data), sha1=hashlib.sha1(data).hexdigest(), owner=owner)
        self.touch(nid)
        self.log("doc_save_as", nid, "%s.%s" % (nm, ext))
        return self._out(self.doc(nid))

    def export_copy(self, data, path):
        """匯出到電腦上任意位置（不列入文件庫）。"""
        with open(path, "wb") as f:
            f.write(data)
        self.log("doc_export", "", path)
        return path

    # ================================================================ 整理
    def rename(self, did, name):
        d = self.doc(did, write=True)
        name = clean_name(name, d["name"])
        if d["linked"]:
            new = os.path.join(os.path.dirname(d["path"]), "%s.%s" % (name, d["ext"]))
            if os.path.exists(new):
                raise BizError("同一個資料夾已經有這個檔名")
            os.rename(d["path"], new)
            self.db.exec("UPDATE zo_doc SET name=%s, path=%s WHERE id=%s", (name, new, did))
        else:
            name, rel = self._unique(os.path.dirname(d["path"]), name, d["ext"], skip=d["path"])
            os.rename(self.abspath(d), os.path.join(self.root(), rel))
            self.db.exec("UPDATE zo_doc SET name=%s, path=%s WHERE id=%s", (name, rel, did))
        self.log("doc_rename", did, name)

    def move(self, did, folder):
        d = self.doc(did, write=True)
        if d["linked"]:
            raise BizError("電腦上的檔案不能移動到文件庫資料夾，請用「複製到文件庫」")
        f = self._folder(folder) if folder else None
        owner = f["owner"] if f else d["owner"]
        name, rel = self._unique(self._dir_for(owner, folder), d["name"], d["ext"])
        shutil.move(self.abspath(d), os.path.join(self.root(), rel))
        self.db.exec("UPDATE zo_doc SET folder_id=%s, name=%s, path=%s WHERE id=%s", (folder or None, name, rel, did))
        self.log("doc_move", did, str(folder or ""))

    def copy(self, did, folder=None):
        d = self.doc(did)
        with open(self.abspath(d), "rb") as f:
            data = f.read()
        return self.save_as(did, data, d["name"] + " - 複本", d["ext"], folder)

    def set_flag(self, did, flag, value):
        if flag not in ("starred", "shared", "is_template"):
            raise BizError("不明的設定")
        d = self.doc(did, write=flag != "starred")
        if flag == "is_template" and not self.can("SYS", 2):
            raise BizError("只有系統管理員可以設定公司範本")
        if flag == "shared" and d["owner"] != self.uid and not self.user["is_admin"]:
            raise BizError("只有擁有者可以設定共用")
        self.db.exec("UPDATE zo_doc SET %s=%%s WHERE id=%%s" % flag, (int(bool(value)), did))
        self.log("doc_" + flag, did, str(bool(value)))

    def trash(self, did, restore=False):
        d = self.doc(did, write=True)
        if d["owner"] != self.uid and not self.user["is_admin"]:
            raise BizError("只有擁有者可以刪除")
        self.db.exec("UPDATE zo_doc SET trashed=%s WHERE id=%s", (0 if restore else 1, did))
        self.log("doc_restore" if restore else "doc_trash", did, d["name"])

    def purge(self, did):
        d = self.db.row("SELECT * FROM zo_doc WHERE id=%s AND trashed=1", (did,))
        if not d or (d["owner"] != self.uid and not self.user["is_admin"]):
            raise BizError("只能永久刪除資源回收筒裡自己的文件")
        if not d["linked"]:                     # 連結的電腦原檔不刪，只移出清單
            try:
                os.remove(self.abspath(d))
            except OSError:
                pass
            shutil.rmtree(os.path.join(self.root(), ".versions", str(did)), ignore_errors=True)
        self.db.exec("DELETE FROM zo_doc_version WHERE doc_id=%s", (did,))
        self.db.exec("DELETE FROM zo_recent WHERE doc_id=%s", (did,))
        self.db.exec("DELETE FROM zo_doc WHERE id=%s", (did,))
        self.log("doc_purge", did, d["name"])

    def forget_recent(self, did):
        self.db.exec("DELETE FROM zo_recent WHERE uid=%s AND doc_id=%s", (self.uid, did))

    # ================================================================ 巨集／Apps Script
    def scripts(self, kind="", doc_id=None):
        rows = self.db.rows("SELECT s.*, u.name AS owner_name FROM zo_script s LEFT JOIN sys_user u ON u.uid=s.owner "
                            "WHERE (s.owner=%s OR s.shared=1) ORDER BY s.name", (self.uid,))
        out = []
        for r in rows:
            if kind and r["kind"] not in ("any", kind):
                continue
            if r["doc_id"] and doc_id and int(r["doc_id"]) != int(doc_id):
                continue
            r["updated_at"] = r["updated_at"].strftime("%Y-%m-%d %H:%M")
            r["mine"] = r["owner"] == self.uid
            out.append(r)
        return out

    def script_save(self, sid, name, code, lang="gas", kind="any", doc_id=None, shared=0, shortcut=""):
        self.need("DEV", 2)
        name = (name or "").strip()[:120] or "我的程式"
        if lang not in ("gas", "oo"):
            raise BizError("不明的程式語言")
        if sid:
            r = self.db.row("SELECT owner FROM zo_script WHERE id=%s", (sid,))
            if not r:
                raise BizError("找不到這個程式")
            if r["owner"] != self.uid and not self.user["is_admin"]:
                raise BizError("只能修改自己的程式")
            self.db.exec("UPDATE zo_script SET name=%s, code=%s, lang=%s, kind=%s, doc_id=%s, shared=%s, shortcut=%s, "
                         "updated_at=NOW() WHERE id=%s", (name, code or "", lang, kind or "any", doc_id or None,
                                                          int(bool(shared)), shortcut or "", sid))
        else:
            sid = self.db.exec("INSERT INTO zo_script (owner, name, code, lang, kind, doc_id, shared, shortcut) "
                               "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)", (self.uid, name, code or "", lang, kind or "any",
                                                                    doc_id or None, int(bool(shared)), shortcut or ""))
        self.log("script_save", sid, name)
        return sid

    def script_delete(self, sid):
        self.need("DEV", 2)
        r = self.db.row("SELECT owner, name FROM zo_script WHERE id=%s", (sid,))
        if not r:
            return
        if r["owner"] != self.uid and not self.user["is_admin"]:
            raise BizError("只能刪除自己的程式")
        self.db.exec("DELETE FROM zo_script WHERE id=%s", (sid,))
        self.log("script_delete", sid, r["name"])

    # ================================================================ 偏好
    def pref(self):
        r = self.db.value("SELECT data FROM zo_pref WHERE uid=%s", (self.uid,))
        try:
            return json.loads(r) if r else {}
        except ValueError:
            return {}

    def save_pref(self, data):
        p = self.pref()
        p.update(data or {})
        self.db.exec("REPLACE INTO zo_pref (uid, data) VALUES (%s, %s)", (self.uid, json.dumps(p, ensure_ascii=False)))
        return p

    def meta(self, k, default=None):
        v = self.db.value("SELECT v FROM sys_meta WHERE k=%s", (k,))
        if v is None:
            return default
        try:
            return json.loads(v)
        except ValueError:
            return default

    def set_meta(self, k, v):
        self.db.exec("REPLACE INTO sys_meta (k, v) VALUES (%s, %s)", (k, json.dumps(v, ensure_ascii=False)))
