/**
 * Renders content.mjs into an editable Word document.
 *
 * The whole document is right-to-left: the section carries <w:bidi/>, every
 * paragraph carries <w:bidi/>, every Arabic run carries <w:rtl/>, and tables
 * carry <w:bidiVisual/> so their columns read right-to-left too. LTR values
 * (URLs, codes, digits) are emitted as non-RTL runs fenced with LRM marks so
 * Word cannot reorder them inside an Arabic sentence.
 *
 * Belt and braces: every paragraph ALSO carries an explicit right
 * alignment. A Word install without an RTL editing language enabled strips
 * <w:bidi/> and <w:rtl/> on open; the explicit alignment keeps the document
 * reading correctly there too.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { meta, blocks } from '../content.mjs'
import { parseInline, inlineText } from './inline.mjs'
import { zip, imageSize } from './zip.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SHOTS = path.join(ROOT, 'screenshots-print')

const LRM = '‎'
const FONT = 'Tajawal'

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/* ── runs ───────────────────────────────────────────────────────────── */

function run(text, { bold = false, ltr = false, color = null, size = null, caps = false } = {}) {
  // Order matters: Word validates CT_RPr against a fixed element sequence and
  // silently drops anything out of place — which is how <w:rtl/> gets lost.
  const rPr = [
    `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>`,
    bold ? '<w:b/><w:bCs/>' : '',
    caps ? '<w:caps/>' : '',
    color ? `<w:color w:val="${color}"/>` : '',
    size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : '',
    ltr ? '' : '<w:rtl/>',
  ].join('')
  const body = ltr ? LRM + text + LRM : text
  return `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${esc(body)}</w:t></w:r>`
}

function runs(text, base = {}) {
  return parseInline(text)
    .map((r) => {
      if (r.ltr) return run(r.text, { ...base, ltr: true })
      if (r.bold) return run(r.text, { ...base, bold: true })
      if (r.label) return run(r.text, { ...base, bold: true, color: '5B21B6' })
      return run(r.text, base)
    })
    .join('')
}

/* ── paragraphs ─────────────────────────────────────────────────────── */

function para(inner, opts = {}) {
  const {
    style = null, spacingBefore = 0, spacingAfter = 120, align = 'right',
    numId = null, ilvl = 0, indentStart = 0, shading = null, borders = null,
    keepNext = false, pageBreakBefore = false,
  } = opts
  // CT_PPrBase declares a fixed child sequence. Word discards elements that
  // appear out of order, so <w:bidi/> must sit after pBdr/shd and before
  // spacing/ind, or the whole paragraph silently renders left-to-right.
  const pPr = [
    style ? `<w:pStyle w:val="${style}"/>` : '',
    keepNext ? '<w:keepNext/>' : '',
    pageBreakBefore ? '<w:pageBreakBefore/>' : '',
    numId ? `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>` : '',
    borders || '',
    shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>` : '',
    '<w:bidi/>',
    `<w:spacing w:before="${spacingBefore}" w:after="${spacingAfter}" w:line="300" w:lineRule="auto"/>`,
    indentStart ? `<w:ind w:start="${indentStart}" w:end="0"/>` : '',
    align ? `<w:jc w:val="${align}"/>` : '',
  ].join('')
  return `<w:p><w:pPr>${pPr}</w:pPr>${inner}</w:p>`
}

const emptyPara = (after = 0) => para('', { spacingAfter: after })
const pageBreak = () =>
  `<w:p><w:pPr><w:bidi/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>`

/* ── images ─────────────────────────────────────────────────────────── */

const media = []
function image(file, maxWidthEmu) {
  // Figures are authored as .png; prep-images.mjs emits the print-ready .jpg.
  let name = file.replace(/\.png$/, '.jpg')
  let p = path.join(SHOTS, name)
  if (!fs.existsSync(p)) { name = file; p = path.join(SHOTS, name) }
  if (!fs.existsSync(p)) return null
  const buf = fs.readFileSync(p)
  const { width, height } = imageSize(buf)
  const id = media.length + 1
  media.push({ name, data: buf })

  const pxToEmu = 9525
  let w = Math.round(width * pxToEmu)
  let h = Math.round(height * pxToEmu)
  const maxH = 4900000 // ~13.6 cm tall, so a page still holds text around it
  if (w > maxWidthEmu) { h = Math.round((h * maxWidthEmu) / w); w = maxWidthEmu }
  if (h > maxH) { w = Math.round((w * maxH) / h); h = maxH }

  const rid = `rIdImg${id}`
  const drawing =
    `<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${w}" cy="${h}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${id}" name="Picture ${id}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(file)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  return drawing
}

/* ── tables ─────────────────────────────────────────────────────────── */

const CONTENT_W = 9350 // twips inside A4 margins

function table(head, rows) {
  const cols = head.length
  const widths = cols === 2 ? [3200, CONTENT_W - 3200] : Array(cols).fill(Math.floor(CONTENT_W / cols))

  const border = (side) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="D8DBE2"/>`
  const tblBorders = `<w:tblBorders>${['top', 'start', 'bottom', 'end', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>`

  const cell = (text, isHead, w) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>` +
    (isHead ? '<w:shd w:val="clear" w:color="auto" w:fill="F5F3FF"/>' : '') +
    `<w:vAlign w:val="top"/></w:tcPr>` +
    para(runs(text, isHead ? { bold: true, color: '5B21B6' } : {}), { spacingAfter: 40, spacingBefore: 40 }) +
    `</w:tc>`

  const headRow =
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>` +
    head.map((h, i) => cell(h, true, widths[i])).join('') +
    `</w:tr>`
  const bodyRows = rows
    .map((r) => `<w:tr>${r.map((c, i) => cell(c, false, widths[i])).join('')}</w:tr>`)
    .join('')

  return (
    `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>` +
    `<w:bidiVisual/>` +
    `<w:tblW w:w="${CONTENT_W}" w:type="dxa"/>` +
    `<w:jc w:val="right"/>${tblBorders}` +
    `<w:tblLayout w:type="fixed"/>` +
    `</w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
    headRow + bodyRows + `</w:tbl>` + emptyPara(0)
  )
}

/* ── block renderer ─────────────────────────────────────────────────── */

const CALLOUT_FILL = { tip: 'F0FDF4', warn: 'FFFBEB', note: 'EFF6FF' }
const CALLOUT_COLOR = { tip: '15803D', warn: 'B45309', note: '1D4ED8' }
const CALLOUT_ICON = { tip: '💡', warn: '⚠️', note: 'ℹ️' }

const missing = []
const bodyParts = []
let figureNo = 0

for (const b of blocks) {
  switch (b.t) {
    case 'cover':
      bodyParts.push(emptyPara(0), emptyPara(0), emptyPara(0))
      bodyParts.push(para(run(meta.title, { bold: true, size: 72, color: '111827' }), { align: 'center', spacingAfter: 200 }))
      bodyParts.push(para(run(meta.subtitle, { size: 30, color: '4B5563' }), { align: 'center', spacingAfter: 400 }))
      bodyParts.push(para(run(meta.date, { size: 24, color: '6B7280' }), { align: 'center', spacingAfter: 800 }))
      bodyParts.push(
        para(
          run('كل الصور في هذا الدليل مأخوذة من المنصة مباشرةً. الأسماء والأرقام والصور الشخصية الظاهرة فيها بيانات تجريبية غير حقيقية.', {
            size: 18, color: '6B7280',
          }),
          { align: 'center' }
        )
      )
      bodyParts.push(pageBreak())
      break

    case 'toc':
      bodyParts.push(para(run('المحتويات', { bold: true, size: 40 }), { spacingAfter: 240 }))
      bodyParts.push(
        `<w:p><w:pPr><w:bidi/><w:spacing w:after="120"/></w:pPr>` +
          `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>` +
          `<w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r>` +
          `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
          run('افتح تبويب «المراجع» ← «تحديث الجدول» لعرض المحتويات وأرقام الصفحات.', { color: '6B7280', size: 18 }) +
          `<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`
      )
      bodyParts.push(pageBreak())
      break

    case 'part':
      bodyParts.push(emptyPara(0), emptyPara(0), emptyPara(0))
      bodyParts.push(para(run(b.text, { bold: true, size: 26, color: '5B21B6' }), { align: 'center', spacingAfter: 160 }))
      bodyParts.push(para(run(b.sub, { bold: true, size: 56 }), { align: 'center', spacingAfter: 200 }))
      bodyParts.push(pageBreak())
      break

    case 'h1':
      bodyParts.push(para(runs(b.text), { style: 'Heading1', spacingBefore: 320, spacingAfter: 160, keepNext: true }))
      break

    case 'h2':
      bodyParts.push(para(runs(b.text), { style: 'Heading2', spacingBefore: 240, spacingAfter: 120, keepNext: true }))
      break

    case 'p':
      bodyParts.push(para(runs(b.text)))
      break

    case 'ul':
      b.items.forEach((i) => bodyParts.push(para(runs(i), { numId: 1, indentStart: 420, spacingAfter: 60 })))
      bodyParts.push(emptyPara(60))
      break

    case 'ol':
      b.items.forEach((i) => bodyParts.push(para(runs(i), { numId: 2, indentStart: 420, spacingAfter: 60 })))
      bodyParts.push(emptyPara(60))
      break

    case 'steps':
      b.items.forEach((s) => {
        bodyParts.push(
          para(
            run(s.title, { bold: true, color: '5B21B6' }) + run('  —  ') + runs(s.text),
            { indentStart: 220, spacingAfter: 100 }
          )
        )
      })
      bodyParts.push(emptyPara(60))
      break

    case 'callout': {
      const fill = CALLOUT_FILL[b.kind]
      const color = CALLOUT_COLOR[b.kind]
      const bd =
        `<w:pBdr>` +
        ['top', 'bottom', 'start', 'end']
          .map((s) => `<w:${s} w:val="single" w:sz="6" w:space="4" w:color="${color}"/>`)
          .join('') +
        `</w:pBdr>`
      bodyParts.push(
        para(run(`${CALLOUT_ICON[b.kind]} ${b.title}`, { bold: true, color }), {
          shading: fill, borders: bd, spacingBefore: 160, spacingAfter: 0, indentStart: 120,
        })
      )
      bodyParts.push(
        para(runs(b.text), { shading: fill, borders: bd, spacingAfter: 200, indentStart: 120 })
      )
      break
    }

    case 'table':
      bodyParts.push(table(b.head, b.rows))
      break

    case 'figure': {
      const drawing = image(b.src, 5000000)
      if (!drawing) { missing.push(b.src); break }
      figureNo++
      const cap = `الشكل ${figureNo} — ${String(b.caption).replace(/^\s*الشكل\s+\d+\s*—\s*/, '')}`
      bodyParts.push(para(drawing, { align: 'center', spacingBefore: 160, spacingAfter: 60, keepNext: true }))
      bodyParts.push(para(run(cap, { size: 17, color: '6B7280' }), { align: 'center', spacingAfter: 240 }))
      break
    }

    case 'pagebreak':
      bodyParts.push(pageBreak())
      break
  }
}

/* ── package ────────────────────────────────────────────────────────── */

// CT_SectPr also has a fixed order: header/footer references come first,
// then pgSz, pgMar, and bidi/rtlGutter before docGrid.
const sectPr =
  `<w:sectPr>` +
  `<w:footerReference w:type="default" r:id="rIdFooter"/>` +
  `<w:pgSz w:w="11906" w:h="16838"/>` +
  `<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>` +
  `<w:bidi/>` +
  `<w:rtlGutter/>` +
  `<w:docGrid w:linePitch="360"/>` +
  `</w:sectPr>`

const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>${bodyParts.join('')}${sectPr}</w:body></w:document>`

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
 <w:docDefaults><w:rPrDefault><w:rPr>
   <w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>
   <w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:bidi="ar-EG"/>
 </w:rPr></w:rPrDefault>
 <w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault>
 </w:docDefaults>
 <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>
   <w:pPr><w:bidi/></w:pPr>
   <w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:rtl/></w:rPr></w:style>
 <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
   <w:pPr><w:bidi/><w:outlineLvl w:val="0"/></w:pPr>
   <w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:b/><w:bCs/>
     <w:sz w:val="34"/><w:szCs w:val="34"/><w:color w:val="111827"/><w:rtl/></w:rPr></w:style>
 <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
   <w:pPr><w:bidi/><w:outlineLvl w:val="1"/></w:pPr>
   <w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:b/><w:bCs/>
     <w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="5B21B6"/><w:rtl/></w:rPr></w:style>
 <w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/>
   <w:tblPr><w:bidiVisual/></w:tblPr></w:style>
</w:styles>`

const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
 <w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>
  <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/>
   <w:lvlJc w:val="start"/><w:pPr><w:ind w:start="720" w:hanging="360"/></w:pPr>
   <w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:hint="default"/></w:rPr></w:lvl>
 </w:abstractNum>
 <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>
  <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/>
   <w:lvlJc w:val="start"/><w:pPr><w:ind w:start="720" w:hanging="360"/></w:pPr>
   <w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:hint="default"/></w:rPr></w:lvl>
 </w:abstractNum>
 <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
 <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`

const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
 <w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="D8DBE2"/></w:pBdr><w:bidi/><w:jc w:val="center"/></w:pPr>
  ${run(meta.footer + '  —  ', { size: 16, color: '6B7280' })}
  <w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:sz w:val="16"/><w:color w:val="6B7280"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>
  <w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="end"/></w:r>
 </w:p></w:ftr>`

const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 mc:Ignorable="w14">
 <w:zoom w:percent="100"/>
 <w:proofState w:spelling="clean" w:grammar="clean"/>
 <w:defaultTabStop w:val="720"/>
 <w:characterSpacingControl w:val="doNotCompress"/>
 <w:themeFontLang w:val="en-US" w:bidi="ar-EG"/>
 <w:compat>
  <w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>
  <w:compatSetting w:name="overrideTableStyleFontSizeAndJustification" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>
  <w:compatSetting w:name="enableOpenTypeFeatures" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>
  <w:compatSetting w:name="doNotFlipMirrorIndents" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>
 </w:compat>
 <w:decimalSymbol w:val="."/>
 <w:listSeparator w:val=","/>
</w:settings>`

const imageRels = media
  .map((m, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`)
  .join('')

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
 <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
 <Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
 <Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
 ${imageRels}
</Relationships>`

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="xml" ContentType="application/xml"/>
 <Default Extension="png" ContentType="image/png"/>
 <Default Extension="jpg" ContentType="image/jpeg"/>
 <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
 <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
 <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
 <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
 <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
 <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
 <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`

const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <dc:title>${esc(meta.title)}</dc:title>
 <dc:subject>${esc(meta.subtitle)}</dc:subject>
 <dc:language>ar-EG</dc:language>
</cp:coreProperties>`

const entries = [
  { name: '[Content_Types].xml', data: contentTypes },
  { name: '_rels/.rels', data: rootRels },
  { name: 'docProps/core.xml', data: coreXml },
  { name: 'word/document.xml', data: documentXml },
  { name: 'word/settings.xml', data: settingsXml },
  { name: 'word/styles.xml', data: stylesXml },
  { name: 'word/numbering.xml', data: numberingXml },
  { name: 'word/footer1.xml', data: footerXml },
  { name: 'word/_rels/document.xml.rels', data: docRels },
  ...media.map((m) => ({ name: `word/media/${m.name}`, data: m.data })),
]

const out = process.env.GUIDE_DOCX_OUT || path.join(ROOT, 'student-parent-guide.docx')
fs.writeFileSync(out, zip(entries))
console.log('docx written ·', (fs.statSync(out).size / 1024 / 1024).toFixed(2), 'MB · images:', media.length)
if (missing.length) {
  console.log('missing screenshots (figure omitted):')
  missing.forEach((m) => console.log('  -', m))
}
