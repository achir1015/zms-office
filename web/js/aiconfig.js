/* AI 助理設定：選擇預設服務、輸入各家金鑰（只顯示末四碼）、測試連線。 */
(function () {
  const ZO = window.ZO;
  const { h, t } = ZO;
  async function open() {
    let cfg;
    try { cfg = await ZO.get('ai_config'); } catch (e) { return ZO.err(e); }
    const canEdit = ZO.can('AI', 2);
    const edits = {};
    const def = ZO.selectEl(cfg.providers.map((p) => [p.id, t(p.name) + '（' + t(p.price) + '）']), cfg.default);
    def.disabled = !canEdit;
    const rows = cfg.providers.map((p) => {
      const key = h('input', { class: 'inp', type: 'password', placeholder: p.has_key ? p.key_hint + '　' + t('（不改請留空白）') : (p.need_key ? t('貼上 API 金鑰') : t('不需要金鑰')), disabled: !canEdit || !p.need_key });
      const model = p.id === 'anthropic' ? ZO.selectEl(cfg.claude_models.map((m) => [m, m]), p.model) : h('input', { class: 'inp', value: p.model, list: 'm-' + p.id });
      const url = h('input', { class: 'inp', value: p.url, placeholder: 'https://…/v1' });
      model.disabled = url.disabled = !canEdit;
      edits[p.id] = { key, model, url };
      const status = h('span', { class: 'hint' }, p.ready ? '✔ ' + t('可使用') : (p.need_key ? t('尚未設定金鑰') : ''));
      return h('div', { style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '8px 12px', margin: '8px 0', background: '#fff' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('b', {}, t(p.name)), h('span', { class: 'tag' }, t(p.price)), status, h('span', { class: 'grow' }),
          p.key_url ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); ZO.native ? ZO.native.open_url(p.key_url) : window.open(p.key_url); } }, p.need_key ? t('取得金鑰') : t('說明')) : null,
          canEdit ? h('button', { class: 'mini', onclick: async () => { try { await save(true); const r = await ZO.api('ai_test', { provider: p.id }); ZO.toast(t(p.name) + ' ' + t('連線成功') + '：' + r.reply, 'ok'); } catch (e) { ZO.err(e); } } }, t('測試')) : null,
          canEdit && p.has_key ? h('button', { class: 'mini', onclick: () => { key.value = '-'; ZO.toast(t('按「儲存」後會清除這個金鑰')); } }, t('清除金鑰')) : null),
        h('div', { class: 'row' }, h('label', { class: 'fld' }, t('API 金鑰'), key), h('label', { class: 'fld' }, t('模型'), model)),
        p.id === 'custom' || p.id === 'ollama' ? h('label', { class: 'fld' }, t('服務網址（OpenAI 相容）'), url) : null);
    });
    async function save(silent) {
      const providers = {};
      for (const [id, e] of Object.entries(edits)) providers[id] = { key: e.key.value.trim(), model: e.model.value.trim(), url: e.url.value.trim() };
      cfg = await ZO.api('ai_config', { default: def.value, providers });
      Object.values(edits).forEach((e) => (e.key.value = ''));
      if (!silent) ZO.toast(t('AI 設定已儲存'), 'ok');
    }
    ZO.dialog({ title: '✨ ' + t('AI 助理設定'), width: '720px', body: h('div', {},
      h('p', { class: 'hint' }, t('AI 助理會把您選取的文字或文件內容送到所選的 AI 服務處理。免費服務適合一般內容；機密文件建議使用「Ollama（本機）」，資料不會離開這台電腦。金鑰存在本機資料庫，畫面只顯示末四碼。')),
      h('label', { class: 'fld' }, t('預設使用'), def), ...rows),
    buttons: canEdit ? [{ label: t('取消'), value: false }, { label: t('儲存'), primary: true, onClick: async () => { await save(); return true; } }] : [{ label: t('關閉'), primary: true, value: true }] });
  }
  ZO.AIConfig = { open };
})();
