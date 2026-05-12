-- RE-07: Harden Profile Access (Fix A)
-- Prevents global profile leak where any cafe owner can see all customer profiles.
-- Restricts visibility to only those customers who have interacted with the owner's cafe.

DROP POLICY IF EXISTS "profiles_owner_read" ON public.profiles;

CREATE POLICY "profiles_owner_read" ON public.profiles FOR SELECT 
USING (
  public.has_role(auth.uid(), 'owner') 
  AND (
    -- Only allow seeing profiles of customers who have actually interacted with THEIR cafe
    EXISTS (SELECT 1 FROM public.orders WHERE customer_user_id = profiles.user_id AND cafe_id IN (SELECT id FROM public.cafes WHERE owner_user_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.bookings WHERE customer_user_id = profiles.user_id AND cafe_id IN (SELECT id FROM public.cafes WHERE owner_user_id = auth.uid()))
  )
);

DO $$ BEGIN RAISE NOTICE 'RLS Profile Hardening (Fix A) applied.'; END $$;
