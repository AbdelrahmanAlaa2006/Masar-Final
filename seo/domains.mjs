/* ---------------------------------------------------------------------------
   Per-domain SEO registry (single source of truth).

   Why this exists: the app is ONE static SPA served on MANY custom domains.
   A shared index.html meant every domain served the first tenant's title,
   Open Graph card and — critically — a cross-domain <link rel="canonical">,
   which tells Google "this page is a duplicate of the other domain, index
   that one instead". That alone would stop a new teacher domain from ever
   ranking.

   scripts/build-seo.mjs reads this file after `vite build` and emits one
   pre-rendered HTML per domain (dist/<key>.html). vercel.json routes each
   host to its own file. Non-JS crawlers (WhatsApp, Facebook, Bing) get the
   right head; Google gets it too, before JS even runs.

   ADDING A NEW TEACHER DOMAIN: add an entry here, add the two rewrite lines
   in vercel.json, and add the domain in Vercel + DNS. No other code changes.
   --------------------------------------------------------------------------- */

export const DEFAULT_KEY = 'default'

export const DEVELOPERS = [
  {
    key: 'abdelrahman',
    name: 'Abdelrahman Alaa',
    alternateName: ['عبدالرحمن علاء', 'عبد الرحمن علاء', 'Abdelrahman Alaa'],
    jobTitle: 'Cybersecurity Engineer & Full-Stack Web Developer',
    image: '/images/Abdelrahman%20Photo%20Facebook.jpg',
    affiliation: {
      '@type': 'EducationalOrganization',
      name: 'Faculty of Computers and Data Science, Alexandria University',
      alternateName: ['كلية الحاسبات وعلوم البيانات - جامعة الإسكندرية', 'Alexandria University', 'FCDS Alexandria'],
    },
    knowsAbout: [
      'Cybersecurity',
      'Full-Stack Web Development',
      'Information Security',
      'Software Architecture',
      'Database Engineering',
      'React',
      'Node.js',
      'Scalable Web Platform Engineering',
      'Computer Science',
      'Data Science',
    ],
    sameAs: [
      'https://github.com/AbdelrahmanAlaa2006',
      'https://www.linkedin.com/in/abdelrahman-alaa2006',
      'https://www.facebook.com/abdelrahman.alaa.988711',
      'https://www.instagram.com/abd_elrahman_alaa3/',
    ],
  },
  {
    key: 'eyad',
    name: 'Eyad Elalkamy',
    alternateName: ['إياد العلقامي', 'إياد عاطف العلقامي', 'Eyad Atef Elalkamy'],
    jobTitle: 'Cybersecurity Engineer & UI/UX Designer',
    image: '/images/Eyad%20Photo%20Instagram.jpg',
    affiliation: {
      '@type': 'EducationalOrganization',
      name: 'Faculty of Computers and Data Science, Alexandria University',
      alternateName: ['كلية الحاسبات وعلوم البيانات - جامعة الإسكندرية', 'Alexandria University', 'FCDS Alexandria'],
    },
    knowsAbout: [
      'Cybersecurity',
      'Frontend Architecture',
      'Software Engineering',
      'React',
      'UI/UX Security',
      'Web Performance',
      'Cloud Applications',
      'Computer Science',
      'Data Science',
    ],
    sameAs: [
      'https://github.com/eyadelalkamy-oss',
      'https://www.linkedin.com/in/eyad-atef-elalkamy-709615385',
      'https://www.facebook.com/eyad.alkamy',
      'https://www.instagram.com/eyad_elalkamy/',
    ],
  },
]

export const DOMAINS = {
  // Primary agency domain
  gitfekra: {
    hosts: ['gitfekra.com', 'www.gitfekra.com'],
    lang: 'ar',
    title: 'GitFekra — جِت فِكرة | نبني لكل مدرّس منصته التعليمية الخاصة',
    description:
      'شركة برمجيات متخصصة في بناء وتطوير المنصات التعليمية المستقلة للمدرّسين — حماية مشفرة ضد التسريب، امتحانات وتصحيح تلقائي، حضور، مدفوعات، ومتابعة أولياء الأمور.',
    keywords:
      'GitFekra, جِت فِكرة, برمجة منصات تعليمية, منصة تعليمية للمدرسين, عمل منصة تعليمية, حماية فيديوهات المدرسين, موقع تعليمي للمدرس, منصة سنتر, EdTech Egypt, Software Agency, Abdelrahman Alaa, Eyad Elalkamy',
    author: 'GitFekra — جِت فِكرة',
    canonical: 'https://gitfekra.com/',
    ogImage: '',
    themeColor: '#14110e',
    favicon: '',
    faviconType: '',
    siteName: 'GitFekra — جِت فِكرة',
    jsonLd: {
      org: {
        name: 'GitFekra',
        alternateName: ['جِت فِكرة', 'GitFekra Software Engineering'],
        description: 'شركة برمجيات متخصصة في بناء وتطوير المنصات التعليمية المستقلة للمدرّسين والمراكز التعليمية.',
        telephone: '',
        addressLocality: 'Alexandria',
        addressRegion: 'Alexandria',
      },
    },
  },

  // Fallback used for the base index.html (preview deploys, *.vercel.app,
  // localhost, and any host without its own entry). Deliberately brand-neutral
  // so an unknown host never advertises a specific teacher.
  default: {
    hosts: [],
    lang: 'ar',
    title: 'GitFekra — جِت فِكرة | منصات تعليمية متكاملة للمدرّسين',
    description:
      'منصات تعليمية متكاملة للمدرسين: محاضرات وفيديوهات وامتحانات وواجبات ومتابعة دقيقة لأداء كل طالب.',
    keywords: 'منصة تعليمية, تعليم أونلاين, محاضرات, امتحانات إلكترونية, متابعة الطلاب, GitFekra',
    author: 'GitFekra',
    canonical: 'https://gitfekra.com/',
    ogImage: '',
    themeColor: '#14110e',
    favicon: '',
    faviconType: '',
    siteName: 'GitFekra',
    jsonLd: null,
  },

  'mohamed-abdella': {
    hosts: ['mrmohamedabdella.com', 'www.mrmohamedabdella.com'],
    lang: 'ar',
    title: 'منصة باور — مستر محمد عبداللاه | البرمجة والذكاء الاصطناعي',
    description:
      'منصة باور التعليمية لمستر محمد عبداللاه — شرح البرمجة والذكاء الاصطناعي وعلوم الحاسب للإعدادي والثانوي والبكالوريا المصرية. امتحانات إلكترونية ومتابعة مستمرة.',
    keywords:
      'محمد عبداللاه, محمد عبد اللاه, مستر محمد عبداللاه, منصة باور, Mohamed Abdella, Mr Mohamed Abdella, Mohamed Abdellah, تعلم البرمجة, الذكاء الاصطناعي, البكالوريا المصرية, منصة تعليمية, تعليم أونلاين, حاسب آلي, Programming Platform, AI Education, Egyptian Baccalaureate',
    author: 'Mr Mohamed Abdella — مستر محمد عبداللاه',
    canonical: 'https://mrmohamedabdella.com/',
    ogImage: 'https://mrmohamedabdella.com/images/og-image.png',
    themeColor: '#d4af37',
    favicon: '/images/power-favicon-fixed.png',
    faviconType: 'image/png',
    siteName: 'منصة باور — Power Platform',
    jsonLd: {
      person: {
        name: 'Mohamed Abdella',
        alternateName: ['محمد عبد اللاه', 'محمد عبداللاه', 'مستر محمد عبداللاه', 'Mr Mohamed Abdella', 'Mohamed Abdellah', 'Mohamed Abdel Lah'],
        jobTitle: 'Programming & Artificial Intelligence Teacher',
        image: 'https://mrmohamedabdella.com/images/Mr%20Mohamed%20Abdella%20Image.png',
        knowsAbout: ['Programming', 'Artificial Intelligence', 'Computer Science', 'Egyptian Baccalaureate curriculum', 'STEM Education'],
        sameAs: ['https://www.facebook.com/share/1CAuoHLo69/', 'https://youtube.com/@powertec-ai'],
      },
      org: {
        name: 'منصة باور',
        alternateName: ['Power Platform', 'منصة باور للبرمجة والذكاء الاصطناعي'],
        logo: 'https://mrmohamedabdella.com/images/Power%20Logo.png',
        description:
          'منصة تعليمية متخصصة في تدريس البرمجة والذكاء الاصطناعي وعلوم الحاسب لطلاب المراحل الإعدادية والثانوية ونظام البكالوريا المصرية الجديد.',
        telephone: '+201002780259',
        addressLocality: 'Damanhour',
        addressRegion: 'Beheira',
      },
    },
  },

  eldad: {
    hosts: ['mrkhalidelsharif.com', 'www.mrkhalidelsharif.com'],
    lang: 'ar',
    title: 'الضاد — أ. خالد الشريف | لغة عربية البكالوريا المصرية',
    description:
      'منصة الضاد للأستاذ خالد الشريف — شرح اللغة العربية لطلاب نظام البكالوريا المصرية الجديد. النحو والبلاغة والأدب والنصوص بأسلوب حديث مع امتحانات ومتابعة.',
    keywords:
      'خالد الشريف, الاستاذ خالد الشريف, مستر خالد الشريف, منصة الضاد, الضاد, Khalid Elsharif, Mr Khalid Elsharif, Khaled El Sharif, البكالوريا المصرية, نظام البكالوريا الجديد, بكالوريا مصر, عربي البكالوريا, لغة عربية بكالوريا, شرح البكالوريا المصرية, منهج البكالوريا, امتحانات البكالوريا, البكالوريا المستوى الأول, البكالوريا المستوى الثاني, البكالوريا المستوى الثالث, لغة عربية, شرح النحو, البلاغة, الأدب العربي, النصوص, منصة تعليمية, تعليم أونلاين, Egyptian Baccalaureate, Arabic Baccalaureate, Arabic Language Teacher',
    author: 'أ. خالد الشريف — Mr Khalid Elsharif',
    canonical: 'https://mrkhalidelsharif.com/',
    ogImage: 'https://mrkhalidelsharif.com/images/eldad-og.png',
    themeColor: '#a86e28',
    favicon: '/images/eldad-favicon.png',
    faviconType: 'image/png',
    siteName: 'الضاد — أ. خالد الشريف',
    jsonLd: {
      person: {
        name: 'Khalid Elsharif',
        alternateName: ['خالد الشريف', 'أ. خالد الشريف', 'الاستاذ خالد الشريف', 'مستر خالد الشريف', 'Mr Khalid Elsharif', 'Khaled El Sharif'],
        jobTitle: 'Arabic Language Teacher — Egyptian Baccalaureate',
        image: 'https://mrkhalidelsharif.com/images/Mr%20Khalid%20Elsherif%20Image%20Cropped.jpg',
        knowsAbout: ['Arabic Language', 'Arabic Grammar', 'Arabic Literature', 'Rhetoric', 'Egyptian Baccalaureate curriculum', 'اللغة العربية', 'البكالوريا المصرية'],
        sameAs: [],
      },
      org: {
        name: 'منصة الضاد',
        alternateName: ['الضاد', 'Eldad Platform', 'منصة الضاد للغة العربية — البكالوريا المصرية'],
        logo: 'https://mrkhalidelsharif.com/images/eldad-logo.png',
        description:
          'منصة تعليمية متخصصة في تدريس اللغة العربية لطلاب نظام البكالوريا المصرية الجديد — النحو والبلاغة والأدب والنصوص وفق مواصفات البكالوريا، مع امتحانات إلكترونية ومتابعة مستمرة.',
        telephone: '',
        addressLocality: 'Egypt',
        addressRegion: '',
      },
    },
  },

  'belqadar-math': {
    hosts: ['mrmahmoudelbeliqdar.com', 'www.mrmahmoudelbeliqdar.com'],
    lang: 'ar',
    title: 'سنتر البلقدار — أ. محمود البلقدار | الرياضيات والماث',
    description:
      'منصة أستاذ محمود البلقدار التعليمية (سنتر البلقدار) — شرح الرياضيات والماث لطلاب المراحل الثانوية والإعدادية ونظام البكالوريا المصرية الجديد، مع امتحانات إلكترونية ومتابعة أولياء الأمور.',
    keywords:
      'محمود البلقدار, أستاذ محمود البلقدار, مستر محمود البلقدار, سنتر البلقدار, محمود بلقدار, Mahmoud Elbeliqdar, Mr Mahmoud Elbeliqdar, belqadar-math, رياضيات, ماث, البكالوريا المصرية, منصة تعليمية, تعليم أونلاين, رياضة ثانوي, تفاضل وتكامل, جبر وهندسة فراغية, استاتيكا وديناميكا',
    author: 'أ. محمود البلقدار — Mr Mahmoud Elbeliqdar',
    canonical: 'https://mrmahmoudelbeliqdar.com/',
    ogImage: 'https://mrmahmoudelbeliqdar.com/images/og-belqadar.png',
    themeColor: '#c8a951',
    favicon: '/images/logo elbeliqdar cropped.png',
    faviconType: 'image/png',
    siteName: 'سنتر البلقدار — أ. محمود البلقدار',
    jsonLd: {
      person: {
        name: 'Mahmoud Elbeliqdar',
        alternateName: ['محمود البلقدار', 'أستاذ محمود البلقدار', 'أ. محمود البلقدار', 'مستر محمود البلقدار', 'Mr Mahmoud Elbeliqdar', 'Mahmoud Belqadar'],
        jobTitle: 'Mathematics Teacher — Egyptian Baccalaureate & Secondary Education',
        image: 'https://mrmahmoudelbeliqdar.com/images/logo%20elbeliqdar%20cropped.png',
        knowsAbout: ['Mathematics', 'Math', 'Calculus', 'Algebra', 'Geometry', 'Dynamics', 'Statics', 'Egyptian Baccalaureate curriculum', 'الرياضيات', 'الماث'],
        sameAs: [],
      },
      org: {
        name: 'سنتر البلقدار',
        alternateName: ['Belqadar Math', 'منصة سنتر البلقدار للرياضيات'],
        logo: 'https://mrmahmoudelbeliqdar.com/images/logo%20elbeliqdar%20cropped.png',
        description:
          'منصة تعليمية متخصصة في تدريس الرياضيات والماث لطلاب المرحلة الثانوية ونظام البكالوريا المصرية الجديد مع امتحانات وتصحيح إلكتروني ومتابعة لأولياء الأمور.',
        telephone: '',
        addressLocality: 'Egypt',
        addressRegion: '',
      },
    },
  },

  elsharawy: {
    hosts: ['elsharawy.masaar.app'],
    lang: 'ar',
    title: 'الشعراوي — صانع الأبطال | مختلف مواد المرحلة الابتدائية',
    description:
      'منصة أستاذ الشعراوي التعليمية (صانع الأبطال) — تدريس وتأسيس مختلف مواد المرحلة الابتدائية بشرح تفاعلي وامتحانات ومتابعة أولياء الأمور.',
    keywords:
      'الشعراوي, أستاذ الشعراوي, مستر الشعراوي, صانع الأبطال, منصة الشعراوي, Elshaarawy, Elsharawy, المرحلة الابتدائية, تأسيس ابتدائي, لغة عربية ابتدائي, رياضيات ابتدائي, علوم ابتدائي, دراسات ابتدائي, إنجليزي ابتدائي, منصة تعليمية',
    author: 'أ. الشعراوي — Mr Elshaarawy',
    canonical: 'https://gitfekra.com/login?tenant=elsharawy',
    ogImage: '',
    themeColor: '#a86e28',
    favicon: '/images/Elshaarawy Logo.png',
    faviconType: 'image/png',
    siteName: 'الشعراوي — صانع الأبطال',
    jsonLd: {
      person: {
        name: 'Elshaarawy',
        alternateName: ['الشعراوي', 'أستاذ الشعراوي', 'أ. الشعراوي', 'مستر الشعراوي', 'Mr Elshaarawy', 'صانع الأبطال'],
        jobTitle: 'Primary Stage Multi-Subject Teacher & Foundation Specialist',
        image: '/images/ELshaarawy Teacher Image.png',
        knowsAbout: ['Primary Education', 'Arabic', 'Mathematics', 'Science', 'Social Studies', 'English', 'المرحلة الابتدائية', 'تأسيس الأطفال'],
        sameAs: [],
      },
      org: {
        name: 'منصة الشعراوي صانع الأبطال',
        alternateName: ['Elshaarawy Platform', 'صانع الأبطال'],
        logo: '/images/Elshaarawy Logo.png',
        description:
          'منصة تعليمية متخصصة في تدريس مختلف مواد المرحلة الابتدائية والتأسيس الشامل للطلاب مع امتحانات إلكترونية ومتابعة أولياء الأمور.',
        telephone: '',
        addressLocality: 'Egypt',
        addressRegion: '',
      },
    },
  },
}
