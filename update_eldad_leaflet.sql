UPDATE tenants
SET config = jsonb_set(
  config,
  '{location, branches}',
  '[{"name": "الفرع الرئيسي", "lat": 31.0447599, "lng": 30.4646362, "address": "تشاو مول أعلى سوبر ماركت الإخلاص", "phone": "01041537102"}]'::jsonb
)
WHERE slug = 'eldad';
