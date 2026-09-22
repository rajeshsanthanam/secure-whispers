-- 1. conversations: remove permissive INSERT policy; creation goes through create_conversation() RPC
DROP POLICY IF EXISTS "conversations_insert_authenticated" ON public.conversations;

-- 2. profiles: replace blanket read with owner + shared-conversation scope
CREATE OR REPLACE FUNCTION public.shares_conversation(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members ma
    JOIN public.conversation_members mb
      ON mb.conversation_id = ma.conversation_id
    WHERE ma.user_id = _a AND mb.user_id = _b
  )
$$;

REVOKE ALL ON FUNCTION public.shares_conversation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_conversation(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_self_or_shared_conversation"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.shares_conversation(id, auth.uid()));

-- exact-username lookup so people can start a chat with someone they are not yet in a chat with
CREATE OR REPLACE FUNCTION public.find_profile_by_username(_username text)
RETURNS TABLE(id uuid, username text, display_name text, public_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username::text, p.display_name, p.public_key
  FROM public.profiles p
  WHERE p.username = _username::citext
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.find_profile_by_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_profile_by_username(text) TO authenticated;