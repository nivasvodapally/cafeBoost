-- PHASE 7: Analytics System Enhancement
-- Adds comprehensive analytics functions and export capabilities

-- 1. Create materialized view for daily cafe metrics (for faster analytics)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.cafe_daily_metrics AS
SELECT
    DATE(o.created_at) as metric_date,
    o.cafe_id,
    COUNT(DISTINCT o.id) as total_orders,
    COUNT(DISTINCT o.customer_user_id) as unique_customers,
    SUM(o.total_amount) as total_revenue,
    AVG(o.total_amount) as avg_order_value,
    COUNT(DISTINCT CASE WHEN o.status = 'cancelled' THEN o.id END) as cancelled_orders,
    COUNT(DISTINCT b.id) as total_bookings,
    COUNT(DISTINCT CASE WHEN b.status = 'no_show' THEN b.id END) as no_show_bookings,
    COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.id END) as completed_bookings,
    SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_amount ELSE 0 END) as total_payments,
    COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' THEN o.id END) as successful_payments,
    COUNT(DISTINCT CASE WHEN o.refunded_at IS NOT NULL THEN o.id END) as total_refunds,
    SUM(COALESCE(o.refunded_amount, 0)) as total_refund_amount
FROM public.orders o
LEFT JOIN public.bookings b ON DATE(b.created_at) = DATE(o.created_at) AND b.cafe_id = o.cafe_id
GROUP BY DATE(o.created_at), o.cafe_id
ORDER BY metric_date DESC;

-- Create index for faster queries
CREATE UNIQUE INDEX IF NOT EXISTS idx_cafe_daily_metrics_date_cafe 
    ON public.cafe_daily_metrics (metric_date, cafe_id);

CREATE INDEX IF NOT EXISTS idx_cafe_daily_metrics_cafe 
    ON public.cafe_daily_metrics (cafe_id);

-- Refresh function for materialized view
CREATE OR REPLACE FUNCTION public.refresh_cafe_daily_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.cafe_daily_metrics;
END;
$$;

-- 2. Create function for operational analytics dashboard
CREATE OR REPLACE FUNCTION public.get_operational_analytics(
    p_cafe_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    period_start DATE,
    period_end DATE,
    total_orders BIGINT,
    total_revenue BIGINT,
    avg_order_value NUMERIC,
    avg_preparation_time_minutes NUMERIC,
    order_cancellation_rate NUMERIC,
    popular_items JSONB,
    peak_hours JSONB,
    customer_retention_rate NUMERIC,
    table_turnover_rate NUMERIC,
    staff_efficiency JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date DATE := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
    v_end_date DATE := COALESCE(p_end_date, CURRENT_DATE);
BEGIN
    RETURN QUERY
    WITH order_stats AS (
        SELECT 
            COUNT(*) as order_count,
            SUM(total_amount) as revenue,
            AVG(total_amount) as avg_value,
            AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60) as avg_prep_time,
            COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count
        FROM public.orders
        WHERE cafe_id = p_cafe_id
        AND created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
    ),
    popular_items AS (
        SELECT 
            mi.name as item_name,
            mi.category,
            COUNT(oi.id) as order_count,
            SUM(oi.quantity) as total_quantity,
            SUM(oi.quantity * mi.price) as total_revenue
        FROM public.order_items oi
        JOIN public.menu_items mi ON oi.menu_item_id = mi.id
        JOIN public.orders o ON oi.order_id = o.id
        WHERE o.cafe_id = p_cafe_id
        AND o.created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
        GROUP BY mi.id, mi.name, mi.category
        ORDER BY order_count DESC
        LIMIT 10
    ),
    peak_hours AS (
        SELECT 
            EXTRACT(HOUR FROM created_at) as hour_of_day,
            COUNT(*) as order_count
        FROM public.orders
        WHERE cafe_id = p_cafe_id
        AND created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY order_count DESC
        LIMIT 5
    ),
    customer_stats AS (
        SELECT
            COUNT(DISTINCT customer_user_id) as total_customers,
            COUNT(DISTINCT CASE WHEN order_count > 1 THEN customer_user_id END) as returning_customers
        FROM (
            SELECT
                customer_user_id,
                COUNT(*) as order_count
            FROM public.orders
            WHERE cafe_id = p_cafe_id
            AND created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
            GROUP BY customer_user_id
        ) customer_orders
    ),
    table_stats AS (
        SELECT 
            COUNT(DISTINCT t.id) as total_tables,
            COUNT(DISTINCT CASE WHEN t.status = 'occupied' THEN t.id END) as occupied_tables,
            AVG(EXTRACT(EPOCH FROM (b.checked_out_at - b.checked_in_at)) / 3600) as avg_occupancy_hours
        FROM public.tables t
        LEFT JOIN public.bookings b ON t.current_booking_id = b.id
        WHERE t.cafe_id = p_cafe_id
        AND b.created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
    ),
    staff_stats AS (
        SELECT 
            sa.role,
            COUNT(DISTINCT o.id) as orders_handled,
            AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) / 60) as avg_order_time
        FROM public.cafe_staff sa
        LEFT JOIN public.orders o ON o.cafe_id = sa.cafe_id 
            AND o.created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
            AND o.status IN ('completed', 'served', 'delivered')
        WHERE sa.cafe_id = p_cafe_id
        GROUP BY sa.role
    )
    SELECT 
        v_start_date as period_start,
        v_end_date as period_end,
        os.order_count as total_orders,
        os.revenue as total_revenue,
        ROUND(os.avg_value, 2) as avg_order_value,
        ROUND(os.avg_prep_time, 2) as avg_preparation_time_minutes,
        CASE 
            WHEN os.order_count > 0 THEN ROUND((os.cancelled_count::NUMERIC / os.order_count) * 100, 2)
            ELSE 0
        END as order_cancellation_rate,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'item_name', pi.item_name,
                    'category', pi.category,
                    'order_count', pi.order_count,
                    'total_quantity', pi.total_quantity,
                    'total_revenue', pi.total_revenue
                )
            ),
            '[]'::jsonb
        ) as popular_items,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'hour', ph.hour_of_day,
                    'order_count', ph.order_count
                )
            ),
            '[]'::jsonb
        ) as peak_hours,
        CASE 
            WHEN cs.total_customers > 0 THEN ROUND((cs.returning_customers::NUMERIC / cs.total_customers) * 100, 2)
            ELSE 0
        END as customer_retention_rate,
        CASE 
            WHEN ts.total_tables > 0 THEN ROUND((ts.occupied_tables::NUMERIC / ts.total_tables) * 100, 2)
            ELSE 0
        END as table_turnover_rate,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'role', ss.role,
                    'orders_handled', ss.orders_handled,
                    'avg_order_time', ROUND(ss.avg_order_time, 2)
                )
            ),
            '[]'::jsonb
        ) as staff_efficiency
    FROM order_stats os
    CROSS JOIN popular_items pi
    CROSS JOIN peak_hours ph
    CROSS JOIN customer_stats cs
    CROSS JOIN table_stats ts
    CROSS JOIN staff_stats ss
    GROUP BY os.order_count, os.revenue, os.avg_value, os.avg_prep_time, os.cancelled_count,
             cs.total_customers, cs.returning_customers, ts.total_tables, ts.occupied_tables;
END;
$$;

-- 3. Create function for financial analytics
CREATE OR REPLACE FUNCTION public.get_financial_analytics(
    p_cafe_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    period_start DATE,
    period_end DATE,
    total_revenue BIGINT,
    total_cogs BIGINT,
    gross_profit BIGINT,
    gross_margin NUMERIC,
    payment_methods JSONB,
    daily_revenue_trend JSONB,
    refund_rate NUMERIC,
    average_daily_revenue NUMERIC,
    revenue_by_category JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date DATE := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
    v_end_date DATE := COALESCE(p_end_date, CURRENT_DATE);
BEGIN
    RETURN QUERY
    WITH revenue_data AS (
        SELECT
            DATE(o.created_at) as revenue_date,
            SUM(o.total_amount) as daily_revenue,
            o.payment_method,
            COUNT(DISTINCT o.id) as transaction_count
        FROM public.orders o
        WHERE o.cafe_id = p_cafe_id
        AND o.payment_status = 'paid'
        AND o.created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
        GROUP BY DATE(o.created_at), o.payment_method
    ),
    cogs_data AS (
        SELECT
            DATE(oi.created_at) as cogs_date,
            SUM(oi.quantity * mi.cost) as daily_cogs
        FROM public.order_items oi
        JOIN public.menu_items mi ON oi.menu_item_id = mi.id
        JOIN public.orders o ON oi.order_id = o.id
        WHERE o.cafe_id = p_cafe_id
        AND oi.created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
        GROUP BY DATE(oi.created_at)
    ),
    refund_data AS (
        SELECT
            COUNT(*) as refund_count,
            SUM(COALESCE(refunded_amount, 0)) as total_refund_amount
        FROM public.orders o
        WHERE o.cafe_id = p_cafe_id
        AND o.refunded_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
    ),
    category_revenue AS (
        SELECT
            mi.category,
            SUM(oi.quantity * mi.price) as revenue,
            SUM(oi.quantity * mi.cost) as cogs,
            SUM(oi.quantity) as quantity_sold
        FROM public.order_items oi
        JOIN public.menu_items mi ON oi.menu_item_id = mi.id
        JOIN public.orders o ON oi.order_id = o.id
        WHERE o.cafe_id = p_cafe_id
        AND o.created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
        GROUP BY mi.category
    ),
    payment_method_summary AS (
        SELECT
            o.payment_method,
            SUM(o.total_amount) as total_amount,
            COUNT(*) as transaction_count
        FROM public.orders o
        WHERE o.cafe_id = p_cafe_id
        AND o.payment_status = 'paid'
        AND o.created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
        GROUP BY o.payment_method
    )
    SELECT 
        v_start_date as period_start,
        v_end_date as period_end,
        COALESCE(SUM(rd.daily_revenue), 0) as total_revenue,
        COALESCE(SUM(cd.daily_cogs), 0) as total_cogs,
        COALESCE(SUM(rd.daily_revenue), 0) - COALESCE(SUM(cd.daily_cogs), 0) as gross_profit,
        CASE 
            WHEN COALESCE(SUM(rd.daily_revenue), 0) > 0 
            THEN ROUND(((COALESCE(SUM(rd.daily_revenue), 0) - COALESCE(SUM(cd.daily_cogs), 0))::NUMERIC / COALESCE(SUM(rd.daily_revenue), 0)) * 100, 2)
            ELSE 0
        END as gross_margin,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'method', pms.payment_method,
                    'total_amount', pms.total_amount,
                    'transaction_count', pms.transaction_count,
                    'percentage', CASE 
                        WHEN SUM(rd.daily_revenue) > 0 
                        THEN ROUND((pms.total_amount::NUMERIC / SUM(rd.daily_revenue)) * 100, 2)
                        ELSE 0
                    END
                )
            ),
            '[]'::jsonb
        ) as payment_methods,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'date', rd.revenue_date,
                    'revenue', rd.daily_revenue,
                    'cogs', cd.daily_cogs,
                    'profit', rd.daily_revenue - COALESCE(cd.daily_cogs, 0)
                ) ORDER BY rd.revenue_date
            ),
            '[]'::jsonb
        ) as daily_revenue_trend,
        CASE 
            WHEN COALESCE(SUM(rd.daily_revenue), 0) > 0 
            THEN ROUND((COALESCE(rd.total_refund_amount, 0)::NUMERIC / COALESCE(SUM(rd.daily_revenue), 0)) * 100, 2)
            ELSE 0
        END as refund_rate,
        CASE 
            WHEN COUNT(DISTINCT rd.revenue_date) > 0 
            THEN ROUND(AVG(rd.daily_revenue), 2)
            ELSE 0
        END as average_daily_revenue,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'category', cr.category,
                    'revenue', cr.revenue,
                    'cogs', cr.cogs,
                    'quantity_sold', cr.quantity_sold,
                    'profit', cr.revenue - cr.cogs,
                    'margin', CASE 
                        WHEN cr.revenue > 0 
                        THEN ROUND(((cr.revenue - cr.cogs)::NUMERIC / cr.revenue) * 100, 2)
                        ELSE 0
                    END
                )
            ),
            '[]'::jsonb
        ) as revenue_by_category
    FROM revenue_data rd
    LEFT JOIN cogs_data cd ON rd.revenue_date = cd.cogs_date
    CROSS JOIN refund_data rd
    CROSS JOIN payment_method_summary pms
    CROSS JOIN category_revenue cr
    GROUP BY rd.total_refund_amount, rd.refund_count;
END;
$$;

-- 4. Create function for customer analytics
CREATE OR REPLACE FUNCTION public.get_customer_analytics(
    p_cafe_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    total_customers BIGINT,
    new_customers BIGINT,
    returning_customers BIGINT,
    avg_visit_frequency_days NUMERIC,
    avg_order_value NUMERIC,
    customer_lifetime_value NUMERIC,
    top_customers JSONB,
    customer_acquisition_channels JSONB,
    loyalty_engagement_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date DATE := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '90 days');
    v_end_date DATE := COALESCE(p_end_date, CURRENT_DATE);
BEGIN
    RETURN QUERY
    WITH customer_orders AS (
        SELECT
            o.customer_user_id as customer_id,
            COUNT(DISTINCT o.id) as order_count,
            SUM(o.total_amount) as total_spent,
            MIN(o.created_at) as first_order_date,
            MAX(o.created_at) as last_order_date,
            AVG(o.total_amount) as avg_order_value
        FROM public.orders o
        WHERE o.cafe_id = p_cafe_id
        AND o.created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
        GROUP BY o.customer_user_id
    ),
    new_customers AS (
        SELECT
            COUNT(DISTINCT customer_id) as new_customer_count
        FROM customer_orders co
        WHERE co.first_order_date BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
    ),
    returning_customers AS (
        SELECT
            COUNT(DISTINCT customer_id) as returning_customer_count
        FROM customer_orders co
        WHERE co.order_count > 1
    ),
    visit_frequency AS (
        SELECT
            AVG(days_between_visits) as avg_frequency_days
        FROM (
            SELECT
                customer_user_id as customer_id,
                AVG(EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY customer_user_id ORDER BY created_at))) / 86400) as days_between_visits
            FROM public.orders
            WHERE cafe_id = p_cafe_id
            AND created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
            GROUP BY customer_user_id
        ) frequency_calc
    ),
    top_customers AS (
        SELECT
            co.customer_id,
            p.full_name,
            p.email,
            co.order_count,
            co.total_spent,
            co.avg_order_value,
            ROW_NUMBER() OVER (ORDER BY co.total_spent DESC) as rank
        FROM customer_orders co
        JOIN public.profiles p ON co.customer_id = p.id
        ORDER BY co.total_spent DESC
        LIMIT 10
    ),
    acquisition_channels AS (
        SELECT
            o.order_source,
            COUNT(DISTINCT o.customer_user_id) as customer_count,
            COUNT(DISTINCT o.id) as order_count,
            SUM(o.total_amount) as total_revenue
        FROM public.orders o
        WHERE o.cafe_id = p_cafe_id
        AND o.created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
        GROUP BY o.order_source
    ),
    loyalty_stats AS (
        SELECT
            COUNT(DISTINCT lp.customer_user_id) as loyalty_members,
            COUNT(DISTINCT o.customer_user_id) as total_customers
        FROM public.loyalty_points lp
        JOIN public.orders o ON lp.customer_user_id = o.customer_user_id AND lp.cafe_id = o.cafe_id
        WHERE lp.cafe_id = p_cafe_id
        AND o.created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
    )
    SELECT
        COUNT(DISTINCT co.customer_id) as total_customers,
        nc.new_customer_count as new_customers,
        rc.returning_customer_count as returning_customers,
        ROUND(vf.avg_frequency_days, 2) as avg_visit_frequency_days,
        ROUND(AVG(co.avg_order_value), 2) as avg_order_value,
        ROUND(AVG(co.total_spent), 2) as customer_lifetime_value,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'customer_id', tc.customer_id,
                    'name', tc.full_name,
                    'email', tc.email,
                    'order_count', tc.order_count,
                    'total_spent', tc.total_spent,
                    'avg_order_value', tc.avg_order_value,
                    'rank', tc.rank
                ) ORDER BY tc.rank
            ),
            '[]'::jsonb
        ) as top_customers,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'channel', ac.order_source,
                    'customer_count', ac.customer_count,
                    'order_count', ac.order_count,
                    'total_revenue', ac.total_revenue,
                    'percentage', CASE
                        WHEN SUM(ac.customer_count) OVER () > 0
                        THEN ROUND((ac.customer_count::NUMERIC / SUM(ac.customer_count) OVER ()) * 100, 2)
                        ELSE 0
                    END
                )
            ),
            '[]'::jsonb
        ) as customer_acquisition_channels,
        CASE
            WHEN ls.total_customers > 0
            THEN ROUND((ls.loyalty_members::NUMERIC / ls.total_customers) * 100, 2)
            ELSE 0
        END as loyalty_engagement_rate
    FROM customer_orders co
    CROSS JOIN new_customers nc
    CROSS JOIN returning_customers rc
    CROSS JOIN visit_frequency vf
    CROSS JOIN top_customers tc
    CROSS JOIN acquisition_channels ac
    CROSS JOIN loyalty_stats ls
    GROUP BY nc.new_customer_count, rc.returning_customer_count, vf.avg_frequency_days, ls.loyalty_members, ls.total_customers;
END;
$$;

-- 5. Create function for export data
CREATE OR REPLACE FUNCTION public.export_analytics_data(
    p_cafe_id UUID,
    p_export_type TEXT,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date DATE := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
    v_end_date DATE := COALESCE(p_end_date, CURRENT_DATE);
    result JSONB;
BEGIN
    CASE p_export_type
        WHEN 'orders' THEN
            SELECT jsonb_agg(row_to_json(o))
            INTO result
            FROM (
                SELECT
                    o.id,
                    o.order_number,
                    o.customer_user_id,
                    p.full_name as customer_name,
                    o.total_amount,
                    o.status,
                    o.payment_status,
                    o.created_at,
                    o.updated_at,
                    (
                        SELECT jsonb_agg(jsonb_build_object(
                            'item_name', mi.name,
                            'quantity', oi.quantity,
                            'price', mi.price,
                            'total', oi.quantity * mi.price
                        ))
                        FROM public.order_items oi
                        JOIN public.menu_items mi ON oi.menu_item_id = mi.id
                        WHERE oi.order_id = o.id
                    ) as items
                FROM public.orders o
                LEFT JOIN public.profiles p ON o.customer_user_id = p.id
                WHERE o.cafe_id = p_cafe_id
                AND o.created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
                ORDER BY o.created_at DESC
            ) o;
        
        WHEN 'payments' THEN
            SELECT jsonb_agg(row_to_json(p))
            INTO result
            FROM (
                SELECT
                    o.id,
                    o.id as order_id,
                    o.total_amount as amount,
                    o.payment_method,
                    o.payment_status,
                    o.created_at,
                    o.order_number,
                    c.full_name as customer_name
                FROM public.orders o
                LEFT JOIN public.profiles c ON o.customer_user_id = c.id
                WHERE o.cafe_id = p_cafe_id
                AND o.created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
                AND o.payment_status IN ('paid', 'pending', 'failed')
                ORDER BY o.created_at DESC
            ) p;
        
        WHEN 'bookings' THEN
            SELECT jsonb_agg(row_to_json(b))
            INTO result
            FROM (
                SELECT
                    b.id,
                    b.customer_user_id,
                    p.full_name as customer_name,
                    b.party_size,
                    b.scheduled_for,
                    b.status,
                    b.created_at,
                    b.checked_in_at,
                    b.checked_out_at
                FROM public.bookings b
                LEFT JOIN public.profiles p ON b.customer_user_id = p.id
                WHERE b.cafe_id = p_cafe_id
                AND b.created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
                ORDER BY b.scheduled_for DESC
            ) b;
        
        WHEN 'customers' THEN
            SELECT jsonb_agg(row_to_json(c))
            INTO result
            FROM (
                SELECT
                    p.id,
                    p.full_name,
                    p.email,
                    p.phone,
                    COUNT(DISTINCT o.id) as total_orders,
                    SUM(o.total_amount) as total_spent,
                    MIN(o.created_at) as first_order_date,
                    MAX(o.created_at) as last_order_date
                FROM public.profiles p
                LEFT JOIN public.orders o ON p.id = o.customer_user_id AND o.cafe_id = p_cafe_id
                WHERE EXISTS (
                    SELECT 1 FROM public.orders o2
                    WHERE o2.customer_user_id = p.id AND o2.cafe_id = p_cafe_id
                    AND o2.created_at BETWEEN v_start_date AND v_end_date + INTERVAL '1 day'
                )
                GROUP BY p.id, p.full_name, p.email, p.phone
                ORDER BY total_spent DESC NULLS LAST
            ) c;
        
        ELSE
            result := jsonb_build_object('error', 'Invalid export type');
    END CASE;
    
    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- 6. Create function for real-time business metrics
CREATE OR REPLACE FUNCTION public.get_realtime_metrics(p_cafe_id UUID)
RETURNS TABLE (
    current_hour_orders BIGINT,
    current_hour_revenue BIGINT,
    today_orders BIGINT,
    today_revenue BIGINT,
    active_tables BIGINT,
    pending_orders BIGINT,
    preparing_orders BIGINT,
    waiting_customers BIGINT,
    avg_wait_time_minutes NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH current_hour AS (
        SELECT
            COUNT(*) as order_count,
            SUM(total_amount) as revenue
        FROM public.orders
        WHERE cafe_id = p_cafe_id
        AND created_at >= date_trunc('hour', NOW())
    ),
    today_stats AS (
        SELECT
            COUNT(*) as order_count,
            SUM(total_amount) as revenue
        FROM public.orders
        WHERE cafe_id = p_cafe_id
        AND created_at >= CURRENT_DATE
    ),
    table_stats AS (
        SELECT
            COUNT(*) as active_tables
        FROM public.tables
        WHERE cafe_id = p_cafe_id
        AND status = 'occupied'
    ),
    order_status_stats AS (
        SELECT
            COUNT(CASE WHEN status IN ('placed', 'accepted') THEN 1 END) as pending_orders,
            COUNT(CASE WHEN status = 'preparing' THEN 1 END) as preparing_orders
        FROM public.orders
        WHERE cafe_id = p_cafe_id
        AND status NOT IN ('completed', 'cancelled', 'delivered')
    ),
    wait_stats AS (
        SELECT
            COUNT(*) as waiting_customers,
            AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60) as avg_wait_time
        FROM public.orders
        WHERE cafe_id = p_cafe_id
        AND status IN ('placed', 'accepted')
    )
    SELECT
        ch.order_count as current_hour_orders,
        ch.revenue as current_hour_revenue,
        ts.order_count as today_orders,
        ts.revenue as today_revenue,
        tbs.active_tables,
        oss.pending_orders,
        oss.preparing_orders,
        ws.waiting_customers,
        ROUND(COALESCE(ws.avg_wait_time, 0), 2) as avg_wait_time_minutes
    FROM current_hour ch
    CROSS JOIN today_stats ts
    CROSS JOIN table_stats tbs
    CROSS JOIN order_status_stats oss
    CROSS JOIN wait_stats ws;
END;
$$;

-- 7. Add analytics settings to cafes table
ALTER TABLE public.cafes
ADD COLUMN IF NOT EXISTS analytics_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS export_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS realtime_metrics_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS data_retention_days INTEGER DEFAULT 365;

COMMENT ON COLUMN public.cafes.analytics_enabled IS 'Whether analytics features are enabled';
COMMENT ON COLUMN public.cafes.export_enabled IS 'Whether data export is enabled';
COMMENT ON COLUMN public.cafes.realtime_metrics_enabled IS 'Whether real-time metrics are enabled';
COMMENT ON COLUMN public.cafes.data_retention_days IS 'Number of days to retain analytics data';

-- 8. Create scheduled job to refresh materialized view (optional - requires pg_cron extension)
-- Uncomment if pg_cron is installed
-- SELECT cron.schedule('refresh-cafe-metrics', '0 2 * * *', 'SELECT refresh_cafe_daily_metrics()');

-- 9. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_operational_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_analytics_data TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_realtime_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_cafe_daily_metrics TO authenticated;

-- 10. Create indexes for analytics performance
CREATE INDEX IF NOT EXISTS idx_orders_cafe_created
    ON public.orders(cafe_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_payment_status
    ON public.orders(cafe_id, payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_cafe_created
    ON public.bookings(cafe_id, created_at DESC);

-- CREATE INDEX IF NOT EXISTS idx_order_items_created
--     ON public.order_items(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_cafe_rating
    ON public.customer_feedback(cafe_id, rating);

-- 11. Add sample data for testing (optional)
-- INSERT INTO public.cafe_daily_metrics
-- SELECT * FROM public.cafe_daily_metrics
-- WHERE FALSE; -- This ensures the view is created but empty

-- 12. Create view for staff performance analytics
CREATE OR REPLACE VIEW public.staff_performance_metrics AS
SELECT
    sa.user_id,
    sa.cafe_id,
    sa.role,
    p.full_name,
    COUNT(DISTINCT o.id) as orders_handled,
    SUM(o.total_amount) as total_revenue_handled,
    AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) / 60) as avg_order_time_minutes,
    COUNT(DISTINCT b.id) as bookings_handled,
    MIN(o.created_at) as first_activity,
    MAX(o.created_at) as last_activity
FROM public.cafe_staff sa
LEFT JOIN public.orders o ON o.cafe_id = sa.cafe_id
    AND o.status IN ('completed', 'served', 'delivered')
    AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
LEFT JOIN public.bookings b ON b.cafe_id = sa.cafe_id
    AND b.status IN ('completed', 'checked_in')
    AND b.created_at >= CURRENT_DATE - INTERVAL '30 days'
LEFT JOIN public.profiles p ON sa.user_id = p.id
GROUP BY sa.user_id, sa.cafe_id, sa.role, p.full_name;

-- Grant access to the view
GRANT SELECT ON public.staff_performance_metrics TO authenticated;

-- 13. Create function to clean up old analytics data
CREATE OR REPLACE FUNCTION public.cleanup_old_analytics_data()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Delete old customer feedback (older than 2 years)
    WITH deleted_feedback AS (
        DELETE FROM public.customer_feedback
        WHERE created_at < CURRENT_DATE - INTERVAL '2 years'
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted_feedback;
    
    -- Delete old activity logs (older than 1 year)
    DELETE FROM public.activity_logs
    WHERE created_at < CURRENT_DATE - INTERVAL '1 year';
    
    -- Delete old notifications (older than 6 months)
    DELETE FROM public.notifications
    WHERE created_at < CURRENT_DATE - INTERVAL '6 months';
    
    RETURN deleted_count;
END;
$$;

-- Schedule cleanup job (optional - requires pg_cron)
-- SELECT cron.schedule('cleanup-analytics-data', '0 3 * * 0', 'SELECT cleanup_old_analytics_data()');

COMMENT ON FUNCTION public.cleanup_old_analytics_data IS 'Cleans up old analytics data to maintain performance';