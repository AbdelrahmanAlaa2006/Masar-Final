export const themeConfig = {
  themeClass: 'aa-humanities-theme',
  canvasFont: '"Amiri", serif',
  primaryColor: '#b45309',
  secondaryColor: '#d97706',
  particleColors: ['#b45309', '#d97706', '#f59e0b', '#fef3c7', '#78350f', '#d97706'],
  formulas: ['مصر', 'النيل', 'التاريخ', 'الجغرافيا', 'خريطة', 'القاهرة', 'حضارة', 'أهرامات', 'وطن'],
  getLineColor: (theme, alpha) => {
    return theme === 'dark'
      ? `rgba(251, 191, 36, ${alpha * 0.22})`
      : `rgba(180, 83, 9, ${alpha * 0.15})`
  },
  drawCustomShape: (ctx, p, size) => {
    const type = p.type || p.shapeType
    if (type === 'compass') {
      const r = size * 6.5
      ctx.beginPath()
      ctx.moveTo(p.x, p.y - r)
      ctx.lineTo(p.x + size * 1.5, p.y - size * 1.5)
      ctx.lineTo(p.x + r, p.y)
      ctx.lineTo(p.x + size * 1.5, p.y + size * 1.5)
      ctx.lineTo(p.x, p.y + r)
      ctx.lineTo(p.x - size * 1.5, p.y + size * 1.5)
      ctx.lineTo(p.x - r, p.y)
      ctx.lineTo(p.x - size * 1.5, p.y - size * 1.5)
      ctx.closePath()
      ctx.lineWidth = 1.2
      ctx.stroke()
      
      ctx.beginPath()
      ctx.moveTo(p.x, p.y - r)
      ctx.lineTo(p.x, p.y + r)
      ctx.moveTo(p.x - r, p.y)
      ctx.lineTo(p.x + r, p.y)
      ctx.lineWidth = 0.8
      ctx.stroke()
      return true
    }
    return false
  },
  generateCustomShape: () => {
    const rand = Math.random()
    if (rand < 0.35) return 'compass'
    if (rand < 0.70) return 'formula'
    return 'circle'
  },
  logoUrl: null,
  branding: {
    brand_short: { ar: 'منصة الدراسات الاجتماعية', en: 'Humanities Platform' },
    hero_title_a: { ar: 'الجغرافيا والتاريخ', en: 'Geography & History' },
    hero_title_b: { ar: 'رحلة عبر التاريخ والجغرافيا', en: 'Journey Through Time' },
    hero_sub: {
      ar: 'منصة تعليمية متخصصة في التاريخ والجغرافيا - شرح مبسط للخرائط والأحداث التاريخية بأسلوب سردي ممتع وسهل الحفظ.',
      en: 'An educational platform specializing in history and geography - simplifying maps and historical events.'
    }
  },
  teacher: {
    name: { ar: 'شريف المواد الأدبية', en: 'Sherif Humanities' },
    role: { ar: 'مدرّس التاريخ والجغرافيا للمرحلتين الإعدادية والثانوية', en: 'History & Geography Teacher' },
    bio: {
      ar: 'شرح مفصل لكافة الأحداث والخرائط التاريخية والجغرافية بأساليب تعليمية حديثة تعزز الحفظ والفهم.',
      en: 'Detailed lectures covering geography maps and historical events with modern tools.'
    },
    quote: {
      ar: '«التاريخ يعلمنا من أين أتينا، والجغرافيا ترسم لنا أين نحن ذاهبون.»',
      en: '“History teaches us where we came from, and geography shows where we are going.”'
    },
    image_base: '/images/profile.png',
    image_hover: '/images/me.png',
    experience: { ar: '+15', en: '+15' },
    students_count: { ar: '+3,500', en: '+3,500' },
    satisfaction: { ar: '98%', en: '98%' },
    target_stage: { ar: 'الإعدادية والثانوية', en: 'Prep & Secondary' },
    target_stage_label: { ar: 'المراحل التي يدرّسها', en: 'Stages he teaches' },
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
      ar: 'مقرنا الرئيسي للدروس العملية ومتابعة الطلاب بدمنهور.',
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
