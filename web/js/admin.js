/* 系統管理：使用者與權限、公司設定（文件庫位置）、操作紀錄、備份還原、版本更新、桌面捷徑、變更密碼、關於。 */
(function () {
  const ZO = window.ZO;
  const { h, t } = ZO;
  const LV = () => [t('無'), t('查詢'), t('維護')];

  function menu(at) {
    if (ZO.WEB) return ZO.menu(at, [[t('公司設定（文件庫位置）…'), company], [t('備份與還原…'), backup], '-', [t('關於'), about]]);
    ZO.menu(at, [
      [t('使用者與權限…'), users], [t('公司設定（文件庫位置）…'), company], [t('操作紀錄…'), audit], [t('備份與還原…'), backup],
      '-', [t('MCP 連線設定…'), mcp], [t('檢查更新…'), update], ZO.native ? [t('建立桌面捷徑'), shortcut] : null,
    ]);
  }

  async function users() {
    let rows;
    try { rows = await ZO.get('users'); } catch (e) { return ZO.err(e); }
    const tbody = h('tbody');
    let closeFn;
    const reopen = () => { closeFn && closeFn(null); users(); };
    for (const u of rows) {
      tbody.append(h('tr', {}, h('td', {}, u.uid), h('td', {}, u.name), h('td', {}, t(u.role)), h('td', {}, u.dept || ''), h('td', {}, u.is_admin ? '✔' : ''), h('td', {}, u.active ? t('啟用') : t('停用')), h('td', {}, u.last_login || ''),
        h('td', {}, h('button', { class: 'mini', onclick: () => edit(u).then((ok) => ok && reopen()) }, t('修改')), ' ',
          h('button', { class: 'mini', onclick: async () => { if (await ZO.confirm(t('刪除帳號 {0}？', u.uid), t('刪除'), true)) { await ZO.api('user_delete', { uid: u.uid }).catch(ZO.err); reopen(); } } }, t('刪除')))));
    }
    ZO.dialog({ title: t('使用者與權限'), width: '880px', body: h('div', {},
      h('p', { class: 'hint' }, t('每個工具（DataWord、DataExcel、DataPowerPoint、DataPDF、DataDiagram）都可以分開設定：1＝只能檢視、2＝可以編輯。角色只是快速範本，可以再個別調整。')),
      h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, [t('帳號'), t('姓名'), t('角色'), t('部門'), t('管理員'), t('狀態'), t('最近登入'), ''].map((x) => h('th', {}, x)))), tbody)),
    buttons: [{ label: '＋ ' + t('新增使用者'), onClick: async () => { if (await edit(null)) reopen(); return false; } }, { label: t('關閉'), primary: true, value: true }],
    onOpen: (box, close) => (closeFn = close) });
  }
  async function edit(u) {
    const st = ZO.S.state;
    const isNew = !u;
    u = u || { uid: '', name: '', role: '一般員工', is_admin: 0, active: 1, perms: Object.assign({}, st.roles['一般員工']), dept: '' };
    const uid = h('input', { class: 'inp', value: u.uid, disabled: !isNew }), name = h('input', { class: 'inp', value: u.name }), dept = h('input', { class: 'inp', value: u.dept || '', placeholder: t('例如：業務部') });
    const pw = h('input', { class: 'inp', type: 'password', placeholder: isNew ? t('至少 6 個字') : t('不改請留空白') });
    const admin = h('input', { type: 'checkbox', checked: !!u.is_admin }), active = h('input', { type: 'checkbox', checked: !!u.active });
    const perms = Object.assign({}, u.perms);
    const ptab = h('table', { class: 'grid' });
    const drawPerms = () => {
      ptab.innerHTML = '';
      for (const f of st.funcs) {
        ptab.append(h('tr', {}, h('td', {}, h('b', {}, t(f.name)), h('div', { class: 'hint' }, t(f.desc))),
          h('td', { style: { width: '110px' } }, ZO.selectEl(LV().map((x, i) => [String(i), x]), String(perms[f.id] || 0), (v) => (perms[f.id] = +v)))));
      }
    };
    const role = ZO.selectEl(Object.keys(st.roles).map((r) => [r, t(r)]), u.role || '一般員工', (v) => { Object.assign(perms, st.roles[v]); admin.checked = v === '系統管理員'; drawPerms(); });
    drawPerms();
    return ZO.dialog({ title: isNew ? t('新增使用者') : t('修改使用者') + ' ' + u.uid, width: '620px', body: h('div', {},
      h('div', { class: 'row' }, h('label', { class: 'fld' }, t('帳號'), uid), h('label', { class: 'fld' }, t('姓名'), name)),
      h('div', { class: 'row' }, h('label', { class: 'fld' }, t('部門'), dept), h('label', { class: 'fld' }, t('密碼'), pw)),
      h('div', { class: 'row' }, h('label', { class: 'fld' }, t('角色範本'), role), h('label', { class: 'inline' }, admin, t('系統管理員')), h('label', { class: 'inline' }, active, t('啟用'))),
      ptab),
    buttons: [{ label: t('取消'), value: false }, { label: t('儲存'), primary: true, onClick: async () => {
      await ZO.api('user_save', { uid: uid.value.trim(), name: name.value.trim(), role: role.value, dept: dept.value.trim(), is_admin: admin.checked, active: active.checked, perms, pw: pw.value, is_new: isNew });
      ZO.toast(t('已儲存'), 'ok');
      return true;
    } }] });
  }

  async function company() {
    let c;
    try { c = await ZO.get('company'); } catch (e) { return ZO.err(e); }
    const name = h('input', { class: 'inp', value: c.name || '' });
    const out = h('input', { class: 'inp', value: c.out_dir || '', placeholder: c.root });
    await ZO.nativeReady;
    ZO.dialog({ title: t('公司設定'), width: '560px', body: h('div', {},
      h('label', { class: 'fld' }, t('公司名稱'), name),
      h('label', { class: 'fld' }, t('文件庫資料夾（空白＝「文件」裡的「資料助秘文件office彙整」；多人共用時可設成網路磁碟）'),
        h('div', { class: 'row' }, out, ZO.native ? h('span', { style: { flex: 'none' } }, h('button', { class: 'btn', onclick: async () => { const f = await ZO.native.pick_folder(out.value); if (f) out.value = f; } }, t('選擇…'))) : null)),
      h('p', { class: 'hint' }, t('目前位置：') + c.root)),
    buttons: [{ label: t('取消'), value: false }, { label: t('儲存'), primary: true, onClick: async () => { await ZO.api('company', { name: name.value, out_dir: out.value }); ZO.toast(t('已儲存'), 'ok'); return true; } }] });
  }

  async function audit() {
    let rows;
    try { rows = await ZO.get('audit'); } catch (e) { return ZO.err(e); }
    const N = { login: '登入', logout: '登出', login_fail: '登入失敗', user_save: '修改使用者', user_delete: '刪除使用者', password: '變更密碼', doc_new: '新增文件', doc_import: '加入文件', doc_save: '儲存文件', doc_save_as: '另存新檔', doc_export: '匯出', doc_rename: '重新命名', doc_move: '移動', doc_trash: '刪除到回收筒', doc_restore: '從回收筒還原', doc_purge: '永久刪除', doc_shared: '共用設定', doc_restore_ver: '還原版本', folder_new: '新增資料夾', script_save: '儲存程式', script_delete: '刪除程式', script_run: '執行程式', ai_config: 'AI 設定', backup: '備份', restore: '還原', company: '公司設定', to_flipbook: '匯出到電子書翻頁' };
    ZO.dialog({ title: t('操作紀錄（最近 300 筆）'), width: '880px', body: h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, [t('時間'), t('帳號'), t('動作'), t('對象'), t('內容')].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.at), h('td', {}, r.uid), h('td', {}, t(N[r.action] || r.action)), h('td', {}, r.target), h('td', { style: { wordBreak: 'break-all', maxWidth: '320px' } }, (r.detail || '').slice(0, 160)))))) });
  }

  async function backup() {
    if (ZO.WEB) {
      return ZO.dialog({ title: t('備份與還原'), width: '540px', body: h('div', {},
        h('p', {}, t('線上版與手機版的文件存在這台裝置的瀏覽器裡。備份會把所有文件、版本以外的資料與設定下載成一個 ZIP 檔，請存到雲端硬碟或電腦。')),
        h('p', { class: 'hint' }, t('還原會把目前的資料換成備份檔的內容，請小心使用。'))),
      buttons: [
        { label: t('還原…'), danger: true, onClick: () => new Promise((res) => {
          const inp = h('input', { type: 'file', accept: '.zip' });
          inp.onchange = async () => {
            const f = inp.files[0];
            if (!f || !(await ZO.confirm(t('確定要用「{0}」還原？目前的資料會被覆蓋。', f.name), t('還原'), true))) return res(false);
            const b = ZO.busy(t('還原中…'));
            try { await ZO.Local.restore(f); ZO.toast(t('還原完成'), 'ok'); setTimeout(() => location.reload(), 1200); res(true); } catch (e) { ZO.err(e); res(false); } finally { b.close(); }
          };
          inp.click();
        }) },
        { label: t('立即備份'), primary: true, onClick: async () => { const b = ZO.busy(t('備份中…')); try { await ZO.Local.backup(); ZO.toast(t('已下載備份檔'), 'ok'); } finally { b.close(); } return true; } }] });
    }
    await ZO.nativeReady;
    ZO.dialog({ title: t('備份與還原'), width: '540px', body: h('div', {},
      h('p', {}, t('備份會把資料庫（使用者、權限、文件清單、版本記錄、巨集、設定）存成一個 .sql.gz 檔。文件本身在「文件庫資料夾」，請一併用隨身碟或雲端硬碟備份。')),
      h('p', { class: 'hint' }, t('還原會把目前的資料庫換成備份檔的內容，請小心使用。'))),
    buttons: [
      { label: t('還原…'), danger: true, onClick: async () => {
        if (!ZO.native) return ZO.toast(t('網頁版不能還原'));
        const [p] = await ZO.native.pick_files('backup', false);
        if (!p) return false;
        if (!(await ZO.confirm(t('確定要用「{0}」還原？目前的資料會被覆蓋。', p), t('還原'), true))) return false;
        const b = ZO.busy(t('還原中…'));
        try { await ZO.api('restore', { path: p }); ZO.toast(t('還原完成，請重新登入'), 'ok'); setTimeout(() => location.reload(), 1500); } finally { b.close(); }
        return true;
      } },
      { label: t('立即備份'), primary: true, onClick: async () => {
        let folder = '';
        if (ZO.native) folder = await ZO.native.pick_folder('');
        if (ZO.native && !folder) return false;
        const b = ZO.busy(t('備份中…'));
        try { const r = await ZO.api('backup', { folder }); ZO.toast(t('已備份到 ') + r.path + '（' + ZO.fmtSize(r.size) + '）', 'ok'); if (ZO.native) ZO.native.reveal(r.path); } finally { b.close(); }
        return true;
      } }] });
  }

  async function update() {
    const b = ZO.busy(t('檢查新版本…'));
    let r;
    try { r = await ZO.get('update_check'); } catch (e) { b.close(); return ZO.err(e); }
    b.close();
    if (r.latest) return ZO.dialog({ title: t('版本更新'), body: h('p', {}, (r.note ? t(r.note) : t('目前已經是最新版。')) + '（' + t('版本') + ' ' + r.current + '）') });
    const info = r.info;
    ZO.dialog({ title: t('有新版本') + ' ' + info.version, width: '560px', body: h('div', {}, h('p', {}, t('目前版本') + ' ' + r.current + '，' + t('最新版本') + ' ' + info.version + (info.size ? '（' + ZO.fmtSize(info.size) + '）' : '') + '。'),
      h('pre', { style: { whiteSpace: 'pre-wrap', maxHeight: '240px', overflow: 'auto', background: '#f5f5f5', padding: '8px', borderRadius: '6px' } }, info.notes || '')),
    buttons: [{ label: t('前往發佈頁'), onClick: () => { ZO.native ? ZO.native.open_url(info.page) : window.open(info.page); return false; } },
      { label: t('稍後'), value: false },
      ZO.can('SYS', 2) && info.name ? { label: t('下載並安裝'), primary: true, onClick: async () => {
        if (ZO.anyDirty() && !(await ZO.confirm(t('還有未儲存的文件，更新會關閉程式。確定要繼續？'), t('繼續'), true))) return false;
        const bb = ZO.busy(t('下載新版中，完成後程式會自動關閉並安裝新版…'));
        try { await ZO.api('update_install'); } catch (e) { bb.close(); throw e; }
        return true;
      } } : null].filter(Boolean) });
  }

  async function shortcut() {
    try { await ZO.api('shortcut'); ZO.toast(t('已在桌面建立捷徑'), 'ok'); } catch (e) { ZO.err(e); }
  }
  async function password() {
    const o = h('input', { class: 'inp', type: 'password' }), n = h('input', { class: 'inp', type: 'password' }), n2 = h('input', { class: 'inp', type: 'password' });
    ZO.dialog({ title: t('變更密碼'), body: h('div', {}, h('label', { class: 'fld' }, t('目前密碼'), o), h('label', { class: 'fld' }, t('新密碼（至少 6 個字）'), n), h('label', { class: 'fld' }, t('再輸入一次新密碼'), n2)),
      buttons: [{ label: t('取消'), value: false }, { label: t('變更'), primary: true, onClick: async () => {
        if (n.value !== n2.value) throw new Error(t('兩次輸入的密碼不一樣'));
        await ZO.api('password', { old: o.value, new: n.value });
        ZO.toast(t('密碼已變更'), 'ok');
        return true;
      } }] });
  }
  function about() {
    const st = ZO.S.state;
    ZO.dialog({ title: t('關於'), width: '560px', body: h('div', { style: { textAlign: 'center' } }, h('img', { src: 'assets/icon.png', style: { width: '96px', borderRadius: '20px' } }),
      h('h2', {}, t(st.app)), h('p', {}, 'DataWord · DataExcel · DataPowerPoint · DataPDF · DataDiagram'), h('p', {}, t('版本') + ' ' + st.version), h('p', {}, t(st.credit)),
      h('p', { class: 'hint', style: { textAlign: 'left' } }, t('本程式免費使用，原始碼以 GNU AGPL v3 授權公開。文件編輯器使用 ONLYOFFICE Docs（© Ascensio System SIA，AGPL v3，https://github.com/ONLYOFFICE）；離線轉檔元件整理自 ranuts/document（AGPL v3）；流程圖使用 draw.io（© JGraph，Apache 2.0）；試算表 CSV 轉換使用 SheetJS（Apache 2.0）；資料庫 MariaDB（GPL v2）；字型：Liberation、Noto、AR PL UKai（各自的開源授權）。Microsoft Office、Word、Excel、PowerPoint 是 Microsoft 的商標，本程式與 Microsoft 沒有關係。'))) });
  }
  async function mcp() {
    let r;
    try { r = await ZO.get('mcp_info'); } catch (e) { return ZO.err(e); }
    const cfg = { mcpServers: { 'zms-office': Object.assign({ command: r.command }, r.args.length ? { args: r.args } : {}, { env: { ZO_MCP_USER: (ZO.S.user || {}).uid || '', ZO_MCP_PASSWORD: '（您的密碼）' } }) } };
    const txt = JSON.stringify(cfg, null, 2);
    ZO.dialog({ title: '🔌 ' + t('MCP 連線設定（給 Claude Desktop 等 AI 工具）'), width: '680px', body: h('div', {},
      h('p', {}, t('MCP（Model Context Protocol）是開放的 AI 工具連線標準。設定後，Claude Desktop、Cursor 等 AI 工具就能直接幫您建立與修改 Word、Excel、PowerPoint 文件，並用 Mermaid 畫流程圖。')),
      h('p', { class: 'hint' }, t('把下面這段加到 AI 工具的 MCP 設定檔（例如 Claude Desktop 的 claude_desktop_config.json），把密碼換成您的密碼後重新開啟該工具。AI 只能做您的帳號有權限的事，每次修改都會保留上一版。')),
      h('pre', { style: { background: '#f5f5f5', padding: '10px', borderRadius: '6px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '12px' } }, txt),
      h('p', { class: 'hint' }, t('提供的工具：list_documents、read_document、create_document、append_to_word、update_cells、add_slides、create_diagram'))),
    buttons: [{ label: t('複製'), onClick: () => { navigator.clipboard.writeText(txt); ZO.toast(t('已複製'), 'ok'); return false; } }, { label: t('關閉'), primary: true, value: true }] });
  }
  ZO.Admin = { mcp, menu, users, company, audit, backup, update, shortcut, password, about };
})();
