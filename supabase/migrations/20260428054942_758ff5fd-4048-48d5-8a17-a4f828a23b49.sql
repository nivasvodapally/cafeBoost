
-- Cache name/email on cafe_staff for owner display
ALTER TABLE public.cafe_staff
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS email text;

-- Backfill from profiles
UPDATE public.cafe_staff cs
   SET full_name = COALESCE(cs.full_name, p.full_name),
       email = COALESCE(cs.email, p.email)
  FROM public.profiles p
 WHERE p.user_id = cs.user_id;

-- ===== staff_shifts =====
CREATE TABLE IF NOT EXISTS public.staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  user_id uuid NOT NULL,
  clock_in_at timestamptz NOT NULL DEFAULT now(),
  clock_out_at timestamptz,
  total_break_seconds integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_cafe_user ON public.staff_shifts(cafe_id, user_id, clock_in_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_shifts_open
  ON public.staff_shifts(user_id) WHERE clock_out_at IS NULL;

ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shifts_self_read ON public.staff_shifts;
CREATE POLICY shifts_self_read ON public.staff_shifts FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS shifts_owner_read ON public.staff_shifts;
CREATE POLICY shifts_owner_read ON public.staff_shifts FOR SELECT
  USING (public.is_cafe_owner(auth.uid(), cafe_id));

-- ===== staff_breaks =====
CREATE TABLE IF NOT EXISTS public.staff_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.staff_shifts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  cafe_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_breaks_shift ON public.staff_breaks(shift_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_breaks_open
  ON public.staff_breaks(shift_id) WHERE ended_at IS NULL;

ALTER TABLE public.staff_breaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS breaks_self_read ON public.staff_breaks;
CREATE POLICY breaks_self_read ON public.staff_breaks FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS breaks_owner_read ON public.staff_breaks;
CREATE POLICY breaks_owner_read ON public.staff_breaks FOR SELECT
  USING (public.is_cafe_owner(auth.uid(), cafe_id));

-- ===== Clock-in / Clock-out =====
CREATE OR REPLACE FUNCTION public.clock_in()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _u uuid := auth.uid(); _staff record; _shift_id uuid;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _staff FROM public.cafe_staff WHERE user_id = _u AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active staff assignment'; END IF;
  -- if there's already an open shift, return it
  SELECT id INTO _shift_id FROM public.staff_shifts WHERE user_id = _u AND clock_out_at IS NULL LIMIT 1;
  IF _shift_id IS NOT NULL THEN RETURN jsonb_build_object('id', _shift_id, 'already_open', true); END IF;
  INSERT INTO public.staff_shifts (cafe_id, user_id) VALUES (_staff.cafe_id, _u) RETURNING id INTO _shift_id;
  RETURN jsonb_build_object('id', _shift_id, 'started', true);
END $$;

CREATE OR REPLACE FUNCTION public.clock_out(_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _u uuid := auth.uid(); _shift record; _open_break record; _extra int := 0;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _shift FROM public.staff_shifts WHERE user_id = _u AND clock_out_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No open shift'; END IF;
  -- close any open break first
  SELECT * INTO _open_break FROM public.staff_breaks WHERE shift_id = _shift.id AND ended_at IS NULL FOR UPDATE;
  IF FOUND THEN
    UPDATE public.staff_breaks SET ended_at = now() WHERE id = _open_break.id;
    _extra := EXTRACT(EPOCH FROM (now() - _open_break.started_at))::int;
  END IF;
  UPDATE public.staff_shifts
     SET clock_out_at = now(),
         total_break_seconds = total_break_seconds + _extra,
         notes = COALESCE(_notes, notes)
   WHERE id = _shift.id;
  RETURN jsonb_build_object('id', _shift.id, 'closed', true);
END $$;

CREATE OR REPLACE FUNCTION public.start_break()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _u uuid := auth.uid(); _shift record; _bid uuid;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _shift FROM public.staff_shifts WHERE user_id = _u AND clock_out_at IS NULL LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clock in first'; END IF;
  IF EXISTS (SELECT 1 FROM public.staff_breaks WHERE shift_id = _shift.id AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'A break is already in progress';
  END IF;
  INSERT INTO public.staff_breaks (shift_id, user_id, cafe_id)
    VALUES (_shift.id, _u, _shift.cafe_id) RETURNING id INTO _bid;
  RETURN jsonb_build_object('id', _bid);
END $$;

CREATE OR REPLACE FUNCTION public.end_break()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _u uuid := auth.uid(); _br record; _secs int;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT b.* INTO _br FROM public.staff_breaks b
    JOIN public.staff_shifts s ON s.id = b.shift_id
   WHERE b.user_id = _u AND b.ended_at IS NULL AND s.clock_out_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active break'; END IF;
  _secs := EXTRACT(EPOCH FROM (now() - _br.started_at))::int;
  UPDATE public.staff_breaks SET ended_at = now() WHERE id = _br.id;
  UPDATE public.staff_shifts SET total_break_seconds = total_break_seconds + _secs WHERE id = _br.shift_id;
  RETURN jsonb_build_object('id', _br.id, 'seconds', _secs);
END $$;

-- ===== My staff stats (the staff member sees their own) =====
CREATE OR REPLACE FUNCTION public.get_my_staff_stats(_days int DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _u uuid := auth.uid(); _start timestamptz := now() - (_days || ' days')::interval; _out jsonb;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT jsonb_build_object(
    'orders_accepted', COALESCE((SELECT COUNT(*) FROM public.orders WHERE accepted_by = _u AND accepted_at >= _start), 0),
    'orders_prepared', COALESCE((SELECT COUNT(*) FROM public.orders WHERE prepared_by = _u AND ready_at >= _start), 0),
    'orders_served',   COALESCE((SELECT COUNT(*) FROM public.orders WHERE served_by   = _u AND served_at  >= _start), 0),
    'orders_completed',COALESCE((SELECT COUNT(*) FROM public.orders WHERE completed_by= _u AND completed_at>= _start), 0),
    'revenue_touched', COALESCE((SELECT SUM(total_amount) FROM public.orders
                                  WHERE (accepted_by = _u OR prepared_by = _u OR served_by = _u OR completed_by = _u)
                                    AND payment_status = 'paid' AND created_at >= _start), 0),
    'avg_prep_seconds', COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (ready_at - preparing_at)))
                                    FROM public.orders WHERE prepared_by = _u AND ready_at >= _start AND preparing_at IS NOT NULL), 0),
    'avg_serve_seconds',COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (served_at - ready_at)))
                                    FROM public.orders WHERE served_by = _u AND served_at >= _start AND ready_at IS NOT NULL), 0),
    'hours_worked',     COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(clock_out_at, now()) - clock_in_at)) - total_break_seconds) / 3600.0
                                    FROM public.staff_shifts WHERE user_id = _u AND clock_in_at >= _start), 0),
    'open_shift',       (SELECT jsonb_build_object('id', id, 'clock_in_at', clock_in_at)
                           FROM public.staff_shifts WHERE user_id = _u AND clock_out_at IS NULL LIMIT 1),
    'open_break',       (SELECT jsonb_build_object('id', b.id, 'started_at', b.started_at)
                           FROM public.staff_breaks b JOIN public.staff_shifts s ON s.id = b.shift_id
                          WHERE b.user_id = _u AND b.ended_at IS NULL AND s.clock_out_at IS NULL LIMIT 1)
  ) INTO _out;
  RETURN _out;
END $$;

-- ===== Owner per-staff performance =====
CREATE OR REPLACE FUNCTION public.get_staff_performance(_cafe_id uuid, _days int DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _start timestamptz := now() - (_days || ' days')::interval; _rows jsonb;
BEGIN
  IF NOT public.is_cafe_owner(auth.uid(), _cafe_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t.orders_accepted + t.orders_prepared + t.orders_served + t.orders_completed) DESC), '[]'::jsonb)
    INTO _rows
  FROM (
    SELECT
      cs.user_id,
      cs.role::text AS role,
      COALESCE(NULLIF(cs.full_name, ''), p.full_name, p.email, 'Staff') AS name,
      COALESCE(cs.email, p.email) AS email,
      cs.status,
      cs.joined_at,
      (SELECT COUNT(*) FROM public.orders o WHERE o.cafe_id = _cafe_id AND o.accepted_by = cs.user_id AND o.accepted_at >= _start) AS orders_accepted,
      (SELECT COUNT(*) FROM public.orders o WHERE o.cafe_id = _cafe_id AND o.prepared_by = cs.user_id AND o.ready_at >= _start) AS orders_prepared,
      (SELECT COUNT(*) FROM public.orders o WHERE o.cafe_id = _cafe_id AND o.served_by   = cs.user_id AND o.served_at  >= _start) AS orders_served,
      (SELECT COUNT(*) FROM public.orders o WHERE o.cafe_id = _cafe_id AND o.completed_by= cs.user_id AND o.completed_at>= _start) AS orders_completed,
      COALESCE((SELECT SUM(total_amount) FROM public.orders o
                  WHERE o.cafe_id = _cafe_id AND o.payment_status = 'paid'
                    AND (o.accepted_by = cs.user_id OR o.prepared_by = cs.user_id OR o.served_by = cs.user_id OR o.completed_by = cs.user_id)
                    AND o.created_at >= _start), 0) AS revenue_touched,
      COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (ready_at - preparing_at))) FROM public.orders
                 WHERE cafe_id = _cafe_id AND prepared_by = cs.user_id AND ready_at >= _start AND preparing_at IS NOT NULL), 0)::int AS avg_prep_seconds,
      COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (served_at - ready_at))) FROM public.orders
                 WHERE cafe_id = _cafe_id AND served_by = cs.user_id AND served_at >= _start AND ready_at IS NOT NULL), 0)::int AS avg_serve_seconds,
      COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(clock_out_at, now()) - clock_in_at)) - total_break_seconds) / 3600.0
                  FROM public.staff_shifts WHERE cafe_id = _cafe_id AND user_id = cs.user_id AND clock_in_at >= _start), 0)::numeric(10,2) AS hours_worked,
      EXISTS(SELECT 1 FROM public.staff_shifts WHERE cafe_id = _cafe_id AND user_id = cs.user_id AND clock_out_at IS NULL) AS on_shift
    FROM public.cafe_staff cs
    LEFT JOIN public.profiles p ON p.user_id = cs.user_id
    WHERE cs.cafe_id = _cafe_id AND cs.status = 'active'
  ) t;
  RETURN jsonb_build_object('staff', _rows, 'period_days', _days);
END $$;

-- ===== Owner: shift log =====
CREATE OR REPLACE FUNCTION public.get_staff_shifts(_cafe_id uuid, _days int DEFAULT 14)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _start timestamptz := now() - (_days || ' days')::interval; _rows jsonb;
BEGIN
  IF NOT public.is_cafe_owner(auth.uid(), _cafe_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.clock_in_at DESC), '[]'::jsonb) INTO _rows
  FROM (
    SELECT s.id, s.user_id, s.clock_in_at, s.clock_out_at, s.total_break_seconds,
      COALESCE(NULLIF(cs.full_name, ''), p.full_name, p.email, 'Staff') AS name,
      cs.role::text AS role
    FROM public.staff_shifts s
    LEFT JOIN public.cafe_staff cs ON cs.user_id = s.user_id AND cs.cafe_id = s.cafe_id
    LEFT JOIN public.profiles p ON p.user_id = s.user_id
    WHERE s.cafe_id = _cafe_id AND s.clock_in_at >= _start
  ) t;
  RETURN _rows;
END $$;

-- Update join_staff_with_code to also stash full_name/email on cafe_staff
CREATE OR REPLACE FUNCTION public.join_staff_with_code(_code text, _full_name text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _user UUID := auth.uid();
  _invite RECORD;
  _email text;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _invite FROM public.cafe_staff_codes
   WHERE (upper(code) = upper(trim(_code)) OR token = trim(_code))
     AND active = true
     AND (expires_at IS NULL OR expires_at > now())
     AND (max_uses IS NULL OR used_count < max_uses)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This staff invite is invalid, expired, or already used'; END IF;
  IF _invite.role NOT IN ('manager','cashier','chef','waiter') THEN RAISE EXCEPTION 'Invalid staff role'; END IF;

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
