-- Migrate existing staff: manager/cashier/waiter -> runner
UPDATE public.cafe_staff SET role = 'runner' WHERE role IN ('manager','cashier','waiter');
UPDATE public.user_roles SET role = 'runner' WHERE role IN ('manager','cashier','waiter');
UPDATE public.cafe_staff_codes SET role = 'runner' WHERE role IN ('manager','cashier','waiter');
UPDATE public.profiles SET role = 'runner' WHERE role IN ('manager','cashier','waiter');

-- Update staff codes insert policy to only allow chef/runner
DROP POLICY IF EXISTS staff_codes_owner_insert ON public.cafe_staff_codes;
CREATE POLICY staff_codes_owner_insert ON public.cafe_staff_codes
  FOR INSERT WITH CHECK (
    is_cafe_owner(auth.uid(), cafe_id)
    AND created_by = auth.uid()
    AND role IN ('chef','runner')
  );

DROP POLICY IF EXISTS cafe_staff_owner_insert ON public.cafe_staff;
CREATE POLICY cafe_staff_owner_insert ON public.cafe_staff
  FOR INSERT WITH CHECK (
    is_cafe_owner(auth.uid(), cafe_id)
    AND role IN ('chef','runner')
  );

-- Simplify permission model
CREATE OR REPLACE FUNCTION public.can_user_act_on(_user_id uuid, _cafe_id uuid, _action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _role app_role;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.is_cafe_owner(_user_id, _cafe_id) THEN RETURN true; END IF;
  SELECT cs.role INTO _role FROM public.cafe_staff cs
   WHERE cs.user_id = _user_id AND cs.cafe_id = _cafe_id AND cs.status = 'active' LIMIT 1;
  IF _role IS NULL THEN RETURN false; END IF;
  CASE _action
    WHEN 'accept'   THEN RETURN _role = 'runner';
    WHEN 'prepare'  THEN RETURN _role = 'chef';
    WHEN 'ready'    THEN RETURN _role = 'chef';
    WHEN 'set_eta'  THEN RETURN _role = 'chef';
    WHEN 'serve'    THEN RETURN _role = 'runner';
    WHEN 'complete' THEN RETURN _role = 'runner';
    WHEN 'payment'  THEN RETURN _role = 'runner';
    WHEN 'cancel'   THEN RETURN _role IN ('runner','chef');
    ELSE RETURN false;
  END CASE;
END $$;

-- Update join_staff_with_code role validation
CREATE OR REPLACE FUNCTION public.join_staff_with_code(_code text, _full_name text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user UUID := auth.uid(); _invite RECORD; _email text;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _invite FROM public.cafe_staff_codes
   WHERE (upper(code) = upper(trim(_code)) OR token = trim(_code))
     AND active = true
     AND (expires_at IS NULL OR expires_at > now())
     AND (max_uses IS NULL OR used_count < max_uses)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This staff invite is invalid, expired, or already used'; END IF;
  IF _invite.role NOT IN ('chef','runner') THEN RAISE EXCEPTION 'Invalid staff role'; END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _user;

  INSERT INTO public.cafe_staff (cafe_id, user_id, role, status, full_name, email)
  VALUES (_invite.cafe_id, _user, _invite.role, 'active', NULLIF(trim(COALESCE(_full_name, '')), ''), _email)
  ON CONFLICT (cafe_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, status = 'active',
        full_name = COALESCE(EXCLUDED.full_name, public.cafe_staff.full_name),
        email = COALESCE(EXCLUDED.email, public.cafe_staff.email),
        updated_at = now();

  INSERT INTO public.user_roles (user_id, role) VALUES (_user, _invite.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.profiles (user_id, role, full_name, email, cafe_id, is_guest)
  VALUES (_user, _invite.role, NULLIF(trim(COALESCE(_full_name, '')), ''), _email, _invite.cafe_id, false)
  ON CONFLICT (user_id) DO UPDATE
    SET cafe_id = EXCLUDED.cafe_id,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        is_guest = false;

  UPDATE public.cafe_staff_codes
     SET used_count = used_count + 1,
         active = CASE WHEN max_uses IS NOT NULL AND used_count + 1 >= max_uses THEN false ELSE active END,
         updated_at = now()
   WHERE id = _invite.id;
  RETURN jsonb_build_object('cafe_id', _invite.cafe_id, 'role', _invite.role);
END $$;

-- ===== Payments =====
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS razorpay_signature text,
  ADD COLUMN IF NOT EXISTS refund_id text,
  ADD COLUMN IF NOT EXISTS refunded_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_razorpay_order_idx ON public.orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS orders_razorpay_payment_idx ON public.orders(razorpay_payment_id);

CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  cafe_id uuid NOT NULL,
  event text NOT NULL, -- order.created, payment.captured, payment.failed, refund.processed
  razorpay_order_id text,
  razorpay_payment_id text,
  amount numeric,
  method text,
  status text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_attempts_order_idx ON public.payment_attempts(order_id);
CREATE INDEX IF NOT EXISTS payment_attempts_cafe_idx ON public.payment_attempts(cafe_id);

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY pay_attempts_owner_read ON public.payment_attempts
  FOR SELECT USING (is_cafe_owner(auth.uid(), cafe_id));

-- Capture payment from webhook (admin context — service role bypasses RLS)
CREATE OR REPLACE FUNCTION public.record_payment_capture(
  _order_id uuid, _method text, _rzp_order_id text, _rzp_payment_id text, _rzp_signature text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o record;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF _o.payment_status = 'paid' THEN RETURN jsonb_build_object('id', _o.id, 'already_paid', true); END IF;

  UPDATE public.orders SET
    payment_status = 'paid', paid_at = now(),
    payment_method = COALESCE(_method, payment_method),
    razorpay_order_id = COALESCE(_rzp_order_id, razorpay_order_id),
    razorpay_payment_id = COALESCE(_rzp_payment_id, razorpay_payment_id),
    razorpay_signature = COALESCE(_rzp_signature, razorpay_signature),
    status = CASE WHEN status = 'placed' THEN 'accepted'::order_status ELSE status END,
    accepted_at = CASE WHEN status = 'placed' THEN COALESCE(accepted_at, now()) ELSE accepted_at END
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

  RETURN jsonb_build_object('id', _o.id, 'paid', true);
END $$;

CREATE OR REPLACE FUNCTION public.record_payment_refund(
  _order_id uuid, _refund_id text, _amount numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o record;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  UPDATE public.orders SET
    payment_status = 'refunded',
    refund_id = _refund_id,
    refunded_amount = COALESCE(_amount, total_amount),
    refunded_at = now(),
    status = 'cancelled'
  WHERE id = _order_id;

  IF _o.customer_user_id IS NOT NULL AND _o.earned_points > 0 THEN
    UPDATE public.loyalty_memberships
       SET loyalty_points = GREATEST(0, loyalty_points - _o.earned_points)
     WHERE cafe_id = _o.cafe_id AND customer_user_id = _o.customer_user_id;
    INSERT INTO public.loyalty_transactions (cafe_id, customer_user_id, points, type, note, related_order_id)
    VALUES (_o.cafe_id, _o.customer_user_id, -_o.earned_points, 'manual', 'Refund', _o.id);
  END IF;
  RETURN jsonb_build_object('id', _o.id, 'refunded', true);
END $$;

-- Owner payments dashboard
CREATE OR REPLACE FUNCTION public.get_payments_dashboard(_cafe_id uuid, _start date, _end date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _kpis jsonb; _series jsonb; _by_method jsonb; _pending jsonb; _refunds jsonb;
BEGIN
  IF NOT public.is_cafe_owner(auth.uid(), _cafe_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;

  SELECT jsonb_build_object(
    'gross_revenue', COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0),
    'refunded',      COALESCE(SUM(refunded_amount) FILTER (WHERE payment_status = 'refunded'), 0),
    'net_revenue',   COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0)
                   - COALESCE(SUM(refunded_amount) FILTER (WHERE payment_status = 'refunded'), 0),
    'paid_orders',   COUNT(*) FILTER (WHERE payment_status = 'paid'),
    'pending_orders',COUNT(*) FILTER (WHERE payment_status = 'pending' AND status NOT IN ('cancelled')),
    'refund_count',  COUNT(*) FILTER (WHERE payment_status = 'refunded'),
    'avg_ticket',    COALESCE(AVG(total_amount) FILTER (WHERE payment_status = 'paid'), 0)
  ) INTO _kpis FROM public.orders
  WHERE cafe_id = _cafe_id AND created_at::date BETWEEN _start AND _end;

  SELECT jsonb_agg(jsonb_build_object('date', d::date, 'revenue', COALESCE(o.rev,0), 'orders', COALESCE(o.cnt,0)) ORDER BY d) INTO _series
  FROM generate_series(_start, _end, interval '1 day') d
  LEFT JOIN (
    SELECT created_at::date AS day,
           COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0) AS rev,
           COUNT(*) FILTER (WHERE payment_status = 'paid') AS cnt
      FROM public.orders WHERE cafe_id = _cafe_id AND created_at::date BETWEEN _start AND _end
     GROUP BY 1
  ) o ON o.day = d::date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('method', COALESCE(payment_method,'unknown'), 'amount', amt, 'count', cnt)), '[]'::jsonb)
    INTO _by_method
  FROM (
    SELECT payment_method, SUM(total_amount) AS amt, COUNT(*) AS cnt
      FROM public.orders
     WHERE cafe_id = _cafe_id AND payment_status = 'paid'
       AND created_at::date BETWEEN _start AND _end
     GROUP BY payment_method
  ) m;

  SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb) INTO _pending FROM (
    SELECT id, customer_name, total_amount, created_at, source::text, table_no
      FROM public.orders
     WHERE cafe_id = _cafe_id AND payment_status = 'pending' AND status NOT IN ('cancelled')
     ORDER BY created_at DESC LIMIT 50
  ) p;

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO _refunds FROM (
    SELECT id, customer_name, total_amount, refunded_amount, refunded_at, refund_id
      FROM public.orders
     WHERE cafe_id = _cafe_id AND payment_status = 'refunded'
       AND refunded_at::date BETWEEN _start AND _end
     ORDER BY refunded_at DESC LIMIT 50
  ) r;

  RETURN jsonb_build_object('kpis', _kpis, 'series', COALESCE(_series,'[]'::jsonb),
    'by_method', _by_method, 'pending', _pending, 'refunds', _refunds);
END $$;