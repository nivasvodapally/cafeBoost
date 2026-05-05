-- Add paid_collected_by to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_collected_by UUID REFERENCES auth.users(id);

-- Create cash_collections table for auditing
CREATE TABLE IF NOT EXISTS public.cash_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id),
  order_id UUID NOT NULL REFERENCES public.orders(id),
  staff_id UUID NOT NULL REFERENCES auth.users(id),
  amount DECIMAL(12,2) NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on cash_collections
ALTER TABLE public.cash_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can see all collections" ON public.cash_collections
  FOR SELECT USING (public.is_cafe_owner(auth.uid(), cafe_id));

CREATE POLICY "Staff can see their own collections" ON public.cash_collections
  FOR SELECT USING (staff_id = auth.uid());

-- Update mark_order_paid to track who collected it
CREATE OR REPLACE FUNCTION public.mark_order_paid(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  _u uuid := auth.uid(); 
  _o record;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  
  -- Auth check (Staff/Owner)
  IF NOT (
    public.is_cafe_owner(_u, _o.cafe_id)
    OR public.has_cafe_staff_role(_u, _o.cafe_id, 'manager')
    OR public.has_cafe_staff_role(_u, _o.cafe_id, 'cashier')
    OR public.has_cafe_staff_role(_u, _o.cafe_id, 'runner')
  ) THEN RAISE EXCEPTION 'Not authorized to collect payment'; END IF;
  
  IF _o.payment_status = 'paid' THEN RETURN jsonb_build_object('id', _order_id, 'paid', true); END IF;
  
  -- Update order
  UPDATE public.orders SET 
    payment_status = 'paid',
    payment_method = 'cash',
    paid_at = now(),
    paid_collected_by = _u,
    updated_at = now()
  WHERE id = _order_id;
  
  -- Record in ledger
  INSERT INTO public.cash_collections (cafe_id, order_id, staff_id, amount)
  VALUES (_o.cafe_id, _o.id, _u, _o.total_amount);
  
  -- Loyalty points (if applicable)
  IF _o.customer_user_id IS NOT NULL AND _o.earned_points > 0 THEN
    INSERT INTO public.loyalty_memberships (cafe_id, customer_user_id, loyalty_points, total_visits, last_visit_at)
    VALUES (_o.cafe_id, _o.customer_user_id, _o.earned_points, 1, now())
    ON CONFLICT (cafe_id, customer_user_id) DO UPDATE
      SET loyalty_points = public.loyalty_memberships.loyalty_points + EXCLUDED.loyalty_points,
          total_visits = public.loyalty_memberships.total_visits + 1,
          last_visit_at = now();
    
    INSERT INTO public.loyalty_transactions (cafe_id, customer_user_id, points, type, note, related_order_id)
    VALUES (_o.cafe_id, _o.customer_user_id, _o.earned_points, 'earned', 'Order #' || upper(left(_o.id::text, 8)), _o.id);
  END IF;
  
  RETURN jsonb_build_object('id', _order_id, 'paid', true, 'collected_by', _u);
END $$;
