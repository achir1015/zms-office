// 柔和插畫風簡報（移植 nb/deck.py）：版面計算一次 → 預覽圖（canvas）與 PowerPoint（背景圖＋可編輯文字框）共用。
import { DATA } from "./data.js";

export const W = 1280, H = 720, PX2PT = 0.75;
const BG = "#F8F1EA", TITLE = "#BE6260", TITLE_DARK = "#5C3A32", SUB = "#3466A0", SUB_HL = "#BEDCF4", INK = "#3A3432", WHITE = "#FFFFFF";
const RAINBOW = ["#5496D6", "#E2768C", "#62B870", "#ECB43C", "#EE8A52", "#9676D0"];
const PINK_BLOB = [246, 214, 212], BLUE_BLOB = [214, 230, 246];
export const FONT = '"Microsoft JhengHei","PingFang TC","Heiti TC","Noto Sans TC","Noto Sans Thai",sans-serif';
const RULES = DATA.iconRules.map(([p, k]) => [new RegExp(p), k]);

// ---------------------------------------------------------------- 小圖示
const ICONS = {};
export function loadIcons(keys = DATA.icons) {
  return Promise.all(keys.filter((k) => !ICONS[k]).map((k) => new Promise((ok) => {
    const im = new Image(); im.onload = () => { ICONS[k] = im; ok(); }; im.onerror = () => ok(); im.src = new URL(`./icons/${k}.png`, import.meta.url).href;
  })));
}
export function pickIcon(text, used = new Set(), fallback = 0) {
  const hits = RULES.filter(([re]) => re.test(text || "")).map(([, k]) => k);
  for (const k of hits) if (!used.has(k)) { used.add(k); return k; }
  if (hits.length) return hits[0];
  return DATA.generic[fallback % DATA.generic.length];
}
const WEAK = new Set(["footprints", "target", "toolbox", "warning", "question", "star", "books", "check", "cross", "nurse"]);
function mainIcon(s, topic, idx, used) {
  for (const src of [s.title || "", (s.points || []).slice(0, 2).join(" "), topic, s.label || ""]) {
    const strong = RULES.filter(([re]) => re.test(src)).map(([, k]) => k).filter((k) => !WEAK.has(k));
    if (strong.length) { used.add(strong[0]); return strong[0]; }
  }
  return pickIcon((s.title || "") + (s.label || "") + topic, used, idx);
}

// ---------------------------------------------------------------- 文字量測
const mctx = document.createElement("canvas").getContext("2d");
const font = (px, bold) => `${bold ? "bold " : ""}${Math.round(px)}px ${FONT}`;
const NO_START = new Set("，。、）」』：；！？),.;:!?%");
export function wrap(text, px, bold, width) {
  mctx.font = font(px, bold);
  const lines = [];
  for (const para of String(text).replace(/✗/g, "×").replace(/✓/g, "○").split("\n")) {
    const toks = para.match(/[A-Za-z0-9@#%&+\-_./:'’฀-๿]+|\s+|./gu) || [""];
    let cur = "";
    for (const t of toks) {
      if (mctx.measureText(cur + t).width <= width || !cur || NO_START.has(t)) cur += t;
      else { lines.push(cur.trimEnd()); cur = t.trimStart(); }
    }
    lines.push(cur.trimEnd());
  }
  return lines.length ? lines : [""];
}
function fit(text, width, height, px, bold = false, minPx = 14, sp = 1.3) {
  px = Math.round(px);
  while (px > minPx) { const n = wrap(text, px, bold, width).length; if (n * px * sp <= height) return [px, n]; px -= 2; }
  return [minPx, wrap(text, minPx, bold, width).length];
}
const tlen = (t, px, bold) => { mctx.font = font(px, bold); return mctx.measureText(t).width; };

class Layout {
  constructor() {
    this.bg = document.createElement("canvas"); this.bg.width = W; this.bg.height = H;
    this.g = this.bg.getContext("2d"); this.g.fillStyle = BG; this.g.fillRect(0, 0, W, H);
    this.texts = [];
  }
  text(box, text, px, color = INK, bold = false, align = "l", valign = "t", minPx = 14, sp = 1.3) {
    const [x, y, w, h] = box, [p, n] = fit(text, w, h, px, bold, minPx, sp);
    this.texts.push({ box: [x, y, w, h].map(Math.round), text, px: p, color, bold, align, valign, sp });
    return [p, n];
  }
  blob(x, y, r, rgb, alpha = 170) {
    const g = this.g, gr = g.createRadialGradient(x, y, r * 0.8, x, y, r * 1.04);
    gr.addColorStop(0, `rgba(${rgb},${alpha / 255})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 1.04, 0, Math.PI * 2); g.fill();
  }
  box(x, y, w, h, r, fill = WHITE, shadow = 0.14) {
    const g = this.g; g.save(); g.shadowColor = `rgba(120,80,70,${shadow})`; g.shadowBlur = 16; g.shadowOffsetY = 6;
    g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); g.restore();
  }
  num(cx, cy, r, n, color) {
    const g = this.g; g.save(); g.fillStyle = "rgba(0,0,0,0.18)"; g.beginPath(); g.arc(cx, cy + 3, r, 0, 7); g.fill();
    g.fillStyle = color; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.lineWidth = 3; g.strokeStyle = WHITE; g.stroke();
    g.fillStyle = WHITE; g.font = font(r * 1.1, true); g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(n), cx, cy + 1); g.restore();
  }
  icon(key, cx, cy, size, halo) {
    const im = ICONS[key] || ICONS.sparkles; if (!im) return;
    if (halo) this.blob(cx, cy, size * 0.62, halo, 200);
    const g = this.g; g.save(); g.shadowColor = "rgba(90,60,50,0.25)"; g.shadowBlur = 10; g.shadowOffsetY = 8;
    g.drawImage(im, cx - size / 2, cy - size / 2, size, size); g.restore();
  }
  highlight(x, y, w, h) { const g = this.g; g.fillStyle = SUB_HL; g.beginPath(); g.roundRect(x - 8, y + h * 0.45, w + 16, h * 0.55 + 4, h * 0.3); g.fill(); }
  draw(canvas) {
    const c = canvas || document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.drawImage(this.bg, 0, 0);
    for (const t of this.texts) {
      const [x, y, w, h] = t.box, lines = wrap(t.text, t.px, t.bold, w), lh = t.px * t.sp;
      let yy = t.valign === "m" ? y + (h - lines.length * lh) / 2 : y;
      g.font = font(t.px, t.bold); g.fillStyle = t.color; g.textBaseline = "middle";
      for (const ln of lines) { const tw = g.measureText(ln).width; g.fillText(ln, t.align === "c" ? x + (w - tw) / 2 : x, yy + lh / 2); yy += lh; }
    }
    return c;
  }
}

// ---------------------------------------------------------------- 版型
function decorate(L, seed) {
  [[W + 40, -60, 230, PINK_BLOB], [-80, H + 40, 220, BLUE_BLOB], [W + 10, H + 70, 160, PINK_BLOB], [-40, -50, 140, BLUE_BLOB]]
    .forEach(([x, y, r, c], i) => { if ((i + seed) % 3 !== 2) L.blob(x, y, r, c, 150); });
}
function subtitleOf(s) {
  if (s.subtitle) return s.subtitle;
  const lab = s.label || "";
  for (const [p, t] of DATA.subDefaults) if (new RegExp(p).test(lab)) return t;
  return lab && !(s.title || "").includes(lab) ? lab : "";
}
function head(L, title, sub, x = 56, width = W - 112, center = false) {
  const [px, n] = L.text([x, 34, width, 120], title, 46, TITLE, true, center ? "c" : "l", "t", 28, 1.2);
  let y = 34 + Math.floor(n * px * 1.2) + 6;
  if (sub) {
    const [spx, sn] = fit(sub, width, 44, 26, true, 18), sw = Math.min(width, tlen(wrap(sub, spx, true, width)[0], spx, true));
    L.highlight(center ? x + (width - sw) / 2 : x, y, sw, spx * 1.2);
    L.text([x, y, width, Math.floor(spx * 1.3 * sn) + 4], sub, spx, SUB, true, center ? "c" : "l", "t", 18);
    y += Math.floor(spx * 1.3 * sn) + 14;
  }
  return y + 10;
}
function cover(s, sizes, topic) {
  const L = new Layout();
  L.blob(W + 30, -40, 260, PINK_BLOB, 160); L.blob(-60, H + 20, 250, BLUE_BLOB, 160); L.blob(-30, 120, 90, PINK_BLOB, 120);
  const pts = s.points || [];
  L.text([80, 40, W - 160, 210], s.title || "", sizes[0] / PX2PT, TITLE_DARK, true, "c", "m", 34, 1.2);
  let y = 258;
  if (pts[0]) {
    const [spx] = fit(pts[0], W - 360, 60, sizes[1] / PX2PT * 0.75, true, 22), sw = Math.min(W - 300, tlen(wrap(pts[0], spx, true, W - 360)[0], spx, true) + 70);
    L.box((W - sw) / 2, y, sw, spx * 1.25 + 22, 22, "#94C4EC", 0.1);
    L.text([(W - sw) / 2, y + 8, sw, spx * 1.25 + 6], pts[0], spx, WHITE, true, "c", "m", 20);
    y += spx * 1.25 + 40;
  }
  const main = mainIcon(s, topic, 0, new Set(["hospital", "nurse"])), cy = (y + H - 120) / 2 + 6;
  L.blob(W / 2, cy + 10, 150, [255, 255, 255], 150);
  L.icon("nurse", W / 2 - 230, cy + 20, 150); L.icon(["nurse", "hospital"].includes(main) ? "bed" : main, W / 2, cy, 210); L.icon("hospital", W / 2 + 230, cy + 20, 150);
  if (pts.length > 1) {
    const by = H - 108, g = L.g, gr = g.createLinearGradient(120, 0, W - 120, 0);
    gr.addColorStop(0, "#F0B2BA"); gr.addColorStop(1, "#A0CCF0");
    L.box(120, by, W - 240, 74, 37, WHITE, 0.12); g.fillStyle = gr; g.beginPath(); g.roundRect(120, by, W - 240, 74, 37); g.fill();
    L.text([150, by + 6, W - 300, 62], pts.slice(1).join("　"), sizes[2] / PX2PT * 0.7, WHITE, true, "c", "m", 18);
  }
  return L;
}
function list(s, idx, topic) {
  const L = new Layout(); decorate(L, idx);
  const pts = (s.points && s.points.length) ? s.points : [""], y0 = head(L, s.title || "", subtitleOf(s), 56, W - 470), used = new Set();
  const main = mainIcon(s, topic, idx, used), cx = W - 230, cy = (y0 + H) / 2 + 10;
  L.blob(cx, cy, 190, [255, 255, 255], 170); L.blob(cx + 40, cy + 50, 120, idx % 2 ? PINK_BLOB : BLUE_BLOB, 140); L.icon(main, cx, cy - 10, 250);
  const side = pts.map((p, i) => pickIcon(p, used, idx + i + 1));
  if (side.length >= 2) { L.icon(side[0], cx - 150, cy - 140, 90); L.icon(side[side.length - 1], cx + 140, cy + 130, 80); }
  const n = pts.length, gap = 14, ph = Math.min(96, (H - 40 - y0 - gap * (n - 1)) / Math.max(n, 1)), pw = W - 520;
  pts.forEach((p, i) => {
    const y = y0 + i * (ph + gap);
    L.box(56, y, pw, ph, Math.min(ph / 2, 30));
    L.num(56 + ph * 0.5, y + ph / 2, Math.min(26, ph * 0.33), i + 1, RAINBOW[i % RAINBOW.length]);
    L.icon(side[i], 56 + ph * 0.5 + 52, y + ph / 2, Math.min(52, ph * 0.62));
    const tx = 56 + ph * 0.5 + 92;
    L.text([tx, y + 6, pw - (tx - 56) - 18, ph - 12], p, 27, INK, true, "l", "m", 16);
  });
  return L;
}
function agenda(s, idx, topic) {
  const L = new Layout(); decorate(L, idx);
  const y0 = head(L, s.title || "", subtitleOf(s)), pts = (s.points || []).slice(0, 6), cx = W / 2, cy = (y0 + H) / 2 + 10, rx = 330, ry = (H - y0) / 2 - 46;
  const g = L.g; g.fillStyle = "#C8D2E6";
  for (let a = 0; a < 360; a += 6) { const t = a * Math.PI / 180; g.beginPath(); g.arc(cx + rx * Math.cos(t), cy + ry * Math.sin(t), 2, 0, 7); g.fill(); }
  const used = new Set(); L.blob(cx, cy, 120, [255, 255, 255], 200); L.icon(mainIcon(s, topic, idx, used), cx, cy, 190);
  const n = Math.max(pts.length, 1);
  pts.forEach((p, i) => {
    const ang = (-90 + 360 * i / n) * Math.PI / 180, px = cx + rx * Math.cos(ang), py = cy + ry * Math.sin(ang), bw = 400, bh = 74;
    let bx = Math.cos(ang) >= -0.01 ? px + 20 : px - bw - 20;
    if (Math.abs(Math.cos(ang)) < 0.2) bx = px - bw / 2;
    bx = Math.max(24, Math.min(W - bw - 24, bx)); const by = py - bh / 2;
    L.box(bx, by, bw, bh, 31); L.num(bx + 32, by + bh / 2, 24, i + 1, RAINBOW[i % 6]); L.icon(pickIcon(p, used, i), bx + 86, by + bh / 2, 46);
    L.text([bx + 116, by + 6, bw - 130, bh - 12], p, 24, INK, true, "l", "m", 15);
  });
  return L;
}
export function splitPair(p) {
  const t = p.trim().replace(/^[✗×xX✘]\s*/, ""), m = t.split(/\s*(?:→|->|⇒)\s*/);
  if (m.length >= 2) return [m[0].replace(/^(錯誤|錯)[：:]\s*/, "").trim(), m.slice(1).join("→").replace(/^[✓○✔]\s*|^(正確|對)[：:]\s*/, "").trim()];
  return null;
}
function compare(s, idx, topic) {
  const L = new Layout(), pairs = [], others = [];
  for (const p of s.points || []) { const sp = splitPair(p); sp ? pairs.push(sp) : others.push(p); }
  const g = L.g;
  for (const [x0, c1, c2] of [[0, "#ECC4B8", "#E29690"], [W / 2, "#CCE8D0", "#E2D6BE"]]) {
    const gr = g.createLinearGradient(x0, 0, x0 + W / 2, 0); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(x0, 0, W / 2, H);
  }
  const y0 = head(L, s.title || "", subtitleOf(s) || "找出錯誤，馬上改正");
  L.icon("cross", W / 4, y0 + 40, 90); L.icon("check", W * 3 / 4, y0 + 40, 90);
  const rows = pairs.length ? pairs : others.map((p) => [p, ""]), n = Math.max(rows.length, 1), top = y0 + 100;
  const bottom = H - (others.length && pairs.length ? 96 : 30), rh = Math.min(100, (bottom - top) / n), used = new Set();
  rows.forEach(([w, r], i) => {
    const y = top + i * rh;
    for (const [x0, txt, mark, col] of [[40, w, "cross", "#C43C3C"], [W / 2 + 40, r, "check", "#288246"]]) {
      if (!txt) continue;
      L.box(x0, y + 6, W / 2 - 80, rh - 14, 22, "rgba(255,255,255,0.9)", 0.1);
      L.icon(mark === "check" ? pickIcon(txt, used, i) : mark, x0 + 40, y + rh / 2 - 1, Math.min(46, rh * 0.5));
      L.text([x0 + 76, y + 10, W / 2 - 170, rh - 22], txt, 24, col, true, "l", "m", 14);
    }
  });
  if (others.length && pairs.length) {
    L.box(40, H - 86, W - 80, 64, 32, "#FFF6E6", 0.12); L.icon("megaphone", 90, H - 54, 54);
    L.text([130, H - 80, W - 200, 52], others.join("　"), 24, "#964628", true, "l", "m", 14);
  }
  return L;
}
function terms(s, idx) {
  const L = new Layout(); decorate(L, idx);
  const y0 = head(L, s.title || "", subtitleOf(s) || "聽得懂，做得對", 56, W - 112, true), pts = (s.points || []).slice(0, 8), n = Math.max(pts.length, 1);
  const cols = n > 3 ? 2 : 1, rows = Math.ceil(n / cols), cw = (W - 120 - 30 * (cols - 1)) / cols, ch = Math.min(120, (H - 30 - y0 - 16 * (rows - 1)) / rows), used = new Set();
  pts.forEach((p, i) => {
    const r = Math.floor(i / cols), c = i % cols, x = 60 + c * (cw + 30), y = y0 + r * (ch + 16), [term, ...rest] = p.split("：");
    L.box(x, y, cw, ch, 24); L.icon(pickIcon(term, used, i), x + ch * 0.45, y + ch / 2, ch * 0.6);
    L.text([x + ch * 0.9, y + 8, cw - ch, ch * 0.42], term, 30, TITLE, true, "l", "m", 16);
    L.text([x + ch * 0.9, y + ch * 0.46, cw - ch - 16, ch * 0.5], rest.join("：").replaceAll("｜", "  ·  "), 19, SUB, false, "l", "t", 12);
  });
  return L;
}
function summary(s, idx) {
  const L = new Layout(); decorate(L, idx);
  const y0 = head(L, s.title || "", subtitleOf(s) || "每一次都不能忘記的事", 56, W - 112, true);
  for (let i = 0; i < 4; i++) L.icon("star", W / 2 - 165 + i * 110, y0 + 46, 84);
  const pts = (s.points || []).slice(0, 6), n = Math.max(pts.length, 1), cols = n > 2 ? 2 : 1, rows = Math.ceil(n / cols), top = y0 + 108;
  const cw = (W - 120 - 30 * (cols - 1)) / cols, ch = Math.min(110, (H - 30 - top - 16 * (rows - 1)) / rows), used = new Set(["star"]);
  const tints = ["#FDE8E8", "#E2EEFA", "#E8F6E8", "#FCF4DE"];
  pts.forEach((p, i) => {
    const r = Math.floor(i / cols), c = i % cols, x = 60 + c * (cw + 30), y = top + r * (ch + 16);
    L.box(x, y, cw, ch, 26, tints[i % 4], 0.1); L.icon(pickIcon(p, used, i), x + 52, y + ch / 2, Math.min(70, ch * 0.7));
    L.text([x + 100, y + 8, cw - 120, ch - 16], p, 24, INK, true, "l", "m", 14);
  });
  return L;
}
function thanks(s) {
  const L = new Layout();
  L.blob(W + 30, -40, 260, PINK_BLOB, 170); L.blob(-60, H + 20, 250, BLUE_BLOB, 170);
  L.text([80, 50, W - 160, 90], s.title || "感謝聆聽", 58, TITLE_DARK, true, "c", "m", 30);
  L.text([80, 140, W - 160, 40], subtitleOf(s) || "大家一起來複習", 26, SUB, true, "c", "m", 16);
  const used = new Set(), g = L.g;
  (s.points || []).slice(0, 5).forEach((p, i) => {
    const bw = 620, x = W / 2 - bw / 2 + (i % 2 === 0 ? -80 : 80), y = 200 + i * 92, col = i % 2 === 0 ? "#FAD6D8" : "#C8E0F6";
    L.box(x, y, bw, 72, 24, col, 0.1);
    g.fillStyle = col; g.beginPath();
    if (i % 2 === 0) { g.moveTo(x + 40, y + 70); g.lineTo(x + 70, y + 70); g.lineTo(x + 34, y + 92); } else { g.moveTo(x + bw - 40, y + 70); g.lineTo(x + bw - 70, y + 70); g.lineTo(x + bw - 34, y + 92); }
    g.fill();
    L.icon(pickIcon(p, used, i), x + 40, y + 36, 44); L.text([x + 74, y + 8, bw - 96, 56], p, 22, INK, true, "l", "m", 13);
  });
  L.icon("nurse", 130, H - 110, 170); L.icon("wave", 260, H - 190, 80); L.icon("question", W - 140, H - 120, 150); L.icon("bulb", W - 270, 230, 70);
  return L;
}
export function layoutFor(s, idx, total, topic = "", sizes = [45, 40, 32]) {
  const lab = (s.label || "") + " " + (s.title || ""), pts = s.points || [];
  if (s.kind === "cover" || idx === 0) return cover(s, sizes, topic);
  if (idx === total - 1 && /感謝|問答|Q&A/.test(lab)) return thanks(s);
  if (/關鍵詞|母語|詞彙/.test(lab)) return terms(s, idx);
  if (/錯誤|正確做法/.test(lab) || (pts.length && pts.filter((p) => splitPair(p)).length >= Math.max(2, Math.floor(pts.length / 2)))) return compare(s, idx, topic);
  if (/破題|議程|大綱|今天/.test(lab) && pts.length >= 3 && pts.length <= 6) return agenda(s, idx, topic);
  if (/總結|回顧|重點整理|行動呼籲/.test(lab)) return summary(s, idx);
  return list(s, idx, topic);
}
export { Layout };
