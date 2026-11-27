/* DataPowerPoint → 外掛程式 →「從 NotebookLM 產生簡報」。
 * 沿用「資料助秘 NotebookLM MCP 簡報」的引擎（同一套指令格式、柔和插畫版型、3D 小圖示，MIT）：
 *  1. 填主題 → 產生 NotebookLM 指令（複製）→ 開 Gemini Notebook 貼上
 *  2. 把 NotebookLM 的回答貼回來 → 排成簡報（.pptx，背景圖＋可編輯文字框＋講者備註）→ 存進文件庫並開啟
 *  沒有 NotebookLM 時，也可以用「AI 助理」以同一份指令直接產生（不限筆記本來源）。 */
(function () {
  const ZO = window.ZO;
  const { h, t } = ZO;
  let mods = null;
  async function load() {
    if (mods) return mods;
    await new Promise((res, rej) => {
      if (window.PptxGenJS) return res();
      const s = document.createElement('script');
      s.src = 'lib/notebooklm/pptxgen.bundle.js'; s.onload = res; s.onerror = () => rej(new Error('PptxGenJS 載入失敗'));
      document.head.append(s);
    });
    const [E, R, D] = await Promise.all([import('../lib/notebooklm/engine.js'), import('../lib/notebooklm/render.js'), import('../lib/notebooklm/data.js')]);
    mods = { E, R, DATA: D.DATA };
    return mods;
  }

  async function open() {
    let M;
    try { M = await load(); } catch (e) { return ZO.err(e); }
    const P = window.parent.ZO;
    const company = (P.S && P.S.state && P.S.state.company) || '';
    const me = (P.S && P.S.user && P.S.user.name) || '';
    const topic = h('input', { class: 'inp', placeholder: t('例如：資訊安全教育訓練') });
    const audience = h('input', { class: 'inp', value: t('公司同仁') });
    const count = h('input', { class: 'inp', type: 'number', min: 5, max: 30, value: 11 });
    const presenter = h('input', { class: 'inp', value: me });
    const lang = ZO.selectEl(M.DATA.langs.map((x) => [x.id, x.name]), ZO.lang.startsWith('zh') ? 'zh' : 'en');
    const style = ZO.selectEl(M.DATA.styles.map((x) => [x.id, x.name]), 'pastel');
    const notes = h('textarea', { class: 'inp', rows: 2, placeholder: t('特別要求（可空白）') });
    const answer = h('textarea', { class: 'inp', rows: 7, placeholder: t('把 NotebookLM 的回答（JSON）整段貼在這裡') });
    const brief = () => {
      if (!topic.value.trim()) throw new Error(t('請輸入簡報主題'));
      return new M.E.Brief({ org: company, cover_title_tpl: '{topic}', byline_tpl: '{presenter_role} {presenter}', presenter_role: t('簡報人'), audience_text: audience.value, min_slides: 5 },
        { name: topic.value.trim() }, { topic_name: topic.value.trim(), presenter: presenter.value.trim(), audience: audience.value.trim(), slide_count: +count.value || 11, lang: lang.value, style: style.value, notes: notes.value.trim(), subtitle: '' });
    };
    const copyPrompt = async () => {
      const b = brief();
      await navigator.clipboard.writeText(M.E.buildPrompt('SLIDES', b));
      ZO.toast(t('指令已複製，請到 NotebookLM 貼上並送出'), 'ok');
    };
    const openNb = () => { const u = 'https://notebook.google.com/'; ZO.native ? ZO.native.open_url(u) : window.open(u); };
    const viaAI = async () => {
      const b = brief();
      const bb = ZO.busy(t('AI 產生簡報內容中…（約 30～90 秒）'));
      try {
        const prompt = M.E.buildPrompt('SLIDES', b).replace(/內容以筆記本中的來源文件為唯一依據[^\n]*\n?/, '內容依照一般正確的專業知識撰寫，不確定的數字不要編造。\n');
        const r = await ZO.api('ai_chat', { messages: [{ role: 'user', content: prompt }], system: '你是簡報企劃。只回覆 JSON。' });
        answer.value = r.text;
        bb.close();
        ZO.toast(t('AI 已產生內容，按「排成簡報」'), 'ok');
      } catch (e) { bb.close(); ZO.err(e); }
    };
    const build = async () => {
      const b = brief();
      if (!answer.value.trim()) throw new Error(t('請先貼上 NotebookLM（或 AI）的回答'));
      const content = M.E.normalize('SLIDES', M.E.extractJson(answer.value), b);
      if ((content.slides || []).length < 2) throw new Error(t('回答裡沒有投影片內容'));
      const bb = ZO.busy(t('排版中（柔和插畫風格）…'));
      try {
        const blob = await M.R.slidesPptx(content, style.value);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const d = await ZO.raw('save_as', bytes, { id: window.ZOE.info.id, name: b.topic_name, ext: 'pptx' });
        bb.close();
        ZO.toast(t('簡報已產生：') + d.filename, 'ok');
        P.openDoc(d);
        return true;
      } catch (e) { bb.close(); throw e; }
    };
    ZO.dialog({ title: '📒 ' + t('從 NotebookLM 產生簡報'), width: '720px', body: h('div', {},
      h('p', { class: 'hint' }, t('和「資料助秘 NotebookLM MCP 簡報」同一套方法：用您的 NotebookLM 筆記本來源產生內容，再自動排成可編輯的簡報（含講者備註與 3D 小圖示）。')),
      h('div', { class: 'row' }, h('label', { class: 'fld' }, t('簡報主題'), topic), h('label', { class: 'fld' }, t('對象'), audience)),
      h('div', { class: 'row' }, h('label', { class: 'fld' }, t('張數'), count), h('label', { class: 'fld' }, t('簡報人'), presenter), h('label', { class: 'fld' }, t('語言'), lang), h('label', { class: 'fld' }, t('風格'), style)),
      h('label', { class: 'fld' }, t('特別要求'), notes),
      h('div', { class: 'toolbar', style: { margin: '8px 0' } },
        h('b', {}, '①'), h('button', { class: 'btn', onclick: () => copyPrompt().catch(ZO.err) }, '📋 ' + t('複製 NotebookLM 指令')),
        h('b', {}, '②'), h('button', { class: 'btn', onclick: openNb }, '🌐 ' + t('開啟 NotebookLM')),
        h('span', { class: 'hint' }, t('或')), h('button', { class: 'btn', onclick: () => viaAI().catch(ZO.err) }, '✨ ' + t('改用 AI 助理產生'))),
      h('label', { class: 'fld' }, '③ ' + t('貼上回答'), answer)),
    buttons: [{ label: t('取消'), value: null }, { label: '④ ' + t('排成簡報'), primary: true, onClick: build }] });
  }
  ZO.Notebook = { open };
})();
