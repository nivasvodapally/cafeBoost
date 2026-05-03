CREATE OR REPLACE FUNCTION public.kds_pair_device_v2(
  _code text DEFAULT NULL,
  _pin text DEFAULT NULL,
  _slug text DEFAULT NULL,
  _label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _cafe record;
  _token text;
  _device_id uuid;
  _expected_hash text;
BEGIN
  IF _code IS NOT NULL AND length(trim(_code)) > 0 THEN
    SELECT id, kds_pairing_code, kds_pin_hash
      INTO _cafe
      FROM public.cafes
     WHERE kds_pairing_code IS NOT NULL
       AND upper(kds_pairing_code) = upper(trim(_code))
     LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid pairing code'; END IF;
  ELSIF _pin IS NOT NULL AND length(trim(_pin)) > 0 THEN
    IF _slug IS NULL OR length(trim(_slug)) = 0 THEN
      RAISE EXCEPTION 'Cafe shortcode required when pairing with PIN';
    END IF;
    SELECT id, kds_pairing_code, kds_pin_hash
      INTO _cafe
      FROM public.cafes
     WHERE slug = lower(trim(_slug))
     LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cafe not found'; END IF;
    IF _cafe.kds_pin_hash IS NULL THEN RAISE EXCEPTION 'KDS PIN not configured for this cafe'; END IF;
    _expected_hash := encode(extensions.digest(_cafe.id::text || ':' || trim(_pin), 'sha256'), 'hex');
    IF _expected_hash <> _cafe.kds_pin_hash THEN
      RAISE EXCEPTION 'Invalid PIN';
    END IF;
  ELSE
    RAISE EXCEPTION 'Provide a pairing code or PIN';
  END IF;

  _token := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.kds_devices (cafe_id, device_token, label, last_seen_at)
  VALUES (_cafe.id, _token, NULLIF(trim(_label),''), now())
  RETURNING id INTO _device_id;

  IF _code IS NOT NULL AND length(trim(_code)) > 0 THEN
    UPDATE public.cafes
       SET kds_pairing_code = NULL, kds_pairing_code_set_at = NULL
     WHERE id = _cafe.id;
  END IF;

  RETURN jsonb_build_object('device_id', _device_id, 'token', _token);
END $$;

GRANT EXECUTE ON FUNCTION public.kds_pair_device_v2(text, text, text, text) TO anon, authenticated;

-- Same fix for kds_set_credentials (used when owner sets PIN via RPC fallback)
CREATE OR REPLACE FUNCTION public.kds_set_credentials(_cafe_id uuid, _new_code text, _new_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NOT public.is_cafe_owner(auth.uid(), _cafe_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  UPDATE public.cafes
     SET kds_pairing_code = NULLIF(trim(_new_code),''),
         kds_pin_hash = CASE WHEN _new_pin IS NULL OR length(trim(_new_pin)) = 0
                             THEN kds_pin_hash
                             ELSE encode(extensions.digest(_cafe_id::text || ':' || trim(_new_pin), 'sha256'), 'hex') END,
         kds_pairing_code_set_at = CASE WHEN NULLIF(trim(_new_code),'') IS NULL THEN kds_pairing_code_set_at ELSE now() END
   WHERE id = _cafe_id;
  RETURN jsonb_build_object('ok', true);
END $$;