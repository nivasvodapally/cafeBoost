-- RE-11: Implement Full Hybrid Analytics
-- Merges Materialized View (History) + Live Data (Today)
-- Restores all missing fields (staff, peak hours, LTV, etc.)

CREATE OR REPLACE FUNCTION public.get_owner_analytics(
    _cafe_id UUID,
    _start DATE,
    _end DATE
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    _kpis JSONB;
    _series JSONB;
    _top JSONB;
    _staff JSONB;
    _peak JSONB;
    _prep_time NUMERIC;
    _cancel_rate NUMERIC;
    _ltv NUMERIC;
    _growth NUMERIC;
    _dow JSONB;
    _today DATE := CURRENT_DATE;
BEGIN
    IF NOT public.is_cafe_owner(auth.uid(), _cafe_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;

    -- KPIs: Hybrid (MV for history + Live for today)
    WITH kpi_source AS (
        -- Past data from Materialized View
        SELECT 
            SUM(total_orders) AS orders,
            SUM(paid_orders) AS paid,
            SUM(total_orders - paid_orders - cancelled_orders) AS pending,
            SUM(revenue) AS rev,
            SUM(revenue) / NULLIF(SUM(paid_orders), 0) AS ticket
        FROM public.mv_cafe_daily_stats
        WHERE cafe_id = _cafe_id AND stat_date BETWEEN _start AND LEAST(_end, _today - 1)
        
        UNION ALL
        
        -- Today's data (Live)
        SELECT 
            COUNT(*) FILTER (WHERE status NOT IN ('cancelled')) AS orders,
            COUNT(*) FILTER (WHERE payment_status = 'paid') AS paid,
            COUNT(*) FILTER (WHERE payment_status = 'pending' AND status NOT IN ('cancelled')) AS pending,
            COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0) AS rev,
            COALESCE(AVG(total_amount) FILTER (WHERE payment_status = 'paid'), 0) AS ticket
        FROM public.orders
        WHERE cafe_id = _cafe_id AND created_at::date = _today AND _end >= _today
    )
    SELECT JSONB_BUILD_OBJECT(
        'orders',        COALESCE(SUM(orders), 0),
        'paid_orders',   COALESCE(SUM(paid), 0),
        'pending_orders',COALESCE(SUM(pending), 0),
        'revenue',       COALESCE(SUM(rev), 0),
        'avg_ticket',    COALESCE(AVG(ticket), 0),
        'new_customers', (SELECT COUNT(DISTINCT customer_user_id) FROM public.orders
                          WHERE cafe_id = _cafe_id AND customer_user_id IS NOT NULL
                            AND created_at::date BETWEEN _start AND _end
                            AND customer_user_id NOT IN (
                              SELECT customer_user_id FROM public.orders
                              WHERE cafe_id = _cafe_id AND customer_user_id IS NOT NULL
                                AND created_at::date < _start
                            ))
    ) INTO _kpis FROM kpi_source;

    -- Revenue & orders series (Hybrid)
    SELECT JSONB_AGG(x ORDER BY x.d) INTO _series
    FROM (
        SELECT JSONB_BUILD_OBJECT(
            'date', d::date,
            'orders', COALESCE(
                CASE WHEN d::date = _today THEN (SELECT COUNT(*) FROM public.orders WHERE cafe_id = _cafe_id AND created_at::date = _today AND status != 'cancelled')
                     ELSE (SELECT total_orders FROM public.mv_cafe_daily_stats WHERE cafe_id = _cafe_id AND stat_date = d::date)
                END, 0),
            'revenue', COALESCE(
                CASE WHEN d::date = _today THEN (SELECT SUM(total_amount) FROM public.orders WHERE cafe_id = _cafe_id AND created_at::date = _today AND payment_status = 'paid')
                     ELSE (SELECT revenue FROM public.mv_cafe_daily_stats WHERE cafe_id = _cafe_id AND stat_date = d::date)
                END, 0)
        ) AS x
        FROM generate_series(_start, _end, INTERVAL '1 day') d
    ) sub;

    -- Staff performance (Dynamic)
    SELECT COALESCE(JSONB_AGG(st ORDER BY st.orders_handled DESC), '[]'::jsonb) INTO _staff
    FROM (
        SELECT JSONB_BUILD_OBJECT(
            'role', sa.role,
            'staff_name', COALESCE(p.full_name, 'Staff'),
            'orders_handled', COUNT(o.id) FILTER (WHERE o.status IN ('completed','served','ready')),
            'avg_prep_minutes', ROUND(AVG(
                EXTRACT(EPOCH FROM (o.ready_at - o.accepted_at)) / 60
            ) FILTER (WHERE o.ready_at IS NOT NULL AND o.accepted_at IS NOT NULL), 1)
        ) AS st
        FROM public.cafe_staff sa
        JOIN public.profiles p ON p.id = sa.user_id
        LEFT JOIN public.orders o ON o.cafe_id = sa.cafe_id
            AND o.created_at::date BETWEEN _start AND _end
            AND o.status IN ('completed','served','ready')
        WHERE sa.cafe_id = _cafe_id AND sa.status = 'active'
        GROUP BY sa.role, p.full_name
        HAVING COUNT(o.id) > 0
    ) sub;

    -- Peak hours (Dynamic)
    SELECT COALESCE(JSONB_AGG(x ORDER BY x.hour ASC), '[]'::jsonb) INTO _peak
    FROM (
        SELECT JSONB_BUILD_OBJECT(
            'slot', CASE
                WHEN h < 12 THEN 'Morning'
                WHEN h < 17 THEN 'Afternoon'
                WHEN h < 21 THEN 'Evening'
                ELSE 'Late'
            END,
            'hour', h,
            'orders', cnt,
            'revenue', COALESCE(rev, 0)
        ) AS x
        FROM (
            SELECT EXTRACT(HOUR FROM created_at)::int AS h,
                   COUNT(*) AS cnt,
                   COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0) AS rev
              FROM public.orders
             WHERE cafe_id = _cafe_id AND created_at::date BETWEEN _start AND _end
               AND status NOT IN ('cancelled')
             GROUP BY 1
        ) sub
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

    -- Customer LTV
    SELECT COALESCE(ROUND(AVG(rev), 2), 0)
    INTO _ltv
    FROM (
        SELECT customer_user_id,
               SUM(total_amount) FILTER (WHERE payment_status = 'paid') AS rev
          FROM public.orders
         WHERE cafe_id = _cafe_id AND created_at::date BETWEEN _start AND _end
           AND customer_user_id IS NOT NULL
         GROUP BY customer_user_id
    ) sub;

    -- Week-over-week growth
    SELECT
        CASE WHEN prev_rev > 0
             THEN ROUND(100.0 * (curr_rev - prev_rev) / prev_rev, 1)
             ELSE 0
        END
    INTO _growth
    FROM (
        SELECT
            COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0) AS curr_rev,
            (SELECT COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0)
               FROM public.orders
              WHERE cafe_id = _cafe_id
                AND created_at::date BETWEEN (_start - 7) AND (_end - 7)
            ) AS prev_rev
        FROM public.orders
        WHERE cafe_id = _cafe_id AND created_at::date BETWEEN _start AND _end
    ) sub;

    -- Day-of-week revenue pattern
    SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('day', day_of_week, 'revenue', rev, 'orders', cnt) ORDER BY day_of_week ASC), '[]'::jsonb)
    INTO _dow
    FROM (
        SELECT EXTRACT(DOW FROM created_at)::int AS day_of_week,
               COUNT(*) AS cnt,
               COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0) AS rev
          FROM public.orders
         WHERE cafe_id = _cafe_id AND created_at::date BETWEEN _start AND _end
           AND status NOT IN ('cancelled')
         GROUP BY 1
    ) sub;

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
        'kpis', COALESCE(_kpis, '{"orders":0, "revenue":0, "paid_orders":0, "pending_orders":0, "avg_ticket":0, "new_customers":0}'::jsonb),
        'series', COALESCE(_series, '[]'::jsonb),
        'top_items', COALESCE(_top, '[]'::jsonb),
        'staff_performance', COALESCE(_staff, '[]'::jsonb),
        'peak_hours', COALESCE(_peak, '[]'::jsonb),
        'avg_prep_time_minutes', COALESCE(_prep_time, 0),
        'cancellation_rate', COALESCE(_cancel_rate, 0),
        'customer_ltv', COALESCE(_ltv, 0),
        'week_growth', COALESCE(_growth, 0),
        'dow_pattern', COALESCE(_dow, '[]'::jsonb)
    );
END;
$$;

DO $$ BEGIN RAISE NOTICE 'RE-11: Hybrid analytics implemented.'; END $$;
