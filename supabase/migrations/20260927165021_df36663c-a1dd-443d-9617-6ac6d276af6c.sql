CREATE TABLE public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions_select_member" ON public.message_reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_reactions.message_id AND public.is_conversation_member(m.conversation_id, auth.uid())));
CREATE POLICY "reactions_upsert_own" ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_reactions.message_id AND public.is_conversation_member(m.conversation_id, auth.uid())));
CREATE POLICY "reactions_update_own" ON public.message_reactions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reactions_delete_own" ON public.message_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;