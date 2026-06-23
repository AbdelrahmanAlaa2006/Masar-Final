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

-- Helper function to generate standard default stages JSONB array (all enabled)
CREATE OR REPLACE FUNCTION public.get_default_stages_config()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN jsonb_build_array(
    jsonb_build_object(
      'id', 'primary',
      'name', 'المرحلة الابتدائية',
      'enabled', true,
      'grades', jsonb_build_array(
        jsonb_build_object('id', 'primary-1', 'name', 'الصف الأول الابتدائي', 'enabled', true),
        jsonb_build_object('id', 'primary-2', 'name', 'الصف الثاني الابتدائي', 'enabled', true),
        jsonb_build_object('id', 'primary-3', 'name', 'الصف الثالث الابتدائي', 'enabled', true),
        jsonb_build_object('id', 'primary-4', 'name', 'الصف الرابع الابتدائي', 'enabled', true),
        jsonb_build_object('id', 'primary-5', 'name', 'الصف الخامس الابتدائي', 'enabled', true),
        jsonb_build_object('id', 'primary-6', 'name', 'الصف السادس الابتدائي', 'enabled', true)
      )
    ),
    jsonb_build_object(
      'id', 'preparatory',
      'name', 'المرحلة الإعدادية',
      'enabled', true,
      'grades', jsonb_build_array(
        jsonb_build_object('id', 'first-prep', 'name', 'الصف الأول الإعدادي', 'enabled', true),
        jsonb_build_object('id', 'second-prep', 'name', 'الصف الثاني الإعدادي', 'enabled', true),
        jsonb_build_object('id', 'third-prep', 'name', 'الصف الثالث الإعدادي', 'enabled', true)
      )
    ),
    jsonb_build_object(
      'id', 'secondary',
      'name', 'المرحلة الثانوية',
      'enabled', true,
      'grades', jsonb_build_array(
        jsonb_build_object('id', 'first-sec', 'name', 'الصف الأول الثانوي', 'enabled', true),
        jsonb_build_object('id', 'second-sec', 'name', 'الصف الثاني الثانوي', 'enabled', true),
        jsonb_build_object('id', 'third-sec', 'name', 'الصف الثالث الثانوي', 'enabled', true)
      )
    ),
    jsonb_build_object(
      'id', 'baccalaureate',
      'name', 'البكالوريا المصرية / النظام الجديد',
      'enabled', true,
      'grades', jsonb_build_array(
        jsonb_build_object('id', 'bac-1', 'name', 'البكالوريا المستوى الأول', 'enabled', true),
        jsonb_build_object('id', 'bac-2', 'name', 'البكالوريا المستوى الثاني', 'enabled', true),
        jsonb_build_object('id', 'bac-3', 'name', 'البكالوريا المستوى الثالث', 'enabled', true)
      )
    )
  );
END;
$$;

-- 3. Upsert tenants with new configuration schemas (including backward-compatible keys)
-- Tenant 1: Default
INSERT INTO public.tenants (id, slug, name, config)
VALUES (
  'd3b07384-d113-4ec2-a5d6-d005b6be4979',
  'default',
  'منصة مسار التعليمية',
  jsonb_build_object(
    'subject', 'default',
    'features', jsonb_build_object(
      'homework', true, 'exams', true, 'videos', true, 'payments', true, 'chat', true,
      'attendance', true, 'qr_attendance', true, 'parent_portal', true, 'notifications', true,
      'student_notes', true, 'branches', true, 'groups', true, 'reports', true, 'assistant_accounts', true
    ),
    'grades', jsonb_build_object(
      'primary-1', true, 'primary-2', true, 'primary-3', true, 'primary-4', true, 'primary-5', true, 'primary-6', true,
      'first-prep', true, 'second-prep', true, 'third-prep', true,
      'first-sec', true, 'second-sec', true, 'third-sec', true,
      'bac-1', true, 'bac-2', true, 'bac-3', true
    ),
    'stages', public.get_default_stages_config()
  )
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 2: Mona Chemistry
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'mona-chem',
  'منصة الكيمياء - أ. منى',
  jsonb_build_object(
    'subject', 'chemistry',
    'features', jsonb_build_object(
      'homework', true, 'exams', true, 'videos', true, 'payments', true, 'chat', true,
      'attendance', true, 'qr_attendance', true, 'parent_portal', true, 'notifications', true,
      'student_notes', true, 'branches', true, 'groups', true, 'reports', true, 'assistant_accounts', true
    ),
    'grades', jsonb_build_object(
      'primary-1', true, 'primary-2', true, 'primary-3', true, 'primary-4', true, 'primary-5', true, 'primary-6', true,
      'first-prep', true, 'second-prep', true, 'third-prep', true,
      'first-sec', true, 'second-sec', true, 'third-sec', true,
      'bac-1', true, 'bac-2', true, 'bac-3', true
    ),
    'stages', public.get_default_stages_config()
  )
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 3: Sherif Physics
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-physics',
  'منصة الفيزياء - أ. شريف',
  jsonb_build_object(
    'subject', 'physics',
    'features', jsonb_build_object(
      'homework', true, 'exams', true, 'videos', true, 'payments', true, 'chat', true,
      'attendance', true, 'qr_attendance', true, 'parent_portal', true, 'notifications', true,
      'student_notes', true, 'branches', true, 'groups', true, 'reports', true, 'assistant_accounts', true
    ),
    'grades', jsonb_build_object(
      'primary-1', true, 'primary-2', true, 'primary-3', true, 'primary-4', true, 'primary-5', true, 'primary-6', true,
      'first-prep', true, 'second-prep', true, 'third-prep', true,
      'first-sec', true, 'second-sec', true, 'third-sec', true,
      'bac-1', true, 'bac-2', true, 'bac-3', true
    ),
    'stages', public.get_default_stages_config()
  )
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 4: Sherif Biology
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-biology',
  'الأستاذ شريف - أحياء',
  jsonb_build_object(
    'subject', 'biology',
    'features', jsonb_build_object(
      'homework', true, 'exams', true, 'videos', true, 'payments', true, 'chat', true,
      'attendance', true, 'qr_attendance', true, 'parent_portal', true, 'notifications', true,
      'student_notes', true, 'branches', true, 'groups', true, 'reports', true, 'assistant_accounts', true
    ),
    'grades', jsonb_build_object(
      'primary-1', true, 'primary-2', true, 'primary-3', true, 'primary-4', true, 'primary-5', true, 'primary-6', true,
      'first-prep', true, 'second-prep', true, 'third-prep', true,
      'first-sec', true, 'second-sec', true, 'third-sec', true,
      'bac-1', true, 'bac-2', true, 'bac-3', true
    ),
    'stages', public.get_default_stages_config()
  )
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 5: Sherif Science
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-science',
  'الأستاذ شريف - علوم',
  jsonb_build_object(
    'subject', 'science',
    'features', jsonb_build_object(
      'homework', true, 'exams', true, 'videos', true, 'payments', true, 'chat', true,
      'attendance', true, 'qr_attendance', true, 'parent_portal', true, 'notifications', true,
      'student_notes', true, 'branches', true, 'groups', true, 'reports', true, 'assistant_accounts', true
    ),
    'grades', jsonb_build_object(
      'primary-1', true, 'primary-2', true, 'primary-3', true, 'primary-4', true, 'primary-5', true, 'primary-6', true,
      'first-prep', true, 'second-prep', true, 'third-prep', true,
      'first-sec', true, 'second-sec', true, 'third-sec', true,
      'bac-1', true, 'bac-2', true, 'bac-3', true
    ),
    'stages', public.get_default_stages_config()
  )
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 6: Sherif Geology
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-geology',
  'الأستاذ شريف - جيولوجيا',
  jsonb_build_object(
    'subject', 'geology',
    'features', jsonb_build_object(
      'homework', true, 'exams', true, 'videos', true, 'payments', true, 'chat', true,
      'attendance', true, 'qr_attendance', true, 'parent_portal', true, 'notifications', true,
      'student_notes', true, 'branches', true, 'groups', true, 'reports', true, 'assistant_accounts', true
    ),
    'grades', jsonb_build_object(
      'primary-1', true, 'primary-2', true, 'primary-3', true, 'primary-4', true, 'primary-5', true, 'primary-6', true,
      'first-prep', true, 'second-prep', true, 'third-prep', true,
      'first-sec', true, 'second-sec', true, 'third-sec', true,
      'bac-1', true, 'bac-2', true, 'bac-3', true
    ),
    'stages', public.get_default_stages_config()
  )
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 7: Sherif English
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-english',
  'الأستاذ شريف - لغة إنجليزية',
  jsonb_build_object(
    'subject', 'english',
    'features', jsonb_build_object(
      'homework', true, 'exams', true, 'videos', true, 'payments', true, 'chat', true,
      'attendance', true, 'qr_attendance', true, 'parent_portal', true, 'notifications', true,
      'student_notes', true, 'branches', true, 'groups', true, 'reports', true, 'assistant_accounts', true
    ),
    'grades', jsonb_build_object(
      'primary-1', true, 'primary-2', true, 'primary-3', true, 'primary-4', true, 'primary-5', true, 'primary-6', true,
      'first-prep', true, 'second-prep', true, 'third-prep', true,
      'first-sec', true, 'second-sec', true, 'third-sec', true,
      'bac-1', true, 'bac-2', true, 'bac-3', true
    ),
    'stages', public.get_default_stages_config()
  )
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 8: Sherif Humanities
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-humanities',
  'الأستاذ شريف - تاريخ وجغرافيا',
  jsonb_build_object(
    'subject', 'humanities',
    'features', jsonb_build_object(
      'homework', true, 'exams', true, 'videos', true, 'payments', true, 'chat', true,
      'attendance', true, 'qr_attendance', true, 'parent_portal', true, 'notifications', true,
      'student_notes', true, 'branches', true, 'groups', true, 'reports', true, 'assistant_accounts', true
    ),
    'grades', jsonb_build_object(
      'primary-1', true, 'primary-2', true, 'primary-3', true, 'primary-4', true, 'primary-5', true, 'primary-6', true,
      'first-prep', true, 'second-prep', true, 'third-prep', true,
      'first-sec', true, 'second-sec', true, 'third-sec', true,
      'bac-1', true, 'bac-2', true, 'bac-3', true
    ),
    'stages', public.get_default_stages_config()
  )
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 9: Sherif Programming
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-programming',
  'الأستاذ شريف - حاسب آلي وبرمجة',
  jsonb_build_object(
    'subject', 'cyber',
    'features', jsonb_build_object(
      'homework', true, 'exams', true, 'videos', true, 'payments', true, 'chat', true,
      'attendance', true, 'qr_attendance', true, 'parent_portal', true, 'notifications', true,
      'student_notes', true, 'branches', true, 'groups', true, 'reports', true, 'assistant_accounts', true
    ),
    'grades', jsonb_build_object(
      'primary-1', true, 'primary-2', true, 'primary-3', true, 'primary-4', true, 'primary-5', true, 'primary-6', true,
      'first-prep', true, 'second-prep', true, 'third-prep', true,
      'first-sec', true, 'second-sec', true, 'third-sec', true,
      'bac-1', true, 'bac-2', true, 'bac-3', true
    ),
    'stages', public.get_default_stages_config()
  )
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Tenant 10: Sherif Math
INSERT INTO public.tenants (slug, name, config)
VALUES (
  'sherif-math',
  'الأستاذ شريف - رياضيات',
  jsonb_build_object(
    'subject', 'math',
    'features', jsonb_build_object(
      'homework', true, 'exams', true, 'videos', true, 'payments', true, 'chat', true,
      'attendance', true, 'qr_attendance', true, 'parent_portal', true, 'notifications', true,
      'student_notes', true, 'branches', true, 'groups', true, 'reports', true, 'assistant_accounts', true
    ),
    'grades', jsonb_build_object(
      'primary-1', true, 'primary-2', true, 'primary-3', true, 'primary-4', true, 'primary-5', true, 'primary-6', true,
      'first-prep', true, 'second-prep', true, 'third-prep', true,
      'first-sec', true, 'second-sec', true, 'third-sec', true,
      'bac-1', true, 'bac-2', true, 'bac-3', true
    ),
    'stages', public.get_default_stages_config()
  )
)
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Clean up helper function
DROP FUNCTION IF EXISTS public.get_default_stages_config();
