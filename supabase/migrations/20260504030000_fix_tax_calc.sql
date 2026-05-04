-- Fix tax calculation bug where tax_rate was not divided by 100
CREATE OR REPLACE FUNCTION public.place_order_and_update_loyalty(
  _cafe_id uuid, _customer_user_id uuid, _customer_name text, _customer_phone text,
  _notes text, _source public.order_source, _table_no text, _items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _order_id uuid; _subtotal numeric := 0; _tax_rate numeric := 0;
  _tax_amount numeric := 0; _total numeric := 0; _accept_online boolean;
  _ppc numeric := 0; _earned integer := 0; _line jsonb; _item record; _qty integer;
BEGIN
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
    notes, source, table_no, subtotal, tax_amount, total_amount, earned_points, status, payment_status)
  VALUES (_cafe_id, _customer_user_id, _customer_name, _customer_phone, _notes,
    COALESCE(_source,'app'), _table_no, _subtotal, _tax_amount, _total, _earned, 'placed', 'pending')
  RETURNING id INTO _order_id;

  INSERT INTO public.order_items (order_id, menu_item_id, name, price, quantity)
  SELECT _order_id, menu_item_id, name, price, quantity FROM _resolved_items;

  RETURN jsonb_build_object('id', _order_id, 'subtotal', _subtotal, 'tax_amount', _tax_amount,
    'total_amount', _total, 'earned_points', _earned);
END;
$$;
