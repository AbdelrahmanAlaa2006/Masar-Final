export const themeConfig = {
  themeClass: 'aa-geo-theme',
  canvasFont: '"Outfit", sans-serif',
  primaryColor: '#d97706',
  secondaryColor: '#78350f',
  particleColors: ['#d97706', '#78350f', '#f59e0b', '#b45309', '#92400e', '#fef3c7'],
  formulas: ['SiO₂', 'CaCO₃', 'Fe₂O₃', 'القشرة الأرضية', 'الوشاح', 'اللب', 'صخور', 'طبقات الأرض', 'بركان'],
  getLineColor: (theme, alpha) => {
    return theme === 'dark'
      ? `rgba(251, 191, 36, ${alpha * 0.22})`
      : `rgba(180, 83, 9, ${alpha * 0.15})`
  },
  drawCustomShape: (ctx, p, size) => {
    const type = p.type || p.shapeType
    if (type === 'crystal') {
      const r = size * 6.5
      ctx.beginPath()
      ctx.moveTo(p.x, p.y - r)
      ctx.lineTo(p.x + r * 0.8, p.y)
      ctx.lineTo(p.x, p.y + r)
      ctx.lineTo(p.x - r * 0.8, p.y)
      ctx.closePath()
      ctx.lineWidth = 1.2
      ctx.stroke()
      
      ctx.beginPath()
      ctx.moveTo(p.x, p.y - r)
      ctx.lineTo(p.x, p.y + r)
      ctx.moveTo(p.x - r * 0.8, p.y)
      ctx.lineTo(p.x + r * 0.8, p.y)
      ctx.lineWidth = 0.8
      ctx.stroke()
      return true
    }
    return false
  },
  generateCustomShape: () => {
    const rand = Math.random()
    if (rand < 0.35) return 'crystal'
    if (rand < 0.70) return 'formula'
    return 'circle'
  },
  logoUrl: null,
  branding: {
    brand_short: { ar: 'منصة الجيولوجيا', en: 'Geology Platform' },
    hero_title_a: { ar: 'علم الأرض والجيولوجيا', en: 'Geology Science' },
    hero_title_b: { ar: 'أسرار الصخور والطبقات', en: 'Rocks & Layers' },
    hero_sub: {
      ar: 'منصة تعليمية متخصصة في الجيولوجيا وعلوم البيئة - شرح مفصل بالخرائط والصور لكافة التراكيب الجيولوجية الصعبة.',
      en: 'An educational platform specializing in geology and environmental sciences with maps and structures.'
    }
  },
  teacher: {
    name: { ar: 'شريف جيولوجيا', en: 'Sherif Geology' },
    role: { ar: 'مدرّس الجيولوجيا وعلوم البيئة', en: 'Geology Teacher' },
    bio: {
      ar: 'شرح مبسط لكافة التراكيب الصخرية، الفوالق، والألواح التكتونية بأسلوب علمي تفاعلي لضمان الدرجة النهائية.',
      en: 'Simplified geology lectures covering rock structures, faults, and plate tectonics.'
    },
    quote: {
      ar: '«الأرض كتاب مفتوح، والجيولوجيا تعلمك كيف تقرأ لغة الصخور وتفهم تاريخ كوكبنا.»',
      en: '“Earth is an open book, and geology teaches you how to read the language of rocks.”'
    },
    image_base: '/images/profile.png',
    image_hover: '/images/me.png',
    experience: { ar: '+12', en: '+12' },
    students_count: { ar: '+3,500', en: '+3,500' },
    satisfaction: { ar: '98%', en: '98%' },
    target_stage: { ar: 'المرحلة الثانوية', en: 'Secondary Stage' },
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
