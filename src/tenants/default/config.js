export const themeConfig = {
  themeClass: 'aa-default-theme',
  canvasFont: '"Aref Ruqaa", serif',
  // No hardcoded primaryColor/secondaryColor: this shared folder lets each
  // tenant's DB colors drive the theme (applyTenantTheme falls back to
  // tenant.primary_color when themeConfig has none). Subject-specific folders
  // still define their own brand colors.
  particleColors: ['#a86e28', '#c9a24a', '#d8b898', '#8a5e2a', '#b8863b', '#175e54'],
  formulas: ['ض', 'الضاد', 'لغة الضاد', 'أ', 'ب', 'ت', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'هـ', 'و', 'ي', 'ـَ', 'ـُ', 'ـِ', 'ـّ'],
  getLineColor: (theme, alpha) => {
    return theme === 'dark'
      ? `rgba(201, 162, 74, ${alpha * 0.30})`
      : `rgba(168, 110, 40, ${alpha * 0.22})`
  },
  drawCustomShape: (ctx, p, size) => {
    const type = p.type || p.shapeType
    if (type === 'dhad') {
      ctx.font = `bold ${Math.round(size * 9.5)}px "Aref Ruqaa", "Amiri", "Tajawal", serif`
      ctx.fillText('ض', p.x - size * 4.5, p.y + size * 3)
      return true
    }
    if (type === 'aldhad') {
      ctx.font = `bold ${Math.round(size * 7)}px "Aref Ruqaa", "Amiri", "Tajawal", serif`
      ctx.fillText('الضاد', p.x - size * 6, p.y + size * 2.5)
      return true
    }
    return false
  },
  generateCustomShape: () => {
    const rand = Math.random()
    if (rand < 0.25) return 'dhad'
    if (rand < 0.45) return 'aldhad'
    if (rand < 0.85) return 'formula'
    return 'circle'
  },
  logoUrl: null,
  branding: {
    brand_short: { ar: 'منصة مسار التعليمية', en: 'Masar Educational Platform' },
    hero_title_a: { ar: 'اللغة العربية', en: 'Arabic Language' },
    hero_title_b: { ar: 'لغة الضاد بطعم جديد', en: 'made enjoyable' },
    hero_sub: {
      ar: 'منصة تعليمية متخصّصة في اللغة العربية — سجّل حسابك، يتم اعتماده، وابدأ رحلتك مع شرح يخلّيك تفهم وتحب اللغة.',
      en: 'A learning platform dedicated to Arabic. Create your account, get approved, and start learning with a teacher who makes the language click.'
    }
  },
  teacher: {
    name: { ar: 'عبدالرحمن علاء', en: 'Abdelrahman Alaa' },
    role: { ar: 'مدرّس اللغة العربية', en: 'Arabic Language Teacher' },
    bio: {
      ar: 'بشرح اللغة العربية بأسلوب بسيط وحديث يقرّب القواعد والنحو والأدب لذهن الطالب. هدفي إن كل طالب يطلع من الدرس فاهم ومستمتع — مش بس حافظ.',
      en: 'I teach Arabic with a modern, approachable style that brings grammar, syntax, and literature to life. My goal: every student walks out understanding — not just memorising.'
    },
    quote: {
      ar: '«اللغة العربية مش صعبة — محتاجة بس حد يقدّمها بطريقة صح.»',
      en: '“Arabic isn\'t hard — it just needs to be taught the right way.”'
    },
    image_base: '/images/profile.png',
    image_hover: '/images/me.png',
    experience: { ar: '+10', en: '+10' },
    students_count: { ar: '+2,000', en: '+2,000' },
    satisfaction: { ar: '98%', en: '98%' },
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
    kicker: { ar: 'زورنا', en: 'Visit us' },
    title: { ar: 'موقعنا على الخريطة', en: 'Find Us on the Map' },
    description: {
      ar: 'تقدر تزورنا في مقرّنا بدمنهور — قريب وسهل توصله.',
      en: 'Drop by our center in Damanhour — easy to find and easy to reach.'
    },
    address: { ar: 'دمنهور، البحيرة', en: 'Damanhour, Beheira' },
    country: { ar: 'جمهورية مصر العربية', en: 'Arab Republic of Egypt' },
    map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
    phone: '+20 XXX XXX XXXX',
    hours_days: { ar: 'السبت – الخميس', en: 'Sat – Thu' },
    hours_time: { ar: '٩ صباحًا – ٩ مساءً', en: '9 AM – 9 PM' },
    directions_link: 'https://maps.app.goo.gl/W93aUn2jgM7cb2tT7',
    whatsapp_link: 'https://wa.me/20XXXXXXXXXX'
  }
}

export default themeConfig
