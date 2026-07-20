-- ============================================================================
-- 2026_07_20_create_eldad_tenant.sql
--
-- Splits the الضاد (Arabic teacher) identity out of the shared `default`
-- tenant into its own dedicated tenant, and restores `default` to being the
-- clean GitFekra company site.
--
-- WHY: `default` doubles as the GitFekra company landing (logged-out) AND the
-- Arabic teacher login (/login?tenant=default) — confusing. A dedicated
-- `eldad` tenant removes the overlap; the Arabic canvas (default theme folder)
-- is reused because subject='arabic' resolves to the `default` folder in
-- getTenantFolder(), so the calligraphy/particles identity carries over.
--
-- Palette is sampled from the أ. خالد الشريف logo: gold #a86e28 + deep teal
-- #0e4653 on cream (light) / petrol (dark).
-- ============================================================================

-- 1) Create the الضاد tenant (idempotent on slug) ----------------------------
INSERT INTO public.tenants (slug, name, primary_color, secondary_color, logo_url, config)
VALUES (
  'eldad',
  'الضاد',
  '#a86e28',
  '#175e54',
  '/images/eldad-logo.png',
  jsonb_build_object(
    'subject', 'arabic',
    -- Warm brown/gold/cream (matched to the GitFekra landing palette). Teal
    -- (#175e54 secondary) is a SPARING accent only, never a background.
    'theme', jsonb_build_object(
      'bg_light',     '#f5f1e9',
      'card_light',   '#fdfbf5',
      'text_light',   '#191714',
      'bg_dark',      '#14110e',
      'card_dark',    '#1e1a15',
      'text_dark',    '#ece7dd',
      'border_accent','rgba(168,110,40,0.22)'
    ),
    'teacher', jsonb_build_object(
      'name', 'خالد الشريف',
      'role', 'مدرس اللغة العربية'
    ),
    'branding', jsonb_build_object(
      'hero_title_a', 'اللغة العربية',
      'hero_title_b', 'لغة الضاد بطعم جديد',
      'hero_sub', 'منصة تعليمية متخصصة في اللغة العربية — سجّل حسابك، يتم اعتماده، وابدأ رحلتك مع شرح يخلّيك تفهم وتحب اللغة.'
    ),
    'features', jsonb_build_object(
      'videos', true, 'exams', true, 'homework', true, 'payments', true,
      'reports', true, 'chat', true, 'notifications', true,
      'attendance', false, 'grades', false, 'qr_attendance', false,
      'branches', true, 'groups', true, 'parent_portal', true,
      'student_notes', true, 'assistant_accounts', true
    ),
    'stages', jsonb_build_array(
      jsonb_build_object('id','primary','name','المرحلة الابتدائية','enabled',false,'grades', jsonb_build_array(
        jsonb_build_object('id','primary-4','name','الصف الرابع الابتدائي','enabled',true),
        jsonb_build_object('id','primary-5','name','الصف الخامس الابتدائي','enabled',true),
        jsonb_build_object('id','primary-6','name','الصف السادس الابتدائي','enabled',true)
      )),
      jsonb_build_object('id','preparatory','name','المرحلة الإعدادية','enabled',true,'grades', jsonb_build_array(
        jsonb_build_object('id','first-prep','name','الصف الأول الإعدادي','enabled',true),
        jsonb_build_object('id','second-prep','name','الصف الثاني الإعدادي','enabled',true),
        jsonb_build_object('id','third-prep','name','الصف الثالث الإعدادي','enabled',true)
      )),
      jsonb_build_object('id','secondary','name','المرحلة الثانوية','enabled',true,'grades', jsonb_build_array(
        jsonb_build_object('id','first-sec','name','الصف الأول الثانوي','enabled',true),
        jsonb_build_object('id','second-sec','name','الصف الثاني الثانوي','enabled',true),
        jsonb_build_object('id','third-sec','name','الصف الثالث الثانوي','enabled',true)
      ))
    ),
    'login_sections', jsonb_build_object(
      'teacher', true, 'about', true, 'packages', true,
      'features', true, 'steps', true, 'location', true
    ),
    'socials', '{}'::jsonb,
    'location', '{}'::jsonb,
    'contact', '{}'::jsonb,
    'announcements', jsonb_build_array(
      jsonb_build_object('icon','📚','text','دروس اللغة العربية بأسلوب مبسّط وممتع'),
      jsonb_build_object('icon','📝','text','امتحانات وتدريبات دورية لكل صف'),
      jsonb_build_object('icon','🎥','text','شرح فيديو لكل درس بجودة عالية')
    )
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  primary_color = EXCLUDED.primary_color,
  secondary_color = EXCLUDED.secondary_color,
  logo_url = EXCLUDED.logo_url,
  config = tenants.config || EXCLUDED.config;

-- 2) Restore `default` to the clean GitFekra company site --------------------
--    Strips the الضاد experiment (theme tokens, teacher/location/socials the
--    user added while testing) and restores GitFekra branding + colors.
--    Structural keys (stages/features/announcements/gateway) are preserved.
UPDATE public.tenants
SET
  name = 'GitFekra',
  primary_color = '#7c3aed',
  secondary_color = '#06b6d4',
  logo_url = NULL,
  config = (config - 'theme')
    || jsonb_build_object(
         'teacher', '{}'::jsonb,
         'location', '{}'::jsonb,
         'branding', '{}'::jsonb,
         'contact', '{}'::jsonb
       )
WHERE slug = 'default';
