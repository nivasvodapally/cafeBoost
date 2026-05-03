REVOKE EXECUTE ON FUNCTION public.is_active_cafe_staff(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_cafe_staff_role(UUID, UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_work_order_status(UUID, UUID, public.order_status) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_staff_with_code(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.advance_order_workflow(UUID, public.order_status) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_order_by_staff(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_active_cafe_staff(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_cafe_staff_role(UUID, UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_work_order_status(UUID, UUID, public.order_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_staff_with_code(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_order_workflow(UUID, public.order_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_staff(UUID) TO authenticated;