ALTER TABLE public.messages ADD COLUMN deleted_at timestamptz;

CREATE POLICY "messages_update_own_delete" ON public.messages FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "attachment_delete_own_message" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND public.is_conversation_member((storage.foldername(name))[1]::uuid, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.attachment_path = name
        AND m.sender_id = auth.uid()
        AND m.deleted_at IS NULL
    )
  );