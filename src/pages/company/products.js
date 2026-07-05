/* GitFekra product catalog — configuration-driven.
   To add a future product, drop a new object here. The landing page renders
   these into cards automatically; nothing else needs to change. */

export const RELEASED_PRODUCTS = [
  {
    id: 'edu-platform',
    name: { ar: 'منصة GitFekra التعليمية', en: 'GitFekra Education' },
    tagline: {
      ar: 'منصة SaaS تعليمية متعددة المستأجرين للمدرّسين والمراكز — فيديوهات، امتحانات، حضور، وتقارير لحظية.',
      en: 'A multi-tenant education SaaS for teachers and centers — videos, exams, attendance, and live reports.',
    },
    icon: 'fa-graduation-cap',
    accent: '#7c3aed',
    tags: ['Multi-tenant', 'Video', 'Exams', 'Attendance'],
    status: 'live',
  },
]

export const UPCOMING_PRODUCTS = [
  {
    id: 'soon-1',
    name: { ar: 'قريباً', en: 'In the works' },
    tagline: {
      ar: 'منتج SaaS جديد قيد التطوير — نبنيه بنفس معايير الجودة والأداء.',
      en: 'A new SaaS product under active development — built to the same quality bar.',
    },
    icon: 'fa-cube',
    accent: '#06b6d4',
    tags: ['SaaS'],
    status: 'building',
  },
  {
    id: 'soon-2',
    name: { ar: 'قريباً', en: 'In the works' },
    tagline: {
      ar: 'أدوات للمطوّرين والشركات الناشئة — المزيد قادم.',
      en: 'Tools for developers and startups — more coming.',
    },
    icon: 'fa-bolt',
    accent: '#f59e0b',
    tags: ['Developer tools'],
    status: 'building',
  },
]

export const TECHNOLOGIES = [
  { name: 'React', icon: 'fa-react', brand: true, future: false },
  { name: 'Vite', icon: 'fa-bolt', brand: false, future: false },
  { name: 'Supabase', icon: 'fa-database', brand: false, future: false },
  { name: 'PostgreSQL', icon: 'fa-server', brand: false, future: false },
  { name: 'Cloudflare', icon: 'fa-cloudflare', brand: true, future: false },
  { name: 'TypeScript', icon: 'fa-code', brand: false, future: true },
  { name: 'Node.js', icon: 'fa-node-js', brand: true, future: true },
]
