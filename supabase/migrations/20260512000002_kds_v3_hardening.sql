-- RE-03: Harden KDS Pairing Security
-- 1. Create a table to track pairing attempts
CREATE TABLE IF NOT EXISTS public.kds_pairing_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL, -- session_id or IP hash
    cafe_id UUID REFERENCES public.cafes(id) ON DELETE CASCADE,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    success BOOLEAN NOT NULL DEFAULT false
);

-- Index for cleanup and lookup
CREATE INDEX IF NOT EXISTS idx_kds_pairing_attempts_id_time ON public.kds_pairing_attempts(identifier, attempted_at DESC);

-- 2. Add rate limiting logic to kds_pair_device_v2 (v3)
CREATE OR REPLACE FUNCTION public.kds_pair_device_v3(
  _code text DEFAULT NULL,
  _pin text DEFAULT NULL,
  _slug text DEFAULT NULL,
  _label text DEFAULT NULL,
  _identifier text DEFAULT 'unknown'
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
  _recent_attempts integer;
BEGIN
  -- Rate limiting: Max 5 attempts per 15 minutes per identifier
  SELECT COUNT(*) INTO _recent_attempts
  FROM public.kds_pairing_attempts
  WHERE identifier = _identifier
    AND attempted_at > (now() - interval '15 minutes')
    AND success = false;

  IF _recent_attempts >= 5 THEN
    RAISE EXCEPTION 'Too many pairing attempts. Please wait 15 minutes.';
  END IF;

  -- Verify Code or PIN
  IF _code IS NOT NULL AND length(trim(_code)) > 0 THEN
    SELECT id, kds_pairing_code, kds_pin_hash
      INTO _cafe
      FROM public.cafes
     WHERE kds_pairing_code IS NOT NULL
       AND upper(kds_pairing_code) = upper(trim(_code))
     LIMIT 1;
    
    IF NOT FOUND THEN 
      INSERT INTO public.kds_pairing_attempts (identifier, success) VALUES (_identifier, false);
      RAISE EXCEPTION 'Invalid pairing code'; 
    END IF;
  ELSIF _pin IS NOT NULL AND length(trim(_pin)) > 0 THEN
    IF _slug IS NULL OR length(trim(_slug)) = 0 THEN
      RAISE EXCEPTION 'Cafe shortcode required when pairing with PIN';
    END IF;
    
    SELECT id, kds_pairing_code, kds_pin_hash
      INTO _cafe
      FROM public.cafes
     WHERE slug = lower(trim(_slug))
     LIMIT 1;
     
    IF NOT FOUND THEN 
      INSERT INTO public.kds_pairing_attempts (identifier, success) VALUES (_identifier, false);
      RAISE EXCEPTION 'Cafe not found'; 
    END IF;
    
    IF _cafe.kds_pin_hash IS NULL THEN RAISE EXCEPTION 'KDS PIN not configured for this cafe'; END IF;
    
    _expected_hash := encode(extensions.digest(_cafe.id::text || ':' || trim(_pin), 'sha256'), 'hex');
    IF _expected_hash <> _cafe.kds_pin_hash THEN
      INSERT INTO public.kds_pairing_attempts (identifier, cafe_id, success) VALUES (_identifier, _cafe.id, false);
      RAISE EXCEPTION 'Invalid PIN';
    END IF;
  ELSE
    RAISE EXCEPTION 'Provide a pairing code or PIN';
  END IF;

  -- Success: Create device token
  _token := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.kds_devices (cafe_id, device_token, label, last_seen_at)
  VALUES (_cafe.id, _token, NULLIF(trim(_label),''), now())
  RETURNING id INTO _device_id;

  -- Record success
  INSERT INTO public.kds_pairing_attempts (identifier, cafe_id, success) VALUES (_identifier, _cafe.id, true);

  -- Consume one-time code
  IF _code IS NOT NULL AND length(trim(_code)) > 0 THEN
    UPDATE public.cafes
       SET kds_pairing_code = NULL, kds_pairing_code_set_at = NULL
     WHERE id = _cafe.id;
  END IF;

  RETURN jsonb_build_object('device_id', _device_id, 'token', _token);
END $$;

GRANT EXECUTE ON FUNCTION public.kds_pair_device_v3(text, text, text, text, text) TO anon, authenticated;
