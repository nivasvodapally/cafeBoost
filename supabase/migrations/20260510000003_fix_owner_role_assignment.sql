-- ============================================================
-- MIGRATION: fix_owner_role_assignment.sql
-- Date: 2026-05-10
-- Purpose: Owner signup via /for-cafes/auth should immediately
-- get owner role, not customer. Restore role from signup metadata.
-- ============================================================

-- Override handle_new_user to respect role from signup metadata.
-- Owners signing up via /for-cafes/auth pass role:"owner" in metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role public.app_role;
  _is_guest boolean;
BEGIN
  -- Use role from signup metadata if provided, otherwise default to customer.
  _role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::public.app_role,
    'customer'
  );

  _is_guest := COALESCE(
    NEW.is_anonymous,
    (NEW.raw_user_meta_data->>'is_anonymous')::boolean,
    (NEW.raw_user_meta_data->>'is_guest')::boolean,
    false
  );

  INSERT INTO public.profiles (user_id, role, full_name, email, phone, birthday, is_guest)
  VALUES (
    NEW.id, _role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    NULLIF(NEW.raw_user_meta_data->>'birthday','')::DATE,
    _is_guest
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$ BEGIN RAISE NOTICE 'Owner role assignment fix applied.'; END $$;