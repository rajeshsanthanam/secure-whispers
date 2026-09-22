CREATE OR REPLACE FUNCTION public.create_conversation(
  _id uuid,
  _name text,
  _is_group boolean,
  _wrapped_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.conversations (id, name, is_group)
  VALUES (_id, _name, _is_group);

  INSERT INTO public.conversation_members
    (conversation_id, user_id, wrapped_conversation_key, key_version)
  VALUES (_id, auth.uid(), _wrapped_key, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_conversation(uuid, text, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.create_conversation(uuid, text, boolean, text) FROM PUBLIC, anon;

DROP POLICY "members_insert" ON public.conversation_members;

CREATE POLICY "members_insert" ON public.conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_conversation_member(conversation_id, auth.uid()));