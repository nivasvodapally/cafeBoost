-- New pairing RPC: code is globally unique-enough to identify the cafe on its own.
-- PIN fallback still requires the slug (since PINs may collide across cafes).
CREATE OR REPLACE FUNCTION public.kds_pair_device_v2(
  _code text DEFAULT NULL,
  _pin text DEFAULT NULL,
  _slug text DEFAULT NULL,
  _label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cafe record;
  _token text;
  _device_id uuid;
  _expected_hash text;
BEGIN
  IF _code IS NOT NULL AND length(trim(_code)) > 0 THEN
    -- Lookup cafe purely by pairing code
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
    -- Settings UI hashes as sha256("<cafe_id>:<pin>"). Match that.
    _expected_hash := encode(digest(_cafe.id::text || ':' || trim(_pin), 'sha256'), 'hex');
    IF _expected_hash <> _cafe.kds_pin_hash THEN
      RAISE EXCEPTION 'Invalid PIN';
    END IF;
  ELSE
    RAISE EXCEPTION 'Provide a pairing code or PIN';
  END IF;

  _token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.kds_devices (cafe_id, device_token, label, last_seen_at)
  VALUES (_cafe.id, _token, NULLIF(trim(_label),''), now())
  RETURNING id INTO _device_id;

  -- One-time pairing code is consumed after first successful code-based pairing
  IF _code IS NOT NULL AND length(trim(_code)) > 0 THEN
    UPDATE public.cafes
       SET kds_pairing_code = NULL, kds_pairing_code_set_at = NULL
     WHERE id = _cafe.id;
  END IF;

  RETURN jsonb_build_object('device_id', _device_id, 'token', _token);
END $$;

GRANT EXECUTE ON FUNCTION public.kds_pair_device_v2(text, text, text, text) TO anon, authenticated;