-- =====================================================================
-- 2026_07_05_dynamic_tenant_config.sql
-- Run once in the Supabase SQL editor.
--
-- Idempotent script: adds performance indexes on tenant_id columns
-- and seeds the extended, dynamic tenant configuration JSONB.
-- =====================================================================

-- 1. Create missing single-column indexes on tenant_id for RLS performance
CREATE INDEX IF NOT EXISTS idx_branches_tenant_id ON public.branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_academic_years_tenant_id ON public.academic_years(tenant_id);
CREATE INDEX IF NOT EXISTS idx_groups_tenant_id ON public.groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_student_groups_tenant_id ON public.student_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_tenant_id ON public.attendance_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_tenant_id ON public.attendance_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_student_ledger_tenant_id ON public.student_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_student_notes_tenant_id ON public.student_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attachments_tenant_id ON public.attachments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_unified_notifications_tenant_id ON public.unified_notifications(tenant_id);

-- 2. Create composite indexes for high-frequency queries
CREATE INDEX IF NOT EXISTS idx_student_ledger_student_status_tenant ON public.student_ledger(student_id, status, tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student_session_tenant ON public.attendance_records(student_id, session_id, tenant_id);

-- 3. Upsert tenants with inlined configuration schemas
-- Tenant 1: Default
INSERT INTO public.tenants (id, slug, name, config)
VALUES (
  'd3b07384-d113-4ec2-a5d6-d005b6be4979',
  'default',
  'منصة مسار التعليمية',
  '{
    "subject": "default",
    "features": {
      "homework": true,
      "exams": true,
      "videos": true,
      "payments": true,
      "chat": true,
      "attendance": true,
      "qr_attendance": true,
      "parent_portal": true,
      "notifications": true,
      "student_notes": true,
      "branches": true,
      "groups": true,
      "reports": true,
      "assistant_accounts": true
    },
    "grades": {
      "primary-1": true,
      "primary-2": true,
      "primary-3": true,
      "primary-4": true,
      "primary-5": true,
      "primary-6": true,
      "first-prep": true,
      "second-prep": true,
      "third-prep": true,
      "first-sec": true,
      "second-sec": true,
      "third-sec": true,
      "bac-1": true,
      "bac-2": true,
      "bac-3": true
    },
    "stages": [
      {
        "id": "primary",
        "name": "المرحلة الابتدائية",
        "enabled": true,
        "grades": [
          {"id": "primary-1", "name": "الصف الأول الابتدائي", "enabled": true},
          {"id": "primary-2", "name": "الصف الثاني الابتدائي", "enabled": true},
          {"id": "primary-3", "name": "الصف الثالث الابتدائي", "enabled": true},
          {"id": "primary-4", "name": "الصف الرابع الابتدائي", "enabled": true},
          {"id": "primary-5", "name": "الصف الخامس الابتدائي", "enabled": true},
          {"id": "primary-6", "name": "الصف السادس الابتدائي", "enabled": true}
        ]
      },
      {
        "id": "preparatory",
        "name": "المرحلة الإعدادية",
        "enabled": true,
        "grades": [
          {"id": "first-prep", "name": "الصف الأول الإعدادي", "enabled": true},
          {"id": "second-prep", "name": "الصف الثاني الإعدادي", "enabled": true},
          {"id": "third-prep", "name": "الصف الثالث الإعدادي", "enabled": true}
        ]
      },
      {
        "id": "secondary",
        "name": "المرحلة الثانوية",
        "enabled": true,
        "grades": [
          {"id": "first-sec", "name": "الصف الأول الثانوي", "enabled": true},
          {"id": "second-sec", "name": "الصف الثاني الثانوي", "enabled": true},
          {"id": "third-sec", "name": "الصف الثالث الثانوي", "enabled": true}
        ]
      },
      {
        "id": "baccalaureate",
        "name": "البكالوريا المصرية / النظام الجديد",
        "enabled": true,
        "grades": [
          {"id": "bac-1", "name": "البكالوريا المستوى الأول", "enabled": true},
          {"id": "bac-2", "name": "البكالوريا المستوى الثاني", "enabled": true},
          {"id": "bac-3", "name": "البكالوريا المستوى الثالث", "enabled": true}
        ]
      }
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 2: Mona Chemistry
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'mona-chem',
  'منصة الكيمياء - أ. منى',
  '{
    "subject": "chemistry",
    "features": {
      "homework": true,
      "exams": true,
      "videos": true,
      "payments": true,
      "chat": true,
      "attendance": true,
      "qr_attendance": true,
      "parent_portal": true,
      "notifications": true,
      "student_notes": true,
      "branches": true,
      "groups": true,
      "reports": true,
      "assistant_accounts": true
    },
    "grades": {
      "primary-1": true,
      "primary-2": true,
      "primary-3": true,
      "primary-4": true,
      "primary-5": true,
      "primary-6": true,
      "first-prep": true,
      "second-prep": true,
      "third-prep": true,
      "first-sec": true,
      "second-sec": true,
      "third-sec": true,
      "bac-1": true,
      "bac-2": true,
      "bac-3": true
    },
    "stages": [
      {
        "id": "primary",
        "name": "المرحلة الابتدائية",
        "enabled": true,
        "grades": [
          {"id": "primary-1", "name": "الصف الأول الابتدائي", "enabled": true},
          {"id": "primary-2", "name": "الصف الثاني الابتدائي", "enabled": true},
          {"id": "primary-3", "name": "الصف الثالث الابتدائي", "enabled": true},
          {"id": "primary-4", "name": "الصف الرابع الابتدائي", "enabled": true},
          {"id": "primary-5", "name": "الصف الخامس الابتدائي", "enabled": true},
          {"id": "primary-6", "name": "الصف السادس الابتدائي", "enabled": true}
        ]
      },
      {
        "id": "preparatory",
        "name": "المرحلة الإعدادية",
        "enabled": true,
        "grades": [
          {"id": "first-prep", "name": "الصف الأول الإعدادي", "enabled": true},
          {"id": "second-prep", "name": "الصف الثاني الإعدادي", "enabled": true},
          {"id": "third-prep", "name": "الصف الثالث الإعدادي", "enabled": true}
        ]
      },
      {
        "id": "secondary",
        "name": "المرحلة الثانوية",
        "enabled": true,
        "grades": [
          {"id": "first-sec", "name": "الصف الأول الثانوي", "enabled": true},
          {"id": "second-sec", "name": "الصف الثاني الثانوي", "enabled": true},
          {"id": "third-sec", "name": "الصف الثالث الثانوي", "enabled": true}
        ]
      },
      {
        "id": "baccalaureate",
        "name": "البكالوريا المصرية / النظام الجديد",
        "enabled": true,
        "grades": [
          {"id": "bac-1", "name": "البكالوريا المستوى الأول", "enabled": true},
          {"id": "bac-2", "name": "البكالوريا المستوى الثاني", "enabled": true},
          {"id": "bac-3", "name": "البكالوريا المستوى الثالث", "enabled": true}
        ]
      }
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 3: Sherif Physics
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-physics',
  'منصة الفيزياء - أ. شريف',
  '{
    "subject": "physics",
    "features": {
      "homework": true,
      "exams": true,
      "videos": true,
      "payments": true,
      "chat": true,
      "attendance": true,
      "qr_attendance": true,
      "parent_portal": true,
      "notifications": true,
      "student_notes": true,
      "branches": true,
      "groups": true,
      "reports": true,
      "assistant_accounts": true
    },
    "grades": {
      "primary-1": true,
      "primary-2": true,
      "primary-3": true,
      "primary-4": true,
      "primary-5": true,
      "primary-6": true,
      "first-prep": true,
      "second-prep": true,
      "third-prep": true,
      "first-sec": true,
      "second-sec": true,
      "third-sec": true,
      "bac-1": true,
      "bac-2": true,
      "bac-3": true
    },
    "stages": [
      {
        "id": "primary",
        "name": "المرحلة الابتدائية",
        "enabled": true,
        "grades": [
          {"id": "primary-1", "name": "الصف الأول الابتدائي", "enabled": true},
          {"id": "primary-2", "name": "الصف الثاني الابتدائي", "enabled": true},
          {"id": "primary-3", "name": "الصف الثالث الابتدائي", "enabled": true},
          {"id": "primary-4", "name": "الصف الرابع الابتدائي", "enabled": true},
          {"id": "primary-5", "name": "الصف الخامس الابتدائي", "enabled": true},
          {"id": "primary-6", "name": "الصف السادس الابتدائي", "enabled": true}
        ]
      },
      {
        "id": "preparatory",
        "name": "المرحلة الإعدادية",
        "enabled": true,
        "grades": [
          {"id": "first-prep", "name": "الصف الأول الإعدادي", "enabled": true},
          {"id": "second-prep", "name": "الصف الثاني الإعدادي", "enabled": true},
          {"id": "third-prep", "name": "الصف الثالث الإعدادي", "enabled": true}
        ]
      },
      {
        "id": "secondary",
        "name": "المرحلة الثانوية",
        "enabled": true,
        "grades": [
          {"id": "first-sec", "name": "الصف الأول الثانوي", "enabled": true},
          {"id": "second-sec", "name": "الصف الثاني الثانوي", "enabled": true},
          {"id": "third-sec", "name": "الصف الثالث الثانوي", "enabled": true}
        ]
      },
      {
        "id": "baccalaureate",
        "name": "البكالوريا المصرية / النظام الجديد",
        "enabled": true,
        "grades": [
          {"id": "bac-1", "name": "البكالوريا المستوى الأول", "enabled": true},
          {"id": "bac-2", "name": "البكالوريا المستوى الثاني", "enabled": true},
          {"id": "bac-3", "name": "البكالوريا المستوى الثالث", "enabled": true}
        ]
      }
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 4: Sherif Biology
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-biology',
  'الأستاذ شريف - أحياء',
  '{
    "subject": "biology",
    "features": {
      "homework": true,
      "exams": true,
      "videos": true,
      "payments": true,
      "chat": true,
      "attendance": true,
      "qr_attendance": true,
      "parent_portal": true,
      "notifications": true,
      "student_notes": true,
      "branches": true,
      "groups": true,
      "reports": true,
      "assistant_accounts": true
    },
    "grades": {
      "primary-1": true,
      "primary-2": true,
      "primary-3": true,
      "primary-4": true,
      "primary-5": true,
      "primary-6": true,
      "first-prep": true,
      "second-prep": true,
      "third-prep": true,
      "first-sec": true,
      "second-sec": true,
      "third-sec": true,
      "bac-1": true,
      "bac-2": true,
      "bac-3": true
    },
    "stages": [
      {
        "id": "primary",
        "name": "المرحلة الابتدائية",
        "enabled": true,
        "grades": [
          {"id": "primary-1", "name": "الصف الأول الابتدائي", "enabled": true},
          {"id": "primary-2", "name": "الصف الثاني الابتدائي", "enabled": true},
          {"id": "primary-3", "name": "الصف الثالث الابتدائي", "enabled": true},
          {"id": "primary-4", "name": "الصف الرابع الابتدائي", "enabled": true},
          {"id": "primary-5", "name": "الصف الخامس الابتدائي", "enabled": true},
          {"id": "primary-6", "name": "الصف السادس الابتدائي", "enabled": true}
        ]
      },
      {
        "id": "preparatory",
        "name": "المرحلة الإعدادية",
        "enabled": true,
        "grades": [
          {"id": "first-prep", "name": "الصف الأول الإعدادي", "enabled": true},
          {"id": "second-prep", "name": "الصف الثاني الإعدادي", "enabled": true},
          {"id": "third-prep", "name": "الصف الثالث الإعدادي", "enabled": true}
        ]
      },
      {
        "id": "secondary",
        "name": "المرحلة الثانوية",
        "enabled": true,
        "grades": [
          {"id": "first-sec", "name": "الصف الأول الثانوي", "enabled": true},
          {"id": "second-sec", "name": "الصف الثاني الثانوي", "enabled": true},
          {"id": "third-sec", "name": "الصف الثالث الثانوي", "enabled": true}
        ]
      },
      {
        "id": "baccalaureate",
        "name": "البكالوريا المصرية / النظام الجديد",
        "enabled": true,
        "grades": [
          {"id": "bac-1", "name": "البكالوريا المستوى الأول", "enabled": true},
          {"id": "bac-2", "name": "البكالوريا المستوى الثاني", "enabled": true},
          {"id": "bac-3", "name": "البكالوريا المستوى الثالث", "enabled": true}
        ]
      }
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 5: Sherif Science
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-science',
  'الأستاذ شريف - علوم',
  '{
    "subject": "science",
    "features": {
      "homework": true,
      "exams": true,
      "videos": true,
      "payments": true,
      "chat": true,
      "attendance": true,
      "qr_attendance": true,
      "parent_portal": true,
      "notifications": true,
      "student_notes": true,
      "branches": true,
      "groups": true,
      "reports": true,
      "assistant_accounts": true
    },
    "grades": {
      "primary-1": true,
      "primary-2": true,
      "primary-3": true,
      "primary-4": true,
      "primary-5": true,
      "primary-6": true,
      "first-prep": true,
      "second-prep": true,
      "third-prep": true,
      "first-sec": true,
      "second-sec": true,
      "third-sec": true,
      "bac-1": true,
      "bac-2": true,
      "bac-3": true
    },
    "stages": [
      {
        "id": "primary",
        "name": "المرحلة الابتدائية",
        "enabled": true,
        "grades": [
          {"id": "primary-1", "name": "الصف الأول الابتدائي", "enabled": true},
          {"id": "primary-2", "name": "الصف الثاني الابتدائي", "enabled": true},
          {"id": "primary-3", "name": "الصف الثالث الابتدائي", "enabled": true},
          {"id": "primary-4", "name": "الصف الرابع الابتدائي", "enabled": true},
          {"id": "primary-5", "name": "الصف الخامس الابتدائي", "enabled": true},
          {"id": "primary-6", "name": "الصف السادس الابتدائي", "enabled": true}
        ]
      },
      {
        "id": "preparatory",
        "name": "المرحلة الإعدادية",
        "enabled": true,
        "grades": [
          {"id": "first-prep", "name": "الصف الأول الإعدادي", "enabled": true},
          {"id": "second-prep", "name": "الصف الثاني الإعدادي", "enabled": true},
          {"id": "third-prep", "name": "الصف الثالث الإعدادي", "enabled": true}
        ]
      },
      {
        "id": "secondary",
        "name": "المرحلة الثانوية",
        "enabled": true,
        "grades": [
          {"id": "first-sec", "name": "الصف الأول الثانوي", "enabled": true},
          {"id": "second-sec", "name": "الصف الثاني الثانوي", "enabled": true},
          {"id": "third-sec", "name": "الصف الثالث الثانوي", "enabled": true}
        ]
      },
      {
        "id": "baccalaureate",
        "name": "البكالوريا المصرية / النظام الجديد",
        "enabled": true,
        "grades": [
          {"id": "bac-1", "name": "البكالوريا المستوى الأول", "enabled": true},
          {"id": "bac-2", "name": "البكالوريا المستوى الثاني", "enabled": true},
          {"id": "bac-3", "name": "البكالوريا المستوى الثالث", "enabled": true}
        ]
      }
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 6: Sherif Geology
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-geology',
  'الأستاذ شريف - جيولوجيا',
  '{
    "subject": "geology",
    "features": {
      "homework": true,
      "exams": true,
      "videos": true,
      "payments": true,
      "chat": true,
      "attendance": true,
      "qr_attendance": true,
      "parent_portal": true,
      "notifications": true,
      "student_notes": true,
      "branches": true,
      "groups": true,
      "reports": true,
      "assistant_accounts": true
    },
    "grades": {
      "primary-1": true,
      "primary-2": true,
      "primary-3": true,
      "primary-4": true,
      "primary-5": true,
      "primary-6": true,
      "first-prep": true,
      "second-prep": true,
      "third-prep": true,
      "first-sec": true,
      "second-sec": true,
      "third-sec": true,
      "bac-1": true,
      "bac-2": true,
      "bac-3": true
    },
    "stages": [
      {
        "id": "primary",
        "name": "المرحلة الابتدائية",
        "enabled": true,
        "grades": [
          {"id": "primary-1", "name": "الصف الأول الابتدائي", "enabled": true},
          {"id": "primary-2", "name": "الصف الثاني الابتدائي", "enabled": true},
          {"id": "primary-3", "name": "الصف الثالث الابتدائي", "enabled": true},
          {"id": "primary-4", "name": "الصف الرابع الابتدائي", "enabled": true},
          {"id": "primary-5", "name": "الصف الخامس الابتدائي", "enabled": true},
          {"id": "primary-6", "name": "الصف السادس الابتدائي", "enabled": true}
        ]
      },
      {
        "id": "preparatory",
        "name": "المرحلة الإعدادية",
        "enabled": true,
        "grades": [
          {"id": "first-prep", "name": "الصف الأول الإعدادي", "enabled": true},
          {"id": "second-prep", "name": "الصف الثاني الإعدادي", "enabled": true},
          {"id": "third-prep", "name": "الصف الثالث الإعدادي", "enabled": true}
        ]
      },
      {
        "id": "secondary",
        "name": "المرحلة الثانوية",
        "enabled": true,
        "grades": [
          {"id": "first-sec", "name": "الصف الأول الثانوي", "enabled": true},
          {"id": "second-sec", "name": "الصف الثاني الثانوي", "enabled": true},
          {"id": "third-sec", "name": "الصف الثالث الثانوي", "enabled": true}
        ]
      },
      {
        "id": "baccalaureate",
        "name": "البكالوريا المصرية / النظام الجديد",
        "enabled": true,
        "grades": [
          {"id": "bac-1", "name": "البكالوريا المستوى الأول", "enabled": true},
          {"id": "bac-2", "name": "البكالوريا المستوى الثاني", "enabled": true},
          {"id": "bac-3", "name": "البكالوريا المستوى الثالث", "enabled": true}
        ]
      }
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 7: Sherif English
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-english',
  'الأستاذ شريف - لغة إنجليزية',
  '{
    "subject": "english",
    "features": {
      "homework": true,
      "exams": true,
      "videos": true,
      "payments": true,
      "chat": true,
      "attendance": true,
      "qr_attendance": true,
      "parent_portal": true,
      "notifications": true,
      "student_notes": true,
      "branches": true,
      "groups": true,
      "reports": true,
      "assistant_accounts": true
    },
    "grades": {
      "primary-1": false,
      "primary-2": false,
      "primary-3": false,
      "primary-4": true,
      "primary-5": true,
      "primary-6": true,
      "first-prep": true,
      "second-prep": true,
      "third-prep": true,
      "first-sec": true,
      "second-sec": true,
      "third-sec": true,
      "bac-1": true,
      "bac-2": true,
      "bac-3": true
    },
    "stages": [
      {
        "id": "primary",
        "name": "المرحلة الابتدائية",
        "enabled": true,
        "grades": [
          {"id": "primary-1", "name": "الصف الأول الابتدائي", "enabled": false},
          {"id": "primary-2", "name": "الصف الثاني الابتدائي", "enabled": false},
          {"id": "primary-3", "name": "الصف الثالث الابتدائي", "enabled": false},
          {"id": "primary-4", "name": "الصف الرابع الابتدائي", "enabled": true},
          {"id": "primary-5", "name": "الصف الخامس الابتدائي", "enabled": true},
          {"id": "primary-6", "name": "الصف السادس الابتدائي", "enabled": true}
        ]
      },
      {
        "id": "preparatory",
        "name": "المرحلة الإعدادية",
        "enabled": true,
        "grades": [
          {"id": "first-prep", "name": "الصف الأول الإعدادي", "enabled": true},
          {"id": "second-prep", "name": "الصف الثاني الإعدادي", "enabled": true},
          {"id": "third-prep", "name": "الصف الثالث الإعدادي", "enabled": true}
        ]
      },
      {
        "id": "secondary",
        "name": "المرحلة الثانوية",
        "enabled": true,
        "grades": [
          {"id": "first-sec", "name": "الصف الأول الثانوي", "enabled": true},
          {"id": "second-sec", "name": "الصف الثاني الثانوي", "enabled": true},
          {"id": "third-sec", "name": "الصف الثالث الثانوي", "enabled": true}
        ]
      },
      {
        "id": "baccalaureate",
        "name": "البكالوريا المصرية / النظام الجديد",
        "enabled": true,
        "grades": [
          {"id": "bac-1", "name": "البكالوريا المستوى الأول", "enabled": true},
          {"id": "bac-2", "name": "البكالوريا المستوى الثاني", "enabled": true},
          {"id": "bac-3", "name": "البكالوريا المستوى الثالث", "enabled": true}
        ]
      }
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 8: Sherif Humanities
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-humanities',
  'الأستاذ شريف - تاريخ وجغرافيا',
  '{
    "subject": "humanities",
    "features": {
      "homework": true,
      "exams": true,
      "videos": true,
      "payments": true,
      "chat": true,
      "attendance": true,
      "qr_attendance": true,
      "parent_portal": true,
      "notifications": true,
      "student_notes": true,
      "branches": true,
      "groups": true,
      "reports": true,
      "assistant_accounts": true
    },
    "grades": {
      "primary-1": true,
      "primary-2": true,
      "primary-3": true,
      "primary-4": true,
      "primary-5": true,
      "primary-6": true,
      "first-prep": true,
      "second-prep": true,
      "third-prep": true,
      "first-sec": true,
      "second-sec": true,
      "third-sec": true,
      "bac-1": true,
      "bac-2": true,
      "bac-3": true
    },
    "stages": [
      {
        "id": "primary",
        "name": "المرحلة الابتدائية",
        "enabled": true,
        "grades": [
          {"id": "primary-1", "name": "الصف الأول الابتدائي", "enabled": true},
          {"id": "primary-2", "name": "الصف الثاني الابتدائي", "enabled": true},
          {"id": "primary-3", "name": "الصف الثالث الابتدائي", "enabled": true},
          {"id": "primary-4", "name": "الصف الرابع الابتدائي", "enabled": true},
          {"id": "primary-5", "name": "الصف الخامس الابتدائي", "enabled": true},
          {"id": "primary-6", "name": "الصف السادس الابتدائي", "enabled": true}
        ]
      },
      {
        "id": "preparatory",
        "name": "المرحلة الإعدادية",
        "enabled": true,
        "grades": [
          {"id": "first-prep", "name": "الصف الأول الإعدادي", "enabled": true},
          {"id": "second-prep", "name": "الصف الثاني الإعدادي", "enabled": true},
          {"id": "third-prep", "name": "الصف الثالث الإعدادي", "enabled": true}
        ]
      },
      {
        "id": "secondary",
        "name": "المرحلة الثانوية",
        "enabled": true,
        "grades": [
          {"id": "first-sec", "name": "الصف الأول الثانوي", "enabled": true},
          {"id": "second-sec", "name": "الصف الثاني الثانوي", "enabled": true},
          {"id": "third-sec", "name": "الصف الثالث الثانوي", "enabled": true}
        ]
      },
      {
        "id": "baccalaureate",
        "name": "البكالوريا المصرية / النظام الجديد",
        "enabled": true,
        "grades": [
          {"id": "bac-1", "name": "البكالوريا المستوى الأول", "enabled": true},
          {"id": "bac-2", "name": "البكالوريا المستوى الثاني", "enabled": true},
          {"id": "bac-3", "name": "البكالوريا المستوى الثالث", "enabled": true}
        ]
      }
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 9: Sherif Programming
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-programming',
  'الأستاذ شريف - حاسب آلي وبرمجة',
  '{
    "subject": "cyber",
    "features": {
      "homework": true,
      "exams": true,
      "videos": true,
      "payments": true,
      "chat": true,
      "attendance": true,
      "qr_attendance": true,
      "parent_portal": true,
      "notifications": true,
      "student_notes": true,
      "branches": true,
      "groups": true,
      "reports": true,
      "assistant_accounts": true
    },
    "grades": {
      "primary-1": true,
      "primary-2": true,
      "primary-3": true,
      "primary-4": true,
      "primary-5": true,
      "primary-6": true,
      "first-prep": true,
      "second-prep": true,
      "third-prep": true,
      "first-sec": true,
      "second-sec": true,
      "third-sec": true,
      "bac-1": true,
      "bac-2": true,
      "bac-3": true
    },
    "stages": [
      {
        "id": "primary",
        "name": "المرحلة الابتدائية",
        "enabled": true,
        "grades": [
          {"id": "primary-1", "name": "الصف الأول الابتدائي", "enabled": true},
          {"id": "primary-2", "name": "الصف الثاني الابتدائي", "enabled": true},
          {"id": "primary-3", "name": "الصف الثالث الابتدائي", "enabled": true},
          {"id": "primary-4", "name": "الصف الرابع الابتدائي", "enabled": true},
          {"id": "primary-5", "name": "الصف الخامس الابتدائي", "enabled": true},
          {"id": "primary-6", "name": "الصف السادس الابتدائي", "enabled": true}
        ]
      },
      {
        "id": "preparatory",
        "name": "المرحلة الإعدادية",
        "enabled": true,
        "grades": [
          {"id": "first-prep", "name": "الصف الأول الإعدادي", "enabled": true},
          {"id": "second-prep", "name": "الصف الثاني الإعدادي", "enabled": true},
          {"id": "third-prep", "name": "الصف الثالث الإعدادي", "enabled": true}
        ]
      },
      {
        "id": "secondary",
        "name": "المرحلة الثانوية",
        "enabled": true,
        "grades": [
          {"id": "first-sec", "name": "الصف الأول الثانوي", "enabled": true},
          {"id": "second-sec", "name": "الصف الثاني الثانوي", "enabled": true},
          {"id": "third-sec", "name": "الصف الثالث الثانوي", "enabled": true}
        ]
      },
      {
        "id": "baccalaureate",
        "name": "البكالوريا المصرية / النظام الجديد",
        "enabled": true,
        "grades": [
          {"id": "bac-1", "name": "البكالوريا المستوى الأول", "enabled": true},
          {"id": "bac-2", "name": "البكالوريا المستوى الثاني", "enabled": true},
          {"id": "bac-3", "name": "البكالوريا المستوى الثالث", "enabled": true}
        ]
      }
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 10: Sherif Math
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-math',
  'الأستاذ شريف - رياضيات',
  '{
    "subject": "math",
    "features": {
      "homework": true,
      "exams": true,
      "videos": true,
      "payments": true,
      "chat": true,
      "attendance": true,
      "qr_attendance": true,
      "parent_portal": true,
      "notifications": true,
      "student_notes": true,
      "branches": true,
      "groups": true,
      "reports": true,
      "assistant_accounts": true
    },
    "grades": {
      "primary-1": true,
      "primary-2": true,
      "primary-3": true,
      "primary-4": true,
      "primary-5": true,
      "primary-6": true,
      "first-prep": true,
      "second-prep": true,
      "third-prep": true,
      "first-sec": true,
      "second-sec": true,
      "third-sec": true,
      "bac-1": true,
      "bac-2": true,
      "bac-3": true
    },
    "stages": [
      {
        "id": "primary",
        "name": "المرحلة الابتدائية",
        "enabled": true,
        "grades": [
          {"id": "primary-1", "name": "الصف الأول الابتدائي", "enabled": true},
          {"id": "primary-2", "name": "الصف الثاني الابتدائي", "enabled": true},
          {"id": "primary-3", "name": "الصف الثالث الابتدائي", "enabled": true},
          {"id": "primary-4", "name": "الصف الرابع الابتدائي", "enabled": true},
          {"id": "primary-5", "name": "الصف الخامس الابتدائي", "enabled": true},
          {"id": "primary-6", "name": "الصف السادس الابتدائي", "enabled": true}
        ]
      },
      {
        "id": "preparatory",
        "name": "المرحلة الإعدادية",
        "enabled": true,
        "grades": [
          {"id": "first-prep", "name": "الصف الأول الإعدادي", "enabled": true},
          {"id": "second-prep", "name": "الصف الثاني الإعدادي", "enabled": true},
          {"id": "third-prep", "name": "الصف الثالث الإعدادي", "enabled": true}
        ]
      },
      {
        "id": "secondary",
        "name": "المرحلة الثانوية",
        "enabled": true,
        "grades": [
          {"id": "first-sec", "name": "الصف الأول الثانوي", "enabled": true},
          {"id": "second-sec", "name": "الصف الثاني الثانوي", "enabled": true},
          {"id": "third-sec", "name": "الصف الثالث الثانوي", "enabled": true}
        ]
      },
      {
        "id": "baccalaureate",
        "name": "البكالوريا المصرية / النظام الجديد",
        "enabled": true,
        "grades": [
          {"id": "bac-1", "name": "البكالوريا المستوى الأول", "enabled": true},
          {"id": "bac-2", "name": "البكالوريا المستوى الثاني", "enabled": true},
          {"id": "bac-3", "name": "البكالوريا المستوى الثالث", "enabled": true}
        ]
      }
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;
