CREATE OR REPLACE FUNCTION public.can_work_order_status(_user_id UUID, _cafe_id UUID, _status public.order_status)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_cafe_owner(_user_id, _cafe_id)
    OR EXISTS (
      SELECT 1 FROM public.cafe_staff s
      WHERE s.user_id = _user_id
        AND s.cafe_id = _cafe_id
        AND s.status = 'active'
        AND (
          s.role = 'manager'
          OR (s.role = 'cashier' AND _status = 'placed')
          OR (s.role = 'chef' AND _status IN ('accepted','preparing'))
          OR (s.role = 'waiter' AND _status IN ('ready','served'))
        )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_work_order_status(UUID, UUID, public.order_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_work_order_status(UUID, UUID, public.order_status) TO authenticated;