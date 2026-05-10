-- Analytics & visit tracking enhancements
-- Adds login_session_id to orders, customer_visits table, enriched analytics

-- 1. Add login_session_id to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS login_session_id TEXT;

-- 2. Customer visits tracking table (prevents double-counting per session)
CREATE TABLE IF NOT EXISTS public.customer_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
    login_session_id TEXT NOT NULL,
    counted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(customer_id, cafe_id, login_session_id)
);

ALTER TABLE public.customer_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own visits"
    ON public.customer_visits FOR SELECT
    USING (auth.uid() = customer_id);

CREATE POLICY "Owner/staff can view visits for their cafe"
    ON public.customer_visits FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.cafe_staff WHERE user_id = auth.uid() AND cafe_id = customer_visits.cafe_id)
        OR EXISTS (SELECT 1 FROM public.cafes WHERE id = customer_visits.cafe_id AND owner_user_id = auth.uid())
    );

CREATE INDEX IF NOT EXISTS idx_customer_visits_lookup
    ON public.customer_visits(customer_id, cafe_id, login_session_id);

-- 3. Enriched get_owner_analytics
-- Drops and recreates with all new analytics: staff performance, peak hours, cancellation rate, customer LTV
CREATE OR REPLACE FUNCTION public.get_owner_analytics(
    _cafe_id UUID,
    _start DATE,
    _end DATE
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
BEGIN
    IF NOT public.is_cafe_owner(auth.uid(), _cafe_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;

    -- KPIs
    SELECT JSONB_BUILD_OBJECT(
        'orders',        COUNT(*) FILTER (WHERE status NOT IN ('cancelled')),
        'paid_orders',   COUNT(*) FILTER (WHERE payment_status = 'paid'),
        'pending_orders',COUNT(*) FILTER (WHERE payment_status = 'pending' AND status NOT IN ('cancelled')),
        'revenue',       COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0),
        'avg_ticket',    COALESCE(AVG(total_amount) FILTER (WHERE payment_status = 'paid'), 0),
        'new_customers', (SELECT COUNT(DISTINCT customer_user_id) FROM public.orders
                          WHERE cafe_id = _cafe_id AND customer_user_id IS NOT NULL
                            AND created_at::date BETWEEN _start AND _end
                            AND customer_user_id NOT IN (
                              SELECT customer_user_id FROM public.orders
                              WHERE cafe_id = _cafe_id AND customer_user_id IS NOT NULL
                                AND created_at::date < _start
                            ))
    ) INTO _kpis FROM public.orders
    WHERE cafe_id = _cafe_id AND created_at::date BETWEEN _start AND _end;

    -- Revenue & orders series (daily)
    SELECT JSONB_AGG(x ORDER BY x.d) INTO _series
    FROM (
        SELECT JSONB_BUILD_OBJECT(
            'date', d::date,
            'orders', COALESCE(o.cnt, 0),
            'revenue', COALESCE(o.rev, 0)
        ) AS x
        FROM generate_series(_start, _end, INTERVAL '1 day') d
        LEFT JOIN (
            SELECT created_at::date AS day,
                   COUNT(*) AS cnt,
                   COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0) AS rev
              FROM public.orders
             WHERE cafe_id = _cafe_id AND created_at::date BETWEEN _start AND _end
             GROUP BY 1
        ) o ON o.day = d::date
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

    -- Staff performance (by role)
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

    -- Peak hours (grouped into breakfast/lunch/evening)
    SELECT COALESCE(JSONB_AGG(x ORDER BY x.orders DESC), '[]'::jsonb) INTO _peak
    FROM (
        SELECT JSONB_BUILD_OBJECT(
            'slot', CASE
                WHEN h < 12 THEN 'Morning (6am–12pm)'
                WHEN h < 17 THEN 'Afternoon (12pm–5pm)'
                WHEN h < 21 THEN 'Evening (5pm–9pm)'
                ELSE 'Late Night (9pm–6am)'
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
             ORDER BY cnt DESC
        ) sub
    ) sub;

    -- Average preparation time (accepted → ready)
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

    -- Customer LTV (avg revenue per paying customer)
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
    SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('day', day_of_week, 'revenue', rev, 'orders', cnt) ORDER BY cnt DESC), '[]'::jsonb)
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

    RETURN JSONB_BUILD_OBJECT(
        'kpis', _kpis,
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

-- 4. Visit counting: mark_order_paid with once-per-session gate
-- Drop old, create new
DROP FUNCTION IF EXISTS public.mark_order_paid(UUID);

CREATE OR REPLACE FUNCTION public.mark_order_paid(_order_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    _o RECORD;
    _u UUID := auth.uid();
    _session TEXT;
BEGIN
    SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

    IF NOT (public.is_cafe_owner(_u, _o.cafe_id) OR public.has_cafe_staff_role(_u, _o.cafe_id, 'runner')) THEN
        RAISE EXCEPTION 'Not authorised';
    END IF;

    IF _o.payment_status = 'paid' THEN
        RETURN JSONB_BUILD_OBJECT('id', _o.id, 'already_paid', true);
    END IF;

    -- Mark paid + accepted
    UPDATE public.orders SET
        payment_status   = 'paid',
        paid_at          = now(),
        paid_collected_by = _u,
        payment_method   = COALESCE(payment_method, 'cash'),
        status           = CASE WHEN status = 'placed' THEN 'accepted'::public.order_status ELSE status END,
        accepted_at      = CASE WHEN status = 'placed' THEN COALESCE(accepted_at, now()) ELSE accepted_at END,
        accepted_by      = CASE WHEN status = 'placed' THEN COALESCE(accepted_by, _u) ELSE accepted_by END
    WHERE id = _order_id;

    -- Loyalty points
    IF _o.customer_user_id IS NOT NULL AND _o.earned_points > 0 THEN
        INSERT INTO public.loyalty_memberships (cafe_id, customer_user_id, loyalty_points, total_visits, last_visit_at)
        VALUES (_o.cafe_id, _o.customer_user_id, _o.earned_points, 0, now())
        ON CONFLICT (cafe_id, customer_user_id) DO UPDATE SET
            loyalty_points = public.loyalty_memberships.loyalty_points + EXCLUDED.loyalty_points,
            last_visit_at   = now();

        INSERT INTO public.loyalty_transactions (cafe_id, customer_user_id, points, type, note, related_order_id)
        VALUES (_o.cafe_id, _o.customer_user_id, _o.earned_points, 'earned',
                'Order #' || SUBSTR(_o.id::text, 1, 8), _o.id);
    END IF;

    -- Visit counting: once per login_session_id per customer per cafe
    _session := _o.login_session_id;
    IF _session IS NOT NULL AND _o.customer_user_id IS NOT NULL THEN
        BEGIN
            INSERT INTO public.customer_visits (customer_id, cafe_id, login_session_id)
            VALUES (_o.customer_user_id, _o.cafe_id, _session);

            UPDATE public.loyalty_memberships
            SET total_visits = total_visits + 1
            WHERE cafe_id = _o.cafe_id AND customer_user_id = _o.customer_user_id;
        END;
    END IF;

    RETURN JSONB_BUILD_OBJECT('id', _o.id, 'paid', true, 'awarded_points', _o.earned_points);
END;
$$;

-- 5. Add login_session_id to place_order_and_update_loyalty (9th arg)
-- Keep old 8-arg version for backward compat, add 9-arg version
CREATE OR REPLACE FUNCTION public.place_order_and_update_loyalty(
    _cafe_id UUID, _customer_user_id UUID, _customer_name TEXT, _customer_phone TEXT,
    _notes TEXT, _source TEXT, _table_no TEXT, _items JSONB, _login_session_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    _order_id UUID; _subtotal NUMERIC := 0; _tax_rate NUMERIC := 0;
    _tax_amount NUMERIC := 0; _total NUMERIC := 0; _accept_online BOOLEAN;
    _ppc NUMERIC := 0; _earned INTEGER := 0; _line JSONB; _item RECORD; _qty INTEGER;
    _recent_order_count INTEGER;
BEGIN
    -- Rate limit: 5 orders/min/user/cafe
    SELECT COUNT(*) INTO _recent_order_count
    FROM public.orders
    WHERE customer_user_id = _customer_user_id AND cafe_id = _cafe_id
      AND created_at > (now() - INTERVAL '1 minute')
      AND status NOT IN ('cancelled');
    IF _recent_order_count >= 5 THEN
        RAISE EXCEPTION 'Rate limit exceeded. Please wait a moment before placing another order.';
    END IF;

    IF auth.uid() IS NULL OR auth.uid() != _customer_user_id THEN RAISE EXCEPTION 'Not authorised'; END IF;
    IF JSONB_ARRAY_LENGTH(_items) = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;

    SELECT tax_rate, accept_online_orders, points_per_currency
    INTO _tax_rate, _accept_online, _ppc
    FROM public.cafes WHERE id = _cafe_id;
    IF _tax_rate IS NULL THEN RAISE EXCEPTION 'Cafe not found'; END IF;
    IF _accept_online = false AND _source != 'table' THEN RAISE EXCEPTION 'This cafe is not accepting online orders right now'; END IF;

    CREATE TEMP TABLE _resolved_items (menu_item_id UUID, name TEXT, price NUMERIC, quantity INTEGER) ON COMMIT DROP;

    FOR _line IN SELECT * FROM JSONB_ARRAY_ELEMENTS(_items) LOOP
        _qty := COALESCE((_line->>'quantity')::int, 0);
        IF _qty < 1 OR _qty > 99 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
        SELECT id, name, price, available, cafe_id INTO _item
        FROM public.menu_items WHERE id = (_line->>'menu_item_id')::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION 'An item is no longer on the menu'; END IF;
        IF _item.cafe_id != _cafe_id THEN RAISE EXCEPTION 'Item does not belong to this cafe'; END IF;
        IF _item.available = false THEN RAISE EXCEPTION '"%" is currently unavailable', _item.name; END IF;
        INSERT INTO _resolved_items VALUES (_item.id, _item.name, _item.price, _qty);
        _subtotal := _subtotal + (_item.price * _qty);
    END LOOP;

    _tax_amount := ROUND((_subtotal * (_tax_rate / 100.0))::NUMERIC, 2);
    _total := _subtotal + _tax_amount;
    _earned := FLOOR(_subtotal * COALESCE(_ppc, 0))::INT;

    INSERT INTO public.orders (cafe_id, customer_user_id, customer_name, customer_phone,
        notes, source, table_no, subtotal, tax_amount, total_amount, earned_points,
        status, payment_status, login_session_id)
    VALUES (_cafe_id, _customer_user_id, _customer_name, _customer_phone, _notes,
        COALESCE(_source,'app'), _table_no, _subtotal, _tax_amount, _total, _earned,
        'placed', 'pending', _login_session_id)
    RETURNING id INTO _order_id;

    INSERT INTO public.order_items (order_id, menu_item_id, name, price, quantity)
    SELECT _order_id, menu_item_id, name, price, quantity FROM _resolved_items;

    RETURN JSONB_BUILD_OBJECT('id', _order_id, 'subtotal', _subtotal, 'tax_amount', _tax_amount,
        'total_amount', _total, 'earned_points', _earned);
END;
$$;

-- 6. Keep 8-arg version as alias (for any existing callers)
CREATE OR REPLACE FUNCTION public.place_order_and_update_loyalty(
    _cafe_id UUID, _customer_user_id UUID, _customer_name TEXT, _customer_phone TEXT,
    _notes TEXT, _source TEXT, _table_no TEXT, _items JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN public.place_order_and_update_loyalty(
        _cafe_id, _customer_user_id, _customer_name, _customer_phone,
        _notes, _source, _table_no, _items, NULL
    );
END;
$$;
