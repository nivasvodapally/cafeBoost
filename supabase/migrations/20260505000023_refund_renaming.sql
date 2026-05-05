-- ============================================================
-- FINAL REFUND SYSTEM RENAMING (TO BYPASS CACHE ISSUES)
-- ============================================================

-- 1. Ensure columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_by UUID REFERENCES auth.users(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_requested BOOLEAN DEFAULT false;

-- 2. Customer: initiate_refund_request
CREATE OR REPLACE FUNCTION public.initiate_refund_request(_order_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o RECORD;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Order not found'); END IF;
  
  IF _o.customer_user_id != auth.uid() THEN 
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized'); 
  END IF;

  IF _o.status != 'cancelled' OR _o.payment_status != 'paid' OR _o.refunded_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not eligible for refund');
  END IF;

  UPDATE public.orders
     SET refund_requested = true,
         updated_at = now()
   WHERE id = _order_id;
     
  INSERT INTO public.activity_logs (cafe_id, message, kind)
  VALUES (_o.cafe_id, 'Customer requested refund for Order #' || upper(left(_order_id::text, 8)), 'financial');

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Owner/Staff: finalize_order_refund
CREATE OR REPLACE FUNCTION public.finalize_order_refund(_order_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  _u uuid := auth.uid(); 
  _o record;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  
  -- Explicit permissions check
  IF NOT (
    EXISTS (SELECT 1 FROM public.cafes WHERE id = _o.cafe_id AND owner_user_id = _u)
    OR EXISTS (SELECT 1 FROM public.cafe_staff WHERE cafe_id = _o.cafe_id AND user_id = _u AND role = 'manager' AND status = 'active')
  ) THEN RAISE EXCEPTION 'Permission denied: Manager or Owner access required'; END IF;
  
  IF _o.status != 'cancelled' THEN RAISE EXCEPTION 'Order must be cancelled first'; END IF;
  IF _o.payment_status != 'paid' THEN RAISE EXCEPTION 'No payment found to refund'; END IF;
  IF _o.refunded_at IS NOT NULL THEN RAISE EXCEPTION 'Already refunded'; END IF;

  UPDATE public.orders SET 
    refunded_amount = _o.total_amount,
    refunded_at = now(),
    refunded_by = _u,
    refund_requested = false,
    updated_at = now()
  WHERE id = _order_id;
  
  -- Loyalty Reversal
  IF _o.customer_user_id IS NOT NULL AND _o.earned_points > 0 THEN
    UPDATE public.loyalty_memberships 
       SET loyalty_points = GREATEST(0, loyalty_points - _o.earned_points)
     WHERE cafe_id = _o.cafe_id AND customer_user_id = _o.customer_user_id;
     
    INSERT INTO public.loyalty_transactions (cafe_id, customer_user_id, points, type, note, related_order_id)
    VALUES (_o.cafe_id, _o.customer_user_id, -_o.earned_points, 'redeemed', 'Refund reversal for Order #' || upper(left(_o.id::text, 8)), _o.id);
  END IF;
  
  INSERT INTO public.activity_logs (cafe_id, message, kind)
  VALUES (_o.cafe_id, 'Refund for order #' || upper(left(_o.id::text, 8)) || ' processed', 'financial');
  
  RETURN jsonb_build_object('success', true);
END;
$$;
