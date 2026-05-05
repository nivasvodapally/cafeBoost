-- Add secure customer cancellation RPC
CREATE OR REPLACE FUNCTION public.cancel_order_by_customer(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid(); _o record;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  
  -- Check ownership
  IF _o.customer_user_id IS NULL OR _o.customer_user_id != _u THEN
    RAISE EXCEPTION 'Not authorized to cancel this order';
  END IF;
  
  -- Allowed ONLY before "preparing"
  IF _o.status NOT IN ('placed', 'accepted') THEN
    RAISE EXCEPTION 'Order cannot be cancelled once it is in preparation or ready';
  END IF;
  
  -- Update status
  UPDATE public.orders SET status = 'cancelled', updated_at = now() WHERE id = _order_id;
  
  RETURN jsonb_build_object('id', _order_id, 'status', 'cancelled');
END $$;
