-- ============================================================================
-- 2026_09_17_list_chat_threads.sql
--
-- The admin chat list (listChatsOverview) downloaded EVERY chat message of the
-- tenant, newest first, only to keep the latest message per student and count
-- unread ones. That transfer grows with every message ever sent, and past 1000
-- messages PostgREST cut it off — conversations whose last message was older
-- than the newest 1000 messages dropped out of the list.
--
-- This returns ONE row per conversation: the latest message, the student's
-- name/avatar/phone, and the unread count (messages sent by the student and
-- not yet read), computed in the database.
--
-- SECURITY INVOKER: row-level security on chat_messages and profiles applies
-- exactly as it did for the direct query, so staff only see their own tenant.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_chat_threads()
RETURNS TABLE (
  id                  uuid,
  student_id          uuid,
  sender_id           uuid,
  content             text,
  file_url            text,
  file_type           text,
  is_read             boolean,
  created_at          timestamptz,
  student_name        text,
  student_avatar_url  text,
  student_phone       text,
  unread_count        bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (m.student_id)
           m.id, m.student_id, m.sender_id, m.content, m.file_url, m.file_type, m.is_read, m.created_at
    FROM public.chat_messages m
    ORDER BY m.student_id, m.created_at DESC, m.id
  ),
  unread AS (
    SELECT m.student_id, count(*) AS n
    FROM public.chat_messages m
    WHERE m.is_read = false
      AND m.sender_id = m.student_id
    GROUP BY m.student_id
  )
  SELECT l.id, l.student_id, l.sender_id, l.content, l.file_url, l.file_type, l.is_read, l.created_at,
         p.name, p.avatar_url, p.phone,
         coalesce(u.n, 0)
  FROM latest l
  LEFT JOIN public.profiles p ON p.id = l.student_id
  LEFT JOIN unread u ON u.student_id = l.student_id
  ORDER BY l.created_at DESC, l.id;
$$;

REVOKE EXECUTE ON FUNCTION public.list_chat_threads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_chat_threads() TO authenticated, service_role;
-- Supabase grants EXECUTE on new public functions to anon directly, so
-- REVOKE ... FROM PUBLIC alone does not remove it. Staff-only: block anon.
REVOKE EXECUTE ON FUNCTION public.list_chat_threads() FROM anon;

SELECT 'list_chat_threads ready' AS result;
