-- PHASE 1: Order Flow Refinement Features
-- Adds support for order modification, splitting, and priority
-- Created: 2026-05-07

-- Create order_priority enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_priority') THEN
    CREATE TYPE public.order_priority AS ENUM ('low', 'normal', 'high', 'vip');
  END IF;
END $$;

-- 1. Add order priority column
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS priority public.order_priority DEFAULT 'normal';

-- 2. Add columns for order modification tracking
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS original_order_id UUID REFERENCES public.orders(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS modification_reason TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES auth.users(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ;

-- 3. Add columns for order splitting
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS split_parent_id UUID REFERENCES public.orders(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS split_sequence INTEGER DEFAULT 1;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS split_total_count INTEGER DEFAULT 1;

-- 4. Add column for modification window (minutes allowed for modification)
ALTER TABLE public.cafes ADD COLUMN IF NOT EXISTS order_modification_window_minutes INTEGER DEFAULT 5;

-- 5. Create function to check if order can be modified
CREATE OR REPLACE FUNCTION public.can_modify_order(order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order_status public.order_status;
  _order_created_at TIMESTAMPTZ;
  _cafe_mod_window INTEGER;
  _minutes_passed INTEGER;
BEGIN
  -- Get order status and creation time
  SELECT status, created_at INTO _order_status, _order_created_at
  FROM public.orders WHERE id = order_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Orders can only be modified if status is 'placed' (not yet accepted)
  IF _order_status != 'placed' THEN
    RETURN FALSE;
  END IF;
  
  -- Get cafe's modification window
  SELECT COALESCE(order_modification_window_minutes, 5) INTO _cafe_mod_window
  FROM public.cafes c
  JOIN public.orders o ON o.cafe_id = c.id
  WHERE o.id = order_id;
  
  -- Calculate minutes passed since order creation
  _minutes_passed := EXTRACT(EPOCH FROM (NOW() - _order_created_at)) / 60;
  
  -- Check if within modification window
  RETURN _minutes_passed <= _cafe_mod_window;
END;
$$;

-- 6. Create function to modify an order
CREATE OR REPLACE FUNCTION public.modify_order(
  order_id UUID,
  new_items JSONB,
  modification_reason TEXT DEFAULT NULL,
  modified_by_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cafe_id UUID;
  _customer_user_id UUID;
  _customer_name TEXT;
  _customer_phone TEXT;
  _table_no TEXT;
  _notes TEXT;
  _new_order_id UUID;
BEGIN
  -- Check if order can be modified
  IF NOT public.can_modify_order(order_id) THEN
    RAISE EXCEPTION 'Order cannot be modified. It may have already been accepted or the modification window has expired.';
  END IF;
  
  -- Get order details
  SELECT cafe_id, customer_user_id, customer_name, customer_phone, table_no, notes
  INTO _cafe_id, _customer_user_id, _customer_name, _customer_phone, _table_no, _notes
  FROM public.orders WHERE id = order_id;
  
  -- Create new order with same details
  INSERT INTO public.orders (
    cafe_id,
    customer_user_id,
    customer_name,
    customer_phone,
    status,
    payment_status,
    source,
    table_no,
    subtotal,
    tax_amount,
    total_amount,
    notes,
    original_order_id,
    modification_reason,
    modified_by
  )
  SELECT 
    cafe_id,
    customer_user_id,
    customer_name,
    customer_phone,
    'placed', -- Reset to placed
    'pending', -- Reset payment status
    source,
    table_no,
    0, -- Will be calculated from items
    0, -- Will be calculated from items
    0, -- Will be calculated from items
    notes,
    order_id, -- Reference to original order
    modification_reason,
    modified_by_user_id
  FROM public.orders WHERE id = order_id
  RETURNING id INTO _new_order_id;
  
  -- Mark original order as cancelled due to modification
  UPDATE public.orders 
  SET status = 'cancelled',
      notes = COALESCE(notes || ' ', '') || 'Cancelled due to modification. Replaced by order ' || _new_order_id
  WHERE id = order_id;
  
  -- TODO: Insert new order items from new_items JSONB
  -- This would require parsing the JSONB and inserting into order_items
  
  RETURN _new_order_id;
END;
$$;

-- 7. Create function to split an order
CREATE OR REPLACE FUNCTION public.split_order(
  order_id UUID,
  split_instructions JSONB -- e.g., [{"items": [1,2], "payments": []}, {"items": [3,4], "payments": []}]
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cafe_id UUID;
  _customer_user_id UUID;
  _customer_name TEXT;
  _customer_phone TEXT;
  _table_no TEXT;
  _notes TEXT;
  _split_count INTEGER;
  _new_order_ids UUID[];
  _split_idx INTEGER;
  _instruction JSONB;
BEGIN
  -- Get order details
  SELECT cafe_id, customer_user_id, customer_name, customer_phone, table_no, notes
  INTO _cafe_id, _customer_user_id, _customer_name, _customer_phone, _table_no, _notes
  FROM public.orders WHERE id = order_id;
  
  -- Get split count from instructions
  _split_count := jsonb_array_length(split_instructions);
  
  -- Create new orders for each split
  FOR _split_idx IN 0..(_split_count - 1) LOOP
    _instruction := split_instructions->_split_idx;
    
    INSERT INTO public.orders (
      cafe_id,
      customer_user_id,
      customer_name,
      customer_phone,
      status,
      payment_status,
      source,
      table_no,
      subtotal,
      tax_amount,
      total_amount,
      notes,
      split_parent_id,
      split_sequence,
      split_total_count
    )
    VALUES (
      _cafe_id,
      _customer_user_id,
      _customer_name,
      _customer_phone,
      'placed',
      'pending',
      'app',
      _table_no,
      0, -- Will be calculated
      0, -- Will be calculated
      0, -- Will be calculated
      _notes || ' (Split part ' || (_split_idx + 1) || ' of ' || _split_count || ')',
      order_id,
      _split_idx + 1,
      _split_count
    )
    RETURNING id INTO _new_order_ids[_split_idx + 1];
    
    -- TODO: Copy relevant order items based on split_instructions
  END LOOP;
  
  -- Mark original order as cancelled (replaced by splits)
  UPDATE public.orders 
  SET status = 'cancelled',
      notes = COALESCE(notes || ' ', '') || 'Split into ' || _split_count || ' orders.'
  WHERE id = order_id;
  
  RETURN _new_order_ids;
END;
$$;

-- 8. Add RLS policy for order modification (customers can modify their own orders)
DROP POLICY IF EXISTS "Customers can modify their own orders" ON public.orders;
CREATE POLICY "Customers can modify their own orders" ON public.orders
  FOR UPDATE USING (
    auth.uid() = customer_user_id 
    AND status = 'placed'
    AND public.can_modify_order(id)
  );

-- 9. Create index for better performance on order modification checks
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON public.orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_split_parent ON public.orders(split_parent_id) WHERE split_parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_original_order ON public.orders(original_order_id) WHERE original_order_id IS NOT NULL;

-- 10. Update default cafe settings to have 5-minute modification window
UPDATE public.cafes SET order_modification_window_minutes = 5 WHERE order_modification_window_minutes IS NULL;

COMMENT ON COLUMN public.orders.priority IS 'Order priority: low, normal, high, vip';
COMMENT ON COLUMN public.orders.original_order_id IS 'Reference to original order if this is a modification';
COMMENT ON COLUMN public.orders.modification_reason IS 'Reason for modification';
COMMENT ON COLUMN public.orders.split_parent_id IS 'Parent order ID if this order is part of a split';
COMMENT ON COLUMN public.orders.split_sequence IS 'Sequence number in split (1-based)';
COMMENT ON COLUMN public.orders.split_total_count IS 'Total number of orders in the split';
COMMENT ON COLUMN public.cafes.order_modification_window_minutes IS 'Minutes after placement during which customers can modify orders';