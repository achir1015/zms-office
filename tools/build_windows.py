"""一鍵建置 Windows 安裝檔：
1. 檢查內附 MariaDB（packaging/mariadb）、編輯器元件（vendor/onlyoffice、vendor/drawio）
2. 產生圖示、多語系、教學語音（已存在且沒變則略過）
3. PyInstaller 打包主程式 ZMSOffice.exe ＋ MCP 伺服器 ZMSOfficeMCP.exe 到 dist/ZMSOffice
4. 整理編輯器元件到 build/vendor（拿掉開發用檔案）
5. Inno Setup 產生 dist-installer/ZMSOffice-Setup-<版本>.exe

用法：.venv\\Scripts\\python tools\\build_windows.py
"""
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from zo import APP_ID, APP_NAME, APP_VERSION, AUTHOR  # noqa: E402

ISCC = [os.path.expandvars(r"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"),
        r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe", r"C:\Program Files\Inno Setup 6\ISCC.exe"]
PY = os.path.join(HERE, ".venv", "Scripts", "python.exe")
ENV = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")

# draw.io 裡用不到的檔案（線上整合、開發原始碼、Service Worker、原始碼對照）
DRAWIO_DROP = ["js/diagramly", "js/integrate.min.js", "js/onedrive", "connect", "onedrive3.html", "teams.html",
               "monday-app-association.json", "service-worker.js", "service-worker.js.map", "clear.html"]


def prepare():
    for need, msg in (("packaging/mariadb/bin/mariadbd.exe", "缺少 packaging/mariadb"),
                      ("vendor/onlyoffice/web-apps/apps/api/documents/api.js", "缺少 vendor/onlyoffice（tools/fetch_vendor.py）"),
                      ("vendor/drawio/index.html", "缺少 vendor/drawio（tools/fetch_vendor.py）")):
        if not os.path.isfile(os.path.join(HERE, need)):
            raise SystemExit(msg)
    if not os.path.isfile(os.path.join(HERE, "web", "assets", "icon.png")):
        subprocess.run([PY, "tools/make_icon.py"], cwd=HERE, check=True, env=ENV)
    subprocess.run([PY, "tools/i18n_keys.py", "--build"], cwd=HERE, check=True, env=ENV)
    subprocess.run([PY, "tools/make_voice.py"], cwd=HERE, check=False, env=ENV)
    v = APP_VERSION.split(".") + ["0"] * 4
    nums = ", ".join(v[:4])
    vi = f"""VSVersionInfo(ffi=FixedFileInfo(filevers=({nums}), prodvers=({nums})),
  kids=[StringFileInfo([StringTable('040404B0', [StringStruct('CompanyName', '{AUTHOR}'),
  StringStruct('FileDescription', '{APP_NAME}'), StringStruct('FileVersion', '{APP_VERSION}'),
  StringStruct('ProductName', '{APP_NAME}'), StringStruct('ProductVersion', '{APP_VERSION}'),
  StringStruct('LegalCopyright', '© 2026 {AUTHOR}')])]), VarFileInfo([VarStruct('Translation', [1028, 1200])])])"""
    os.makedirs(os.path.join(HERE, "build"), exist_ok=True)
    with open(os.path.join(HERE, "build", "version.txt"), "w", encoding="utf-8") as f:
        f.write(vi)


def vendor():
    dst = os.path.join(HERE, "build", "vendor")
    shutil.rmtree(dst, ignore_errors=True)
    print("整理編輯器元件…")
    shutil.copytree(os.path.join(HERE, "vendor", "onlyoffice"), os.path.join(dst, "onlyoffice"),
                    ignore=shutil.ignore_patterns("*.map", "*.orig"))
    shutil.copytree(os.path.join(HERE, "vendor", "drawio"), os.path.join(dst, "drawio"), ignore=shutil.ignore_patterns("*.map"))
    for x in DRAWIO_DROP:
        p = os.path.join(dst, "drawio", x)
        if os.path.isdir(p):
            shutil.rmtree(p)
        elif os.path.isfile(p):
            os.remove(p)
    size = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(dst) for f in fs)
    print("編輯器元件 %.0f MB" % (size / 1e6))


def pack():
    shutil.rmtree(os.path.join(HERE, "dist"), ignore_errors=True)
    subprocess.run([PY, "-m", "PyInstaller", "packaging/ZMSOffice.spec", "--noconfirm", "--clean",
                    "--distpath", "dist", "--workpath", "build/pyi"], cwd=HERE, check=True, env=ENV)
    for junk in ("web/assets/voice/manifest.json", "web/t_editor.html"):
        p = os.path.join(HERE, "dist", APP_ID, "_internal", junk)
        if os.path.isfile(p):
            os.remove(p)


def installer():
    iscc = next((p for p in ISCC if os.path.isfile(p)), None)
    if not iscc:
        raise SystemExit("找不到 Inno Setup 6（ISCC.exe）")
    tmp = tempfile.mkdtemp(prefix="zmsoffice-iss-")
    subprocess.run([iscc, "/DAppVer=" + APP_VERSION, "/O" + tmp, os.path.join(HERE, "packaging", "installer.iss")], check=True)
    name = "%s-Setup-%s.exe" % (APP_ID, APP_VERSION)
    out = os.path.join(HERE, "dist-installer", name)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    shutil.move(os.path.join(tmp, name), out)
    shutil.rmtree(tmp, ignore_errors=True)
    h = hashlib.sha256()
    with open(out, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    print("完成：%s（%.1f MB）\nSHA256 %s" % (out, os.path.getsize(out) / 1e6, h.hexdigest()))


if __name__ == "__main__":
    steps = sys.argv[1:] or ["prepare", "vendor", "pack", "installer"]
    for s in steps:
        globals()[s]()
