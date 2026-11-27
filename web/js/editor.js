/* 文件編輯頁：在分頁裡載入 ONLYOFFICE 編輯器（DataWord／DataExcel／DataPowerPoint／DataPDF），
 * 處理開檔轉換、儲存（含自動儲存、版本）、匯出、另存、共用、AI 與巨集。主畫面透過 window.ZOE 呼叫這裡。 */
(function () {
  const P = window.parent && window.parent.ZO ? window.parent.ZO : null;   // 主畫面（帳號、文件庫 API）
  const ZO = window.ZO;
  if (P) { ZO.sid = P.sid; ZO.api = P.api; ZO.get = P.get; ZO.raw = P.raw; ZO.fetchFile = P.fetchFile; ZO.native = P.native; ZO.setKinds && P.EXT_KIND && Object.assign(ZO.EXT_KIND, P.EXT_KIND); ZO.S = P.S; }
  const { $, h, t } = ZO;
  const C = window.ZOConvert;
  const q = new URLSearchParams(location.search);
  const DOC_ID = +q.get('id');
  const VID = q.get('vid') ? +q.get('vid') : null;
  ZO.lang = q.get('lang') || ZO.lang;

  // 編輯器內建可以直接存回的格式（x2t 實測可輸出）
  const NATIVE_OUT = { docx: 'DOCX', docm: 'DOCM', dotx: 'DOTX', odt: 'ODT', ott: 'OTT', rtf: 'RTF', txt: 'TXT',
    xlsx: 'XLSX', xlsm: 'XLSM', xltx: 'XLTX', ods: 'ODS', ots: 'OTS',
    pptx: 'PPTX', pptm: 'PPTM', ppsx: 'PPSX', potx: 'POTX', odp: 'ODP', otp: 'OTP', pdf: 'PDF' };
  // 自己轉的格式：開檔時先轉成…，存回時再轉回
  const VIA = { csv: 'xlsx', html: 'docx', htm: 'docx', mht: 'docx', mhtml: 'docx', epub: 'docx', fb2: 'docx', xml: 'docx' };
  const EXPORTS = {
    word: [['DOCX', 'Word 文件 (.docx)'], ['PDF', 'PDF'], ['ODT', 'OpenDocument 文字 (.odt)'], ['RTF', 'RTF'], ['TXT', '純文字 (.txt)'], ['HTML', '網頁 (.html)'], ['EPUB', '電子書 (.epub)'], ['FB2', 'FictionBook (.fb2)'], ['DOTX', 'Word 範本 (.dotx)'], ['PDFA', 'PDF/A（長期保存）']],
    cell: [['XLSX', 'Excel 活頁簿 (.xlsx)'], ['PDF', 'PDF'], ['ODS', 'OpenDocument 試算表 (.ods)'], ['CSV', 'CSV（逗號分隔）'], ['XLTX', 'Excel 範本 (.xltx)'], ['XLSM', '含巨集活頁簿 (.xlsm)']],
    slide: [['PPTX', 'PowerPoint 簡報 (.pptx)'], ['PDF', 'PDF'], ['ODP', 'OpenDocument 簡報 (.odp)'], ['PPSX', 'PowerPoint 播放檔 (.ppsx)'], ['POTX', 'PowerPoint 範本 (.potx)'], ['PPTM', '含巨集簡報 (.pptm)']],
    pdf: [['PDF', 'PDF'], ['DOCX', 'Word 文件 (.docx)'], ['PDFA', 'PDF/A']],
  };

  const E = (window.ZOE = { dirty: false, info: null, kind: 'word', ready: false, frame: null });
  let pendingExport = null, saving = null, viaExt = '', autosaveTimer = 0, heartbeatTimer = 0;

  // ================================================================ 開檔
  async function start() {
    await ZO.loadLang(ZO.lang);
    ZO.lang = ZO.lang || 'zh-TW';
    document.querySelectorAll('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
    try {
      E.info = await ZO.get('doc_info', { id: DOC_ID });
    } catch (e) { return fail(e.message); }
    const info = E.info;
    E.kind = info.kind;
    const K = ZO.KIND[info.kind] || ZO.KIND.word;
    document.documentElement.style.setProperty('--k', K.color);
    $('#app-badge').textContent = K.app;
    document.title = info.filename + ' - ' + K.app;
    setName();
    if (VID) info.readonly = true;
    $('#autosave').checked = !info.readonly && localStorage.getItem('zo_autosave') !== '0' && !!NATIVE_OUT[info.ext];
    $('#autosave').onchange = (e) => { localStorage.setItem('zo_autosave', e.target.checked ? '1' : '0'); scheduleAutosave(); };
    if (info.readonly) { $('#m-save').classList.add('hidden'); $('.autosave').classList.add('hidden'); setState(VID ? t('舊版本（唯讀）') : info.locked_by ? t('{0} 正在編輯（唯讀）', info.locked_by) : t('唯讀')); }
    bindBar();

    let bytes;
    try { bytes = info.size > 0 || VID ? await ZO.fetchFile(DOC_ID, VID) : null; } catch (e) { return fail(e.message); }
    let openType = info.ext, openBytes = bytes, pasteHtml = null;
    viaExt = VIA[info.ext] ? info.ext : '';
    try {
      if (bytes && bytes.byteLength) {
        if (info.ext === 'csv') { openBytes = C.csvToXlsx(bytes); openType = 'xlsx'; }
        else if (['html', 'htm', 'mht', 'mhtml', 'xml'].includes(info.ext)) { pasteHtml = C.decodeHtml(bytes); openBytes = null; openType = 'docx'; }
        else if (info.ext === 'epub') { pasteHtml = (await C.epubToHtml(bytes)).html; openBytes = null; openType = 'docx'; }
        else if (info.ext === 'fb2') { pasteHtml = C.fb2ToHtml(bytes).html; openBytes = null; openType = 'docx'; }
        else if (info.ext === 'txt') { pasteHtml = C.textToHtml(bytes); openBytes = null; openType = 'docx'; }
        else if (info.ext === 'rtf') openBytes = C.fixRtf(bytes);
      } else if (VIA[info.ext]) openType = VIA[info.ext];
    } catch (e) { return fail(t('這個檔案無法讀取：') + e.message); }
    if (!openBytes && pasteHtml !== null) openBytes = await fetch('assets/blank/blank.docx').then((r) => r.arrayBuffer());
    E.openType = openType;
    await loadApi();
    mount(openType, openBytes, info.readonly, pasteHtml);
    if (!info.readonly && !VID) {
      ZO.api('heartbeat', { id: DOC_ID, editing: true }).catch(() => {});
      heartbeatTimer = setInterval(() => ZO.api('heartbeat', { id: DOC_ID, editing: true }).catch(() => {}), 30000);
    }
  }
  function fail(msg) {
    $('#ed-loading').classList.remove('hidden');
    $('#ed-loading').innerHTML = '';
    $('#ed-loading').append(h('div', { style: { fontSize: '40px' } }, '⚠️'), h('div', { style: { maxWidth: '520px', textAlign: 'center' } }, msg),
      h('button', { class: 'btn', onclick: () => location.reload() }, t('重新開啟')));
  }
  function loadApi() {
    return new Promise((res, rej) => {
      if (window.DocsAPI) return res();
      const s = document.createElement('script');
      s.src = 'vendor/onlyoffice/web-apps/apps/api/documents/api.js';
      s.onload = res; s.onerror = () => rej(new Error(t('編輯器載入失敗')));
      document.head.append(s);
    });
  }

  const DT = { word: 'word', cell: 'cell', slide: 'slide', pdf: 'pdf' };
  function mount(type, bytes, readonly, pasteHtml) {
    window.OO_FILE_STREAM_ONLY = true;
    const url = bytes && bytes.byteLength ? URL.createObjectURL(new Blob([bytes])) : undefined;
    const kind = ZO.EXT_KIND[type] || E.kind;
    E.editor = new DocsAPI.DocEditor('iframe', {
      document: {
        title: E.info.filename, url, fileType: type, key: 'zo-' + DOC_ID + '-' + Date.now(),
        ...(type === 'pdf' ? { isForm: false, localOpenFromBinary: true } : {}),
        permissions: { edit: !readonly, download: true, print: true, chat: false, protect: false, comment: !readonly, review: !readonly },
        info: { owner: E.info.owner, uploaded: E.info.created_at },
      },
      documentType: DT[kind] || 'word',
      type: ZO.isPhone() ? 'mobile' : 'desktop',            // 手機用 ONLYOFFICE 的行動版介面（iPad 用桌面版）
      editorConfig: {
        mode: readonly ? 'view' : 'edit', lang: ZO.editorLang(),
        coEditing: { mode: 'fast', change: false },
        user: { id: (P && P.S && P.S.user && P.S.user.uid) || 'user', name: (P && P.S && P.S.user && P.S.user.name) || t('使用者') },
        customization: {
          help: false, hideRightMenu: false, compactHeader: false, toolbarNoTabs: false, uiTheme: 'theme-light',
          features: { featuresTips: false, spellcheck: { mode: false, change: false } },
          anonymous: { request: false, label: t('使用者') }, goback: false, close: false,
        },
      },
      events: {
        onAppReady: () => {
          E.frame = document.querySelector('iframe[name="frameEditor"]');
          if (type === 'pdf' && bytes) E.editor.openDocument({ buffer: bytes });
          guardLoop();
        },
        onDocumentReady: () => {
          E.ready = true;
          $('#ed-loading').classList.add('hidden');
          guardLoop();
          if (pasteHtml) {
            setTimeout(() => {
              try { api().pluginMethod_PasteHtml(pasteHtml); } catch (e) { console.error(e); }
              setTimeout(() => { clearModified(); markDirty(false); }, 1200);
            }, 300);
          }
          if (!readonly) ZO.Gas && ZO.Gas.onOpen();
          if (!E.info.readonly) setState(E.info.linked ? t('電腦上的檔案') : t('已儲存到文件庫'));
          pollDirty();
        },
        onDocumentStateChange: (ev) => { if (ev && ev.data) markDirty(true); },
        onDownloadAs: () => {},
        onRequestClose: () => P && P.closeTab(String(DOC_ID)),
        onError: (ev) => {
          const d = ev && ev.data;
          console.error('[OO]', d);
          if (!E.ready) fail(t('文件開啟失敗') + (d && d.errorDescription ? '：' + d.errorDescription : '') + (d && d.errorCode ? '（' + d.errorCode + '）' : ''));
        },
      },
    });
    setTimeout(() => { if (!E.ready) $('#ed-loading-msg').textContent = t('第一次開啟需要載入轉檔元件，請稍候…'); }, 8000);
  }
  const api = () => E.frame && E.frame.contentWindow && E.frame.contentWindow.Asc && E.frame.contentWindow.Asc.editor;
  const fw = () => E.frame && E.frame.contentWindow;
  E.api = api; E.fw = fw;

  // ================================================================ 修補編輯器（沒有文件伺服器時的行為）
  function guardLoop() {
    let n = 0;
    const tick = () => { if (installGuards() || ++n > 75) return; setTimeout(tick, 200); };
    tick();
  }
  function installGuards() {
    const w = fw();
    if (!w) return false;
    let done = true;
    try {
      if (!w.__zoShared) { Object.defineProperty(w, 'SharedWorker', { value: undefined, configurable: true }); w.__zoShared = true; }
      // 語系檔缺字時工具提示會變 undefined → 不要整個跳錯誤
      const ui = w.Common && w.Common.UI;
      if (ui && !w.__zoHint) {
        Object.values(ui).forEach((c) => { const p = c && c.prototype; if (p && typeof p.updateHint === 'function' && !p.__zoHint) { const o = p.updateHint; p.updateHint = function (hint, ...r) { if (hint === undefined || hint === null) return; return o.call(this, hint, ...r); }; p.__zoHint = true; } });
        w.__zoHint = true;
      } else if (!ui) done = false;
      // 開檔轉換要等字型系統準備好
      if (w.AscCommon && typeof w.AscCommon.fetchFonts === 'function' && !w.__zoFonts) {
        const orig = w.AscCommon.fetchFonts;
        w.AscCommon.fetchFonts = function (cb) {
          const ready = () => { const inf = w.AscFonts && w.AscFonts.g_font_infos; if (!Array.isArray(inf)) return false; if (!inf.length) return true; const f = w.AscCommon.g_font_loader && w.AscCommon.g_font_loader.fontFiles; return Array.isArray(f) && f.length > 0; };
          let waited = 0;
          const go = () => { if (ready() || waited > 15000) return orig.call(w.AscCommon, cb); waited += 50; setTimeout(go, 50); };
          go();
        };
        w.__zoFonts = true;
      }
      // 儲存（Ctrl+S、左上角存檔鈕）→ 存回文件庫／原檔；關掉編輯器自己的自動存檔
      const e = api();
      if (e && typeof e.asc_Save === 'function' && !w.__zoSave) {
        e.autoSaveGap = 0; e.autoSaveGapFast = 0; e.autoSaveGapRealTime = 0;
        e.asc_setAutoSaveGap = function () { this.autoSaveGap = 0; };
        const orig = e.asc_Save;
        e.asc_Save = function (isAuto, isUndo) {
          if (isAuto) return orig.call(this, isAuto, isUndo);
          setTimeout(() => E.save().catch(ZO.err), 0);
          return true;
        };
        // 長時間動作計數器外洩（圖表／表格框架編輯器）
        ['asc_editChartInFrameEditor', 'asc_editOleTableInFrameEditor'].forEach((nm) => {
          const o = e[nm];
          if (typeof o !== 'function') return;
          e[nm] = function (...a) { const before = this.IsLongActionCurrent || 0; try { return o.apply(this, a); } catch (err) { while ((this.IsLongActionCurrent || 0) > before) this.IsLongActionCurrent--; console.warn(err); } };
        });
        w.__zoSave = true;
      } else if (!e) done = false;
      // 關閉編輯器內的「關於」以外的雲端連結
      if (w.document && !w.__zoCss) {
        const st = w.document.createElement('style');
        st.textContent = '#header-logo, .extra .btn-goback, #left-btn-support, #left-btn-plugins-info{display:none!important}';
        w.document.head.append(st);
        w.__zoCss = true;
      }
    } catch (err) { console.warn(err); return false; }
    return done && E.ready;
  }

  // ================================================================ 匯出（編輯器 → 位元組）
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.type !== 'onlyoffice-file-stream' || !d.buffer) return;
    if (pendingExport) { const p = pendingExport; pendingExport = null; p.resolve({ buffer: d.buffer, name: d.fileName, ext: d.fileType }); }
    else userDownloaded(d.buffer, d.fileName, d.fileType);        // 使用者從編輯器「檔案 → 下載為」
  });
  function exportNative(fmt) {
    return new Promise((resolve, reject) => {
      const w = fw(), e = api();
      if (!w || !e || !E.ready) return reject(new Error(t('文件還沒開好，請稍候再試')));
      const code = w.Asc.c_oAscFileType[fmt];
      if (code === undefined) return reject(new Error(t('不支援的格式：') + fmt));
      if (pendingExport) return reject(new Error(t('正在處理上一個匯出，請稍候')));
      const timer = setTimeout(() => { if (pendingExport) { pendingExport = null; reject(new Error(t('匯出逾時，請再試一次'))); } }, 180000);
      pendingExport = { resolve: (r) => { clearTimeout(timer); resolve(r); } };
      try { e.asc_DownloadAs(new w.Asc.asc_CDownloadOptions(code)); } catch (err) { clearTimeout(timer); pendingExport = null; reject(err); }
    });
  }
  const baseName = () => E.info.name;
  function docHtml() {
    let html = api().pluginMethod_GetFileHTML() || '';
    html = html.replace(/ class="docData;[^"]*"/g, '');
    return html;
  }
  // 依格式產生檔案位元組：fmt 是大寫格式代號（DOCX、CSV、EPUB…）
  async function exportAs(fmt) {
    fmt = fmt.toUpperCase();
    if (fmt === 'CSV') {
      const r = await exportNative('XLSX');
      const out = C.xlsxToCsv(r.buffer, 0);
      if (out.sheets.length > 1) ZO.toast(t('CSV 只能存一個工作表，已存第一個工作表「{0}」', out.sheets[0]));
      return out.bytes;
    }
    if (fmt === 'TXT') return C.htmlToText(docHtml());          // 編輯器內建的 TXT 輸出會弄壞中文 → 自己轉（UTF-8）
    if (fmt === 'HTML' || fmt === 'HTM') return new TextEncoder().encode(C.htmlPage(docHtml(), baseName()));
    if (fmt === 'EPUB') return C.htmlToEpub(docHtml(), baseName(), ZO.lang);
    if (fmt === 'FB2') return C.htmlToFb2(docHtml(), baseName(), ZO.lang.slice(0, 2));
    if (fmt === 'MHT' || fmt === 'MHTML' || fmt === 'XML') return new TextEncoder().encode(C.htmlPage(docHtml(), baseName()));
    return new Uint8Array((await exportNative(fmt)).buffer);
  }
  E.exportAs = exportAs;

  // ================================================================ 儲存
  function canSaveInPlace() { const x = E.info.ext; return !!(NATIVE_OUT[x] || VIA[x]); }
  E.save = async function (opts) {
    opts = opts || {};
    if (E.info.readonly) { if (!opts.auto) ZO.toast(t('這份文件是唯讀的，請用「另存新檔」'), 'err'); return; }
    if (saving) return saving;
    if (!canSaveInPlace()) {                          // .doc／.xls／.ppt 等舊格式：只能讀不能寫回 → 另存成新格式
      if (opts.auto) return;
      return saveAsModern();
    }
    saving = (async () => {
      setState(t('儲存中…'));
      try {
        const bytes = await exportAs(NATIVE_OUT[E.info.ext] || E.info.ext.toUpperCase());
        const d = await ZO.raw('save', bytes, { id: DOC_ID });
        clearModified();
        markDirty(false);
        E.info.size = d.size;
        setState((opts.auto ? t('已自動儲存') : t('已儲存')) + ' ' + new Date().toLocaleTimeString().slice(0, -3));
        if (!opts.auto) ZO.toast(t('已儲存') + '：' + E.info.filename, 'ok');
      } catch (e) {
        setState(t('儲存失敗'));
        throw e;
      } finally { saving = null; }
    })();
    return saving;
  };
  async function saveAsModern() {
    const modern = { word: 'docx', cell: 'xlsx', slide: 'pptx', pdf: 'pdf' }[E.kind] || 'docx';
    const ok = await ZO.confirm(t('「.{0}」是舊格式，只能開啟、不能直接存回。要另存成「.{1}」嗎？（Microsoft Office 也能開）', E.info.ext, modern), t('另存為 .{0}', modern));
    if (ok) return saveAs(modern.toUpperCase());
  }
  // 另存新檔：存到文件庫（預設）或電腦上的任意位置
  async function saveAs(fmt) {
    fmt = (fmt || NATIVE_OUT[E.info.ext] || 'DOCX').toUpperCase();
    const ext = fmt === 'PDFA' ? 'pdf' : fmt.toLowerCase();
    const name = h('input', { class: 'inp', value: baseName() + (ext === E.info.ext ? ' - ' + t('複本') : '') });
    const where = ZO.selectEl([['lib', t('文件庫（我的文件）')]].concat(ZO.native ? [['pc', t('電腦上的資料夾…')]] : [['dl', t('下載到這台裝置')]]), 'lib');
    const r = await ZO.dialog({ title: t('另存新檔'), body: h('div', {}, h('label', { class: 'fld' }, t('檔名'), name), h('label', { class: 'fld' }, t('儲存位置'), where), h('p', { class: 'hint' }, t('格式：') + fmt)),
      buttons: [{ label: t('取消'), value: null }, { label: t('儲存'), primary: true, onClick: () => name.value.trim() ? { name: name.value.trim(), where: where.value } : false }] });
    if (!r) return;
    const b = ZO.busy(t('匯出中…'));
    try {
      const bytes = await exportAs(fmt);
      if (r.where === 'lib') {
        const d = await ZO.raw('save_as', bytes, { id: DOC_ID, name: r.name, ext });
        b.close();
        ZO.toast(t('已另存到文件庫：') + d.filename, 'ok');
        if (P && ZO.EXT_KIND[ext] && ext !== 'pdf' || (P && ext === 'pdf' && E.kind === 'pdf')) {
          if (await ZO.confirm(t('要開啟剛存好的「{0}」嗎？', d.filename), t('開啟'))) P.openDoc(d);
        }
      } else if (r.where === 'pc') {
        b.close();
        const path = await ZO.native.save_dialog(r.name + '.' + ext, ext);
        if (!path) return;
        await ZO.raw('export_to', bytes, { path });
        ZO.toast(t('已存到：') + path, 'ok');
      } else { b.close(); download(bytes, r.name + '.' + ext); }
    } catch (e) { b.close(); ZO.err(e); }
  }
  E.saveAs = saveAs;
  function download(bytes, filename) {
    const a = h('a', { href: URL.createObjectURL(new Blob([bytes])), download: filename });
    document.body.append(a); a.click(); setTimeout(() => a.remove(), 500);
  }
  async function userDownloaded(buffer, fileName, ext) {
    // 編輯器自己的「下載為」：問要存到哪裡
    const nm = (fileName || baseName() + '.' + ext).replace(/\.[^.]+$/, '');
    const where = await ZO.dialog({ title: t('下載為') + ' ' + String(ext).toUpperCase(), body: h('p', {}, t('要把「{0}」存到哪裡？', nm + '.' + ext)),
      buttons: [{ label: t('取消'), value: null }, ZO.native ? { label: t('電腦上的資料夾…'), value: 'pc' } : { label: t('下載到這台裝置'), value: 'dl' }, { label: t('文件庫'), primary: true, value: 'lib' }] });
    if (!where) return;
    try {
      if (where === 'lib') { const d = await ZO.raw('save_as', buffer, { id: DOC_ID, name: nm, ext }); ZO.toast(t('已另存到文件庫：') + d.filename, 'ok'); }
      else if (where === 'pc') { const p = await ZO.native.save_dialog(nm + '.' + ext, ext); if (p) { await ZO.raw('export_to', buffer, { path: p }); ZO.toast(t('已存到：') + p, 'ok'); } }
      else download(buffer, nm + '.' + ext);
    } catch (e) { ZO.err(e); }
  }

  // ================================================================ 變更狀態、自動儲存
  function clearModified() {               // 文書：SetUnchangedDocument；試算表：要重設歷程的存檔點
    try { api().SetUnchangedDocument(); } catch (e) { /* */ }
    try { fw().AscCommon.History.Reset_SavedIndex(true); } catch (e) { /* */ }
  }
  function markDirty(v) {
    if (E.dirty === v) return;
    E.dirty = v;
    if (P) P.tabState(VID ? DOC_ID + '@' + VID : DOC_ID, { dirty: v });
    if (v) { setState(t('尚未儲存')); scheduleAutosave(); }
  }
  function pollDirty() {
    setInterval(() => { try { const m = api() && api().isDocumentModified(); if (m && !E.dirty) markDirty(true); } catch (e) { /* */ } }, 1500);
  }
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    if (!$('#autosave').checked || !E.dirty || E.info.readonly) return;
    autosaveTimer = setTimeout(() => { if (E.dirty && $('#autosave').checked) E.save({ auto: true }).catch((e) => setState(t('自動儲存失敗：') + e.message)); }, 20000);
  }
  E.isDirty = () => !!E.dirty;
  E.close = () => { clearInterval(heartbeatTimer); ZO.api('heartbeat', { id: DOC_ID, editing: false }).catch(() => {}); };
  function setState(s) { $('#save-state').textContent = s; }
  function setName() { $('#doc-name').textContent = E.info.filename; $('#doc-name').title = E.info.linked ? E.info.path : E.info.filename; }

  // ================================================================ 上方列
  function bindBar() {
    $('#m-save').onclick = () => E.save().catch(ZO.err);
    $('#doc-name').onclick = async () => {
      if (E.info.readonly) return;
      const n = await ZO.prompt(t('重新命名'), E.info.name);
      if (!n || n === E.info.name) return;
      try { await ZO.api('doc_rename', { id: DOC_ID, name: n }); E.info = await ZO.get('doc_info', { id: DOC_ID }); setName(); P && P.tabState(DOC_ID, { doc: E.info }); } catch (e) { ZO.err(e); }
    };
    $('#m-file').onclick = (ev) => {
      const exp = (EXPORTS[E.kind] || EXPORTS.word).map(([f, l]) => [t('匯出') + '：' + t(l), () => saveAs(f)]);
      ZO.menu(ev.currentTarget, [
        [t('儲存') + '　Ctrl+S', () => E.save().catch(ZO.err), { disabled: E.info.readonly }],
        [t('另存新檔…'), () => saveAs()],
        '-', ...exp,
        (E.kind === 'word' || E.kind === 'slide' || E.kind === 'pdf') ? [t('匯出到資料助秘電子書翻頁…'), toFlipbook] : null,
        '-',
        [t('版本記錄…'), () => P && P.versions(E.info)],
        ZO.native ? [t('用 Microsoft Office 或預設程式開啟'), openInOffice] : null,
        ZO.native ? [t('在檔案總管中顯示'), () => ZO.api('reveal', { id: DOC_ID }).catch(ZO.err)] : null,
        [t('列印…'), () => { try { api().asc_Print(); } catch (e) { ZO.err(e); } }],
        '-',
        [t('關閉'), () => P && P.closeTab(String(VID ? DOC_ID + '@' + VID : DOC_ID))],
      ]);
    };
    $('#m-share').onclick = (ev) => ZO.menu(ev.currentTarget, [
      [E.info.shared ? t('取消共用') : t('共用給公司其他使用者'), async () => { try { await ZO.api('doc_flag', { id: DOC_ID, flag: 'shared', value: !E.info.shared }); E.info.shared = !E.info.shared; ZO.toast(E.info.shared ? t('已共用，其他有權限的人可以在「與我共用」看到') : t('已取消共用'), 'ok'); } catch (e) { ZO.err(e); } }, { disabled: !E.info.mine }],
      [t('以電子郵件寄出（PDF）…'), () => mailPdf()],
      [t('匯出 PDF 給別人…'), () => saveAs('PDF')],
    ]);
    $('#m-ai').onclick = () => ZO.AIPanel && ZO.AIPanel.toggle();
    $('#m-ext').onclick = (ev) => ZO.Gas && ZO.Gas.menu(ev.currentTarget);
    window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); E.save().catch(ZO.err); } });
  }
  async function openInOffice() {
    if (E.dirty && !(await ZO.confirm(t('有尚未儲存的變更，要先儲存再用其他程式開啟嗎？'), t('先儲存')))) return;
    if (E.dirty) await E.save().catch(ZO.err);
    const r = await ZO.api('reveal', { id: DOC_ID }).catch(ZO.err);
    if (r) ZO.native.open_file(r.path);
  }
  async function mailPdf() {
    const b = ZO.busy(t('匯出 PDF 中…'));
    try {
      const bytes = await exportAs('PDF');
      b.close();
      if (ZO.native) {
        const p = await ZO.native.save_dialog(baseName() + '.pdf', 'pdf');
        if (!p) return;
        await ZO.raw('export_to', bytes, { path: p });
        ZO.native.reveal(p);
        ZO.toast(t('PDF 已存好，請把它拖進郵件附件'), 'ok');
      } else download(bytes, baseName() + '.pdf');
    } catch (e) { b.close(); ZO.err(e); }
  }
  async function toFlipbook() {
    const b = ZO.busy(t('轉成 PDF 中…'));
    try {
      const bytes = await exportAs('PDF');
      b.set(t('交給電子書翻頁工具…'));
      const r = await ZO.raw('to_flipbook', bytes, { name: baseName() });
      b.close();
      if (r.web) {
        const go = await ZO.dialog({ title: t('匯出到資料助秘電子書翻頁'), body: h('p', {}, t('PDF「{0}」已下載。請在「資料助秘電子書翻頁」按「建立電子書 → PDF 檔」選這個檔案。', r.path)),
          buttons: [{ label: t('關閉'), value: null }, { label: t('開啟線上版'), primary: true, value: 'web' }] });
        if (go === 'web') window.open('https://achir1015.github.io/zms-flipbook/', '_blank');
      } else if (r.launched) ZO.toast(t('已交給「資料助秘電子書翻頁」，請在翻頁工具裡繼續設計'), 'ok');
      else {
        const go = await ZO.dialog({ title: t('匯出到資料助秘電子書翻頁'), body: h('div', {}, h('p', {}, t('PDF 已放到電子書翻頁工具的收件匣：')), h('p', { class: 'hint', style: { wordBreak: 'break-all' } }, r.path),
          h('p', {}, r.installed ? t('請開啟「資料助秘電子書翻頁」，它會自動匯入。') : t('這台電腦還沒安裝「資料助秘電子書翻頁」。可以先安裝，或使用線上版匯入這個 PDF。'))),
        buttons: [{ label: t('關閉'), value: null }, { label: t('開啟線上版'), primary: !r.installed, value: 'web' }] });
        if (go === 'web' && ZO.native) ZO.native.open_url('https://achir1015.github.io/zms-flipbook/');
      }
    } catch (e) { b.close(); ZO.err(e); }
  }

  // ================================================================ 給 AI／巨集用：在編輯器裡執行文件 API（Api.*）
  E.runBuilder = function (code) {
    const w = fw(), e = api();
    if (!w || !e || !E.ready) throw new Error(t('文件還沒開好'));
    if (E.info.readonly) throw new Error(t('唯讀文件不能執行會修改內容的程式'));
    let r;
    e._beforeEvalCommand();
    try { r = w.AscCommon.safePluginEval(code); }
    finally {
      try { e._afterEvalCommand(function () {}); } catch (err) { /* */ }
      try { e.onEndBuilderScript && e.onEndBuilderScript(); } catch (err) { /* */ }
    }
    try { e.SetDocumentModified && e.SetDocumentModified(true); } catch (err) { /* */ }
    markDirty(true);
    return r;
  };
  E.readBuilder = function (code) {           // 只讀取（不標記成已修改）
    const w = fw(), e = api();
    if (!w || !e || !E.ready) throw new Error(t('文件還沒開好'));
    e._beforeEvalCommand();
    try { return w.AscCommon.safePluginEval(code); }
    finally { try { e._afterEvalCommand(function () {}); } catch (err) { /* */ } try { e.onEndBuilderScript && e.onEndBuilderScript(); } catch (err) { /* */ } }
  };
  E.pasteHtml = (html) => { api().pluginMethod_PasteHtml(html); markDirty(true); };
  E.pasteText = (text) => { api().pluginMethod_PasteText(text); markDirty(true); };
  E.selectedText = function () {
    try {
      if (E.kind === 'word') return E.readBuilder('Api.GetDocument().GetRangeBySelect() ? Api.GetDocument().GetRangeBySelect().GetText() : ""') || '';
      if (E.kind === 'cell') return E.readBuilder('var r=Api.GetSelection(); var v=r.GetValue(); Array.isArray(v) ? v.map(function(x){return Array.isArray(x)?x.join("\\t"):x}).join("\\n") : String(v==null?"":v)') || '';
      if (E.kind === 'slide') return (api().asc_GetSelectedText && api().asc_GetSelectedText()) || '';
    } catch (e) { console.warn(e); }
    return '';
  };
  E.allText = function () {
    try {
      if (E.kind === 'word' || E.kind === 'pdf') {
        const d = new DOMParser().parseFromString(docHtml(), 'text/html');
        return d.body.innerText || d.body.textContent || '';
      }
      if (E.kind === 'cell') return E.readBuilder('var s=Api.GetActiveSheet(); var u=s.GetUsedRange(); var v=u.GetValue(); (Array.isArray(v)?v:[[v]]).map(function(x){return Array.isArray(x)?x.join("\\t"):x}).join("\\n")') || '';
      if (E.kind === 'slide') return E.readBuilder('var p=Api.GetPresentation(); var out=[]; for(var i=0;i<p.GetSlidesCount();i++){ var s=p.GetSlideByIndex(i); var sh=s.GetAllShapes(); var tx=[]; for(var j=0;j<sh.length;j++){ try{ var c=sh[j].GetDocContent(); if(c){ for(var k=0;k<c.GetElementsCount();k++){ var el=c.GetElement(k); if(el.GetText) tx.push(el.GetText()); } } }catch(e){} } out.push("第"+(i+1)+"頁：\\n"+tx.join("\\n")); } out.join("\\n\\n")') || '';
    } catch (e) { console.warn(e); }
    return '';
  };

  start();
})();
