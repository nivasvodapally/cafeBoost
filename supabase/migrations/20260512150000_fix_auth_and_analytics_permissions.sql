-- RE-10: Fix Auth Recursion and Analytics Permissions
-- Reverts critical auth functions to SECURITY DEFINER to avoid RLS recursion.
-- Grants necessary permissions for analytics materialized view.

-- 1. Revert has_role to SECURITY DEFINER
-- This is critical because has_role is used in the RLS policy for the user_roles table itself.
-- If it is SECURITY INVOKER, it causes infinite recursion when checking a user's roles.
ALTER FUNCTION public.has_role(uuid, public.app_role) SECURITY DEFINER;

-- 2. Revert is_cafe_owner to SECURITY DEFINER (for safety)
-- While not strictly recursing in its own table, it is often used in complex policies
-- and is safer as a definer function to avoid permission bottlenecks during login.
ALTER FUNCTION public.is_cafe_owner(uuid, uuid) SECURITY DEFINER;

-- 3. Ensure analytics view is accessible to owners
-- Since get_owner_analytics is SECURITY INVOKER, the caller must have SELECT on the view.
GRANT SELECT ON public.mv_cafe_daily_stats TO authenticated;
GRANT SELECT ON public.mv_cafe_daily_stats TO service_role;

-- 4. Ensure refresh function is executable
GRANT EXECUTE ON FUNCTION public.refresh_cafe_analytics() TO authenticated;
ALTER FUNCTION public.refresh_cafe_analytics() SECURITY DEFINER;

-- 5. Fix potentially missing roles during sign-up/login
-- Ensure the analytics functions don't crash if the view is empty
CREATE OR REPLACE FUNCTION public.get_owner_analytics(
    _cafe_id UUID,
    _start DATE,
    _end DATE
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    _kpis JSONB;
    _series JSONB;
    _top JSONB;
    _prep_time NUMERIC;
    _cancel_rate NUMERIC;
BEGIN
    IF NOT public.is_cafe_owner(auth.uid(), _cafe_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;

    -- KPIs (using Materialized View)
    SELECT JSONB_BUILD_OBJECT(
        'orders',        COALESCE(SUM(total_orders), 0),
        'paid_orders',   COALESCE(SUM(paid_orders), 0),
        'pending_orders',COALESCE(SUM(total_orders - paid_orders - cancelled_orders), 0),
        'revenue',       COALESCE(SUM(revenue), 0),
        'avg_ticket',    COALESCE(AVG(avg_ticket), 0),
        'new_customers', (SELECT COUNT(DISTINCT customer_user_id) FROM public.orders
                          WHERE cafe_id = _cafe_id AND customer_user_id IS NOT NULL
                            AND created_at::date BETWEEN _start AND _end
                            AND customer_user_id NOT IN (
                              SELECT customer_user_id FROM public.orders
                              WHERE cafe_id = _cafe_id AND customer_user_id IS NOT NULL
                                AND created_at::date < _start
                            ))
    ) INTO _kpis FROM public.mv_cafe_daily_stats
    WHERE cafe_id = _cafe_id AND stat_date BETWEEN _start AND _end;

    -- Revenue & orders series (using Materialized View)
    SELECT JSONB_AGG(x ORDER BY x.d) INTO _series
    FROM (
        SELECT JSONB_BUILD_OBJECT(
            'date', d::date,
            'orders', COALESCE(o.total_orders, 0),
            'revenue', COALESCE(o.revenue, 0)
        ) AS x
        FROM generate_series(_start, _end, INTERVAL '1 day') d
        LEFT JOIN public.mv_cafe_daily_stats o ON o.stat_date = d::date AND o.cafe_id = _cafe_id
    ) sub;

    -- Average preparation time
    SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ready_at - accepted_at)) / 60), 1)
    INTO _prep_time
    FROM public.orders
    WHERE cafe_id = _cafe_id
      AND created_at::date BETWEEN _start AND _end
      AND ready_at IS NOT NULL AND accepted_at IS NOT NULL
      AND status NOT IN ('cancelled');

    -- Cancellation rate
    SELECT ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'cancelled') / NULLIF(COUNT(*), 0), 2
    ) INTO _cancel_rate
    FROM public.orders
    WHERE cafe_id = _cafe_id AND created_at::date BETWEEN _start AND _end;

    -- Top items
    SELECT JSONB_AGG(x ORDER BY x.qty DESC) INTO _top
    FROM (
        SELECT JSONB_BUILD_OBJECT(
            'name', name,
            'qty', qty,
            'revenue', rev
        ) AS x
        FROM (
            SELECT oi.name,
                   SUM(oi.quantity) AS qty,
                   SUM(oi.quantity * oi.price) AS rev
              FROM public.order_items oi
              JOIN public.orders o ON o.id = oi.order_id
             WHERE o.cafe_id = _cafe_id AND o.created_at::date BETWEEN _start AND _end
               AND o.status NOT IN ('cancelled')
             GROUP BY oi.name
             ORDER BY qty DESC
             LIMIT 10
        ) t
    ) sub;

    RETURN JSONB_BUILD_OBJECT(
        'kpis', COALESCE(_kpis, '{"orders":0, "revenue":0}'::jsonb),
        'series', COALESCE(_series, '[]'::jsonb),
        'top_items', COALESCE(_top, '[]'::jsonb),
        'avg_prep_time_minutes', COALESCE(_prep_time, 0),
        'cancellation_rate', COALESCE(_cancel_rate, 0)
    );
END;
$$;

DO $$ BEGIN RAISE NOTICE 'RE-10: Auth recursion fixed and analytics permissions granted.'; END $$;
