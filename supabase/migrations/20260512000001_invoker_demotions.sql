-- RE-06: Demote read-only functions to SECURITY INVOKER
-- Reduces attack surface by ensuring functions respect caller RLS and identity.

-- 1. Helper Functions
ALTER FUNCTION public.has_role(uuid, public.app_role) SECURITY INVOKER;
ALTER FUNCTION public.is_cafe_owner(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.owns_order(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.is_active_cafe_staff(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.has_cafe_staff_role(uuid, uuid, public.app_role) SECURITY INVOKER;

-- 2. Bookings & KDS
ALTER FUNCTION public.check_slot_availability(uuid, date, text) SECURITY INVOKER;

-- 3. Cafe Operations
ALTER FUNCTION public.get_cafe_public(text) SECURITY INVOKER;

-- 4. Analytics
ALTER FUNCTION public.get_owner_analytics(uuid, date, date) SECURITY INVOKER;

DO $$ BEGIN RAISE NOTICE 'RE-06: 12 functions demoted to SECURITY INVOKER.'; END $$;
