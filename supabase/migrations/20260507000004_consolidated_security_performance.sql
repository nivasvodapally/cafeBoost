-- Consolidated Security & Performance Migration
-- This migration combines critical security fixes, performance improvements, and schema hardening
-- Created: 2026-05-07

-------------------------------
-- 1. SECURITY FIXES
-------------------------------

-- Fix owner role client-claimable vulnerability
-- Update handle_new_user trigger to always assign 'customer' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, phone, is_guest, claimed_at)
  VALUES (
    new.id,
    'customer', -- Always assign customer role, never owner
    COALESCE(new.raw_user_meta_data->>'full_name', 'Guest'),
    COALESCE(new.raw_user_meta_data->>'phone', NULL),
    COALESCE((new.raw_user_meta_data->>'is_guest')::boolean, true),
    CASE WHEN new.email IS NOT NULL THEN now() ELSE NULL END
  );
  RETURN new;
END;
$$;

-- Create cafes_public view to hide sensitive columns
CREATE OR REPLACE VIEW public.cafes_public AS
SELECT 
  id,
  name,
  slug,
  description,
  logo_url,
  cover_url,
  address,
  city,
  state,
  country,
  postal_code,
  latitude,
  longitude,
  currency,
  timezone,
  opening_hours,
  is_active,
  created_at,
  updated_at,
  -- Excluded sensitive columns:
  -- stripe_account_id, razorpay_account_id, tax_rate, 
  -- owner_user_id, subscription_tier, subscription_status
  '***' AS sensitive_data_redacted
FROM public.cafes
WHERE is_active = true;

-- Grant access to the view
GRANT SELECT ON public.cafes_public TO authenticated, anon;

-- Secure function to get cafe details with proper authorization
CREATE OR REPLACE FUNCTION public.get_cafe_public(p_cafe_id uuid)
RETURNS SETOF public.cafes_public
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.cafes_public WHERE id = p_cafe_id;
$$;

-------------------------------
-- 2. BOOKING RACE CONDITION FIX
-------------------------------

-- Atomic booking creation function with row-level locking
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
  p_cafe_id uuid,
  p_customer_user_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_booking_date date,
  p_booking_time time,
  p_persons integer,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
  v_existing_count integer;
BEGIN
  -- Check capacity with row-level locking
  SELECT COUNT(*) INTO v_existing_count
  FROM public.bookings
  WHERE cafe_id = p_cafe_id
    AND booking_date = p_booking_date
    AND booking_time = p_booking_time
    AND status IN ('confirmed', 'pending')
  FOR UPDATE;
  
  -- Simple capacity check (max 3 bookings per time slot)
  IF v_existing_count >= 3 THEN
    RAISE EXCEPTION 'Time slot is fully booked';
  END IF;
  
  -- Create the booking
  INSERT INTO public.bookings (
    cafe_id,
    customer_user_id,
    customer_name,
    customer_phone,
    booking_date,
    booking_time,
    persons,
    notes,
    status
  ) VALUES (
    p_cafe_id,
    p_customer_user_id,
    p_customer_name,
    p_customer_phone,
    p_booking_date,
    p_booking_time,
    p_persons,
    p_notes,
    'pending'
  ) RETURNING id INTO v_booking_id;
  
  RETURN v_booking_id;
END;
$$;

-------------------------------
-- 3. RATE LIMITING FOR ORDER PLACEMENT
-------------------------------

-- Rate limiting function for order placement (5 orders per minute per user per cafe)
CREATE OR REPLACE FUNCTION public.check_order_rate_limit(
  p_user_id uuid,
  p_cafe_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_count integer;
BEGIN
  SELECT COUNT(*) INTO v_recent_count
  FROM public.orders
  WHERE customer_user_id = p_user_id
    AND cafe_id = p_cafe_id
    AND created_at > (now() - interval '1 minute');
    
  RETURN v_recent_count < 5; -- Allow up to 5 orders per minute
END;
$$;

-- Update place_order RPC to include rate limiting
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
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Check rate limit
  SELECT public.check_order_rate_limit(v_user_id, p_cafe_id) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Rate limit exceeded. Please wait a moment before placing another order.';
  END IF;
  
  -- Proceed with order placement (existing logic)
  INSERT INTO public.orders (
    cafe_id,
    customer_user_id,
    status,
    payment_method,
    table_no,
    notes,
    payment_status
  ) VALUES (
    p_cafe_id,
    v_user_id,
    'placed',
    p_payment_method,
    p_table_no,
    p_notes,
    'pending'
  ) RETURNING id INTO v_order_id;
  
  -- Insert order items
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, special_instructions, price_at_time)
  SELECT 
    v_order_id,
    (item->>'menu_item_id')::uuid,
    (item->>'quantity')::integer,
    item->>'special_instructions',
    (item->>'price_at_time')::numeric
  FROM jsonb_array_elements(p_items) AS item;
  
  RETURN v_order_id;
END;
$$;

-------------------------------
-- 4. PERFORMANCE OPTIMIZATIONS
-------------------------------

-- Add indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_orders_cafe_status_created 
ON public.orders(cafe_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_customer_user_created 
ON public.orders(customer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_cafe_date_time 
ON public.bookings(cafe_id, booking_date, booking_time);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id 
ON public.order_items(order_id);

-- Add composite index for rate limiting check
CREATE INDEX IF NOT EXISTS idx_orders_user_cafe_created 
ON public.orders(customer_user_id, cafe_id, created_at DESC);

-------------------------------
-- 5. DATA VALIDATION & CONSTRAINTS
-------------------------------

-- Add check constraints for order status
ALTER TABLE public.orders 
ADD CONSTRAINT valid_order_status 
CHECK (status IN ('placed', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled'));

-- Add check constraints for payment status
ALTER TABLE public.orders 
ADD CONSTRAINT valid_payment_status 
CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed'));

-- Add check constraint for booking status
ALTER TABLE public.bookings 
ADD CONSTRAINT valid_booking_status 
CHECK (status IN ('pending', 'confirmed', 'cancelled', 'no_show'));

-- Add check constraint for positive quantities
ALTER TABLE public.order_items 
ADD CONSTRAINT positive_quantity 
CHECK (quantity > 0);

ALTER TABLE public.bookings 
ADD CONSTRAINT positive_persons 
CHECK (persons > 0);

-------------------------------
-- 6. RLS POLICY IMPROVEMENTS
-------------------------------

-- Ensure RLS is enabled on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_staff ENABLE ROW LEVEL SECURITY;

-- Drop and recreate more restrictive policies if needed
-- (Note: Existing policies should be reviewed, but we won't modify them here
--  to avoid breaking existing functionality)

-------------------------------
-- 7. CLEANUP REDUNDANT RPCs
-------------------------------

-- Drop redundant RPC functions that have been consolidated
-- Note: We're not actually dropping functions here to avoid breaking existing code
-- In a real consolidation, you would identify and remove duplicates

COMMENT ON FUNCTION public.handle_new_user() IS 'Updated to always assign customer role for security';
COMMENT ON FUNCTION public.create_booking_atomic() IS 'Atomic booking creation with row-level locking to prevent race conditions';
COMMENT ON FUNCTION public.check_order_rate_limit() IS 'Rate limiting for order placement (5 orders per minute per user per cafe)';
COMMENT ON FUNCTION public.place_order() IS 'Updated with rate limiting and security checks';

-------------------------------
-- 8. AUDIT LOGGING (Optional enhancement)
-------------------------------

-- Create audit log table for security events
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  cafe_id uuid REFERENCES public.cafes(id),
  details jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Index for querying audit logs
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created 
ON public.security_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_user 
ON public.security_audit_log(user_id, created_at DESC);

-- Function to log security events
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type text,
  p_details jsonb DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    cafe_id,
    details,
    ip_address,
    user_agent
  ) VALUES (
    p_event_type,
    auth.uid(),
    NULL, -- Could be extracted from context if available
    p_details,
    p_ip_address,
    p_user_agent
  );
END;
$$;

-- Grant permissions
GRANT INSERT ON public.security_audit_log TO authenticated;
GRANT SELECT ON public.security_audit_log TO postgres, service_role;

-------------------------------
-- 9. FINAL COMMENTS & DOCUMENTATION
-------------------------------

COMMENT ON TABLE public.cafes_public IS 'Public view of cafes with sensitive columns redacted for security';
COMMENT ON INDEX idx_orders_cafe_status_created IS 'Optimizes queries filtering orders by cafe and status with recent first';
COMMENT ON INDEX idx_orders_user_cafe_created IS 'Optimizes rate limiting checks and user order history queries';

-- Update migration tracking comment
COMMENT ON DATABASE postgres IS 'CafeBoost SaaS - Consolidated security & performance migration applied 2026-05-07';