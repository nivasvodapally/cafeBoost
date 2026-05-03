ALTER TABLE public.cafe_staff_codes
  ADD COLUMN IF NOT EXISTS token TEXT,
  ADD COLUMN IF NOT EXISTS invited_email TEXT;

UPDATE public.cafe_staff_codes
   SET token = code
 WHERE token IS NULL;

ALTER TABLE public.cafe_staff_codes
  ALTER COLUMN token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cafe_staff_codes_token_key
  ON public.cafe_staff_codes (token);

CREATE OR REPLACE FUNCTION public.join_staff_with_code(_code TEXT, _full_name TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user UUID := auth.uid();
  _invite RECORD;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  SELECT * INTO _invite
  FROM public.cafe_staff_codes
  WHERE (upper(code) = upper(trim(_code)) OR token = trim(_code))
    AND active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR used_count < max_uses)
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'This staff invite is invalid, expired, or already used'; END IF;
  IF _invite.role NOT IN ('manager','cashier','chef','waiter') THEN RAISE EXCEPTION 'Invalid staff role'; END IF;

  INSERT INTO public.cafe_staff (cafe_id, user_id, role, status)
  VALUES (_invite.cafe_id, _user, _invite.role, 'active')
  ON CONFLICT (cafe_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = 'active',
        updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user, _invite.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.profiles (user_id, role, full_name, cafe_id, is_guest)
  VALUES (_user, _invite.role, NULLIF(trim(COALESCE(_full_name, '')), ''), _invite.cafe_id, false)
  ON CONFLICT (user_id) DO UPDATE
    SET cafe_id = EXCLUDED.cafe_id,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        is_guest = false;

  UPDATE public.cafe_staff_codes
     SET used_count = used_count + 1,
         active = CASE WHEN max_uses IS NOT NULL AND used_count + 1 >= max_uses THEN false ELSE active END,
         updated_at = now()
   WHERE id = _invite.id;

  RETURN jsonb_build_object('cafe_id', _invite.cafe_id, 'role', _invite.role);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_staff_with_code(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_staff_with_code(TEXT, TEXT) TO authenticated;