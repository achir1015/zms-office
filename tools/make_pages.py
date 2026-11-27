"""產生線上版（GitHub Pages）與手機 App 用的網頁：web/ → docs/

- index.html 加入 js/local.js（瀏覽器內的核心：IndexedDB 存文件與設定）與 js/convert.js（備份 ZIP）
- 編輯器元件：vendor/（或 build/vendor）整理後複製到 docs/vendor（拿掉 draw.io 用不到的部分）
- PWA：manifest.webmanifest、sw.js（只快取程式畫面；編輯器元件交給瀏覽器的一般快取）
- docs/ios（iPhone／iPad 安裝頁）另外維護，不會被刪掉

用法：python tools/make_pages.py [--no-vendor | --keep-vendor]
"""
import hashlib
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from zo import APP_NAME, APP_VERSION  # noqa: E402

WEB = os.path.join(HERE, "web")
OUT = os.path.join(HERE, "docs")
DRAWIO_DROP = ["js/diagramly", "js/integrate.min.js", "js/onedrive", "connect", "onedrive3.html", "teams.html",
               "monday-app-association.json", "service-worker.js", "service-worker.js.map", "clear.html"]
SKIP = shutil.ignore_patterns("__pycache__", "*.map", "*.orig", "t_editor.html")


def copy_vendor():
    src = next((p for p in (os.path.join(HERE, "build", "vendor"), os.path.join(HERE, "vendor"))
                if os.path.isfile(os.path.join(p, "onlyoffice", "web-apps", "apps", "api", "documents", "api.js"))), None)
    if not src:
        raise SystemExit("找不到編輯器元件：請先執行 tools/fetch_vendor.py")
    dst = os.path.join(OUT, "vendor")
    shutil.copytree(src, dst, ignore=SKIP)
    for x in DRAWIO_DROP:
        p = os.path.join(dst, "drawio", x)
        if os.path.isdir(p):
            shutil.rmtree(p)
        elif os.path.isfile(p):
            os.remove(p)


def main():
    keep = {"ios"} | ({"vendor"} if "--keep-vendor" in sys.argv else set())
    if os.path.isdir(OUT):
        for n in os.listdir(OUT):
            if n in keep:
                continue
            p = os.path.join(OUT, n)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    os.makedirs(OUT, exist_ok=True)
    for n in os.listdir(WEB):
        s, d = os.path.join(WEB, n), os.path.join(OUT, n)
        if os.path.isdir(s):
            shutil.copytree(s, d, ignore=SKIP)
        elif n != "t_editor.html":
            shutil.copy2(s, d)
    vm = os.path.join(OUT, "assets", "voice", "manifest.json")
    if os.path.isfile(vm):
        os.remove(vm)

    p = os.path.join(OUT, "index.html")
    html = open(p, encoding="utf-8").read()
    html = html.replace('<script src="js/api.js"></script>',
                        '<script>window.ZO_WEB_VERSION = %s;</script>\n<script src="js/api.js"></script>\n'
                        '<script src="js/convert.js"></script>\n<script src="js/local.js"></script>' % json.dumps(APP_VERSION), 1)
    html = html.replace('<link rel="manifest" href="manifest.json">',
                        '<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#2b579a">\n'
                        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
                        '<meta name="apple-mobile-web-app-title" content="文件office">', 1)
    html = html.replace("</body>", "<script>if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.ZMSIOS && !window.ZMSAndroid)"
                                   " navigator.serviceWorker.register('sw.js');</script>\n</body>", 1)
    open(p, "w", encoding="utf-8").write(html)

    json.dump({"name": APP_NAME, "short_name": "文件office", "start_url": "./", "scope": "./", "display": "standalone",
               "background_color": "#f3f3f3", "theme_color": "#2b579a", "lang": "zh-TW",
               "icons": [{"src": "assets/icon-192.png", "sizes": "192x192", "type": "image/png"},
                         {"src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}]},
              open(os.path.join(OUT, "manifest.webmanifest"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    shell = []
    for root, _, files in os.walk(OUT):
        rel = os.path.relpath(root, OUT).replace("\\", "/")
        if rel.startswith(("vendor", "ios", "assets/voice", "lib/notebooklm/icons")):
            continue
        for f in files:
            if f in ("sw.js",):
                continue
            shell.append(("" if rel == "." else rel + "/") + f)
    h = hashlib.sha1()
    for f in sorted(shell):
        h.update(open(os.path.join(OUT, f), "rb").read())
    cache = "zms-office-%s-%s" % (APP_VERSION, h.hexdigest()[:8])
    sw = """// 線上版 Service Worker：程式畫面離線可用（網路優先）；編輯器元件（vendor/）走瀏覽器一般快取
const CACHE = %s;
const SHELL = %s;
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/vendor/')) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
""" % (json.dumps(cache), json.dumps(["./"] + sorted(shell), ensure_ascii=False))
    open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8").write(sw)
    if "--no-vendor" not in sys.argv and "--keep-vendor" not in sys.argv:
        copy_vendor()
    print("docs/ 完成（%s）" % cache)


if __name__ == "__main__":
    main()
