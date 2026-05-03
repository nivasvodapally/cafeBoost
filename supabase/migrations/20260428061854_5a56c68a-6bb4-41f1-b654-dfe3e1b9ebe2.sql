-- 1. ORDERS: ETA columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS wait_eta_minutes integer,
  ADD COLUMN IF NOT EXISTS eta_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS eta_set_by uuid;

-- 2. CAFES: stuck thresholds + ETA presets
ALTER TABLE public.cafes
  ADD COLUMN IF NOT EXISTS stuck_unaccepted_minutes integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS stuck_kitchen_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS stuck_ready_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS eta_presets integer[] NOT NULL DEFAULT ARRAY[5,10,15,20,30];

-- 3. is_on_shift helper
CREATE OR REPLACE FUNCTION public.is_on_shift(_user_id uuid, _cafe_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_shifts s
    WHERE s.user_id = _user_id AND s.cafe_id = _cafe_id AND s.clock_out_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_breaks b
         WHERE b.shift_id = s.id AND b.ended_at IS NULL
      )
  );
$$;

-- 4. role_on_shift_count
CREATE OR REPLACE FUNCTION public.role_on_shift_count(_cafe_id uuid, _role app_role)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int
  FROM public.cafe_staff cs
  WHERE cs.cafe_id = _cafe_id AND cs.role = _role AND cs.status = 'active'
    AND public.is_on_shift(cs.user_id, _cafe_id);
$$;

-- 5. can_user_act_on(order, action)
-- actions: 'accept','prepare','ready','serve','complete','payment','set_eta','cancel','reassign'
CREATE OR REPLACE FUNCTION public.can_user_act_on(_user_id uuid, _cafe_id uuid, _action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _role app_role; _is_owner boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  _is_owner := public.is_cafe_owner(_user_id, _cafe_id);
  IF _is_owner THEN RETURN true; END IF;

  SELECT cs.role INTO _role FROM public.cafe_staff cs
   WHERE cs.user_id = _user_id AND cs.cafe_id = _cafe_id AND cs.status = 'active' LIMIT 1;
  IF _role IS NULL THEN RETURN false; END IF;

  -- Manager: full access
  IF _role = 'manager' THEN RETURN true; END IF;

  CASE _action
    WHEN 'accept' THEN
      RETURN _role = 'chef'
          OR (_role IN ('cashier','waiter') AND public.role_on_shift_count(_cafe_id,'chef') = 0);
    WHEN 'prepare' THEN
      RETURN _role = 'chef';
    WHEN 'ready' THEN
      RETURN _role = 'chef';
    WHEN 'set_eta' THEN
      RETURN _role = 'chef';
    WHEN 'serve' THEN
      RETURN _role IN ('cashier','waiter')
          OR (_role = 'chef' AND public.role_on_shift_count(_cafe_id,'cashier') = 0
                              AND public.role_on_shift_count(_cafe_id,'waiter') = 0);
    WHEN 'complete' THEN
      RETURN _role IN ('cashier','waiter')
          OR (_role = 'chef' AND public.role_on_shift_count(_cafe_id,'cashier') = 0
                              AND public.role_on_shift_count(_cafe_id,'waiter') = 0);
    WHEN 'payment' THEN
      RETURN _role = 'cashier'
          OR (_role = 'waiter' AND public.role_on_shift_count(_cafe_id,'cashier') = 0)
          OR (_role = 'chef' AND public.role_on_shift_count(_cafe_id,'cashier') = 0
                              AND public.role_on_shift_count(_cafe_id,'waiter') = 0);
    WHEN 'cancel' THEN
      RETURN _role IN ('cashier','waiter','chef'); -- managers handled above
    WHEN 'reassign' THEN
      RETURN false; -- manager/owner only
    ELSE RETURN false;
  END CASE;
END $$;

-- 6. Update advance_order_workflow to use can_user_act_on
CREATE OR REPLACE FUNCTION public.advance_order_workflow(_order_id uuid, _next_status order_status)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user uuid := auth.uid(); _o RECORD; _action text;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  _action := CASE _next_status
    WHEN 'accepted' THEN 'accept'
    WHEN 'preparing' THEN 'prepare'
    WHEN 'ready' THEN 'ready'
    WHEN 'served' THEN 'serve'
    WHEN 'completed' THEN 'complete'
    ELSE NULL END;
  IF _action IS NULL THEN RAISE EXCEPTION 'Invalid transition target'; END IF;

  IF NOT public.can_user_act_on(_user, _o.cafe_id, _action) THEN
    RAISE EXCEPTION 'Your role is not allowed for this step right now';
  END IF;

  IF NOT (
    (_o.status = 'placed' AND _next_status = 'accepted') OR
    (_o.status = 'accepted' AND _next_status = 'preparing') OR
    (_o.status = 'preparing' AND _next_status = 'ready') OR
    (_o.status = 'ready' AND _next_status = 'served') OR
    (_o.status = 'served' AND _next_status = 'completed') OR
    (_o.status = 'ready' AND _next_status = 'completed')
  ) THEN RAISE EXCEPTION 'Invalid workflow transition'; END IF;

  UPDATE public.orders
     SET status = _next_status,
         assigned_staff_id = COALESCE(assigned_staff_id, _user),
         accepted_by = CASE WHEN _next_status = 'accepted' THEN _user ELSE accepted_by END,
         prepared_by = CASE WHEN _next_status = 'ready' THEN _user ELSE prepared_by END,
         served_by   = CASE WHEN _next_status = 'served' THEN _user ELSE served_by END,
         completed_by= CASE WHEN _next_status = 'completed' THEN _user ELSE completed_by END,
         accepted_at = CASE WHEN _next_status = 'accepted' THEN now() ELSE accepted_at END,
         preparing_at= CASE WHEN _next_status = 'preparing' THEN now() ELSE preparing_at END,
         ready_at    = CASE WHEN _next_status = 'ready' THEN now() ELSE ready_at END,
         served_at   = CASE WHEN _next_status = 'served' THEN now() ELSE served_at END,
         completed_at= CASE WHEN _next_status = 'completed' THEN now() ELSE completed_at END
   WHERE id = _order_id;

  RETURN jsonb_build_object('id', _order_id, 'status', _next_status);
END $$;

-- 7. set_order_eta
CREATE OR REPLACE FUNCTION public.set_order_eta(_order_id uuid, _minutes int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid(); _o RECORD;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _minutes IS NULL OR _minutes < 0 OR _minutes > 240 THEN RAISE EXCEPTION 'Invalid ETA'; END IF;
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.can_user_act_on(_u, _o.cafe_id, 'set_eta') THEN
    RAISE EXCEPTION 'Not authorised to set ETA';
  END IF;
  UPDATE public.orders
     SET wait_eta_minutes = _minutes,
         eta_updated_at = now(),
         eta_set_by = _u
   WHERE id = _order_id;
  RETURN jsonb_build_object('id', _order_id, 'eta_minutes', _minutes);
END $$;

-- 8. manager_reassign_order (manager/owner only)
CREATE OR REPLACE FUNCTION public.manager_reassign_order(_order_id uuid, _new_assignee uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid(); _o RECORD;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT (public.is_cafe_owner(_u, _o.cafe_id)
       OR public.has_cafe_staff_role(_u, _o.cafe_id, 'manager')) THEN
    RAISE EXCEPTION 'Only manager or owner can reassign';
  END IF;
  IF _new_assignee IS NOT NULL AND NOT public.is_active_cafe_staff(_new_assignee, _o.cafe_id) THEN
    RAISE EXCEPTION 'Assignee is not active staff at this cafe';
  END IF;
  UPDATE public.orders SET assigned_staff_id = _new_assignee WHERE id = _order_id;
  RETURN jsonb_build_object('id', _order_id, 'assigned_to', _new_assignee);
END $$;

-- 9. get_live_ops_board: orders + staff status + per-staff KPIs (today)
CREATE OR REPLACE FUNCTION public.get_live_ops_board(_cafe_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid(); _orders jsonb; _staff jsonb; _cfg RECORD; _today timestamptz := date_trunc('day', now());
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT (public.is_cafe_owner(_u,_cafe_id) OR public.has_cafe_staff_role(_u,_cafe_id,'manager')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT stuck_unaccepted_minutes, stuck_kitchen_minutes, stuck_ready_minutes, eta_presets
    INTO _cfg FROM public.cafes WHERE id = _cafe_id;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at), '[]'::jsonb) INTO _orders FROM (
    SELECT o.id, o.customer_name, o.table_no, o.source::text, o.status::text, o.payment_status::text,
           o.total_amount, o.created_at, o.accepted_at, o.preparing_at, o.ready_at, o.served_at,
           o.wait_eta_minutes, o.eta_updated_at, o.assigned_staff_id,
           EXTRACT(EPOCH FROM (now() - o.created_at))::int AS age_seconds,
           CASE
             WHEN o.status = 'placed'    AND EXTRACT(EPOCH FROM (now() - o.created_at)) > _cfg.stuck_unaccepted_minutes*60 THEN 'unaccepted'
             WHEN o.status IN ('accepted','preparing') AND EXTRACT(EPOCH FROM (now() - COALESCE(o.accepted_at,o.created_at))) > _cfg.stuck_kitchen_minutes*60 THEN 'kitchen'
             WHEN o.status = 'ready'     AND EXTRACT(EPOCH FROM (now() - o.ready_at)) > _cfg.stuck_ready_minutes*60 THEN 'ready'
             ELSE NULL END AS stuck_reason,
           COALESCE(NULLIF(cs.full_name,''), p.full_name, p.email) AS assignee_name,
           cs.role::text AS assignee_role
      FROM public.orders o
      LEFT JOIN public.cafe_staff cs ON cs.user_id = o.assigned_staff_id AND cs.cafe_id = o.cafe_id
      LEFT JOIN public.profiles p   ON p.user_id = o.assigned_staff_id
     WHERE o.cafe_id = _cafe_id
       AND o.status IN ('placed','accepted','preparing','ready','served')
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.on_shift DESC, t.name), '[]'::jsonb) INTO _staff FROM (
    SELECT cs.user_id, cs.role::text AS role,
           COALESCE(NULLIF(cs.full_name,''), p.full_name, p.email, 'Staff') AS name,
           public.is_on_shift(cs.user_id, _cafe_id) AS on_shift,
           EXISTS (
             SELECT 1 FROM public.staff_breaks b
              JOIN public.staff_shifts s ON s.id = b.shift_id
             WHERE b.user_id = cs.user_id AND s.cafe_id = _cafe_id
               AND b.ended_at IS NULL AND s.clock_out_at IS NULL
           ) AS on_break,
           (SELECT clock_in_at FROM public.staff_shifts s
             WHERE s.user_id = cs.user_id AND s.cafe_id = _cafe_id AND s.clock_out_at IS NULL LIMIT 1) AS clock_in_at,
           (SELECT COUNT(*) FROM public.orders o WHERE o.cafe_id=_cafe_id
              AND (o.accepted_by=cs.user_id OR o.prepared_by=cs.user_id OR o.served_by=cs.user_id OR o.completed_by=cs.user_id)
              AND o.created_at >= _today)::int AS orders_today,
           COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (ready_at - preparing_at)))
              FROM public.orders WHERE cafe_id=_cafe_id AND prepared_by=cs.user_id
                AND ready_at >= _today AND preparing_at IS NOT NULL),0)::int AS avg_prep_seconds_today
      FROM public.cafe_staff cs
      LEFT JOIN public.profiles p ON p.user_id = cs.user_id
     WHERE cs.cafe_id = _cafe_id AND cs.status = 'active'
  ) t;

  RETURN jsonb_build_object(
    'orders', _orders,
    'staff',  _staff,
    'config', jsonb_build_object(
      'stuck_unaccepted_minutes', _cfg.stuck_unaccepted_minutes,
      'stuck_kitchen_minutes',    _cfg.stuck_kitchen_minutes,
      'stuck_ready_minutes',      _cfg.stuck_ready_minutes,
      'eta_presets',              _cfg.eta_presets
    )
  );
END $$;