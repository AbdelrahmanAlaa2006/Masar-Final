export const themeConfig = {
  themeClass: 'aa-mohamed-yasser-theme',
  canvasFont: '"Outfit", "Segoe UI", sans-serif',
  primaryColor: '#ee7d30',
  secondaryColor: '#1c3257',
  particleColors: ['#ee7d30', '#1c3257', '#df5e19', '#0f406a', '#f59e0b', '#2563eb'],
  formulas: [
    'V + ing',
    'S + V + O',
    'have + p.p',
    'had + p.p',
    'Passive: be + p.p',
    'If + Past → would + inf',
    'used to + inf',
    'so... that',
    'too... to',
    'despite + V-ing',
    'although + S + V',
    'will + inf',
    'Grammar',
    'Vocabulary',
    'Translation',
    'Phrasal Verbs',
    'Idioms',
    'Reading Skills',
    'Writing Skills',
    'The more you learn',
    'The more you earn',
    'Best of the Best',
    'Top Marks',
    'A+',
    'English'
  ],
  getLineColor: (theme, alpha) => {
    return theme === 'dark'
      ? `rgba(238, 125, 48, ${alpha * 0.22})`
      : `rgba(28, 50, 87, ${alpha * 0.15})`
  },
  drawCustomShape: () => false,
  generateCustomShape: () => 'formula',
  logoUrl: '/images/Logo Mr Mohamed Yasser.png',
  branding: {
    brand_short: { ar: 'مستر محمد ياسر', en: 'Mr. Mohamed Yasser' },
    hero_title_a: { ar: 'The More You Learn', en: 'The More You Learn' },
    hero_title_b: { ar: 'The More You Earn', en: 'The More You Earn' },
    hero_sub: {
      ar: 'المنصة التعليمية المتكاملة لتدريس وتأسيس مادة اللغة الإنجليزية للمرحلة الثانوية — Best of the Best. شرح مبسط وتدريب مكثف يضمن لك التفوق والدرجة النهائية.',
      en: 'The comprehensive educational platform for high school English — Best of the Best. Simplified explanations, vocabulary mastery, and thorough exam preparation.'
    },
    description: {
      ar: 'منصة مستر محمد ياسر لتعليم اللغة الإنجليزية للمرحلة الثانوية — محاضرات، امتحانات، واجبات، ومتابعة مستمرة.',
      en: 'Mr. Mohamed Yasser English Platform for Secondary Stage — lectures, exams, homework, and continuous student follow-up.'
    }
  },
  teacher: {
    kicker: { ar: 'مستر محمد ياسر', en: 'Mr. Mohamed Yasser' },
    name: { ar: 'محمد ياسر', en: 'Mohamed Yasser' },
    role: { ar: 'معلم أول اللغة الإنجليزية للمرحلة الثانوية', en: 'Senior English Language Teacher' },
    bio: {
      ar: 'معلم متميز للغة الإنجليزية بخبرة 9 سنوات في تدريس وتأسيس طلاب المرحلة الثانوية، متخصص في تبسيط القواعد وشرح مهارات الترجمة والفهم والتدريب المكثف على مواصفات الامتحانات الحديثة بأسلوب تفاعلي.',
      en: 'Senior English educator with 9 years of teaching experience, specializing in secondary curriculum, grammar mastery, translation skills, and comprehensive exam preparation.'
    },
    quote: {
      ar: '«The more you learn , the more you earn .»',
      en: '“The more you learn , the more you earn .”'
    },
    image_base: '/images/Image Mr Mohamed Yasser.png',
    image_hover: '/images/Image Mr Mohamed Yasser.png',
    experience: { ar: '9 سنوات خبرة', en: '9 Years of Exp.' },
    students_count: { ar: '+3,500', en: '+3,500' },
    satisfaction: { ar: '99%', en: '99%' },
    target_stage: { ar: 'المرحلة الثانوية', en: 'Secondary Stage' },
    target_stage_label: { ar: 'المرحلة التي يدرّسها', en: 'Stage taught' },
    learning_system: { ar: 'حضوري بالسنتر وأونلاين تفاعلي', en: 'In-Center & Interactive Online' }
  },
  socials: {
    facebook: 'https://www.facebook.com/share/1EgDqxqLfw/?mibextid=wwXIfr',
    youtube: 'https://youtube.com/@englishwithmohamedyasser?si=-riciQe2OrXqFAHE',
    tiktok: 'https://www.tiktok.com/@k.mohamedyaser?_r=1&_t=ZS-99ECH7FA6Oi',
    whatsapp: 'https://wa.me/201036836301'
  },
  location: {
    kicker: { ar: 'مقر السنتر والمجموعات', en: 'Our Location' },
    title: { ar: 'موقع السنتر', en: 'Center Location' },
    description: {
      ar: 'شارع الرقم القومي بعد الكوبري العلوي أمام محل كريم مكي.',
      en: 'National ID Street, after the flyover bridge, in front of Karim Mekky Store.'
    },
    address: {
      ar: 'شارع الرقم القومي بعد الكوبري العلوي أمام محل كريم مكي',
      en: 'National ID Street, after the flyover, in front of Karim Mekky Store'
    },
    country: { ar: 'جمهورية مصر العربية', en: 'Egypt' },
    map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272!3d31.038!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
    phone: '01036836301',
    hours_days: { ar: 'يومياً', en: 'Daily' },
    hours_time: { ar: '٨:٠٠ ص - ٦:٠٠ م', en: '8:00 AM - 6:00 PM' },
    directions_link: 'https://maps.app.goo.gl/B5A3xiQDpSaqZppG6',
    whatsapp_link: 'https://wa.me/201036836301',
    branches: [
      {
        name: { ar: 'المقر الرئيسي (السنتر)', en: 'Main Center Branch' },
        address: { ar: 'شارع الرقم القومي بعد الكوبري العلوي أمام محل كريم مكي', en: 'National ID Street, after the flyover, in front of Karim Mekky Store' },
        phone: '01036836301',
        directions_link: 'https://maps.app.goo.gl/B5A3xiQDpSaqZppG6',
        map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272!3d31.038!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
        hours_days: { ar: 'يومياً', en: 'Daily' },
        hours_time: { ar: '٨:٠٠ ص - ٦:٠٠ م', en: '8:00 AM - 6:00 PM' }
      }
    ]
  }
}

export default themeConfig
