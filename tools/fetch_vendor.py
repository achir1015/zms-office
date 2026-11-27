"""下載並整理編輯器元件到 vendor/（不進 git，約 600 MB）：

* vendor/onlyoffice：ONLYOFFICE Docs 9.3 離線版（sdkjs、web-apps、字型、x2t WebAssembly），取自 ranuts/document（AGPL v3）
  固定在 RANUTS_COMMIT；x2t.wasm.br 解壓成原始 wasm（一般伺服器與 GitHub Pages 不會送 Content-Encoding: br）；
  x2t_helper.js 補上範本、含巨集、OpenDocument 範本等格式；語系檔補齊缺字（tools/locale_fill.py）。
* vendor/drawio：draw.io 網頁版（jgraph/drawio，Apache 2.0）draw.war。

用法：python tools/fetch_vendor.py（需要 git 與網路）
"""
import io
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(ROOT, "vendor")
RANUTS = "https://github.com/ranuts/document.git"
RANUTS_COMMIT = "4cc2bc5"
DRAWIO = "https://github.com/jgraph/drawio/releases/download/v32.7.7/draw.war"

EXTRA_FORMATS = """            // 資料助秘文件office彙整：補上 x2t 支援的其他格式（範本、含巨集、OpenDocument 範本、電子書）
            docm: 'word', dotx: 'word', dotm: 'word', dot: 'word', ott: 'word', fb2: 'word', epub: 'word',
            html: 'word', htm: 'word', mht: 'word', mhtml: 'word', wps: 'word', wpt: 'word', xml: 'word',
            xlsm: 'cell', xltx: 'cell', xltm: 'cell', xlt: 'cell', ots: 'cell', xlsb: 'cell', et: 'cell', ett: 'cell',
            pptm: 'slide', ppsx: 'slide', pps: 'slide', ppsm: 'slide', potx: 'slide', potm: 'slide', pot: 'slide',
            otp: 'slide', dps: 'slide', dpt: 'slide',
            xps: 'pdf', oxps: 'pdf', djvu: 'pdf', ofd: 'pdf'
"""


def onlyoffice():
    import brotli  # noqa: F401  （pip install brotli）
    tmp = tempfile.mkdtemp(prefix="zo-ranuts-")
    try:
        subprocess.run(["git", "clone", "--filter=blob:none", "--no-checkout", RANUTS, tmp], check=True)
        subprocess.run(["git", "-C", tmp, "checkout", RANUTS_COMMIT, "--", "public/sdkjs", "public/web-apps",
                        "public/fonts", "LICENSE", "NOTICE"], check=True)
        dst = os.path.join(VENDOR, "onlyoffice")
        shutil.rmtree(dst, ignore_errors=True)
        os.makedirs(dst)
        for d in ("sdkjs", "web-apps", "fonts"):
            shutil.copytree(os.path.join(tmp, "public", d), os.path.join(dst, d))
        shutil.copy(os.path.join(tmp, "LICENSE"), os.path.join(dst, "LICENSE"))
        shutil.copy(os.path.join(tmp, "NOTICE"), os.path.join(dst, "NOTICE.ranuts"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    x2t = os.path.join(VENDOR, "onlyoffice", "sdkjs", "common", "wasm", "x2t")
    import brotli
    p = os.path.join(x2t, "x2t.wasm.br")
    raw = brotli.decompress(open(p, "rb").read())
    assert raw[:4] == b"\0asm"
    open(p, "wb").write(raw)
    h = os.path.join(x2t, "x2t_helper.js")
    s = open(h, encoding="utf-8").read()
    if "資料助秘文件office彙整" not in s:
        s = s.replace("            odp: 'slide'\n        };", "            odp: 'slide',\n" + EXTRA_FORMATS + "        };")
        open(h, "w", encoding="utf-8").write(s)
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "locale_fill.py")], check=True)


def drawio():
    data = urllib.request.urlopen(urllib.request.Request(DRAWIO, headers={"User-Agent": "zms-office-build"})).read()
    dst = os.path.join(VENDOR, "drawio")
    shutil.rmtree(dst, ignore_errors=True)
    zipfile.ZipFile(io.BytesIO(data)).extractall(dst)
    for x in ("WEB-INF", "META-INF"):
        shutil.rmtree(os.path.join(dst, x), ignore_errors=True)


if __name__ == "__main__":
    os.makedirs(VENDOR, exist_ok=True)
    onlyoffice()
    drawio()
    print("vendor 完成")
