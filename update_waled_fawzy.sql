-- ============================================================================
-- SQL Setup & Configuration for Tenant: The Miracle in English (Waleed Fawzy)
-- Teacher: Mr. Waleed Ahmed Fawzy (مستر وليد أحمد فوزي — خبير تعليم اللغة الإنجليزية)
-- Domain: mrwaleedfawzy.com
-- Brand Colors: Royal Gold (#d4af37) & Light Slate (#cbd5e1)
--
-- Apply in Supabase SQL Editor:
--   Copy & paste this query into your Supabase Dashboard SQL Editor and Run.
-- ============================================================================

UPDATE public.tenants
SET
  domain = 'mrwaleedfawzy.com',
  name = 'The Miracle in English — مستر وليد أحمد فوزي',
  primary_color = '#d4af37',
  secondary_color = '#cbd5e1',
  logo_url = '/images/Logo The Miracle.png',
  config = jsonb_build_object(
    'subject', 'english',
    'subject_theme', 'english',

    'theme', jsonb_build_object(
      'bg_light',      '#fdfbf7',
      'card_light',    '#ffffff',
      'text_light',    '#1c1917',
      'bg_dark',       '#0e1322',
      'card_dark',     '#151b2e',
      'text_dark',     '#f8fafc',
      'border_accent', 'rgba(212, 175, 55, 0.35)'
    ),

    'teacher', jsonb_build_object(
      'kicker', 'مستر وليد أحمد فوزي',
      'name', 'وليد أحمد فوزي',
      'role', 'خبير تعليم اللغة الإنجليزية للمرحلتين الابتدائية والإعدادية — عضو جمعية اللغويين والمترجمين سابقاً',
      'bio', 'رؤية جديدة.. طرق جديدة.. بداية جديدة. تبسيط شامل لمنهج اللغة الإنجليزية للمرحلتين الابتدائية والإعدادية، القواعد والنصوص والترجمة، باستخدام طرق تعليمية تفاعلية وحديثة تضمن التميز والدرجة النهائية.',
      'quote', '«السر ليس في الحفظ، بل في امتلاك المفتاح الحقيقي لفهم اللغة والتميز بها.»',
      'target_stage', 'الابتدائية والإعدادية',
      'target_stage_label', jsonb_build_object('ar', 'المراحل التي يدرّسها', 'en', 'Stages he teaches'),
      'image_base', '/images/Mr Waleed Fawzy Image.png',
      'image_hover', '/images/Mr Waleed Fawzy Image.png',
      'experience', '+20',
      'students_count', '+5,000',
      'satisfaction', '99%',
      'learning_system', 'أونلاين تفاعلي وحضوري بالسنتر'
    ),

    'branding', jsonb_build_object(
      'brand_short', jsonb_build_object('ar', 'The Miracle', 'en', 'The Miracle'),
      'hero_title_a', 'The Miracle',
      'hero_title_b', 'In English',
      'hero_sub', 'رؤية جديدة .. طرق جديدة .. بداية جديدة. منصة الأستاذ وليد أحمد فوزي لتعليم وتأسيس اللغة الإنجليزية للمرحلتين الابتدائية والإعدادية.',
      'description', 'منصة The Miracle in English لمستر وليد أحمد فوزي لتعليم اللغة الإنجليزية — محاضرات، امتحانات، واجبات، ومتابعة مستمرة.'
    ),

    'location', jsonb_build_object(
      'title', 'موقع السنتر',
      'kicker', jsonb_build_object('ar', 'مقرنا السنتر الرئيسي', 'en', 'Our main center'),
      'description', 'دمنهور- خلف تشاو مول - ش توب جيم امام صيدلية عمرو زكريا الدور الثاني.',
      'address', 'دمنهور - خلف تشاو مول - ش توب جيم امام صيدلية عمرو زكريا الدور الثاني',
      'country', jsonb_build_object('ar', 'جمهورية مصر العربية', 'en', 'Egypt'),
      'phone', '01005387099 - 01025684017',
      'whatsapp_link', 'https://wa.me/201005387099',
      'directions_link', 'https://maps.app.goo.gl/BiAZiKiqjAKBKom68',
      'hours_days', jsonb_build_object('ar', 'السبت - الخميس', 'en', 'Sat - Thu'),
      'hours_time', jsonb_build_object('ar', '١٢ مساءً - ٩ مساءً', 'en', '12 PM - 9 PM'),
      'branches', jsonb_build_array(
        jsonb_build_object(
          'name', 'المقر الرئيسي (دمنهور)',
          'phone', '01005387099 - 01025684017',
          'address', 'دمنهور - خلف تشاو مول - ش توب جيم امام صيدلية عمرو زكريا الدور الثاني',
          'map_iframe_url', 'https://www.google.com/maps/place/31%C2%B002''45.7%22N+30%C2%B027''55.3%22E/@31.046013,30.4647073,19z/data=!3m1!4b1!4m4!3m3!8m2!3d31.046013!4d30.465351?entry=ttu&g_ep=EgoyMDI2MDcyNy4wIKXMDSoASAFQAw%3D%3D',
          'directions_link', 'https://maps.app.goo.gl/BiAZiKiqjAKBKom68'
        )
      )
    ),

    'socials', jsonb_build_object(
      'facebook', 'https://www.facebook.com',
      'youtube', 'https://www.youtube.com',
      'tiktok', 'https://www.tiktok.com',
      'instagram', 'https://www.instagram.com',
      'whatsapp', 'https://wa.me/201005387099'
    ),

    'contact', jsonb_build_object(
      'phone', '01005387099',
      'whatsapp', 'https://wa.me/201005387099'
    ),

    'stages', jsonb_build_array(
      jsonb_build_object(
        'id', 'primary',
        'name', 'المرحلة الابتدائية',
        'enabled', true,
        'grades', jsonb_build_array(
          jsonb_build_object('id', 'primary-1', 'name', 'الأول الابتدائي', 'enabled', true),
          jsonb_build_object('id', 'primary-2', 'name', 'الثاني الابتدائي', 'enabled', true),
          jsonb_build_object('id', 'primary-3', 'name', 'الثالث الابتدائي', 'enabled', true),
          jsonb_build_object('id', 'primary-4', 'name', 'الرابع الابتدائي', 'enabled', true),
          jsonb_build_object('id', 'primary-5', 'name', 'الخامس الابتدائي', 'enabled', true),
          jsonb_build_object('id', 'primary-6', 'name', 'السادس الابتدائي', 'enabled', true)
        )
      ),
      jsonb_build_object(
        'id', 'preparatory',
        'name', 'المرحلة الإعدادية',
        'enabled', true,
        'grades', jsonb_build_array(
          jsonb_build_object('id', 'first-prep', 'name', 'الأول الإعدادي', 'enabled', true),
          jsonb_build_object('id', 'second-prep', 'name', 'الثاني الإعدادي', 'enabled', true),
          jsonb_build_object('id', 'third-prep', 'name', 'الثالث الإعدادي', 'enabled', true)
        )
      )
    ),

    'announcements', jsonb_build_array(
      jsonb_build_object('icon', '🚀', 'text', 'قريبًا: دورات تأسيس ومراجعات مكثفة للمرحلتين الابتدائية والإعدادية'),
      jsonb_build_object('icon', '📅', 'text', 'امتحانات أسبوعية دورية وتصحيح تفاعلي فوري'),
      jsonb_build_object('icon', '🎁', 'text', 'تكريم وجوائز قيمة للطلاب المتفوقين في امتحانات المنصة'),
      jsonb_build_object('icon', '🎥', 'text', 'شروحات فيديو تفاعلية شاملة القواعد والترجمة والنصوص'),
      jsonb_build_object('icon', '💬', 'text', 'متابعة مستمرة لتقارير أداء الطالب مع ولي الأمر')
    ),

    'login_sections', jsonb_build_object(
      'about', true,
      'steps', true,
      'teacher', true,
      'features', true,
      'location', true,
      'packages', true
    )
  )
WHERE slug IN ('sherif-english', 'waled-english');
