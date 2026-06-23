export const themeConfig = {
  themeClass: 'aa-phys-theme',
  canvasFont: '"Space Mono", monospace',
  primaryColor: '#10b981',
  secondaryColor: '#059669',
  particleColors: ['#10b981', '#059669', '#34d399', '#6ee7b7', '#a7f3d0', '#047857'],
  formulas: ['π', 'σ', 'λ', 'Ω', 'μ', 'h', 'ℏ', 'E=mc²', 'F=ma', 'V=IR', 'p=mv', 'ΔE=hν'],
  getLineColor: (theme, alpha) => {
    return theme === 'dark'
      ? `rgba(110, 231, 183, ${alpha * 0.22})`
      : `rgba(5, 150, 105, ${alpha * 0.15})`
  },
  drawCustomShape: (ctx, p, size) => {
    const type = p.type || p.shapeType
    if (type === 'atom') {
      // Nucleus
      ctx.beginPath()
      ctx.arc(p.x, p.y, size * 2.2, 0, Math.PI * 2)
      ctx.fill()
      
      // Orbit 1
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, size * 8.5, size * 2.5, 0, 0, Math.PI * 2)
      ctx.lineWidth = 1.0
      ctx.stroke()
      
      // Orbit 2
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, size * 8.5, size * 2.5, Math.PI / 3, 0, Math.PI * 2)
      ctx.stroke()
      
      // Orbit 3
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, size * 8.5, size * 2.5, -Math.PI / 3, 0, Math.PI * 2)
      ctx.stroke()
      
      // Animated Electrons
      ctx.fillStyle = ctx.strokeStyle
      const orbits = [0, Math.PI / 3, -Math.PI / 3]
      orbits.forEach((angle, idx) => {
        const tVal = (Date.now() * 0.0025 + idx * Math.PI / 1.5) % (Math.PI * 2)
        const A = size * 8.5
        const B = size * 2.5
        const xl = A * Math.cos(tVal)
        const yl = B * Math.sin(tVal)
        const x = p.x + xl * Math.cos(angle) - yl * Math.sin(angle)
        const y = p.y + xl * Math.sin(angle) + yl * Math.cos(angle)
        
        ctx.beginPath()
        ctx.arc(x, y, size * 1.2, 0, Math.PI * 2)
        ctx.fill()
      })
      return true
    }
    return false
  },
  generateCustomShape: () => {
    const rand = Math.random()
    if (rand < 0.30) return 'atom'
    if (rand < 0.70) return 'formula'
    return 'circle'
  },
  logoUrl: null,
  branding: {
    brand_short: { ar: 'منصة شريف فيزياء', en: 'Sherif Physics Platform' },
    hero_title_a: { ar: 'علم الفيزياء الكلاسيكية', en: 'Classical Physics' },
    hero_title_b: { ar: 'افهم قوانين الطبيعة', en: 'Discover Nature Laws' },
    hero_sub: {
      ar: 'منصة تعليمية متخصصة في الفيزياء - شرح مبسط وتطبيقات عملية تجعلك تفهم الطبيعة والكون من حولك بسهولة.',
      en: 'An educational platform specializing in physics - simplified explanations and practical applications that help you understand nature.'
    }
  },
  teacher: {
    name: { ar: 'شريف محمد', en: 'Sherif Mohamed' },
    role: { ar: 'مدرّس الفيزياء للثانوية العامة', en: 'Physics Teacher' },
    bio: {
      ar: 'شرح مبسط لقوانين الفيزياء الكلاسيكية والحديثة مع حلول عملية ونماذج تفاعلية لضمان الدرجات النهائية.',
      en: 'Simplified explanations of classical and modern physics with practical solutions and interactive models.'
    },
    quote: {
      ar: '«الفيزياء هي لغة الكون، وفهمها هو أول خطوة لتغيير العالم.»',
      en: '“Physics is the language of the universe, and understanding it is the first step to changing the world.”'
    },
    image_base: '/images/profile.png',
    image_hover: '/images/me.png',
    experience: { ar: '+12', en: '+12' },
    students_count: { ar: '+3,000', en: '+3,000' },
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
    kicker: { ar: 'زورنا في مقرنا', en: 'Visit our center' },
    title: { ar: 'موقع السنتر', en: 'Our Location' },
    description: {
      ar: 'مقرنا الرئيسي للمحاضرات العملية ومتابعة الطلاب.',
      en: 'Our main center for lectures and student follow-up.'
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
