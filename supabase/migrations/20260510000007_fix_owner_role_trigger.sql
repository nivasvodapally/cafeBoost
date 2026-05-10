-- ============================================================
-- MIGRATION: fix_owner_role_on_signup.sql
-- Date: 2026-05-10
-- Purpose: Owner signup via /for-cafes/auth should immediately
-- get owner role from metadata, not default to customer.
-- ============================================================

-- Override handle_new_user to respect role from signup metadata.
-- Owners signing up via /for-cafes/auth pass role:"owner" in metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role text;
  _is_guest boolean;
BEGIN
  -- Get role from user metadata OR app metadata (Supabase can store in either)
  _role := COALESCE(
    NEW.raw_user_meta_data->>'role',
    NEW.raw_app_meta_data->>'role',
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
    NEW.id, _role::public.app_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    NULLIF(NEW.raw_user_meta_data->>'birthday','')::DATE,
    _is_guest
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$ BEGIN RAISE NOTICE 'Owner role on signup fix applied.'; END $$;