-- الضاد serves the NEW Egyptian Baccalaureate system only.
-- Replace the prep/secondary stage tree with the three Baccalaureate levels
-- (ids match GRADE_LABEL / the seeded bac-1..3 used elsewhere in the app),
-- and align the hero copy so the landing page states it plainly.
UPDATE tenants
SET config = config
  || jsonb_build_object(
      'stages', jsonb_build_array(
        jsonb_build_object('id','baccalaureate','name','مرحلة البكالوريا','enabled',true,'grades', jsonb_build_array(
          jsonb_build_object('id','bac-1','name','البكالوريا المستوى الأول','enabled',true),
          jsonb_build_object('id','bac-2','name','البكالوريا المستوى الثاني','enabled',true),
          jsonb_build_object('id','bac-3','name','البكالوريا المستوى الثالث','enabled',true)
        ))
      ),
      'branding', COALESCE(config->'branding','{}'::jsonb) || jsonb_build_object(
        'hero_title_a','اللغة العربية',
        'hero_title_b','لغة الضاد — البكالوريا المصرية',
        'hero_sub','منصة متخصصة في شرح اللغة العربية لطلاب نظام البكالوريا المصرية الجديد — نحو وبلاغة وأدب ونصوص وفق مواصفات البكالوريا، مع امتحانات ومتابعة مستمرة.',
        'description','منصة تعليمية متخصصة في اللغة العربية لطلاب نظام البكالوريا المصرية الجديد، مع محاضرات وامتحانات ومتابعة دقيقة لأداء كل طالب.'
      ),
      'teacher', COALESCE(config->'teacher','{}'::jsonb) || jsonb_build_object(
        'target_stage','البكالوريا المصرية (المستويات الأول والثاني والثالث)',
        'target_stage_label','المرحلة التي يدرّسها'
      )
    )
WHERE slug = 'eldad';
