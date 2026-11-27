"""補齊 ONLYOFFICE 編輯器語系檔缺的字串。

原因：web-apps 的語系檔都比 en.json 少字串，有些字串只存在語系檔裡，
缺了會變成 undefined，工具提示讀到時整個編輯器跳出「處理文件時發生錯誤」。
做法：每個語系檔缺的鍵補上英文；繁體中文（zh-tw）若簡體中文（zh）有翻譯，
先用 OpenCC（有安裝才用）轉成台灣繁體，沒有才用英文。可重複執行。

python tools/locale_fill.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS = os.path.join(ROOT, "vendor", "onlyoffice", "web-apps", "apps")


def s2tw():
    try:
        import opencc
        cc = opencc.OpenCC("s2twp")
        return cc.convert
    except Exception:
        return None


def locale_dirs():
    for app in sorted(os.listdir(APPS)):
        for sub in ("main/locale", "mobile/locale", "forms/locale", "embed/locale"):
            d = os.path.join(APPS, app, *sub.split("/"))
            if os.path.isfile(os.path.join(d, "en.json")):
                yield d


def load(p):
    with open(p, encoding="utf-8-sig") as f:
        return json.load(f)


def main():
    conv = s2tw()
    total = 0
    for d in locale_dirs():
        en = load(os.path.join(d, "en.json"))
        zh = load(os.path.join(d, "zh.json")) if os.path.isfile(os.path.join(d, "zh.json")) else {}
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".json") or fn == "en.json":
                continue
            p = os.path.join(d, fn)
            try:
                tr = load(p)
            except Exception as e:
                print("略過", p, e)
                continue
            missing = [k for k in en if k not in tr]
            if not missing:
                continue
            merged = {}
            for k, v in en.items():
                if k in tr:
                    merged[k] = tr[k]
                elif fn == "zh-tw.json" and conv and isinstance(zh.get(k), str):
                    merged[k] = conv(zh[k])
                else:
                    merged[k] = v
            for k, v in tr.items():
                merged.setdefault(k, v)
            with open(p, "w", encoding="utf-8") as f:
                json.dump(merged, f, ensure_ascii=False, separators=(",", ":"))
            total += len(missing)
            print("%s/%s 補 %d" % (os.path.relpath(d, APPS), fn, len(missing)))
    print("共補 %d 個字串%s" % (total, "" if conv else "（未安裝 opencc，zh-tw 缺字用英文）"))


if __name__ == "__main__":
    sys.exit(main())
