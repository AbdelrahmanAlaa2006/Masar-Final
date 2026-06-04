-- ============================================================
-- 2026_06_04_add_delete_policy_to_chat_messages.sql
-- Run once in the Supabase SQL editor.
--
-- Enables row deletion policy on public.chat_messages
-- so that admins and students can delete messages in their thread.
-- ============================================================

-- Drop existing delete policy if it exists
drop policy if exists "Tenant delete isolation ON chat_messages" on public.chat_messages;

-- Create the new delete policy
create policy "Tenant delete isolation ON chat_messages" on public.chat_messages
  for delete using (
    tenant_id = public.current_tenant_id()
    and (
      student_id = auth.uid()
      or public.is_current_user_admin()
    )
  );
