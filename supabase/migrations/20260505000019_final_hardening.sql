-- ============================================================
-- FINAL PRODUCTION HARDENING (2026-05-05)
-- ============================================================

-- 1. Tighten the Invisible Order Logic
-- Ensure payment_method starts as NULL so orders stay off the staff board 
-- until the customer explicitly selects Cash or Online.
ALTER TABLE public.orders ALTER COLUMN payment_method DROP DEFAULT;
UPDATE public.orders SET payment_method = NULL WHERE payment_method = 'pending' AND status = 'placed';

-- 2. Add Database-Level Payment Gate for Completion
-- Even if someone bypasses the UI, the database will refuse to complete an unpaid order.
CREATE OR REPLACE FUNCTION public.advance_order_workflow(_order_id uuid, _next_status order_status)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user uuid := auth.uid(); _o RECORD; _action text;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  -- PAYMENT GATE: Absolute requirement for completion
  IF _next_status = 'completed' AND _o.payment_status != 'paid' THEN
    RAISE EXCEPTION 'Security Error: Order #% must be paid before it can be marked as completed.', upper(left(_order_id::text, 8));
  END IF;

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
  ) THEN RAISE EXCEPTION 'Invalid workflow transition from % to %', _o.status, _next_status; END IF;

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
         completed_at= CASE WHEN _next_status = 'completed' THEN now() ELSE completed_at END,
         updated_at  = now()
   WHERE id = _order_id;

  RETURN jsonb_build_object('id', _order_id, 'status', _next_status);
END $$;

-- 3. Audit Logging
INSERT INTO public.activity_logs (cafe_id, message, kind)
SELECT id, 'Production payment gating and audit tracking enabled.', 'security'
FROM public.cafes;
