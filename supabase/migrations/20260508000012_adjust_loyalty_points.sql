-- Create adjust_loyalty_points RPC function for manual point adjustments
CREATE OR REPLACE FUNCTION public.adjust_loyalty_points(
    _cafe_id uuid,
    _customer_user_id uuid,
    _points integer,
    _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _current_points integer;
    _new_points integer;
BEGIN
    -- Verify caller is cafe owner
    IF NOT public.is_cafe_owner(auth.uid(), _cafe_id) THEN
        RAISE EXCEPTION 'Only cafe owners can adjust loyalty points';
    END IF;

    -- Get current points
    SELECT loyalty_points INTO _current_points
    FROM public.loyalty_memberships
    WHERE cafe_id = _cafe_id AND customer_user_id = _customer_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Create membership if it doesn't exist
        INSERT INTO public.loyalty_memberships (
            cafe_id,
            customer_user_id,
            loyalty_points,
            total_visits,
            last_visit_at,
            created_at
        ) VALUES (
            _cafe_id,
            _customer_user_id,
            GREATEST(0, _points),
            0,
            now(),
            now()
        );
    ELSE
        -- Update existing membership
        _new_points := GREATEST(0, _current_points + _points);
        
        UPDATE public.loyalty_memberships
        SET
            loyalty_points = _new_points,
            last_visit_at = CASE WHEN _points > 0 THEN now() ELSE last_visit_at END
        WHERE cafe_id = _cafe_id AND customer_user_id = _customer_user_id;
    END IF;

    -- Record transaction
    INSERT INTO public.loyalty_transactions (
        cafe_id,
        customer_user_id,
        points,
        type,
        note,
        created_at
    ) VALUES (
        _cafe_id,
        _customer_user_id,
        _points,
        'manual',
        COALESCE(_note, 'Manual adjustment'),
        now()
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.adjust_loyalty_points TO authenticated;