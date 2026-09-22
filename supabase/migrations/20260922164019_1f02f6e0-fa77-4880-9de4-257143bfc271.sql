CREATE TABLE public.login_attempts (
  username citext PRIMARY KEY,
  fails integer NOT NULL DEFAULT 0,
  blocked_until timestamptz NOT NULL DEFAULT 'epoch',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.login_attempts FROM PUBLIC;
REVOKE ALL ON public.login_attempts FROM anon;
REVOKE ALL ON public.login_attempts FROM authenticated;
GRANT ALL ON public.login_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.check_and_record_login_attempt(
  _username text,
  _success boolean
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data public.login_attempts;
  free_attempts constant integer := 5;
  now_ts constant timestamptz := now();
  new_fails integer;
  new_blocked_until timestamptz;
BEGIN
  SELECT * INTO row_data FROM public.login_attempts
    WHERE username = _username::citext FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.login_attempts (username) VALUES (_username::citext)
      RETURNING * INTO row_data;
  END IF;

  IF row_data.blocked_until > now_ts THEN
    RETURN QUERY SELECT false, EXTRACT(EPOCH FROM (row_data.blocked_until - now_ts))::integer;
    RETURN;
  END IF;

  IF _success THEN
    UPDATE public.login_attempts
      SET fails = 0, blocked_until = 'epoch', updated_at = now_ts
      WHERE username = _username::citext;
    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  new_fails := row_data.fails + 1;
  new_blocked_until := 'epoch';
  IF new_fails > free_attempts THEN
    new_blocked_until := now_ts + (LEAST(900, 5 * POWER(2, new_fails - free_attempts - 1)) * interval '1 second');
  END IF;

  UPDATE public.login_attempts
    SET fails = new_fails, blocked_until = new_blocked_until, updated_at = now_ts
    WHERE username = _username::citext;

  RETURN QUERY SELECT true, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_record_login_attempt(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_and_record_login_attempt(text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.check_and_record_login_attempt(text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_record_login_attempt(text, boolean) TO service_role;

-- Read-only pre-check: reports remaining lockout seconds without recording an attempt.
CREATE OR REPLACE FUNCTION public.peek_login_block(_username text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT GREATEST(0, EXTRACT(EPOCH FROM (blocked_until - now()))::integer)
       FROM public.login_attempts WHERE username = _username::citext),
    0
  );
$$;

REVOKE ALL ON FUNCTION public.peek_login_block(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.peek_login_block(text) FROM anon;
REVOKE ALL ON FUNCTION public.peek_login_block(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.peek_login_block(text) TO service_role;