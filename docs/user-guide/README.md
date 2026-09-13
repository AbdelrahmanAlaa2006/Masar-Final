# Student & Parent Guide

End-user manual for the platform, written in Arabic (RTL) for Egyptian students
and parents. It documents **only what the application currently does** — every
statement was checked against the source and against the running app.

## Deliverables

| File | What it is |
| --- | --- |
| `student-parent-guide.pdf` | The guide. Hand this to students and parents. |
| `student-parent-guide.docx` | Editable Word source, fully RTL (see note below). |
| `student-parent-guide.html` | Self-contained HTML the PDF is printed from. |
| `content.mjs` | The single document model both outputs are rendered from. |
| `screenshots/` | Real screenshots captured from the running app. |
| `FUTURE_DOCUMENTATION_GAPS.md` | Things users expect that the app does not do. |

Edit `content.mjs` and rebuild — do not edit the HTML, PDF or DOCX by hand, they
are generated.

### A note on the DOCX and Word

The DOCX is genuine RTL OOXML: `<w:bidi/>` on the section and on all 690
paragraphs, `<w:rtl/>` on 1089 runs, `<w:bidiVisual/>` on all 21 tables, plus an
explicit right alignment on every paragraph.

**Word only honours that if an RTL editing language is enabled** under
*File → Options → Language*. A Word install without Arabic enabled silently
strips `<w:bidi/>` on open and remaps the alignment to the left — this was
confirmed against this machine's Word 16, where a paragraph carrying `<w:bidi/>`
came back left-aligned while an otherwise identical one without it stayed right.
That is a reader-side language setting, not a defect in the file. LibreOffice
honours the markup unconditionally.

**The PDF has no such dependency** — Chrome shapes and lays it out at build
time, so it renders identically everywhere. Hand out the PDF; keep the DOCX for
editing.

## Rebuilding

```bash
node docs/user-guide/tools/build-html.mjs && node docs/user-guide/tools/build-pdf.mjs && node docs/user-guide/tools/build-docx.mjs
```

No new dependency was added to the project: the PDF is printed by the Chrome
already installed on the machine, the DOCX is written by a small OOXML + ZIP
writer in `tools/`, and the only third-party module used is `ws`, which was
already in `node_modules`.

## Re-capturing screenshots

Start the dev server first (`npm run dev`, port 3000), then:

```bash
GUIDE_PHONE=<test-student-phone> GUIDE_PASS=<password> GUIDE_PARENT_PHONE=<parent-phone> node docs/user-guide/tools/capture.mjs
```

Then re-apply the arrows to the key screens, and rebuild:

```bash
GUIDE_PHONE=<phone> GUIDE_PASS=<password> GUIDE_PARENT_PHONE=<parent-phone> node docs/user-guide/tools/annotate-capture.mjs
```

`GUIDE_ONLY=student-13-video-player` limits a run to one screenshot while
still walking the navigation needed to reach it.

Use a **test account on a test tenant** — never a real student.

`tools/capture.mjs` drives a headless Chrome against the local dev server. It
does not modify the application. Three things happen browser-side, at capture
time only:

- **Identity redaction** (`tools/redact.js`) — two layers. An explicit map
  replaces the student name, phone numbers, ids, tokens, the teacher name and
  any portrait with fictional values. On top of that a pattern scrub rewrites
  anything that *looks* like contact detail — e-mail addresses, InstaPay
  handles, Egyptian mobile numbers — and swaps payment QR codes for a
  placeholder. The second layer exists because the payment page renders the
  **centre's own** InstaPay handle and wallet number, which no name map can
  know about in advance. Never publish a screenshot captured without it.
- **Annotations** (`tools/annotate.js`) — a highlight ring and a curved arrow
  drawn on the real control, measured from the live element rather than
  hardcoded, so the marks always land correctly. Which screens get marks, and
  which control each one points at, is declared in `tools/annotate-capture.mjs`.
- **Automation shims** — `window.outer*` is reported as the emulated viewport so
  the app's devtools-size heuristic does not mistake emulation for an open
  inspector, and the localhost-only `.dev-tenant-switcher` overlay is hidden
  because it never renders in production.
- **Outbound message blocking** — the WhatsApp gateway and
  `queue_public_notification` are blocked at the network layer, so opening the
  parent portal during a capture run can never deliver a message to a real
  number.

Opening an exam during a capture run starts one attempt row on the test account.
The run never submits it.

## Conventions used in the guide

- `**bold**` → bold.
- `«label»` → a literal UI label, reproduced exactly as the app shows it.
- `{{ltr:value}}` → bidi-isolated, for URLs, codes and numbers that must stay
  left-to-right inside an Arabic sentence.

## Tone

Modern Standard Arabic with a natural Egyptian voice — friendly and direct for
students, a little more measured for parents. Troubleshooting never blames the
reader. UI labels always keep the app's exact wording so the reader can find the
thing on screen.
