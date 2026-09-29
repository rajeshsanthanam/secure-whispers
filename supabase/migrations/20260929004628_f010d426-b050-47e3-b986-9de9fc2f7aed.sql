ALTER TABLE public.messages
  ADD COLUMN reply_to_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.check_reply_same_conversation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.reply_to_message_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.messages target
      WHERE target.id = NEW.reply_to_message_id
        AND target.conversation_id = NEW.conversation_id
    ) THEN
      RAISE EXCEPTION 'reply_to_message_id must reference a message in the same conversation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_reply_same_conversation
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.check_reply_same_conversation();