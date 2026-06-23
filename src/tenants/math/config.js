export const themeConfig = {
  themeClass: 'aa-math-theme',
  canvasFont: 'italic "Cinzel", serif',
  primaryColor: '#2563eb',
  secondaryColor: '#3b82f6',
  particleColors: ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#1e40af'],
  formulas: ['π', 'σ', '∑', '√', '∫', '∞', 'f(x)', 'x²', 'a²+b²=c²', 'sin(θ)', 'cos(θ)', 'tan(θ)'],
  getLineColor: (theme, alpha) => {
    return theme === 'dark'
      ? `rgba(96, 165, 250, ${alpha * 0.22})`
      : `rgba(37, 99, 219, ${alpha * 0.15})`
  },
  drawCustomShape: () => false,
  generateCustomShape: () => 'formula',
  logoUrl: null,
  branding: {
    brand_short: { ar: 'منصة الرياضيات', en: 'Math Platform' },
    hero_title_a: { ar: 'علم الرياضيات', en: 'Mathematics Science' },
    hero_title_b: { ar: 'الأرقام بلغة الفهم', en: 'Numbers made easy' },
    hero_sub: {
      ar: 'منصة تعليمية متخصصة في الرياضيات - شرح مبسط وتطبيقات عملية تجعلك تتفوق في المعادلات وتتقن الحساب هندسياً وجبرياً.',
      en: 'An educational platform specializing in mathematics - simplified explanations and practical applications that help you master equations.'
    }
  },
  teacher: {
    name: { ar: 'محمد علي', en: 'Mohamed Ali' },
    role: { ar: 'مدرّس الرياضيات القدير', en: 'Senior Mathematics Teacher' },
    bio: {
      ar: 'شرح مبسط لقواعد الحساب، الجبر، والهندسة بأساليب حديثة وحلول ذكية تؤهلك للتفوق والدرجة النهائية.',
      en: 'Simplified explanations of calculus, algebra, and geometry with modern techniques and smart solutions.'
    },
    quote: {
      ar: '«الرياضيات هي مفتاح كل العلوم، وفهمها يفتح لك أبواب المستقبل.»',
      en: '“Mathematics is the key to all sciences, and understanding it opens the doors to the future.”'
    },
    image_base: '/images/profile.png',
    image_hover: '/images/me.png',
    experience: { ar: '+15', en: '+15' },
    students_count: { ar: '+4,000', en: '+4,000' },
    satisfaction: { ar: '99%', en: '99%' },
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
