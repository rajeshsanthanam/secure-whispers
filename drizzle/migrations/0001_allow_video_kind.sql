ALTER TABLE public.messages DROP CONSTRAINT messages_kind_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_kind_check CHECK (kind = ANY (ARRAY['text'::text, 'image'::text, 'video'::text]));