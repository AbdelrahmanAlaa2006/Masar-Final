/* GitFekra site data — configuration-driven.
   Everything the landing page lists (services, client platforms, process
   steps) lives here as data. To feature a new teacher platform, add an entry
   to PLATFORMS; nothing else needs to change. */

// Platforms built and operated for clients — shown as independent products.
// status: 'live' = launched and in use, 'soon' = signed and being prepared.
export const PLATFORMS = [
  {
    id: 'miracle-english',
    status: 'live',
    name: { ar: 'The Miracle in English', en: 'The Miracle in English' },
    owner: { ar: 'أ. وليد أحمد فوزي', en: 'Mr. Waled Ahmed Fawzy' },
    subject: { ar: 'اللغة الإنجليزية — ابتدائي وإعدادي', en: 'English — Primary & Preparatory' },
    blurb: {
      ar: 'منصة متكاملة بهوية ذهبية مميزة: فيديوهات، امتحانات، ومتابعة أولياء الأمور.',
      en: 'A complete platform with a signature gold identity: videos, exams, and parent follow-up.',
    },
    accent: '#b08d2f',
    url: null,
  },
  {
    id: 'power-platform',
    status: 'live',
    name: { ar: 'منصة باور', en: 'Power Platform' },
    owner: { ar: 'أ. محمد عبد اللاه', en: 'Mr. Mohamed Abdella' },
    subject: { ar: 'البرمجة والذكاء الاصطناعي', en: 'Programming & AI' },
    blurb: {
      ar: 'منصة لتعليم البرمجة والذكاء الاصطناعي بفرعين ومتابعة إلكترونية كاملة للطلاب.',
      en: 'A programming & AI education platform with two branches and full digital student tracking.',
    },
    accent: '#8a6d1f',
    url: null,
  },
  {
    id: 'mona-chem',
    status: 'soon',
    name: { ar: 'منصة الكيمياء', en: 'Chemistry Platform' },
    owner: { ar: 'أ. منى أحمد', en: 'Ms. Mona Ahmed' },
    subject: { ar: 'الكيمياء — ثانوية عامة', en: 'Chemistry — Secondary' },
    blurb: {
      ar: 'تجربة تعليمية بهوية خاصة بالمعلمة: محتوى محمي، تقييمات دورية، وتقارير للأهالي.',
      en: 'A branded learning experience: protected content, periodic assessments, and parent reports.',
    },
    accent: '#0f766e',
    url: null,
  },
  {
    id: 'sherif-physics',
    status: 'soon',
    name: { ar: 'منصة الفيزياء', en: 'Physics Platform' },
    owner: { ar: 'أ. شريف محمد', en: 'Mr. Sherif Mohamed' },
    subject: { ar: 'الفيزياء — ثانوية عامة', en: 'Physics — Secondary' },
    blurb: {
      ar: 'فيديوهات عالية الجودة وامتحانات إلكترونية بنتائج فورية ومتابعة حضور بالباركود.',
      en: 'High-quality videos, instant-result online exams, and barcode attendance.',
    },
    accent: '#1d4ed8',
    url: null,
  },
]

// What GitFekra delivers with every platform — rendered as numbered rows.
export const SERVICES = [
  {
    id: 'identity',
    title: { ar: 'منصة باسمك وهويتك', en: 'A platform under your name' },
    body: {
      ar: 'اسمك، شعارك، ألوانك، ونطاقك الخاص. طلابك يرون علامتك أنت — من صفحة الدخول حتى تقارير أولياء الأمور.',
      en: 'Your name, your logo, your colors, your domain. Students see your brand — from the login page to parent reports.',
    },
  },
  {
    id: 'content',
    title: { ar: 'محتوى محمي بجودة عالية', en: 'Protected, high-quality content' },
    body: {
      ar: 'فيديوهات ببث سريع ومشاهدة محمية ضد التسريب، مع تتبع حقيقي لنسب المشاهدة لكل طالب.',
      en: 'Fast, leak-protected video streaming with real per-student watch tracking.',
    },
  },
  {
    id: 'assessment',
    title: { ar: 'امتحانات وواجبات إلكترونية', en: 'Online exams & homework' },
    body: {
      ar: 'بنك أسئلة، تصحيح فوري، محاولات محددة، ونتائج تصل للطالب وولي الأمر في لحظتها.',
      en: 'Question banks, instant grading, attempt limits, and results that reach students and parents immediately.',
    },
  },
  {
    id: 'center',
    title: { ar: 'إدارة السنتر والحضور', en: 'Center & attendance management' },
    body: {
      ar: 'حضور بالبطاقة والباركود، إشعارات واتساب لأولياء الأمور، وإدارة مجموعات وفروع وأعوام دراسية.',
      en: 'Card & barcode attendance, WhatsApp notifications to parents, and management of groups, branches, and academic years.',
    },
  },
  {
    id: 'payments',
    title: { ar: 'اشتراكات ومدفوعات', en: 'Subscriptions & payments' },
    body: {
      ar: 'باقات ومحفظة ومتابعة مالية واضحة لكل طالب — أونلاين وفي السنتر.',
      en: 'Packages, wallets, and a clear financial record per student — online and in-center.',
    },
  },
  {
    id: 'insight',
    title: { ar: 'تقارير تُطمئن الأهل', en: 'Reports parents trust' },
    body: {
      ar: 'ولي الأمر يتابع الحضور والدرجات والمشاهدة من رابط واحد، بدون حساب وبدون تعقيد.',
      en: 'Parents follow attendance, grades, and watch progress from a single link — no account, no friction.',
    },
  },
]

// How an engagement runs, start to finish.
export const PROCESS = [
  {
    n: '01',
    title: { ar: 'نفهم طريقتك', en: 'We learn how you teach' },
    body: {
      ar: 'جلسة معك نفهم فيها موادك، مراحلك الدراسية، ونظام سنترك قبل أي شاشة.',
      en: 'A working session on your subjects, stages, and how your center runs — before any screens.',
    },
  },
  {
    n: '02',
    title: { ar: 'نجهّز منصتك', en: 'We build your platform' },
    body: {
      ar: 'هوية كاملة باسمك وألوانك، وإعداد المراحل والمجموعات والفروع كما تعمل فعلياً.',
      en: 'Full identity under your name and colors, with stages, groups, and branches set up the way you actually work.',
    },
  },
  {
    n: '03',
    title: { ar: 'ننقل المحتوى وندرّب فريقك', en: 'We migrate content & train your team' },
    body: {
      ar: 'رفع الفيديوهات وبنوك الأسئلة، وتدريب المساعدين على الإدارة اليومية.',
      en: 'Uploading videos and question banks, and training assistants on day-to-day management.',
    },
  },
  {
    n: '04',
    title: { ar: 'إطلاق ومتابعة', en: 'Launch & ongoing support' },
    body: {
      ar: 'نطلق المنصة لطلابك ونبقى معك: دعم مستمر، تحسينات، وتطوير حسب احتياجك.',
      en: 'We launch to your students and stay with you: continuous support, refinements, and development as you grow.',
    },
  },
]
