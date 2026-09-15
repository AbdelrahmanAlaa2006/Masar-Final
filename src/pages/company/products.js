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
    image: '/images/Mr Waleed Fawzy Image.png',
    imagePosition: 'center 18%',
    logo: '/images/Logo The Miracle.png',
    url: '/login?tenant=waled-english',
  },
  {
    id: 'power-platform',
    status: 'live',
    name: { ar: 'منصة باور', en: 'Power Platform' },
    owner: { ar: 'أ. محمد عبد اللاه', en: 'Mr. Mohamed Abdella' },
    subject: {
      ar: 'البرمجة والذكاء الاصطناعي — الإعدادية والبكالوريا والثانوية (عام وأزهر)',
      en: 'Programming & AI — Prep, Baccalaureate & Secondary (General & Azhar)',
    },
    blurb: {
      ar: 'منصة لتعليم البرمجة والذكاء الاصطناعي بفرعين ومتابعة إلكترونية كاملة للطلاب.',
      en: 'A programming & AI education platform with two branches and full digital student tracking.',
    },
    accent: '#8a6d1f',
    image: '/images/Mr Mohamed Abdella Image.png',
    imagePosition: 'center 0%',
    imageStyle: { transform: 'translateY(5px) scale(1.08)' },
    logo: '/images/Power Logo.png',
    url: 'https://mrmohamedabdella.com/login',
  },
  {
    id: 'belqadar-math',
    status: 'live',
    name: { ar: 'سنتر البلقدار', en: 'El-Belqadar Center' },
    owner: { ar: 'أ. محمود البلقدار', en: 'Mr. Mahmoud El-Belqadar' },
    subject: {
      ar: 'الرياضيات والإحصاء — البكالوريا والثانوية (عام وأزهر)',
      en: 'Mathematics & Statistics — Baccalaureate & Secondary (General & Azhar)',
    },
    blurb: {
      ar: 'منصة متكاملة لشرح الرياضيات والإحصاء: محاضرات تفاعلية، امتحانات إلكترونية دورية، ومتابعة فورية للدرجات والغياب.',
      en: 'A comprehensive platform for Mathematics and Statistics: interactive lectures, regular digital exams, and real-time attendance & grade tracking.',
    },
    accent: '#c8a951',
    image: '/images/Mr Mahmoud Elbeliqdar image Without BG.png',
    imagePosition: 'center 16%',
    logo: '/images/logo elbeliqdar cropped.png',
    url: '/login?tenant=math',
  },
  {
    id: 'eldad-arabic',
    status: 'live',
    name: { ar: 'منصة الضاد', en: 'Al-Dhad Platform' },
    owner: { ar: 'أ. خالد الشريف', en: 'Mr. Khalid El Sharif' },
    subject: {
      ar: 'اللغة العربية — البكالوريا والثانوية العامة',
      en: 'Arabic Language — Baccalaureate & General Secondary',
    },
    blurb: {
      ar: 'منصة متكاملة لتدريس اللغة العربية: فيديوهات عالية الجودة، امتحانات إلكترونية، ومتابعة حضور أولياء الأمور.',
      en: 'A comprehensive Arabic language platform: high-quality videos, online exams, and parent attendance tracking.',
    },
    accent: '#a86e28',
    image: '/images/Mr Khalid Elsherif Image Cropped.jpg',
    imagePosition: 'center center',
    logo: '/images/Logo Eldad Arabic Without BG.png',
    url: 'https://mrkhalidelsharif.com/login',
  },
  {
    id: 'elsharawy-primary',
    status: 'live',
    name: { ar: 'الشعراوي (صانع الأبطال)', en: 'Elshaarawy Platform' },
    owner: { ar: 'أ. الشعراوي', en: 'Mr. Elshaarawy' },
    subject: {
      ar: 'مختلف مواد المرحلة الابتدائية والتأسيس',
      en: 'Primary Stage Multi-Subject & Foundation',
    },
    blurb: {
      ar: 'منصة تعليمية متكاملة لتدريس وتأسيس مختلف مواد المرحلة الابتدائية وصناعة الأبطال بأسلوب تفاعلي مبسط.',
      en: 'A comprehensive primary stage platform teaching multiple subjects with an engaging, interactive approach.',
    },
    accent: '#a86e28',
    image: '/images/ELshaarawy Teacher Image.png',
    imagePosition: 'center 15%',
    logo: '/images/Elshaarawy Logo.png',
    url: '/login?tenant=elsharawy',
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

// Product tour — real screenshots of the platform, shown as a framed strip.
// role: 'student' | 'admin' — rendered as a chip on each frame.
export const TOUR = [
  {
    id: 'student-home',
    role: 'student',
    img: '/images/tour-student-home.jpg',
    title: { ar: 'الصفحة الرئيسية للطالب', en: 'Student home' },
    caption: { ar: 'نظرة عامة وتقدّم الطالب — يكمل من حيث توقف بضغطة واحدة.', en: 'Overview and progress — students pick up right where they left off.' },
  },
  {
    id: 'videos',
    role: 'student',
    img: '/images/tour-videos.jpg',
    title: { ar: 'مكتبة الفيديوهات', en: 'Video library' },
    caption: { ar: 'محاضرات منظمة بمواعيد إتاحة، ومشاهدة محمية مع تتبع لكل طالب.', en: 'Organized lectures with availability windows and protected, tracked viewing.' },
  },
  {
    id: 'exams',
    role: 'student',
    img: '/images/tour-exams.jpg',
    title: { ar: 'الامتحانات الإلكترونية', en: 'Online exams' },
    caption: { ar: 'امتحانات شاملة وتسميعات دورية بتصحيح فوري ونتائج لحظية.', en: 'Comprehensive exams and recurring quizzes with instant grading.' },
  },
  {
    id: 'homework',
    role: 'student',
    img: '/images/tour-homework.jpg',
    title: { ar: 'الواجبات', en: 'Homework' },
    caption: { ar: 'حل الواجبات ورفع الإجابات إلكترونياً مع تقييم المعلم وملاحظاته.', en: 'Students submit answers digitally and get teacher feedback.' },
  },
  {
    id: 'reports',
    role: 'student',
    img: '/images/tour-reports.jpg',
    title: { ar: 'تقارير الطالب', en: 'Student reports' },
    caption: { ar: 'نتائج الفيديوهات والامتحانات والواجبات في تقارير واضحة للطالب وولي الأمر.', en: 'Video, exam, and homework results in clear reports for students and parents.' },
  },
  {
    id: 'student-payments',
    role: 'student',
    img: '/images/tour-student-payments.jpg',
    title: { ar: 'بوابة الدفع', en: 'Payment gateway' },
    caption: { ar: 'اشتراك بفودافون كاش أو إنستا باي ورفع الإيصال — التفعيل خلال دقائق.', en: 'Subscribe via mobile wallet or InstaPay and upload the receipt — activation in minutes.' },
  },
  {
    id: 'chat',
    role: 'student',
    img: '/images/tour-chat.jpg',
    title: { ar: 'محادثة المعلم', en: 'Teacher chat' },
    caption: { ar: 'تواصل مباشر بين الطالب والمعلم بالنص والصور والرسائل الصوتية.', en: 'Direct student–teacher chat with text, images, and voice notes.' },
  },
  {
    id: 'profile',
    role: 'student',
    img: '/images/tour-profile.jpg',
    title: { ar: 'الملف الشخصي والبطاقة الرقمية', en: 'Profile & digital ID' },
    caption: { ar: 'بيانات الطالب وبطاقته الرقمية لتسجيل الحضور في السنتر.', en: 'Student details and the digital ID card used for center check-in.' },
  },
  {
    id: 'admin-home',
    role: 'admin',
    img: '/images/tour-admin-home.jpg',
    title: { ar: 'لوحة المشرف الرئيسية', en: 'Admin dashboard' },
    caption: { ar: 'نظرة عامة على المنصة وإجراءات سريعة — كل شيء تحت يد المعلم.', en: 'Platform overview and quick actions — everything at the teacher’s fingertips.' },
  },
  {
    id: 'admin-panel',
    role: 'admin',
    img: '/images/tour-admin-panel.jpg',
    title: { ar: 'مركز التحكم الكامل', en: 'Full control center' },
    caption: { ar: 'ستة عشر قسماً لإدارة كل شيء: الحضور، الفيديوهات، المجموعات، الفروع، الصلاحيات، والمزيد.', en: 'Sixteen sections to manage everything: attendance, videos, groups, branches, permissions, and more.' },
  },
  {
    id: 'attendance',
    role: 'admin',
    img: '/images/tour-attendance.jpg',
    title: { ar: 'الحضور بالباركود', en: 'Barcode attendance' },
    caption: { ar: 'تحضير السنتر بالبطاقات الذكية — مسح فوري وإشعار لولي الأمر.', en: 'Smart-card check-in at the center with instant parent notifications.' },
  },
  {
    id: 'grades',
    role: 'admin',
    img: '/images/tour-grades.jpg',
    title: { ar: 'رصد الدرجات', en: 'Grade entry' },
    caption: { ar: 'رصد درجات الواجبات والاختبارات والتقييم السلوكي للطلاب دفعة واحدة.', en: 'Batch entry for homework, test, and behavior grades.' },
  },
  {
    id: 'payments',
    role: 'admin',
    img: '/images/tour-payments.jpg',
    title: { ar: 'تقارير المدفوعات', en: 'Payment reports' },
    caption: { ar: 'متابعة الاشتراكات والتحويلات المالية وتفعيل الحسابات فوراً.', en: 'Track subscriptions and transfers, and activate accounts instantly.' },
  },
]
