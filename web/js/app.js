/* 主畫面：登入、開始畫面（新增／最近／我的文件／共用／範本／資源回收筒）、文件分頁。 */
(function () {
  const ZO = window.ZO;
  const { $, $$, h, t } = ZO;
  const S = (ZO.S = { state: null, user: null, section: 'home', app: '', view: 'recent', folder: null, folders: [], docs: [], q: '' });

  // ================================================================ 啟動
  async function boot() {
    await ZO.setLang(ZO.lang);
    translateStatic();
    let st;
    for (let i = 0; i < 120; i++) {
      try { st = await ZO.get('state'); } catch (e) { st = null; }
      if (st && (st.ready || st.error)) break;
      showLogin('wait');
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!st) return showLogin('wait', t('無法連到程式核心，請重新開啟程式'));
    S.state = st;
    ZO.setKinds(st.kinds);
    if (st.error) return showLogin('wait', st.error);
    if (st.user) return enter(st);
    showLogin(st.has_users ? 'login' : 'setup');
  }
  ZO.onLoggedOut = () => { ZO.setSession(''); location.reload(); };

  function translateStatic() {
    $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
    $$('[data-tp]').forEach((el) => (el.placeholder = t(el.dataset.tp)));
    $('#btn-guide').title = t('語音教學');
    document.title = t('資料助秘文件office彙整');
  }

  function showLogin(mode, msg) {
    const box = $('#login');
    box.classList.remove('hidden');
    box.innerHTML = '';
    const err = h('div', { class: 'err' }, msg || '');
    const apps = h('div', { class: 'apps' }, ['word', 'cell', 'slide', 'pdf', 'diagram'].map((k) => h('span', { style: { background: ZO.KIND[k].color } }, ZO.KIND[k].app)));
    const head = h('div', { class: 'logo' }, h('img', { src: 'assets/icon.png' }), h('div', {}, h('h1', {}, t('資料助秘文件office彙整')), h('div', { class: 'hint' }, t('免費的文書、試算表、簡報、PDF 與流程圖工具'))));
    const langSel = ZO.selectEl(ZO.LANGS.map((l) => [l[0], l[1]]), ZO.lang, async (v) => { await ZO.setLang(v); translateStatic(); showLogin(mode, msg); });
    langSel.style.width = 'auto';
    if (mode === 'wait') {
      box.append(h('div', { class: 'login-box' }, head, apps, h('p', {}, msg ? '' : t('正在啟動資料庫，請稍候…')), err));
      return;
    }
    const uid = h('input', { class: 'inp', autocomplete: 'username' });
    const name = h('input', { class: 'inp' });
    const pw = h('input', { class: 'inp', type: 'password', autocomplete: mode === 'setup' ? 'new-password' : 'current-password' });
    const pw2 = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password' });
    const go = async () => {
      err.textContent = '';
      try {
        if (mode === 'setup') {
          if (pw.value !== pw2.value) throw new Error(t('兩次輸入的密碼不一樣'));
          const r = await ZO.api('setup', { uid: uid.value.trim(), name: name.value.trim() || uid.value.trim(), pw: pw.value });
          ZO.setSession(r.session);
        } else {
          const r = await ZO.api('login', { uid: uid.value.trim(), pw: pw.value });
          ZO.setSession(r.session);
        }
        const st = await ZO.get('state');
        S.state = st;
        enter(st);
      } catch (e) { err.textContent = e.message; }
    };
    [uid, pw, pw2].forEach((i) => i.addEventListener('keydown', (e) => e.key === 'Enter' && go()));
    const fields = mode === 'setup'
      ? [h('p', { class: 'hint' }, t('第一次使用：請建立系統管理員帳號。')), h('label', { class: 'fld' }, t('帳號'), uid), h('label', { class: 'fld' }, t('姓名'), name),
        h('label', { class: 'fld' }, t('密碼（至少 6 個字）'), pw), h('label', { class: 'fld' }, t('再輸入一次密碼'), pw2)]
      : [h('label', { class: 'fld' }, t('帳號'), uid), h('label', { class: 'fld' }, t('密碼'), pw)];
    box.append(h('div', { class: 'login-box' }, head, apps, ...fields, err,
      h('button', { class: 'btn primary', onclick: go }, mode === 'setup' ? t('建立並登入') : t('登入')),
      h('div', { style: { marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' } }, '🌐', langSel),
      h('div', { class: 'credit' }, t('開發：吳玉柱 先生 與 Claude AI Opus 5.5'))));
    if (mode === 'login') ZO.get('last_user').then((r) => { if (r.uid) { uid.value = r.uid; pw.focus(); } else uid.focus(); }).catch(() => {});
    else uid.focus();
  }

  async function enter(st) {
    S.user = st.user;
    $('#login').classList.add('hidden');
    $('#user-badge').textContent = (st.user.name || st.user.uid).slice(0, 1);
    $('#btn-user').title = st.user.name;
    if (st.user.pref && st.user.pref.lang && st.user.pref.lang !== ZO.lang) { await ZO.setLang(st.user.pref.lang); translateStatic(); }
    await refreshFolders();
    renderRail();
    go('home');
    await ZO.nativeReady;
    // 用檔案開啟本程式（檔案總管按兩下）時，直接開那些檔案
    if (ZO.native && ZO.native.startup_files) {
      const files = await ZO.native.startup_files().catch(() => []);
      if (files && files.length) openPaths(files, true);
    }
    ZO.Guide && ZO.Guide.autoStart();
    if (ZO.native) setInterval(async () => {
      const files = await ZO.get('open_queue').catch(() => []);
      if (files && files.length) openPaths(files, true);
    }, 2000);
  }

  // ================================================================ 左側欄
  const can = (f, lv) => S.user && (S.user.is_admin || (S.user.perms[f] || 0) >= (lv || 1));
  ZO.can = can;
  function renderRail() {
    const r = $('#rail');
    r.innerHTML = '';
    const it = (id, ic, label, fn) => h('div', { class: 'it' + (S.section === id && !S.app ? ' active' : ''), 'data-sec': id, onclick: fn || (() => { S.app = ''; go(id); }) }, h('span', { class: 'ic' }, ic), t(label));
    r.append(it('home', '🏠', '首頁'), it('new', '📄', '新增'), it('open', '📂', '開啟'), h('div', { class: 'sep' }), h('div', { class: 'cap' }, t('工具')));
    for (const k of ['word', 'cell', 'slide', 'pdf', 'diagram']) {
      const K = ZO.KIND[k];
      if (!can(K.func)) continue;
      r.append(h('div', { class: 'it app' + (S.app === k ? ' active' : ''), 'data-app': k, onclick: () => { S.app = k; go('home'); } },
        h('span', { class: 'ic' }, ZO.docIcon(k)), K.app));
    }
    r.append(h('div', { class: 'sep' }));
    if (can('DEV')) r.append(it('dev', '🧩', '擴充功能', () => ZO.Scripts.open()));
    if (can('AI')) r.append(it('ai', '✨', 'AI 助理設定', () => ZO.AIConfig.open()));
    r.append(h('div', { class: 'grow' }));
    if (can('SYS')) r.append(it('sys', '⚙️', '系統管理', () => ZO.Admin.menu($('#rail [data-sec=sys]'))));
    r.append(it('about', 'ℹ️', '關於', () => ZO.Admin.about()));
    r.style.background = S.app ? ZO.KIND[S.app].color : '';
  }

  // ================================================================ 首頁內容
  function go(section) {
    S.section = section;
    showTab('home');
    renderRail();
    const m = $('#home-main');
    m.innerHTML = '';
    if (section === 'open') return renderOpen(m);
    if (section === 'new') return renderNew(m, true);
    const hr = new Date().getHours();
    const greet = hr < 11 ? '早安' : hr < 18 ? '午安' : '晚安';
    m.append(h('h1', {}, S.app ? ZO.KIND[S.app].app : t(greet) + (/^(zh|ja)/.test(ZO.lang) ? '，' : ', ') + (S.user.name || '')));
    renderNew(m, false);
    renderList(m);
  }
  ZO.goHome = (s) => { S.app = s === 'home' ? S.app : ''; go(s); };

  function newKinds() {
    return (S.app ? [S.app] : ['word', 'cell', 'slide', 'diagram']).filter((k) => ZO.KIND[k].new && can(ZO.KIND[k].func, 2));
  }
  function renderNew(m, full) {
    if (full) m.append(h('h1', {}, t('新增')));
    const kinds = newKinds();
    if (!kinds.length) return;
    const strip = h('div', { class: 'new-strip', id: 'new-strip' });
    for (const k of kinds) {
      const K = ZO.KIND[k];
      strip.append(h('div', { class: 'new-card' + (k === 'slide' ? ' landscape' : ''), 'data-new': k, onclick: () => newDoc(k) },
        h('div', { class: 'thumb' }, h('div', { class: 'big-ic', style: { background: K.color } }, K.icon)),
        h('div', { class: 'nm' }, t(K.new)), h('div', { class: 'sub' }, K.app)));
    }
    m.append(h('h2', {}, t('新增'), full ? null : h('span', { class: 'more', onclick: () => go('new') }, t('更多範本') + ' →')), strip);
    if (full || S.app) loadTemplates(m, kinds);
  }
  async function loadTemplates(m, kinds) {
    let tp;
    try { tp = await ZO.get('templates'); } catch (e) { return; }
    const items = (tp.builtin || []).filter((x) => kinds.includes(x.kind));
    const comp = (tp.company || []).filter((x) => kinds.includes(x.kind));
    if (!items.length && !comp.length) return;
    const strip = h('div', { class: 'new-strip' });
    for (const x of items) {
      strip.append(h('div', { class: 'new-card' + (x.kind === 'slide' ? ' landscape' : ''), onclick: () => newDoc(x.kind, x.file, t(x.name)) },
        h('div', { class: 'thumb' }, x.thumb ? h('img', { src: 'assets/templates/' + x.thumb, alt: '' }) : h('div', { class: 'big-ic', style: { background: ZO.KIND[x.kind].color } }, ZO.KIND[x.kind].icon)),
        h('div', { class: 'nm' }, t(x.name)), h('div', { class: 'sub' }, ZO.KIND[x.kind].app)));
    }
    for (const x of comp) {
      strip.append(h('div', { class: 'new-card', onclick: () => newDoc(x.kind, String(x.id), x.name) },
        h('div', { class: 'thumb' }, ZO.docIcon(x.kind, true)), h('div', { class: 'nm' }, x.name), h('div', { class: 'sub' }, t('公司範本'))));
    }
    const strip0 = $('#new-strip', m);
    strip0.after(h('h2', {}, t('範本')), strip);
  }

  async function newDoc(kind, template, name) {
    const nm = await ZO.prompt(t('新增') + ' ' + ZO.KIND[kind].app, name || t(ZO.KIND[kind].name) + ' ' + new Date().toLocaleDateString('zh-TW').replace(/\//g, '-'), t('檔名'));
    if (!nm) return;
    try {
      const d = await ZO.api('doc_new', { kind, name: nm, template: template || null, folder: S.view === 'mine' ? S.folder : null });
      openDoc(d);
    } catch (e) { ZO.err(e); }
  }
  ZO.newDoc = newDoc;

  // ---------------------------------------------------------------- 開啟
  function renderOpen(m) {
    m.append(h('h1', {}, t('開啟')));
    m.append(h('div', { class: 'toolbar' },
      h('button', { class: 'btn primary', id: 'btn-open-pc', onclick: () => pickAndOpen(true) }, '📂 ' + t('開啟電腦上的檔案…')),
      h('button', { class: 'btn', onclick: () => pickAndOpen(false) }, '⤵ ' + t('複製到文件庫後開啟…'))),
    h('p', { class: 'hint' }, t('「開啟電腦上的檔案」會直接編輯原檔，存檔就寫回原位置，Microsoft Office 也能繼續開；「複製到文件庫」會在文件庫保留一份並記錄每個版本。也可以把檔案直接拖進這個視窗。')),
    h('p', { class: 'hint' }, t('支援格式：') + 'DOCX DOC DOCM DOTX ODT OTT RTF TXT HTML EPUB · XLSX XLS XLSM XLTX ODS OTS CSV · PPTX PPT PPTM PPSX POTX ODP OTP · PDF XPS DJVU · DRAWIO VSDX'));
    S.view = 'mine';
    renderList(m);
  }
  async function pickAndOpen(link) {
    await ZO.nativeReady;
    if (ZO.native) {
      const files = await ZO.native.pick_files('docs', true);
      if (files && files.length) openPaths(files, link);
      return;
    }
    const inp = h('input', { type: 'file', multiple: true });
    inp.onchange = () => uploadFiles(Array.from(inp.files));
    inp.click();
  }
  ZO.pickAndOpen = pickAndOpen;
  async function openPaths(paths, link) {
    const r = await ZO.api('import_paths', { paths, link, folder: link ? null : S.folder }).catch(ZO.err);
    if (!r) return;
    r.errors.forEach((e) => ZO.toast(e, 'err'));
    r.items.forEach(openDoc);
    refreshList();
  }
  async function uploadFiles(files) {
    const b = ZO.busy(t('加入文件庫…'));
    try {
      const out = [];
      for (const f of files) {
        if (!ZO.kindOf(f.name)) { ZO.toast(t('不支援的檔案格式：') + f.name, 'err'); continue; }
        b.set(t('加入文件庫…') + ' ' + f.name);
        out.push(await ZO.upload(f, S.view === 'mine' ? S.folder : ''));
      }
      b.close();
      if (out.length === 1) openDoc(out[0]);
      else if (out.length) ZO.toast(t('已加入 {0} 個檔案', out.length), 'ok');
      refreshList();
    } catch (e) { b.close(); ZO.err(e); }
  }

  // ---------------------------------------------------------------- 文件清單
  const VIEWS = [['recent', '最近'], ['mine', '我的文件'], ['shared', '與我共用'], ['starred', '已加星號'], ['templates', '公司範本'], ['trash', '資源回收筒']];
  function renderList(m) {
    if (S.section === 'open') S.view = 'mine';
    const bar = h('div', { class: 'list-bar', id: 'list-bar' }, VIEWS.map(([v, l]) => h('div', { class: 'lt' + (S.view === v ? ' active' : ''), onclick: () => { S.view = v; if (v !== 'mine') S.folder = null; go(S.section === 'open' ? 'home' : S.section); } }, t(l))),
      h('div', { class: 'grow' }),
      S.view === 'mine' ? h('button', { class: 'btn small', onclick: newFolder }, '📁 ' + t('新增資料夾')) : null,
      S.view === 'trash' ? null : h('button', { class: 'btn small', onclick: () => pickAndOpen(true) }, '📂 ' + t('開啟')));
    m.append(bar);
    if (S.view === 'mine') m.append(crumbs());
    m.append(h('div', { id: 'doc-list' }, h('div', { class: 'empty' }, t('讀取中…'))));
    refreshList();
  }
  function crumbs() {
    const c = h('div', { class: 'crumbs' }, h('span', { onclick: () => { S.folder = null; go(S.section); } }, '🏠 ' + t('我的文件')));
    const chain = [];
    let f = S.folders.find((x) => x.id === S.folder);
    while (f) { chain.unshift(f); f = S.folders.find((x) => x.id === f.parent_id); }
    for (const x of chain) c.append(' › ', h('span', { onclick: () => { S.folder = x.id; go(S.section); } }, x.name));
    return c;
  }
  async function refreshFolders() { S.folders = await ZO.get('folders').catch(() => []); }
  async function refreshList() {
    const box = $('#doc-list');
    if (!box) return;
    let docs;
    try {
      docs = await ZO.get('docs', { view: S.q ? 'mine' : S.view, folder: S.folder || '', q: S.q, kind: S.app && S.app !== 'pdf' ? S.app : (S.app || '') });
    } catch (e) { box.innerHTML = ''; box.append(h('div', { class: 'empty' }, e.message)); return; }
    S.docs = docs;
    box.innerHTML = '';
    const subs = S.view === 'mine' && !S.q ? S.folders.filter((f) => (f.parent_id || null) === (S.folder || null) && f.owner === S.user.uid) : [];
    if (!docs.length && !subs.length) {
      box.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, S.view === 'trash' ? '🗑️' : '📄'),
        t(S.view === 'recent' ? '還沒有最近開啟的文件。可以新增一份，或按「開啟」選電腦上的檔案。' : S.view === 'trash' ? '資源回收筒是空的' : '這裡還沒有文件')));
      return;
    }
    const tb = h('tbody');
    for (const f of subs) {
      tb.append(h('tr', { class: 'drow', ondblclick: () => { S.folder = f.id; go(S.section); }, onclick: () => { S.folder = f.id; go(S.section); } },
        h('td', {}, h('div', { class: 'nm' }, h('span', { class: 'folder-ic' }, '📁'), f.name, f.shared ? h('span', { class: 'tag' }, t('共用')) : null)),
        h('td', { class: 'loc' }, ''), h('td', {}, ''), h('td', {}, ''),
        h('td', { class: 'acts' }, h('button', { title: t('更多'), onclick: (e) => { e.stopPropagation(); folderMenu(e.currentTarget, f); } }, '⋯'))));
    }
    for (const d of docs) {
      const tr = h('tr', { class: 'drow', 'data-id': d.id, ondblclick: () => (S.view === 'trash' ? null : openDoc(d)), onclick: (e) => { $$('tr.sel', tb).forEach((x) => x.classList.remove('sel')); tr.classList.add('sel'); if (e.detail === 1 && S.view !== 'trash') clearTimeout(tr._t); },
        oncontextmenu: (e) => { e.preventDefault(); docMenu({ x: e.clientX, y: e.clientY }, d); } },
      h('td', {}, h('div', { class: 'nm' }, ZO.docIcon(d.kind), h('span', {}, d.filename), d.starred ? '⭐' : null,
        d.linked ? h('span', { class: 'tag link', title: d.path }, t('電腦檔案')) : null, d.shared ? h('span', { class: 'tag' }, t('共用')) : null)),
      h('td', { class: 'loc', title: d.where || '' }, d.linked ? d.path : (d.mine ? t('我的文件') : d.owner)),
      h('td', {}, d.opened_at || d.updated_at), h('td', {}, ZO.fmtSize(d.size || 0)),
      h('td', { class: 'acts' }, S.view === 'trash' ? [h('button', { title: t('還原'), onclick: (e) => { e.stopPropagation(); act('doc_trash', { id: d.id, restore: true }); } }, '↩'),
        h('button', { title: t('永久刪除'), onclick: async (e) => { e.stopPropagation(); if (await ZO.confirm(t('永久刪除「{0}」？這個動作無法復原。', d.filename), t('永久刪除'), true)) act('doc_purge', { id: d.id }); } }, '✕')]
        : h('button', { title: t('更多'), onclick: (e) => { e.stopPropagation(); docMenu(e.currentTarget, d); } }, '⋯')));
      tb.append(tr);
    }
    box.append(h('table', { class: 'docs' }, h('thead', {}, h('tr', {}, [t('名稱'), t('位置'), S.view === 'recent' ? t('開啟時間') : t('修改時間'), t('大小'), ''].map((x) => h('th', {}, x)))), tb));
  }
  ZO.refreshList = refreshList;
  async function act(name, body, msg) {
    try { await ZO.api(name, body); if (msg) ZO.toast(msg, 'ok'); await refreshFolders(); refreshList(); } catch (e) { ZO.err(e); }
  }
  async function newFolder() {
    const nm = await ZO.prompt(t('新增資料夾'), t('新資料夾'), t('資料夾名稱'));
    if (nm) act('folder_new', { name: nm, parent: S.folder });
  }
  function folderMenu(at, f) {
    ZO.menu(at, [
      [t('開啟'), () => { S.folder = f.id; go(S.section); }],
      [t('重新命名'), async () => { const n = await ZO.prompt(t('重新命名'), f.name); if (n) act('folder_rename', { id: f.id, name: n }); }],
      [f.shared ? t('取消共用') : t('共用給其他使用者'), () => act('folder_share', { id: f.id, shared: !f.shared }, f.shared ? t('已取消共用') : t('已共用'))],
      '-', [t('刪除'), async () => { if (await ZO.confirm(t('刪除資料夾「{0}」？（資料夾要是空的）', f.name), t('刪除'), true)) act('folder_delete', { id: f.id }); }, { danger: true }],
    ]);
  }
  function docMenu(at, d) {
    const w = d.can_write;
    ZO.menu(at, [
      [t('開啟'), () => openDoc(d)],
      ZO.native ? [t('用 Microsoft Office 或預設程式開啟'), async () => { const r = await ZO.api('reveal', { id: d.id }).catch(ZO.err); if (r) ZO.native.open_file(r.path); }] : null,
      ZO.native ? [t('在檔案總管中顯示'), () => ZO.api('reveal', { id: d.id }).catch(ZO.err)] : null,
      '-',
      [t('重新命名'), async () => { const n = await ZO.prompt(t('重新命名'), d.name); if (n) act('doc_rename', { id: d.id, name: n }); }, { disabled: !w }],
      [t('移動到資料夾…'), () => moveDoc(d), { disabled: !w || d.linked }],
      [t('建立複本'), () => act('doc_copy', { id: d.id }, t('已建立複本'))],
      [d.starred ? t('移除星號') : t('加上星號'), () => act('doc_flag', { id: d.id, flag: 'starred', value: !d.starred })],
      d.mine ? [d.shared ? t('取消共用') : t('共用給其他使用者'), () => act('doc_flag', { id: d.id, flag: 'shared', value: !d.shared }, d.shared ? t('已取消共用') : t('已共用'))] : null,
      S.user.is_admin ? [d.is_template ? t('取消公司範本') : t('設為公司範本'), () => act('doc_flag', { id: d.id, flag: 'is_template', value: !d.is_template })] : null,
      [t('版本記錄…'), () => ZO.versions(d)],
      S.view === 'recent' ? [t('從最近清單移除'), () => act('recent_forget', { id: d.id })] : null,
      '-',
      [t('刪除'), () => act('doc_trash', { id: d.id }, t('已移到資源回收筒')), { danger: true, disabled: !d.mine && !S.user.is_admin }],
    ]);
  }
  async function moveDoc(d) {
    const opts = [['', t('我的文件（最上層）')]].concat(S.folders.filter((f) => f.owner === S.user.uid || f.shared).map((f) => [String(f.id), f.name + (f.owner !== S.user.uid ? '（' + f.owner + '）' : '')]));
    const sel = ZO.selectEl(opts, String(d.folder_id || ''));
    const ok = await ZO.dialog({ title: t('移動到資料夾'), body: h('label', { class: 'fld' }, t('資料夾'), sel), buttons: [{ label: t('取消'), value: false }, { label: t('移動'), primary: true, value: true }] });
    if (ok) act('doc_move', { id: d.id, folder: sel.value ? +sel.value : null }, t('已移動'));
  }
  ZO.versions = async function (d) {
    let rows;
    try { rows = await ZO.get('versions', { id: d.id }); } catch (e) { return ZO.err(e); }
    let close;
    const body = rows.length ? h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, [t('版本'), t('時間'), t('存檔人'), t('大小'), ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((v) => h('tr', {}, h('td', {}, 'v' + v.version), h('td', {}, v.created_at), h('td', {}, v.uname || v.uid), h('td', {}, ZO.fmtSize(v.size)),
        h('td', {}, h('button', { class: 'mini', onclick: () => { close(null); openDoc(Object.assign({}, d, { version_id: v.id, version: v.version })); } }, t('檢視')), ' ',
          d.can_write ? h('button', { class: 'mini', onclick: async () => { if (await ZO.confirm(t('把文件還原成 v{0}？（目前內容會先保留成新的版本）', v.version), t('還原'))) { await ZO.api('version_restore', { id: d.id, vid: v.id }).catch(ZO.err); ZO.toast(t('已還原'), 'ok'); close(null); reloadTab(d.id); } } }, t('還原')) : null)))))
      : h('p', { class: 'hint' }, t('還沒有舊版本。每次儲存時，前一版會自動保留（最多 30 版）。'));
    ZO.dialog({ title: t('版本記錄') + '：' + d.filename, width: '620px', body, onOpen: (b, c) => (close = c) });
  };

  // ================================================================ 分頁
  const TABS = {};
  function tabKey(d) { return d.version_id ? d.id + '@' + d.version_id : String(d.id); }
  function openDoc(d) {
    const key = tabKey(d);
    if (TABS[key]) return showTab(key);
    const page = d.kind === 'diagram' ? 'diagram.html' : 'editor.html';
    const frame = h('iframe', { src: page + '?id=' + d.id + (d.version_id ? '&vid=' + d.version_id : '') + '&lang=' + ZO.lang, allow: 'clipboard-read; clipboard-write; fullscreen' });
    const view = h('div', { class: 'view doc', 'data-tab': key }, frame);
    $('#views').append(view);
    const title = d.filename + (d.version_id ? ' (v' + d.version + ')' : '');
    const tab = h('div', { class: 'tab', 'data-tab': key, title: d.where || d.filename, onclick: () => showTab(key), onauxclick: (e) => e.button === 1 && closeTab(key) },
      ZO.docIcon(d.kind), h('span', { class: 'tn' }, title), h('span', { class: 'dot hidden' }, '●'),
      h('button', { class: 'tx', title: t('關閉'), onclick: (e) => { e.stopPropagation(); closeTab(key); } }, '✕'));
    $('#tabs').append(tab);
    TABS[key] = { doc: d, view, tab, frame };
    showTab(key);
    setTimeout(refreshList, 800);
  }
  ZO.openDoc = openDoc;
  ZO.openDocById = async (id) => { try { openDoc(await ZO.get('doc_info', { id })); } catch (e) { ZO.err(e); } };
  function showTab(key) {
    $$('#tabs .tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === String(key)));
    $$('#views .view').forEach((x) => x.classList.toggle('active', (x.dataset.tab || (x.id === 'view-home' ? 'home' : '')) === String(key)));
    if (key === 'home') { refreshList(); document.title = t('資料助秘文件office彙整'); }
    else if (TABS[key]) { document.title = TABS[key].doc.filename + ' - ' + (ZO.KIND[TABS[key].doc.kind] || {}).app; try { TABS[key].frame.contentWindow.focus(); } catch (e) { /* */ } }
  }
  ZO.showTab = showTab;
  $('#tabs .tab.home').addEventListener('click', () => showTab('home'));
  async function closeTab(key) {
    const T = TABS[key];
    if (!T) return;
    const E = T.frame.contentWindow && T.frame.contentWindow.ZOE;
    if (E && E.isDirty && E.isDirty()) {
      showTab(key);
      const r = await ZO.dialog({ title: t('要儲存變更嗎？'), body: h('p', {}, t('「{0}」有尚未儲存的變更。', T.doc.filename)),
        buttons: [{ label: t('取消'), value: null }, { label: t('不要儲存'), value: 'no' }, { label: t('儲存'), primary: true, value: 'yes' }] });
      if (!r) return;
      if (r === 'yes') { try { await E.save(); } catch (e) { return ZO.err(e); } }
    }
    try { E && E.close && E.close(); } catch (e) { /* */ }
    T.view.remove(); T.tab.remove();
    delete TABS[key];
    const left = Object.keys(TABS);
    showTab(left.length ? left[left.length - 1] : 'home');
  }
  ZO.closeTab = closeTab;
  function reloadTab(id) { const T = TABS[String(id)]; if (T) T.frame.src = T.frame.src; }
  ZO.reloadTab = reloadTab;
  // 編輯頁回報狀態（有未儲存變更、改名、另存成新文件）
  ZO.tabState = (id, st) => {
    const T = TABS[String(id)];
    if (!T) return;
    if ('dirty' in st) $('.dot', T.tab).classList.toggle('hidden', !st.dirty);
    if (st.doc) { T.doc = Object.assign(T.doc, st.doc); $('.tn', T.tab).textContent = T.doc.filename; }
  };
  ZO.anyDirty = () => Object.values(TABS).some((T) => { try { return T.frame.contentWindow.ZOE.isDirty(); } catch (e) { return false; } });
  window.addEventListener('beforeunload', (e) => { if (ZO.anyDirty()) { e.preventDefault(); e.returnValue = ''; } });

  // ================================================================ 上方按鈕
  $('#search').addEventListener('input', (e) => { S.q = e.target.value.trim(); if (S.section !== 'home') go('home'); else { clearTimeout(S._qt); S._qt = setTimeout(refreshList, 250); } });
  $('#btn-guide').addEventListener('click', () => ZO.Guide.menu());
  $('#btn-lang').addEventListener('click', (e) => ZO.menu(e.currentTarget, ZO.LANGS.map((l) => [(l[0] === ZO.lang ? '✔ ' : '　') + l[1], async () => {
    if (ZO.anyDirty() && !(await ZO.confirm(t('切換語言會重新載入畫面，未儲存的文件變更會遺失。要繼續嗎？'), t('繼續')))) return;
    await ZO.setLang(l[0]);
    if (S.user) await ZO.api('pref', { lang: l[0] }).catch(() => {});
    location.reload();
  }])));
  $('#btn-user').addEventListener('click', (e) => ZO.menu(e.currentTarget, [
    [S.user ? S.user.name + '（' + S.user.uid + '）' : '', () => {}, { disabled: true }],
    '-',
    [t('變更密碼…'), () => ZO.Admin.password()],
    can('AI') ? [t('AI 助理設定…'), () => ZO.AIConfig.open()] : null,
    can('DEV') ? [t('擴充功能（巨集、Apps Script）…'), () => ZO.Scripts.open()] : null,
    [t('MCP 連線設定…'), () => ZO.Admin.mcp()],
    can('SYS') ? [t('系統管理…'), () => ZO.Admin.menu(e.currentTarget)] : null,
    [t('檢查更新…'), () => ZO.Admin.update()],
    ZO.native ? [t('建立桌面捷徑'), () => ZO.Admin.shortcut()] : null,
    [t('語音教學'), () => ZO.Guide.menu()],
    [t('關於'), () => ZO.Admin.about()],
    '-',
    [t('登出'), async () => { if (ZO.anyDirty() && !(await ZO.confirm(t('還有未儲存的文件，確定要登出？'), t('登出'), true))) return; await ZO.api('logout').catch(() => {}); ZO.setSession(''); location.reload(); }],
  ]));

  // 拖曳檔案進視窗
  let dragN = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { dragN++; $('#drop-hint').classList.add('on'); } });
  window.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; $('#drop-hint').classList.remove('on'); } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dragN = 0; $('#drop-hint').classList.remove('on');
    if (!S.user) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) uploadFiles(files);
  });
  // Ctrl+N 新增、Ctrl+O 開啟、Ctrl+W 關閉分頁
  window.addEventListener('keydown', (e) => {
    if (!S.user || !(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'o') { e.preventDefault(); pickAndOpen(true); }
    if (k === 'n') { e.preventDefault(); go('new'); }
    if (k === 'w') { const a = $('#tabs .tab.active'); if (a && a.dataset.tab !== 'home') { e.preventDefault(); closeTab(a.dataset.tab); } }
  });

  boot();
})();
