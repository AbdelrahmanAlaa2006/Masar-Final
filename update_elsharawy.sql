-- update_elsharawy.sql
-- Run this in Supabase SQL editor to create or refresh the elsharawy tenant

INSERT INTO public.tenants (slug, name, primary_color, secondary_color, logo_url, config)
VALUES (
  'elsharawy',
  'الشعراوي صانع الأبطال',
  '#a86e28',
  '#175e54',
  '/images/Elshaarawy Logo.png',
  jsonb_build_object(
    'subject', 'primary-multi',
    'subjects', jsonb_build_array(
      'اللغة العربية',
      'الرياضيات',
      'العلوم',
      'الدراسات الاجتماعية',
      'اللغة الإنجليزية'
    ),
    'theme', jsonb_build_object(
      'bg_light',      '#f5f1e9',
      'card_light',    '#fdfbf5',
      'text_light',    '#191714',
      'bg_dark',       '#14110e',
      'card_dark',     '#1e1a15',
      'text_dark',     '#ece7dd',
      'border_accent', 'rgba(168,110,40,0.22)'
    ),
    'teacher', jsonb_build_object(
      'name', 'الشعراوي',
      'role', 'صانع الأبطال — معلم مختلف مواد المرحلة الابتدائية والتأسيس',
      'bio', 'معلم متخصص في تدريس وتأسيس مختلف مواد المرحلة الابتدائية (اللغة العربية، الرياضيات، العلوم، الدراسات الاجتماعية، واللغة الإنجليزية) بأسلوب شيق ومبتكر يصنع الأبطال ويبني أساساً تعليمياً متميزاً لكل طالب.',
      'quote', '«صناعة الأبطال تبدأ من التأسيس القوي، الفهم الممتع، وحب المعرفة من الصغر.»',
      'target_stage', 'المرحلة الابتدائية (تأسيس ومواد متعددة)',
      'target_stage_label', 'المرحلة والتخصص',
      'image_base', '/images/ELshaarawy Teacher Image.png',
      'image_hover', '/images/ELshaarawy Teacher Image.png',
      'experience', '+10',
      'students_count', '+2,500',
      'satisfaction', '99%',
      'learning_system', 'حضوري وأونلاين تفاعلي'
    ),
    'branding', jsonb_build_object(
      'brand_short', 'الشعراوي صانع الأبطال',
      'hero_title_a', 'منصة الشعراوي',
      'hero_title_b', 'صانع الأبطال — المرحلة الابتدائية',
      'hero_sub', 'المنصة التعليمية المتكاملة لتدريس وتأسيس مختلف مواد المرحلة الابتدائية — شرح تفاعلي مبسط، تدريبات مستمرة، ومتابعة دقيقة لصناعة جيل من الأبطال.',
      'description', 'منصة أستاذ الشعراوي صانع الأبطال لتدريس وتأسيس مختلف مواد المرحلة الابتدائية لجميع الصفوف.'
    ),
    'features', jsonb_build_object(
      'videos', true, 'exams', true, 'homework', true, 'payments', true,
      'reports', true, 'chat', true, 'notifications', true,
      'attendance', false, 'grades', false, 'qr_attendance', false,
      'branches', true, 'groups', true, 'parent_portal', true,
      'student_notes', true, 'assistant_accounts', true
    ),
    'stages', jsonb_build_array(
      jsonb_build_object('id','primary','name','المرحلة الابتدائية','enabled',true,'grades', jsonb_build_array(
        jsonb_build_object('id','primary-1','name','الصف الأول الابتدائي','enabled',true),
        jsonb_build_object('id','primary-2','name','الصف الثاني الابتدائي','enabled',true),
        jsonb_build_object('id','primary-3','name','الصف الثالث الابتدائي','enabled',true),
        jsonb_build_object('id','primary-4','name','الصف الرابع الابتدائي','enabled',true),
        jsonb_build_object('id','primary-5','name','الصف الخامس الابتدائي','enabled',true),
        jsonb_build_object('id','primary-6','name','الصف السادس الابتدائي','enabled',true)
      )),
      jsonb_build_object('id','preparatory','name','المرحلة الإعدادية','enabled',false,'grades', jsonb_build_array(
        jsonb_build_object('id','first-prep','name','الصف الأول الإعدادي','enabled',true),
        jsonb_build_object('id','second-prep','name','الصف الثاني الإعدادي','enabled',true),
        jsonb_build_object('id','third-prep','name','الصف الثالث الإعدادي','enabled',true)
      )),
      jsonb_build_object('id','secondary','name','المرحلة الثانوية','enabled',false,'grades', jsonb_build_array(
        jsonb_build_object('id','first-sec','name','الصف الأول الثانوي','enabled',true),
        jsonb_build_object('id','second-sec','name','الصف الثاني الثانوي','enabled',true),
        jsonb_build_object('id','third-sec','name','الصف الثالث الثانوي','enabled',true)
      )),
      jsonb_build_object('id','baccalaureate','name','مرحلة البكالوريا','enabled',false,'grades', jsonb_build_array(
        jsonb_build_object('id','bac-1','name','البكالوريا المستوى الأول','enabled',true),
        jsonb_build_object('id','bac-2','name','البكالوريا المستوى الثاني','enabled',true),
        jsonb_build_object('id','bac-3','name','البكالوريا المستوى الثالث','enabled',true)
      ))
    ),
    'login_sections', jsonb_build_object(
      'teacher', true, 'about', true, 'packages', true,
      'features', true, 'steps', true, 'location', true
    ),
    'socials', jsonb_build_object(
      'facebook', 'https://www.facebook.com',
      'whatsapp', 'https://wa.me/',
      'youtube', 'https://www.youtube.com'
    ),
    'contact', '{}'::jsonb,
    'location', jsonb_build_object(
      'description', 'مقر السنتر والمجموعات الدراسية'
    ),
    'announcements', jsonb_build_array(
      jsonb_build_object('icon','📚','text','شرح وتأسيس شامل لمختلف مواد المرحلة الابتدائية بأسلوب ممتع ومبسط'),
      jsonb_build_object('icon','🏆','text','تدريبات واختبارات دورية لصناعة الأبطال وتنمية مهارات التفكير'),
      jsonb_build_object('icon','🎥','text','فيديوهات تفاعلية ومتابعة مستمرة لأداء كل طالب مع ولي الأمر')
    )
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  primary_color = EXCLUDED.primary_color,
  secondary_color = EXCLUDED.secondary_color,
  logo_url = EXCLUDED.logo_url,
  config = tenants.config || EXCLUDED.config;

-- Helper function to clean up orphaned auth.users records safely
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_student_auth(p_phone TEXT, p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_tenant UUID;
  v_email_custom TEXT;
  v_email_default TEXT;
  v_existing_profile_id UUID;
  v_clean_phone TEXT;
BEGIN
  SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
  FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('admin', 'assistant', 'super_admin') THEN
    RAISE EXCEPTION 'غير مسموح: يجب أن تكون مشرفاً لتنفيذ هذه العملية.';
  END IF;

  v_clean_phone := lower(regexp_replace(coalesce(p_phone, ''), '\s+', '', 'g'));
  IF v_clean_phone = '' THEN
    RETURN FALSE;
  END IF;

  v_email_custom := v_clean_phone || '-' || p_tenant_id::text || '@masaar.app';
  v_email_default := v_clean_phone || '@masaar.app';

  -- Check if an active profile already exists in this tenant for this phone
  SELECT id INTO v_existing_profile_id
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND phone = v_clean_phone;

  IF v_existing_profile_id IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  -- Profile does NOT exist in this tenant. Delete any orphaned auth user for this email
  DELETE FROM auth.users
  WHERE email = v_email_custom
    AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.users.id);

  IF p_tenant_id = 'd3b07384-d113-4ec2-a5d6-d005b6be4979'::uuid THEN
    DELETE FROM auth.users
    WHERE email = v_email_default
      AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.users.id);
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_orphaned_student_auth(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_student_auth(TEXT, UUID) TO authenticated, service_role;
