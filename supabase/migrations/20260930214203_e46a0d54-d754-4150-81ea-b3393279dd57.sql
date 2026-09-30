DROP POLICY "messages_update_own_delete" ON public.messages;

CREATE POLICY "messages_update_own_delete" ON public.messages FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = sender_id);