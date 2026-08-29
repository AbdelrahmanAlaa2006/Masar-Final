export const themeConfig = {
  themeClass: 'aa-elsharawy-theme',
  canvasFont: '"Outfit", "Tajawal", "Segoe UI", sans-serif',
  primaryColor: '#a86e28',
  secondaryColor: '#175e54',
  particleColors: ['#a86e28', '#175e54', '#c9a24a', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'],
  formulas: [
    // الرياضيات والحساب (Math & Numbers)
    '1 + 1 = 2',
    '5 × 5 = 25',
    '10 ÷ 2 = 5',
    '100%',
    '1/2',
    '3/4',
    '10 + 20',
    '＋',
    '×',
    '÷',
    '＝',
    'Math',
    
    // اللغة الإنجليزية والتأسيس (English & Phonics)
    'ABC',
    '123',
    'Phonics',
    'Grammar',
    'Vocabulary',
    'Reading',
    'A+',
    'Super Star',
    'Good Job',
    
    // العلوم والاستكشاف (Science & Discovery)
    'H₂O',
    'علوم',
    'طاقة',
    'كواكب',
    'نبات',
    'حيوانات',
    'اكتشف',
    'Science',
    'Nature',
    
    // الدراسات واللغة العربية (Social Studies & Arabic)
    'نحو',
    'قراءة',
    'إملاء',
    'تعبير',
    'أساليب',
    'دراسات',
    'تاريخ',
    'جغرافيا',
    'خريطة',
    'أهرامات',
    'حضارة',
    
    // التميز وصناعة الأبطال (Champion Terms)
    'صانع الأبطال',
    'المتفوقين',
    'الدرجة النهائية',
    'أبطال الابتدائي',
    'Top Marks',
    'Champion'
  ],
  getLineColor: (theme, alpha) => {
    return theme === 'dark'
      ? `rgba(168, 110, 40, ${alpha * 0.25})`
      : `rgba(23, 94, 84, ${alpha * 0.18})`
  },
  drawCustomShape: () => false,
  generateCustomShape: () => 'formula',
  logoUrl: '/images/Elshaarawy Logo.png',
  branding: {
    brand_short: { ar: 'منصة الشعراوي', en: 'Elshaarawy Platform' },
    hero_title_a: { ar: 'منصة الشعراوي', en: 'Elshaarawy Platform' },
    hero_title_b: { ar: 'صانع الأبطال — المرحلة الابتدائية', en: 'Champion Maker — Primary Stage' },
    hero_sub: {
      ar: 'المنصة التعليمية المتكاملة لتدريس وتأسيس مختلف مواد المرحلة الابتدائية — شرح تفاعلي مبسط، تدريبات مستمرة، ومتابعة دقيقة لصناعة جيل من الأبطال.',
      en: 'The comprehensive platform for teaching and establishing all primary stage subjects — interactive explanations, continuous exercises, and meticulous follow-up to build champions.'
    },
    description: {
      ar: 'منصة الشعراوي لتأسيس وتدريس جميع مواد المرحلة الابتدائية بمناهج حديثة وشرح ممتع وتفاعلي.',
      en: 'Elshaarawy Platform for primary stage all-subject education and core foundation.'
    }
  },
  teacher: {
    kicker: { ar: 'الأستاذ المحاضر', en: 'Lecturer' },
    name: { ar: 'الشعراوي', en: 'Elshaarawy' },
    role: { ar: 'صانع الأبطال — معلم مختلف مواد المرحلة الابتدائية والتأسيس', en: 'Champion Maker — Primary Subjects & Foundations Teacher' },
    bio: {
      ar: 'معلم متميز ومتخصص في تدريس وتأسيس طلاب المرحلة الابتدائية في مختلف المواد الدراسية، أسلوب تعليمي تربوي محفز يبسط المعلومات ويعزز مهارات التفكير والتفوق الدراسي.',
      en: 'Senior primary educator specializing in multi-subject foundation and interactive learning.'
    },
    quote: {
      ar: '«التعليم بالتأسيس السليم يصنع أبطال المستقبل»',
      en: '“Solid foundational learning creates future champions.”'
    },
    image_base: '/images/ELshaarawy Teacher Image.png',
    image_hover: '/images/ELshaarawy Teacher Image.png',
    experience: { ar: '+10 سنوات خبرة', en: '+10 Years Exp' },
    students_count: { ar: '+2,500 بطل', en: '+2,500 Champions' },
    satisfaction: { ar: '99%', en: '99%' },
    target_stage: { ar: 'المرحلة الابتدائية (تأسيس ومواد متعددة)', en: 'Primary Stage (All Subjects)' },
    target_stage_label: { ar: 'المرحلة والتخصص', en: 'Stage & Specialization' },
    learning_system: { ar: 'حضوري وأونلاين تفاعلي', en: 'In-Person & Online Interactive' }
  },
  socials: {
    facebook: 'https://www.facebook.com',
    whatsapp: 'https://wa.me/',
    instagram: 'https://www.instagram.com',
    youtube: 'https://www.youtube.com',
    tiktok: 'https://www.tiktok.com'
  }
}

export default themeConfig
