/* 語音動態教學：資料助秘一邊說明、一邊切換畫面並用聚光框指出按鈕。
 * 語音優先用 assets/voice/<課程>-<第幾句>.mp3（微軟自然語音預先產生），沒有就用電腦內建中文語音。 */
(function () {
  const FA = window.ZO;
  const { $, h, t } = FA;
  const G = (FA.Guide = {});
  let cur = null;

  G.menu = function () {
    const box = h('div', {}, h('p', { class: 'hint' }, t('選一個主題，資料助秘會一邊說明一邊示範，講完會自動接下一課。教學中可以按「下一句」、「上一句」或「結束」。')),
      (window.ZO_LESSONS || []).map((L, i) => h('div', { class: 'lesson', onclick: () => { close(); G.playFrom(i); } }, h('div', { class: 'n' }, String(i + 1)), h('div', {}, h('b', {}, t(L.title)), h('small', {}, t(L.desc))))),
      h('div', { class: 'lesson', onclick: () => { close(); G.playAll(); } }, h('div', { class: 'n' }, '▶'), h('div', {}, h('b', {}, t('全部從頭播放')), h('small', {}, t('約 5 分鐘')))));
    let close;
    FA.dialog({ title: '🔊 ' + t('語音動態教學'), width: '480px', body: box, buttons: [], onOpen: (b, c) => (close = c) });
  };
  G.autoStart = async function () {
    try {
      const pref = await FA.get('pref');
      if (pref.guideSeen) return;
      await FA.api('pref', { guideSeen: true });
    } catch (e) { return; }
    const ok = await FA.confirm(t('第一次使用嗎？要不要聽語音一步一步示範怎麼使用？（之後可以按右上角的喇叭再看）'), t('好，開始教學'));
    if (ok) G.playFrom(0);
  };
  // 從第 i 課開始依序播放：每一課講完停 1.2 秒自動接下一課；按「結束」就整個停止
  let chain = 0;
  G.playFrom = async function (i) {
    const my = ++chain;
    const ls = window.ZO_LESSONS || [];
    for (let k = Math.max(0, i); k < ls.length; k++) {
      const r = await G.play(ls[k].id, true);
      if (r === 'stop' || my !== chain) break;
      if (k + 1 < ls.length) {
        FA.toast(t('下一課：') + t(ls[k + 1].title), 'ok');
        await new Promise((res) => setTimeout(res, 1200));
        if (my !== chain) break;
      }
    }
  };
  G.playAll = () => G.playFrom(0);

  async function doAction(a) {
    if (!a) return;
    const [k, v] = a.split(':');
    if (k === 'home') { FA.goHome(v || 'home'); }
    if (k === 'app') { FA.S.app = v; FA.goHome('home'); }
    await new Promise((r) => setTimeout(r, 300));
  }

  G.play = async function (id, inChain) {
    if (!inChain) chain++;               // 單獨叫用時，取消正在連續播放的課程
    G.stop();
    const L = (window.ZO_LESSONS || []).find((x) => x.id === id);
    if (!L) return;
    const me = (cur = { stop: false, idx: 0, audio: null, wake: null });
    const hole = h('div', { class: 'guide-hole' });
    const bubble = h('div', { class: 'guide-bubble' });
    document.body.append(hole, bubble);
    let res = 'done';
    while (me.idx < L.steps.length && !me.stop) {
      const st = L.steps[me.idx];
      await doAction(st.do);
      const el = $(st.sel);
      place(hole, bubble, el);
      const nav = { next: false, prev: false };
      bubble.innerHTML = '';
      bubble.append(h('div', { class: 'who' }, h('img', { src: 'assets/icon.png' }), t('資料助秘') + '（' + t(L.title) + '　' + (me.idx + 1) + '／' + L.steps.length + '）'),
        h('div', {}, t(st.say)),
        h('div', { class: 'acts' },
          h('button', { class: 'ghost', onclick: () => { me.stop = true; res = 'stop'; wake(); } }, t('結束')),
          me.idx > 0 ? h('button', { class: 'ghost', onclick: () => { nav.prev = true; wake(); } }, t('上一句')) : null,
          h('button', { onclick: () => { nav.next = true; wake(); } }, t('下一句') + ' ▶')));
      place(hole, bubble, el);
      await speak(me, L.id + '-' + (me.idx + 1), t(st.say));
      if (me.stop) break;
      if (nav.prev) { me.idx--; continue; }
      if (!nav.next) await new Promise((r) => { me.wake = r; setTimeout(r, 900); });
      me.idx++;
    }
    function wake() { stopVoice(me); me.wake && me.wake(); }
    hole.remove(); bubble.remove();
    if (cur === me) cur = null;
    return me.stop ? 'stop' : res;
  };
  G.stop = function () { if (cur) { cur.stop = true; stopVoice(cur); cur.wake && cur.wake(); } };

  function place(hole, bubble, el) {
    // 畫面有自動縮放（html 的 CSS zoom）：getBoundingClientRect 與 innerWidth 是實際螢幕像素，
    // 但 left/top 會再被乘上縮放比例 → 全部換算成縮放後的座標，框才會對準
    const z = parseFloat(document.documentElement.style.zoom) || 1;
    const innerWidth = window.innerWidth / z, innerHeight = window.innerHeight / z;
    const b0 = el ? el.getBoundingClientRect() : null;
    const r = b0 ? { left: b0.left / z, top: b0.top / z, width: b0.width / z, height: b0.height / z }
      : { left: innerWidth / 2 - 100, top: innerHeight / 2 - 50, width: 200, height: 100 };
    const pad = 6;
    Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const bw = 360, bh = bubble.offsetHeight || 140;
    let x = r.left + r.width + 16, y = r.top;
    if (x + bw > innerWidth - 10) x = r.left - bw - 16;
    if (x < 10) { x = Math.min(innerWidth - bw - 10, Math.max(10, r.left)); y = r.top + r.height + 14; if (y + bh > innerHeight - 10) y = r.top - bh - 14; }
    y = Math.max(10, Math.min(innerHeight - bh - 10, y));
    Object.assign(bubble.style, { left: x + 'px', top: y + 'px' });
  }

  // ------------------------------------------------------------ 語音
  function stopVoice(me) {
    if (me.audio) { me.audio.pause(); me.audio.onended && me.audio.onended(); me.audio = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
    me.done && me.done();
  }
  function speak(me, key, text) {
    return new Promise((resolve) => {
      let finished = false;
      const done = (me.done = () => { if (!finished) { finished = true; me.done = null; resolve(); } });
      if (FA.lang !== 'zh-TW') return tts(text, done);
      const a = new Audio('assets/voice/' + key + '.mp3');
      me.audio = a;
      a.onended = done;
      a.onerror = () => { me.audio = null; tts(text, done); };
      a.play().catch(() => { me.audio = null; tts(text, done); });
    });
  }
  function tts(text, done) {
    if (!window.speechSynthesis) return setTimeout(done, Math.max(2500, text.length * 220));
    const u = new SpeechSynthesisUtterance(text);
    const L = FA.lang === 'zh-CN' ? 'zh-CN' : FA.lang;
    u.lang = L; u.rate = 1.05;
    const vs = speechSynthesis.getVoices();
    const v = vs.find((x) => x.lang.replace('_', '-').toLowerCase() === L.toLowerCase() && /Natural|Online/i.test(x.name)) || vs.find((x) => x.lang.replace('_', '-').toLowerCase().startsWith(L.toLowerCase().slice(0, 2)));
    if (v) u.voice = v;
    u.onend = done; u.onerror = done;
    speechSynthesis.speak(u);
    setTimeout(done, Math.max(4000, text.length * 400));
  }
})();
