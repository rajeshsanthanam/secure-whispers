CREATE TABLE public.read_markers (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE public.read_markers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.read_markers TO authenticated;
GRANT ALL ON public.read_markers TO service_role;

CREATE POLICY "read_markers_select_member" ON public.read_markers FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "read_markers_upsert_own" ON public.read_markers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "read_markers_update_own" ON public.read_markers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.read_markers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.read_markers;