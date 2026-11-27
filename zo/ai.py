"""AI 助理：免費與付費的 AI 服務都能接（摘要、改寫、翻譯、校對、產生公式、簡報大綱…）。

設定存在 sys_meta 'ai'：{"default": "pollinations", "providers": {"openai": {"key": "...", "model": "..."}}}
畫面只會拿到金鑰末四碼。Claude 走官方 anthropic SDK；其他服務都是 OpenAI 相容的 /chat/completions。
"""
import json
import urllib.error
import urllib.request

from . import APP_ID, APP_VERSION
from .core import BizError

# 代號: (顯示名稱, 收費說明, 預設網址, 預設模型, 是否需要金鑰, 取得金鑰網址)
PROVIDERS = {
    "pollinations": ("Pollinations（免費、不用金鑰）", "免費", "https://text.pollinations.ai/openai", "openai", False,
                     "https://pollinations.ai"),
    "gemini": ("Google Gemini", "有免費額度", "https://generativelanguage.googleapis.com/v1beta/openai",
               "gemini-2.5-flash", True, "https://aistudio.google.com/apikey"),
    "groq": ("Groq", "有免費額度", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", True,
             "https://console.groq.com/keys"),
    "openrouter": ("OpenRouter", "有免費模型", "https://openrouter.ai/api/v1", "openrouter/free", True,
                   "https://openrouter.ai/keys"),
    "ollama": ("Ollama（本機，免費）", "免費（在自己電腦執行）", "http://127.0.0.1:11434/v1", "qwen2.5:7b", False,
               "https://ollama.com/download"),
    "anthropic": ("Anthropic Claude", "付費", "https://api.anthropic.com", "claude-opus-5-5", True,
                  "https://console.anthropic.com/settings/keys"),
    "openai": ("OpenAI ChatGPT", "付費", "https://api.openai.com/v1", "gpt-5-mini", True,
               "https://platform.openai.com/api-keys"),
    "deepseek": ("DeepSeek", "付費（便宜）", "https://api.deepseek.com/v1", "deepseek-chat", True,
                 "https://platform.deepseek.com/api_keys"),
    "mistral": ("Mistral", "有免費額度", "https://api.mistral.ai/v1", "mistral-small-latest", True,
                "https://console.mistral.ai/api-keys"),
    "custom": ("自訂（OpenAI 相容）", "依服務", "", "", True, ""),
}
CLAUDE_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"]


class AIError(BizError):
    pass


def merge_config(old, body):
    """body: {default, providers: {id: {key?, model?, url?, enabled?}}}；key 留空＝不改，key='-'＝清除。"""
    cfg = {"default": old.get("default") or "pollinations", "providers": dict(old.get("providers") or {})}
    if body.get("default") in PROVIDERS:
        cfg["default"] = body["default"]
    for pid, v in (body.get("providers") or {}).items():
        if pid not in PROVIDERS:
            continue
        cur = dict(cfg["providers"].get(pid) or {})
        for k in ("model", "url", "enabled"):
            if k in v:
                cur[k] = v[k]
        if v.get("key") == "-":
            cur.pop("key", None)
        elif v.get("key"):
            cur["key"] = v["key"].strip()
        cfg["providers"][pid] = cur
    return cfg


def public_config(cfg):
    out = {"default": cfg.get("default") or "pollinations", "providers": [], "claude_models": CLAUDE_MODELS}
    for pid, (name, price, url, model, need_key, key_url) in PROVIDERS.items():
        p = (cfg.get("providers") or {}).get(pid) or {}
        key = p.get("key") or ""
        out["providers"].append(dict(
            id=pid, name=name, price=price, need_key=need_key, key_url=key_url,
            url=p.get("url") or url, model=p.get("model") or model, default_model=model,
            has_key=bool(key), key_hint=("●●●●" + key[-4:]) if key else "",
            ready=(bool(key) or not need_key) and bool(p.get("url") or url),
            enabled=p.get("enabled", True)))
    return out


def _resolve(cfg, provider, model):
    pid = provider or cfg.get("default") or "pollinations"
    if pid not in PROVIDERS:
        raise AIError("不明的 AI 服務：%s" % pid)
    name, _, url, dmodel, need_key, _ = PROVIDERS[pid]
    p = (cfg.get("providers") or {}).get(pid) or {}
    key = p.get("key") or ""
    if need_key and not key:
        raise AIError("「%s」還沒有設定金鑰，請到「AI 設定」輸入，或改用免費的 Pollinations／Ollama。" % name)
    return pid, name, (p.get("url") or url).rstrip("/"), model or p.get("model") or dmodel, key


def chat(cfg, provider, model, messages, system="", temperature=0.4):
    """messages: [{role: user|assistant, content: str}] → {text, provider, model}"""
    pid, name, url, model, key = _resolve(cfg, provider, model)
    msgs = [m for m in messages if m.get("role") in ("user", "assistant") and m.get("content")]
    if not msgs:
        raise AIError("沒有要問 AI 的內容")
    try:
        if pid == "anthropic":
            text = _claude(key, model, msgs, system)
        else:
            text = _openai_compat(pid, url, key, model, msgs, system, temperature)
    except AIError:
        raise
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        raise AIError("%s 回應錯誤（%s）：%s" % (name, e.code, detail))
    except urllib.error.URLError as e:
        raise AIError("連不到 %s：%s" % (name, e.reason))
    return dict(text=text, provider=pid, model=model)


def test(cfg, provider):
    r = chat(cfg, provider, None, [{"role": "user", "content": "請只回答兩個字：你好"}])
    return dict(ok=True, reply=r["text"][:80], model=r["model"])


def _openai_compat(pid, url, key, model, msgs, system, temperature):
    body = {"model": model, "messages": ([{"role": "system", "content": system}] if system else []) + msgs}
    if pid not in ("openai",):              # 新版 OpenAI 推理模型不接受 temperature
        body["temperature"] = temperature
    headers = {"Content-Type": "application/json", "User-Agent": "%s/%s" % (APP_ID, APP_VERSION)}
    if key:
        headers["Authorization"] = "Bearer " + key
    if pid == "openrouter":
        headers["X-Title"] = "ZMS Office"
    req = urllib.request.Request(url + "/chat/completions", data=json.dumps(body).encode("utf-8"), headers=headers)
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read().decode("utf-8"))
    try:
        return data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError):
        raise AIError("AI 回應格式看不懂：%s" % json.dumps(data, ensure_ascii=False)[:300])


def _claude(key, model, msgs, system):
    try:
        import anthropic
    except ImportError:
        raise AIError("這個版本沒有附 Claude 元件，請更新程式")
    client = anthropic.Anthropic(api_key=key, timeout=180.0)
    kw = dict(model=model, max_tokens=16000, messages=msgs)
    if system:
        kw["system"] = system
    try:
        resp = client.messages.create(**kw)
    except anthropic.AuthenticationError:
        raise AIError("Claude 金鑰不正確")
    except anthropic.RateLimitError:
        raise AIError("Claude 使用量超過限制，請稍後再試")
    except anthropic.APIStatusError as e:
        raise AIError("Claude 回應錯誤（%s）：%s" % (e.status_code, str(e)[:300]))
    except anthropic.APIConnectionError as e:
        raise AIError("連不到 Claude：%s" % e)
    if resp.stop_reason == "refusal":
        raise AIError("Claude 拒絕回答這個要求")
    return "".join(b.text for b in resp.content if b.type == "text")
