-- =====================================================================
-- Schema: Direct Student-Teacher Chat Support System
-- Adds a chat_messages table to store support queries and replies.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  file_url TEXT,
  file_type TEXT CHECK (file_type IN ('image', 'audio')),
  is_read BOOLEAN DEFAULT false NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexing for speed
CREATE INDEX IF NOT EXISTS idx_chat_messages_student_id ON public.chat_messages(student_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_id ON public.chat_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Automatic tenant_id trigger on insert
DROP TRIGGER IF EXISTS trig_set_tenant_id_chat_messages ON public.chat_messages;
CREATE TRIGGER trig_set_tenant_id_chat_messages
  BEFORE INSERT
  ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tenant_id_on_insert();

-- RLS Policies

-- Policy: Select messages (students see only their own chat; admins see all chats)
DROP POLICY IF EXISTS "Tenant select isolation ON chat_messages" ON public.chat_messages;
CREATE POLICY "Tenant select isolation ON chat_messages" ON public.chat_messages
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND (student_id = auth.uid() OR public.is_current_user_admin())
  );

-- Policy: Insert messages (students can insert under their own student_id/sender_id; admins can insert anything)
DROP POLICY IF EXISTS "Tenant insert isolation ON chat_messages" ON public.chat_messages;
CREATE POLICY "Tenant insert isolation ON chat_messages" ON public.chat_messages
  FOR INSERT WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (
      (student_id = auth.uid() AND sender_id = auth.uid() AND NOT public.is_current_user_admin())
      OR public.is_current_user_admin()
    )
  );

-- Policy: Update messages (needed to mark as read)
DROP POLICY IF EXISTS "Tenant update isolation ON chat_messages" ON public.chat_messages;
CREATE POLICY "Tenant update isolation ON chat_messages" ON public.chat_messages
  FOR UPDATE USING (
    tenant_id = public.current_tenant_id()
  );

-- Grant privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
