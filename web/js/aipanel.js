/* 編輯頁右側的 AI 助理面板：依工具提供常用動作（摘要、改寫、翻譯、公式、簡報大綱…），結果可以插入文件。 */
(function () {
  const ZO = window.ZO;
  const { $, h, t } = ZO;
  const E = () => window.ZOE;
  let cfg = null, open = false;
  const history = [];
  const LANGS = ['繁體中文', 'English', '简体中文', '日本語', '한국어', 'Tiếng Việt', 'Bahasa Indonesia', 'ไทย', 'Français', 'Deutsch', 'Español'];

  const ACTIONS = {
    word: [
      ['摘要', '請用條列整理以下內容的重點摘要（5 點以內）：', 'sel'],
      ['改寫得更通順', '請把以下文字改寫得更通順、易讀，保留原意，只回覆改寫後的文字：', 'sel', 'replace'],
      ['正式語氣', '請把以下文字改成正式的公文／商業書信語氣，只回覆改寫後的文字：', 'sel', 'replace'],
      ['校對錯字', '請校對以下文字的錯字、標點與文法，只回覆修正後的全文：', 'sel', 'replace'],
      ['續寫', '請依照以下內容的語氣接著寫一段（約 150 字），只回覆續寫的文字：', 'sel', 'insert'],
      ['翻譯', 'translate', 'sel', 'replace'],
      ['產生大綱', '請依照以下主題或內容，產生一份完整的文件大綱（標題＋小標題＋每段要點）：', 'sel', 'insert'],
    ],
    cell: [
      ['產生公式', 'formula', 'ask'],
      ['解釋公式', '請用簡單的中文解釋這個 Excel 公式在做什麼，以及每個參數的意思：', 'formula'],
      ['分析資料', '以下是試算表的資料（Tab 分隔），請分析趨勢、最大最小值、異常值，並提出 3 個建議：', 'sel'],
      ['清理資料建議', '以下是試算表資料（Tab 分隔），請找出格式不一致、重複、空白或可能打錯的地方，並說明怎麼修正：', 'sel'],
      ['做成表格', '請把以下需求整理成表格，只回覆 Tab 分隔的表格（第一列是欄名，不要其他文字）：', 'ask', 'table'],
    ],
    slide: [
      ['產生簡報大綱', 'outline', 'ask', 'slides'],
      ['寫講稿', '以下是簡報內容，請為每一頁寫一段約 60 字的口語講稿，用「第 N 頁：」開頭：', 'all'],
      ['精簡文字', '請把以下投影片文字精簡成適合投影片的短句（每點不超過 20 字），只回覆結果：', 'sel', 'replace'],
      ['翻譯', 'translate', 'sel', 'replace'],
    ],
    pdf: [
      ['摘要整份文件', '請摘要以下文件的重點（條列 8 點以內）：', 'all'],
      ['根據文件寫信', '請根據以下文件內容，草擬一封簡潔的電子郵件說明重點：', 'all'],
      ['找出重要日期與數字', '請列出以下文件中所有重要的日期、金額與數字，並說明各代表什麼：', 'all'],
    ],
  };

  async function toggle() {
    const side = $('#side');
    open = !open;
    side.classList.toggle('hidden', !open);
    if (open && !side.dataset.built) build(side);
  }
  async function build(side) {
    side.dataset.built = '1';
    try { cfg = await ZO.get('ai_config'); } catch (e) { cfg = { providers: [], default: '' }; }
    const kind = E().kind;
    const prov = ZO.selectEl(cfg.providers.filter((p) => p.ready).map((p) => [p.id, t(p.name)]), cfg.default);
    const ctx = ZO.selectEl([['sel', t('選取的內容')], ['all', t('整份文件')], ['none', t('不附內容')]], 'sel');
    const msgs = h('div', { id: 'ai-msgs' }, h('div', { class: 'hint' }, t('先在文件中選取文字（或儲存格），再按下面的動作；也可以直接輸入問題。')));
    const input = h('textarea', { class: 'inp', placeholder: t('想請 AI 做什麼？（Enter 送出，Shift+Enter 換行）') });
    const send = () => { const v = input.value.trim(); if (!v) return; input.value = ''; ask(v, ctx.value, null, prov.value); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    side.append(
      h('div', { class: 'side-head' }, '✨ ' + t('AI 助理'), h('button', { class: 'x', onclick: toggle }, '✕')),
      h('div', { class: 'side-body' },
        h('div', { class: 'ai-acts' }, (ACTIONS[kind] || ACTIONS.word).map((a) => h('button', { onclick: () => action(a, prov.value) }, t(a[0])))),
        msgs),
      h('div', { class: 'side-foot' },
        h('div', { class: 'ai-meta' }, t('服務'), prov, t('內容'), ctx),
        h('div', { class: 'ai-in' }, input, h('button', { class: 'btn primary', onclick: send }, t('送出'))),
        h('div', { class: 'privacy' }, t('選取的內容會送到所選的 AI 服務；機密文件請用「Ollama（本機）」。'),
          h('a', { href: '#', onclick: (e) => { e.preventDefault(); window.parent.ZO.AIConfig.open(); } }, t('設定')))));
    if (!cfg.providers.some((p) => p.ready)) msgs.append(h('div', { class: 'msg err' }, t('還沒有可用的 AI 服務，請按下方「設定」。')));
  }

  function gather(src) {
    if (src === 'none' || src === 'ask') return '';
    let s = src === 'all' ? E().allText() : E().selectedText();
    if (src === 'sel' && !s.trim()) s = E().allText();
    if (s.length > 60000) { ZO.toast(t('內容太長，只送出前 60000 字')); s = s.slice(0, 60000); }
    return s;
  }
  async function action(a, provider) {
    let [label, prompt, src, mode] = a;
    if (prompt === 'translate') {
      const lang = await pick(t('翻譯成哪一種語言？'), LANGS);
      if (!lang) return;
      prompt = '請把以下內容翻譯成' + lang + '，只回覆翻譯結果，保留原本的段落：';
    } else if (prompt === 'formula') {
      const need = await ZO.prompt(t('產生公式'), '', t('用中文描述想算什麼（例如：B 欄大於 100 的 C 欄加總）'));
      if (!need) return;
      prompt = '請寫一個 Excel 公式：' + need + '。目前選取範圍是 ' + selAddress() + '。只回覆公式本身（以 = 開頭），不要其他文字。';
      src = 'none'; mode = 'formula';
    } else if (prompt === 'outline') {
      const topic = await ZO.prompt(t('產生簡報大綱'), '', t('簡報主題（例如：新進人員訓練－資訊安全）'));
      if (!topic) return;
      const n = 6;
      prompt = '請為主題「' + topic + '」設計 ' + n + ' 頁投影片。只回覆 JSON 陣列，不要其他文字，格式：[{"title":"標題","bullets":["重點1","重點2","重點3"]}]，第一頁是封面（bullets 放副標題），每頁 3～5 個重點，每點不超過 22 字。';
      src = 'none';
    } else if (src === 'ask') {
      const need = await ZO.prompt(t(label), '', t('請描述需求'));
      if (!need) return;
      prompt += need;
      src = 'none';
    } else if (src === 'formula') {
      const f = E().readBuilder('var c=Api.GetActiveSheet().GetActiveCell(); c.GetFormula ? c.GetFormula() : c.GetValue()') || '';
      if (!f) return ZO.toast(t('請先點選含有公式的儲存格'), 'err');
      prompt += '\n' + f;
      src = 'none';
    }
    return ask(prompt, src, mode, provider, t(label));
  }
  function selAddress() { try { return E().readBuilder('Api.GetSelection().GetAddress(false,false)') || ''; } catch (e) { return ''; } }
  function pick(title, list) {
    const s = ZO.selectEl(list.map((x) => [x, x]), list[ZO.lang === 'zh-TW' ? 1 : 0]);
    return ZO.dialog({ title, body: s, buttons: [{ label: t('取消'), value: null }, { label: t('確定'), primary: true, onClick: () => s.value }] });
  }

  async function ask(prompt, src, mode, provider, label) {
    const content = gather(src);
    const msgs = $('#ai-msgs');
    msgs.append(h('div', { class: 'msg user' }, label || prompt));
    const wait = h('div', { class: 'msg ai' }, h('span', { class: 'spinner', style: { display: 'inline-block', width: '14px', height: '14px', borderWidth: '2px', verticalAlign: 'middle' } }), ' ' + t('思考中…'));
    msgs.append(wait);
    wait.scrollIntoView({ block: 'end' });
    const user = content ? prompt + '\n\n---\n' + content : prompt;
    history.push({ role: 'user', content: user });
    try {
      const r = await ZO.api('ai_chat', { provider, messages: history.slice(-8), system: '你是辦公室文件助理（' + (ZO.KIND[E().kind] || {}).app + '）。回答用' + (ZO.lang === 'zh-TW' ? '繁體中文（台灣用語）' : '使用者使用的語言') + '，直接給結果，不要多餘的客套話。' });
      history.push({ role: 'assistant', content: r.text });
      wait.remove();
      show(r.text, mode, r.model);
    } catch (e) {
      history.pop();
      wait.className = 'msg err';
      wait.textContent = e.message;
    }
  }
  function show(text, mode, model) {
    const kind = E().kind;
    const clean = text.replace(/^```[a-z]*\n?|```$/gim, '').trim();
    const ops = [];
    const ro = E().info && E().info.readonly;
    if (!ro) {
      if (mode === 'formula' && kind === 'cell') ops.push([t('放進目前儲存格'), () => { const f = (clean.match(/=[^\n]+/) || [clean])[0]; E().runBuilder('Api.GetActiveSheet().GetActiveCell().SetValue(' + JSON.stringify(f) + ')'); ZO.toast(t('已放進儲存格'), 'ok'); }]);
      else if (mode === 'slides' && kind === 'slide') ops.push([t('建立這些投影片'), () => makeSlides(clean)]);
      else if (mode === 'table' && kind === 'cell') ops.push([t('從目前儲存格貼上表格'), () => pasteTable(clean)]);
      else if (kind === 'word' || kind === 'slide') {
        if (mode === 'replace') ops.push([t('取代選取的文字'), () => E().pasteText(clean)]);
        ops.push([t('插入到游標位置'), () => E().pasteText(clean)]);
      } else if (kind === 'cell') ops.push([t('貼到目前儲存格'), () => pasteTable(clean)]);
    }
    ops.push([t('複製'), () => navigator.clipboard.writeText(clean).then(() => ZO.toast(t('已複製'), 'ok'))]);
    const el = h('div', { class: 'msg ai' }, clean, h('div', { class: 'ops' }, ops.map(([l, f]) => h('button', { onclick: () => { try { f(); } catch (e) { ZO.err(e); } } }, l)), h('span', { class: 'hint', style: { marginLeft: 'auto', fontSize: '11px' } }, model || '')));
    $('#ai-msgs').append(el);
    el.scrollIntoView({ block: 'end' });
  }
  function pasteTable(text) {
    const rows = text.split('\n').map((l) => l.replace(/^\||\|$/g, '')).filter((l) => l.trim() && !/^[\s|:-]+$/.test(l))
      .map((l) => (l.includes('\t') ? l.split('\t') : l.includes('|') ? l.split('|') : [l]).map((c) => c.trim()));
    E().runBuilder('var s=Api.GetActiveSheet(); var a=s.GetActiveCell(); var r0=a.GetRow()-1, c0=a.GetCol()-1; var d=' + JSON.stringify(rows) +
      '; for(var i=0;i<d.length;i++) for(var j=0;j<d[i].length;j++){ var v=d[i][j]; var n=Number(v); s.GetRangeByNumber(r0+i,c0+j).SetValue(v!==""&&!isNaN(n)&&!/^0\\d/.test(v)?n:v); }');
    ZO.toast(t('已貼上 {0} 列', rows.length), 'ok');
  }
  function makeSlides(text) {
    let data;
    try { data = JSON.parse((text.match(/\[[\s\S]*\]/) || [text])[0]); } catch (e) { return ZO.toast(t('AI 回覆的格式看不懂，請再試一次'), 'err'); }
    ZO.Gas.makeSlides(data);
    ZO.toast(t('已建立 {0} 張投影片', data.length), 'ok');
  }
  ZO.AIPanel = { toggle };
})();
