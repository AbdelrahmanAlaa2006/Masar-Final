-- =====================================================================
-- Parent Student Lookup RPC Function (RLS Bypass)
-- Run in Supabase SQL Editor to allow looking up students by parent phone number.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_student_by_parent_phone(p_phone TEXT)
RETURNS TABLE (
  student_id UUID,
  student_name TEXT,
  qr_token TEXT,
  grade TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT id, name, profiles.qr_token, profiles.grade
  FROM public.profiles
  WHERE role = 'student' AND replace(parent_phone, ' ', '') = replace(p_phone, ' ', '');
END;
$$;
