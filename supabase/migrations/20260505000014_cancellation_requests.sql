-- Add cancellation_requested column to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_requested BOOLEAN NOT NULL DEFAULT false;

-- Update the secure customer cancellation RPC to only request cancellation
CREATE OR REPLACE FUNCTION public.cancel_order_by_customer(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  _u uuid := auth.uid(); 
  _o record;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  
  -- Check ownership
  IF _o.customer_user_id IS NULL OR _o.customer_user_id != _u THEN
    RAISE EXCEPTION 'Not authorized to request cancellation for this order';
  END IF;
  
  -- Allowed ONLY before "preparing"
  IF _o.status NOT IN ('placed', 'accepted') THEN
    RAISE EXCEPTION 'Order cannot be cancelled once it is in preparation or ready';
  END IF;
  
  -- Instead of direct cancel, set the request flag
  UPDATE public.orders SET cancellation_requested = true, updated_at = now() WHERE id = _order_id;
  
  -- Create a notification for the owner/staff
  INSERT INTO public.notifications (cafe_id, kind, title, body, owner_user_id, related_id)
  SELECT 
    _o.cafe_id, 
    'order_update', 
    'Cancellation Requested', 
    'Customer requested to cancel Order #' || upper(left(_o.id::text, 6)),
    owner_user_id,
    _o.id
  FROM public.cafes WHERE id = _o.cafe_id;
  
  RETURN jsonb_build_object('id', _order_id, 'status', _o.status, 'cancellation_requested', true);
END $$;

-- Update get_live_ops_board to include cancellation_requested
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
    SELECT o.id, o.customer_name, o.table_no, o.source::text, o.status::text, o.payment_status::text, o.payment_method,
           o.total_amount, o.created_at, o.accepted_at, o.preparing_at, o.ready_at, o.served_at,
           o.wait_eta_minutes, o.eta_updated_at, o.assigned_staff_id, o.cancellation_requested,
           EXTRACT(EPOCH FROM (now() - o.created_at))::int AS age_seconds,
           CASE
             WHEN o.status = 'placed'    AND EXTRACT(EPOCH FROM (now() - o.created_at)) > _cfg.stuck_unaccepted_minutes*60 THEN 'unaccepted'
             WHEN o.status IN ('accepted','preparing') AND EXTRACT(EPOCH FROM (now() - COALESCE(o.accepted_at,o.created_at))) > _cfg.stuck_kitchen_minutes*60 THEN 'kitchen'
             WHEN o.status = 'ready'     AND EXTRACT(EPOCH FROM (now() - o.ready_at)) > _cfg.stuck_ready_minutes*60 THEN 'ready'
             ELSE NULL END AS stuck_reason,
           COALESCE(NULLIF(cs.full_name,''), p.full_name, p.email) AS assignee_name,
           cs.role::text AS assignee_role,
           COALESCE(NULLIF(pcs.full_name,''), pp.full_name, pp.email) AS collector_name
      FROM public.orders o
      LEFT JOIN public.cafe_staff cs ON cs.user_id = o.assigned_staff_id AND cs.cafe_id = o.cafe_id
      LEFT JOIN public.profiles p   ON p.user_id = o.assigned_staff_id
      LEFT JOIN public.cafe_staff pcs ON pcs.user_id = o.paid_collected_by AND pcs.cafe_id = o.cafe_id
      LEFT JOIN public.profiles pp ON pp.user_id = o.paid_collected_by
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

-- RPC for staff to deny cancellation (clear the flag)
CREATE OR REPLACE FUNCTION public.deny_order_cancellation(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  _u uuid := auth.uid(); 
  _o record;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  
  -- Auth check (owner/manager/cashier)
  IF NOT (
    public.is_cafe_owner(_u, _o.cafe_id)
    OR public.has_cafe_staff_role(_u, _o.cafe_id, 'manager')
    OR public.has_cafe_staff_role(_u, _o.cafe_id, 'cashier')
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  
  UPDATE public.orders SET cancellation_requested = false, updated_at = now() WHERE id = _order_id;
END $$;
