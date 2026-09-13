/**
 * Renders content.mjs into a single self-contained RTL HTML file.
 *
 * The page is laid out as real A4 pages by a small script that runs inside the
 * document: blocks are flowed into fixed-height page boxes, so the table of
 * contents can carry exact page numbers and headings never break awkwardly.
 * Chrome then prints one HTML page box per PDF page.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { meta, blocks } from '../content.mjs'
import { inlineHtml, inlineText } from './inline.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SHOTS = path.join(ROOT, 'screenshots-print')
const FONTS = path.join(__dirname, 'fonts')

const fontFace = (weight) => {
  const file = path.join(FONTS, `Tajawal-${weight}.ttf`)
  const b64 = fs.readFileSync(file).toString('base64')
  return `@font-face{font-family:'Tajawal';font-style:normal;font-weight:${weight};src:url(data:font/ttf;base64,${b64}) format('truetype');}`
}

// Figures are authored as .png (the capture name); prep-images.mjs emits the
// print-ready .jpg next to it. Accept either.
const imgData = (name) => {
  for (const [file, mime] of [
    [name.replace(/\.png$/, '.jpg'), 'image/jpeg'],
    [name, 'image/png'],
  ]) {
    const p = path.join(SHOTS, file)
    if (fs.existsSync(p)) return `data:${mime};base64,` + fs.readFileSync(p).toString('base64')
  }
  return null
}

const missing = []
let figureNo = 0
const stripFigNo = (c) => String(c).replace(/^\s*الشكل\s+\d+\s*—\s*/, '')

function renderBlock(b) {
  switch (b.t) {
    case 'cover':
      return `<section class="cover-block">
        <div class="cover-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
          </svg>
        </div>
        <h1 class="cover-title">${esc(meta.title)}</h1>
        <p class="cover-sub">${esc(meta.subtitle)}</p>
        <div class="cover-rule"></div>
        <p class="cover-meta">${esc(meta.date)}</p>
        <p class="cover-note">كل الصور في هذا الدليل مأخوذة من المنصة مباشرةً.<br/>الأسماء والأرقام والصور الشخصية الظاهرة فيها بيانات تجريبية غير حقيقية.</p>
      </section>`

    case 'toc':
      return `<section class="toc-block" data-toc="1"></section>`

    case 'part':
      return `<section class="part-block">
        <span class="part-kicker">${esc(b.text)}</span>
        <h1 class="part-title">${esc(b.sub)}</h1>
      </section>`

    case 'h1':
      return `<h1 class="h1" id="${b.id || ''}" data-toc-level="1" data-toc-text="${esc(inlineText(b.text))}">${inlineHtml(b.text)}</h1>`

    case 'h2':
      return `<h2 class="h2" data-toc-level="2" data-toc-text="${esc(inlineText(b.text))}">${inlineHtml(b.text)}</h2>`

    case 'p':
      return `<p class="para">${inlineHtml(b.text)}</p>`

    case 'ul':
      return `<ul class="list">${b.items.map((i) => `<li>${inlineHtml(i)}</li>`).join('')}</ul>`

    case 'ol':
      return `<ol class="list list-num">${b.items.map((i) => `<li>${inlineHtml(i)}</li>`).join('')}</ol>`

    case 'steps':
      return `<div class="steps">${b.items
        .map(
          (s) => `<div class="step"><div class="step-badge">${esc(s.title)}</div>
            <div class="step-body">${inlineHtml(s.text)}</div></div>`
        )
        .join('')}</div>`

    case 'callout': {
      const icon = b.kind === 'tip' ? '💡' : b.kind === 'warn' ? '⚠️' : 'ℹ️'
      return `<div class="callout callout-${b.kind}">
        <div class="callout-head"><span class="callout-icon">${icon}</span><span>${esc(b.title)}</span></div>
        <div class="callout-body">${inlineHtml(b.text)}</div>
      </div>`
    }

    case 'table':
      return `<table class="tbl"><thead><tr>${b.head
        .map((h) => `<th>${inlineHtml(h)}</th>`)
        .join('')}</tr></thead><tbody>${b.rows
        .map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`

    case 'figure': {
      const data = imgData(b.src)
      if (!data) {
        missing.push(b.src)
        return ''
      }
      // Figures are numbered at render time, so a caption can never drift out
      // of sync when a screenshot is added or dropped.
      figureNo++
      const cap = `الشكل ${figureNo} — ${stripFigNo(b.caption)}`
      return `<figure class="fig">
        <div class="fig-frame"><img src="${data}" alt="${esc(cap)}"/></div>
        <figcaption>${esc(cap)}</figcaption>
      </figure>`
    }

    case 'pagebreak':
      return `<div class="forced-break"></div>`

    default:
      return ''
  }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const body = blocks.map(renderBlock).join('\n')

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>${esc(meta.title)}</title>
<style>
${[400, 500, 700, 800].map(fontFace).join('\n')}

:root{
  --ink:#111827; --muted:#4b5563; --faint:#6b7280;
  --line:#e5e7eb; --brand:#5b21b6; --brand-soft:#f5f3ff;
  --page-w:210mm; --page-h:297mm;
  --pad-x:17mm; --pad-top:18mm; --pad-bottom:16mm;
}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;background:#8a8f98;}
body{
  font-family:'Tajawal',sans-serif; color:var(--ink);
  direction:rtl; text-align:right;
  font-size:10.6pt; line-height:1.85;
  -webkit-font-smoothing:antialiased;
}

/* ── page boxes ── */
.page{
  width:var(--page-w); height:var(--page-h);
  background:#fff; margin:0 auto 8mm; position:relative;
  padding:var(--pad-top) var(--pad-x) var(--pad-bottom);
  overflow:hidden; display:block;
}
/* 3mm shorter than the page box: a cushion so a block that settles a pixel
   or two after the embedded fonts load cannot spill past the page edge. */
.page-inner{height:calc(100% - 3mm); overflow:hidden;}
.page-foot{
  position:absolute; left:var(--pad-x); right:var(--pad-x); bottom:8mm;
  display:flex; justify-content:space-between; align-items:center;
  font-size:8pt; color:var(--faint); border-top:0.6pt solid var(--line);
  padding-top:2.5mm;
}
.page-foot .pf-num{direction:ltr; font-variant-numeric:tabular-nums;}
.page.is-plain .page-foot{display:none;}

@media print{
  html,body{background:#fff;}
  .page{margin:0; box-shadow:none; break-after:page; page-break-after:always;}
  .page:last-child{break-after:auto; page-break-after:auto;}
}

/* ── cover ── */
.cover-block{
  height:100%; display:flex; flex-direction:column; align-items:center;
  justify-content:center; text-align:center; gap:0;
}
.cover-mark{color:var(--brand); margin-bottom:10mm;}
.cover-title{font-size:34pt; font-weight:800; margin:0 0 4mm; color:var(--ink); line-height:1.35;}
.cover-sub{font-size:14pt; font-weight:500; color:var(--muted); margin:0;}
.cover-rule{width:38mm; height:1.6mm; background:var(--brand); border-radius:2mm; margin:9mm 0;}
.cover-meta{font-size:11pt; color:var(--faint); margin:0 0 22mm;}
.cover-note{font-size:9pt; color:var(--faint); line-height:2; margin:0; max-width:120mm;}

/* ── part divider ── */
.part-block{
  height:100%; display:flex; flex-direction:column;
  align-items:center; justify-content:center; text-align:center;
}
.part-kicker{
  font-size:11pt; font-weight:700; color:var(--brand);
  letter-spacing:.5px; margin-bottom:5mm;
  border:1.2pt solid var(--brand); border-radius:99px; padding:2mm 8mm;
}
.part-title{font-size:26pt; font-weight:800; margin:0; color:var(--ink);}

/* ── headings ── */
.h1{
  font-size:17pt; font-weight:800; color:var(--ink);
  margin:0 0 4mm; padding:0 4mm 0 0; border-right:2.4mm solid var(--brand);
  line-height:1.5;
}
.h2{
  font-size:12.6pt; font-weight:700; color:var(--brand);
  margin:6mm 0 2.5mm; line-height:1.6;
}
.para{margin:0 0 3mm;}
strong{font-weight:700;}
.uilabel{font-weight:700; color:var(--brand);}
.ltr{
  direction:ltr; unicode-bidi:isolate; display:inline-block;
  font-variant-numeric:tabular-nums;
}

/* ── lists ── */
.list{margin:0 0 3.5mm; padding-right:6mm;}
.list li{margin-bottom:1.6mm;}
.list-num{list-style:arabic-indic;}
ul.list{list-style:disc;}
ul.list::marker,.list li::marker{color:var(--brand);}

/* ── steps ── */
.steps{margin:0 0 4mm; display:flex; flex-direction:column; gap:2.4mm;}
.step{display:flex; gap:3mm; align-items:flex-start;}
.step-badge{
  flex:0 0 auto; background:var(--brand-soft); color:var(--brand);
  border:0.8pt solid #ddd6fe; border-radius:2mm;
  font-size:8.6pt; font-weight:700; padding:1mm 3mm; white-space:nowrap;
  margin-top:0.7mm;
}
.step-body{flex:1 1 auto;}

/* ── callouts ── */
.callout{
  border-radius:2.4mm; padding:3mm 4mm; margin:0 0 4mm;
  border:0.8pt solid var(--line); border-right-width:2mm;
  background:#f9fafb; page-break-inside:avoid; break-inside:avoid;
}
.callout-head{font-weight:700; font-size:10.4pt; margin-bottom:1.2mm; display:flex; gap:2mm; align-items:center;}
.callout-icon{font-size:11pt;}
.callout-body{font-size:10pt; line-height:1.8; color:var(--muted);}
.callout-tip{background:#f0fdf4; border-color:#bbf7d0; border-right-color:#16a34a;}
.callout-tip .callout-head{color:#15803d;}
.callout-warn{background:#fffbeb; border-color:#fde68a; border-right-color:#d97706;}
.callout-warn .callout-head{color:#b45309;}
.callout-note{background:#eff6ff; border-color:#bfdbfe; border-right-color:#2563eb;}
.callout-note .callout-head{color:#1d4ed8;}

/* ── tables ── */
.tbl{
  width:100%; border-collapse:collapse; margin:0 0 4mm;
  direction:rtl; font-size:9.8pt; table-layout:fixed;
}
.tbl th,.tbl td{
  border:0.6pt solid var(--line); padding:2mm 2.6mm;
  text-align:right; vertical-align:top; line-height:1.7;
  word-wrap:break-word; overflow-wrap:break-word;
}
.tbl th{background:var(--brand-soft); color:var(--brand); font-weight:700;}
.tbl tbody tr:nth-child(even){background:#fafafa;}

/* ── figures ── */
.fig{margin:0 0 4mm; text-align:center; page-break-inside:avoid; break-inside:avoid;}
.fig-frame{
  display:inline-block; border:0.8pt solid var(--line); border-radius:2.4mm;
  padding:2mm; background:#fff; max-width:100%;
}
.fig-frame img{display:block; max-width:100%; max-height:136mm; width:auto; height:auto;}
.fig figcaption{font-size:8.8pt; color:var(--faint); margin-top:1.6mm;}

/* ── table of contents ── */

.toc-title{font-size:19pt; font-weight:800; margin:0 0 6mm; color:var(--ink);}
.toc-row{
  display:flex; align-items:baseline; gap:2mm;
  font-size:10.4pt; margin-bottom:1.6mm; line-height:1.8;
}
.toc-row.lvl-2{padding-right:6mm; font-size:9.8pt; color:var(--muted);}
.toc-row.lvl-part{margin-top:4mm; font-weight:800; color:var(--brand); font-size:11pt;}
.toc-txt{flex:0 0 auto;}
.toc-dots{
  flex:1 1 auto; border-bottom:0.7pt dotted #cbd5e1;
  transform:translateY(-1mm); min-width:6mm;
}
.toc-pg{flex:0 0 auto; direction:ltr; font-variant-numeric:tabular-nums; font-weight:700;}

.forced-break{display:block;}
#flow{display:none;}
</style>
</head>
<body>
<div id="flow">
${body}
</div>
<div id="pages"></div>

<script>
/* Lay the flow out into real A4 page boxes.
   Blocks are placed whole; a block that does not fit starts a new page.
   Tables split by row and keep their header on each page. */
(function () {
  var FOOT = ${JSON.stringify(meta.footer)};
  var flow = document.getElementById('flow');
  var out  = document.getElementById('pages');
  var nodes = Array.prototype.slice.call(flow.children);

  var page = null, inner = null, pages = [];

  function newPage(plain) {
    page = document.createElement('div');
    page.className = 'page' + (plain ? ' is-plain' : '');
    inner = document.createElement('div');
    inner.className = 'page-inner';
    page.appendChild(inner);
    var foot = document.createElement('div');
    foot.className = 'page-foot';
    foot.innerHTML = '<span class="pf-txt"></span><span class="pf-num"></span>';
    page.appendChild(foot);
    out.appendChild(page);
    pages.push(page);
    return page;
  }

  // scrollHeight never reports less than clientHeight, so the fit test has to
  // be an exact comparison. The safety cushion lives in the CSS height of
  // .page-inner instead, where it actually reserves space.
  function fits() { return inner.scrollHeight <= inner.clientHeight; }

  function placeTable(tbl) {
    var head = tbl.querySelector('thead');
    var rows = Array.prototype.slice.call(tbl.querySelectorAll('tbody > tr'));
    var cur = null;
    function startChunk() {
      cur = document.createElement('table');
      cur.className = tbl.className;
      if (head) cur.appendChild(head.cloneNode(true));
      cur.appendChild(document.createElement('tbody'));
      inner.appendChild(cur);
    }
    startChunk();
    for (var i = 0; i < rows.length; i++) {
      cur.querySelector('tbody').appendChild(rows[i]);
      if (!fits()) {
        cur.querySelector('tbody').removeChild(rows[i]);
        if (!cur.querySelector('tbody').children.length) cur.remove();
        newPage(false);
        startChunk();
        cur.querySelector('tbody').appendChild(rows[i]);
      }
    }
  }

  function placeList(list) {
    var items = Array.prototype.slice.call(list.children);
    var cur = document.createElement(list.tagName);
    cur.className = list.className;
    inner.appendChild(cur);
    for (var i = 0; i < items.length; i++) {
      cur.appendChild(items[i]);
      if (!fits()) {
        cur.removeChild(items[i]);
        if (!cur.children.length) cur.remove();
        newPage(false);
        cur = document.createElement(list.tagName);
        cur.className = list.className;
        inner.appendChild(cur);
        cur.appendChild(items[i]);
      }
    }
  }

  newPage(true); // cover

  for (var n = 0; n < nodes.length; n++) {
    var node = nodes[n];

    if (node.classList.contains('forced-break')) { newPage(false); continue; }

    if (node.classList.contains('cover-block')) { inner.appendChild(node); continue; }

    if (node.dataset && node.dataset.toc === '1') {
      newPage(true);
      node.dataset.pageIndex = pages.length - 1;
      inner.appendChild(node);
      // The contents is rendered after pagination, so it measures as empty
      // here. Start a fresh page for the body, otherwise the first chapter
      // would share the contents page and be pushed off it later.
      newPage(false);
      continue;
    }

    if (node.classList.contains('part-block')) { newPage(true); inner.appendChild(node); continue; }

    // A heading must never be the last thing on a page.
    if (node.classList.contains('h1') || node.classList.contains('h2')) {
      inner.appendChild(node);
      if (!fits()) { inner.removeChild(node); newPage(false); inner.appendChild(node); }
      var nxt = nodes[n + 1];
      if (nxt && !nxt.classList.contains('forced-break')) {
        var probe = nxt.cloneNode(true);
        inner.appendChild(probe);
        var ok = fits();
        inner.removeChild(probe);
        if (!ok) { inner.removeChild(node); newPage(false); inner.appendChild(node); }
      }
      node.dataset.pageIndex = pages.length - 1;
      continue;
    }

    if (node.tagName === 'TABLE') { placeTable(node); continue; }
    if (node.tagName === 'UL' || node.tagName === 'OL') { placeList(node); continue; }

    inner.appendChild(node);
    if (!fits()) {
      // A figure is the usual cause of a half-empty page: it is placed whole,
      // so one that misses the remaining space by a little pushes itself — and
      // the gap it leaves behind — onto the next page. Try shrinking it into
      // the space that is actually left before giving up on this page. The
      // floor keeps it readable; below that it really does belong overleaf.
      var img = node.classList && node.classList.contains('fig')
        ? node.querySelector('img') : null;
      var rescued = false;
      if (img) {
        var capH = node.offsetHeight - img.offsetHeight;         // caption + frame
        var room = inner.clientHeight - (inner.scrollHeight - node.offsetHeight);
        var avail = room - capH - 10;
        var FLOOR = 250;                                          // ~66mm
        if (avail >= FLOOR) {
          img.style.maxHeight = avail + 'px';
          rescued = fits();
          if (!rescued) img.style.maxHeight = '';
        }
      }
      if (!rescued) {
        inner.removeChild(node);
        newPage(false);
        inner.appendChild(node);
        // Oversized single block (a very tall figure): let it stand alone.
        if (!fits()) { node.style.maxHeight = '100%'; }
      }
    }
  }

  /* ── table of contents, with the real page numbers ── */
  var tocEl = out.querySelector('[data-toc="1"]');
  if (tocEl) {
    var tocPageIndex = parseInt(tocEl.dataset.pageIndex, 10);
    var entries = [];
    Array.prototype.forEach.call(out.querySelectorAll('[data-toc-level]'), function (h) {
      entries.push({
        lvl: h.dataset.tocLevel,
        txt: h.dataset.tocText,
        idx: parseInt(h.dataset.pageIndex, 10),
      });
    });
    Array.prototype.forEach.call(out.querySelectorAll('.part-block'), function (p) {
      var pageEl = p.closest('.page');
      entries.push({
        lvl: 'part',
        txt: p.querySelector('.part-title').textContent,
        idx: pages.indexOf(pageEl),
      });
    });
    entries.sort(function (a, b) { return a.idx - b.idx; });

    /* The contents may need more than the one page reserved for it. Lay the
       rows out first to find out how many pages it really takes, then add that
       many continuation pages and shift every page number after the contents
       by the number of pages we inserted — so the printed numbers stay exact. */
    var rowHtml = function (e, pageNo) {
      var cls = e.lvl === 'part' ? 'lvl-part' : (e.lvl === '2' ? 'lvl-2' : 'lvl-1');
      return '<div class="toc-row ' + cls + '"><span class="toc-txt">' + e.txt +
             '</span><span class="toc-dots"></span><span class="toc-pg">' + pageNo + '</span></div>';
    };

    function layoutToc(shift) {
      // Remove any continuation pages from a previous pass.
      out.querySelectorAll('.toc-cont').forEach(function (p) {
        var i = pages.indexOf(p);
        if (i > -1) pages.splice(i, 1);
        p.remove();
      });

      var host = tocEl;
      host.innerHTML = '<h1 class="toc-title">المحتويات</h1>';
      var hostInner = host.parentNode;
      var hostPage = pages[tocPageIndex];
      var added = 0;

      for (var i = 0; i < entries.length; i++) {
        var tmp = document.createElement('div');
        tmp.innerHTML = rowHtml(entries[i], entries[i].idx + 1 + shift);
        var row = tmp.firstChild;
        host.appendChild(row);
        // Geometric test: scrollHeight ignores the last child's bottom margin
        // inside an overflow:hidden box, which is exactly the few pixels that
        // were spilling. Comparing rectangles cannot miss them.
        var rowBottom = row.getBoundingClientRect().bottom;
        var pageBottom = hostInner.getBoundingClientRect().bottom;
        if (rowBottom > pageBottom - 10) {
          host.removeChild(row);
          // Start a continuation page immediately after the current one.
          var p = document.createElement('div');
          p.className = 'page is-plain toc-cont';
          var inner2 = document.createElement('div');
          inner2.className = 'page-inner';
          p.appendChild(inner2);
          var foot = document.createElement('div');
          foot.className = 'page-foot';
          foot.innerHTML = '<span class="pf-txt"></span><span class="pf-num"></span>';
          p.appendChild(foot);
          hostPage.parentNode.insertBefore(p, hostPage.nextSibling);
          pages.splice(pages.indexOf(hostPage) + 1, 0, p);
          added++;

          host = document.createElement('div');
          host.className = 'toc-block';
          inner2.appendChild(host);
          hostInner = inner2;
          hostPage = p;
          host.appendChild(row);
        }
      }
      return added;
    }

    // First pass finds the true height; second pass writes the corrected
    // numbers. One extra pass covers the rare case where the shift pushes a
    // number to an extra digit and changes the row count.
    var shift = layoutToc(0);
    for (var pass = 0; pass < 3; pass++) {
      var next = layoutToc(shift);
      if (next === shift) break;
      shift = next;
    }
  }

  /* ── footers ── */
  pages.forEach(function (p, i) {
    var num = p.querySelector('.pf-num');
    var txt = p.querySelector('.pf-txt');
    if (num) num.textContent = String(i + 1);
    if (txt) txt.textContent = FOOT;
  });

  flow.remove();
  document.documentElement.setAttribute('data-ready', 'true');
  window.__PAGE_COUNT__ = pages.length;
})();
</script>
</body>
</html>`

fs.writeFileSync(path.join(ROOT, 'student-parent-guide.html'), html, 'utf8')
console.log('html written · figures referenced:', figureNo)
if (missing.length) {
  console.log('missing screenshots (figure omitted):')
  missing.forEach((m) => console.log('  -', m))
}
