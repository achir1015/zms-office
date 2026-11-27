/* 與本機伺服器溝通、電腦功能（選檔、存檔位置）、多語系、小工具（對話框、提示、忙碌中）。
 * 線上版／手機版會由 local.js 取代 ZO.api／ZO.get／ZO.raw（存在瀏覽器 IndexedDB）。 */
(function () {
  const ZO = (window.ZO = window.ZO || {});
  const qs = new URLSearchParams(location.search);
  const K = qs.get('k') || sessionStorage.getItem('zo_k') || '';
  if (K) sessionStorage.setItem('zo_k', K);
  ZO.key = K;
  ZO.sid = sessionStorage.getItem('zo_sid') || '';
  ZO.setSession = (s) => { ZO.sid = s || ''; if (s) sessionStorage.setItem('zo_sid', s); else sessionStorage.removeItem('zo_sid'); };

  // ------------------------------------------------------------ 多語系
  // 畫面文字一律用繁體中文寫，t('…') 依目前語系查 window.ZO_I18N[語系][繁中原文]，查不到就顯示繁中。
  ZO.LANGS = [
    ['zh-TW', '繁體中文', 'zh-TW'], ['zh-CN', '简体中文', 'zh'], ['en', 'English', 'en'], ['ja', '日本語', 'ja'],
    ['ko', '한국어', 'ko'], ['vi', 'Tiếng Việt', 'vi'], ['id', 'Bahasa Indonesia', 'id'], ['th', 'ไทย', 'en'],
    ['fr', 'Français', 'fr'], ['de', 'Deutsch', 'de'], ['es', 'Español', 'es'],
  ];
  ZO.lang = localStorage.getItem('zo_lang') || 'zh-TW';
  ZO.editorLang = () => (ZO.LANGS.find((l) => l[0] === ZO.lang) || ZO.LANGS[0])[2];
  ZO.t = (s, ...args) => {
    const d = (window.ZO_I18N || {})[ZO.lang];
    let r = (d && d[s]) || s;
    args.forEach((a, i) => (r = r.replace('{' + i + '}', a)));
    return r;
  };
  ZO.loadLang = (lang) => new Promise((res) => {
    if (lang === 'zh-TW' || (window.ZO_I18N || {})[lang]) return res();
    const s = document.createElement('script');
    s.src = (ZO.base || '') + 'i18n/' + lang + '.js';
    s.onload = s.onerror = () => res();
    document.head.append(s);
  });
  ZO.setLang = async (lang) => {
    await ZO.loadLang(lang);
    ZO.lang = lang;
    localStorage.setItem('zo_lang', lang);
    document.documentElement.lang = lang;
  };
  const t = ZO.t;

  // ------------------------------------------------------------ 伺服器
  async function req(name, opts, q) {
    const url = '/api/' + name + '?k=' + encodeURIComponent(K) + (q || '');
    let r;
    try {
      r = await fetch(url, Object.assign({ headers: { 'X-Session': ZO.sid } }, opts));
    } catch (e) {
      throw new Error(t('無法連到程式核心（可能已關閉），請重新開啟程式'));
    }
    let j = null;
    try { j = await r.json(); } catch (e) { /* 非 JSON */ }
    if (!r.ok || !j || j.ok === false) {
      const msg = (j && j.error) || (t('錯誤') + ' ' + r.status);
      if (r.status === 401 && ZO.onLoggedOut) ZO.onLoggedOut();
      throw new Error(msg);
    }
    return j.data;
  }
  ZO.api = ZO.api || ((name, body) => req(name, { method: 'POST', body: JSON.stringify(body || {}), headers: { 'X-Session': ZO.sid, 'Content-Type': 'application/json' } }));
  ZO.get = ZO.get || ((name, params) => req(name, { method: 'GET' }, params ? '&' + new URLSearchParams(params).toString() : ''));
  ZO.raw = ZO.raw || ((name, bytes, params) => req(name, { method: 'POST', body: bytes, headers: { 'X-Session': ZO.sid, 'Content-Type': 'application/octet-stream' } }, params ? '&' + new URLSearchParams(params).toString() : ''));
  ZO.fileURL = ZO.fileURL || ((id, vid) => '/file/' + id + '?k=' + encodeURIComponent(K) + '&s=' + encodeURIComponent(ZO.sid) + (vid ? '&v=' + vid : '') + '&_=' + Date.now());
  ZO.fetchFile = ZO.fetchFile || (async (id, vid) => {
    const r = await fetch(ZO.fileURL(id, vid));
    if (!r.ok) throw new Error(t('讀取文件失敗') + '（' + r.status + '）');
    return r.arrayBuffer();
  });
  ZO.upload = (file, folder) => ZO.raw('upload', file, { name: file.name || 'file', folder: folder || '' });

  // 電腦功能（pywebview）；網頁版沒有時為 null
  ZO.native = null;
  ZO.nativeReady = new Promise((res) => {
    const ok = () => { ZO.native = window.pywebview && window.pywebview.api ? window.pywebview.api : null; res(ZO.native); };
    if (window.pywebview && window.pywebview.api) ok();
    else { window.addEventListener('pywebviewready', ok); setTimeout(ok, 2500); }
  });

  // ------------------------------------------------------------ 小工具
  ZO.$ = (s, el) => (el || document).querySelector(s);
  ZO.$$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  ZO.h = function (tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };
  ZO.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  ZO.fmtSize = (n) => (n > 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
  ZO.selectEl = (opts, value, onchange) => {
    const s = ZO.h('select', { class: 'inp', onchange: (e) => onchange && onchange(e.target.value) }, opts.map(([v, l]) => ZO.h('option', { value: v }, l)));
    s.value = value;
    return s;
  };

  ZO.toast = function (msg, kind) {
    let box = ZO.$('#toasts');
    if (!box) { box = ZO.h('div', { id: 'toasts' }); document.body.append(box); }
    const el = ZO.h('div', { class: 'toast ' + (kind || '') }, msg);
    box.append(el);
    setTimeout(() => el.classList.add('out'), kind === 'err' ? 6000 : 3000);
    setTimeout(() => el.remove(), kind === 'err' ? 6600 : 3600);
  };
  ZO.err = (e) => { console.error(e); ZO.toast(e && e.message ? e.message : String(e), 'err'); };

  // 對話框：ZO.dialog({title, body, buttons:[{label, primary, danger, value, onClick}], width}) → Promise(value)
  ZO.dialog = function (o) {
    return new Promise((resolve) => {
      const close = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape' && o.esc !== false) close(null); };
      const btns = (o.buttons || [{ label: t('確定'), primary: true, value: true }]).map((b) =>
        ZO.h('button', { class: 'btn ' + (b.primary ? 'primary' : '') + (b.danger ? ' danger' : ''), onclick: async () => {
          if (b.onClick) { try { const r = await b.onClick(); if (r === false) return; if (r !== undefined) return close(r); } catch (e) { return ZO.err(e); } }
          close(b.value !== undefined ? b.value : b.label);
        } }, b.label));
      const box = ZO.h('div', { class: 'dlg ' + (o.cls || ''), style: o.width ? { width: o.width } : null },
        ZO.h('div', { class: 'dlg-head' }, ZO.h('span', {}, o.title || ''), ZO.h('button', { class: 'x', title: t('關閉'), onclick: () => close(null) }, '✕')),
        ZO.h('div', { class: 'dlg-body' }, o.body || ''),
        btns.length ? ZO.h('div', { class: 'dlg-foot' }, btns) : null);
      const wrap = ZO.h('div', { class: 'dlg-wrap' }, box);
      document.body.append(wrap);
      document.addEventListener('keydown', onKey);
      const f = box.querySelector('input:not([type=checkbox]),select,textarea');
      if (f) setTimeout(() => f.focus(), 30);
      if (o.onOpen) o.onOpen(box, close);
    });
  };
  ZO.confirm = (msg, okLabel, danger) => ZO.dialog({ title: t('請確認'), body: ZO.h('p', {}, msg), buttons: [{ label: t('取消'), value: false }, { label: okLabel || t('確定'), primary: true, danger, value: true }] });
  ZO.alert = (msg, title) => ZO.dialog({ title: title || t('訊息'), body: ZO.h('p', { style: { whiteSpace: 'pre-wrap' } }, msg) });
  ZO.prompt = (title, value, label) => {
    const inp = ZO.h('input', { class: 'inp', value: value || '' });
    return ZO.dialog({ title, body: ZO.h('label', { class: 'fld' }, label || '', inp), buttons: [{ label: t('取消'), value: null }, { label: t('確定'), primary: true, onClick: () => inp.value.trim() || false }],
      onOpen: () => { inp.select(); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.closest('.dlg').querySelector('.btn.primary').click(); }); } });
  };
  ZO.busy = function (msg) {
    const el = ZO.h('div', { class: 'busy' }, ZO.h('div', { class: 'busy-box' }, ZO.h('div', { class: 'spinner' }), ZO.h('div', { class: 'busy-msg' }, msg || t('處理中…'))));
    document.body.append(el);
    return { set: (m) => (el.querySelector('.busy-msg').textContent = m), close: () => el.remove() };
  };
  // 右鍵／更多選單：ZO.menu(anchorEl 或 {x,y}, [[label, fn, {danger, disabled}] | '-'])
  ZO.menu = function (at, items) {
    ZO.$$('.ctx').forEach((m) => m.remove());
    const m = ZO.h('div', { class: 'ctx' }, items.filter(Boolean).map((it) => it === '-' ? ZO.h('div', { class: 'sep' }) :
      ZO.h('div', { class: 'it' + (it[2] && it[2].danger ? ' danger' : '') + (it[2] && it[2].disabled ? ' dis' : ''), onclick: () => { m.remove(); if (!(it[2] && it[2].disabled)) it[1](); } }, it[0])));
    document.body.append(m);
    const r = at.getBoundingClientRect ? at.getBoundingClientRect() : { left: at.x, bottom: at.y, top: at.y };
    let x = r.left, y = r.bottom + 2;
    const mw = m.offsetWidth, mh = m.offsetHeight;
    if (x + mw > innerWidth - 6) x = innerWidth - mw - 6;
    if (y + mh > innerHeight - 6) y = Math.max(6, (r.top || y) - mh - 2);
    Object.assign(m.style, { left: x + 'px', top: y + 'px' });
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off); } }), 0);
    return m;
  };

  const L = {};
  ZO.on = (n, f) => (L[n] = L[n] || []).push(f);
  ZO.emit = (n, d) => (L[n] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } });


  // 存檔到裝置：Android App（分段交給 App 存到「下載/文件office」再開分享選單）、iPhone／iPad App（交給 App 內伺服器開分享選單）、一般瀏覽器（下載）
  ZO.saveFile = async function (data, name, type) {
    const P = window.parent && window.parent !== window && window.parent.ZO ? window.parent.ZO : null;
    if (P && P.saveFile && P !== ZO) return P.saveFile(data, name, type);
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    if (window.ZMSAndroid && window.ZMSAndroid.saveBegin) {
      const b = JSON.parse(window.ZMSAndroid.saveBegin(name, blob.type || 'application/octet-stream'));
      if (b.status !== 'ok') throw new Error(b.message);
      const CH = 3 * 1024 * 1024;
      for (let o = 0; o < blob.size; o += CH) {
        const buf = new Uint8Array(await blob.slice(o, o + CH).arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        const r = JSON.parse(window.ZMSAndroid.saveChunk(b.id, btoa(bin)));
        if (r.status !== 'ok') throw new Error(r.message);
      }
      const e = JSON.parse(window.ZMSAndroid.saveEnd(b.id));
      if (e.status !== 'ok') throw new Error(e.message);
      ZO.toast(ZO.t('已存到手機的「{0}」', e.path), 'ok');
      return;
    }
    if (window.ZMSIOS) { await fetch('/__save?name=' + encodeURIComponent(name), { method: 'POST', body: blob }); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  };

  // 手機（窄螢幕＋觸控）：編輯器改用行動版介面、主畫面精簡
  ZO.isPhone = () => /iPhone|iPod|Android.+Mobile/i.test(navigator.userAgent) ||
    ((navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && Math.min(screen.width, screen.height) < 600);
  if (ZO.isPhone()) document.documentElement.classList.add('phone');

  // 文件種類
  ZO.KIND = {
    word: { app: 'DataWord', name: '文件', color: '#2b579a', icon: 'W', new: '空白文件', ext: 'docx', func: 'WORD' },
    cell: { app: 'DataExcel', name: '活頁簿', color: '#217346', icon: 'X', new: '空白活頁簿', ext: 'xlsx', func: 'EXCEL' },
    slide: { app: 'DataPowerPoint', name: '簡報', color: '#c43e1c', icon: 'P', new: '空白簡報', ext: 'pptx', func: 'PPT' },
    pdf: { app: 'DataPDF', name: 'PDF', color: '#b30b00', icon: 'PDF', new: '', ext: 'pdf', func: 'PDF' },
    diagram: { app: 'DataDiagram', name: '流程圖', color: '#7a4fb5', icon: 'D', new: '空白流程圖', ext: 'drawio', func: 'DIAGRAM' },
  };
  ZO.EXT_KIND = {};
  ZO.setKinds = (kinds) => { for (const [k, exts] of Object.entries(kinds || {})) for (const e of exts) ZO.EXT_KIND[e] = k; };
  ZO.kindOf = (name) => ZO.EXT_KIND[String(name || '').split('.').pop().toLowerCase()] || '';
  ZO.docIcon = (kind, big) => {
    const k = ZO.KIND[kind] || ZO.KIND.word;
    return ZO.h('span', { class: 'dicon' + (big ? ' big' : ''), style: { background: k.color } }, k.icon);
  };
})();
