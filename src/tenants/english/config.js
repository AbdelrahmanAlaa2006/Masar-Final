export const themeConfig = {
  themeClass: 'aa-english-theme',
  canvasFont: 'italic "Playfair Display", serif',
  primaryColor: '#d4af37',
  secondaryColor: '#cbd5e1',
  particleColors: ['#d4af37', '#cbd5e1', '#3b82f6', '#f59e0b', '#60a5fa', '#fbbf24'],
  formulas: ['Hello', 'World', 'Verb', 'Noun', 'English', 'A', 'B', 'C', 'Grammar', 'Poetry', 'Drama'],
  getLineColor: (theme, alpha) => {
    return theme === 'dark'
      ? `rgba(59, 130, 246, ${alpha * 0.22})`
      : `rgba(212, 175, 55, ${alpha * 0.15})`
  },
  drawCustomShape: () => false,
  generateCustomShape: () => 'formula',
  logoUrl: '/images/Logo The Miracle.png',
  branding: {
    brand_short: { ar: 'The Miracle', en: 'The Miracle' },
    hero_title_a: { ar: 'The Miracle', en: 'The Miracle' },
    hero_title_b: { ar: 'In English', en: 'In English' },
    hero_sub: {
      ar: 'رؤية جديدة .. طرق جديدة .. بداية جديدة. منصة الأستاذ وليد أحمد فوزي لتعليم اللغة الإنجليزية للمرحلتين الابتدائية والإعدادية.',
      en: "Mr. Waled Ahmed Fawzy's platform for primary and preparatory English education - new vision, new methods, new beginning."
    }
  },
  teacher: {
    name: { ar: 'وليد أحمد فوزي', en: 'Waled Ahmed Fawzy' },
    role: { ar: 'خبير تعليم اللغة الإنجليزية - عضو جمعية اللغويين والمترجمين سابقاً', en: 'English Language Expert - Former Member of the Association of Linguists and Translators' },
    bio: {
      ar: 'رؤية جديدة.. طرق جديدة.. بداية جديدة. تبسيط شامل لمنهج اللغة الإنجليزية للمرحلتين الابتدائية والإعدادية، القواعد والنصوص والترجمة، باستخدام طرق تعليمية تفاعلية وحديثة تضمن التميز والدرجة النهائية.',
      en: 'New vision.. new methods.. new beginning. Comprehensive explanation of the English curriculum, grammar, and translation for primary and preparatory stages with modern interactive methodologies for guaranteed top marks.'
    },
    quote: {
      ar: '«السر ليس في الحفظ، بل في امتلاك المفتاح الحقيقي لفهم اللغة والتميز بها.»',
      en: '“The secret is not in memorization, but in possessing the real key to understanding and mastering the language.”'
    },
    image_base: '/images/Mr Waleed Fawzy Image.png',
    image_hover: '/images/Mr Waleed Fawzy Image.png',
    experience: { ar: '+20', en: '+20' },
    students_count: { ar: '+5,000', en: '+5,000' },
    satisfaction: { ar: '99%', en: '99%' },
    target_stage: { ar: 'الابتدائية والإعدادية', en: 'Primary & Preparatory' },
    target_stage_label: { ar: 'المراحل التي يدرّسها', en: 'Stages he teaches' },
    learning_system: { ar: 'أونلاين تفاعلي', en: 'Online Interactive' }
  },
  socials: {
    facebook: 'https://www.facebook.com',
    whatsapp: 'https://wa.me/201005387099',
    instagram: 'https://www.instagram.com',
    youtube: 'https://www.youtube.com',
    tiktok: 'https://www.tiktok.com'
  },
  location: {
    kicker: { ar: 'مقرنا السنتر الرئيسي', en: 'Our main center' },
    title: { ar: 'موقع السنتر', en: 'Center Location' },
    description: {
      ar: 'دمنهور- خلف تشاو مول - ش توب جيم امام صيدلية عمرو زكريا.',
      en: 'Damanhour - Behind Chao Mall - Top Gym Street - In front of Amrou Zakaria Pharmacy.'
    },
    address: { 
      ar: 'دمنهور - خلف تشاو مول - ش توب جيم امام صيدلية عمرو زكريا', 
      en: 'Damanhour - Behind Chao Mall - Top Gym Street - In front of Amrou Zakaria Pharmacy' 
    },
    country: { ar: 'جمهورية مصر العربية', en: 'Egypt' },
    map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
    phone: '01005387099 - 01025684017',
    hours_days: { ar: 'السبت - الخميس', en: 'Sat - Thu' },
    hours_time: { ar: '١٢ مساءً - ٩ مساءً', en: '12 PM - 9 PM' },
    directions_link: 'https://maps.google.com',
    whatsapp_link: 'https://wa.me/201005387099'
  }
}

export default themeConfig
