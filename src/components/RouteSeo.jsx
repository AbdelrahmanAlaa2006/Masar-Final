import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTenant } from '../contexts/TenantContext'

/* ---------------------------------------------------------------------------
   RouteSeo — runtime SEO manager (title / description / canonical / robots).

   The static <head> in index.html carries the production defaults for
   mrmohamedabdella.com so that non-JS scrapers (Facebook, WhatsApp, LinkedIn)
   get a correct preview. This component keeps Google (which renders JS) in
   sync per route and per tenant:

   - Public routes get a unique title + meta description. On the power tenant
     they are keyword-rich; on every other tenant they derive from the
     tenant's own name, so multi-tenant branding is untouched.
   - Private app routes (dashboard, exams, payments, …) are marked noindex —
     they are auth-gated and must never compete in search results.
   - The canonical tag is only kept on the real production host, and follows
     the current route there. On preview hosts (localhost, *.vercel.app) it
     is removed so previews never claim to be the production site.
   - '/' and '/login' deliberately do NOT get a title here: Login.jsx owns
     the document title on those routes (it reacts to the AR/EN language
     toggle), as does the company landing on the default tenant.
   --------------------------------------------------------------------------- */

/* Every real customer domain (www. is stripped before matching). The canonical
   is kept — and pointed at the CURRENT host — on any of these; on preview
   hosts (localhost, *.vercel.app) it is removed so a preview never claims to
   be production. Keep in sync with seo/domains.mjs + vercel.json.
   NOTE: a single hardcoded host here used to delete the canonical on every
   OTHER custom domain, which would have de-indexed each new teacher site. */
const PRODUCTION_HOSTS = ['gitfekra.com', 'mrmohamedabdella.com', 'mrkhalidelsharif.com', 'mrmahmoudelbeliqdar.com']
const PUBLIC_PATHS = ['/', '/login', '/register', '/credits']
const DEFAULT_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1'

function upsertMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export default function RouteSeo() {
  const location = useLocation()
  // themeConfig is a dependency so this effect re-runs after
  // applyTenantTheme() (which writes document.title = tenant.name) —
  // otherwise the theme pass would overwrite our page titles.
  const { tenant, tenantName, themeConfig } = useTenant()

  useEffect(() => {
    if (!tenant) return

    const path = location.pathname
    const isPublic = PUBLIC_PATHS.includes(path)
    // Brand overrides normalize the power tenant's visible slug.
    const isPower = tenant.slug === 'power-platform'
    const isEldad = tenant.slug === 'eldad'
    const host = window.location.hostname.replace(/^www\./, '')

    // 1. Robots: public pages indexable, app pages not.
    upsertMeta('robots', isPublic ? DEFAULT_ROBOTS : 'noindex, nofollow')

    // 2. Canonical: any real customer domain, pointed at THAT host, per-route.
    const existingCanonical = document.querySelector('link[rel="canonical"]')
    if (PRODUCTION_HOSTS.includes(host) && isPublic) {
      let el = existingCanonical
      if (!el) {
        el = document.createElement('link')
        el.setAttribute('rel', 'canonical')
        document.head.appendChild(el)
      }
      const canonicalPath = (path === '/' || path === '/login') ? '/' : path
      el.setAttribute('href', `https://${host}${canonicalPath}`)
    } else if (existingCanonical) {
      existingCanonical.remove()
    }

    // 3. Unique title + description per public route.
    if (isPublic) {
      const meta = isPower
        ? {
            '/': {
              description:
                'منصة باور التعليمية لمستر محمد عبداللاه (Mr Mohamed Abdella) — شرح البرمجة والذكاء الاصطناعي وعلوم الحاسب للمراحل الإعدادية والثانوية ونظام البكالوريا المصرية الجديد، تعليم أونلاين تفاعلي ومتابعة كاملة للطلاب.'
            },
            '/login': {
              description:
                'تسجيل الدخول إلى منصة باور — منصة مستر محمد عبداللاه لتعليم البرمجة والذكاء الاصطناعي أونلاين لطلاب الإعدادي والثانوي والبكالوريا المصرية. تابع محاضراتك وواجباتك وامتحاناتك.'
            },
            '/register': {
              title: 'إنشاء حساب — منصة باور | مستر محمد عبداللاه',
              description:
                'أنشئ حسابك في منصة باور لمستر محمد عبداللاه وابدأ تعلم البرمجة والذكاء الاصطناعي أونلاين — Join Mr Mohamed Abdella’s programming & AI platform.'
            },
            '/credits': {
              title: 'فريق التطوير والهندسة البرمجية — منصة باور',
              description:
                'تعرّف على المهندسين ومطوري البنية البرمجية لمنصة باور (Abdelrahman Alaa & Eyad Elalkamy) والمعمارية المستخدمة في إدارة المنظومة التعليمية.'
            }
          }
        : isEldad
        ? {
            '/': {
              description:
                'منصة الضاد للأستاذ خالد الشريف — شرح اللغة العربية لطلاب نظام البكالوريا المصرية الجديد: النحو والبلاغة والأدب والنصوص وفق مواصفات البكالوريا، مع امتحانات إلكترونية ومتابعة دقيقة لأداء كل طالب.'
            },
            '/login': {
              description:
                'تسجيل الدخول إلى منصة الضاد — منصة أ. خالد الشريف للغة العربية لطلاب البكالوريا المصرية. تابع محاضراتك وواجباتك وامتحاناتك.'
            },
            '/register': {
              title: 'إنشاء حساب — الضاد | لغة عربية البكالوريا المصرية',
              description:
                'أنشئ حسابك في منصة الضاد للأستاذ خالد الشريف وابدأ رحلتك في لغة عربية البكالوريا المصرية — نحو وبلاغة وأدب ونصوص بأسلوب مبسّط.'
            },
            '/credits': {
              title: 'فريق التطوير والهندسة البرمجية — منصة الضاد',
              description:
                'تعرّف على المهندسين ومطوري البنية البرمجية لمنصة الضاد (Abdelrahman Alaa & Eyad Elalkamy) والمعمارية المستخدمة في إدارة المنظومة التعليمية.'
            }
          }
        : {
            '/': { description: `${tenantName} — منصة تعليمية أونلاين لمتابعة المحاضرات والواجبات والامتحانات.` },
            '/login': { description: `تسجيل الدخول إلى ${tenantName} — منصة تعليمية أونلاين.` },
            '/register': {
              title: `إنشاء حساب — ${tenantName}`,
              description: `أنشئ حسابك في ${tenantName} وابدأ رحلتك الدراسية أونلاين.`
            },
            '/credits': {
              title: `فريق هندسة البرمجيات — عبدالرحمن علاء وإياد العلقامي | Abdelrahman Alaa & Eyad Elalkamy`,
              description: `الصفحة الرسمية لمهندسي البرمجيات والأمن السيبراني عبدالرحمن علاء وإياد العلقامي (Abdelrahman Alaa & Eyad Elalkamy) — مطوري بنية منصات GitFekra التعليمية.`
            }
          }

      const routeMeta = meta[path]
      if (routeMeta) {
        if (routeMeta.title) document.title = routeMeta.title
        upsertMeta('description', routeMeta.description)
      }
    }
  }, [location.pathname, tenant, tenantName, themeConfig])

  return null
}
