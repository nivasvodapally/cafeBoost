CREATE OR REPLACE FUNCTION public.mark_order_paid(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _o record;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT (
    public.is_cafe_owner(auth.uid(), _o.cafe_id)
    OR public.has_cafe_staff_role(auth.uid(), _o.cafe_id, 'manager')
    OR public.has_cafe_staff_role(auth.uid(), _o.cafe_id, 'cashier')
  ) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF _o.payment_status = 'paid' THEN RETURN jsonb_build_object('id', _o.id, 'already_paid', true); END IF;

  UPDATE public.orders SET payment_status = 'paid', paid_at = now(),
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