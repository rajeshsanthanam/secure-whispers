CREATE OR REPLACE FUNCTION public.get_my_chat_stats(_conversation_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH m AS (
    SELECT id, sender_id, kind, created_at, edited_at, deleted_at
    FROM public.messages
    WHERE (_conversation_id IS NULL OR conversation_id = _conversation_id)
      AND public.is_conversation_member(conversation_id, auth.uid())
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM m),
    'photos', (SELECT count(*) FROM m WHERE kind = 'image' AND deleted_at IS NULL),
    'texts', (SELECT count(*) FROM m WHERE kind = 'text' AND deleted_at IS NULL),
    'edited', (SELECT count(*) FROM m WHERE edited_at IS NOT NULL AND deleted_at IS NULL),
    'deleted', (SELECT count(*) FROM m WHERE deleted_at IS NOT NULL),
    'reactions', (SELECT count(*) FROM public.message_reactions r WHERE r.message_id IN (SELECT id FROM m)),
    'first_at', (SELECT min(created_at) FROM m),
    'last_at', (SELECT max(created_at) FROM m),
    'per_day', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', d, 'count', c) ORDER BY d)
      FROM (SELECT date_trunc('day', created_at)::date AS d, count(*) AS c FROM m
            WHERE created_at >= now() - interval '30 days' GROUP BY 1) x), '[]'::jsonb),
    'per_sender', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', COALESCE(NULLIF(p.display_name, ''), p.username::text, 'Unknown'), 'count', c) ORDER BY c DESC)
      FROM (SELECT sender_id, count(*) AS c FROM m GROUP BY 1) s
      LEFT JOIN public.profiles p ON p.id = s.sender_id), '[]'::jsonb)
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_my_chat_stats(uuid) TO authenticated;