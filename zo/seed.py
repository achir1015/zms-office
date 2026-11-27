"""第一次使用的預設資料：權限功能與角色。"""

# 權限功能：(代號, 名稱, 說明)；等級 0 無、1 查詢（只能檢視）、2 維護（可編輯）
FUNCS = [
    ("WORD", "DataWord 文書", "等級 1 可開啟檢視；等級 2 可新增、編輯、儲存文件"),
    ("EXCEL", "DataExcel 試算表", "等級 1 可開啟檢視；等級 2 可新增、編輯、儲存試算表"),
    ("PPT", "DataPowerPoint 簡報", "等級 1 可開啟檢視、播放；等級 2 可新增、編輯、儲存簡報"),
    ("PDF", "DataPDF", "等級 1 可檢視 PDF；等級 2 可註解、填表、簽名、編輯 PDF"),
    ("DIAGRAM", "DataDiagram 流程圖", "等級 1 可檢視流程圖；等級 2 可繪製、編輯流程圖與圖形"),
    ("SHARE", "共用文件", "等級 1 可開啟別人共用的文件；等級 2 可修改、刪除別人共用的文件"),
    ("AI", "AI 助理", "等級 1 可使用 AI 協助；等級 2 可設定 AI 服務與金鑰"),
    ("DEV", "開發人員", "等級 1 可執行巨集與 Apps Script；等級 2 可錄製、編寫、管理巨集與 Apps Script"),
    ("SYS", "系統管理", "使用者與權限、備份還原、版本更新、操作紀錄"),
]
FUNC_NAMES = {f[0]: f[1] for f in FUNCS}
LEVEL_NAMES = {0: "無", 1: "查詢", 2: "維護"}


def _r(**kw):
    return {f[0]: kw.get(f[0], 0) for f in FUNCS}


ROLES = {
    "系統管理員": {f[0]: 2 for f in FUNCS},
    "開發人員": _r(WORD=2, EXCEL=2, PPT=2, PDF=2, DIAGRAM=2, SHARE=2, AI=1, DEV=2),
    "一般員工": _r(WORD=2, EXCEL=2, PPT=2, PDF=2, DIAGRAM=2, SHARE=1, AI=1, DEV=1),
    "唯讀人員": _r(WORD=1, EXCEL=1, PPT=1, PDF=1, DIAGRAM=1, SHARE=1),
}

# 文件種類：副檔名 → 編輯器種類
KINDS = {
    "word": ("WORD", ["docx", "doc", "docm", "dotx", "dotm", "dot", "odt", "ott", "rtf", "txt", "html", "htm", "mht",
                      "mhtml", "xml", "epub", "fb2", "wps", "wpt"]),
    "cell": ("EXCEL", ["xlsx", "xls", "xlsm", "xlsb", "xltx", "xltm", "xlt", "ods", "ots", "csv", "et", "ett"]),
    "slide": ("PPT", ["pptx", "ppt", "pptm", "ppsx", "pps", "ppsm", "potx", "potm", "pot", "odp", "otp", "dps", "dpt"]),
    "pdf": ("PDF", ["pdf", "xps", "oxps", "djvu", "ofd"]),
    "diagram": ("DIAGRAM", ["drawio", "dio", "vsdx", "mmd"]),
}
EXT_KIND = {e: k for k, (_, exts) in KINDS.items() for e in exts}
KIND_FUNC = {k: f for k, (f, _) in KINDS.items()}


def seed_all(db, first=False):
    """每次開啟都會補上缺的參考資料（INSERT IGNORE，不覆蓋使用者修改過的內容）。"""
    db.exec("INSERT IGNORE INTO sys_company (id, name) VALUES (1, '')")
