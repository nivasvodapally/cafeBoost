-- Visit tracking: increment visit count per LOGIN SESSION that has at least one successful order.
-- A "login session" is stored on the order at order creation time.
-- Only orders with payment_status='paid' trigger the visit bump.
-- Multiple paid orders within the same login session only count as ONE visit.

-- 1. Add last_login_session column to loyalty_memberships
ALTER TABLE public.loyalty_memberships
  ADD COLUMN IF NOT EXISTS last_login_session text;

-- 2. Create the visit-tracking RPC (called by mark_order_paid)
CREATE OR REPLACE FUNCTION public.increment_visit_if_new_session(
  _cafe_id uuid,
  _customer_user_id uuid,
  _login_session text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _login_session IS NULL OR _login_session = '' THEN RETURN false; END IF;

  -- Upsert loyalty membership with visit bump only when this is a new login session
  INSERT INTO public.loyalty_memberships (cafe_id, customer_user_id, loyalty_points, total_visits, last_visit_at, last_login_session)
    VALUES (_cafe_id, _customer_user_id, 0, 1, now(), _login_session)
  ON CONFLICT (cafe_id, customer_user_id) DO UPDATE
    SET
      total_visits       = CASE
                             WHEN EXCLUDED.last_login_session IS DISTINCT FROM public.loyalty_memberships.last_login_session
                             THEN public.loyalty_memberships.total_visits + 1
                             ELSE public.loyalty_memberships.total_visits
                           END,
      last_visit_at      = CASE
                             WHEN EXCLUDED.last_login_session IS DISTINCT FROM public.loyalty_memberships.last_login_session
                             THEN now()
                             ELSE public.loyalty_memberships.last_visit_at
                           END,
      last_login_session = EXCLUDED.last_login_session
    WHERE EXCLUDED.last_login_session IS DISTINCT FROM public.loyalty_memberships.last_login_session;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_visit_if_new_session(uuid, uuid, text) TO authenticated;

-- 3. Add login_session column to orders (may already exist from partial migration)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS login_session text;

-- 4. Update place_order_and_update_loyalty to accept and store login_session
--    and call increment_visit_if_new_session after order creation
CREATE OR REPLACE FUNCTION public.place_order_and_update_loyalty(
  _cafe_id uuid, _customer_user_id uuid, _customer_name text, _customer_phone text,
  _notes text, _source public.order_source, _table_no text, _items jsonb,
  _login_session text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _order_id uuid; _subtotal numeric := 0; _tax_rate numeric := 0;
  _tax_amount numeric := 0; _total numeric := 0; _accept_online boolean;
  _ppc numeric := 0; _earned integer := 0; _line jsonb; _item record; _qty integer;
  _recent_order_count integer;
BEGIN
  -- RATE LIMITING
  SELECT COUNT(*) INTO _recent_order_count
  FROM public.orders
  WHERE customer_user_id = _customer_user_id
    AND cafe_id = _cafe_id
    AND created_at > (now() - interval '1 minute')
    AND status NOT IN ('cancelled');

  IF _recent_order_count >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Please wait a moment before placing another order.';
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> _customer_user_id THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;

  SELECT tax_rate, accept_online_orders, points_per_currency
    INTO _tax_rate, _accept_online, _ppc FROM public.cafes WHERE id = _cafe_id;
  IF _tax_rate IS NULL THEN RAISE EXCEPTION 'Cafe not found'; END IF;
  IF _accept_online = false AND _source <> 'table' THEN RAISE EXCEPTION 'This cafe is not accepting online orders right now'; END IF;

  CREATE TEMP TABLE _resolved_items (menu_item_id uuid, name text, price numeric, quantity integer) ON COMMIT DROP;

  FOR _line IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := COALESCE((_line->>'quantity')::int, 0);
    IF _qty < 1 OR _qty > 99 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT id, name, price, available, cafe_id INTO _item FROM public.menu_items WHERE id = (_line->>'menu_item_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'An item is no longer on the menu'; END IF;
    IF _item.cafe_id <> _cafe_id THEN RAISE EXCEPTION 'Item does not belong to this cafe'; END IF;
    IF _item.available = false THEN RAISE EXCEPTION '"%" is currently unavailable', _item.name; END IF;
    INSERT INTO _resolved_items VALUES (_item.id, _item.name, _item.price, _qty);
    _subtotal := _subtotal + (_item.price * _qty);
  END LOOP;

  _tax_amount := round((_subtotal * (_tax_rate / 100.0))::numeric, 2);
  _total := _subtotal + _tax_amount;
  _earned := floor(_subtotal * COALESCE(_ppc, 0))::int;

  INSERT INTO public.orders (cafe_id, customer_user_id, customer_name, customer_phone,
    notes, source, table_no, subtotal, tax_amount, total_amount, earned_points, status, payment_status,
    login_session)
  VALUES (_cafe_id, _customer_user_id, _customer_name, _customer_phone, _notes,
    COALESCE(_source,'app'), _table_no, _subtotal, _tax_amount, _total, _earned, 'placed', 'pending',
    NULLIF(trim(_login_session), ''))
  RETURNING id INTO _order_id;

  INSERT INTO public.order_items (order_id, menu_item_id, name, price, quantity)
  SELECT _order_id, menu_item_id, name, price, quantity FROM _resolved_items;

  RETURN jsonb_build_object('id', _order_id, 'subtotal', _subtotal, 'tax_amount', _tax_amount,
    'total_amount', _total, 'earned_points', _earned);
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order_and_update_loyalty(uuid, uuid, text, text, text, public.order_source, text, jsonb, text) TO authenticated;

-- 5. Update mark_order_paid to:
--    - Track visits using the login_session stored on the order at creation time
--    - Only count visits for PAID orders (prevents double-counting on status changes)
CREATE OR REPLACE FUNCTION public.mark_order_paid(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o record;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.is_cafe_owner(auth.uid(), _o.cafe_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF _o.payment_status = 'paid' THEN RETURN jsonb_build_object('id', _o.id, 'already_paid', true); END IF;

  UPDATE public.orders SET payment_status = 'paid', paid_at = now(),
    status = CASE WHEN status = 'placed' THEN 'accepted'::public.order_status ELSE status END
   WHERE id = _order_id;

  -- Award loyalty points on successful payment
  IF _o.customer_user_id IS NOT NULL AND _o.earned_points > 0 THEN
    INSERT INTO public.loyalty_memberships (cafe_id, customer_user_id, loyalty_points, total_visits, last_visit_at)
      VALUES (_o.cafe_id, _o.customer_user_id, _o.earned_points, 0, now())
    ON CONFLICT (cafe_id, customer_user_id) DO UPDATE
      SET loyalty_points = public.loyalty_memberships.loyalty_points + EXCLUDED.loyalty_points;

    INSERT INTO public.loyalty_transactions (cafe_id, customer_user_id, points, type, note, related_order_id)
      VALUES (_o.cafe_id, _o.customer_user_id, _o.earned_points, 'earned', 'Order #' || substr(_o.id::text, 1, 8), _o.id);
  END IF;

  -- Increment visit count: only if this is a new login session and the order is now paid
  IF _o.customer_user_id IS NOT NULL AND _o.login_session IS NOT NULL AND _o.login_session <> '' THEN
    PERFORM public.increment_visit_if_new_session(_o.cafe_id, _o.customer_user_id, _o.login_session);
  END IF;

  RETURN jsonb_build_object('id', _o.id, 'paid', true, 'awarded_points', _o.earned_points);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid) TO authenticated;
