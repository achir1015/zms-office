/* DataDiagram：內嵌 draw.io（diagrams.net，Apache 2.0）畫流程圖、組織圖、心智圖、網路圖、UML。
 * 用 draw.io 的 embed 協定（postMessage JSON）載入／存檔／匯出；離線執行（stealth，不連外部服務）。 */
(function () {
  const P = window.parent && window.parent.ZO ? window.parent.ZO : null;
  const ZO = window.ZO;
  if (P) { ZO.sid = P.sid; ZO.api = P.api; ZO.get = P.get; ZO.raw = P.raw; ZO.fetchFile = P.fetchFile; ZO.native = P.native; ZO.S = P.S; }
  const { $, h, t } = ZO;
  const q = new URLSearchParams(location.search);
  const DOC_ID = +q.get('id');
  const VID = q.get('vid') ? +q.get('vid') : null;
  ZO.lang = q.get('lang') || ZO.lang;
  const DIO_LANG = { 'zh-TW': 'zh-tw', 'zh-CN': 'zh', en: 'en', ja: 'ja', ko: 'ko', vi: 'vi', id: 'id', th: 'th', fr: 'fr', de: 'de', es: 'es' };
  const E = (window.ZOE = { kind: 'diagram', dirty: false, info: null, xml: '' });
  let frame, waiters = {}, seq = 0, autosaveTimer = 0;

  async function start() {
    await ZO.loadLang(ZO.lang);
    document.querySelectorAll('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
    document.documentElement.style.setProperty('--k', ZO.KIND.diagram.color);
    try { E.info = await ZO.get('doc_info', { id: DOC_ID }); } catch (e) { return fail(e.message); }
    if (VID) E.info.readonly = true;
    $('#doc-name').textContent = E.info.filename;
    document.title = E.info.filename + ' - DataDiagram';
    let text = '';
    try {
      const buf = E.info.size > 0 || VID ? await ZO.fetchFile(DOC_ID, VID) : null;
      if (buf) text = E.info.ext === 'vsdx' ? '' : new TextDecoder().decode(buf);
      if (E.info.ext === 'vsdx' && buf) E.vsdx = buf;
    } catch (e) { return fail(e.message); }
    E.xml = text || '';
    $('#autosave').checked = !E.info.readonly && localStorage.getItem('zo_autosave') !== '0' && E.info.ext !== 'vsdx';
    $('#autosave').onchange = (e) => localStorage.setItem('zo_autosave', e.target.checked ? '1' : '0');
    if (E.info.readonly) { $('#m-save').classList.add('hidden'); $('.autosave').classList.add('hidden'); $('#save-state').textContent = t('唯讀'); }
    bindBar();
    frame = $('#dio');
    const params = new URLSearchParams({ embed: '1', proto: 'json', spin: '1', ui: ZO.isPhone() ? 'simple' : 'kennedy', lang: DIO_LANG[ZO.lang] || 'en', stealth: '1', offline: '1', pwa: '0', noExitBtn: '1', noSaveBtn: '1', saveAndExit: '0', libraries: '1', configure: '1', math: '0', dark: '0' });
    if (E.info.readonly) params.set('chrome', '0');
    frame.src = 'vendor/drawio/index.html?' + params.toString();
  }
  function fail(msg) { $('#ed-loading').innerHTML = ''; $('#ed-loading').append(h('div', { style: { fontSize: '40px' } }, '⚠️'), h('div', {}, msg)); }
  function post(msg) { frame.contentWindow.postMessage(JSON.stringify(msg), location.origin); }
  function request(msg) { return new Promise((res) => { const id = 'r' + ++seq; waiters[id] = res; post(Object.assign({ id }, msg)); setTimeout(() => { if (waiters[id]) { delete waiters[id]; res(null); } }, 60000); }); }

  window.addEventListener('message', (ev) => {
    if (!frame || ev.source !== frame.contentWindow || typeof ev.data !== 'string') return;
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.event === 'configure') post({ action: 'configure', config: { defaultFonts: ['Microsoft JhengHei', 'Noto Sans TC', 'Helvetica', 'Arial', 'Times New Roman'], compressXml: false } });
    else if (m.event === 'init') {
      $('#ed-loading').classList.add('hidden');
      // 取得 draw.io 編輯器物件（同網域）：攔截 fireEvent 記下 this，AI 匯入 Mermaid／Visio 會用到
      try { const dw = frame.contentWindow, EP = dw.EditorUi.prototype, of = EP.fireEvent; if (!EP.__zo) { EP.fireEvent = function () { dw.__zoUi = this; return of.apply(this, arguments); }; EP.__zo = true; } } catch (e) { /* */ }
      const mm = (E.xml || '').match(/<zoMermaid>([\s\S]*?)<\/zoMermaid>/);
      if (mm) {                         // MCP／AI 建立的流程圖：先載入空白頁，再把 Mermaid 轉成可編輯圖形
        E.xml = E.xml.replace(mm[0], '');
        const src = mm[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
        setTimeout(() => insertMermaid(src), 900);
      }
      if (E.vsdx) post({ action: 'load', xml: E.xml || '', autosave: 1, title: E.info.filename }), importVsdx(E.vsdx);
      else post({ action: 'load', xml: E.xml || '', autosave: 1, title: E.info.filename, saveAndExit: '0', noSaveBtn: '1', noExitBtn: '1' });
      E.ready = true;
    } else if (m.event === 'load') { E.dirty = false; }
    else if (m.event === 'autosave' || m.event === 'save') {
      E.xml = m.xml;
      markDirty(true);
      if (m.event === 'save') E.save().catch(ZO.err);
    } else if (m.event === 'export') {
      const w = waiters[m.message && m.message.id] || waiters[m.id];
      if (w) { delete waiters[m.message ? m.message.id : m.id]; w(m); }
      else { const k = Object.keys(waiters)[0]; if (k) { const f = waiters[k]; delete waiters[k]; f(m); } }
    }
  });
  function importVsdx(buf) {
    // draw.io 內建 Visio 匯入（前端轉換）：同網域可以直接呼叫編輯器
    try {
      const w = frame.contentWindow, ui = w.__zoUi;
      if (!ui) throw new Error('no ui');
      const blob = new w.Blob([buf]);
      ui.importVisio(blob, (xml) => { ui.editor.setGraphXml(w.mxUtils.parseXml(xml).documentElement); markDirty(true); ZO.toast(t('已匯入 Visio 檔，存檔會另存成 .drawio')); }, (e) => ZO.err(e));
    } catch (e) { ZO.toast(t('這個 Visio 檔無法匯入：') + e.message, 'err'); }
  }

  function markDirty(v) {
    E.dirty = v;
    if (P) P.tabState(DOC_ID, { dirty: v });
    $('#save-state').textContent = v ? t('尚未儲存') : $('#save-state').textContent;
    clearTimeout(autosaveTimer);
    if (v && $('#autosave').checked) autosaveTimer = setTimeout(() => E.dirty && E.save({ auto: true }).catch(() => {}), 15000);
  }
  E.isDirty = () => !!E.dirty;
  E.close = () => {};
  E.save = async function (opts) {
    opts = opts || {};
    if (E.info.readonly) return;
    if (E.info.ext === 'vsdx') { if (!opts.auto) return saveAs('drawio'); return; }
    const bytes = new TextEncoder().encode(E.xml || '');
    $('#save-state').textContent = t('儲存中…');
    await ZO.raw('save', bytes, { id: DOC_ID });
    E.dirty = false;
    if (P) P.tabState(DOC_ID, { dirty: false });
    $('#save-state').textContent = (opts.auto ? t('已自動儲存') : t('已儲存')) + ' ' + new Date().toLocaleTimeString().slice(0, -3);
    if (!opts.auto) ZO.toast(t('已儲存') + '：' + E.info.filename, 'ok');
  };
  async function exportData(format) {
    const r = await request({ action: 'export', format, spin: t('匯出中…'), scale: format === 'png' ? 2 : 1, border: 10, background: '#ffffff' });
    if (!r || !r.data) throw new Error(t('匯出失敗'));
    return r.data;              // data: 網址或 SVG 文字
  }
  function dataUrlBytes(d) {
    if (/^data:/.test(d)) { const b = atob(d.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
    return new TextEncoder().encode(d);
  }
  async function saveAs(fmt) {
    const ext = fmt;
    let bytes;
    const b = ZO.busy(t('匯出中…'));
    try {
      if (fmt === 'drawio') bytes = new TextEncoder().encode(E.xml || '');
      else if (fmt === 'svg') bytes = dataUrlBytes(await exportData('svg'));
      else if (fmt === 'png') bytes = dataUrlBytes(await exportData('png'));
      else if (fmt === 'pdf') { b.close(); post({ action: 'export', format: 'pdf' }); return ZO.toast(t('請在列印視窗選「另存為 PDF」')); }
      b.close();
      const name = await ZO.prompt(t('另存新檔'), E.info.name + (ext === E.info.ext ? ' - ' + t('複本') : ''), t('檔名'));
      if (!name) return;
      if (ZO.native && fmt !== 'drawio') {
        const p = await ZO.native.save_dialog(name + '.' + ext, ext);
        if (!p) return;
        await ZO.raw('export_to', bytes, { path: p });
        ZO.toast(t('已存到：') + p, 'ok');
      } else if (fmt === 'drawio') {
        const d = await ZO.raw('save_as', bytes, { id: DOC_ID, name, ext });
        ZO.toast(t('已另存到文件庫：') + d.filename, 'ok');
      } else {
        await ZO.saveFile(bytes, name + '.' + ext);
      }
    } catch (e) { b.close(); ZO.err(e); }
  }
  // 插入到其他已開啟的 DataWord／DataPowerPoint 分頁
  async function insertToDoc() {
    const tabs = Array.from(window.parent.document.querySelectorAll('#views .view.doc iframe')).map((f) => f.contentWindow).filter((w) => w && w.ZOE && (w.ZOE.kind === 'word' || w.ZOE.kind === 'slide') && w.ZOE.ready && !w.ZOE.info.readonly);
    if (!tabs.length) return ZO.alert(t('請先開啟要插入的 DataWord 文件或 DataPowerPoint 簡報（可編輯的），再按一次。'));
    const sel = ZO.selectEl(tabs.map((w, i) => [String(i), ZO.KIND[w.ZOE.kind].app + '：' + w.ZOE.info.filename]), '0');
    const ok = await ZO.dialog({ title: t('插入到文件'), body: h('div', {}, h('label', { class: 'fld' }, t('插入到'), sel), h('p', { class: 'hint' }, t('會在文件目前的游標位置插入這張流程圖的圖片。'))), buttons: [{ label: t('取消'), value: false }, { label: t('插入'), primary: true, value: true }] });
    if (!ok) return;
    try {
      const png = await exportData('png');
      const w = tabs[+sel.value];
      w.ZOE.pasteHtml('<p><img src="' + png + '" style="max-width:100%"></p>');
      ZO.toast(t('已插入，請切換到該分頁查看'), 'ok');
    } catch (e) { ZO.err(e); }
  }
  // AI：用文字描述 → Mermaid → draw.io 內建轉換成可編輯圖形
  async function aiDiagram() {
    const ta = h('textarea', { class: 'inp', rows: 5, placeholder: t('例如：請假流程：員工提出申請 → 主管審核（同意／退回）→ 人事登錄 → 通知員工') });
    const type = ZO.selectEl([['flowchart TD', t('流程圖（上到下）')], ['flowchart LR', t('流程圖（左到右）')], ['sequenceDiagram', t('循序圖')], ['mindmap', t('心智圖')], ['gantt', t('甘特圖')], ['classDiagram', t('類別圖')], ['erDiagram', t('資料表關聯圖')]], 'flowchart TD');
    const r = await ZO.dialog({ title: '✨ ' + t('AI 畫流程圖'), width: '560px', body: h('div', {}, h('label', { class: 'fld' }, t('想畫什麼？'), ta), h('label', { class: 'fld' }, t('圖的種類'), type),
      h('p', { class: 'hint' }, t('AI 會產生 Mermaid 圖表語法，再轉成可以編輯的圖形；也可以直接貼上 Mermaid 語法。'))),
    buttons: [{ label: t('取消'), value: null }, { label: t('產生'), primary: true, onClick: () => (ta.value.trim() ? { text: ta.value.trim(), type: type.value } : false) }] });
    if (!r) return;
    let mermaid = /^(flowchart|graph|sequenceDiagram|mindmap|gantt|classDiagram|erDiagram|stateDiagram|pie|journey)/.test(r.text) ? r.text : null;
    if (!mermaid) {
      const b = ZO.busy(t('AI 繪製中…'));
      try {
        const res = await ZO.api('ai_chat', { messages: [{ role: 'user', content: '請把以下描述畫成 Mermaid 圖表，類型用「' + r.type + '」。節點文字用' + (ZO.lang.startsWith('zh') ? '繁體中文' : '使用者的語言') + '，節點文字若有括號或特殊符號請用雙引號包起來。只回覆 Mermaid 程式碼，不要其他說明。\n\n' + r.text }] });
        mermaid = res.text.replace(/^```(mermaid)?\s*|```\s*$/gim, '').trim();
      } catch (e) { b.close(); return ZO.err(e); }
      b.close();
    }
    insertMermaid(mermaid);
  }
  function insertMermaid(src) {
    try {
      const w = frame.contentWindow;
      const ui = w.__zoUi;
      if (ui && ui.parseMermaidDiagram) {
        return ui.parseMermaidDiagram(src, null, (xml) => {
          const g = ui.editor.graph, pt = g.getFreeInsertPoint ? g.getFreeInsertPoint() : { x: 20, y: 20 };
          const cells = ui.importXml(xml, pt.x, pt.y, true);
          if (cells && cells.length) g.setSelectionCells(cells);
          ZO.toast(t('已加入流程圖，可以直接拖曳修改'), 'ok');
        }, (e) => { ZO.toast(t('轉換失敗：') + e.message, 'err'); fallbackMermaid(src); });
      }
    } catch (e) { console.warn(e); }
    fallbackMermaid(src);
  }
  function fallbackMermaid(src) {
    navigator.clipboard.writeText(src).catch(() => {});
    ZO.alert(t('已把 Mermaid 語法複製到剪貼簿。請在 draw.io 選「調整（+）→ 進階 → Mermaid」，貼上後按「插入」。'));
  }
  function bindBar() {
    $('#m-save').onclick = () => E.save().catch(ZO.err);
    $('#m-file').onclick = (ev) => ZO.menu(ev.currentTarget, [
      [t('儲存') + '　Ctrl+S', () => E.save().catch(ZO.err), { disabled: E.info.readonly }],
      [t('另存新檔…'), () => saveAs('drawio')],
      '-',
      [t('匯出') + '：PNG', () => saveAs('png')], [t('匯出') + '：SVG', () => saveAs('svg')], [t('匯出') + '：PDF（' + t('列印') + '）', () => saveAs('pdf')],
      '-',
      [t('版本記錄…'), () => P && P.versions(E.info)],
      [t('關閉'), () => P && P.closeTab(String(DOC_ID))],
    ]);
    $('#m-ai').onclick = aiDiagram;
    $('#m-insert').onclick = insertToDoc;
    window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); E.save().catch(ZO.err); } });
  }
  E.exportPng = () => exportData('png');
  start();
})();
