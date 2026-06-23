export const themeConfig = {
  themeClass: 'aa-bio-theme',
  canvasFont: '"Quicksand", sans-serif',
  primaryColor: '#22c55e',
  secondaryColor: '#15803d',
  particleColors: ['#22c55e', '#15803d', '#4ade80', '#86efac', '#166534', '#14532d'],
  formulas: ['DNA', 'RNA', 'ATP', 'Cell', 'Plant', 'C₆H₁₂O₆', 'Bio', 'Genetics', 'Proteins'],
  getLineColor: (theme, alpha) => {
    return theme === 'dark'
      ? `rgba(74, 222, 128, ${alpha * 0.22})`
      : `rgba(34, 197, 94, ${alpha * 0.15})`
  },
  drawCustomShape: (ctx, p, size) => {
    const type = p.type || p.shapeType
    if (type === 'dna') {
      const length = size * 8
      const amplitude = size * 2.5
      
      // Draw links (rungs)
      ctx.beginPath()
      ctx.lineWidth = 0.8
      for (let xl = -length; xl <= length; xl += 4) {
        const phase = xl * 0.25 + (Date.now() * 0.0025)
        const y1 = amplitude * Math.sin(phase)
        const y2 = -amplitude * Math.sin(phase)
        ctx.moveTo(p.x + xl, p.y + y1)
        ctx.lineTo(p.x + xl, p.y + y2)
      }
      ctx.stroke()
      
      // Draw strands
      ctx.beginPath()
      ctx.lineWidth = 1.2
      for (let xl = -length; xl <= length; xl += 1) {
        const phase = xl * 0.25 + (Date.now() * 0.0025)
        const y1 = amplitude * Math.sin(phase)
        if (xl === -length) ctx.moveTo(p.x + xl, p.y + y1)
        else ctx.lineTo(p.x + xl, p.y + y1)
      }
      ctx.stroke()

      ctx.beginPath()
      for (let xl = -length; xl <= length; xl += 1) {
        const phase = xl * 0.25 + (Date.now() * 0.0025)
        const y2 = -amplitude * Math.sin(phase)
        if (xl === -length) ctx.moveTo(p.x + xl, p.y + y2)
        else ctx.lineTo(p.x + xl, p.y + y2)
      }
      ctx.stroke()
      return true
    }
    if (type === 'leaf') {
      const r = size * 6.0
      ctx.beginPath()
      // Left curve
      ctx.moveTo(p.x, p.y + r)
      ctx.bezierCurveTo(p.x - r * 0.75, p.y + r * 0.5, p.x - r * 0.75, p.y - r * 0.5, p.x, p.y - r)
      // Right curve
      ctx.bezierCurveTo(p.x + r * 0.75, p.y - r * 0.5, p.x + r * 0.75, p.y + r * 0.5, p.x, p.y + r)
      ctx.closePath()
      ctx.lineWidth = 1.3
      ctx.stroke()
      
      // Center spine / stem
      ctx.beginPath()
      ctx.moveTo(p.x, p.y + r)
      ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - r * 0.9)
      ctx.lineWidth = 0.9
      ctx.stroke()
      
      // Side veins
      ctx.beginPath()
      ctx.lineWidth = 0.7
      // Lower veins
      ctx.moveTo(p.x, p.y + r * 0.4)
      ctx.lineTo(p.x - r * 0.4, p.y + r * 0.1)
      ctx.moveTo(p.x, p.y + r * 0.4)
      ctx.lineTo(p.x + r * 0.4, p.y + r * 0.1)
      // Middle veins
      ctx.moveTo(p.x, p.y - r * 0.1)
      ctx.lineTo(p.x - r * 0.45, p.y - r * 0.4)
      ctx.moveTo(p.x, p.y - r * 0.1)
      ctx.lineTo(p.x + r * 0.45, p.y - r * 0.4)
      // Upper veins
      ctx.moveTo(p.x, p.y - r * 0.5)
      ctx.lineTo(p.x - r * 0.3, p.y - r * 0.75)
      ctx.moveTo(p.x, p.y - r * 0.5)
      ctx.lineTo(p.x + r * 0.3, p.y - r * 0.75)
      ctx.stroke()
      return true
    }
    if (type === 'cell') {
      ctx.beginPath()
      ctx.arc(p.x, p.y, size * 4.5, 0, Math.PI * 2)
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(p.x - size * 1, p.y - size * 1, size * 1.5, 0, Math.PI * 2)
      ctx.fill()
      return true
    }
    return false
  },
  generateCustomShape: () => {
    const rand = Math.random()
    if (rand < 0.25) return 'dna'
    if (rand < 0.40) return 'leaf'
    if (rand < 0.55) return 'cell'
    if (rand < 0.85) return 'formula'
    return 'circle'
  },
  logoUrl: null,
  branding: {
    brand_short: { ar: 'منصة الأحياء', en: 'Biology Platform' },
    hero_title_a: { ar: 'علم الأحياء والخلية', en: 'Biology & Cells' },
    hero_title_b: { ar: 'أسرار الكائنات الحية', en: 'Secrets of Life' },
    hero_sub: {
      ar: 'منصة تعليمية متخصصة في الأحياء - شرح تفاعلي ثلاثي الأبعاد يبسط فهم الكائنات الحية وجسم الإنسان.',
      en: 'An educational platform specializing in biology - interactive 3D explanations that simplify living organisms.'
    }
  },
  teacher: {
    name: { ar: 'شريف الأحياء', en: 'Sherif Biology' },
    role: { ar: 'مدرّس الأحياء والجيولوجيا القدير', en: 'Senior Biology Lecturer' },
    bio: {
      ar: 'خبرة طويلة في تدريس منهج الأحياء للثانوية العامة وتبسيطه للطلاب بأسلوب شيق ونماذج ثلاثية الأبعاد.',
      en: 'Long experience in teaching biology for secondary stages with interactive visual models.'
    },
    quote: {
      ar: '«الأحياء ليست مجرد حفظ، بل رحلة داخل أجهزة جسمك لتعرف كيف تعيش.»',
      en: '“Biology is not just memorization, it is a journey inside your body to understand life.”'
    },
    image_base: '/images/profile.png',
    image_hover: '/images/me.png',
    experience: { ar: '+12', en: '+12' },
    students_count: { ar: '+3,500', en: '+3,500' },
    satisfaction: { ar: '98%', en: '98%' },
    target_stage: { ar: 'المرحلة الثانوية', en: 'Secondary Stage' },
    target_stage_label: { ar: 'المرحلة التي يدرّسها', en: 'Stage she teaches' },
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
    kicker: { ar: 'مقرنا الرئيسي', en: 'Visit our center' },
    title: { ar: 'موقع السنتر', en: 'Our Location' },
    description: {
      ar: 'مقرنا للمحاضرات التفاعلية والمراجعات العملية بدمنهور.',
      en: 'Our main center for lectures and practical reviews in Damanhour.'
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
