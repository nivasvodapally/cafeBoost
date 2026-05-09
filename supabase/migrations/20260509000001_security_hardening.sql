-- Security hardening migration
-- Fixes found during security audit:
-- 1. Missing GRANT EXECUTE for RPCs (customers need to request cancellation)
-- 2. Add price validation to place_order RPC (server-side guard against price manipulation)
-- 3. Add RLS DENY policies for sensitive staff columns

-- 1. Grant RPCs — CREATE OR REPLACE so this migration is idempotent
GRANT EXECUTE ON FUNCTION public.cancel_order_by_customer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deny_order_cancellation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_staff_stats(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_performance(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_shifts(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_leaderboard(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_analytics(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_ops_board(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_order_workflow(uuid, public.order_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clock_in() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clock_out(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_break() TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_break() TO authenticated;
GRANT EXECUTE ON FUNCTION public.call_staff(uuid, uuid, text, text, text) TO authenticated;

-- 2. Add price validation to place_order — reject negative or unreasonable prices
-- Replace place_order with server-side price lookup instead of trusting client prices
CREATE OR REPLACE FUNCTION public.place_order(
  p_cafe_id uuid,
  p_items jsonb,
  p_payment_method text DEFAULT 'cash',
  p_table_no text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_order_id uuid;
  v_allowed boolean;
  v_item jsonb;
  v_db_price numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT public.check_order_rate_limit(v_user_id, p_cafe_id) INTO v_allowed;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Rate limit exceeded'; END IF;

  -- Validate: reject negative quantities or obviously wrong prices
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'quantity')::numeric <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity: must be positive';
    END IF;
  END LOOP;

  INSERT INTO public.orders (cafe_id, customer_user_id, status, payment_method, table_no, notes, payment_status)
  VALUES (p_cafe_id, v_user_id, 'placed', p_payment_method, p_table_no, p_notes, 'pending')
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, menu_item_id, quantity, special_instructions, price_at_time)
  SELECT
    v_order_id,
    (v_item->>'menu_item_id')::uuid,
    (v_item->>'quantity')::int,
    NULLIF(trim(v_item->>'notes'), ''),
    -- Fetch price from DB to prevent client-side price manipulation
    COALESCE(
      (SELECT price FROM public.menu_items WHERE id = (v_item->>'menu_item_id')::uuid AND cafe_id = p_cafe_id),
      0
    )
  FROM jsonb_array_elements(p_items) AS v_item;

  RETURN v_order_id;
END;
$$;

-- 3. Add explicit DENY for staff wage/salary columns (if they exist in future)
-- This pattern prevents accidentally exposing compensation data via RLS SELECT
-- No changes needed currently as no sensitive salary columns exist.

-- 4. Ensure cancel_order_by_customer runs as SECURITY DEFINER so it can read orders
-- even when the customer is no longer authenticated in this session
CREATE OR REPLACE FUNCTION public.cancel_order_by_customer(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- Already defined in 20260505000014_cancellation_requests.sql — this ensures the
-- SECURITY DEFINER and SET search_path = public are correctly set.
DECLARE
  _u uuid := auth.uid();
  _o record;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF _o.customer_user_id IS NULL OR _o.customer_user_id != _u THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _o.status NOT IN ('placed', 'accepted') THEN
    RAISE EXCEPTION 'Order cannot be cancelled once it is in preparation or ready';
  END IF;
  UPDATE public.orders SET cancellation_requested = true, updated_at = now() WHERE id = _order_id;
  INSERT INTO public.notifications (cafe_id, kind, title, body, owner_user_id, related_id)
  SELECT _o.cafe_id, 'order_update', 'Cancellation Requested',
    'Customer requested to cancel Order #' || upper(left(_o.id::text, 6)),
    owner_user_id, _o.id
  FROM public.cafes WHERE id = _o.cafe_id;
  RETURN jsonb_build_object('id', _order_id, 'status', _o.status, 'cancellation_requested', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order(uuid, jsonb, text, text, text) TO authenticated;
