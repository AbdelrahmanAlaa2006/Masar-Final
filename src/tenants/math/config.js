export const themeConfig = {
  themeClass: 'aa-math-theme',
  canvasFont: 'italic "Cinzel", serif',
  primaryColor: '#c8a951',
  secondaryColor: '#141210',
  particleColors: ['#c8a951', '#e0c878', '#b08d2f', '#d4af37', '#8a6d1f', '#f5e6a8'],
  formulas: ['π', 'σ', '∑', '√', '∫', '∞', 'f(x)', 'x²', 'a²+b²=c²', 'sin(θ)', 'cos(θ)', 'tan(θ)'],
  getLineColor: (theme, alpha) => {
    return theme === 'dark'
      ? `rgba(200, 169, 81, ${alpha * 0.25})`
      : `rgba(176, 141, 47, ${alpha * 0.18})`
  },
  drawCustomShape: () => false,
  generateCustomShape: () => 'formula',
  logoUrl: '/images/logo elbeliqdar cropped.png',
  branding: {
    brand_short: { ar: 'سنتر البلقدار', en: 'El-Belqadar Center' },
    hero_title_a: { ar: 'سنتر البلقدار', en: 'El-Belqadar Center' },
    hero_title_b: { ar: 'للرياضيات والإحصاء', en: 'Math & Statistics' },
    hero_sub: {
      ar: 'منصة تعليمية متخصصة في الرياضيات والإحصاء للثانوية العامة — شرح وافٍ وتمارين تطبيقية وامتحانات دورية تقودك للتفوق.',
      en: 'Specialized education platform for secondary Mathematics and Statistics — comprehensive explanations, practical drills, and regular exams.'
    }
  },
  teacher: {
    name: { ar: 'محمود البلقدار', en: 'Mahmoud El-Belqadar' },
    role: { ar: 'مدرّس الرياضيات والإحصاء', en: 'Mathematics & Statistics Teacher' },
    bio: {
      ar: 'شرح مبسط لقواعد التفاضل والتكامل، الجبر والهندسة الفراغية، والإحصاء بأساليب حديثة وحلول ذكية.',
      en: 'Clear, modern explanations of calculus, algebra, solid geometry, and statistics with smart problem-solving techniques.'
    },
    quote: {
      ar: '«الرياضيات هي لغة العقل والمنطق، والتفوق فيها يبدأ من الفهم السليم.»',
      en: '“Mathematics is the language of logic, and excellence begins with clear understanding.”'
    },
    image_base: '/images/Mr Mahmoud Elbeliqdar image Without BG.png',
    image_hover: '/images/Mr Mahmoud Elbeliqdar image Without BG.png',
    experience: { ar: '+12', en: '+12' },
    students_count: { ar: '+3,500', en: '+3,500' },
    satisfaction: { ar: '99%', en: '99%' },
    target_stage: { ar: 'الثانوية العامة (علمي وأدبي)', en: 'General Secondary' },
    target_stage_label: { ar: 'المراحل التي يدرّسها', en: 'Stages he teaches' },
    learning_system: { ar: 'أونلاين وحضوري', en: 'Online & In-Center' }
  },
  socials: {
    facebook: 'https://www.facebook.com',
    whatsapp: 'https://wa.me/',
    instagram: 'https://www.instagram.com',
    youtube: 'https://www.youtube.com',
    tiktok: 'https://www.tiktok.com'
  },
  location: {
    kicker: { ar: 'زورنا في السنتر', en: 'Visit our center' },
    title: { ar: 'موقع السنتر', en: 'Our Location' },
    description: {
      ar: 'مقرنا الرئيسي للمحاضرات العملية ومتابعة الطلاب.',
      en: 'Our main center for lectures and student follow-up.'
    },
    address: { ar: 'الإسكندرية / دمنهور', en: 'Alexandria / Damanhour' },
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
