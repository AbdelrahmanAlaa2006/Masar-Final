export const themeConfig = {
  themeClass: 'aa-power-theme',
  canvasFont: '"Fira Code", monospace',
  primaryColor: '#d4af37',
  secondaryColor: '#cbd5e1',
  particleColors: ['#d4af37', '#cbd5e1', '#3b82f6', '#f59e0b', '#60a5fa', '#fbbf24'],
  formulas: ['01', '10', 'if', 'for', 'code', 'HTML', 'JS', 'C++', 'Python', 'AI', 'Binary'],
  getLineColor: (theme, alpha) => {
    return theme === 'dark'
      ? `rgba(59, 130, 246, ${alpha * 0.22})`
      : `rgba(212, 175, 55, ${alpha * 0.15})`
  },
  drawCustomShape: () => false,
  generateCustomShape: () => 'formula',
  logoUrl: '/images/Power Logo.png',
  faviconUrl: '/images/power-favicon-fixed.png',
  branding: {
    brand_short: { ar: 'منصة باور', en: 'Power Platform' },
    seo_title: {
      ar: 'منصة باور — مستر محمد عبداللاه | تعليم البرمجة والذكاء الاصطناعي',
      en: 'Power Platform — Mr Mohamed Abdella | Programming & AI Education'
    },
    hero_title_a: { ar: 'منصة باور', en: 'Power Platform' },
    hero_title_b: { ar: 'للبرمجة والذكاء الاصطناعي', en: 'for Programming & AI' },
    hero_sub: {
      ar: 'منصة متخصصة في تدريس البرمجة والذكاء الاصطناعي - بأساليب تفاعلية حديثة تبسط المفاهيم البرمجية والتقنية لتأسيس قادة المستقبل.',
      en: 'A specialized platform for programming and artificial intelligence - utilizing modern interactive methodologies to build future tech leaders.'
    }
  },
  teacher: {
    name: { ar: 'محمد عبد اللاه', en: 'Mohamed Abdella' },
    role: { ar: 'أستاذ البرمجة بالتربية والتعليم - عضو مايكروسوفت الأمريكية - دراسات عليا حاسبات ومعلومات', en: 'Programming Teacher - Microsoft USA Member - Postgrad in Computers & Information' },
    bio: {
      ar: 'أستاذ البرمجة بالتربية والتعليم، حاصل على دراسات عليا في الحاسبات والمعلومات وعضو مايكروسوفت الأمريكية. خبرة تزيد عن 20 عاماً في تدريس البرمجة وتأسيس الطلاب على التفكير البرمجي السليم والذكاء الاصطناعي.',
      en: 'Programming teacher at the Ministry of Education, holds postgraduate studies in Computers & Information, and is a member of Microsoft USA. Over 20 years of experience in programming and AI education.'
    },
    quote: {
      ar: '«البرمجة هي البوابة الرئيسية للمستقبل»',
      en: '“Programming is the main gateway to the future”'
    },
    image_base: '/images/Mr Mohamed Abdella Image.png',
    image_hover: '/images/Mr Mohamed Abdella Image.png',
    experience: { ar: '+20 عاماً', en: '+20 Years' },
    students_count: { ar: '+10,000 طالب', en: '+10,000 Students' },
    satisfaction: { ar: '99%', en: '99%' },
    target_stage: { ar: 'المراحل الابتدائية، الإعدادية، الثانوية، والبكالوريا', en: 'Primary, Prep, Secondary & Baccalaureate Stages' },
    target_stage_label: { ar: 'المراحل التي يدرّسها', en: 'Stages he teaches' },
    learning_system: { ar: 'أونلاين تفاعلي', en: 'Online Interactive' }
  },
  socials: {
    facebook: 'https://www.facebook.com/share/1CAuoHLo69/',
    whatsapp: 'https://wa.me/201002780259',
    instagram: 'https://www.instagram.com',
    youtube: 'https://youtube.com/@powertec-ai?si=Xa1HYOouu93h5z3K',
    tiktok: 'https://www.tiktok.com'
  },
  location: {
    kicker: { ar: 'تواصل معنا في فروعنا', en: 'Visit our branches' },
    title: { ar: 'مواقع الفروع', en: 'Our Branches' },
    description: {
      ar: 'مقرنا الرئيسي للمحاضرات العملية ومتابعة الطلاب بدمنهور.',
      en: 'Our main branches for lectures and student follow-up in Damanhour.'
    },
    address: {
      ar: 'دمنهور، البحيرة',
      en: 'Damanhour, Beheira'
    },
    branches: [
      {
        name: { ar: 'الفرع الأول', en: 'First Branch' },
        address: {
          ar: 'دمنهور - شارع الراهبات - بجوار السجل المدني (أمام مدرسة الشهيد الرائد أحمد بهجت مناع)',
          en: 'Damanhour - Al-Rahepat St - next to Civil Registry (facing Ahmed Bahgat Manna School)'
        },
        phone: { 
          ar: 'الارضي: 0453176310\nواتساب الفرع: 01500339778\nمستر محمد: 01155731401\nواتساب (عام): 01002780259 - 01155731401 - 01500339778', 
          en: 'Landline: 0453176310\nBranch WhatsApp: 01500339778\nMr. Mohamed: 01155731401\nGeneral WhatsApp: 01002780259 - 01155731401 - 01500339778' 
        },
        directions_link: 'https://maps.google.com'
      },
      {
        name: { ar: 'الفرع الثاني', en: 'Second Branch' },
        address: {
          ar: 'دمنهور - خلف سور الصرف - أول شارع بعد صيدلية منى المر (أمام مسجد عمر بن الخطاب)',
          en: 'Damanhour - Behind Drainage Wall - 1st street after Mona El-Mor Pharmacy (facing Omar Ibn El-Khattab Mosque)'
        },
        phone: { 
          ar: 'اتصال الفرع الثاني: 01142328379\nواتساب (عام): 01002780259 - 01155731401 - 01500339778', 
          en: 'Branch Call: 01142328379\nGeneral WhatsApp: 01002780259 - 01155731401 - 01500339778' 
        },
        directions_link: 'https://maps.google.com'
      }
    ],
    country: { ar: 'جمهورية مصر العربية', en: 'Egypt' },
    map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
    phone: '01002780259 - 01155731401 - 01500339778',
    hours_days: { ar: 'السبت - الخميس', en: 'Sat - Thu' },
    hours_time: { ar: '٣ مساءً - ٩ مساءً', en: '3 PM - 9 PM' },
    directions_link: 'https://maps.google.com',
    whatsapp_link: 'https://wa.me/201002780259'
  }
}

export default themeConfig
