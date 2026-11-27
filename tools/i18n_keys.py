"""列出畫面上所有要翻譯的繁中字串（t('…')、data-t、課程、權限名稱），比對各語系檔缺哪些。

python tools/i18n_keys.py            # 統計
python tools/i18n_keys.py --dump     # 輸出 tools/i18n/keys.json（給翻譯用）
python tools/i18n_keys.py --build    # 由 tools/i18n/<語系>.json 產生 web/i18n/<語系>.js；zh-CN 用 OpenCC 自動轉
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
SRC = os.path.join(ROOT, "tools", "i18n")
LANGS = ["en", "ja", "ko", "vi", "id", "th", "fr", "de", "es"]
CJK = re.compile(r"[㐀-鿿]")


def keys():
    out = []
    pat = re.compile(r"""\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1""")
    for fn in sorted(os.listdir(os.path.join(WEB, "js"))):
        if not fn.endswith(".js"):
            continue
        s = open(os.path.join(WEB, "js", fn), encoding="utf-8").read()
        for m in pat.finditer(s):
            out.append(m.group(2).replace("\\'", "'").replace('\\"', '"'))
        if fn == "lessons.js":
            out += re.findall(r"(?:title|desc|say): '((?:\\.|[^'])*)'", s)
        if fn in ("api.js",):
            out += re.findall(r"name: '([^']+)'", s) + re.findall(r"new: '([^']+)'", s)
        if fn == "app.js":
            out += re.findall(r"\['\w+', '([^']+)'\]", s)
        if fn == "aipanel.js":
            out += re.findall(r"\['([^']+)', '", s)
        if fn == "editor.js":
            out += re.findall(r"\['[A-Z]+', '([^']+)'\]", s)
        if fn == "scripts.js":
            out += re.findall(r"\[\s*'([^']*範例[^']*)'", s)
    for fn in ("index.html", "editor.html", "diagram.html"):
        s = open(os.path.join(WEB, fn), encoding="utf-8").read()
        out += re.findall(r'data-t(?:p|t)?="([^"]+)"', s)
    sys.path.insert(0, ROOT)
    from zo.seed import FUNCS, ROLES
    from zo import ai, APP_NAME, CREDIT
    for f in FUNCS:
        out += [f[1], f[2]]
    out += list(ROLES) + [APP_NAME, CREDIT, "早安", "午安", "晚安", "文件office彙整"]
    for p in ai.PROVIDERS.values():
        out += [p[0], p[1]]
    seen, res = set(), []
    for k in out:
        if k and CJK.search(k) and k not in seen:
            seen.add(k)
            res.append(k)
    return res


def main():
    ks = keys()
    os.makedirs(SRC, exist_ok=True)
    if "--dump" in sys.argv:
        json.dump(ks, open(os.path.join(SRC, "keys.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print("共 %d 個字串" % len(ks))
    for lang in LANGS:
        p = os.path.join(SRC, lang + ".json")
        d = json.load(open(p, encoding="utf-8")) if os.path.isfile(p) else {}
        miss = [k for k in ks if k not in d]
        print("%-3s 缺 %d" % (lang, len(miss)))
    if "--build" in sys.argv:
        os.makedirs(os.path.join(WEB, "i18n"), exist_ok=True)
        import opencc
        cc = opencc.OpenCC("tw2sp")
        dicts = {"zh-CN": {k: cc.convert(k) for k in ks}}
        for lang in LANGS:
            p = os.path.join(SRC, lang + ".json")
            if os.path.isfile(p):
                dicts[lang] = {k: v for k, v in json.load(open(p, encoding="utf-8")).items() if k in set(ks) and v}
        for lang, d in dicts.items():
            with open(os.path.join(WEB, "i18n", lang + ".js"), "w", encoding="utf-8") as f:
                f.write("/* 自動產生（tools/i18n_keys.py --build），請改 tools/i18n/%s.json */\n" % lang)
                f.write("(window.ZO_I18N = window.ZO_I18N || {})[%s] = %s;\n" % (json.dumps(lang), json.dumps(d, ensure_ascii=False, indent=0)))
            print("寫入 web/i18n/%s.js（%d）" % (lang, len(d)))


if __name__ == "__main__":
    main()
