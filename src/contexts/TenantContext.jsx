import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@backend/supabase'
import { applyTenantTheme } from '../utils/theme'
import { cached, setCacheTenant } from '../utils/cache'
import { applyBrandOverride, remapAvailableTenants, getTenantFolder } from '../tenants/brandOverrides'
import { CAPABILITY_MAP } from '../config/features'

const TenantContext = createContext(null)

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null)
  const [themeConfig, setThemeConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [availableTenants, setAvailableTenants] = useState([])

  useEffect(() => {
    async function resolveTenant() {
      try {
        // Strip a leading "www." so www.mrmohamedabdella.com matches the
        // tenants.domain value stored without it (mrmohamedabdella.com).
        const hostname = window.location.hostname.replace(/^www\./, '')
        const urlParams = new URLSearchParams(window.location.search)

        // 1. Resolve slug/domain candidate first
        let candidate = 'default'

        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
        // A "preview host" has no per-tenant custom domains yet — localhost and
        // the default deploy domain (e.g. *.vercel.app). On these we resolve the
        // tenant from ?tenant=slug and remember it, so you can share preview
        // links for any tenant BEFORE buying real domains, e.g.
        //   https://your-app.vercel.app/?tenant=power-platform
        const isPreviewHost = isLocalhost || hostname.endsWith('.vercel.app')

        if (isLocalhost) {
          try {
            localStorage.removeItem('masar-cache:available-tenants')
            localStorage.removeItem('masar-cache:tenant-config:power-platform')
            localStorage.removeItem('masar-cache:tenant-config:cyber')
            localStorage.removeItem('masar-cache:tenant-config:sherif-programming')
            localStorage.removeItem('masar-cache:tenant-config:mohamed-abdella')
            localStorage.removeItem('masar-cache:tenant-config:math')
            localStorage.removeItem('masar-cache:tenant-config:belqadar-math')
            localStorage.removeItem('masar-cache:tenant-config:elsharawy')
            localStorage.removeItem('masar-cache:tenant-config:elshaarawy')
            localStorage.removeItem('masar-cache:tenant-config:mohamed-yasser')
          } catch {}
        }

        const queryTenant = urlParams.get('tenant')
        if (queryTenant) {
          // Explicit override — works everywhere (shareable preview links).
          candidate = queryTenant
          sessionStorage.setItem('masar-tenant-slug', queryTenant)
        } else if (isPreviewHost) {
          // Keep the last previewed tenant across reloads in this browser tab.
          candidate = sessionStorage.getItem('masar-tenant-slug') || 'default'
        } else {
          // Real production domain: subdomain (ahmed.masaar.app) or custom domain.
          const parts = hostname.split('.')
          if (parts.length > 2 && parts[0] !== 'www') {
            candidate = parts[0]
          } else {
            candidate = hostname
          }
        }

        // 2. Fetch all tenants ONLY for the localhost dev switcher. In
        // production this list is never rendered (the switcher is gated on
        // isLocalhost below), so skip the query for every cold visitor.
        if (isLocalhost) {
          const allTenants = await cached('available-tenants', 0, async () => {
            const { data } = await supabase
              .from('tenants')
              .select('slug, name')
              .order('name')
            return data || []
          })
          if (allTenants) {
            setAvailableTenants(remapAvailableTenants(allTenants))
          }
        }

        // 3. Fetch tenant config from database (cached for 10 minutes)
        let querySlug = candidate
        if (candidate === 'waled-english') {
          querySlug = 'sherif-english'
        }
        // Physical slug is mohamed-abdella (renamed from sherif-programming);
        // keep old preview links working via both aliases.
        if (candidate === 'power-platform' || candidate === 'sherif-programming') {
          querySlug = 'mohamed-abdella'
        }
        if (candidate === 'math' || candidate === 'belqadar' || candidate === 'belqadar-math' || candidate === 'mahmoud-belqadar' || candidate === 'mrmahmoudelbeliqdar.com' || candidate.includes('mrmahmoudelbeliqdar')) {
          querySlug = 'sherif-math'
        }
        if (candidate === 'elshaarawy') {
          querySlug = 'elsharawy'
        }
        if (candidate === 'mrmohamedyasser.com' || candidate.includes('mohamedyasser') || candidate.includes('mrmohamedyasser')) {
          querySlug = 'mohamed-yasser'
        }

        const cacheTtl = isLocalhost ? 0 : 10 * 60 * 1000

        const tenantData = await cached(`tenant-config:${candidate}`, cacheTtl, async () => {
          let resolvedData = null
          if (querySlug && querySlug !== 'default') {
            const { data, error } = await supabase
              .from('tenants')
              .select('id, slug, name, domain, logo_url, primary_color, secondary_color, config')
              .or(`slug.eq.${querySlug},domain.eq.${querySlug},slug.eq.${candidate},domain.eq.${candidate}`)
              .maybeSingle()
            if (!error && data) {
              resolvedData = data
            }
          }

          if (!resolvedData && (candidate === 'elsharawy' || candidate === 'elshaarawy')) {
            resolvedData = {
              id: 'elsharawy-primary-multi',
              slug: 'elsharawy',
              name: 'منصة الشعراوي',
              primary_color: '#a86e28',
              secondary_color: '#175e54',
              logo_url: '/images/Elshaarawy Logo.png',
              config: {
                subject: 'primary-multi',
                subjects: [
                  'اللغة العربية',
                  'الرياضيات',
                  'العلوم',
                  'الدراسات الاجتماعية',
                  'اللغة الإنجليزية'
                ],
                theme: {
                  bg_light: '#f5f1e9',
                  card_light: '#fdfbf5',
                  text_light: '#191714',
                  bg_dark: '#14110e',
                  card_dark: '#1e1a15',
                  text_dark: '#ece7dd',
                  border_accent: 'rgba(168,110,40,0.22)'
                },
                teacher: {
                  name: 'الشعراوي',
                  role: 'صانع الأبطال — معلم مختلف مواد المرحلة الابتدائية والتأسيس',
                  bio: 'معلم متخصص في تدريس وتأسيس مختلف مواد المرحلة الابتدائية (اللغة العربية، الرياضيات، العلوم، الدراسات الاجتماعية، واللغة الإنجليزية) بأسلوب شيق ومبتكر يصنع الأبطال ويبني أساساً تعليمياً متميزاً لكل طالب.',
                  quote: '«صناعة الأبطال تبدأ من التأسيس القوي، الفهم الممتع، وحب المعرفة من الصغر.»',
                  target_stage: 'المرحلة الابتدائية (تأسيس ومواد متعددة)',
                  target_stage_label: 'المرحلة والتخصص',
                  image_base: '/images/ELshaarawy Teacher Image.png',
                  image_hover: '/images/ELshaarawy Teacher Image.png',
                  experience: '+10',
                  students_count: '+2,500',
                  satisfaction: '99%',
                  learning_system: 'حضوري وأونلاين تفاعلي'
                },
                branding: {
                  brand_short: 'منصة الشعراوي',
                  hero_title_a: 'منصة الشعراوي',
                  hero_title_b: 'صانع الأبطال — المرحلة الابتدائية',
                  hero_sub: 'المنصة التعليمية المتكاملة لتدريس وتأسيس مختلف مواد المرحلة الابتدائية — شرح تفاعلي مبسط، تدريبات مستمرة، ومتابعة دقيقة لصناعة جيل من الأبطال.',
                  description: 'منصة أستاذ الشعراوي صانع الأبطال لتدريس وتأسيس مختلف مواد المرحلة الابتدائية لجميع الصفوف الابتدائية.'
                },
                features: {
                  videos: true,
                  exams: true,
                  homework: true,
                  payments: true,
                  reports: true,
                  chat: true,
                  notifications: true,
                  attendance: false,
                  grades: false,
                  qr_attendance: false,
                  branches: true,
                  groups: true,
                  parent_portal: true,
                  student_notes: true,
                  assistant_accounts: true
                },
                stages: [
                  {
                    id: 'primary',
                    name: 'المرحلة الابتدائية',
                    enabled: true,
                    grades: [
                      { id: 'primary-1', name: 'الصف الأول الابتدائي', enabled: true },
                      { id: 'primary-2', name: 'الصف الثاني الابتدائي', enabled: true },
                      { id: 'primary-3', name: 'الصف الثالث الابتدائي', enabled: true },
                      { id: 'primary-4', name: 'الصف الرابع الابتدائي', enabled: true },
                      { id: 'primary-5', name: 'الصف الخامس الابتدائي', enabled: true },
                      { id: 'primary-6', name: 'الصف السادس الابتدائي', enabled: true }
                    ]
                  },
                  {
                    id: 'preparatory',
                    name: 'المرحلة الإعدادية',
                    enabled: false,
                    grades: [
                      { id: 'first-prep', name: 'الصف الأول الإعدادي', enabled: true },
                      { id: 'second-prep', name: 'الصف الثاني الإعدادي', enabled: true },
                      { id: 'third-prep', name: 'الصف الثالث الإعدادي', enabled: true }
                    ]
                  },
                  {
                    id: 'secondary',
                    name: 'المرحلة الثانوية',
                    enabled: false,
                    grades: [
                      { id: 'first-sec', name: 'الصف الأول الثانوي', enabled: true },
                      { id: 'second-sec', name: 'الصف الثاني الثانوي', enabled: true },
                      { id: 'third-sec', name: 'الصف الثالث الثانوي', enabled: true }
                    ]
                  },
                  {
                    id: 'baccalaureate',
                    name: 'مرحلة البكالوريا',
                    enabled: false,
                    grades: [
                      { id: 'bac-1', name: 'البكالوريا المستوى الأول', enabled: true },
                      { id: 'bac-2', name: 'البكالوريا المستوى الثاني', enabled: true },
                      { id: 'bac-3', name: 'البكالوريا المستوى الثالث', enabled: true }
                    ]
                  }
                ],
                login_sections: {
                  teacher: true,
                  about: true,
                  packages: true,
                  features: true,
                  steps: true,
                  location: true
                },
                socials: {
                  facebook: 'https://www.facebook.com',
                  whatsapp: 'https://wa.me/',
                  youtube: 'https://www.youtube.com'
                },
                contact: {},
                location: {
                  description: 'مقر السنتر والمجموعات الدراسية'
                },
                announcements: [
                  {
                    icon: '📚',
                    text: 'شرح وتأسيس شامل لمختلف مواد المرحلة الابتدائية بأسلوب ممتع ومبسط'
                  },
                  {
                    icon: '🏆',
                    text: 'تدريبات واختبارات دورية لصناعة الأبطال وتنمية مهارات التفكير'
                  },
                  {
                    icon: '🎥',
                    text: 'فيديوهات تفاعلية ومتابعة مستمرة لأداء كل طالب مع ولي الأمر'
                  }
                ]
              }
            }
          }

          if (resolvedData && (resolvedData.slug === 'mohamed-yasser' || candidate === 'mohamed-yasser' || candidate.includes('yasser'))) {
            resolvedData.name = 'مستر محمد ياسر'
            resolvedData.logo_url = '/images/Logo Mr Mohamed Yasser.png'
            resolvedData.primary_color = '#ee7d30'
            resolvedData.secondary_color = '#1c3257'
            
            const existingConfig = resolvedData.config || {}
            const existingTeacher = (existingConfig.teacher && existingConfig.teacher.name !== 'Admin') ? existingConfig.teacher : {}
            const existingBranding = existingConfig.branding || {}
            
            resolvedData.config = {
              subject: 'english',
              ...existingConfig,
              theme: {
                bg_light: '#f8fafc',
                card_light: '#ffffff',
                text_light: '#0f1c30',
                bg_dark: '#0b121f',
                card_dark: '#121e33',
                text_dark: '#f1f5f9',
                border_accent: 'rgba(238, 125, 48, 0.28)',
                ...(existingConfig.theme || {})
              },
              teacher: {
                kicker: 'مستر محمد ياسر',
                name: 'محمد ياسر',
                role: 'معلم أول اللغة الإنجليزية للمرحلة الثانوية',
                bio: 'معلم متميز للغة الإنجليزية بخبرة 9 سنوات في تدريس وتأسيس طلاب المرحلة الثانوية، متخصص في تبسيط القواعد وشرح مهارات الترجمة والفهم والتدريب المكثف على مواصفات الامتحانات الحديثة بأسلوب تفاعلي.',
                quote: '«The more you learn , the more you earn .»',
                target_stage: 'المرحلة الثانوية',
                target_stage_label: 'المرحلة التي يدرّسها',
                image_base: '/images/Image Mr Mohamed Yasser.png',
                image_hover: '/images/Image Mr Mohamed Yasser.png',
                experience: '9 سنوات خبرة',
                students_count: '+3,500',
                satisfaction: '99%',
                learning_system: 'حضوري بالسنتر وأونلاين تفاعلي',
                ...existingTeacher
              },
              branding: {
                brand_short: 'مستر محمد ياسر',
                tagline: 'The more you learn , the more you earn .',
                hero_title_a: 'The More You Learn',
                hero_title_b: 'The More You Earn',
                hero_sub: 'المنصة التعليمية المتكاملة لتدريس وتأسيس مادة اللغة الإنجليزية للمرحلة الثانوية — Best of the Best. شرح مبسط وتدريب مكثف يضمن لك التفوق والدرجة النهائية.',
                description: 'منصة مستر محمد ياسر لتعليم اللغة الإنجليزية للمرحلة الثانوية — محاضرات، امتحانات، واجبات، ومتابعة مستمرة.',
                ...existingBranding
              },
              location: {
                branches: [
                  {
                    name: 'المقر الرئيسي',
                    address: 'شارع الرقم القومي بعد الكوبري العلوي أمام محل كريم مكي',
                    phone: '01036836301'
                  }
                ],
                description: 'شارع الرقم القومي بعد الكوبري العلوي أمام محل كريم مكي',
                address: 'شارع الرقم القومي بعد الكوبري العلوي أمام محل كريم مكي',
                country: 'جمهورية مصر العربية',
                phone: '01036836301',
                whatsapp_link: 'https://wa.me/201036836301',
                directions_link: 'https://maps.app.goo.gl/B5A3xiQDpSaqZppG6',
                hours_days: 'يومياً',
                hours_time: '٨:٠٠ ص - ٦:٠٠ م',
                ...(existingConfig.location || {})
              },
              contact: {
                phone: '01036836301',
                whatsapp: 'https://wa.me/201036836301',
                ...(existingConfig.contact || {})
              },
              socials: {
                facebook: 'https://www.facebook.com/share/1EgDqxqLfw/?mibextid=wwXIfr',
                youtube: 'https://youtube.com/@englishwithmohamedyasser?si=-riciQe2OrXqFAHE',
                tiktok: 'https://www.tiktok.com/@k.mohamedyaser?_r=1&_t=ZS-99ECH7FA6Oi',
                whatsapp: 'https://wa.me/201036836301',
                ...(existingConfig.socials || {})
              },
              stages: existingConfig.stages || [
                {
                  id: 'secondary',
                  name: 'المرحلة الثانوية',
                  enabled: true,
                  grades: [
                    { id: 'first-sec', name: 'الصف الأول الثانوي', enabled: true },
                    { id: 'second-sec', name: 'الصف الثاني الثانوي', enabled: true },
                    { id: 'third-sec', name: 'الصف الثالث الثانوي', enabled: true }
                  ]
                }
              ],
              features: {
                attendance: true,
                grades: true,
                exams: true,
                homework: true,
                videos: true,
                notifications: true,
                payments: true,
                chat: true,
                groups: true,
                branches: true,
                qr_attendance: true,
                parent_portal: true,
                student_notes: true,
                assistant_accounts: true,
                reports: true,
                ...(existingConfig.features || {})
              },
              login_sections: {
                teacher: true,
                about: true,
                packages: true,
                features: true,
                steps: true,
                location: true,
                ...(existingConfig.login_sections || {})
              },
              announcements: existingConfig.announcements || [
                {
                  icon: '🎯',
                  text: 'شرح مبسط وتأسيس شامل لكافة مهارات وقواعد اللغة الإنجليزية للمرحلة الثانوية'
                },
                {
                  icon: '🏆',
                  text: 'تدريبات وامتحانات مستمرة على أحدث مواصفات الثانوية العامة لضمان الدرجة النهائية'
                },
                {
                  icon: '📱',
                  text: 'متابعة إلكترونية دقيقة للدرجات والحضور مع ولي الأمر عبر إشعارات الواتساب'
                }
              ]
            }
          }

          if (!resolvedData && (candidate === 'mohamed-yasser' || candidate.includes('yasser'))) {
            resolvedData = {
              id: 'mohamed-yasser-english',
              slug: 'mohamed-yasser',
              name: 'مستر محمد ياسر — لغة إنجليزية',
              primary_color: '#ee7d30',
              secondary_color: '#1c3257',
              logo_url: '/images/Logo Mr Mohamed Yasser.png',
              config: {
                subject: 'english',
                theme: {
                  bg_light: '#f8fafc',
                  card_light: '#ffffff',
                  text_light: '#0f1c30',
                  bg_dark: '#0b121f',
                  card_dark: '#121e33',
                  text_dark: '#f1f5f9',
                  border_accent: 'rgba(238, 125, 48, 0.28)'
                },
                teacher: {
                  kicker: 'مستر محمد ياسر',
                  name: 'محمد ياسر',
                  role: 'معلم أول اللغة الإنجليزية للمرحلة الثانوية',
                  bio: 'معلم متميز للغة الإنجليزية بخبرة 9 سنوات في تدريس وتأسيس طلاب المرحلة الثانوية، متخصص في تبسيط القواعد وشرح مهارات الترجمة والفهم والتدريب المكثف على مواصفات الامتحانات الحديثة بأسلوب تفاعلي.',
                  quote: '«The more you learn , the more you earn .»',
                  target_stage: 'المرحلة الثانوية',
                  target_stage_label: 'المرحلة التي يدرّسها',
                  image_base: '/images/Image Mr Mohamed Yasser.png',
                  image_hover: '/images/Image Mr Mohamed Yasser.png',
                  experience: '9 سنوات خبرة',
                  students_count: '+3,500',
                  satisfaction: '99%',
                  learning_system: 'حضوري بالسنتر وأونلاين تفاعلي'
                },
                branding: {
                  brand_short: 'مستر محمد ياسر',
                  hero_title_a: 'The More You Learn',
                  hero_title_b: 'The More You Earn',
                  hero_sub: 'المنصة التعليمية المتكاملة لتدريس وتأسيس مادة اللغة الإنجليزية للمرحلة الثانوية — Best of the Best. شرح مبسط وتدريب مكثف يضمن لك التفوق والدرجة النهائية.',
                  description: 'منصة مستر محمد ياسر لتعليم اللغة الإنجليزية للمرحلة الثانوية — محاضرات، امتحانات، واجبات، ومتابعة مستمرة.'
                },
                features: {
                  attendance: true,
                  grades: true,
                  exams: true,
                  homework: true,
                  videos: true,
                  notifications: true,
                  payments: true,
                  chat: true,
                  groups: true,
                  branches: true,
                  qr_attendance: true,
                  parent_portal: true,
                  student_notes: true,
                  assistant_accounts: true,
                  reports: true
                },
                stages: [
                  {
                    id: 'secondary',
                    name: 'المرحلة الثانوية',
                    enabled: true,
                    grades: [
                      { id: 'first-sec', name: 'الصف الأول الثانوي', enabled: true },
                      { id: 'second-sec', name: 'الصف الثاني الثانوي', enabled: true },
                      { id: 'third-sec', name: 'الصف الثالث الثانوي', enabled: true }
                    ]
                  }
                ],
                login_sections: {
                  teacher: true,
                  about: true,
                  packages: true,
                  features: true,
                  steps: true,
                  location: true
                },
                socials: {
                  facebook: 'https://www.facebook.com/share/1EgDqxqLfw/?mibextid=wwXIfr',
                  youtube: 'https://youtube.com/@englishwithmohamedyasser?si=-riciQe2OrXqFAHE',
                  tiktok: 'https://www.tiktok.com/@k.mohamedyaser?_r=1&_t=ZS-99ECH7FA6Oi',
                  whatsapp: 'https://wa.me/201036836301'
                },
                contact: {
                  phone: '01036836301',
                  whatsapp: 'https://wa.me/201036836301'
                },
                location: {
                  branches: [
                    {
                      name: 'المقر الرئيسي',
                      address: 'شارع الرقم القومي بعد الكوبري العلوي أمام محل كريم مكي',
                      phone: '01036836301'
                    }
                  ],
                  description: 'شارع الرقم القومي بعد الكوبري العلوي أمام محل كريم مكي',
                  address: 'شارع الرقم القومي بعد الكوبري العلوي أمام محل كريم مكي',
                  country: 'جمهورية مصر العربية',
                  phone: '01036836301',
                  whatsapp_link: 'https://wa.me/201036836301',
                  directions_link: 'https://maps.app.goo.gl/B5A3xiQDpSaqZppG6',
                  hours_days: 'يومياً',
                  hours_time: '٨:٠٠ ص - ٦:٠٠ م'
                },
                announcements: [
                  {
                    icon: '🎯',
                    text: 'شرح مبسط وتأسيس شامل لكافة مهارات وقواعد اللغة الإنجليزية للمرحلة الثانوية'
                  },
                  {
                    icon: '🏆',
                    text: 'تدريبات وامتحانات مستمرة على أحدث مواصفات الثانوية العامة لضمان الدرجة النهائية'
                  },
                  {
                    icon: '📱',
                    text: 'متابعة إلكترونية دقيقة للدرجات والحضور مع ولي الأمر عبر إشعارات الواتساب'
                  }
                ]
              }
            }
          }

          if (!resolvedData) {
            const { data, error } = await supabase
              .from('tenants')
              .select('id, slug, name, domain, logo_url, primary_color, secondary_color, config')
              .eq('slug', 'default')
              .maybeSingle()

            if (!error && data) {
              resolvedData = data
            } else {
              // Hardcoded fallback in case database query fails entirely
              resolvedData = {
                id: 'd3b07384-d113-4ec2-a5d6-d005b6be4979',
                slug: 'default',
                name: 'GitFekra',
                primary_color: '#7c3aed',
                secondary_color: '#06b6d4',
                logo_url: null,
                config: {},
                tenant_settings: [],
                tenant_features: []
              }
            }
          }

          // Apply centralized brand overrides (english / power / …).
          // Same behavior as before — logic now lives in tenants/brandOverrides.js.
          applyBrandOverride(resolvedData)

          return resolvedData
        })

        setTenant(tenantData)

        // Namespace all subsequent caches (students, videos, exams, …) by this
        // tenant so one tenant's cached lists never surface under another on a
        // shared device or after a super-admin tenant switch.
        setCacheTenant(tenantData?.id)

        // Dynamically resolve theme config and load tenant styling chunk
        const folder = getTenantFolder(tenantData)
        let themeConfigObj = null
        try {
          const [configModule] = await Promise.all([
            import(`../tenants/${folder}/config.js`),
            import(`../tenants/${folder}/styles.css`)
          ])
          themeConfigObj = configModule.default || configModule.themeConfig
        } catch (loadErr) {
          console.error(`Failed to load dynamic assets for tenant folder "${folder}", falling back to default:`, loadErr)
          try {
            const [defaultModule] = await Promise.all([
              import('../tenants/default/config.js'),
              import('../tenants/default/styles.css')
            ])
            themeConfigObj = defaultModule.default || defaultModule.themeConfig
          } catch (fallbackErr) {
            console.error('Failed to load fallback default theme assets:', fallbackErr)
          }
        }

        // Identity fields configured in the DB (tenants.config) must win over
        // the shared code theme chunk. Pages read `themeConfig.X || tenant.config.X`,
        // so without this merge a button-created tenant is stuck with the theme
        // folder's baked-in identity (e.g. the default folder's Arabic teacher,
        // or the chemistry folder's owner when subject=chemistry is reused).
        // Tenants without DB overrides keep the code config exactly as before.
        if (themeConfigObj && tenantData?.slug !== 'default') {
          const dbConfig = tenantData?.config || {}
          const merged = { ...themeConfigObj }
          
          if (tenantData?.slug === 'mohamed-yasser' || tenantData?.slug === 'elsharawy' || tenantData?.slug === 'elshaarawy') {
            merged.teacher = { ...themeConfigObj.teacher }
            merged.branding = { ...themeConfigObj.branding }
            merged.location = { ...themeConfigObj.location }
          } else {
            for (const key of ['branding', 'socials', 'contact']) {
              if (dbConfig[key] && typeof dbConfig[key] === 'object' && Object.keys(dbConfig[key]).length > 0) {
                merged[key] = { ...(themeConfigObj[key] || {}), ...dbConfig[key] }
              }
            }
            for (const key of ['teacher', 'location']) {
              if (dbConfig[key] && typeof dbConfig[key] === 'object' && Object.keys(dbConfig[key]).length > 0) {
                if (key === 'teacher' && dbConfig.teacher?.name === 'Admin') continue
                merged[key] = { ...(themeConfigObj[key] || {}), ...dbConfig[key] }
              }
            }
          }
          // A dynamic tenant on the shared default folder must never present
          // the default theme's teacher/center identity as its own.
          const isDynamicTenant = folder === 'default'
          if (isDynamicTenant) {
            if (!dbConfig.teacher || Object.keys(dbConfig.teacher).length === 0) merged.teacher = {}
            if (!dbConfig.location || Object.keys(dbConfig.location).length === 0) merged.location = {}
            merged.branding = { ...(merged.branding || {}), brand_short: dbConfig.branding?.brand_short || tenantData.name }
          }
          // A tenant that defines its own config.theme is a custom-branded
          // (premium) tenant: its DB colors must win over the SUBJECT FOLDER's
          // baked palette. The subject folders (math/physics/…) hardcode a
          // primaryColor, and applyTenantTheme() prefers themeConfig.primaryColor
          // over tenant.primary_color — so without this a gold/black tenant that
          // resolves to the math folder renders the folder's blue. Gated on
          // config.theme, so subject tenants WITHOUT it keep their folder colors
          // exactly (no regression).
          if (dbConfig.theme && typeof dbConfig.theme === 'object' && Object.keys(dbConfig.theme).length > 0) {
            if (tenantData.primary_color) merged.primaryColor = tenantData.primary_color
            if (tenantData.secondary_color) merged.secondaryColor = tenantData.secondary_color
            // Recolor the hero particle field from the brand primary so the
            // floating symbols match the tenant instead of the folder's palette.
            const p = tenantData.primary_color
            if (p && /^#[0-9a-fA-F]{6}$/.test(p)) {
              merged.particleColors = [p, p, p, p, p, p]
              const r = parseInt(p.slice(1, 3), 16), g = parseInt(p.slice(3, 5), 16), b = parseInt(p.slice(5, 7), 16)
              merged.getLineColor = (theme, alpha) => `rgba(${r}, ${g}, ${b}, ${alpha * (theme === 'dark' ? 0.22 : 0.15)})`
            }
          }
          themeConfigObj = merged
        }

        if (themeConfigObj) {
          setThemeConfig(themeConfigObj)
          applyTenantTheme(tenantData, themeConfigObj)
        } else {
          const fallbackConfig = {
            themeClass: 'aa-default-theme',
            primaryColor: '#7c3aed',
            secondaryColor: '#06b6d4'
          }
          setThemeConfig(fallbackConfig)
          applyTenantTheme(tenantData, fallbackConfig)
        }
      } catch (err) {
        console.error('Failed to resolve tenant:', err)
      } finally {
        setLoading(false)
      }
    }

    resolveTenant()
  }, [])

  // Quick helper to change tenant locally (adds ?tenant=slug)
  const changeTenantDev = (slug) => {
    sessionStorage.setItem('masar-tenant-slug', slug)
    const url = new URL(window.location.href)
    url.searchParams.set('tenant', slug)
    window.location.href = url.toString()
  }

  const isFeatureEnabled = useCallback((featureKey) => {
    if (!featureKey) return true

    // 1. Check in the tenant_features array (if present)
    if (tenant?.tenant_features) {
      const list = Array.isArray(tenant.tenant_features) ? tenant.tenant_features : []
      const found = list.find(f => f.feature_name === featureKey)
      if (found !== undefined) {
        return found.is_enabled !== false
      }
    }

    // 2. Resolve from config.features JSONB column
    const features = tenant?.config?.features || {}
    const def = CAPABILITY_MAP[featureKey]

    // If this capability has a parent and parent is explicitly disabled, child is disabled
    if (def?.parentKey && features[def.parentKey] === false) {
      return false
    }

    // If this specific capability is set, return its value
    if (features[featureKey] !== undefined) {
      return features[featureKey] !== false
    }

    // If this capability has a parent and parent is set, inherit parent's value
    if (def?.parentKey && features[def.parentKey] !== undefined) {
      return features[def.parentKey] !== false
    }

    // Default to true for safe backward compatibility
    return true
  }, [tenant])

  const isGradeEnabled = useCallback((gradeKey) => {
    // 1. Check if the new stages array exists
    if (tenant?.config?.stages) {
      const stages = Array.isArray(tenant.config.stages) ? tenant.config.stages : []
      for (const stage of stages) {
        if (stage.enabled === false) {
          const hasGrade = stage.grades?.some(g => g.id === gradeKey)
          if (hasGrade) return false
        }
        const gradeObj = stage.grades?.find(g => g.id === gradeKey)
        if (gradeObj) {
          return gradeObj.enabled !== false
        }
      }
    }

    // 2. Legacy fallback
    if (!tenant?.config?.grades) return true
    // Support both standard enums (first-prep) and alternative conventions (grade_1_prep / grade_3_sec)
    const legacyMap = {
      'first-prep': 'grade_1_prep',
      'second-prep': 'grade_2_prep',
      'third-prep': 'grade_3_prep',
      'first-sec': 'grade_1_sec',
      'second-sec': 'grade_2_sec',
      'third-sec': 'grade_3_sec',
    }
    const altKey = legacyMap[gradeKey]
    if (tenant.config.grades[gradeKey] === false) return false
    if (altKey && tenant.config.grades[altKey] === false) return false
    return true
  }, [tenant])

  const gradesList = useMemo(() => {
    if (tenant?.config?.stages) {
      const stages = Array.isArray(tenant.config.stages) ? tenant.config.stages : []
      const list = []
      for (const stage of stages) {
        if (stage.enabled === false) continue
        const grades = Array.isArray(stage.grades) ? stage.grades : []
        for (const g of grades) {
          if (g.enabled !== false) {
            list.push({ id: g.id, name: g.name, stageId: stage.id, stageName: stage.name })
          }
        }
      }
      return list
    }
    
    // Legacy fallback list
    const legacyGrades = [
      { id: 'first-prep', name: 'الصف الأول الإعدادي', stageId: 'preparatory', stageName: 'المرحلة الإعدادية' },
      { id: 'second-prep', name: 'الصف الثاني الإعدادي', stageId: 'preparatory', stageName: 'المرحلة الإعدادية' },
      { id: 'third-prep', name: 'الصف الثالث الإعدادي', stageId: 'preparatory', stageName: 'المرحلة الإعدادية' },
      { id: 'first-sec', name: 'الصف الأول الثانوي', stageId: 'secondary', stageName: 'المرحلة الثانوية' },
      { id: 'second-sec', name: 'الصف الثاني الثانوي', stageId: 'secondary', stageName: 'المرحلة الثانوية' },
      { id: 'third-sec', name: 'الصف الثالث الثانوي', stageId: 'secondary', stageName: 'المرحلة الثانوية' },
    ]
    return legacyGrades.filter(g => isGradeEnabled(g.id))
  }, [tenant, isGradeEnabled])

  const value = useMemo(() => ({
    tenant,
    tenantId: tenant?.id || null,
    tenantSlug: tenant?.slug || 'default',
    tenantName: tenant?.name || '',
    themeConfig,
    isFeatureEnabled,
    isGradeEnabled,
    gradesList,
    // The default tenant is the GitFekra company website (not an educational
    // platform). Every other tenant renders the educational app as before.
    isCompanySite: (tenant?.slug || 'default') === 'default',
    loading
  }), [tenant, themeConfig, isFeatureEnabled, isGradeEnabled, gradesList, loading])

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  return (
    <TenantContext.Provider value={value}>
      {!loading && (
        <>
          {children}

          {/* Localhost Dev Tenant Selector Overlay (Redesigned Floating Glass Pill Switcher) */}
          {isLocalhost && availableTenants.length > 1 && (
            <div className="dev-tenant-switcher" style={{
              position: 'fixed',
              bottom: '16px',
              left: '16px',
              zIndex: 99999,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(12px)',
              webkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '999px',
              padding: '6px 14px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontFamily: 'Tajawal, sans-serif',
              fontSize: '13px',
              color: '#f1f5f9',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'all 0.2s ease',
            }}>
              {/* Avatar circle */}
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--secondary, #5BC2E7), var(--primary, #8b5cf6))',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 'bold'
              }}>
                {(tenant?.name || 'M').charAt(0)}
              </div>

              {/* Tenant Name */}
              <span style={{ fontWeight: '600' }}>{tenant?.name || 'Default'}</span>

              {/* Chevron */}
              <i className="fas fa-chevron-up" style={{ fontSize: '10px', color: '#94a3b8' }}></i>

              {/* Invisible native select overlay */}
              <select
                value={tenant?.slug || 'default'}
                onChange={(e) => changeTenantDev(e.target.value)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer',
                  zIndex: 2
                }}
              >
                {availableTenants.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  const context = useContext(TenantContext)
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return context
}
