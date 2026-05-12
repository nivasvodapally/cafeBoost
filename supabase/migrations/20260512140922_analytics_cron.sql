-- RE-09: Scheduled Analytics Refresh
-- Automatically refreshes the materialized view every 30 minutes.

-- 1. Enable pg_cron extension if not already present
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Schedule the refresh job
-- Note: cron.schedule runs in the 'postgres' database context by default.
-- We target the public.refresh_cafe_analytics() function.
SELECT cron.schedule(
    'refresh-analytics-every-30-min',
    '*/30 * * * *',
    $$ SELECT public.refresh_cafe_analytics() $$
);

DO $$ BEGIN RAISE NOTICE 'RE-09: Analytics refresh job scheduled (30m).'; END $$;
