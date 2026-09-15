/* How a teacher reaches GitFekra from the company site.
 *
 * WhatsApp is the channel Egyptian teachers actually use, so it is the primary
 * button. This is a click-to-chat link only: it opens WhatsApp on the
 * visitor's own phone with a ready-made message, and a human replies. Nothing
 * is sent automatically — the company number was banned once for automated
 * sending, and this deliberately cannot repeat it.
 *
 * WHATSAPP_NUMBER: international format, digits only, no "+" and no spaces.
 * An Egyptian number 010 1234 5678 becomes '201012345678'.
 * Leave it empty and the WhatsApp button simply does not render.
 */

// Abdelrahman Alaa — 010 6448 3036, in international form for wa.me.
export const WHATSAPP_NUMBER = '201064483036'

export const CONTACT_EMAIL = 'hello@gitfekra.com'

const DEFAULT_MESSAGE = {
  ar: 'السلام عليكم، أنا مدرّس ومهتم أعمل منصة تعليمية خاصة بيا مع جِت فِكرة.',
  en: "Hello, I'm a teacher interested in building my own education platform with GitFekra.",
}

export const hasWhatsApp = () => Boolean(WHATSAPP_NUMBER)

export function whatsappLink(lang = 'ar', message) {
  if (!WHATSAPP_NUMBER) return null
  const text = message || DEFAULT_MESSAGE[lang] || DEFAULT_MESSAGE.ar
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`
}

/** Click-to-chat link for replying to one lead from the admin panel. */
export function whatsappReplyLink(phone, text) {
  const digits = String(phone || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\D/g, '')
  if (digits.length < 8) return null
  // A local Egyptian 01xxxxxxxxx becomes 201xxxxxxxxx for wa.me.
  const intl = digits.startsWith('0') ? `20${digits.slice(1)}` : digits
  return `https://wa.me/${intl}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
