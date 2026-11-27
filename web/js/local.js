/* 線上版／手機版的「本機核心」：取代電腦版的 Python 伺服器與 MariaDB。
 * 只有 docs/（線上版）與手機 App 會載入這個檔（放在 api.js 後面，由 tools/make_pages.py 加進 index.html）。
 * - 文件、版本、資料夾、巨集、設定都存在瀏覽器的 IndexedDB（不上傳到任何伺服器）
 * - 沒有帳號：一個本機使用者，擁有全部權限
 * - AI 助理直接從瀏覽器呼叫所選的服務（金鑰只存在這台裝置）
 */
(function () {
  const ZO = window.ZO;
  ZO.WEB = true;
  ZO.key = 'web';
  ZO.sid = 'web';
  const t = ZO.t;
  const VERSION = window.ZO_WEB_VERSION || '0.9.0';
  const FUNCS = [['WORD', 'DataWord 文書'], ['EXCEL', 'DataExcel 試算表'], ['PPT', 'DataPowerPoint 簡報'], ['PDF', 'DataPDF'],
    ['DIAGRAM', 'DataDiagram 流程圖'], ['SHARE', '共用文件'], ['AI', 'AI 助理'], ['DEV', '開發人員'], ['SYS', '系統管理']];
  const PERMS = Object.fromEntries(FUNCS.map((f) => [f[0], 2]));
  const KINDS = {
    word: ['docx', 'doc', 'docm', 'dotx', 'dotm', 'dot', 'odt', 'ott', 'rtf', 'txt', 'html', 'htm', 'mht', 'mhtml', 'xml', 'epub', 'fb2', 'wps', 'wpt'],
    cell: ['xlsx', 'xls', 'xlsm', 'xlsb', 'xltx', 'xltm', 'xlt', 'ods', 'ots', 'csv', 'et', 'ett'],
    slide: ['pptx', 'ppt', 'pptm', 'ppsx', 'pps', 'ppsm', 'potx', 'potm', 'pot', 'odp', 'otp', 'dps', 'dpt'],
    pdf: ['pdf', 'xps', 'oxps', 'djvu', 'ofd'],
    diagram: ['drawio', 'dio', 'vsdx', 'mmd'],
  };
  const EXT_KIND = {};
  for (const [k, es] of Object.entries(KINDS)) for (const e of es) EXT_KIND[e] = k;
  const USER = { uid: 'local', name: t('本機使用者'), is_admin: true, perms: PERMS };
  const KEEP_VERSIONS = 30;

  // ------------------------------------------------------------ IndexedDB
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('zms-office', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('docs', { keyPath: 'id', autoIncrement: true });
        d.createObjectStore('files');                                         // doc id → Blob
        d.createObjectStore('versions', { keyPath: 'id', autoIncrement: true }).createIndex('doc', 'doc_id');
        d.createObjectStore('folders', { keyPath: 'id', autoIncrement: true });
        d.createObjectStore('scripts', { keyPath: 'id', autoIncrement: true });
        d.createObjectStore('kv');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tr = d.transaction(store, mode);
      const s = tr.objectStore(store);
      let out;
      Promise.resolve(fn(s)).then((v) => (out = v));
      tr.oncomplete = () => res(out);
      tr.onerror = () => rej(tr.error);
      tr.onabort = () => rej(tr.error || new Error(t('儲存失敗（瀏覽器空間可能不足）')));
    });
  }
  const P = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  const all = (store) => tx(store, 'readonly', (s) => P(s.getAll()));
  const getOne = (store, k) => tx(store, 'readonly', (s) => P(s.get(k)));
  const put = (store, v, k) => tx(store, 'readwrite', (s) => P(k === undefined ? s.put(v) : s.put(v, k)));
  const del = (store, k) => tx(store, 'readwrite', (s) => P(s.delete(k)));
  const kv = async (k, def) => { const v = await getOne('kv', k); return v === undefined ? def : v; };
  const now = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); };
  const err = (m) => new Error(m);
  const clean = (n, fb) => (String(n || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().replace(/^\.+|\.+$/g, '').slice(0, 150) || fb || t('未命名'));
  const splitExt = (n) => { const i = n.lastIndexOf('.'); return i < 0 ? [n, ''] : [n.slice(0, i), n.slice(i + 1).toLowerCase()]; };
  // 檔案內容一律存成 ArrayBuffer（部分 WebKit 不能把 Blob 存進 IndexedDB）
  const toBuf = async (b) => (b instanceof ArrayBuffer ? b : b instanceof Blob ? b.arrayBuffer() : ArrayBuffer.isView(b) ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : new Uint8Array(b).buffer);

  function out(d) {
    const r = Object.assign({}, d);
    r.filename = d.name + '.' + d.ext;
    r.mine = true; r.can_write = true; r.owner = 'local';
    return r;
  }
  async function uniqueName(name, ext, folder, skip) {
    const docs = (await all('docs')).filter((d) => !d.trashed && (d.folder_id || null) === (folder || null) && d.ext === ext && d.id !== skip);
    let n = name, i = 1;
    while (docs.some((d) => d.name === n)) { i++; n = name + ' (' + i + ')'; }
    return n;
  }
  async function addDoc(name, ext, data, folder, extra) {
    const buf = await toBuf(data);
    const kind = EXT_KIND[ext];
    if (!kind) throw err(t('不支援的檔案格式：') + '.' + ext);
    const nm = await uniqueName(clean(name), ext, folder);
    const d = Object.assign({ folder_id: folder || null, name: nm, ext, kind, size: buf.byteLength, version: 1, starred: 0, shared: 0, is_template: 0,
      trashed: 0, linked: 0, created_at: now(), updated_at: now(), opened_at: now(), path: nm + '.' + ext }, extra || {});
    d.id = await put('docs', d);
    await put('files', buf, d.id);
    return d;
  }
  async function doc(id) { const d = await getOne('docs', +id); if (!d) throw err(t('找不到這份文件')); return d; }
  async function touch(d) { d.opened_at = now(); await put('docs', d); }

  async function saveDoc(id, data) {
    const d = await doc(id);
    const old = await getOne('files', d.id);
    if (old && old.byteLength) {
      await put('versions', { doc_id: d.id, version: d.version, blob: old, size: old.byteLength, uid: 'local', created_at: now() });
      const vs = (await all('versions')).filter((v) => v.doc_id === d.id).sort((a, b) => b.version - a.version);
      for (const v of vs.slice(KEEP_VERSIONS)) await del('versions', v.id);
    }
    const buf = await toBuf(data);
    await put('files', buf, d.id);
    Object.assign(d, { size: buf.byteLength, version: d.version + 1, updated_at: now() });
    await put('docs', d);
    return out(d);
  }

  // ------------------------------------------------------------ AI（直接從瀏覽器呼叫）
  const PROVIDERS = [
    ['pollinations', 'Pollinations（免費、不用金鑰）', '免費', 'https://text.pollinations.ai/openai', 'openai', false, 'https://pollinations.ai'],
    ['gemini', 'Google Gemini', '有免費額度', 'https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-2.5-flash', true, 'https://aistudio.google.com/apikey'],
    ['groq', 'Groq', '有免費額度', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile', true, 'https://console.groq.com/keys'],
    ['openrouter', 'OpenRouter', '有免費模型', 'https://openrouter.ai/api/v1', 'openrouter/free', true, 'https://openrouter.ai/keys'],
    ['ollama', 'Ollama（本機，免費）', '免費（在自己電腦執行）', 'http://127.0.0.1:11434/v1', 'qwen2.5:7b', false, 'https://ollama.com/download'],
    ['anthropic', 'Anthropic Claude', '付費', 'https://api.anthropic.com', 'claude-opus-5-5', true, 'https://console.anthropic.com/settings/keys'],
    ['openai', 'OpenAI ChatGPT', '付費', 'https://api.openai.com/v1', 'gpt-5-mini', true, 'https://platform.openai.com/api-keys'],
    ['deepseek', 'DeepSeek', '付費（便宜）', 'https://api.deepseek.com/v1', 'deepseek-chat', true, 'https://platform.deepseek.com/api_keys'],
    ['mistral', 'Mistral', '有免費額度', 'https://api.mistral.ai/v1', 'mistral-small-latest', true, 'https://console.mistral.ai/api-keys'],
    ['custom', '自訂（OpenAI 相容）', '依服務', '', '', true, ''],
  ];
  const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'];
  async function aiCfg() { return kv('ai', { default: 'pollinations', providers: {} }); }
  function publicCfg(cfg) {
    return { default: cfg.default || 'pollinations', claude_models: CLAUDE_MODELS, providers: PROVIDERS.map(([id, name, price, url, model, needKey, keyUrl]) => {
      const p = (cfg.providers || {})[id] || {};
      const key = p.key || '';
      return { id, name, price, need_key: needKey, key_url: keyUrl, url: p.url || url, model: p.model || model, default_model: model,
        has_key: !!key, key_hint: key ? '●●●●' + key.slice(-4) : '', ready: (!!key || !needKey) && !!(p.url || url), enabled: true };
    }) };
  }
  async function aiChat(body) {
    const cfg = await aiCfg();
    const pid = body.provider || cfg.default || 'pollinations';
    const def = PROVIDERS.find((x) => x[0] === pid);
    if (!def) throw err(t('不明的 AI 服務：') + pid);
    const p = (cfg.providers || {})[pid] || {};
    const key = p.key || '', url = (p.url || def[3]).replace(/\/$/, ''), model = body.model || p.model || def[4];
    if (def[5] && !key) throw err(t('「{0}」還沒有設定金鑰，請到「AI 設定」輸入，或改用免費的 Pollinations／Ollama。', t(def[1])));
    const msgs = (body.messages || []).filter((m) => m.content && (m.role === 'user' || m.role === 'assistant'));
    let r, j;
    try {
      if (pid === 'anthropic') {
        r = await fetch(url + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify(Object.assign({ model, max_tokens: 16000, messages: msgs }, body.system ? { system: body.system } : {})) });
        j = await r.json();
        if (!r.ok) throw err('Claude ' + t('回應錯誤') + '（' + r.status + '）：' + JSON.stringify(j).slice(0, 300));
        if (j.stop_reason === 'refusal') throw err(t('Claude 拒絕回答這個要求'));
        return { text: (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''), provider: pid, model };
      }
      const payload = { model, messages: (body.system ? [{ role: 'system', content: body.system }] : []).concat(msgs) };
      if (pid !== 'openai') payload.temperature = body.temperature || 0.4;
      const h = { 'Content-Type': 'application/json' };
      if (key) h.Authorization = 'Bearer ' + key;
      r = await fetch(url + '/chat/completions', { method: 'POST', headers: h, body: JSON.stringify(payload) });
      j = await r.json().catch(() => null);
      if (!r.ok || !j) throw err(t(def[1]) + ' ' + t('回應錯誤') + '（' + r.status + '）：' + JSON.stringify(j).slice(0, 300));
      return { text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '', provider: pid, model };
    } catch (e) {
      if (e instanceof TypeError) throw err(t('連不到 {0}（網路或瀏覽器擋下了連線）', t(def[1])));
      throw e;
    }
  }

  // ------------------------------------------------------------ 備份（ZIP：data.json＋files/）
  async function backup() {
    const docs = await all('docs'), folders = await all('folders'), scripts = await all('scripts');
    const files = [['data.json', JSON.stringify({ app: 'zms-office', version: VERSION, docs, folders, scripts, pref: await kv('pref', {}) })]];
    for (const d of docs) { const b = await getOne('files', d.id); if (b) files.push(['files/' + d.id, new Uint8Array(await toBuf(b))]); }
    const zip = window.ZOConvert.zipWrite(files);
    await ZO.saveFile(zip, t('文件office彙整備份') + '-' + now().replace(/[: ]/g, '-') + '.zip', 'application/zip');
    return { path: t('下載資料夾'), size: zip.length };
  }
  async function restore(file) {
    const z = await window.ZOConvert.zipRead(await file.arrayBuffer());
    const data = JSON.parse(new TextDecoder().decode(z['data.json']));
    if (data.app !== 'zms-office') throw err(t('這不是文件office彙整的備份檔'));
    for (const s of ['docs', 'files', 'versions', 'folders', 'scripts']) await tx(s, 'readwrite', (st) => P(st.clear()));
    for (const f of data.folders || []) await put('folders', f);
    for (const s of data.scripts || []) await put('scripts', s);
    for (const d of data.docs || []) { await put('docs', d); if (z['files/' + d.id]) await put('files', await toBuf(z['files/' + d.id]), d.id); }
    await put('kv', data.pref || {}, 'pref');
  }
  ZO.Local = { backup, restore };

  // ------------------------------------------------------------ API
  const H = {
    async state() {
      const company = await kv('company', { name: '' });
      return { ready: true, error: '', app: '資料助秘文件office彙整', version: VERSION, credit: '開發：吳玉柱 先生 與 Claude AI Opus 5.5', native: false, web: true,
        funcs: FUNCS.map(([id, name]) => ({ id, name, desc: '' })), roles: { '系統管理員': PERMS }, kinds: KINDS, has_users: true, company: company.name,
        user: Object.assign({}, USER, { pref: await kv('pref', {}) }) };
    },
    async login() { return { session: 'web', uid: 'local', name: USER.name }; },
    async setup() { return H.login(); },
    async logout() { return {}; },
    async last_user() { return { uid: 'local' }; },
    async pref(b) { if (b && Object.keys(b).length) { const p = Object.assign(await kv('pref', {}), b); await put('kv', p, 'pref'); return p; } return kv('pref', {}); },
    async company(b) {
      let c = await kv('company', { name: '' });
      if (b && 'name' in b) { c = { name: b.name || '' }; await put('kv', c, 'company'); }
      return { name: c.name, out_dir: '', root: t('這台裝置的瀏覽器') };
    },
    async users() { return [Object.assign({ role: '系統管理員', dept: '', active: 1, last_login: '' }, USER)]; },
    async audit() { return []; },
    async docs(q) {
      const view = q.view || 'recent';
      let ds = await all('docs');
      ds = view === 'trash' ? ds.filter((d) => d.trashed) : ds.filter((d) => !d.trashed);
      if (view === 'mine' && !q.q) ds = ds.filter((d) => (d.folder_id || null) === (q.folder ? +q.folder : null));
      if (view === 'folder') ds = ds.filter((d) => d.folder_id === +q.folder);
      if (view === 'starred') ds = ds.filter((d) => d.starred);
      if (view === 'templates') ds = ds.filter((d) => d.is_template);
      if (view === 'shared') ds = [];
      if (q.kind) ds = ds.filter((d) => d.kind === q.kind);
      if (q.q) ds = ds.filter((d) => d.name.toLowerCase().includes(q.q.toLowerCase()));
      ds.sort((a, b) => String(view === 'recent' ? b.opened_at : b.updated_at).localeCompare(String(view === 'recent' ? a.opened_at : a.updated_at)));
      return ds.slice(0, 500).map(out);
    },
    async folders() { return (await all('folders')).map((f) => Object.assign({ owner: 'local', shared: 0 }, f)); },
    async folder_new(b) { return { id: await put('folders', { parent_id: b.parent || null, name: clean(b.name, t('新資料夾')), owner: 'local', shared: 0, created_at: now() }) }; },
    async folder_rename(b) { const f = await getOne('folders', +b.id); f.name = clean(b.name, f.name); await put('folders', f); return {}; },
    async folder_share() { return {}; },
    async folder_delete(b) {
      const fs = await all('folders'), ds = await all('docs');
      if (fs.some((f) => f.parent_id === +b.id) || ds.some((d) => d.folder_id === +b.id && !d.trashed)) throw err(t('資料夾裡還有東西，請先移走或刪除'));
      await del('folders', +b.id); return {};
    },
    async doc_new(b) {
      const ext = { word: 'docx', cell: 'xlsx', slide: 'pptx', diagram: 'drawio' }[b.kind];
      if (!ext) throw err(t('不明的文件種類'));
      const src = b.template && !/^\d+$/.test(String(b.template)) ? 'assets/templates/' + b.template : 'assets/blank/blank.' + ext;
      let blob;
      if (/^\d+$/.test(String(b.template || ''))) blob = await getOne('files', +b.template);
      if (!blob) { const r = await fetch(src); blob = r.ok ? await r.arrayBuffer() : new ArrayBuffer(0); }
      const d = await addDoc(b.name || t({ word: '文件', cell: '活頁簿', slide: '簡報', diagram: '流程圖' }[b.kind]), ext, blob, b.folder || null);
      return out(d);
    },
    async doc_info(q) { const d = await doc(q.id); await touch(d); return Object.assign(out(d), { readonly: false, locked_by: '' }); },
    async upload(data, q) {
      const [base, ext] = splitExt(q.name || 'file');
      return out(await addDoc(base, ext, data, q.folder ? +q.folder : null));
    },
    async import_paths() { throw err(t('線上版請用「開啟」選擇檔案，或直接把檔案拖進視窗')); },
    async save(data, q) { return saveDoc(q.id, data); },
    async save_as(data, q) {
      const src = q.id ? await getOne('docs', +q.id) : null;
      const ext = String(q.ext || '').toLowerCase().replace('.', '');
      return out(await addDoc(q.name || t('未命名'), ext, data, q.folder ? +q.folder : (src ? src.folder_id : null)));
    },
    async export_to() { throw err(t('線上版請選「下載到這台裝置」')); },
    async heartbeat() { return { ok: true }; },
    async doc_rename(b) { const d = await doc(b.id); d.name = await uniqueName(clean(b.name, d.name), d.ext, d.folder_id, d.id); d.path = d.name + '.' + d.ext; await put('docs', d); return {}; },
    async doc_move(b) { const d = await doc(b.id); d.folder_id = b.folder || null; await put('docs', d); return {}; },
    async doc_copy(b) { const d = await doc(b.id); return out(await addDoc(d.name + ' - ' + t('複本'), d.ext, await getOne('files', d.id), d.folder_id)); },
    async doc_flag(b) { const d = await doc(b.id); d[b.flag] = b.value ? 1 : 0; await put('docs', d); return {}; },
    async doc_trash(b) { const d = await doc(b.id); d.trashed = b.restore ? 0 : 1; await put('docs', d); return {}; },
    async doc_purge(b) {
      await del('docs', +b.id); await del('files', +b.id);
      for (const v of (await all('versions')).filter((x) => x.doc_id === +b.id)) await del('versions', v.id);
      return {};
    },
    async recent_forget(b) { const d = await doc(b.id); d.opened_at = ''; await put('docs', d); return {}; },
    async versions(q) {
      return (await all('versions')).filter((v) => v.doc_id === +q.id).sort((a, b) => b.version - a.version)
        .map((v) => ({ id: v.id, doc_id: v.doc_id, version: v.version, size: v.size, uid: 'local', uname: USER.name, created_at: v.created_at }));
    },
    async version_restore(b) { const v = await getOne('versions', +b.vid); return saveDoc(b.id, v.blob); },
    async reveal() { return { path: '' }; },
    async templates() {
      let builtin = [];
      try { const r = await fetch('assets/templates/templates.json'); if (r.ok) builtin = await r.json(); } catch (e) { /* */ }
      return { builtin, company: (await H.docs({ view: 'templates' })) };
    },
    async scripts(q) {
      return (await all('scripts')).filter((s) => !q.kind || s.kind === 'any' || s.kind === q.kind)
        .filter((s) => !s.doc_id || !q.doc || +s.doc_id === +q.doc).map((s) => Object.assign({ mine: true, owner: 'local', owner_name: USER.name }, s));
    },
    async script_save(b) {
      const s = { name: (b.name || '').trim() || t('我的程式'), code: b.code || '', lang: b.lang || 'gas', kind: b.kind || 'any', doc_id: b.doc_id || null, shared: b.shared ? 1 : 0, shortcut: b.shortcut || '', updated_at: now() };
      if (b.id) s.id = +b.id;
      return { id: await put('scripts', s) };
    },
    async script_delete(b) { await del('scripts', +b.id); return {}; },
    async ai_config(b) {
      if (b && Object.keys(b).length) {
        const cfg = await aiCfg();
        if (b.default) cfg.default = b.default;
        cfg.providers = cfg.providers || {};
        for (const [id, v] of Object.entries(b.providers || {})) {
          const cur = Object.assign({}, cfg.providers[id] || {});
          if (v.model !== undefined) cur.model = v.model;
          if (v.url !== undefined) cur.url = v.url;
          if (v.key === '-') delete cur.key; else if (v.key) cur.key = v.key.trim();
          cfg.providers[id] = cur;
        }
        await put('kv', cfg, 'ai');
      }
      return publicCfg(await aiCfg());
    },
    async ai_chat(b) { return aiChat(b); },
    async ai_test(b) { const r = await aiChat({ provider: b.provider, messages: [{ role: 'user', content: '請只回答兩個字：你好' }] }); return { ok: true, reply: r.text.slice(0, 80), model: r.model }; },
    async to_flipbook(data, q) {
      await ZO.saveFile(data, (q.name || 'document') + '.pdf', 'application/pdf');
      return { path: (q.name || 'document') + '.pdf', installed: false, launched: false, web: true };
    },
    async mcp_info() { throw err(t('MCP 伺服器只有電腦版（Windows／macOS）才有')); },
    async update_check() {
      const app = window.ZMSIOS || window.ZMSAndroid;
      if (!app) return { latest: true, info: null, current: VERSION, note: '線上版每次開啟都是最新版。' };
      const cur = window.ZMSIOS ? window.ZMSIOS.version : (window.ZMSAndroid.getVersion ? window.ZMSAndroid.getVersion() : VERSION);
      const r = await fetch('https://api.github.com/repos/achir1015/zms-office/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw err(t('無法連到更新伺服器') + '（' + r.status + '）');
      const rel = await r.json();
      const want = window.ZMSIOS ? /-ios\.ipa$/ : /-android\.apk$/;
      const asset = (rel.assets || []).find((a) => want.test(a.name));
      const ver = (rel.tag_name || '').replace(/^v/i, '');
      const num = (v) => v.split('.').map((x) => +x || 0).reduce((tt, x) => tt * 1000 + x, 0);
      if (!asset || num(ver) <= num(cur)) return { latest: true, info: null, current: cur };
      const page = window.ZMSIOS ? 'https://achir1015.github.io/zms-office/ios/' : asset.browser_download_url;
      return { latest: false, current: cur, info: { version: ver, notes: rel.body || '', page, size: asset.size, name: '' } };
    },
    async update_install() { throw err(t('線上版不需要安裝更新')); },
    async backup() { return backup(); },
    async restore() { throw err(t('請用「備份與還原」裡的「還原…」選擇備份檔')); },
    async shortcut() { throw err(t('線上版請用瀏覽器的「加到主畫面／安裝 App」')); },
    async open_queue() { return []; },
    async password() { return {}; },
    async user_save() { throw err(t('線上版只有一位本機使用者')); },
    async user_delete() { throw err(t('線上版只有一位本機使用者')); },
  };

  async function call(name, body, query) {
    const f = H[name];
    if (!f) throw err(t('線上版沒有這個功能：') + name);
    return f(body || {}, query || {});
  }
  ZO.api = (name, body) => call(name, body || {});
  ZO.get = (name, params) => call(name, params || {}, params || {});
  ZO.raw = (name, bytes, params) => call(name, bytes, params || {});
  ZO.fetchFile = async (id, vid) => {
    if (vid) { const v = await getOne('versions', +vid); if (!v) throw err(t('找不到這個版本')); return toBuf(v.blob); }
    const b = await getOne('files', +id);
    return b ? toBuf(b) : new ArrayBuffer(0);
  };
  ZO.fileURL = () => '';
  ZO.upload = (file, folder) => ZO.raw('upload', file, { name: file.name || 'file', folder: folder || '' });

  // Android 返回鍵：先關選單／對話框，再從文件分頁回首頁（回傳 true＝已處理）
  window.__zmsBack = function () {
    const ctx = document.querySelector('.ctx');
    if (ctx) { ctx.remove(); return true; }
    const x = document.querySelector('.dlg-wrap .dlg-head .x');
    if (x) { x.click(); return true; }
    const active = document.querySelector('#tabs .tab.active');
    if (active && active.dataset.tab !== 'home') { ZO.showTab('home'); return true; }
    return false;
  };
  if (window.ZMSAndroid && window.ZMSAndroid.openUrl) window.open = (u) => { window.ZMSAndroid.openUrl(String(u)); return null; };

  // 儲存空間：請瀏覽器不要自動清掉（iOS Safari 7 天規則、空間不足時）
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
