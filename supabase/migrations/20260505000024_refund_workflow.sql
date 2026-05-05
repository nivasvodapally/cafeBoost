-- ============================================================
-- REFUND WORKFLOW ENHANCEMENT
-- ============================================================

-- 1. Enum for refund lifecycle
DO $$ BEGIN
    CREATE TYPE public.refund_status AS ENUM ('none', 'requested', 'refunded', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add columns to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_workflow_status public.refund_status DEFAULT 'none';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_rejection_reason TEXT;

-- 3. Update existing data (best effort)
UPDATE public.orders SET refund_workflow_status = 'requested' WHERE refund_requested = true AND refunded_at IS NULL;
UPDATE public.orders SET refund_workflow_status = 'refunded' WHERE refunded_at IS NOT NULL;

-- 4. RPC for Owner to Deny Refund
CREATE OR REPLACE FUNCTION public.deny_refund_request(_order_id UUID, _reason TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  _u uuid := auth.uid(); 
  _o record;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  
  -- Permission check
  IF NOT (
    EXISTS (SELECT 1 FROM public.cafes WHERE id = _o.cafe_id AND owner_user_id = _u)
    OR EXISTS (SELECT 1 FROM public.cafe_staff WHERE cafe_id = _o.cafe_id AND user_id = _u AND role = 'manager' AND status = 'active')
  ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE public.orders SET 
    refund_workflow_status = 'rejected',
    refund_rejection_reason = _reason,
    refund_requested = false,
    updated_at = now()
  WHERE id = _order_id;
  
  INSERT INTO public.activity_logs (cafe_id, message, kind)
  VALUES (_o.cafe_id, 'Refund request REJECTED for order #' || upper(left(_order_id::text, 8)), 'financial');

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. Update finalize_order_refund to use the new status
CREATE OR REPLACE FUNCTION public.finalize_order_refund(_order_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  _u uuid := auth.uid(); 
  _o record;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  
  IF NOT (
    EXISTS (SELECT 1 FROM public.cafes WHERE id = _o.cafe_id AND owner_user_id = _u)
    OR EXISTS (SELECT 1 FROM public.cafe_staff WHERE cafe_id = _o.cafe_id AND user_id = _u AND role = 'manager' AND status = 'active')
  ) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  
  IF _o.status != 'cancelled' OR _o.payment_status != 'paid' OR _o.refunded_at IS NOT NULL THEN
    RAISE EXCEPTION 'Order not eligible for refund';
  END IF;

  UPDATE public.orders SET 
    refunded_amount = _o.total_amount,
    refunded_at = now(),
    refunded_by = _u,
    refund_requested = false,
    refund_workflow_status = 'refunded',
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
  VALUES (_o.cafe_id, 'Refund for order #' || upper(left(_o.id::text, 8)) || ' approved & processed', 'financial');
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. Update initiate_refund_request to use the new status
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
    RETURN jsonb_build_object('success', false, 'error', 'Order not eligible');
  END IF;

  UPDATE public.orders
     SET refund_requested = true,
         refund_workflow_status = 'requested',
         updated_at = now()
   WHERE id = _order_id;
     
  INSERT INTO public.activity_logs (cafe_id, message, kind)
  VALUES (_o.cafe_id, 'Customer requested refund for Order #' || upper(left(_order_id::text, 8)), 'financial');

  RETURN jsonb_build_object('success', true);
END;
$$;
