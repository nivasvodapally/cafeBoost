-- ============================================================
-- SCHEMA FIXES
-- ============================================================

-- FIX 1: Add missing 'runner' role to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'runner';

-- FIX 2: Create missing payment_attempts table
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  status TEXT NOT NULL,
  method TEXT,
  amount NUMERIC(10,2),
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_order ON public.payment_attempts(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_cafe ON public.payment_attempts(cafe_id, created_at DESC);
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_attempts_owner_read" ON public.payment_attempts
  FOR SELECT USING (public.is_cafe_owner(auth.uid(), cafe_id));
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_attempts;

-- FIX 3: Add missing columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS wait_eta_minutes INT,
  ADD COLUMN IF NOT EXISTS eta_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- FIX 4: Add missing columns to cafes
ALTER TABLE public.cafes
  ADD COLUMN IF NOT EXISTS eta_presets JSONB DEFAULT '[5,10,15,20,30]'::jsonb,
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_key_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_key_secret TEXT;

-- FIX 5: Add missing token column to cafe_staff_codes
ALTER TABLE public.cafe_staff_codes
  ADD COLUMN IF NOT EXISTS token TEXT UNIQUE;

-- FIX 6: Add table_no to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS table_no TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID;

-- FIX 7: Add missing RLS policies for staff_shifts and staff_breaks
CREATE POLICY "shifts_self_insert" ON public.staff_shifts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shifts_self_update" ON public.staff_shifts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "breaks_self_insert" ON public.staff_breaks
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "breaks_self_update" ON public.staff_breaks
  FOR UPDATE USING (auth.uid() = user_id);

-- FIX 8: Add missing loyalty_transactions INSERT policy
CREATE POLICY "loyalty_txn_owner_insert" ON public.loyalty_transactions
  FOR INSERT WITH CHECK (public.is_cafe_owner(auth.uid(), cafe_id));

-- FIX 9: Add missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON public.orders(cafe_id, payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay ON public.orders(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_attempts_razorpay ON public.payment_attempts(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;

-- FIX 10: Ensure runner role staff can read/update orders
DROP POLICY IF EXISTS "orders_staff_read" ON public.orders;
CREATE POLICY "orders_staff_read" ON public.orders
  FOR SELECT USING (
    public.is_active_cafe_staff(auth.uid(), cafe_id)
    OR auth.uid() = customer_user_id
    OR public.is_cafe_owner(auth.uid(), cafe_id)
  );

DROP POLICY IF EXISTS "orders_staff_update" ON public.orders;
CREATE POLICY "orders_staff_update" ON public.orders
  FOR UPDATE USING (
    public.is_cafe_owner(auth.uid(), cafe_id)
    OR public.is_active_cafe_staff(auth.uid(), cafe_id)
  );
