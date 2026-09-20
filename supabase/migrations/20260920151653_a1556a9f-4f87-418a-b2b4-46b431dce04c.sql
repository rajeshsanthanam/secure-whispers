REVOKE ALL ON FUNCTION public.get_my_key_material() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_key_material_for_username(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_conversation_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_key_material() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_key_material_for_username(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO authenticated;