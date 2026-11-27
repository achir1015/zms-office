// 美編（移植 nb/render.py）：PowerPoint、Word、心智圖、資訊圖表、網頁、整組 ZIP — 全部在瀏覽器裡產生。
import { DATA } from "./data.js";
import { Layout, layoutFor, FONT, W, H, PX2PT, wrap, loadIcons } from "./deck.js";
import { outlineText, mindmapMarkdown } from "./engine.js";

const STYLE = Object.fromEntries(DATA.styles.map((s) => [s.id, s]));
export const styleOf = (id) => STYLE[id] || DATA.styles[0];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const topicOf = (c) => (c.cover || {}).title || "";
const BRANCH = ["#1E4D8C", "#0FA294", "#E0A526", "#C2185B", "#7C3AED", "#EA580C", "#0284C7", "#16A34A", "#9333EA", "#DC2626"];

// ================================================================ 簡報
function classic(s, idx, total, style, sizes) {
  // 其他四種配色：上方色帶＋編號重點（與電腦版舊版型相同精神）
  const [dark, main, accent, light, ink] = styleOf(style).colors, L = new Layout(), g = L.g;
  g.fillStyle = light; g.fillRect(0, 0, W, H);
  if (s.kind === "cover" || idx === 0) {
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, dark); gr.addColorStop(1, main); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = accent; g.fillRect(0, H - 14, W, 14); g.fillRect(90, 300, 140, 6);
    L.text([90, 90, W - 180, 200], s.title || "", sizes[0] / PX2PT * 0.9, "#FFFFFF", true, "l", "m", 30, 1.2);
    if ((s.points || [])[0]) L.text([90, 330, W - 180, 70], s.points[0], sizes[1] / PX2PT * 0.62, "#E6EEFA", true, "l", "t", 18);
    if ((s.points || []).length > 1) L.text([90, 420, W - 180, 120], s.points.slice(1).join("\n"), sizes[2] / PX2PT * 0.55, "#CDDAF0", false, "l", "t", 14);
    return L;
  }
  g.fillStyle = main; g.fillRect(0, 0, W, 132); g.fillStyle = accent; g.fillRect(0, 132, W, 6);
  L.text([60, 50, W - 200, 76], s.title || "", 38, "#FFFFFF", true, "l", "m", 22, 1.2);
  if (s.label) L.text([60, 14, 400, 30], s.label, 18, accent, true);
  const pts = s.points || [], n = Math.max(pts.length, 1), step = Math.min(96, (H - 200) / n);
  pts.forEach((p, i) => {
    const y = 170 + i * step; g.fillStyle = main; g.beginPath(); g.arc(88, y + 22, 18, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.font = `bold 18px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(i + 1), 88, y + 23); g.textAlign = "left";
    L.text([124, y, W - 200, step - 8], p, 28, ink, false, "l", "m", 14);
  });
  return L;
}
export async function slideLayouts(content, style = "pastel") {
  await loadIcons();
  const S = content.slides || [], sizes = (content.cover || {}).sizes || [45, 40, 32];
  return S.map((s, i) => (style === "pastel" ? layoutFor(s, i, S.length, topicOf(content), sizes) : classic(s, i, S.length, style, sizes)));
}
export async function slideImages(content, style, scale = 0.5) {
  return (await slideLayouts(content, style)).map((L) => {
    const c = L.draw(); if (scale === 1) return c.toDataURL("image/png");
    const s = document.createElement("canvas"); s.width = W * scale; s.height = H * scale; s.getContext("2d").drawImage(c, 0, 0, s.width, s.height);
    return s.toDataURL("image/png");
  });
}
export async function slidesPptx(content, style) {
  const Pptx = window.PptxGenJS, prs = new Pptx(); prs.layout = "LAYOUT_WIDE";
  prs.author = "資料助秘NotebookLM MCP簡報"; prs.title = topicOf(content);
  const Ls = await slideLayouts(content, style), S = content.slides || [], k = 13.333 / W;
  Ls.forEach((L, i) => {
    const sl = prs.addSlide();
    sl.addImage({ data: L.bg.toDataURL("image/png"), x: 0, y: 0, w: 13.333, h: 7.5 });
    for (const t of L.texts) {
      const [x, y, w, h] = t.box;
      sl.addText(t.text, { x: x * k, y: y * k, w: w * k, h: h * k, margin: 0, fontFace: "Microsoft JhengHei", fontSize: Math.round(t.px * PX2PT * 0.96 * 10) / 10,
        bold: t.bold, color: t.color.replace("#", "").slice(0, 6), align: t.align === "c" ? "center" : "left", valign: t.valign === "m" ? "middle" : "top",
        lineSpacingMultiple: t.sp * 0.92, fit: "none", wrap: true });
    }
    if (S[i].notes) sl.addNotes(S[i].notes);
  });
  return prs.write({ outputType: "blob" });
}

// ================================================================ Word（自己組 .docx）
const X = (s) => esc(s).replace(/'/g, "&apos;");
function para(text, style, bold) {
  const st = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${st}<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${X(text)}</w:t></w:r></w:p>`;
}
export async function docx(blocks) {
  // blocks：[[樣式, 文字, 粗體]]，樣式：Title、Heading1、Heading2、List、（空白＝內文）
  const body = blocks.map(([st, t, b]) => para(st === "List" ? "• " + t : t, st === "List" ? "" : st, b)).join("");
  const z = new window.JSZip(), F = '<w:rFonts w:ascii="Microsoft JhengHei" w:hAnsi="Microsoft JhengHei" w:eastAsia="Microsoft JhengHei"/>';
  const sty = (id, name, sz, b, color) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr><w:rPr>${F}${b ? "<w:b/>" : ""}<w:color w:val="${color}"/><w:sz w:val="${sz}"/></w:rPr></w:style>`;
  z.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  z.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file("word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  z.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>${F}<w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>${sty("Title", "Title", 40, true, "14325C")}${sty("Heading1", "heading 1", 30, true, "1E4D8C")}${sty("Heading2", "heading 2", 26, true, "1E4D8C")}</w:styles>`);
  z.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1200" w:right="1200" w:bottom="1200" w:left="1200"/></w:sectPr></w:body></w:document>`);
  return z.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
const LINE = "＿".repeat(34);
export function outlineDocx(c) {
  const cv = c.cover || {}, B = [["Title", cv.title || "簡報大綱"]];
  if (cv.subtitle) B.push(["", cv.subtitle]); if (cv.byline) B.push(["", cv.byline]);
  (c.slides || []).forEach((s, i) => { B.push(["Heading2", `投影片 ${i + 1}｜${s.label || ""}`], ["", s.title || "", true]); (s.points || []).forEach((p) => B.push(["List", p])); if (s.notes) B.push(["", "講者備註：" + s.notes]); });
  if ((c.qa || []).length) { B.push(["Heading1", `Q&A ${c.qa.length} 題`]); c.qa.forEach((x, i) => B.push(["", `${i + 1}. ${x.q}`], ["", "答：" + x.a])); }
  return docx(B);
}
export function qaDocx(c, answers) {
  const B = [["Heading1", `${(c.cover || {}).title || ""}　Q&A ${answers ? "解答" : "作答卷"}`]];
  if (!answers) B.push(["", "姓名：＿＿＿＿＿＿＿＿　國籍：＿＿＿＿＿＿　日期：＿＿＿＿＿＿＿　得分：＿＿＿＿"]);
  (c.qa || []).forEach((x, i) => { B.push(["", `${i + 1}. ${x.q}`, true]); if (answers) B.push(["", "答：" + x.a]); else B.push(["", LINE], ["", LINE], ["", LINE]); });
  return docx(B);
}
export function reportDocx(c) {
  const B = [["Title", c.title || "報告"]];
  for (const k of ["org", "byline"]) if (c[k]) B.push(["", c[k]]);
  if (c.summary) B.push(["Heading1", "摘要"], ["", c.summary]);
  (c.sections || []).forEach((s) => { B.push(["Heading1", s.heading || ""]); (s.paragraphs || []).forEach((p) => B.push(["", p])); (s.bullets || []).forEach((b) => B.push(["List", b])); });
  if (c.conclusion) B.push(["Heading1", "結論"], ["", c.conclusion]);
  if ((c.references || []).length) { B.push(["Heading1", "參考來源"]); c.references.forEach((r, i) => B.push(["", `${i + 1}. ${r}`])); }
  return docx(B);
}
export function quizDocx(c, answers) {
  const B = [["Heading1", (c.title || "測驗") + (answers ? "　解答" : "")]];
  if (!answers) B.push(["", "姓名：＿＿＿＿＿＿＿＿　日期：＿＿＿＿＿＿＿　得分：＿＿＿＿"]);
  (c.questions || []).forEach((q, i) => {
    B.push(["", `${i + 1}.（${{ single: "單選", tf: "是非", short: "問答" }[q.type]}）${q.q}`, true]);
    if (q.type === "single") q.options.forEach((o, j) => B.push(["", `　（${j < 4 ? "ABCD"[j] : j + 1}）${o}`]));
    else if (q.type === "tf" && !answers) B.push(["", "　（　）○ 對　（　）✕ 錯"]);
    if (answers) B.push(["", `答案：${q.answer}${q.explain ? "　解析：" + q.explain : ""}`]);
    else if (q.type === "short") B.push(["", LINE], ["", LINE]);
  });
  return docx(B);
}

// ================================================================ 心智圖（左右對稱）
export function mindmapCanvas(content) {
  const root = content.root || { text: "主題", children: [] }, mc = document.createElement("canvas").getContext("2d");
  const F = [[34, true], [24, true], [19, false], [16, false]], PADX = [26, 18, 12, 10], PADY = [16, 10, 6, 5], GAPX = 70, GAPY = 12;
  const size = (n, d) => {
    const [px, b] = F[Math.min(d, 3)], lines = wrap(n.text, px, b, d ? 260 : 320);
    mc.font = `${b ? "bold " : ""}${px}px ${FONT}`;
    n._l = lines; n._w = Math.max(...lines.map((l) => mc.measureText(l).width)) + PADX[Math.min(d, 3)] * 2; n._h = lines.length * px * 1.3 + PADY[Math.min(d, 3)] * 2;
    const k = n.children || []; k.forEach((c) => size(c, d + 1));
    n._th = k.length ? Math.max(n._h, k.reduce((a, c) => a + c._th, 0) + GAPY * (k.length - 1)) : n._h;
  };
  size(root, 0);
  const kids = root.children || [], right = [], left = []; let hr = 0, hl = 0;
  kids.forEach((k) => { if (hr <= hl) { right.push(k); hr += k._th + GAPY * 3; } else { left.push(k); hl += k._th + GAPY * 3; } });
  const dw = (n) => n._w + ((n.children || []).length ? GAPX + Math.max(...n.children.map(dw)) : 0);
  const wr = Math.max(0, ...right.map(dw)), wl = Math.max(0, ...left.map(dw)), Hh = Math.max(hr, hl, root._h) + 120, Ww = wl + wr + root._w + GAPX * 2 + 120;
  const cv = document.createElement("canvas"); cv.width = Ww; cv.height = Hh; const g = cv.getContext("2d");
  g.fillStyle = "#FAFBFD"; g.fillRect(0, 0, Ww, Hh);
  const cx = 60 + wl + GAPX, cy = Hh / 2;
  const curve = (x1, y1, x2, y2, col, w) => { const mx = (x1 + x2) / 2; g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.bezierCurveTo(mx, y1, mx, y2, x2, y2); g.stroke(); };
  const tint = (hex) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255, f = (c) => Math.round(c + (255 - c) * 0.85); return `rgb(${f(r)},${f(gg)},${f(b)})`; };
  const draw = (n, x, y, d, col, side) => {
    const x0 = side > 0 ? x : x - n._w, [px, b] = F[Math.min(d, 3)];
    if (d === 1) { g.fillStyle = col; g.beginPath(); g.roundRect(x0, y - n._h / 2, n._w, n._h, 14); g.fill(); }
    else if (d === 2) { g.fillStyle = tint(col); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.roundRect(x0, y - n._h / 2, n._w, n._h, 10); g.fill(); g.stroke(); }
    else { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y + n._h / 2); g.lineTo(x0 + n._w, y + n._h / 2); g.stroke(); }
    g.fillStyle = d === 1 ? "#fff" : d === 2 ? "#1F2937" : "#374151"; g.font = `${b ? "bold " : ""}${px}px ${FONT}`; g.textBaseline = "middle";
    let ty = y - n._l.length * px * 1.3 / 2 + px * 0.65; for (const l of n._l) { g.fillText(l, x0 + PADX[Math.min(d, 3)], ty); ty += px * 1.3; }
    const k = n.children || []; if (!k.length) return;
    let top = y - (k.reduce((a, c) => a + c._th, 0) + GAPY * (k.length - 1)) / 2; const ex = side > 0 ? x0 + n._w : x0;
    for (const c of k) { const ky = top + c._th / 2, kx = ex + GAPX * side; curve(ex, y, kx, ky, col, d === 1 ? 3 : 2); draw(c, kx, ky, d + 1, col, side); top += c._th + GAPY; }
  };
  for (const [side, grp] of [[1, right], [-1, left]]) {
    let top = cy - (grp.reduce((a, c) => a + c._th, 0) + GAPY * 3 * (grp.length - 1)) / 2;
    for (const k of grp) { const col = BRANCH[kids.indexOf(k) % BRANCH.length], ky = top + k._th / 2, sx = cx + (side > 0 ? root._w : 0), kx = sx + GAPX * side; curve(sx, cy, kx, ky, col, 4); draw(k, kx, ky, 1, col, side); top += k._th + GAPY * 3; }
  }
  g.fillStyle = "#14325C"; g.strokeStyle = "#E0A526"; g.lineWidth = 4; g.beginPath(); g.roundRect(cx, cy - root._h / 2, root._w, root._h, 22); g.fill(); g.stroke();
  g.fillStyle = "#fff"; g.font = `bold 34px ${FONT}`; let ty = cy - root._l.length * 34 * 1.3 / 2 + 22; for (const l of root._l) { g.fillText(l, cx + PADX[0], ty); ty += 34 * 1.3; }
  return cv;
}
export function freemind(c) {
  const nd = (n) => `<node TEXT="${esc(n.text)}">${(n.children || []).map(nd).join("")}</node>`;
  return `<map version="1.0.1">${nd(c.root)}</map>`;
}

// ================================================================ 資訊圖表（直式海報）
export function infographicCanvas(c, style = "pastel") {
  const [dark, main, accent, light, ink] = styleOf(style).colors, Wd = 1080, colw = (Wd - 150) / 2;
  const hTxt = (t, px, b, w) => wrap(t, px, b, w).length * px * 1.4;
  const secs = c.sections || [], rows = []; for (let i = 0; i < secs.length; i += 2) rows.push(secs.slice(i, i + 2));
  const secH = (s) => 70 + (s.points || []).reduce((a, p) => a + hTxt(p, 23, false, colw - 70) + 14, 0) + 16;
  const tl = Math.min(3, wrap(c.title || "", 62, true, Wd - 120).length), sl = c.subtitle ? Math.min(3, wrap(c.subtitle, 28, false, Wd - 120).length) : 0;
  const headH = 70 + tl * 62 * 1.2 + 18 + sl * 28 * 1.35 + 60;
  const Hh = headH + 50 + ((c.stats || []).length ? 190 : 0) + rows.reduce((a, r) => a + Math.max(...r.map(secH)) + 30, 0) + 220;
  const cv = document.createElement("canvas"); cv.width = Wd; cv.height = Hh; const g = cv.getContext("2d");
  g.fillStyle = light; g.fillRect(0, 0, Wd, Hh);
  const gr = g.createLinearGradient(0, 0, Wd, 0); gr.addColorStop(0, dark); gr.addColorStop(1, main); g.fillStyle = gr; g.fillRect(0, 0, Wd, headH);
  g.fillStyle = accent; g.fillRect(0, headH, Wd, 12);
  const txt = (t, x, y, px, b, col, w, max) => { g.font = `${b ? "bold " : ""}${px}px ${FONT}`; g.fillStyle = col; g.textBaseline = "top"; let ls = wrap(t, px, b, w); if (max) ls = ls.slice(0, max); for (const l of ls) { g.fillText(l, x, y); y += px * 1.35; } return y; };
  let y = txt(c.title || "", 60, 70, 62, true, "#fff", Wd - 120, 3) + 18; txt(c.subtitle || "", 60, y, 28, false, "#E1EAF8", Wd - 120, 3);
  y = headH + 50;
  const st = c.stats || [];
  if (st.length) {
    const cw = (Wd - 120 - 24 * (st.length - 1)) / st.length;
    st.forEach((s, i) => { const x = 60 + i * (cw + 24); g.fillStyle = "#fff"; g.strokeStyle = main; g.lineWidth = 3; g.beginPath(); g.roundRect(x, y, cw, 160, 22); g.fill(); g.stroke();
      const px = s.value.length <= 4 ? 54 : 34; g.font = `bold ${px}px ${FONT}`; g.fillStyle = main; g.textBaseline = "top"; g.fillText(s.value, x + (cw - g.measureText(s.value).width) / 2, y + 22); txt(s.label, x + 14, y + 100, 21, false, ink, cw - 28, 2); });
    y += 190;
  }
  for (const r of rows) {
    const hh = Math.max(...r.map(secH));
    r.forEach((s, j) => { const x = 60 + j * (colw + 30), col = BRANCH[secs.indexOf(s) % BRANCH.length];
      g.fillStyle = "#fff"; g.beginPath(); g.roundRect(x, y, colw, hh, 20); g.fill(); g.fillStyle = col; g.beginPath(); g.roundRect(x, y, colw, 58, [20, 20, 0, 0]); g.fill();
      txt(s.heading || "", x + 24, y + 12, 30, true, "#fff", colw - 40, 1);
      let py = y + 76; for (const p of s.points || []) { g.fillStyle = col; g.beginPath(); g.arc(x + 32, py + 16, 6, 0, 7); g.fill(); py = txt(p, x + 52, py, 23, false, ink, colw - 70) + 14; } });
    y += hh + 30;
  }
  if (c.tip) { g.fillStyle = accent; g.beginPath(); g.roundRect(60, y, Wd - 120, 120, 24); g.fill(); txt("重點提醒：" + c.tip, 96, y + 26, 28, true, dark, Wd - 190, 2); y += 150; }
  if (c.footer) txt(c.footer, 60, y, 20, false, "#78828F", Wd - 120, 1);
  const out = document.createElement("canvas"); out.width = Wd; out.height = Math.min(Hh, y + 60); out.getContext("2d").drawImage(cv, 0, 0);
  return out;
}

// ================================================================ 網頁
const page = (title, body) => `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:'Noto Sans TC','Microsoft JhengHei','PingFang TC',sans-serif;max-width:1000px;margin:0 auto;padding:24px;color:#1f2937;background:#f6f8fb;line-height:1.7}h1{color:#14325C}h2{color:#1E4D8C;border-left:6px solid #E0A526;padding-left:10px}.card{background:#fff;border-radius:14px;padding:16px 20px;margin:14px 0;box-shadow:0 2px 8px #0000000d}footer{color:#888;font-size:13px;margin-top:30px}</style>
</head><body><h1>${esc(title)}</h1>${body}<footer>由 資料助秘NotebookLM MCP簡報 產生</footer></body></html>`;
export async function slidesHtml(c, style) {
  const imgs = await slideImages(c, style, 1);
  return page(topicOf(c) || "簡報", imgs.map((u, i) => `<div class="card"><img src="${u}" style="width:100%;border-radius:8px">${(c.slides[i] || {}).notes ? `<p style="color:#555;font-size:14px">講者備註：${esc(c.slides[i].notes)}</p>` : ""}</div>`).join("")
    + ((c.qa || []).length ? `<h2>Q&A</h2><ol class="card">${c.qa.map((x) => `<li><b>${esc(x.q)}</b><br>答：${esc(x.a)}</li>`).join("")}</ol>` : ""));
}
export function reportMarkdown(c) {
  const L = ["# " + (c.title || "報告"), ""];
  for (const k of ["org", "byline"]) if (c[k]) L.push(c[k], "");
  if (c.summary) L.push("## 摘要", c.summary, "");
  (c.sections || []).forEach((s) => L.push("## " + (s.heading || ""), ...(s.paragraphs || []), ...(s.bullets || []).map((b) => "- " + b), ""));
  if (c.conclusion) L.push("## 結論", c.conclusion, "");
  if ((c.references || []).length) L.push("## 參考來源", ...c.references.map((r, i) => `${i + 1}. ${r}`));
  return L.join("\n");
}
export function reportHtml(c) {
  let b = ["org", "byline"].filter((k) => c[k]).map((k) => `<p>${esc(c[k])}</p>`).join("");
  if (c.summary) b += `<div class="card"><b>摘要</b><p>${esc(c.summary)}</p></div>`;
  (c.sections || []).forEach((s) => { b += `<h2>${esc(s.heading)}</h2>` + (s.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join("") + ((s.bullets || []).length ? `<ul>${s.bullets.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""); });
  if (c.conclusion) b += `<h2>結論</h2><p>${esc(c.conclusion)}</p>`;
  if ((c.references || []).length) b += `<h2>參考來源</h2><ol>${c.references.map((r) => `<li>${esc(r)}</li>`).join("")}</ol>`;
  return page(c.title || "報告", b);
}
export function quizHtml(c) {
  const data = JSON.stringify(c.questions || []).replace(/</g, "\\u003c");
  return page(c.title || "測驗", `<style>.q{background:#fff;border-radius:14px;padding:14px 18px;margin:12px 0}.o{display:block;margin:6px 0;padding:8px 12px;border:1px solid #dbe3ef;border-radius:10px;cursor:pointer}.o.sel{background:#e8f0fb;border-color:#1E4D8C}.o.ok{background:#dcfce7;border-color:#16a34a}.o.bad{background:#fee2e2;border-color:#dc2626}.ex{color:#555;display:none}button{font-size:18px;padding:10px 26px;border-radius:12px;border:0;background:#1E4D8C;color:#fff;cursor:pointer}#score{font-size:22px;font-weight:700;color:#0FA294}</style><div id="qs"></div><p><button onclick="grade()">交卷</button> <span id="score"></span></p>
<script>const Q=${data};const L='ABCD';const pick={};const box=document.getElementById('qs');
Q.forEach((q,i)=>{const d=document.createElement('div');d.className='q';d.innerHTML='<b>'+(i+1)+'. '+q.q+'</b>';const opts=q.type==='tf'?['○','✕']:q.options;if(q.type==='short'){d.innerHTML+='<textarea style="width:100%;height:70px"></textarea>'}
opts.forEach((o,j)=>{const a=q.type==='tf'?o:L[j];const e=document.createElement('label');e.className='o';e.textContent=(q.type==='tf'?'':'('+a+') ')+o;e.onclick=()=>{pick[i]=a;d.querySelectorAll('.o').forEach(x=>x.classList.remove('sel'));e.classList.add('sel')};e.dataset.a=a;d.appendChild(e)});
const ex=document.createElement('p');ex.className='ex';ex.textContent='答案：'+q.answer+(q.explain?'　'+q.explain:'');d.appendChild(ex);box.appendChild(d)});
function grade(){let ok=0,n=0;document.querySelectorAll('.q').forEach((d,i)=>{const q=Q[i];d.querySelector('.ex').style.display='block';if(q.type==='short')return;n++;if(pick[i]===q.answer)ok++;d.querySelectorAll('.o').forEach(e=>{if(e.dataset.a===q.answer)e.classList.add('ok');else if(e.dataset.a===pick[i])e.classList.add('bad')})});document.getElementById('score').textContent='答對 '+ok+' / '+n+' 題（'+Math.round(ok*100/Math.max(n,1))+' 分）'}<\/script>`);
}
let WEBTPL = null;
export async function webpageHtml(c, style = "pastel") {
  if (!WEBTPL) WEBTPL = await (await fetch("webpage.tpl.html")).text();
  const [dark, main, accent, light, ink] = styleOf(style).colors;
  return WEBTPL.replace("%TITLE%", esc(c.title || "互動學習")).replace("%VARS%", `--dark:${dark};--main:${main};--accent:${accent};--light:${light};--ink:${ink}`)
    .replace("%DATA%", JSON.stringify(c).replace(/</g, "\\u003c"));
}

// ================================================================ 整組檔案
const canvasBlob = (cv) => new Promise((ok) => cv.toBlob(ok, "image/png"));
const textBlob = (s, type = "text/html") => new Blob([s], { type: type + ";charset=utf-8" });
export async function exportBundle(kind, c, title, style = "pastel") {
  const safe = String(title).replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "成品", out = [];
  if (kind === "SLIDES") {
    out.push([safe + ".pptx", await slidesPptx(c, style)], [safe + "_簡報大綱.docx", await outlineDocx(c)],
      [safe + "_QA作答卷.docx", await qaDocx(c, false)], [safe + "_QA解答.docx", await qaDocx(c, true)],
      [safe + ".html", textBlob(await slidesHtml(c, style))], [safe + "_大綱.txt", textBlob("﻿" + outlineText(c), "text/plain")]);
  } else if (kind === "MINDMAP") {
    const cv = mindmapCanvas(c);
    out.push([safe + ".png", await canvasBlob(cv)], [safe + ".html", textBlob(page(title, `<p><img src="${cv.toDataURL()}" style="max-width:100%"></p><h2>大綱</h2><pre>${esc(mindmapMarkdown(c.root))}</pre>`))],
      [safe + ".md", textBlob(mindmapMarkdown(c.root), "text/markdown")], [safe + ".mm", textBlob(freemind(c), "application/xml")]);
  } else if (kind === "REPORT") {
    out.push([safe + ".docx", await reportDocx(c)], [safe + ".md", textBlob(reportMarkdown(c), "text/markdown")], [safe + ".html", textBlob(reportHtml(c))]);
  } else if (kind === "QUIZ") {
    out.push([safe + "_作答卷.docx", await quizDocx(c, false)], [safe + "_解答.docx", await quizDocx(c, true)], [safe + ".html", textBlob(quizHtml(c))]);
  } else if (kind === "INFOGRAPHIC") {
    const cv = infographicCanvas(c, style);
    out.push([safe + ".png", await canvasBlob(cv)], [safe + ".html", textBlob(page(c.title || "資訊圖表", `<p><img src="${cv.toDataURL()}" style="max-width:100%;border-radius:12px"></p>`))]);
  } else if (kind === "WEBPAGE") {
    out.push([safe + ".html", textBlob(await webpageHtml(c, style))], [safe + "_內容.json", textBlob(JSON.stringify(c, null, 1), "application/json")]);
  }
  return out;
}
export async function zip(files) {
  const z = new window.JSZip(); for (const [n, b] of files) z.file(n, b);
  return z.generateAsync({ type: "blob" });
}
