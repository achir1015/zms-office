/* 擴充功能 → Apps Script 編輯器（開發人員模式）：在獨立分頁撰寫、儲存、執行 Google Apps Script 寫法的程式與巨集。
 * 程式在選定的「已開啟文件」裡執行；同一份程式碼可以複製到 Google 的 Apps Script 使用。 */
(function () {
  const ZO = window.ZO;
  const { $, $$, h, t } = ZO;
  const SAMPLES = {
    cell: ['試算表範例：做一張銷售表', `/** 在目前的工作表建立銷售表並加總（Google 試算表也能直接執行） */
function buildSalesTable() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = [
    ['品名', '數量', '單價', '金額'],
    ['蘋果', 12, 30, '=B2*C2'],
    ['香蕉', 5, 20, '=B3*C3'],
    ['芒果', 8, 45, '=B4*C4'],
  ];
  sheet.getRange(1, 1, data.length, 4).setValues(data);
  sheet.getRange('A1:D1').setBackground('#217346').setFontColor('#ffffff').setFontWeight('bold');
  sheet.appendRow(['合計', '=SUM(B2:B4)', '', '=SUM(D2:D4)']);
  sheet.getRange('A5:D5').setFontWeight('bold');
  Logger.log('完成，最後一列：' + sheet.getLastRow());
}

/** 開啟文件時自動加上自訂選單（綁定這份文件才會自動執行） */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('我的工具')
    .addItem('建立銷售表', 'buildSalesTable')
    .addToUi();
}
`],
    word: ['文件範例：自動產生會議紀錄', `/** 在文件最後加上一份會議紀錄範本（Google 文件也能直接執行） */
function addMeetingNotes() {
  const body = DocumentApp.getActiveDocument().getBody();
  body.appendParagraph('會議紀錄').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('日期：' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd'));
  body.appendParagraph('討論事項').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  ['專案進度', '預算檢討', '下次會議時間'].forEach(function (x) { body.appendListItem(x); });
  body.appendTable([['工作項目', '負責人', '期限'], ['', '', ''], ['', '', '']]);
  Logger.log('已加入會議紀錄');
}

function onOpen() {
  DocumentApp.getUi().createMenu('我的工具')
    .addItem('加入會議紀錄', 'addMeetingNotes')
    .addToUi();
}
`],
    slide: ['簡報範例：自動產生投影片', `/** 新增一張重點投影片（Google 簡報也能直接執行） */
function addSummarySlide() {
  const pres = SlidesApp.getActivePresentation();
  const slide = pres.appendSlide();
  const w = pres.getPageWidth(), h = pres.getPageHeight();
  slide.getBackground().setSolidFill('#fff7ed');
  const title = slide.insertTextBox('本季重點', 40, 30, w - 80, 60);
  title.getText().getTextStyle().setFontSize(32).setBold(true).setForegroundColor('#c43e1c');
  const body = slide.insertTextBox('• 營收成長 12%\\n• 新客戶 35 家\\n• 滿意度 4.6 分', 60, 120, w - 120, h - 180);
  body.getText().getTextStyle().setFontSize(22);
  Logger.log('目前共有 ' + pres.getSlides().length + ' 張投影片');
}
`],
  };

  let view = null, cur = null, list = [], target = null;
  function tabsOfKind() {
    return $$('#views .view.doc').map((v) => { const f = v.querySelector('iframe'); const w = f && f.contentWindow; return w && w.ZOE && w.ZOE.info ? { key: v.dataset.tab, w } : null; }).filter(Boolean);
  }

  async function open(opts) {
    opts = opts || {};
    if (!view) build();
    ZO.showTab('dev');
    await reload();
    if (opts.id) select(list.find((s) => s.id === opts.id));
    else if (opts.doc && !cur) {
      const bound = list.find((s) => s.doc_id && +s.doc_id === +opts.doc.id);
      if (bound) select(bound); else newScript(opts.kind || opts.doc.kind, opts.doc);
    } else if (!cur && list.length) select(list[0]);
    else if (!cur) newScript('cell');
    refreshTargets(opts.doc && opts.doc.id);
  }
  function build() {
    const tab = h('div', { class: 'tab', 'data-tab': 'dev', onclick: () => ZO.showTab('dev') }, h('span', { class: 'ti' }, '📜'), h('span', { class: 'tn' }, 'Apps Script'),
      h('button', { class: 'tx', onclick: (e) => { e.stopPropagation(); closeTab(); } }, '✕'));
    $('#tabs').append(tab);
    view = h('div', { class: 'view dev', 'data-tab': 'dev' },
      h('div', { class: 'dev-top' }, h('span', { class: 'ttl' }, '📜 ', h('span', { id: 'sc-name' }, ''), h('button', { class: 'mini', onclick: rename }, t('重新命名'))),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn small', onclick: save }, '💾 ' + t('儲存')),
        h('span', {}, t('函式')), h('select', { class: 'inp', id: 'sc-fn', style: { width: '170px', height: '28px' } }),
        h('span', {}, t('在')), h('select', { class: 'inp', id: 'sc-target', style: { width: '220px', height: '28px' } }),
        h('button', { class: 'btn small primary', onclick: runCur }, '▶ ' + t('執行')),
        h('button', { class: 'btn small', onclick: (e) => more(e.currentTarget) }, '⋯')),
      h('div', { class: 'dev-body' },
        h('div', { class: 'dev-side' }, h('div', { class: 'toolbar', style: { marginBottom: '8px' } }, h('button', { class: 'btn small', onclick: (e) => ZO.menu(e.currentTarget, Object.entries(SAMPLES).map(([k, s]) => [t(s[0]), () => newScript(k)]).concat([['-'], [t('空白專案'), () => newScript('any', null, true)]]).filter((x) => x[0] !== '-' || true).map((x) => (x[0] === '-' ? '-' : x))) }, '＋ ' + t('新增'))), h('div', { id: 'sc-list' })),
        h('div', { class: 'dev-main' },
          h('div', { class: 'code-wrap' }, h('div', { class: 'code-lines', id: 'sc-lines' }, '1'), h('textarea', { class: 'code-ed', id: 'sc-code', spellcheck: 'false' })),
          h('div', { class: 'dev-log', id: 'sc-log' }, h('span', { class: 'i' }, t('執行紀錄會顯示在這裡（Logger.log / console.log）。'))))));
    $('#views').append(view);
    const ed = $('#sc-code', view);
    const lines = () => { $('#sc-lines').textContent = Array.from({ length: ed.value.split('\n').length }, (_, i) => i + 1).join('\n'); $('#sc-lines').scrollTop = ed.scrollTop; };
    ed.addEventListener('input', () => { lines(); refreshFns(); if (cur) cur._dirty = true; });
    ed.addEventListener('scroll', () => ($('#sc-lines').scrollTop = ed.scrollTop));
    ed.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); const s = ed.selectionStart; ed.setRangeText('  ', s, ed.selectionEnd, 'end'); lines(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCur(); }
    });
    ZO.Scripts._lines = lines;
  }
  function closeTab() {
    if (cur && cur._dirty && !confirm(t('程式還沒儲存，確定要關閉？'))) return;
    view.remove(); $('#tabs .tab[data-tab=dev]').remove(); view = null; cur = null; ZO.showTab('home');
  }
  async function reload() {
    try { list = await ZO.get('scripts'); } catch (e) { list = []; ZO.err(e); }
    const box = $('#sc-list');
    box.innerHTML = '';
    for (const s of list) box.append(h('div', { class: 'sc' + (cur && cur.id === s.id ? ' active' : ''), onclick: () => select(s) },
      h('span', {}, s.name, h('br'), h('small', {}, (s.lang === 'gas' ? 'Apps Script' : t('巨集')) + '・' + ({ cell: 'Excel', word: 'Word', slide: 'PowerPoint', any: t('通用') }[s.kind] || s.kind) + (s.shared ? '・' + t('共用') : ''))),
      s.doc_id ? h('small', { title: t('綁定文件') }, '📎') : null));
    if (!list.length) box.append(h('p', { class: 'hint' }, t('還沒有程式，按「＋ 新增」從範例開始。')));
  }
  function select(s) {
    if (!s) return;
    if (cur && cur._dirty && cur !== s && !confirm(t('目前的程式還沒儲存，要放棄變更嗎？'))) return;
    cur = Object.assign({}, s);
    $('#sc-name').textContent = cur.name;
    $('#sc-code').value = cur.code || '';
    ZO.Scripts._lines();
    refreshFns();
    reload();
  }
  function newScript(kind, doc, blank) {
    const s = SAMPLES[kind] || SAMPLES.cell;
    cur = { id: null, name: blank ? t('我的程式') : t(s[0]).split('：').pop(), code: blank ? '/** 在這裡寫 Google Apps Script 寫法的程式 */\nfunction myFunction() {\n  Logger.log(\'Hello\');\n}\n' : s[1], lang: 'gas', kind: kind === 'any' ? 'any' : kind, doc_id: doc ? doc.id : null, shared: 0, _dirty: true };
    $('#sc-name').textContent = cur.name + ' *';
    $('#sc-code').value = cur.code;
    ZO.Scripts._lines();
    refreshFns();
  }
  function refreshFns() {
    const code = $('#sc-code').value;
    const fns = Array.from(code.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)).map((m) => m[1]);
    const sel = $('#sc-fn');
    const old = sel.value;
    sel.innerHTML = '';
    (cur && cur.lang === 'oo' ? [[' ', t('（整段巨集）')]] : fns.map((f) => [f, f])).forEach(([v, l]) => sel.append(h('option', { value: v }, l)));
    if (fns.includes(old)) sel.value = old; else if (fns.length) sel.value = fns.find((f) => f !== 'onOpen') || fns[0];
  }
  function refreshTargets(prefer) {
    const sel = $('#sc-target');
    sel.innerHTML = '';
    const tabs = tabsOfKind();
    if (!tabs.length) sel.append(h('option', { value: '' }, t('（請先開啟一份文件）')));
    tabs.forEach((x) => sel.append(h('option', { value: x.key }, (ZO.KIND[x.w.ZOE.kind] || {}).app + '：' + x.w.ZOE.info.filename)));
    if (prefer && tabs.some((x) => String(x.key) === String(prefer))) sel.value = String(prefer);
    else if (cur && cur.doc_id && tabs.some((x) => String(x.key) === String(cur.doc_id))) sel.value = String(cur.doc_id);
  }
  async function save() {
    if (!cur) return;
    cur.code = $('#sc-code').value;
    try {
      const r = await ZO.api('script_save', { id: cur.id, name: cur.name, code: cur.code, lang: cur.lang, kind: cur.kind, doc_id: cur.doc_id, shared: cur.shared, shortcut: cur.shortcut || '' });
      cur.id = r.id; cur._dirty = false;
      $('#sc-name').textContent = cur.name;
      ZO.toast(t('已儲存'), 'ok');
      reload();
    } catch (e) { ZO.err(e); }
  }
  async function rename() {
    if (!cur) return;
    const n = await ZO.prompt(t('重新命名'), cur.name);
    if (n) { cur.name = n; cur._dirty = true; $('#sc-name').textContent = n + ' *'; }
  }
  function log(text, cls) { const l = $('#sc-log'); l.append(h('div', { class: cls || '' }, text)); l.scrollTop = l.scrollHeight; }
  function runCur() {
    if (!cur) return;
    refreshTargets($('#sc-target').value);
    const key = $('#sc-target').value;
    const tab = tabsOfKind().find((x) => String(x.key) === String(key));
    if (!tab) return ZO.toast(t('請先開啟要執行的文件（DataExcel／DataWord／DataPowerPoint），再選「在」哪份文件執行'), 'err');
    const fn = $('#sc-fn').value.trim();
    const code = $('#sc-code').value;
    $('#sc-log').innerHTML = '';
    log(new Date().toLocaleTimeString() + '　' + t('開始執行') + ' ' + (fn || '') + '（' + tab.w.ZOE.info.filename + '）', 'i');
    const t0 = performance.now();
    const r = tab.w.ZO.Gas.run(code, fn, cur.lang, { source: Object.assign({}, cur, { code }) });
    (r.log || []).forEach((x) => log(x));
    if (r.error) log(t('錯誤：') + r.error, 'e');
    else log(t('執行完成') + '（' + Math.round(performance.now() - t0) + ' ms）', 'ok');
  }
  function more(at) {
    ZO.menu(at, [
      [t('綁定到目前選的文件（開檔時自動執行 onOpen）'), () => { const tab = tabsOfKind().find((x) => String(x.key) === $('#sc-target').value); if (!tab) return ZO.toast(t('請先選擇文件'), 'err'); cur.doc_id = tab.w.ZOE.info.id; cur.kind = tab.w.ZOE.kind; cur._dirty = true; ZO.toast(t('已綁定，記得儲存'), 'ok'); }],
      cur && cur.doc_id ? [t('取消綁定（變成通用程式）'), () => { cur.doc_id = null; cur._dirty = true; }] : null,
      [cur && cur.shared ? t('取消共用') : t('共用給其他開發人員'), () => { cur.shared = cur.shared ? 0 : 1; cur._dirty = true; ZO.toast(t('記得儲存'), 'ok'); }],
      '-',
      [t('複製程式碼（貼到 Google Apps Script）'), () => navigator.clipboard.writeText($('#sc-code').value).then(() => ZO.toast(t('已複製，可以貼到 script.google.com'), 'ok'))],
      [t('開啟 Google Apps Script 網站'), () => (ZO.native ? ZO.native.open_url('https://script.google.com/home') : window.open('https://script.google.com/home'))],
      [t('匯出成 .gs 檔'), exportGs],
      [t('匯入 .gs 檔…'), () => importGs({})],
      '-',
      [t('Apps Script 支援清單'), help],
      cur && cur.id ? [t('刪除這個程式'), async () => { if (await ZO.confirm(t('刪除「{0}」？', cur.name), t('刪除'), true)) { await ZO.api('script_delete', { id: cur.id }).catch(ZO.err); cur = null; $('#sc-code').value = ''; reload(); } }, { danger: true }] : null,
    ]);
  }
  function exportGs() {
    const a = h('a', { href: URL.createObjectURL(new Blob([$('#sc-code').value], { type: 'text/javascript' })), download: (cur ? cur.name : 'Code') + '.gs' });
    document.body.append(a); a.click(); a.remove();
  }
  async function importGs(opts) {
    if (!view) { await open(opts); }
    const inp = h('input', { type: 'file', accept: '.gs,.js,.txt' });
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      const code = await f.text();
      cur = { id: null, name: f.name.replace(/\.[^.]+$/, ''), code, lang: /Api\.(GetActiveSheet|GetDocument|GetPresentation)/.test(code) && !/SpreadsheetApp|DocumentApp|SlidesApp/.test(code) ? 'oo' : 'gas', kind: opts.kind || 'any', doc_id: opts.doc ? opts.doc.id : null, shared: 0, _dirty: true };
      $('#sc-name').textContent = cur.name + ' *';
      $('#sc-code').value = code;
      ZO.Scripts._lines(); refreshFns();
      ZO.toast(t('已匯入，按「儲存」保存'), 'ok');
    };
    inp.click();
  }
  function help() {
    const rows = [
      ['SpreadsheetApp', 'getActiveSpreadsheet / getActiveSheet / getActiveRange / getUi', 'Spreadsheet：getSheets、getSheetByName、insertSheet、getRange("工作表!A1")、toast'],
      ['Sheet', 'getRange(a1 或 列,欄,列數,欄數)、getDataRange、getLastRow、getLastColumn、appendRow、clear、setName、setColumnWidth、setFrozenRows', ''],
      ['Range', 'getValue(s)、setValue(s)、getFormula(s)、setFormula(s)、setBackground、setFontColor、setFontWeight、setFontSize、setNumberFormat、setHorizontalAlignment、setBorder、merge、clearContent、offset、getA1Notation', ''],
      ['DocumentApp', 'getActiveDocument().getBody()', 'Body：appendParagraph、appendListItem、appendTable、appendPageBreak、getParagraphs、replaceText、getText、clear'],
      ['Paragraph', 'setHeading、setAlignment、setBold、setItalic、setFontSize、setForegroundColor、setSpacingAfter、setLineSpacing', ''],
      ['SlidesApp', 'getActivePresentation()', 'appendSlide、getSlides、getPageWidth/Height；Slide：insertTextBox、insertShape、insertImage、getBackground().setSolidFill'],
      ['其他', 'Logger.log、console.log、Browser.msgBox、Ui.alert、Ui.createMenu().addItem().addToUi()、Utilities.formatDate、Session', 'onOpen() 綁定文件時開檔自動執行'],
    ];
    ZO.dialog({ title: t('Apps Script 支援清單'), width: '820px', body: h('div', {}, h('p', { class: 'hint' }, t('以下 Google Apps Script 功能可以在這裡直接執行；也可以把「巨集」改用 ONLYOFFICE 寫法（Api.GetActiveSheet()…）。只能操作目前開啟的文件，不能連到 Google 雲端硬碟。')),
      h('table', { class: 'grid' }, h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, h('b', {}, r[0])), h('td', {}, r[1]), h('td', {}, r[2])))))) });
  }
  ZO.Scripts = { open, importGs };
})();
