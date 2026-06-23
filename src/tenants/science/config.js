export const themeConfig = {
  themeClass: 'aa-science-theme',
  canvasFont: '"Rajdhani", sans-serif',
  primaryColor: '#0ea5e9',
  secondaryColor: '#6366f1',
  particleColors: ['#0ea5e9', '#6366f1', '#38bdf8', '#818cf8', '#0284c7', '#4f46e5'],
  formulas: ['H₂O', 'CO₂', 'E=mc²', 'F=ma', 'Prism', 'Gravity', 'Magnet', 'Force', 'Refraction'],
  getLineColor: (theme, alpha) => {
    return theme === 'dark'
      ? `rgba(129, 140, 248, ${alpha * 0.22})`
      : `rgba(14, 165, 233, ${alpha * 0.15})`
  },
  drawCustomShape: (ctx, p, size) => {
    const type = p.type || p.shapeType
    if (type === 'glass') {
      ctx.beginPath()
      ctx.arc(p.x - size * 1.5, p.y - size * 1.5, size * 3.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(p.x + size * 0.5, p.y + size * 0.5)
      ctx.lineTo(p.x + size * 4.5, p.y + size * 4.5)
      ctx.lineWidth = 1.8
      ctx.stroke()
      return true
    }
    if (type === 'tube') {
      ctx.beginPath()
      ctx.arc(p.x, p.y - size * 2.5, size * 2, Math.PI, 0)
      ctx.lineTo(p.x + size * 2, p.y + size * 2)
      ctx.arc(p.x, p.y + size * 2, size * 2, 0, Math.PI)
      ctx.closePath()
      ctx.lineWidth = 1.2
      ctx.stroke()
      return true
    }
    return false
  },
  generateCustomShape: () => {
    const rand = Math.random()
    if (rand < 0.20) return 'glass'
    if (rand < 0.40) return 'tube'
    if (rand < 0.75) return 'formula'
    return 'circle'
  },
  logoUrl: null,
  branding: {
    brand_short: { ar: 'منصة العلوم', en: 'Science Platform' },
    hero_title_a: { ar: 'مادة العلوم العامة', en: 'General Science' },
    hero_title_b: { ar: 'اكتشف عالم الطبيعة', en: 'Discover the World' },
    hero_sub: {
      ar: 'منصة تعليمية متكاملة لتبسيط منهج العلوم للمرحلة الإعدادية باستخدام أحدث الرسوم التوضيحية والتجارب.',
      en: 'An educational platform simplifying the prep stage science curriculum with modern illustrations.'
    }
  },
  teacher: {
    name: { ar: 'شريف علوم', en: 'Sherif Science' },
    role: { ar: 'مدرّس العلوم للمرحلة الإعدادية', en: 'General Science Teacher' },
    bio: {
      ar: 'خبير تدريس مادة العلوم للمرحلة الإعدادية مع تبسيط الأقسام الفيزيائية والكيميائية والأحيائية للطلاب.',
      en: 'Expert in teaching general science, bridging physics, chemistry, and biology concepts.'
    },
    quote: {
      ar: '«العلوم هي المغامرة التي تكشف لنا أسرار الكون من حولنا.»',
      en: '“Science is the adventure that reveals the secrets of the universe to us.”'
    },
    image_base: '/images/profile.png',
    image_hover: '/images/me.png',
    experience: { ar: '+10', en: '+10' },
    students_count: { ar: '+2,500', en: '+2,500' },
    satisfaction: { ar: '98%', en: '98%' },
    target_stage: { ar: 'المرحلة الإعدادية', en: 'Preparatory Stage' },
    target_stage_label: { ar: 'المرحلة التي يدرّسها', en: 'Stage he teaches' },
    learning_system: { ar: 'أونلاين تفاعلي', en: 'Online Interactive' }
  },
  socials: {
    facebook: 'https://www.facebook.com',
    whatsapp: 'https://wa.me/',
    instagram: 'https://www.instagram.com',
    youtube: 'https://www.youtube.com',
    tiktok: 'https://www.tiktok.com'
  },
  location: {
    kicker: { ar: 'مقرنا الرئيسي', en: 'Our Location' },
    title: { ar: 'موقع السنتر', en: 'Our Location' },
    description: {
      ar: 'مقرنا الرئيسي للمحاضرات العملية ومتابعة الطلاب بدمنهور.',
      en: 'Our main center for lectures and student follow-up in Damanhour.'
    },
    address: { ar: 'دمنهور، البحيرة', en: 'Damanhour, Beheira' },
    country: { ar: 'جمهورية مصر العربية', en: 'Egypt' },
    map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
    phone: '+20 100 000 0000',
    hours_days: { ar: 'السبت - الأربعاء', en: 'Sat - Wed' },
    hours_time: { ar: '٣ مساءً - ٩ مساءً', en: '3 PM - 9 PM' },
    directions_link: 'https://maps.google.com',
    whatsapp_link: 'https://wa.me/201000000000'
  }
}

export default themeConfig
