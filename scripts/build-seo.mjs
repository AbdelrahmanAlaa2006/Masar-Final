/* ---------------------------------------------------------------------------
   build-seo.mjs — runs after `vite build`.

   Takes the single dist/index.html produced by Vite and writes one variant per
   custom domain (dist/<key>.html) with that domain's own <head> SEO block:
   title, description, keywords, canonical, Open Graph, Twitter card, favicon,
   theme-color and JSON-LD.

   The base dist/index.html is rewritten with the brand-NEUTRAL default, so any
   host without its own entry (preview deploys, *.vercel.app) never advertises
   one specific teacher — and, crucially, never emits a canonical pointing at
   another domain.

   vercel.json maps each host to its file. Adding a domain = one entry in
   seo/domains.mjs + two lines in vercel.json.
   --------------------------------------------------------------------------- */

import { readFile, writeFile, unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOMAINS, DEFAULT_KEY, DEVELOPERS } from '../seo/domains.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function jsonLdBlock(cfg) {
  const base = cfg.canonical || 'https://mrmohamedabdella.com/'
  const { person, org } = cfg.jsonLd || {}
  const blocks = []

  // Developer Person Entities (Abdelrahman Alaa & Eyad Elalkamy)
  const developerIds = DEVELOPERS.map((dev) => {
    const devId = `${base}#developer-${dev.key}`
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': devId,
      name: dev.name,
      alternateName: dev.alternateName,
      jobTitle: dev.jobTitle,
      ...(dev.image ? { image: dev.image.startsWith('http') ? dev.image : `${base.replace(/\/$/, '')}${dev.image}` } : {}),
      ...(dev.affiliation ? { affiliation: dev.affiliation, alumniOf: dev.affiliation } : {}),
      knowsAbout: dev.knowsAbout,
      sameAs: dev.sameAs,
      url: `${base}credits`,
    })
    return { '@id': devId }
  })

  // SoftwareApplication / WebApplication Entity
  blocks.push({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${base}#software`,
    name: 'GitFekra Educational SaaS Platform',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web, Mobile Web',
    author: developerIds,
    creator: developerIds,
    publisher: org ? { '@id': `${base}#organization` } : { '@type': 'Organization', name: 'GitFekra' },
    url: base,
  })

  if (person) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': `${base}#person`,
      name: person.name,
      alternateName: person.alternateName,
      url: base,
      ...(person.image ? { image: person.image } : {}),
      jobTitle: person.jobTitle,
      knowsAbout: person.knowsAbout,
      worksFor: { '@id': `${base}#organization` },
      ...(person.sameAs?.length ? { sameAs: person.sameAs } : {}),
    })
  }

  if (org) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      '@id': `${base}#organization`,
      name: org.name,
      alternateName: org.alternateName,
      url: base,
      ...(org.logo ? { logo: org.logo } : {}),
      ...(cfg.ogImage ? { image: cfg.ogImage } : {}),
      description: org.description,
      founder: { '@id': `${base}#person` },
      ...(org.telephone ? { telephone: org.telephone } : {}),
      ...(org.addressLocality
        ? {
            address: {
              '@type': 'PostalAddress',
              addressLocality: org.addressLocality,
              ...(org.addressRegion ? { addressRegion: org.addressRegion } : {}),
              addressCountry: 'EG',
            },
          }
        : {}),
    })
  }

  blocks.push({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${base}#website`,
    name: cfg.siteName || cfg.title,
    url: base,
    inLanguage: ['ar', 'en'],
    publisher: org ? { '@id': `${base}#organization` } : { '@type': 'Organization', name: 'GitFekra' },
  })

  return blocks
    .map((b) => `  <script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join('\n')
}

function headFor(cfg) {
  const lines = [
    '  <!-- BEGIN GENERATED SEO (scripts/build-seo.mjs — do not edit by hand) -->',
    `  <title>${esc(cfg.title)}</title>`,
    `  <meta name="description" content="${esc(cfg.description)}" />`,
    cfg.keywords ? `  <meta name="keywords" content="${esc(cfg.keywords)}" />` : '',
    cfg.author ? `  <meta name="author" content="${esc(cfg.author)}" />` : '',
    '  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />',
    cfg.canonical ? `  <link rel="canonical" href="${esc(cfg.canonical)}" />` : '',
    `  <meta name="theme-color" content="${esc(cfg.themeColor)}" />`,
    `  <meta name="msapplication-TileColor" content="${esc(cfg.themeColor)}" />`,
    cfg.favicon ? `  <link rel="icon" type="${cfg.faviconType || 'image/png'}" href="${esc(cfg.favicon)}" />` : '',
    cfg.favicon ? `  <link rel="apple-touch-icon" href="${esc(cfg.favicon)}" />` : '',
    '  <meta property="og:type" content="website" />',
    `  <meta property="og:site_name" content="${esc(cfg.siteName || cfg.title)}" />`,
    cfg.canonical ? `  <meta property="og:url" content="${esc(cfg.canonical)}" />` : '',
    `  <meta property="og:title" content="${esc(cfg.title)}" />`,
    `  <meta property="og:description" content="${esc(cfg.description)}" />`,
    cfg.ogImage ? `  <meta property="og:image" content="${esc(cfg.ogImage)}" />` : '',
    cfg.ogImage ? '  <meta property="og:image:width" content="1200" />' : '',
    cfg.ogImage ? '  <meta property="og:image:height" content="630" />' : '',
    cfg.ogImage ? `  <meta property="og:image:alt" content="${esc(cfg.siteName || cfg.title)}" />` : '',
    `  <meta property="og:locale" content="${cfg.lang === 'ar' ? 'ar_EG' : 'en_US'}" />`,
    `  <meta name="twitter:card" content="${cfg.ogImage ? 'summary_large_image' : 'summary'}" />`,
    `  <meta name="twitter:title" content="${esc(cfg.title)}" />`,
    `  <meta name="twitter:description" content="${esc(cfg.description)}" />`,
    cfg.ogImage ? `  <meta name="twitter:image" content="${esc(cfg.ogImage)}" />` : '',
    jsonLdBlock(cfg),
    '  <!-- END GENERATED SEO -->',
  ].filter(Boolean)
  return lines.join('\n')
}

// Strip whatever SEO the source index.html carries so each variant starts clean.
function stripExistingSeo(html) {
  return html
    .replace(/\n?[ \t]*<!-- BEGIN GENERATED SEO[\s\S]*?<!-- END GENERATED SEO -->/g, '')
    .replace(/\n?[ \t]*<title>[\s\S]*?<\/title>/gi, '')
    .replace(/\n?[ \t]*<meta\s+name="(description|keywords|author|robots|theme-color|msapplication-TileColor|twitter:[^"]*)"[^>]*>/gi, '')
    .replace(/\n?[ \t]*<meta\s+property="og:[^"]*"[^>]*>/gi, '')
    .replace(/\n?[ \t]*<link\s+rel="canonical"[^>]*>/gi, '')
    .replace(/\n?[ \t]*<link\s+rel="(icon|apple-touch-icon)"[^>]*>/gi, '')
    .replace(/\n?[ \t]*<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi, '')
}

const run = async () => {
  const srcPath = join(DIST, 'index.html')
  let src
  try {
    src = await readFile(srcPath, 'utf8')
  } catch {
    console.error('[build-seo] dist/index.html not found — run `vite build` first.')
    process.exit(1)
  }

  const cleaned = stripExistingSeo(src)
  if (!cleaned.includes('</head>')) {
    console.error('[build-seo] no </head> in dist/index.html — aborting.')
    process.exit(1)
  }

  let count = 0
  for (const [key, cfg] of Object.entries(DOMAINS)) {
    let html = cleaned.replace('</head>', `${headFor(cfg)}\n</head>`)
    // Inject initial static H1 tag inside #root so non-JS scrapers (like Bing)
    // detect an H1 tag before React mounts and hydrates.
    html = html.replace('<div id="root"></div>', `<div id="root"><h1 style="display:none;">${esc(cfg.title)}</h1></div>`)
    const outName = key === DEFAULT_KEY ? 'default.html' : `${key}.html`
    await writeFile(join(DIST, outName), html, 'utf8')
    count++
    const hosts = cfg.hosts?.length ? cfg.hosts.join(', ') : '(fallback for all other hosts)'
    console.log(`[build-seo] dist/${outName.padEnd(22)} ← ${hosts}`)
  }

  // Remove Vite's root index.html so it can't shadow the "/" host rewrites.
  await unlink(srcPath).catch(() => {})

  console.log(`[build-seo] wrote ${count} HTML variant(s).`)
}

run()
