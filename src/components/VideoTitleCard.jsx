import React from 'react'
import './VideoTitleCard.css'

/**
 * Premium header card for the video player view.
 *
 * Replaces the bare `<h1 class="title-main gradient-text">` that read as
 * unstyled text floating on the page background.
 *
 * Shared by Videos.jsx and Packages.jsx — both render the same player header,
 * and keeping one component stops the two drifting apart the way their two
 * stylesheets already had.
 *
 * Presentational only: no state, no effects, no JS-driven animation. Everything
 * moving is a CSS transition or a one-shot keyframe, so a grid of these stays
 * cheap.
 *
 * Props:
 *   title       string   - required
 *   description string   - optional, hidden entirely when blank
 *   eyebrow     string   - optional small label above the title
 *   meta        [{ icon, text }] - optional chips under the title
 *   icon        string   - Font Awesome name for the badge (default fa-play)
 *   as          string   - heading tag; use 'h1' when this is the page's main
 *                          heading and 'h2' when it sits under one. Defaults to
 *                          h1 because the player view is a page in its own right.
 */
export default function VideoTitleCard({
  title,
  description,
  eyebrow,
  meta = [],
  icon = 'fa-play',
  as: Heading = 'h1',
}) {
  if (!title) return null

  const desc = (description || '').trim()
  const chips = (meta || []).filter(m => m && m.text)

  return (
    <div className="vtc">
      {/* Decorative only — the heading below carries the accessible name. */}
      <span className="vtc-badge" aria-hidden="true">
        <i className={`fas ${icon}`}></i>
      </span>

      <div className="vtc-body">
        {eyebrow && <span className="vtc-eyebrow">{eyebrow}</span>}

        <Heading className="vtc-title">{title}</Heading>

        {desc && <p className="vtc-desc">{desc}</p>}

        {chips.length > 0 && (
          <ul className="vtc-meta">
            {chips.map((m, i) => (
              <li key={i} className="vtc-meta-item">
                {m.icon && <i className={`fas ${m.icon}`} aria-hidden="true"></i>}
                <span>{m.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
