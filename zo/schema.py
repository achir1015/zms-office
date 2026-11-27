"""資料表定義（唯一來源）：建表 SQL 與欄位中文說明。

表名前綴：sys_＝系統（使用者、權限、設定、紀錄）、zo_＝文件office彙整（資料夾、文件、版本、巨集、偏好）。
文件本身存在磁碟（文件庫資料夾），資料庫只記錄位置、擁有者、共用與版本，
所以用檔案總管也看得到、可以直接拿給 Microsoft Office 開。
"""

# (表名, 中文名稱, [(欄位, SQL 型別與屬性, 中文說明)], 其他限制)
TABLES = [
    ("sys_meta", "系統參數", [
        ("k", "VARCHAR(40) NOT NULL PRIMARY KEY", "參數代號"),
        ("v", "MEDIUMTEXT", "參數值")], []),
    ("sys_company", "單位設定（單一公司）", [
        ("id", "INT NOT NULL PRIMARY KEY", "固定 1"),
        ("name", "VARCHAR(120) NOT NULL DEFAULT ''", "公司名稱（文件作者、頁尾預設）"),
        ("out_dir", "VARCHAR(400) NOT NULL DEFAULT ''", "文件庫資料夾（空白＝使用者的「文件」\\資料助秘文件office彙整）")], []),
    ("sys_user", "使用者", [
        ("uid", "VARCHAR(30) NOT NULL PRIMARY KEY", "帳號"),
        ("name", "VARCHAR(60) NOT NULL", "姓名"),
        ("pw_hash", "VARCHAR(200) NOT NULL", "密碼雜湊（PBKDF2）"),
        ("role", "VARCHAR(30) NOT NULL DEFAULT ''", "角色範本"),
        ("dept", "VARCHAR(30) NOT NULL DEFAULT ''", "部門"),
        ("is_admin", "TINYINT NOT NULL DEFAULT 0", "系統管理員"),
        ("active", "TINYINT NOT NULL DEFAULT 1", "啟用"),
        ("last_login", "DATETIME NULL", "最近登入"),
        ("created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "建立時間")], []),
    ("sys_user_perm", "使用者權限", [
        ("uid", "VARCHAR(30) NOT NULL", "帳號"),
        ("func", "VARCHAR(10) NOT NULL", "功能代號"),
        ("lvl", "TINYINT NOT NULL DEFAULT 0", "等級 0 無、1 查詢、2 維護")], ["PRIMARY KEY (uid, func)"]),
    ("sys_audit_log", "操作紀錄", [
        ("id", "BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY", "流水號"),
        ("at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "時間"),
        ("uid", "VARCHAR(30) NOT NULL DEFAULT ''", "使用者"),
        ("action", "VARCHAR(30) NOT NULL", "動作"),
        ("target", "VARCHAR(80) NOT NULL DEFAULT ''", "對象"),
        ("detail", "TEXT", "內容")], ["KEY ix_at (at)"]),
    ("zo_folder", "資料夾", [
        ("id", "INT NOT NULL AUTO_INCREMENT PRIMARY KEY", "流水號"),
        ("parent_id", "INT NULL", "上層資料夾（空白＝個人根目錄）"),
        ("owner", "VARCHAR(30) NOT NULL", "建立人"),
        ("name", "VARCHAR(120) NOT NULL", "資料夾名稱"),
        ("shared", "TINYINT NOT NULL DEFAULT 0", "共用給其他使用者"),
        ("created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "建立時間")],
     ["KEY ix_owner (owner)", "KEY ix_parent (parent_id)"]),
    ("zo_doc", "文件", [
        ("id", "INT NOT NULL AUTO_INCREMENT PRIMARY KEY", "流水號"),
        ("folder_id", "INT NULL", "所在資料夾"),
        ("owner", "VARCHAR(30) NOT NULL", "擁有者"),
        ("name", "VARCHAR(200) NOT NULL", "檔名（不含副檔名）"),
        ("ext", "VARCHAR(10) NOT NULL", "副檔名"),
        ("kind", "VARCHAR(8) NOT NULL", "word 文書、cell 試算表、slide 簡報、pdf、diagram 流程圖"),
        ("path", "VARCHAR(600) NOT NULL", "存放位置（文件庫內為相對路徑；連結電腦檔案為完整路徑）"),
        ("linked", "TINYINT NOT NULL DEFAULT 0", "1＝直接編輯電腦上的原檔（不複製進文件庫）"),
        ("size", "BIGINT NOT NULL DEFAULT 0", "檔案大小"),
        ("sha1", "CHAR(40) NOT NULL DEFAULT ''", "檔案指紋"),
        ("shared", "TINYINT NOT NULL DEFAULT 0", "共用給其他使用者"),
        ("starred", "TINYINT NOT NULL DEFAULT 0", "加上星號"),
        ("is_template", "TINYINT NOT NULL DEFAULT 0", "公司範本"),
        ("trashed", "TINYINT NOT NULL DEFAULT 0", "已移到資源回收筒"),
        ("version", "INT NOT NULL DEFAULT 1", "目前版本號"),
        ("editing_by", "VARCHAR(30) NOT NULL DEFAULT ''", "正在編輯的人（避免兩人同時改）"),
        ("editing_at", "DATETIME NULL", "編輯心跳時間"),
        ("updated_by", "VARCHAR(30) NOT NULL DEFAULT ''", "最後修改人"),
        ("created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "建立時間"),
        ("updated_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "最後修改")],
     ["KEY ix_owner (owner)", "KEY ix_folder (folder_id)"]),
    ("zo_doc_version", "文件版本（每次儲存保留前一版）", [
        ("id", "INT NOT NULL AUTO_INCREMENT PRIMARY KEY", "流水號"),
        ("doc_id", "INT NOT NULL", "文件"),
        ("version", "INT NOT NULL", "版本號"),
        ("path", "VARCHAR(600) NOT NULL", "版本檔案（文件庫 .versions 內的相對路徑）"),
        ("size", "BIGINT NOT NULL DEFAULT 0", "大小"),
        ("uid", "VARCHAR(30) NOT NULL DEFAULT ''", "存檔人"),
        ("created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "時間")], ["KEY ix_doc (doc_id)"]),
    ("zo_recent", "最近開啟", [
        ("uid", "VARCHAR(30) NOT NULL", "使用者"),
        ("doc_id", "INT NOT NULL", "文件"),
        ("opened_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "開啟時間")], ["PRIMARY KEY (uid, doc_id)"]),
    ("zo_script", "巨集與 Apps Script 專案", [
        ("id", "INT NOT NULL AUTO_INCREMENT PRIMARY KEY", "流水號"),
        ("owner", "VARCHAR(30) NOT NULL", "建立人"),
        ("name", "VARCHAR(120) NOT NULL", "名稱"),
        ("lang", "VARCHAR(6) NOT NULL DEFAULT 'gas'", "gas＝Google Apps Script 寫法；oo＝ONLYOFFICE 巨集寫法"),
        ("kind", "VARCHAR(8) NOT NULL DEFAULT 'any'", "適用：word、cell、slide、diagram、any"),
        ("doc_id", "INT NULL", "綁定的文件（空白＝獨立專案，任何文件都能用）"),
        ("code", "MEDIUMTEXT", "程式碼"),
        ("shortcut", "VARCHAR(20) NOT NULL DEFAULT ''", "快速鍵"),
        ("shared", "TINYINT NOT NULL DEFAULT 0", "共用給其他使用者"),
        ("updated_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "最後修改")], ["KEY ix_owner (owner)"]),
    ("zo_pref", "個人偏好（語系、AI 選擇、上次設定）", [
        ("uid", "VARCHAR(30) NOT NULL PRIMARY KEY", "帳號"),
        ("data", "TEXT", "設定（JSON）")], []),
]


def ddl():
    out = []
    for name, title, cols, extra in TABLES:
        body = ["  `%s` %s COMMENT '%s'" % (c, t, d.replace("'", "''")) for c, t, d in cols]
        body += ["  " + x for x in extra]
        out.append("CREATE TABLE IF NOT EXISTS `%s` (\n%s\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 "
                   "COLLATE=utf8mb4_unicode_ci COMMENT='%s'" % (name, ",\n".join(body), title))
    return out
