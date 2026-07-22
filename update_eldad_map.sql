UPDATE tenants
SET config = jsonb_set(
  config,
  '{location, map_iframe_url}',
  '"https://maps.google.com/maps?q=31.0447599,30.4646362&t=&z=17&ie=UTF8&iwloc=&output=embed"'::jsonb
)
WHERE slug = 'eldad';
