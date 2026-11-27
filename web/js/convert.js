/* 編輯器轉檔引擎（x2t）不支援的格式，由這裡自己轉：
 *  CSV  ⇄ XLSX（SheetJS）
 *  HTML／EPUB／FB2 → 先開空白文件再貼上 HTML；存回時用編輯器的 GetFileHTML 產生 HTML，再包成 EPUB／FB2
 *  ZIP 讀（DecompressionStream deflate-raw）與寫（不壓縮＋CRC32），給 EPUB 用 */
(function () {
  const C = (window.ZOConvert = {});
  const enc = new TextEncoder();
  const dec = (b) => new TextDecoder('utf-8').decode(b);

  // ---------------------------------------------------------------- CSV
  C.csvToXlsx = function (buf) {
    let text = dec(new Uint8Array(buf));
    if (text.indexOf('�') >= 0) {                    // 不是 UTF-8 → 試 Big5（舊版 Excel 存的 CSV）
      try { text = new TextDecoder('big5').decode(new Uint8Array(buf)); } catch (e) { /* */ }
    }
    const wb = XLSX.read(text.replace(/^﻿/, ''), { type: 'string', raw: true, codepage: 65001 });
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  };
  C.xlsxToCsv = function (buf, sheetIndex) {
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    const name = wb.SheetNames[sheetIndex || 0];
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    return { bytes: enc.encode('﻿' + csv), sheets: wb.SheetNames };   // 加 BOM：Excel 開才不會亂碼
  };

  // ---------------------------------------------------------------- ZIP
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u) { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  C.zipWrite = function (files) {          // files: [[name, Uint8Array|string]] → Uint8Array（不壓縮）
    const parts = [], central = [];
    let off = 0;
    for (const [name, data0] of files) {
      const data = typeof data0 === 'string' ? enc.encode(data0) : data0;
      const nm = enc.encode(name), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(lh.buffer), nm, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true);
      ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nm);
      off += 30 + nm.length + data.length;
    }
    const csize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, off, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]);
    const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
    let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  };
  C.zipRead = async function (buf) {        // → {name: Uint8Array}
    const u = new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let e = u.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('不是 ZIP 檔');
    const n = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const out = {};
    for (let i = 0; i < n; i++) {
      const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = dec(u.subarray(p + 46, p + 46 + nl));
      const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      const raw = u.subarray(ds, ds + csz);
      if (method === 0) out[name] = raw;
      else if (method === 8) out[name] = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      p += 46 + nl + el + cl;
    }
    return out;
  };

  // ---------------------------------------------------------------- HTML 讀入（文字編碼、MHT 也當 HTML）
  C.decodeHtml = function (buf) {
    const u = new Uint8Array(buf);
    let s = dec(u);
    const m = s.slice(0, 2048).match(/charset=["']?([\w-]+)/i);
    if (m && !/utf-?8/i.test(m[1])) { try { s = new TextDecoder(m[1]).decode(u); } catch (e) { /* */ } }
    return s;
  };

  // ---------------------------------------------------------------- 純文字讀入（UTF-8／UTF-16／Big5）→ HTML 段落
  C.decodeText = function (buf) {
    const u = new Uint8Array(buf);
    if (u[0] === 0xff && u[1] === 0xfe) return new TextDecoder('utf-16le').decode(u.subarray(2));
    if (u[0] === 0xfe && u[1] === 0xff) return new TextDecoder('utf-16be').decode(u.subarray(2));
    let s = new TextDecoder('utf-8').decode(u);
    if (s.indexOf('\uFFFD') >= 0) { try { s = new TextDecoder('big5').decode(u); } catch (e) { /* */ } }
    return s.replace(/^\uFEFF/, '');
  };
  C.textToHtml = function (buf) {
    const esc = (x) => x.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])).replace(/\t/g, '&emsp;').replace(/  /g, ' &nbsp;');
    return '<html><body>' + C.decodeText(buf).replace(/\r\n?/g, '\n').split('\n').map((l) => '<p>' + (esc(l) || '&nbsp;') + '</p>').join('') + '</body></html>';
  };

  // RTF：大於 32767 的字元在 RTF 裡寫成負數（\u-29497），編輯器讀的時候會漏字 → 先改成正數
  C.fixRtf = function (buf) {
    const u = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    s = s.replace(/\\u-(\d+)/g, (m, n) => '\\u' + (65536 - +n));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out.buffer;
  };
  // 文件 HTML → 純文字（段落一行、表格用 Tab 分隔），UTF-8 加 BOM（Windows 記事本與 Excel 都認得）
  C.htmlToText = function (html) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    const lines = [];
    const walk = (el) => {
      for (const c of el.children) {
        const tg = c.tagName;
        if (tg === 'TABLE') { c.querySelectorAll('tr').forEach((tr) => lines.push(Array.from(tr.children).map((td) => td.textContent.replace(/\s+/g, ' ').trim()).join('\t'))); }
        else if (/^(P|H[1-6]|LI|PRE|BLOCKQUOTE)$/.test(tg)) lines.push(c.textContent.replace(/ /g, ' ').replace(/\r?\n/g, ' ').trimEnd());
        else if (c.children.length) walk(c);
        else if (c.textContent.trim()) lines.push(c.textContent.trim());
      }
    };
    walk(d.body);
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return enc.encode('﻿' + lines.join('\r\n') + '\r\n');
  };

  // ---------------------------------------------------------------- EPUB 讀入 → 一份 HTML（圖片轉 data: 網址）
  C.epubToHtml = async function (buf) {
    const z = await C.zipRead(buf);
    const container = dec(z['META-INF/container.xml'] || new Uint8Array());
    const opfPath = (container.match(/full-path="([^"]+)"/) || [])[1];
    if (!opfPath || !z[opfPath]) throw new Error('EPUB 格式不正確');
    const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
    const opf = new DOMParser().parseFromString(dec(z[opfPath]), 'application/xml');
    const items = {};
    opf.querySelectorAll('manifest > item').forEach((it) => (items[it.getAttribute('id')] = { href: it.getAttribute('href'), type: it.getAttribute('media-type') }));
    const title = (opf.querySelector('metadata title') || {}).textContent || '';
    const resolve = (from, href) => {
      const parts = (from.slice(0, from.lastIndexOf('/') + 1) + href).split('/');
      const outp = [];
      for (const x of parts) { if (x === '..') outp.pop(); else if (x && x !== '.') outp.push(x); }
      return decodeURIComponent(outp.join('/'));
    };
    const mime = (n) => (/\.png$/i.test(n) ? 'image/png' : /\.gif$/i.test(n) ? 'image/gif' : /\.svg$/i.test(n) ? 'image/svg+xml' : /\.webp$/i.test(n) ? 'image/webp' : 'image/jpeg');
    const toData = (u8, type) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return 'data:' + type + ';base64,' + btoa(s); };
    let body = title ? '<h1>' + title.replace(/</g, '&lt;') + '</h1>' : '';
    for (const ref of opf.querySelectorAll('spine > itemref')) {
      const it = items[ref.getAttribute('idref')];
      if (!it) continue;
      const path = base + it.href;
      const raw = z[decodeURIComponent(path)] || z[path];
      if (!raw) continue;
      const doc = new DOMParser().parseFromString(dec(raw), 'text/html');
      doc.querySelectorAll('img[src], image').forEach((img) => {
        const src = img.getAttribute('src') || img.getAttribute('xlink:href') || img.getAttribute('href');
        const p = src && resolve(path, src);
        if (p && z[p]) img.setAttribute('src', toData(z[p], mime(p)));
      });
      body += doc.body ? doc.body.innerHTML : '';
    }
    return { html: '<html><body>' + body + '</body></html>', title };
  };

  // ---------------------------------------------------------------- FB2 讀入
  C.fb2ToHtml = function (buf) {
    const x = new DOMParser().parseFromString(C.decodeHtml(buf), 'application/xml');
    const bins = {};
    x.querySelectorAll('binary').forEach((b) => (bins[b.getAttribute('id')] = 'data:' + (b.getAttribute('content-type') || 'image/jpeg') + ';base64,' + b.textContent.replace(/\s/g, '')));
    const walk = (n) => {
      let out = '';
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { out += c.textContent.replace(/[<&]/g, (m) => (m === '<' ? '&lt;' : '&amp;')); continue; }
        if (c.nodeType !== 1) continue;
        const tg = c.localName;
        if (tg === 'title') out += '<h2>' + walk(c) + '</h2>';
        else if (tg === 'p') out += '<p>' + walk(c) + '</p>';
        else if (tg === 'emphasis') out += '<i>' + walk(c) + '</i>';
        else if (tg === 'strong') out += '<b>' + walk(c) + '</b>';
        else if (tg === 'empty-line') out += '<p>&nbsp;</p>';
        else if (tg === 'image') { const id = (c.getAttribute('l:href') || c.getAttribute('xlink:href') || c.getAttribute('href') || '').replace('#', ''); if (bins[id]) out += '<p><img src="' + bins[id] + '"></p>'; }
        else if (tg !== 'binary' && tg !== 'description') out += walk(c);
      }
      return out;
    };
    const title = (x.querySelector('book-title') || {}).textContent || '';
    return { html: '<html><body>' + (title ? '<h1>' + title + '</h1>' : '') + walk(x.querySelector('body') || x) + '</body></html>', title };
  };

  // ---------------------------------------------------------------- 存回：HTML → EPUB／FB2
  function xhtml(html) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('script').forEach((s) => s.remove());
    return new XMLSerializer().serializeToString(d.body).replace(/^<body[^>]*>|<\/body>$/g, '');
  }
  C.htmlPage = (html, title) => /<html[\s>]/i.test(html) ? html
    : '<!doctype html>\n<html><head><meta charset="utf-8"><title>' + (title || '').replace(/</g, '&lt;') + '</title></head><body>\n' + html + '\n</body></html>';
  C.htmlToEpub = function (html, title, lang) {
    const id = 'urn:uuid:' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    const esc = (s) => String(s || '').replace(/[<&"]/g, (m) => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[m]));
    const body = xhtml(html);
    const page = '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="' + (lang || 'zh-TW') + '"><head><meta charset="utf-8"/><title>' + esc(title) + '</title></head><body>' + body + '</body></html>';
    const nav = '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><meta charset="utf-8"/><title>' + esc(title) + '</title></head><body><nav epub:type="toc"><ol><li><a href="content.xhtml">' + esc(title) + '</a></li></ol></nav></body></html>';
    const opf = '<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bid">' + id + '</dc:identifier><dc:title>' + esc(title) + '</dc:title><dc:language>' + (lang || 'zh-TW') + '</dc:language><meta property="dcterms:modified">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="content.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>';
    return C.zipWrite([['mimetype', 'application/epub+zip'],
      ['META-INF/container.xml', '<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
      ['OEBPS/content.opf', opf], ['OEBPS/nav.xhtml', nav], ['OEBPS/content.xhtml', page]]);
  };
  C.htmlToFb2 = function (html, title, lang) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    const esc = (s) => String(s || '').replace(/[<&]/g, (m) => (m === '<' ? '&lt;' : '&amp;'));
    let sec = '';
    d.body.querySelectorAll('h1,h2,h3,h4,p,li,td').forEach((el) => {
      if (el.closest('li,td') && el.closest('li,td') !== el) return;
      const tx = el.textContent.trim();
      if (!tx) return;
      sec += /^H\d/.test(el.tagName) ? '<title><p>' + esc(tx) + '</p></title>' : '<p>' + esc(tx) + '</p>';
    });
    return enc.encode('<?xml version="1.0" encoding="utf-8"?>\n<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>' + esc(title) + '</book-title><lang>' + (lang || 'zh') + '</lang></title-info></description><body><section>' + sec + '</section></body></FictionBook>');
  };
})();
