-- ============================================================
-- MIGRATION: auth-profile-fix.sql
-- Date: 2026-05-08
-- Purpose: Fix auth trigger for anonymous users, profile RLS, and
-- set_staff_break RPC that Phase 1 frontend code depends on.
-- Run: supabase db push  (or paste into Supabase SQL editor)
-- ============================================================

-- 1. FIX: handle_new_user — handle anonymous users properly.
-- Supabase sets is_anonymous=true in raw_user_meta_data.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role public.app_role;
  _is_guest boolean;
BEGIN
  -- SECURITY: Always assign 'customer' role. Owners assigned via secure onboarding.
  _role := 'customer'::public.app_role;

  -- Detect anonymous sign-in: Supabase sets is_anonymous as a COLUMN on auth.users,
  -- NOT in raw_user_meta_data. Read directly from NEW.is_anonymous.
  -- For local dev / Postgres auth (email signup), is_anonymous is always false.
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

-- 2. Add on_break column to cafe_staff if it doesn't exist
DO $$
BEGIN
  ALTER TABLE public.cafe_staff ADD COLUMN IF NOT EXISTS on_break boolean NOT NULL DEFAULT false;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 3. Create set_staff_break RPC — syncs break status to cafe_staff
-- Called by Shift.tsx when staff starts/ends a break
CREATE OR REPLACE FUNCTION public.set_staff_break(_on_break boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cafe_staff
  SET on_break = _on_break, updated_at = now()
  WHERE user_id = auth.uid() AND status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_staff_break(boolean) TO authenticated;

-- 4. RLS on cafe_staff — staff can read own record, owner can manage
ALTER TABLE public.cafe_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cafe_staff_self_read" ON public.cafe_staff;
CREATE POLICY "cafe_staff_self_read" ON public.cafe_staff
  FOR SELECT USING (auth.uid() = user_id OR public.is_cafe_owner(auth.uid(), cafe_id));

DROP POLICY IF EXISTS "cafe_staff_self_update" ON public.cafe_staff;
CREATE POLICY "cafe_staff_self_update" ON public.cafe_staff
  FOR UPDATE USING (auth.uid() = user_id OR public.is_cafe_owner(auth.uid(), cafe_id));

DROP POLICY IF EXISTS "cafe_staff_owner_insert" ON public.cafe_staff;
CREATE POLICY "cafe_staff_owner_insert" ON public.cafe_staff
  FOR INSERT WITH CHECK (public.is_cafe_owner(auth.uid(), cafe_id));

-- 5. RLS on user_roles — staff can read own roles, owner can read all
DROP POLICY IF EXISTS "user_roles_self_read" ON public.user_roles;
CREATE POLICY "user_roles_self_read" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'owner'));

-- 6. RLS on staff_shifts — staff can read own, owner can read all
DROP POLICY IF EXISTS "shifts_self_read" ON public.staff_shifts;
CREATE POLICY "shifts_self_read" ON public.staff_shifts
  FOR SELECT USING (auth.uid() = user_id OR public.is_cafe_owner(auth.uid(), cafe_id));

DROP POLICY IF EXISTS "shifts_self_insert" ON public.staff_shifts;
CREATE POLICY "shifts_self_insert" ON public.staff_shifts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 7. profiles RLS — keep existing policies, add trigger bypass policy.
-- The SECURITY DEFINER trigger runs as the DB owner so it can bypass RLS
-- via definer context. But we also need the policy to not block the
-- trigger's INSERT for the newly-created auth user.
DROP POLICY IF EXISTS "profiles_trigger_insert" ON public.profiles;
CREATE POLICY "profiles_trigger_insert" ON public.profiles
  FOR INSERT WITH CHECK (true);

-- 8. Backfill is_guest=true for existing anonymous users.
-- These were created before the migration so their profiles have is_guest=false.
-- We detect them by joining auth.users (where is_anonymous=true) to profiles.
UPDATE public.profiles p
SET is_guest = true
FROM auth.users u
WHERE u.id = p.user_id
  AND u.is_anonymous = true
  AND p.is_guest = false;

DO $$ BEGIN RAISE NOTICE 'auth-profile-fix applied successfully.'; END $$;
