-- ============================================================================
-- SQL Update: Move Baccalaureate 2 Students to `bac-2` Grade
-- Tenant: مستر محمد ياسر (mohamed-yasser)
--
-- Purpose:
--   Update all students enrolled in the 3 Baccalaureate groups:
--     1) الأحد والأربعاء 2
--     2) الأحد والاربعاء 8
--     3) السبت والثلاثاء 10
--   to have their `grade` set to 'bac-2' (البكالوريا المستوى الثاني)
--   so they appear properly under the Baccalaureate stage in Accounts, Attendance, etc.
-- ============================================================================

-- 1. Ensure the 3 groups in public.groups table are set to grade = 'bac-2'
UPDATE public.groups
SET grade = 'bac-2'
WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mohamed-yasser')
  AND (
    name ILIKE '%الأحد والأربعاء 2%'
    OR name ILIKE '%الأحد والاربعاء 2%'
    OR name ILIKE '%الأحد والأربعاء 8%'
    OR name ILIKE '%الأحد والاربعاء 8%'
    OR name ILIKE '%السبت والثلاثاء 10%'
  );

-- 2. Update students' profiles whose group name matches the 3 Baccalaureate 2 groups
UPDATE public.profiles
SET grade = 'bac-2'
WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mohamed-yasser')
  AND role = 'student'
  AND (
    "group" ILIKE '%الأحد والأربعاء 2%'
    OR "group" ILIKE '%الأحد والاربعاء 2%'
    OR "group" ILIKE '%الأحد والأربعاء 8%'
    OR "group" ILIKE '%الأحد والاربعاء 8%'
    OR "group" ILIKE '%السبت والثلاثاء 10%'
  );

-- 3. Update students linked via student_groups to any group with grade = 'bac-2'
UPDATE public.profiles p
SET grade = 'bac-2'
FROM public.student_groups sg
JOIN public.groups g ON g.id = sg.group_id
WHERE sg.student_id = p.id
  AND p.tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mohamed-yasser')
  AND p.role = 'student'
  AND (
    g.grade = 'bac-2'
    OR g.name ILIKE '%الأحد والأربعاء 2%'
    OR g.name ILIKE '%الأحد والاربعاء 2%'
    OR g.name ILIKE '%الأحد والأربعاء 8%'
    OR g.name ILIKE '%الأحد والاربعاء 8%'
    OR g.name ILIKE '%السبت والثلاثاء 10%'
  );

-- 4. Check results
SELECT 
  p.id, 
  p.name, 
  p.phone, 
  p.grade, 
  p."group", 
  p.is_approved, 
  p.status 
FROM public.profiles p
WHERE p.tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mohamed-yasser')
  AND p.role = 'student'
  AND p.grade = 'bac-2'
ORDER BY p.name ASC;
