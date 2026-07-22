UPDATE tenants
SET config = jsonb_set(
  jsonb_set(
    jsonb_set(
      config,
      '{location}',
      COALESCE(config->'location', '{}'::jsonb) || '{"directions_link": "https://maps.app.goo.gl/pn5o6Mu9QZuw8o9N8", "address": {"ar": "تشاو مول أعلى سوبر ماركت الإخلاص", "en": "Chow Mall, above Al Ikhlas Supermarket"}, "description": {"ar": "عنوان السنتر / تشاو مول أعلى سوبر ماركت الإخلاص", "en": "Center Address / Chow Mall above Al Ikhlas Supermarket"}, "phone": "01041537102", "whatsapp_link": "https://wa.me/201041537102"}'::jsonb
    ),
    '{socials}',
    COALESCE(config->'socials', '{}'::jsonb) || '{"facebook": "https://www.facebook.com/share/14iSDaaZFpr/", "whatsapp": "https://wa.me/201041537102"}'::jsonb
  ),
  '{contact}',
  COALESCE(config->'contact', '{}'::jsonb) || '{"phone": "01041537102"}'::jsonb
)
WHERE slug = 'eldad';
