-- Fix customer_visits FK and add order workflow columns
-- Also add status update RPCs for the order lifecycle

-- 1. Drop the broken customer_visits table and recreate without FK
DROP TABLE IF EXISTS public.customer_visits;

CREATE TABLE IF NOT EXISTS public.customer_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id TEXT NOT NULL, -- auth.users.id is TEXT, not FK to avoid type mismatch
    cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
    login_session_id TEXT NOT NULL,
    counted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(customer_id, cafe_id, login_session_id)
);

ALTER TABLE public.customer_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own visits"
    ON public.customer_visits FOR SELECT
    USING (auth.uid()::text = customer_id);

CREATE POLICY "Owner/staff can view visits for their cafe"
    ON public.customer_visits FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.cafe_staff WHERE user_id = auth.uid() AND cafe_id = customer_visits.cafe_id)
        OR EXISTS (SELECT 1 FROM public.cafes WHERE id = customer_visits.cafe_id AND owner_user_id = auth.uid())
    );

CREATE INDEX IF NOT EXISTS idx_customer_visits_lookup
    ON public.customer_visits(customer_id, cafe_id, login_session_id);

-- 2. Add workflow columns to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS served_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS served_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS wait_eta_minutes INT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS eta_updated_at TIMESTAMPTZ;

-- 3. Fix mark_order_paid — remove customer_visits insert, add unconditional visit count
DROP FUNCTION IF EXISTS public.mark_order_paid(UUID);
DROP FUNCTION IF EXISTS public.mark_order_paid();

CREATE OR REPLACE FUNCTION public.mark_order_paid(_order_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    _o RECORD;
    _u UUID := auth.uid();
BEGIN
    SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

    IF NOT (public.is_cafe_owner(_u, _o.cafe_id) OR public.has_cafe_staff_role(_u, _o.cafe_id, 'runner')) THEN
        RAISE EXCEPTION 'Not authorised';
    END IF;

    IF _o.payment_status = 'paid' THEN
        RETURN JSONB_BUILD_OBJECT('id', _o.id, 'already_paid', true);
    END IF;

    -- Mark paid + auto-accept
    UPDATE public.orders SET
        payment_status   = 'paid',
        paid_at          = now(),
        paid_collected_by = _u,
        payment_method   = COALESCE(payment_method, 'cash'),
        status           = CASE WHEN status = 'placed' THEN 'accepted'::public.order_status ELSE status END,
        accepted_at      = COALESCE(accepted_at, now()),
        accepted_by      = COALESCE(accepted_by, _u)
    WHERE id = _order_id;

    -- Loyalty points
    IF _o.customer_user_id IS NOT NULL AND _o.earned_points > 0 THEN
        INSERT INTO public.loyalty_memberships (cafe_id, customer_user_id, loyalty_points, total_visits, last_visit_at)
        VALUES (_o.cafe_id, _o.customer_user_id::uuid, _o.earned_points, 0, now())
        ON CONFLICT (cafe_id, customer_user_id) DO UPDATE SET
            loyalty_points = public.loyalty_memberships.loyalty_points + EXCLUDED.loyalty_points,
            last_visit_at  = now();

        INSERT INTO public.loyalty_transactions (cafe_id, customer_user_id, points, type, note, related_order_id)
        VALUES (_o.cafe_id, _o.customer_user_id::uuid, _o.earned_points, 'earned',
                'Order #' || SUBSTR(_o.id::text, 1, 8), _o.id);
    END IF;

    -- Visit counting: one per paid order (no customer_visits dependency)
    IF _o.customer_user_id IS NOT NULL THEN
        UPDATE public.loyalty_memberships
        SET total_visits = total_visits + 1, last_visit_at = now()
        WHERE cafe_id = _o.cafe_id AND customer_user_id = _o.customer_user_id::uuid;
    END IF;

    RETURN JSONB_BUILD_OBJECT('id', _o.id, 'paid', true, 'awarded_points', _o.earned_points);
END;
$$;

-- 4. Status update RPCs for order lifecycle
CREATE OR REPLACE FUNCTION public.update_order_status(
    _order_id UUID, _status TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    _o RECORD;
    _u UUID := auth.uid();
BEGIN
    SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

    -- Allow: owner, any staff role
    IF NOT (public.is_cafe_owner(_u, _o.cafe_id) OR public.has_cafe_staff_role(_u, _o.cafe_id, 'runner')
            OR public.has_cafe_staff_role(_u, _o.cafe_id, 'cook') OR public.has_cafe_staff_role(_u, _o.cafe_id, 'runner')) THEN
        RAISE EXCEPTION 'Not authorised';
    END IF;

    -- Validate status transitions
    IF _status NOT IN ('accepted','preparing','ready','served','completed','cancelled') THEN
        RAISE EXCEPTION 'Invalid status: %', _status;
    END IF;

    -- Can't cancel if already served/completed
    IF _status = 'cancelled' AND _o.status IN ('served','completed') THEN
        RAISE EXCEPTION 'Cannot cancel an already completed order';
    END IF;

    UPDATE public.orders SET
        status = _status::public.order_status,
        accepted_at  = CASE WHEN _status = 'accepted' AND accepted_at IS NULL THEN now() ELSE accepted_at END,
        accepted_by  = CASE WHEN _status = 'accepted' AND accepted_by IS NULL THEN _u ELSE accepted_by END,
        ready_at     = CASE WHEN _status = 'ready' AND ready_at IS NULL THEN now() ELSE ready_at END,
        ready_by      = CASE WHEN _status = 'ready' AND ready_by IS NULL THEN _u ELSE ready_by END,
        served_at    = CASE WHEN _status IN ('served','completed') AND served_at IS NULL THEN now() ELSE served_at END,
        served_by    = CASE WHEN _status IN ('served','completed') AND served_by IS NULL THEN _u ELSE served_by END
    WHERE id = _order_id;

    RETURN JSONB_BUILD_OBJECT('id', _o.id, 'status', _status);
END;
$$;

-- 5. Backfill: ensure all existing paid orders count as visits
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT o.cafe_id, o.customer_user_id, COUNT(*) AS cnt
        FROM public.orders o
        WHERE o.payment_status = 'paid'
          AND o.customer_user_id IS NOT NULL
          AND o.status NOT IN ('cancelled')
        GROUP BY o.cafe_id, o.customer_user_id
    LOOP
        UPDATE public.loyalty_memberships
        SET total_visits = GREATEST(total_visits, r.cnt),
            last_visit_at = NOW()
        WHERE cafe_id = r.cafe_id AND customer_user_id = r.customer_user_id::uuid;
    END LOOP;
END;
$$;

COMMENT ON TABLE public.customer_visits IS 'Tracks per-session visits. customer_id is TEXT (auth.users.id) to avoid UUID mismatch.';