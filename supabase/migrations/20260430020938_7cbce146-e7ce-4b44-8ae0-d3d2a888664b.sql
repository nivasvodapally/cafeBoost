-- 1. New columns on cafes
ALTER TABLE public.cafes
  ADD COLUMN IF NOT EXISTS razorpay_mode text NOT NULL DEFAULT 'test',
  ADD COLUMN IF NOT EXISTS allow_payment_simulation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kds_pairing_code text,
  ADD COLUMN IF NOT EXISTS kds_pin_hash text,
  ADD COLUMN IF NOT EXISTS kds_pairing_code_set_at timestamptz;

-- 2. KDS devices
CREATE TABLE IF NOT EXISTS public.kds_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  device_token text NOT NULL UNIQUE,
  label text,
  paired_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kds_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kds_devices_owner_all ON public.kds_devices;
CREATE POLICY kds_devices_owner_all ON public.kds_devices
  FOR ALL TO public
  USING (public.is_cafe_owner(auth.uid(), cafe_id))
  WITH CHECK (public.is_cafe_owner(auth.uid(), cafe_id));

CREATE INDEX IF NOT EXISTS kds_devices_cafe_idx ON public.kds_devices(cafe_id);
CREATE INDEX IF NOT EXISTS kds_devices_token_idx ON public.kds_devices(device_token);

-- 3. Restrict staff invites to runner-only and deactivate chef invites
UPDATE public.cafe_staff_codes SET active = false WHERE role = 'chef';
UPDATE public.cafe_staff SET status = 'inactive' WHERE role = 'chef' AND status = 'active';

DROP POLICY IF EXISTS cafe_staff_owner_insert ON public.cafe_staff;
CREATE POLICY cafe_staff_owner_insert ON public.cafe_staff
  FOR INSERT TO public
  WITH CHECK (public.is_cafe_owner(auth.uid(), cafe_id) AND role = 'runner');

DROP POLICY IF EXISTS staff_codes_owner_insert ON public.cafe_staff_codes;
CREATE POLICY staff_codes_owner_insert ON public.cafe_staff_codes
  FOR INSERT TO public
  WITH CHECK (public.is_cafe_owner(auth.uid(), cafe_id) AND created_by = auth.uid() AND role = 'runner');

-- 4. Permission RPCs
CREATE OR REPLACE FUNCTION public.can_user_act_on(_user_id uuid, _cafe_id uuid, _action text)
 RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _role app_role;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.is_cafe_owner(_user_id, _cafe_id) THEN RETURN true; END IF;
  SELECT cs.role INTO _role FROM public.cafe_staff cs
   WHERE cs.user_id = _user_id AND cs.cafe_id = _cafe_id AND cs.status = 'active' LIMIT 1;
  IF _role IS NULL THEN RETURN false; END IF;
  IF _role = 'runner' THEN
    RETURN _action IN ('accept','prepare','ready','set_eta','serve','complete','payment','cancel');
  END IF;
  RETURN false;
END $function$;

CREATE OR REPLACE FUNCTION public.mark_order_paid(_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _o record;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT (
    public.is_cafe_owner(auth.uid(), _o.cafe_id)
    OR public.has_cafe_staff_role(auth.uid(), _o.cafe_id, 'runner')
  ) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF _o.payment_status = 'paid' THEN RETURN jsonb_build_object('id', _o.id, 'already_paid', true); END IF;

  UPDATE public.orders SET payment_status = 'paid', paid_at = now(),
    payment_method = COALESCE(payment_method, 'cash'),
    status = CASE WHEN status = 'placed' THEN 'accepted'::public.order_status ELSE status END,
    accepted_at = CASE WHEN status = 'placed' THEN COALESCE(accepted_at, now()) ELSE accepted_at END,
    accepted_by = CASE WHEN status = 'placed' THEN COALESCE(accepted_by, auth.uid()) ELSE accepted_by END
   WHERE id = _order_id;

  IF _o.customer_user_id IS NOT NULL AND _o.earned_points > 0 THEN
    INSERT INTO public.loyalty_memberships (cafe_id, customer_user_id, loyalty_points, total_visits, last_visit_at)
    VALUES (_o.cafe_id, _o.customer_user_id, _o.earned_points, 1, now())
    ON CONFLICT (cafe_id, customer_user_id) DO UPDATE
      SET loyalty_points = public.loyalty_memberships.loyalty_points + EXCLUDED.loyalty_points,
          total_visits   = public.loyalty_memberships.total_visits + 1,
          last_visit_at  = now();
    INSERT INTO public.loyalty_transactions (cafe_id, customer_user_id, points, type, note, related_order_id)
    VALUES (_o.cafe_id, _o.customer_user_id, _o.earned_points, 'earned', 'Order #' || substr(_o.id::text, 1, 8), _o.id);
  END IF;

  RETURN jsonb_build_object('id', _o.id, 'paid', true, 'awarded_points', _o.earned_points);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_order_by_staff(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _user UUID := auth.uid(); _o RECORD;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT (
    public.is_cafe_owner(_user, _o.cafe_id)
    OR public.has_cafe_staff_role(_user, _o.cafe_id, 'runner')
  ) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  UPDATE public.orders SET status = 'cancelled' WHERE id = _order_id;
END;
$function$;

-- 5. Test-mode payment simulation
CREATE OR REPLACE FUNCTION public.simulate_payment(_order_id uuid, _outcome text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _o record; _cafe record; _u uuid := auth.uid();
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _outcome NOT IN ('success','failure') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;

  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  SELECT razorpay_mode, allow_payment_simulation INTO _cafe FROM public.cafes WHERE id = _o.cafe_id;
  IF _cafe.razorpay_mode <> 'test' OR _cafe.allow_payment_simulation = false THEN
    RAISE EXCEPTION 'Simulation only allowed in test mode';
  END IF;
  -- Caller must be owner, runner, or the customer who placed the order
  IF NOT (
    public.is_cafe_owner(_u, _o.cafe_id)
    OR public.has_cafe_staff_role(_u, _o.cafe_id, 'runner')
    OR _o.customer_user_id = _u
  ) THEN RAISE EXCEPTION 'Not authorised'; END IF;

  IF _outcome = 'failure' THEN
    INSERT INTO public.payment_attempts (order_id, cafe_id, event, status, method, amount, raw)
    VALUES (_o.id, _o.cafe_id, 'simulation.failed', 'failed', 'upi', _o.total_amount, jsonb_build_object('simulated', true));
    RETURN jsonb_build_object('id', _o.id, 'status', 'failed');
  END IF;

  IF _o.payment_status = 'paid' THEN RETURN jsonb_build_object('id', _o.id, 'already_paid', true); END IF;

  UPDATE public.orders SET
    payment_status = 'paid', paid_at = now(),
    payment_method = COALESCE(payment_method, 'upi'),
    razorpay_payment_id = COALESCE(razorpay_payment_id, 'sim_' || substr(_o.id::text, 1, 12)),
    status = CASE WHEN status = 'placed' THEN 'accepted'::order_status ELSE status END,
    accepted_at = CASE WHEN status = 'placed' THEN COALESCE(accepted_at, now()) ELSE accepted_at END
  WHERE id = _order_id;

  INSERT INTO public.payment_attempts (order_id, cafe_id, event, status, method, amount, raw)
  VALUES (_o.id, _o.cafe_id, 'simulation.captured', 'captured', 'upi', _o.total_amount, jsonb_build_object('simulated', true));

  IF _o.customer_user_id IS NOT NULL AND _o.earned_points > 0 THEN
    INSERT INTO public.loyalty_memberships (cafe_id, customer_user_id, loyalty_points, total_visits, last_visit_at)
    VALUES (_o.cafe_id, _o.customer_user_id, _o.earned_points, 1, now())
    ON CONFLICT (cafe_id, customer_user_id) DO UPDATE
      SET loyalty_points = public.loyalty_memberships.loyalty_points + EXCLUDED.loyalty_points,
          total_visits = public.loyalty_memberships.total_visits + 1,
          last_visit_at = now();
    INSERT INTO public.loyalty_transactions (cafe_id, customer_user_id, points, type, note, related_order_id)
    VALUES (_o.cafe_id, _o.customer_user_id, _o.earned_points, 'earned', 'Order #' || substr(_o.id::text, 1, 8), _o.id);
  END IF;

  RETURN jsonb_build_object('id', _o.id, 'paid', true);
END $function$;

-- 6. KDS pairing
CREATE OR REPLACE FUNCTION public.kds_pair_device(_cafe_id uuid, _code text, _pin text, _label text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _cafe record; _token text; _device_id uuid;
BEGIN
  SELECT id, kds_pairing_code, kds_pin_hash INTO _cafe FROM public.cafes WHERE id = _cafe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cafe not found'; END IF;
  IF _cafe.kds_pairing_code IS NULL AND _cafe.kds_pin_hash IS NULL THEN
    RAISE EXCEPTION 'KDS not configured for this cafe yet';
  END IF;

  IF _code IS NOT NULL AND length(trim(_code)) > 0 THEN
    IF upper(trim(_code)) <> upper(_cafe.kds_pairing_code) THEN
      RAISE EXCEPTION 'Invalid pairing code';
    END IF;
  ELSIF _pin IS NOT NULL AND length(trim(_pin)) > 0 THEN
    IF _cafe.kds_pin_hash IS NULL OR encode(digest(trim(_pin), 'sha256'), 'hex') <> _cafe.kds_pin_hash THEN
      RAISE EXCEPTION 'Invalid PIN';
    END IF;
  ELSE
    RAISE EXCEPTION 'Provide a pairing code or PIN';
  END IF;

  _token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.kds_devices (cafe_id, device_token, label, last_seen_at)
  VALUES (_cafe_id, _token, NULLIF(trim(_label),''), now())
  RETURNING id INTO _device_id;

  -- One-time pairing code is consumed after first successful use
  UPDATE public.cafes SET kds_pairing_code = NULL, kds_pairing_code_set_at = NULL WHERE id = _cafe_id;

  RETURN jsonb_build_object('device_id', _device_id, 'token', _token);
END $function$;

-- KDS device token check + last_seen update
CREATE OR REPLACE FUNCTION public.kds_get_orders(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _dev record; _orders jsonb; _cafe record;
BEGIN
  SELECT * INTO _dev FROM public.kds_devices WHERE device_token = _token AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid KDS device'; END IF;
  SELECT id, name, currency, eta_presets INTO _cafe FROM public.cafes WHERE id = _dev.cafe_id;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at), '[]'::jsonb) INTO _orders FROM (
    SELECT o.id, o.customer_name, o.table_no, o.source::text, o.status::text, o.payment_status::text,
      o.total_amount, o.notes, o.created_at, o.accepted_at, o.preparing_at, o.ready_at,
      o.wait_eta_minutes, o.eta_updated_at,
      (SELECT jsonb_agg(jsonb_build_object('name', oi.name, 'quantity', oi.quantity, 'price', oi.price))
         FROM public.order_items oi WHERE oi.order_id = o.id) AS items
    FROM public.orders o
    WHERE o.cafe_id = _dev.cafe_id
      AND o.status IN ('accepted','preparing','ready')
    ORDER BY o.created_at
  ) t;

  RETURN jsonb_build_object(
    'cafe', jsonb_build_object('id', _cafe.id, 'name', _cafe.name, 'currency', _cafe.currency, 'eta_presets', _cafe.eta_presets),
    'orders', _orders,
    'device', jsonb_build_object('id', _dev.id, 'label', _dev.label)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.kds_act_on_order(_token text, _order_id uuid, _action text, _eta_minutes integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _dev record; _o record; _next order_status;
BEGIN
  SELECT * INTO _dev FROM public.kds_devices WHERE device_token = _token AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid KDS device'; END IF;
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR _o.cafe_id <> _dev.cafe_id THEN RAISE EXCEPTION 'Order not found'; END IF;

  UPDATE public.kds_devices SET last_seen_at = now() WHERE id = _dev.id;

  IF _action = 'set_eta' THEN
    IF _eta_minutes IS NULL OR _eta_minutes < 0 OR _eta_minutes > 240 THEN RAISE EXCEPTION 'Invalid ETA'; END IF;
    UPDATE public.orders SET wait_eta_minutes = _eta_minutes, eta_updated_at = now() WHERE id = _order_id;
    RETURN jsonb_build_object('ok', true, 'eta', _eta_minutes);
  END IF;

  _next := CASE _action
    WHEN 'prepare' THEN 'preparing'::order_status
    WHEN 'ready'   THEN 'ready'::order_status
    ELSE NULL END;
  IF _next IS NULL THEN RAISE EXCEPTION 'Invalid action'; END IF;

  IF NOT (
    (_o.status = 'accepted'  AND _next = 'preparing') OR
    (_o.status = 'preparing' AND _next = 'ready')
  ) THEN RAISE EXCEPTION 'Invalid transition'; END IF;

  UPDATE public.orders SET
    status = _next,
    preparing_at = CASE WHEN _next = 'preparing' THEN now() ELSE preparing_at END,
    ready_at = CASE WHEN _next = 'ready' THEN now() ELSE ready_at END
  WHERE id = _order_id;
  RETURN jsonb_build_object('ok', true, 'status', _next);
END $function$;

-- 7. Owner generates / regenerates KDS pairing code & PIN
CREATE OR REPLACE FUNCTION public.kds_set_credentials(_cafe_id uuid, _new_code text, _new_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_cafe_owner(auth.uid(), _cafe_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  UPDATE public.cafes
     SET kds_pairing_code = NULLIF(trim(_new_code),''),
         kds_pin_hash = CASE WHEN _new_pin IS NULL OR length(trim(_new_pin)) = 0
                             THEN kds_pin_hash
                             ELSE encode(digest(trim(_new_pin), 'sha256'), 'hex') END,
         kds_pairing_code_set_at = CASE WHEN NULLIF(trim(_new_code),'') IS NULL THEN kds_pairing_code_set_at ELSE now() END
   WHERE id = _cafe_id;
  RETURN jsonb_build_object('ok', true);
END $function$;

-- pgcrypto needed for digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto;