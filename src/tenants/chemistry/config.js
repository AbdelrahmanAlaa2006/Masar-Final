export const themeConfig = {
  themeClass: 'aa-chem-theme',
  canvasFont: '"Orbitron", sans-serif',
  primaryColor: '#06b6d4',
  secondaryColor: '#0d9488',
  particleColors: ['#0d9488', '#06b6d4', '#14b8a6', '#22d3ee', '#38bdf8', '#8b5cf6'],
  formulas: ['H₂O', 'CO₂', 'C₆H₆', 'HCl', 'NaOH', 'NH₃', 'CH₄', 'NaCl'],
  getLineColor: (theme, alpha) => {
    return theme === 'dark'
      ? `rgba(120, 200, 255, ${alpha * 0.22})`
      : `rgba(13, 148, 136, ${alpha * 0.15})`
  },
  drawCustomShape: (ctx, p, size) => {
    const type = p.type || p.shapeType
    if (type === 'benzene') {
      ctx.beginPath()
      const r = size * 5.5
      for (let s = 0; s < 6; s++) {
        const angle = (s * Math.PI) / 3
        const px = p.x + r * Math.cos(angle)
        const py = p.y + r * Math.sin(angle)
        if (s === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.lineWidth = 1.2
      ctx.stroke()
      
      ctx.beginPath()
      ctx.arc(p.x, p.y, r * 0.5, 0, Math.PI * 2)
      ctx.stroke()
      return true
    } else if (type === 'flask') {
      const sizeVal = size * 6
      ctx.beginPath()
      ctx.moveTo(p.x - sizeVal * 0.2, p.y - sizeVal * 0.6)
      ctx.lineTo(p.x + sizeVal * 0.2, p.y - sizeVal * 0.6)
      ctx.lineTo(p.x + sizeVal * 0.2, p.y - sizeVal * 0.2)
      ctx.lineTo(p.x + sizeVal * 0.6, p.y + sizeVal * 0.6)
      ctx.lineTo(p.x - sizeVal * 0.6, p.y + sizeVal * 0.6)
      ctx.lineTo(p.x - sizeVal * 0.2, p.y - sizeVal * 0.2)
      ctx.closePath()
      ctx.lineWidth = 1.2
      ctx.stroke()
      return true
    }
    return false
  },
  generateCustomShape: () => {
    const rand = Math.random()
    if (rand < 0.20) return 'benzene'
    if (rand < 0.40) return 'flask'
    if (rand < 0.70) return 'formula'
    return 'circle'
  },
  logoUrl: null,
  branding: {
    brand_short: { ar: 'الأستاذة منى كيمياء', en: 'Mona Chemistry' },
    hero_title_a: { ar: 'علم الكيمياء', en: 'Chemistry Science' },
    hero_title_b: { ar: 'المتعة والفهم معاً', en: 'Understanding made fun' },
    hero_sub: {
      ar: 'منصة تعليمية متخصصة في الكيمياء - شرح مبسط وتجارب تفاعلية تجعلك تعشق الكيمياء وتتفوق فيها.',
      en: 'An educational platform specializing in chemistry - simplified explanations and interactive experiments that make you love chemistry.'
    }
  },
  teacher: {
    name: { ar: 'منى أحمد', en: 'Mona Ahmed' },
    role: { ar: 'مدرّسة الكيمياء القديرة', en: 'Senior Chemistry Teacher' },
    bio: {
      ar: 'بشرح الكيمياء بأسلوب علمي حديث وتجارب عملية تقرب المفاهيم والمعادلات لذهن الطالب وتسهل عليه الفهم والاستيعاب.',
      en: 'I teach chemistry with a modern scientific style and practical experiments that bring concepts and equations to life.'
    },
    quote: {
      ar: '«الكيمياء ليست حفظاً للمعادلات، بل فهم لكيفية عمل الكون.»',
      en: '“Chemistry is not about memorizing equations, but understanding how the universe works.”'
    },
    image_base: '/images/profile.png',
    image_hover: '/images/me.png',
    experience: { ar: '+8', en: '+8' },
    students_count: { ar: '+1,500', en: '+1,500' },
    satisfaction: { ar: '99%', en: '99%' },
    target_stage: { ar: 'المرحلة الثانوية', en: 'Secondary Stage' },
    target_stage_label: { ar: 'المرحلة التي تدرّسها', en: 'Stage she teaches' },
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
    kicker: { ar: 'زورنا في مقرنا', en: 'Visit our center' },
    title: { ar: 'موقع السنتر', en: 'Our Location' },
    description: {
      ar: 'مقرنا الرئيسي للدروس والمراجعات العملية بدمنهور.',
      en: 'Our main center for lessons and practical reviews in Damanhour.'
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
