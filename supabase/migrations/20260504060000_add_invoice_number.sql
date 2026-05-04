-- Add invoice_number column to orders for sequential per-cafe invoicing
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_number TEXT;

-- Auto-generate invoice numbers for new orders using a trigger
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _seq INT;
BEGIN
  -- Count existing orders for this cafe to get the next sequence number
  SELECT COUNT(*) + 1 INTO _seq
    FROM public.orders
    WHERE cafe_id = NEW.cafe_id;

  NEW.invoice_number := 'INV-' || LPAD(_seq::TEXT, 6, '0');
  RETURN NEW;
END;
$$;

-- Only set invoice_number on INSERT if it's not already provided
DROP TRIGGER IF EXISTS trg_generate_invoice_number ON public.orders;
CREATE TRIGGER trg_generate_invoice_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL)
  EXECUTE FUNCTION public.generate_invoice_number();

-- Backfill invoice numbers for existing orders that don't have one
DO $$
DECLARE
  _r RECORD;
  _seq INT;
BEGIN
  FOR _r IN
    SELECT id, cafe_id, created_at
      FROM public.orders
      WHERE invoice_number IS NULL
      ORDER BY cafe_id, created_at
  LOOP
    SELECT COUNT(*) INTO _seq
      FROM public.orders
      WHERE cafe_id = _r.cafe_id
        AND invoice_number IS NOT NULL;
    _seq := _seq + 1;
    UPDATE public.orders
      SET invoice_number = 'INV-' || LPAD(_seq::TEXT, 6, '0')
      WHERE id = _r.id;
  END LOOP;
END $$;
