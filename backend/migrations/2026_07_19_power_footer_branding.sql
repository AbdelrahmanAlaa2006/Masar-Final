-- Footer brand text for the power tenant (mrmohamedabdella.com).
-- Footer.jsx reads tenant.config.branding.tagline/description; without them it
-- fell back to a generic text that mentioned the preparatory stage only.
-- The correct coverage: إعدادي + ثانوي + بكالوريا (عام وأزهر).

UPDATE tenants
SET config = jsonb_set(
  config,
  '{branding}',
  COALESCE(config->'branding', '{}'::jsonb) || jsonb_build_object(
    'tagline', 'طريقك إلى التفوق الدراسي',
    'description', 'منصة تعليمية متكاملة تقدم محاضرات وامتحانات وفيديوهات تفاعلية للمراحل الإعدادية والثانوية والبكالوريا عام وأزهر، مع متابعة دقيقة لأداء كل طالب.'
  )
)
WHERE slug = 'mohamed-abdella';
