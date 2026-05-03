-- Sets payment method preference without marking as paid
-- Called by customer when they choose cash at counter
CREATE OR REPLACE FUNCTION public.set_payment_method(
  _order_id UUID,
  _method TEXT
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.orders
  SET payment_method = _method,
      updated_at = now()
  WHERE id = _order_id
    AND customer_user_id = auth.uid()
    AND payment_status != 'paid';
END;
$$;

-- Add payment_method column if it doesn't exist
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pending';
