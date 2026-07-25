-- ============================================================================
-- Repurpose the placeholder tenant `sherif-math` into:
--   سنتر البلقدار في الرياضيات والاحصاء  (El-Belqadar Center — Math & Statistics)
--
-- Premium GOLD + BLACK look via config.theme tokens (near-black backgrounds +
-- gold accents) — the SAME mechanism as eldad/mohamed-abdella, NOT the generic
-- primary→secondary rainbow gradient. Folder resolves to `math` (slug has
-- "math"). No domain yet — add later.
--
-- Apply:  supabase db query --linked --file update_belqadar.sql
-- ============================================================================

UPDATE public.tenants
SET
  name            = 'سنتر البلقدار في الرياضيات والاحصاء',
  primary_color   = '#c8a951',   -- premium gold
  secondary_color = '#141210',   -- warm near-black (keeps any gradient gold→black, premium)
  logo_url        = '/images/logo elbeliqdar cropped.png',
  config = COALESCE(config, '{}'::jsonb) || '{
    "subject": "math",

    "theme": {
      "bg_dark": "#0f0d0a",
      "bg_light": "#f6f2e9",
      "card_dark": "#191510",
      "card_light": "#fdfbf5",
      "text_dark": "#ece6d8",
      "text_light": "#191510",
      "border_accent": "rgba(200,169,81,0.24)"
    },

    "teacher": {
      "name": "الأستاذ البلقدار",
      "role": "مدرّس الرياضيات والإحصاء",
      "bio": "خريج كلية العلوم والتربية — قسم الرياضيات. بشرح الرياضيات لطلاب العلمي والإحصاء لطلاب الأدبي بأسلوب مبسّط يقرّب المفاهيم لذهن الطالب ويؤهله للدرجة النهائية.",
      "quote": "الرياضيات لغة، وإتقانها يفتح لك كل الأبواب.",
      "image_base": "/images/logo elbeliqdar cropped.png",
      "image_hover": "/images/logo elbeliqdar cropped.png",
      "target_stage": "المرحلة الثانوية",
      "target_stage_label": "المرحلة التي يدرّسها"
    },

    "branding": {
      "brand_short": {"ar": "سنتر البلقدار", "en": "El-Belqadar Center"},
      "tagline": "الرياضيات والإحصاء للمرحلة الثانوية",
      "hero_title_a": "الرياضيات والإحصاء",
      "hero_title_b": "سنتر البلقدار — الثانوية العامة",
      "hero_sub": "شرح متخصص للرياضيات (للقسم العلمي) والإحصاء (للقسم الأدبي) لطلاب المرحلة الثانوية — بأسلوب مبسّط، مع امتحانات ومتابعة دقيقة لأداء كل طالب.",
      "description": "سنتر البلقدار للرياضيات والإحصاء — محاضرات وامتحانات ومتابعة لطلاب المرحلة الثانوية (علمي وأدبي)."
    },

    "location": {
      "branches": [
        {"name": "المقر الرئيسي", "address": "الكوبري العلوي — شارع بنك أبوظبي — أمام Gym ATP", "phone": "01016705130"}
      ],
      "description": "الكوبري العلوي — شارع بنك أبوظبي — أمام Gym ATP",
      "whatsapp_link": "https://wa.me/201016705130",
      "phone": "01016705130"
    },

    "contact": {"phone": "01016705130", "whatsapp": "https://wa.me/201016705130"},
    "socials": {"whatsapp": "https://wa.me/201016705130"},

    "stages": [
      {
        "id": "secondary",
        "name": "المرحلة الثانوية",
        "enabled": true,
        "grades": [
          {"id": "first-sec",     "name": "الصف الأول الثانوي",                 "enabled": true},
          {"id": "second-sec",    "name": "الصف الثاني الثانوي",                "enabled": true},
          {"id": "third-sec-sci", "name": "الثالث الثانوي — علمي (رياضيات)",   "enabled": true},
          {"id": "third-sec-lit", "name": "الثالث الثانوي — أدبي (إحصاء)",     "enabled": true}
        ]
      }
    ],

    "features": {
      "attendance": true, "grades": true, "exams": true, "homework": true,
      "videos": true, "notifications": true, "payments": true, "chat": true,
      "groups": true, "branches": true, "qr_attendance": true,
      "parent_portal": true, "assistant_accounts": true
    }
  }'::jsonb
WHERE slug = 'sherif-math';
