import React from 'react'
import './SharedTextCard.css'

/**
 * The reading passage shown above a question during the exam.
 *
 * Rendered from an in-memory Map (questionIndex -> block) built once when the
 * exam loads, so moving between questions costs nothing and never queries.
 *
 * The content is plain text authored in a textarea — this project has no rich
 * text editor — so it is rendered as text with `white-space: pre-wrap` to keep
 * the teacher's line and paragraph breaks. It is deliberately NOT injected as
 * HTML: passing teacher-authored markup through dangerouslySetInnerHTML would
 * put a stored-XSS hole into the exam player for no gain here.
 */
export default function SharedTextCard({ block }) {
  const text = (block?.content || '').trim()
  const image = (block?.image_url || '').trim()

  // A block can be text, an image, or both — render nothing only when it has
  // neither, so an image-only passage still shows.
  if (!block || (!text && !image)) return null

  return (
    <section
      className="stc"
      aria-label={block.title ? `نص مشترك: ${block.title}` : 'نص مشترك'}
    >
      <header className="stc-head">
        <span className="stc-icon" aria-hidden="true">📖</span>
        <h3 className="stc-title">{block.title?.trim() || 'اقرأ النص التالي'}</h3>
      </header>

      <div className="stc-scroll">
        {image && (
          <figure className="stc-figure">
            <img
              src={image}
              alt={block.title?.trim() || 'صورة النص المشترك'}
              loading="lazy"
            />
          </figure>
        )}
        {text && <div className="stc-body">{text}</div>}
      </div>
    </section>
  )
}
