CREATE TABLE IF NOT EXISTS public.cafe_staff_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL,
  code TEXT NOT NULL UNIQUE,
  role public.app_role NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cafe_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (cafe_id, user_id)
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_staff_id UUID,
  ADD COLUMN IF NOT EXISTS accepted_by UUID,
  ADD COLUMN IF NOT EXISTS prepared_by UUID,
  ADD COLUMN IF NOT EXISTS served_by UUID,
  ADD COLUMN IF NOT EXISTS completed_by UUID,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS served_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_cafe_staff_cafe_user ON public.cafe_staff (cafe_id, user_id);
CREATE INDEX IF NOT EXISTS idx_cafe_staff_user_status ON public.cafe_staff (user_id, status);
CREATE INDEX IF NOT EXISTS idx_cafe_staff_codes_cafe_role ON public.cafe_staff_codes (cafe_id, role, active);
CREATE INDEX IF NOT EXISTS idx_orders_staff_assignment ON public.orders (cafe_id, assigned_staff_id, status);

ALTER TABLE public.cafe_staff_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_staff ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_active_cafe_staff(_user_id UUID, _cafe_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cafe_staff
    WHERE user_id = _user_id
      AND cafe_id = _cafe_id
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_cafe_staff_role(_user_id UUID, _cafe_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cafe_staff
    WHERE user_id = _user_id
      AND cafe_id = _cafe_id
      AND role = _role
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_work_order_status(_user_id UUID, _cafe_id UUID, _status public.order_status)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_cafe_owner(_user_id, _cafe_id)
    OR EXISTS (
      SELECT 1 FROM public.cafe_staff s
      WHERE s.user_id = _user_id
        AND s.cafe_id = _cafe_id
        AND s.status = 'active'
        AND (
          s.role = 'manager'
          OR (s.role = 'cashier' AND _status IN ('placed','accepted'))
          OR (s.role = 'chef' AND _status IN ('accepted','preparing'))
          OR (s.role = 'waiter' AND _status IN ('ready','served'))
        )
    );
$$;

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
  WHERE upper(code) = upper(trim(_code))
    AND active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR used_count < max_uses)
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Staff code is invalid or expired'; END IF;
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

  UPDATE public.profiles
     SET cafe_id = _invite.cafe_id,
         full_name = COALESCE(NULLIF(trim(_full_name), ''), full_name),
         is_guest = false
   WHERE user_id = _user;

  UPDATE public.cafe_staff_codes
     SET used_count = used_count + 1,
         updated_at = now()
   WHERE id = _invite.id;

  RETURN jsonb_build_object('cafe_id', _invite.cafe_id, 'role', _invite.role);
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_order_workflow(_order_id UUID, _next_status public.order_status)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user UUID := auth.uid();
  _o RECORD;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.can_work_order_status(_user, _o.cafe_id, _o.status) THEN RAISE EXCEPTION 'Not authorised for this order step'; END IF;

  IF NOT (
    (_o.status = 'placed' AND _next_status = 'accepted') OR
    (_o.status = 'accepted' AND _next_status = 'preparing') OR
    (_o.status = 'preparing' AND _next_status = 'ready') OR
    (_o.status = 'ready' AND _next_status = 'served') OR
    (_o.status = 'served' AND _next_status = 'completed') OR
    (_o.status = 'ready' AND _next_status = 'completed')
  ) THEN
    RAISE EXCEPTION 'Invalid workflow transition';
  END IF;

  UPDATE public.orders
     SET status = _next_status,
         assigned_staff_id = COALESCE(assigned_staff_id, _user),
         accepted_by = CASE WHEN _next_status = 'accepted' THEN _user ELSE accepted_by END,
         prepared_by = CASE WHEN _next_status = 'ready' THEN _user ELSE prepared_by END,
         served_by = CASE WHEN _next_status = 'served' THEN _user ELSE served_by END,
         completed_by = CASE WHEN _next_status = 'completed' THEN _user ELSE completed_by END,
         accepted_at = CASE WHEN _next_status = 'accepted' THEN now() ELSE accepted_at END,
         preparing_at = CASE WHEN _next_status = 'preparing' THEN now() ELSE preparing_at END,
         ready_at = CASE WHEN _next_status = 'ready' THEN now() ELSE ready_at END,
         served_at = CASE WHEN _next_status = 'served' THEN now() ELSE served_at END,
         completed_at = CASE WHEN _next_status = 'completed' THEN now() ELSE completed_at END
   WHERE id = _order_id;

  RETURN jsonb_build_object('id', _order_id, 'status', _next_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_order_by_staff(_order_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user UUID := auth.uid();
  _o RECORD;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT (
    public.is_cafe_owner(_user, _o.cafe_id)
    OR public.has_cafe_staff_role(_user, _o.cafe_id, 'manager')
    OR public.has_cafe_staff_role(_user, _o.cafe_id, 'cashier')
  ) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  UPDATE public.orders SET status = 'cancelled' WHERE id = _order_id;
END;
$$;

DROP TRIGGER IF EXISTS trg_cafe_staff_touch ON public.cafe_staff;
CREATE TRIGGER trg_cafe_staff_touch
BEFORE UPDATE ON public.cafe_staff
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_staff_codes_touch ON public.cafe_staff_codes;
CREATE TRIGGER trg_staff_codes_touch
BEFORE UPDATE ON public.cafe_staff_codes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "staff_codes_owner_read"
ON public.cafe_staff_codes FOR SELECT
USING (public.is_cafe_owner(auth.uid(), cafe_id));

CREATE POLICY "staff_codes_owner_insert"
ON public.cafe_staff_codes FOR INSERT
WITH CHECK (public.is_cafe_owner(auth.uid(), cafe_id) AND created_by = auth.uid() AND role IN ('manager','cashier','chef','waiter'));

CREATE POLICY "staff_codes_owner_update"
ON public.cafe_staff_codes FOR UPDATE
USING (public.is_cafe_owner(auth.uid(), cafe_id))
WITH CHECK (public.is_cafe_owner(auth.uid(), cafe_id));

CREATE POLICY "staff_codes_owner_delete"
ON public.cafe_staff_codes FOR DELETE
USING (public.is_cafe_owner(auth.uid(), cafe_id));

CREATE POLICY "cafe_staff_owner_read"
ON public.cafe_staff FOR SELECT
USING (public.is_cafe_owner(auth.uid(), cafe_id));

CREATE POLICY "cafe_staff_self_read"
ON public.cafe_staff FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "cafe_staff_owner_insert"
ON public.cafe_staff FOR INSERT
WITH CHECK (public.is_cafe_owner(auth.uid(), cafe_id) AND role IN ('manager','cashier','chef','waiter'));

CREATE POLICY "cafe_staff_owner_update"
ON public.cafe_staff FOR UPDATE
USING (public.is_cafe_owner(auth.uid(), cafe_id))
WITH CHECK (public.is_cafe_owner(auth.uid(), cafe_id));

CREATE POLICY "cafe_staff_owner_delete"
ON public.cafe_staff FOR DELETE
USING (public.is_cafe_owner(auth.uid(), cafe_id));

CREATE POLICY "orders_staff_read"
ON public.orders FOR SELECT
USING (public.is_active_cafe_staff(auth.uid(), cafe_id));

CREATE POLICY "orders_staff_update"
ON public.orders FOR UPDATE
USING (public.is_active_cafe_staff(auth.uid(), cafe_id))
WITH CHECK (public.is_active_cafe_staff(auth.uid(), cafe_id));

CREATE POLICY "order_items_staff_read"
ON public.order_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id
      AND public.is_active_cafe_staff(auth.uid(), o.cafe_id)
  )
);

CREATE POLICY "bookings_staff_read"
ON public.bookings FOR SELECT
USING (public.is_active_cafe_staff(auth.uid(), cafe_id));

CREATE POLICY "menu_staff_read"
ON public.menu_items FOR SELECT
USING (public.is_active_cafe_staff(auth.uid(), cafe_id));

CREATE POLICY "notifications_staff_read"
ON public.notifications FOR SELECT
USING (public.is_active_cafe_staff(auth.uid(), cafe_id));