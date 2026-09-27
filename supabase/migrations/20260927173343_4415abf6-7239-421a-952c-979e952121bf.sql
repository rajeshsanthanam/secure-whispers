CREATE POLICY "attachment_insert_member" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.enc$'
    AND public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "attachment_select_member" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

ALTER TABLE public.messages ADD COLUMN kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'image'));
ALTER TABLE public.messages ADD COLUMN attachment_path text;
ALTER TABLE public.messages ADD COLUMN attachment_iv text;