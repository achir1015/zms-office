// 內容引擎（逐行移植 nb/artifacts.py）：需求單、交給 NotebookLM 的指令、解析回答、內建範本、純文字編輯格式。
// 改這裡要和 Python 版一起改；tests/test_web_parity.py 會用 Node 比對兩邊輸出。
import { DATA } from "./data.js";

export const KINDS = DATA.kinds, KIND_ORDER = DATA.kindOrder;
const LANG_BY_ID = Object.fromEntries(DATA.langs.map((x) => [x.id, x]));
const CITE = /\s*\[\d+(?:[,，\-–]\s*\d+)*\]/g;

export function fill(tpl, kw) {
  return String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (k in kw ? String(kw[k]) : m));
}
const pick = (o, ...ks) => { for (const k of ks) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k]; return ""; };

// ================================================================ 需求單
export class Brief {
  constructor(project, topic, kw = {}) {
    this.project = { ...DATA.defaultProject, ...(project || {}) };
    this.topic = topic || {};
    this.topic_name = kw.topic_name || this.topic.name || "自訂主題";
    this.presenter = kw.presenter || "";
    this.instructor = kw.instructor || "";
    this.date = kw.date || "";
    this.audience = kw.audience || this.project.audience_text;
    this.term_langs = kw.term_langs ?? (this.project.term_langs || []).map((x) => x[0]);
    this.level = kw.level || "basic";
    this.source_title = kw.source_title || this.topic.sourceHint || "";
    this.source_pages = kw.source_pages || "";
    this.notes = kw.notes || "";
    this.slide_count = Math.max(parseInt(kw.slide_count || 11, 10), parseInt(this.project.min_slides || 1, 10));
    this.qa_count = parseInt(kw.qa_count || this.project.qa_count || 5, 10);
    this.quiz_count = parseInt(kw.quiz_count || 10, 10);
    this.lang = kw.lang || "zh";
    this.style = kw.style || "pastel";
    this.subtitle = kw.subtitle || this.project.cover_subtitle || "";
  }
  get cover_title() {
    const p = this.project;
    return fill(p.cover_title_tpl, { org: p.org, unit: p.unit, unit_full: p.unit_full, topic: this.topic_name }).replace(/\s+/g, " ").trim();
  }
  get byline() {
    const p = this.project;
    return fill(p.byline_tpl, { presenter_role: p.presenter_role, instructor_role: p.instructor_role,
      presenter: this.presenter || "[員工編號 員工姓名]", instructor: this.instructor || "[員工姓名]" });
  }
  get org_text() { return [this.project.org, this.project.unit].filter(Boolean).join(" ").trim(); }
  toJSON() { const d = { ...this }; delete d.project; delete d.topic; return d; }
  context_block(what) {
    const p = this.project;
    const L = [`製作${this.org_text ? this.org_text + " " : ""}「${this.topic_name}」${what}。`, "", "上下文（Context）"];
    if (p.role_text) L.push(`角色／身分：${p.org}${p.role_text}。`);
    if (p.background_text) L.push("任務背景：" + fill(p.background_text, { unit: p.unit, unit_full: p.unit_full, audience: this.audience }));
    if (p.purpose_text) L.push("任務目的：" + p.purpose_text);
    L.push("", "具體信息（Specific Information）");
    const src = this.source_title || "筆記本中的來源文件";
    L.push(`依據：「${src}」${this.source_pages ? `（來源第 ${this.source_pages} 頁）` : ""}。`);
    L.push("內容以筆記本中的來源文件為唯一依據；下方架構只是建議，如與來源不同，一律以來源為準。來源沒有提到的內容不要自行編造。");
    if (this.notes) L.push("本次文案重點與特別要求：" + this.notes);
    L.push(`對象：${this.audience}；語言程度：${DATA.levels[this.level] ?? this.level}。`);
    L.push(`語言：${(LANG_BY_ID[this.lang] || DATA.langs[0]).note}。`);
    if (this.org_text) L.push(`機構名稱一律使用「${this.org_text}」。`);
    if (p.extra_rules) L.push(p.extra_rules);
    return L;
  }
}

// ================================================================ 指令
export function buildPrompt(kind, b) {
  let L;
  const R = DATA.contentRule;
  if (kind === "SLIDES") {
    L = b.context_block("教育訓練簡報內容");
    const frame = slideFrame(b);
    L.push("", "目標（Intent）", "規劃每一頁簡報的文字標題、重點與講者備註；把複雜的步驟簡化為容易執行的實務清單。",
      `限制：簡報共 ${b.slide_count} 張（含封面與最後的感謝頁，不少於 ${b.project.min_slides || 1} 張）；最後要有 Q&A ${b.qa_count} 題作為驗收。`,
      "第一頁封面固定為：",
      `[標題 ${b.project.font_title}pt] ${b.cover_title}`, `[次標題 ${b.project.font_sub}pt] ${b.subtitle}`,
      `[小標題 ${b.project.font_small}pt] ${b.byline}`, "", "建議架構（各頁頁型）：");
    frame.forEach((f, i) => L.push(`${i + 1}. ${f.label}：${f.guide || ""}`));
    L.push("", R);
  } else if (kind === "MINDMAP") {
    L = b.context_block("心智圖");
    L.push("", "目標（Intent）", `把來源整理成一張心智圖：中心主題是「${b.topic_name}」，第一層 4～7 個分支，每個分支 2～6 個子項，子項可以再往下一層；每個節點不超過 18 個字。`, "", R);
  } else if (kind === "REPORT") {
    L = b.context_block("書面報告");
    L.push("", "目標（Intent）", "寫一份結構完整的報告：摘要、4～6 個小節（每節有段落與條列重點）、結論；引用的來源名稱列在 references。全文約 1500～2500 字。", "", R);
  } else if (kind === "QUIZ") {
    L = b.context_block("測驗卷");
    L.push("", "目標（Intent）", `出 ${b.quiz_count} 題測驗：大約七成單選題（4 個選項、只有一個正確答案）、三成是非題；題目要能從來源找到依據，每題附解析。答案用選項字母（A～D）或 ○／✕。`, "", R);
  } else if (kind === "INFOGRAPHIC") {
    L = b.context_block("一頁式資訊圖表");
    L.push("", "目標（Intent）", "把最重要的內容濃縮成一張資訊圖表：大標題、一句副標、3～4 個關鍵數字或關鍵字（stats）、4～6 個區塊（每區塊 2～4 點、每點不超過 22 字）、一句最重要的提醒。", "", R);
  } else if (kind === "WEBPAGE") {
    L = b.context_block("互動式學習網頁");
    L.push("", "目標（Intent）", "把來源整理成一個互動式學習網頁的內容：開場段落、4～7 個章節（每章一句摘要、3～5 個重點、一段展開補充）、6～10 張關鍵詞翻牌卡、4～6 題常見問答、5 題選擇題（answer 是正確選項的序號，從 0 開始）與一句帶走的重點。", "", R);
  } else throw new Error(kind);
  L.push("", "格式要求（Response Format）", "只回覆一段 JSON（不要任何說明文字、不要 Markdown 標記、不要引用編號），格式如下：", DATA.schemas[kind]);
  return L.join("\n");
}

export function slideFrame(b) {
  let base = DATA.frameGuide.map((x) => [...x]);
  if (!b.term_langs.length) base = base.filter((f) => f[0] !== "關鍵詞母語對照");
  const need = b.slide_count - 1, extra = DATA.frameExtra.map((x) => [...x]);
  while (base.length < need && extra.length) base.splice(base.length - 2, 0, extra.shift());
  while (base.length < need) base.splice(base.length - 2, 0, [`補充重點 ${base.length - 8}`, "依來源補充的重點"]);
  if (base.length > need) { const tail = base.slice(-2); base = base.slice(0, Math.max(need - 2, 1)).concat(tail); }
  return base.map(([label, guide]) => ({ label, guide }));
}

// ================================================================ 解析回答
function balance(t) {
  let depth = 0, out = "", inStr = false, esc = false;
  for (const ch of t) {
    out += ch;
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if ("{[".includes(ch)) depth++;
    else if ("}]".includes(ch)) { depth--; if (depth === 0) break; }
  }
  return out;
}
const cleanJson = (s) => s.replace(/“|”/g, '"').replace(CITE, "").replace(/,\s*([}\]])/g, "$1");
export function extractJson(text) {
  let t = String(text || "").trim().replace(/^\[AI-GENERATED[^\]]*\]\s*/, "");
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) t = m[1];
  const idx = [t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0);
  if (!idx.length) throw new Error("回答裡沒有 JSON");
  t = t.slice(Math.min(...idx));
  for (const cand of [t, balance(t)]) for (const fx of [(s) => s, cleanJson]) { try { return JSON.parse(fx(cand)); } catch (e) { /* 下一種 */ } }
  throw new Error("JSON 格式不正確（可能沒有複製完整）");
}
export function stripCites(v) {
  if (typeof v === "string") return v.replace(CITE, "").trim();
  if (Array.isArray(v)) return v.map(stripCites);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stripCites(x)]));
  return v;
}
const STRIP = " •-・\t";
const trimSet = (s) => { let a = 0, b = s.length; while (a < b && STRIP.includes(s[a])) a++; while (b > a && STRIP.includes(s[b - 1])) b--; return s.slice(a, b); };
export function asList(v) {
  if (v === undefined || v === null) return [];
  if (typeof v === "string") return v.split(/[\n；;]/).map(trimSet).filter(Boolean);
  return v.map((x) => String(x).trim()).filter(Boolean);
}
const str = (v) => (v === undefined || v === null ? "" : String(v));

export function normAnswer(a, typ, opts) {
  a = str(a).trim();
  if (typ === "single") {
    const m = a.match(/^[(（]?([A-DＡ-Ｄa-d])/);
    if (m) return "ＡＢＣＤ".includes(m[1]) ? "ABCD"["ＡＢＣＤ".indexOf(m[1])] : m[1].toUpperCase();
    for (let i = 0; i < opts.length; i++) if (a && (a === opts[i] || opts[i].includes(a))) return i < 4 ? "ABCD"[i] : "A";
    return "A";
  }
  if (typ === "tf") return ["✕", "X", "x", "×", "錯", "否", "F", "f"].includes(a.slice(0, 1)) || a.toLowerCase().startsWith("false") ? "✕" : "○";
  return a;
}
function node(n, def = "主題", depth = 0) {
  if (typeof n === "string") return { text: n, children: [] };
  n = n || {};
  const kids = n.children || [];
  return { text: str(n.text || n.name || n.title || def).slice(0, 40),
    children: depth < 4 ? kids.map((k) => node(k, "", depth + 1)).slice(0, 10) : [] };
}
export function coverOf(b) {
  return { title: b.cover_title, subtitle: b.subtitle, byline: b.byline, sizes: [b.project.font_title, b.project.font_sub, b.project.font_small] };
}
export function coverSlide(b) {
  const last = b.presenter.split(" ").slice(-1)[0];
  return { label: "封面頁", title: b.cover_title, points: [b.subtitle, b.byline], kind: "cover",
    notes: `大家好，我是${last || "講師"}。今天要和大家一起學習「${b.topic_name}」。` };
}

export function normalize(kind, data, b) {
  data = stripCites(data);
  const isObj = data && typeof data === "object" && !Array.isArray(data);
  if (kind === "SLIDES") {
    if (Array.isArray(data)) data = { slides: data };
    let slides = [];
    for (const s of data.slides || []) {
      if (!s || typeof s !== "object" || Array.isArray(s)) continue;
      slides.push({ label: str(s.label || s.type).trim(), title: str(s.title).trim(), subtitle: str(s.subtitle).trim(),
        points: asList(s.points || s.content || s.bullets), notes: str(s.notes || s.speaker_notes).trim() });
    }
    slides = slides.filter((s) => s.title || s.points.length);
    if (slides.length && (slides[0].label.includes("封面") || slides[0].title === b.cover_title)) slides = slides.slice(1);
    const qa = (data.qa || []).filter((x) => x && typeof x === "object").map((x) => ({ q: str(x.q || x.question), a: str(x.a || x.answer) }));
    return { cover: coverOf(b), slides: [coverSlide(b)].concat(slides), qa: qa.slice(0, Math.max(b.qa_count, 1)) };
  }
  if (kind === "MINDMAP") return { root: node(isObj && "root" in data ? data.root : data, b.topic_name) };
  if (kind === "REPORT") {
    const secs = (data.sections || []).filter((s) => s && typeof s === "object").map((s) => ({
      heading: str(s.heading || s.title),
      paragraphs: Array.isArray(s.paragraphs) ? asList(s.paragraphs) : [str(s.paragraphs || s.text)].filter(Boolean),
      bullets: asList(s.bullets || s.points) }));
    return { title: str(data.title || b.topic_name), summary: str(data.summary), sections: secs, conclusion: str(data.conclusion),
      references: asList(data.references), byline: b.byline, org: b.org_text };
  }
  if (kind === "QUIZ") {
    const src = (isObj ? data.questions : null) || (Array.isArray(data) ? data : []);
    const qs = [];
    for (const q of src) {
      if (!q || typeof q !== "object") continue;
      let opts = asList(q.options);
      let typ = str(q.type || (opts.length === 2 ? "tf" : opts.length ? "single" : "short")).toLowerCase();
      if (!["single", "tf", "short"].includes(typ)) typ = opts.length ? "single" : "short";
      if (typ === "tf" && !opts.length) opts = ["○", "✕"];
      if (typ === "single") opts = opts.map((o) => o.replace(/^[A-DＡ-Ｄ][.、．:：)\s]+/, "").trim());
      qs.push({ type: typ, q: str(q.q || q.question), options: opts, answer: normAnswer(q.answer, typ, opts), explain: str(q.explain) });
    }
    return { title: isObj ? str(data.title || b.topic_name + " 測驗") : b.topic_name + " 測驗", questions: qs.filter((q) => q.q) };
  }
  if (kind === "INFOGRAPHIC") {
    return { title: str(data.title || b.topic_name), subtitle: str(data.subtitle),
      stats: (data.stats || []).filter((x) => x && typeof x === "object").map((x) => ({ value: str(x.value ?? ""), label: str(x.label ?? "") })).slice(0, 4),
      sections: (data.sections || []).filter((x) => x && typeof x === "object").map((x) => ({ heading: str(x.heading ?? ""), points: asList(x.points) })).slice(0, 6),
      tip: str(data.tip), footer: str(data.footer || b.org_text) };
  }
  if (kind === "WEBPAGE") {
    const qz = (x) => {
      const opts = asList(x.options);
      let a = x.answer ?? 0;
      if (!Number.isInteger(a)) { const l = normAnswer(a, "single", opts); a = "ABCD".includes(l) ? "ABCD".indexOf(l) : 0; }
      return { q: str(x.q ?? ""), options: opts, answer: Math.max(0, Math.min(a, Math.max(opts.length - 1, 0))), explain: str(x.explain ?? "") };
    };
    const objs = (a) => (a || []).filter((x) => x && typeof x === "object");
    return { title: str(data.title || b.topic_name), subtitle: str(data.subtitle), intro: str(data.intro),
      sections: objs(data.sections).map((x) => ({ heading: str(x.heading ?? ""), summary: str(x.summary ?? ""), points: asList(x.points), detail: str(x.detail ?? "") })),
      cards: objs(data.cards).map((x) => ({ front: str(x.front ?? ""), back: str(x.back ?? "") })),
      faq: objs(data.faq).map((x) => ({ q: str(x.q ?? ""), a: str(x.a ?? "") })),
      quiz: objs(data.quiz).filter((x) => x.q).map(qz),
      takeaway: str(data.takeaway), footer: b.org_text, byline: b.byline };
  }
  throw new Error(kind);
}

// ================================================================ 內建範本
export function blankTopic(name) {
  return { name, sourceHint: `${name}相關文件`, hook: `今天一起學會「${name}」！`,
    purposes: ["（請填寫）目的一", "（請填寫）目的二"], supplies: ["（請填寫）需要準備的用物"],
    stepsA: { title: "操作步驟（一）", items: ["（請填寫）步驟"] }, stepsB: { title: "操作步驟（二）", items: ["（請填寫）步驟"] },
    cautions: ["（請填寫）注意事項"], errors: [["（請填寫）常見錯誤", "（請填寫）正確做法"]],
    report: "（請填寫）需要立即報告的情形", action: `把「${name}」的重點每天做到、做對。`,
    qa: [1, 2, 3, 4, 5].map((i) => [`（請填寫）第 ${i} 題`, "（請填寫）參考答案"]), terms: [] };
}
const empty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
function topicOrBlank(b) {
  const t = JSON.parse(JSON.stringify(b.topic || {})), base = blankTopic(b.topic_name);
  for (const [k, v] of Object.entries(base)) if (empty(t[k])) t[k] = v;
  return t;
}
const branch = (text, items) => ({ text, children: items.map((x) => ({ text: String(x).slice(0, 40), children: [] })) });
const pair = (e) => `${e[0]} → ${e[1]}`;

export function fromTemplate(kind, b) {
  const t = topicOrBlank(b), name = b.topic_name;
  if (kind === "SLIDES") return { cover: coverOf(b), slides: templateSlides(b, t), qa: t.qa.map(([q, a]) => ({ q, a })) };
  if (kind === "MINDMAP") return { root: { text: name, children: [
    branch("目的", t.purposes), branch("用物準備", t.supplies), branch(t.stepsA.title, t.stepsA.items), branch(t.stepsB.title, t.stepsB.items),
    branch("注意事項", t.cautions), branch("常見錯誤", t.errors.map(pair)), branch("立即報告", asList(t.report.replaceAll("、", "\n")))] } };
  if (kind === "REPORT") return { title: `${name} 實務報告`,
    summary: `${t.hook}。本報告整理「${name}」的目的、用物、操作步驟、注意事項與常見錯誤，作為教育訓練與日常照護的參考。`,
    sections: [{ heading: "一、目的與重要性", paragraphs: [], bullets: t.purposes }, { heading: "二、用物準備", paragraphs: [], bullets: t.supplies },
      { heading: "三、" + t.stepsA.title, paragraphs: [], bullets: t.stepsA.items }, { heading: "四、" + t.stepsB.title, paragraphs: [], bullets: t.stepsB.items },
      { heading: "五、注意事項", paragraphs: [], bullets: t.cautions },
      { heading: "六、常見錯誤與正確做法", paragraphs: [`發現以下情形要立即報告：${t.report}。`], bullets: t.errors.map((e) => `✗ ${e[0]} → ✓ ${e[1]}`) }],
    conclusion: t.action, references: [b.source_title || t.sourceHint || ""], byline: b.byline, org: b.org_text };
  if (kind === "QUIZ") return { title: `${name} 測驗`, questions: templateQuiz(t, b.quiz_count) };
  if (kind === "INFOGRAPHIC") return { title: name, subtitle: t.hook,
    stats: [{ value: String(t.purposes.length), label: "個照護目的" }, { value: String(t.stepsA.items.length + t.stepsB.items.length), label: "個操作步驟" },
      { value: String(t.cautions.length), label: "項安全重點" }, { value: String(t.qa.length), label: "題課後驗收" }],
    sections: [{ heading: "為什麼要做", points: t.purposes.slice(0, 4) }, { heading: "準備用物", points: t.supplies.slice(0, 4) },
      { heading: "步驟重點", points: t.stepsA.items.concat(t.stepsB.items).slice(0, 4) }, { heading: "安全第一", points: t.cautions.slice(0, 4) },
      { heading: "常見錯誤", points: t.errors.map((e) => `✗ ${e[0]} → ✓ ${e[1]}`).slice(0, 3) }, { heading: "立即報告", points: asList(t.report.replaceAll("、", "\n")).slice(0, 4) }],
    tip: t.action, footer: b.org_text };
  if (kind === "WEBPAGE") {
    const quiz = templateQuiz(t, 20).filter((q) => q.type === "single").map((q) => ({ q: q.q, options: q.options, answer: "ABCD".indexOf(q.answer), explain: q.explain }));
    const terms = (t.terms || []).map((row) => ({ front: row[0], back: row.slice(1).filter(Boolean).join("｜") }))
      .concat(t.errors.filter(([w, r]) => w && r).map(([w, r]) => ({ front: "✗ " + w, back: "✓ " + r })));
    return { title: `${name} 互動學習`, subtitle: t.hook,
      intro: `這個網頁整理「${name}」的目的、用物、步驟與注意事項。點章節可以展開補充說明，翻牌卡可以練習關鍵詞，最後做小測驗檢查自己學會了沒有。`,
      sections: [{ heading: "為什麼要做", summary: t.purposes[0], points: t.purposes, detail: "做對了，病人舒服、照顧者也安全。" },
        { heading: "準備用物", summary: "開始前先把東西準備好", points: t.supplies, detail: "東西準備齊全，做的時候就不會手忙腳亂。" },
        { heading: t.stepsA.title, summary: t.stepsA.items[0], points: t.stepsA.items, detail: "一個步驟做完再做下一個。" },
        { heading: t.stepsB.title, summary: t.stepsB.items[0], points: t.stepsB.items, detail: "結束後記得整理與紀錄。" },
        { heading: "安全第一", summary: t.cautions[0], points: t.cautions, detail: `發現異常：${t.report}，要立即報告。` }],
      cards: terms.slice(0, 10), faq: t.qa.map(([q, a]) => ({ q, a })), quiz: quiz.slice(0, 5),
      takeaway: t.action, footer: b.org_text, byline: b.byline };
  }
  throw new Error(kind);
}

function templateSlides(b, t) {
  const name = b.topic_name;
  const pres = b.presenter ? b.presenter.split(" ").slice(-1)[0] : "", inst = b.instructor ? b.instructor.split(" ").slice(-1)[0] : "";
  const S = [coverSlide(b)];
  S[0].notes = `大家好，我是${pres || "講師"}。今天由${inst || "指導老師"}陪我們一起學「${name}」。請大家放輕鬆，聽不懂可以隨時舉手，我們會用簡單的中文、慢慢說，也會實際示範。`;
  const add = (label, title, points, notes) => S.push({ label, title, points: [...points], notes });
  add("破題與議程", t.hook, ["為什麼要做（目的）", "要準備什麼（用物）", "怎麼做（步驟）", "哪裡要小心（注意事項）", `課後驗收 Q&A ${b.qa_count} 題`],
    `先問大家一個問題：${t.hook} 今天我們分五個部分，最後會有小測驗，請大家認真聽。`);
  add("目的與重要性", `為什麼要做好「${name}」？`, t.purposes, `這一頁講目的。重點是：${t.purposes[0]}。做對了，病人舒服、我們也安全。`);
  add("用物準備", "開始前，先把東西準備好", t.supplies, "我現在一樣一樣拿給大家看，請跟著我說出名稱。");
  add("操作步驟（一）", t.stepsA.title, t.stepsA.items, "這一頁我會一邊說一邊示範，一個步驟做完再做下一個。");
  add("操作步驟（二）", t.stepsB.title, t.stepsB.items, "接著第二部分。等一下請兩位同學上來練習。");
  add("注意事項與安全", "安全第一：這幾點一定要記住", t.cautions, `這一頁是安全重點。特別提醒：${t.cautions[0]}。`);
  add("常見錯誤與正確做法", "這樣做不對！正確應該這樣做", t.errors.map((e) => `✗ ${e[0]} → ✓ ${e[1]}`), `這些都是常看到的錯誤。看到以下情形要馬上報告：${t.report}。`);
  const langs = b.project.term_langs || [];
  const cols = langs.map(([lab], i) => [i + 1, lab]).filter(([, lab]) => b.term_langs.includes(lab));
  if (cols.length && (t.terms || []).length)
    add("關鍵詞母語對照", "關鍵詞，用你的語言記住",
      t.terms.map((row) => `${row[0]}：` + cols.filter(([c]) => c < row.length).map(([c, lab]) => `${lab} ${row[c]}`).join("｜")),
      "請大家用自己的語言唸一次這些關鍵詞，再用中文唸一次。（母語翻譯請由學員或通譯協助確認。）");
  add("總結與行動呼籲", "重點回顧與下一步行動", [t.stepsA.items[0], t.cautions[0], "立即報告：" + t.report, "行動呼籲：" + t.action],
    `最後幫大家整理重點。請記住一句話：${t.action}`);
  add("感謝與問答", "感謝聆聽", ["Q&A 時間：有問題請舉手", `課後驗收：Q&A ${b.qa_count} 題（紙本作答）`,
    `聯絡：${b.presenter || "講師"}／${b.instructor || "指導老師"}`], "謝謝大家今天認真學習！現在發下 Q&A，請寫完交給我。");
  const extras = [["實作演練", "換你試試看：分組實作演練", ["兩人一組，一人操作、一人檢查", "依步驟清單逐項打勾", "指導老師現場回饋"], "請兩人一組，照著步驟清單練習。做完互相交換角色。"],
    ["情境練習", "情境題：如果是你，會怎麼做？", [`情境：照護中發現「${t.report.split("、")[0]}」`, "你的第一個動作是？", "要報告誰？要說什麼？"], "請大家想一想，再分享答案。重點是：發現異常，先保護病人、再立即報告。"],
    ["每日檢核", "每天上班的自我檢核清單", t.cautions.slice(0, 3).map((c) => "□ " + c), "這張清單可以拍照存在手機裡。"]];
  let i = 0;
  while (S.length < b.slide_count && i < extras.length) {
    const [label, title, points, notes] = extras[i++];
    S.splice(S.length - 2, 0, { label, title, points, notes });
  }
  return S;
}

function shuffle(a, seed) {      // 和 Python 版相同的可重現洗牌
  for (let i = a.length - 1; i > 0; i--) {
    seed[0] = Number((BigInt(seed[0]) * 1103515245n + 12345n) % 2147483648n);
    const j = seed[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
}
function templateQuiz(t, n) {
  let s = 0; for (const ch of t.name) s += ch.codePointAt(0);
  const seed = [s || 1], qs = [];
  const errs = t.errors.filter((e) => e.length === 2);
  for (const [w, r] of errs) {
    const wrong = errs.filter((x) => x[0] !== w).map((x) => x[0]).slice(0, 3);
    while (wrong.length < 3) wrong.push(["不必在意，照平常習慣做", "等下班再處理", "請家屬自己處理"][wrong.length]);
    const opts = [r].concat(wrong);
    shuffle(opts, seed);
    qs.push({ type: "single", q: `關於「${w}」，正確的做法是？`, options: opts, answer: "ABCD"[opts.indexOf(r)], explain: `正確做法：${r}。` });
  }
  for (const c of t.cautions) qs.push({ type: "tf", q: c, options: ["○", "✕"], answer: "○", explain: "這是安全重點，要做到。" });
  for (const [w, r] of errs) qs.push({ type: "tf", q: w + "，這樣做是對的。", options: ["○", "✕"], answer: "✕", explain: `應該：${r}。` });
  for (const [q, a] of t.qa) qs.push({ type: "short", q, options: [], answer: a, explain: "" });
  return qs.slice(0, Math.max(n, 1));
}

// ================================================================ 純文字
export function outlineText(c) {
  const L = [];
  (c.slides || []).forEach((s, i) => {
    L.push(`【投影片 ${i + 1}｜${s.label || ""}】${s.title || ""}`);
    (s.points || []).forEach((p) => L.push("  • " + p));
    if (s.notes) L.push("  講者備註：" + s.notes);
    L.push("");
  });
  if ((c.qa || []).length) { L.push(`【Q&A ${c.qa.length} 題】`); c.qa.forEach((x, i) => L.push(`${i + 1}. ${x.q}\n   答：${x.a}`)); }
  return L.join("\n");
}
export function mindmapMarkdown(n, d = 0) {
  return [(d === 0 ? "#" : "  ".repeat(d - 1) + "-") + " " + n.text].concat((n.children || []).map((k) => mindmapMarkdown(k, d + 1))).join("\n");
}
export function summaryOf(kind, c) {
  if (kind === "SLIDES") return `${(c.slides || []).length} 張投影片、Q&A ${(c.qa || []).length} 題`;
  if (kind === "MINDMAP") { const cnt = (n) => 1 + (n.children || []).reduce((a, k) => a + cnt(k), 0); return `${((c.root || {}).children || []).length} 個分支、${cnt(c.root || {})} 個節點`; }
  if (kind === "REPORT") return `${(c.sections || []).length} 個小節`;
  if (kind === "QUIZ") return `${(c.questions || []).length} 題`;
  if (kind === "INFOGRAPHIC") return `${(c.stats || []).length} 個數字、${(c.sections || []).length} 個區塊`;
  if (kind === "WEBPAGE") return `${(c.sections || []).length} 章、${(c.cards || []).length} 張卡、${(c.quiz || []).length} 題`;
  return "";
}

// ================================================================ 純文字編輯格式（成品「修改」用）
export function toText(kind, c) {
  const L = [];
  if (kind === "MINDMAP") {
    const walk = (n, d) => { L.push((d === 0 ? "# " : "  ".repeat(d - 1) + "- ") + n.text); (n.children || []).forEach((k) => walk(k, d + 1)); };
    walk(c.root || { text: "主題" }, 0);
  } else if (kind === "REPORT") {
    L.push("# " + (c.title || ""), "摘要：" + (c.summary || ""), "");
    for (const s of c.sections || []) { L.push("## " + (s.heading || ""), ...(s.paragraphs || []), ...(s.bullets || []).map((x) => "- " + x), ""); }
    L.push("結論：" + (c.conclusion || ""), "參考來源：" + (c.references || []).join("；"));
  } else if (kind === "QUIZ") {
    L.push("# " + (c.title || ""), "");
    (c.questions || []).forEach((q, i) => {
      L.push(`${i + 1}.（${{ single: "單選", tf: "是非", short: "問答" }[q.type]}）${q.q}`);
      if (q.type === "single") q.options.slice(0, 4).forEach((o, j) => L.push(`${"ABCD"[j]}. ${o}`));
      L.push("答案：" + (q.answer || ""));
      if (q.explain) L.push("解析：" + q.explain);
      L.push("");
    });
  } else if (kind === "INFOGRAPHIC") {
    L.push("# " + (c.title || ""), "副標：" + (c.subtitle || ""), ...(c.stats || []).map((s) => `數字：${s.value}｜${s.label}`), "");
    for (const s of c.sections || []) L.push("## " + (s.heading || ""), ...(s.points || []).map((p) => "- " + p), "");
    L.push("提醒：" + (c.tip || ""), "頁尾：" + (c.footer || ""));
  } else if (kind === "WEBPAGE") {
    L.push("# " + (c.title || ""), "副標：" + (c.subtitle || ""), "介紹：" + (c.intro || ""), "");
    for (const s of c.sections || []) L.push("## " + (s.heading || ""), "摘要：" + (s.summary || ""), ...(s.points || []).map((p) => "- " + p), "補充：" + (s.detail || ""), "");
    (c.cards || []).forEach((x) => L.push(`卡片：${x.front}｜${x.back}`));
    L.push("");
    (c.faq || []).forEach((x) => L.push("問：" + x.q, "答：" + x.a));
    L.push("");
    (c.quiz || []).forEach((x) => { L.push("題目：" + x.q, ...x.options.map((o, j) => (j === x.answer ? "* " : "- ") + o), "解析：" + (x.explain || "")); });
    L.push("", "帶走：" + (c.takeaway || ""));
  }
  return L.join("\n").trim() + "\n";
}

export function fromText(kind, text, old = {}) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
  if (kind === "MINDMAP") {
    let root = null, stack = [];
    for (const ln of lines) {
      if (!ln.trim()) continue;
      if (ln.startsWith("# ")) { root = { text: ln.slice(2).trim(), children: [] }; stack = [[-1, root]]; continue; }
      if (!root) { root = { text: "主題", children: [] }; stack = [[-1, root]]; }
      const ind = Math.floor((ln.length - ln.trimStart().length) / 2);
      const nd = { text: ln.trim().replace(/^[-•*\s]+/, "").trim(), children: [] };
      while (stack.length && stack[stack.length - 1][0] >= ind) stack.pop();
      stack[stack.length - 1][1].children.push(nd); stack.push([ind, nd]);
    }
    return { root: root || { text: "主題", children: [] } };
  }
  const T = (s, n) => s.slice(n).trim();
  if (kind === "REPORT") {
    const c = { ...old, title: "", summary: "", sections: [], conclusion: "", references: [] };
    let cur = null;
    for (const ln of lines) {
      const s = ln.trim();
      if (s.startsWith("## ")) { cur = { heading: T(s, 3), paragraphs: [], bullets: [] }; c.sections.push(cur); }
      else if (s.startsWith("# ")) c.title = T(s, 2);
      else if (s.startsWith("摘要：")) c.summary = T(s, 3);
      else if (s.startsWith("結論：")) { c.conclusion = T(s, 3); cur = null; }
      else if (s.startsWith("參考來源：")) c.references = s.slice(5).split(/[；;]/).map((x) => x.trim()).filter(Boolean);
      else if (s && cur) (["- ", "• "].includes(s.slice(0, 2)) ? cur.bullets : cur.paragraphs).push(s.replace(/^[-•\s]+/, "").trim());
    }
    return c;
  }
  if (kind === "QUIZ") {
    const c = { title: "", questions: [] };
    let q = null;
    for (const ln of lines) {
      const s = ln.trim(), m = s.match(/^\d+[.、．]\s*[（(](單選|是非|問答)[）)]\s*(.*)$/);
      if (s.startsWith("# ")) c.title = T(s, 2);
      else if (m) { const typ = { 單選: "single", 是非: "tf", 問答: "short" }[m[1]]; q = { type: typ, q: m[2].trim(), options: typ === "tf" ? ["○", "✕"] : [], answer: "", explain: "" }; c.questions.push(q); }
      else if (q && q.type === "single" && /^[A-D][.、．]\s*/.test(s)) q.options.push(s.replace(/^[A-D][.、．]\s*/, ""));
      else if (q && s.startsWith("答案：")) q.answer = normAnswer(s.slice(3), q.type, q.options);
      else if (q && s.startsWith("解析：")) q.explain = T(s, 3);
    }
    return c;
  }
  if (kind === "INFOGRAPHIC") {
    const c = { title: "", subtitle: "", stats: [], sections: [], tip: "", footer: "" };
    let cur = null;
    for (const ln of lines) {
      const s = ln.trim();
      if (s.startsWith("## ")) { cur = { heading: T(s, 3), points: [] }; c.sections.push(cur); }
      else if (s.startsWith("# ")) c.title = T(s, 2);
      else if (s.startsWith("副標：")) c.subtitle = T(s, 3);
      else if (s.startsWith("數字：")) { const [v, ...rest] = s.slice(3).split("｜"); c.stats.push({ value: v.trim(), label: rest.join("｜").trim() }); }
      else if (s.startsWith("提醒：")) { c.tip = T(s, 3); cur = null; }
      else if (s.startsWith("頁尾：")) c.footer = T(s, 3);
      else if (s && cur) cur.points.push(s.replace(/^[-•\s]+/, "").trim());
    }
    return c;
  }
  if (kind === "WEBPAGE") {
    const c = { ...old, title: "", subtitle: "", intro: "", sections: [], cards: [], faq: [], quiz: [], takeaway: "" };
    let cur = null, q = null, faq = null;
    for (const ln of lines) {
      const s = ln.trim();
      if (s.startsWith("## ")) { cur = { heading: T(s, 3), summary: "", points: [], detail: "" }; q = null; c.sections.push(cur); }
      else if (s.startsWith("# ")) c.title = T(s, 2);
      else if (s.startsWith("副標：")) c.subtitle = T(s, 3);
      else if (s.startsWith("介紹：")) c.intro = T(s, 3);
      else if (s.startsWith("摘要：") && cur) cur.summary = T(s, 3);
      else if (s.startsWith("補充：") && cur) cur.detail = T(s, 3);
      else if (s.startsWith("卡片：")) { const [a, ...b] = s.slice(3).split("｜"); c.cards.push({ front: a.trim(), back: b.join("｜").trim() }); cur = null; }
      else if (s.startsWith("問：")) { faq = { q: T(s, 2), a: "" }; c.faq.push(faq); cur = null; }
      else if (s.startsWith("答：") && faq) faq.a = T(s, 2);
      else if (s.startsWith("題目：")) { q = { q: T(s, 3), options: [], answer: 0, explain: "" }; c.quiz.push(q); cur = null; }
      else if (q && ["* ", "- "].includes(s.slice(0, 2))) { if (s.startsWith("* ")) q.answer = q.options.length; q.options.push(T(s, 2)); }
      else if (s.startsWith("解析：") && q) q.explain = T(s, 3);
      else if (s.startsWith("帶走：")) c.takeaway = T(s, 3);
      else if (s && cur) cur.points.push(s.replace(/^[-•\s]+/, "").trim());
    }
    return c;
  }
  throw new Error(kind);
}
