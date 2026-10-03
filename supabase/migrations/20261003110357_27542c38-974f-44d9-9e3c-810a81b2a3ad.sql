REVOKE EXECUTE ON FUNCTION public.is_academic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_academic(uuid) TO authenticated;