-- ============================================================================
-- SQL Setup & Configuration for Tenant: mohamed-yasser
-- Teacher: Mr. Mohamed Yasser (اللغة الإنجليزية للمرحلة الثانوية)
-- Quote: "The more you learn , the more you earn ."
-- Brand Colors: Deep Navy (#1c3257) & Warm Vibrant Orange (#ee7d30)
--
-- Apply in Supabase SQL Editor:
--   Copy & paste this query into your Supabase Dashboard SQL Editor and Run.
-- ============================================================================

INSERT INTO public.tenants (slug, name, domain, primary_color, secondary_color, logo_url, config)
VALUES (
  'mohamed-yasser',
  'مستر محمد ياسر — لغة إنجليزية',
  'mrmohamedyasser.com',
  '#ee7d30',
  '#1c3257',
  '/images/Logo Mr Mohamed Yasser.png',
  jsonb_build_object(
    'subject', 'english',

    'theme', jsonb_build_object(
      'bg_light',      '#f8fafc',
      'card_light',    '#ffffff',
      'text_light',    '#0f1c30',
      'bg_dark',       '#0b121f',
      'card_dark',     '#121e33',
      'text_dark',     '#f1f5f9',
      'border_accent', 'rgba(238, 125, 48, 0.28)'
    ),

    'teacher', jsonb_build_object(
      'kicker', 'مستر محمد ياسر',
      'name', 'محمد ياسر',
      'role', 'معلم أول اللغة الإنجليزية للمرحلة الثانوية',
      'bio', 'معلم متميز للغة الإنجليزية بخبرة 9 سنوات في تدريس وتأسيس طلاب المرحلة الثانوية، متخصص في تبسيط القواعد وشرح مهارات الترجمة والفهم والتدريب المكثف على مواصفات الامتحانات الحديثة بأسلوب تفاعلي.',
      'quote', '«The more you learn , the more you earn .»',
      'target_stage', 'المرحلة الثانوية',
      'target_stage_label', 'المرحلة التي يدرّسها',
      'image_base', '/images/Image Mr Mohamed Yasser.png',
      'image_hover', '/images/Image Mr Mohamed Yasser.png',
      'experience', '9 سنوات خبرة',
      'students_count', '+3,500',
      'satisfaction', '99%',
      'learning_system', 'حضوري بالسنتر وأونلاين تفاعلي'
    ),

    'branding', jsonb_build_object(
      'brand_short', jsonb_build_object('ar', 'مستر محمد ياسر', 'en', 'Mr. Mohamed Yasser'),
      'tagline', 'The more you learn , the more you earn .',
      'hero_title_a', 'The More You Learn',
      'hero_title_b', 'The More You Earn',
      'hero_sub', 'المنصة التعليمية المتكاملة لتدريس وتأسيس مادة اللغة الإنجليزية للمرحلة الثانوية — Best of the Best. شرح مبسط وتدريب مكثف يضمن لك التفوق والدرجة النهائية.',
      'description', 'منصة مستر محمد ياسر لتعليم اللغة الإنجليزية للمرحلة الثانوية — محاضرات، امتحانات، واجبات، ومتابعة مستمرة.'
    ),

    'location', jsonb_build_object(
      'branches', jsonb_build_array(
        jsonb_build_object(
          'name', 'المقر الرئيسي',
          'address', 'شارع الرقم القومي بعد الكوبري العلوي أمام محل كريم مكي',
          'phone', '01036836301'
        )
      ),
      'description', 'شارع الرقم القومي بعد الكوبري العلوي أمام محل كريم مكي',
      'address', 'شارع الرقم القومي بعد الكوبري العلوي أمام محل كريم مكي',
      'country', 'جمهورية مصر العربية',
      'phone', '01036836301',
      'whatsapp_link', 'https://wa.me/201036836301',
      'directions_link', 'https://maps.app.goo.gl/B5A3xiQDpSaqZppG6',
      'hours_days', 'يومياً',
      'hours_time', '٨:٠٠ ص - ٦:٠٠ م'
    ),

    'contact', jsonb_build_object(
      'phone', '01036836301',
      'whatsapp', 'https://wa.me/201036836301'
    ),

    'socials', jsonb_build_object(
      'facebook', 'https://www.facebook.com/share/1EgDqxqLfw/?mibextid=wwXIfr',
      'youtube', 'https://youtube.com/@englishwithmohamedyasser?si=-riciQe2OrXqFAHE',
      'tiktok', 'https://www.tiktok.com/@k.mohamedyaser?_r=1&_t=ZS-99ECH7FA6Oi',
      'whatsapp', 'https://wa.me/201036836301'
    ),

    'stages', jsonb_build_array(
      jsonb_build_object(
        'id', 'secondary',
        'name', 'المرحلة الثانوية',
        'enabled', true,
        'grades', jsonb_build_array(
          jsonb_build_object('id', 'first-sec', 'name', 'الصف الأول الثانوي', 'enabled', true),
          jsonb_build_object('id', 'second-sec', 'name', 'الصف الثاني الثانوي', 'enabled', true),
          jsonb_build_object('id', 'third-sec', 'name', 'الصف الثالث الثانوي', 'enabled', true)
        )
      )
    ),

    'features', jsonb_build_object(
      'attendance', true,
      'grades', true,
      'exams', true,
      'homework', true,
      'videos', true,
      'notifications', true,
      'payments', true,
      'chat', true,
      'groups', true,
      'branches', true,
      'qr_attendance', true,
      'parent_portal', true,
      'student_notes', true,
      'assistant_accounts', true,
      'reports', true
    ),

    'login_sections', jsonb_build_object(
      'teacher', true,
      'about', true,
      'packages', true,
      'features', true,
      'steps', true,
      'location', true
    ),

    'announcements', jsonb_build_array(
      jsonb_build_object('icon', '🎯', 'text', 'شرح مبسط وتأسيس شامل لكافة مهارات وقواعد اللغة الإنجليزية للمرحلة الثانوية'),
      jsonb_build_object('icon', '🏆', 'text', 'تدريبات وامتحانات مستمرة على أحدث مواصفات الثانوية العامة لضمان الدرجة النهائية'),
      jsonb_build_object('icon', '📱', 'text', 'متابعة إلكترونية دقيقة للدرجات والحضور مع ولي الأمر عبر إشعارات الواتساب')
    )
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  primary_color = EXCLUDED.primary_color,
  secondary_color = EXCLUDED.secondary_color,
  logo_url = EXCLUDED.logo_url,
  config = tenants.config || EXCLUDED.config;
