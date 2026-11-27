"""產生語音動態教學的語音：web/assets/voice/<課程>-<第幾句>.mp3（微軟 Edge 神經語音 臺灣華語 曉臻，免費）。

課程內容讀 web/js/lessons.js（和畫面共用同一份）。已存在且內容沒變的會略過。
用法：python tools/make_voice.py   （需要網路）
"""
import asyncio
import hashlib
import json
import os
import re

import edge_tts

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "web", "assets", "voice")
MANIFEST = os.path.join(OUT, "manifest.json")
VOICE = "zh-TW-HsiaoChenNeural"


def lessons():
    src = open(os.path.join(HERE, "web", "js", "lessons.js"), encoding="utf-8").read()
    body = src[src.index("["):src.rindex("]") + 1]
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    body = re.sub(r"([{,]\s*)([A-Za-z_]\w*)\s*:", r'\1"\2":', body)      # 物件鍵加引號
    body = body.replace("'", '"')
    body = re.sub(r",\s*([\]}])", r"\1", body)                          # 去掉結尾逗號
    return json.loads(body)


async def main():
    os.makedirs(OUT, exist_ok=True)
    done = json.load(open(MANIFEST, encoding="utf-8")) if os.path.isfile(MANIFEST) else {}
    n = 0
    for L in lessons():
        for i, st in enumerate(L["steps"]):
            key = "%s-%d" % (L["id"], i + 1)
            text = st["say"]
            h = hashlib.sha1((VOICE + text).encode("utf-8")).hexdigest()
            path = os.path.join(OUT, key + ".mp3")
            if done.get(key) == h and os.path.isfile(path):
                continue
            for k in range(5):
                try:
                    await edge_tts.Communicate(text, VOICE, rate="+5%").save(path)
                    break
                except Exception as e:                    # edge-tts 偶爾回 503，稍等再試
                    print("retry", key, e)
                    await asyncio.sleep(3 + k * 3)
            else:
                raise SystemExit("語音產生失敗：" + key)
            done[key] = h
            n += 1
            print("ok", key, os.path.getsize(path))
    json.dump(done, open(MANIFEST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("新產生", n, "句")


if __name__ == "__main__":
    asyncio.run(main())
