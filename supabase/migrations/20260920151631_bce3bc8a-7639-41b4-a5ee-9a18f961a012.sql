CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username citext NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  public_key text NOT NULL,
  encrypted_private_key_blob text NOT NULL,
  salt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT (id, username, display_name, public_key, created_at) ON public.profiles TO authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.get_my_key_material()
RETURNS TABLE (public_key text, encrypted_private_key_blob text, salt text, username text, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.public_key, p.encrypted_private_key_blob, p.salt, p.username::text, p.display_name
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.get_my_key_material() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_key_material_for_username(_username text)
RETURNS TABLE (encrypted_private_key_blob text, salt text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.encrypted_private_key_blob, p.salt
  FROM public.profiles p
  WHERE p.username = _username::citext AND p.id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.get_key_material_for_username(text) TO authenticated;

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  is_group boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wrapped_conversation_key text NOT NULL DEFAULT '{}',
  joined_at timestamptz NOT NULL DEFAULT now(),
  key_version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_created_idx ON public.messages (conversation_id, created_at);
CREATE INDEX conversation_members_user_idx ON public.conversation_members (user_id);

CREATE OR REPLACE FUNCTION public.is_conversation_member(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = _conversation_id AND m.user_id = _user_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select_member" ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_member(id, auth.uid()));
CREATE POLICY "conversations_insert_authenticated" ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "conversations_update_member" ON public.conversations FOR UPDATE TO authenticated
  USING (public.is_conversation_member(id, auth.uid()))
  WITH CHECK (public.is_conversation_member(id, auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_members TO authenticated;
GRANT ALL ON public.conversation_members TO service_role;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_member" ON public.conversation_members FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "members_insert" ON public.conversation_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "members_update_member" ON public.conversation_members FOR UPDATE TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()))
  WITH CHECK (public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "members_delete_member" ON public.conversation_members FOR DELETE TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_member" ON public.messages FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "messages_insert_member" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_conversation_member(conversation_id, auth.uid()));

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;