-- Add explicit foreign key from orders.paid_collected_by to profiles
-- This helps Supabase JS client join the tables for historical reports.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_paid_collected_by_fkey,
  ADD CONSTRAINT orders_paid_collected_by_fkey
  FOREIGN KEY (paid_collected_by) REFERENCES public.profiles(user_id);
