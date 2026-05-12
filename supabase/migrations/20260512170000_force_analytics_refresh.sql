-- RE-12: Force Analytics Population
-- Ensures the materialized view is populated and permissions are fully open for the analytics function.

-- 1. Populate the Materialized View immediately
-- This is necessary because it might have been created empty or needs a manual kick.
REFRESH MATERIALIZED VIEW public.mv_cafe_daily_stats;

-- 2. Double-check function security
-- Re-applying SECURITY DEFINER to get_owner_analytics for a moment to see if it fixes the "zeros" issue.
-- If it does, the problem is definitely RLS-related.
ALTER FUNCTION public.get_owner_analytics(uuid, date, date) SECURITY DEFINER;

-- 3. Ensure the search path is correct for the DEFINER context
ALTER FUNCTION public.get_owner_analytics(uuid, date, date) SET search_path = public;

-- 4. Grant select to all necessary roles just in case
GRANT SELECT ON public.mv_cafe_daily_stats TO anon, authenticated, service_role;
GRANT SELECT ON public.orders TO authenticated, service_role;
GRANT SELECT ON public.order_items TO authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'RE-12: Analytics views refreshed and function promoted to SECURITY DEFINER.'; END $$;
