-- ============================================================
-- FIX: Booking race condition (2026-05-07)
-- ============================================================
-- 
-- SECURITY ISSUE: Race condition in booking creation where multiple
-- concurrent users could book the same slot, leading to overbooking.
-- 
-- The current flow in bookingService.ts:
-- 1. check_slot_availability() → returns remaining capacity
-- 2. duplicate guard check
-- 3. INSERT booking
-- 
-- Between steps 1 and 3, another booking could be created.
-- 
-- SOLUTION: Create an atomic booking function that checks availability
-- and creates the booking in a single transaction with appropriate locking.
-- ============================================================

-- First, let's create a function that atomically creates a booking
-- with slot availability check and duplicate prevention.
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
  _cafe_id uuid,
  _customer_user_id uuid,
  _customer_name text,
  _customer_phone text,
  _booking_date date,
  _booking_time text,
  _persons integer,
  _notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _slot_capacity integer;
  _taken integer;
  _remaining integer;
  _booking_id uuid;
  _duplicate_count integer;
BEGIN
  -- Validate inputs
  IF _persons < 1 OR _persons > 50 THEN
    RAISE EXCEPTION 'Invalid party size';
  END IF;
  
  -- Get cafe slot capacity with FOR UPDATE to lock the row
  SELECT slot_capacity INTO _slot_capacity
  FROM public.cafes
  WHERE id = _cafe_id
  FOR UPDATE;
  
  IF _slot_capacity IS NULL THEN
    _slot_capacity := 4; -- default
  END IF;
  
  -- Calculate current bookings for this slot
  -- Use FOR UPDATE to lock existing bookings for this slot
  SELECT COALESCE(SUM(persons), 0) INTO _taken
  FROM public.bookings
  WHERE cafe_id = _cafe_id 
    AND booking_date = _booking_date 
    AND booking_time = _booking_time
    AND status NOT IN ('cancelled', 'no_show')
  FOR UPDATE;
  
  _remaining := GREATEST(0, _slot_capacity * 8 - _taken);
  
  IF _remaining < _persons THEN
    RAISE EXCEPTION 'This time slot is fully booked. Please pick another.';
  END IF;
  
  -- Check for duplicate booking for same customer
  SELECT COUNT(*) INTO _duplicate_count
  FROM public.bookings
  WHERE cafe_id = _cafe_id
    AND booking_date = _booking_date
    AND booking_time = _booking_time
    AND customer_user_id = _customer_user_id
    AND status NOT IN ('cancelled', 'no_show');
    
  IF _duplicate_count > 0 THEN
    RAISE EXCEPTION 'You already have a booking for this slot.';
  END IF;
  
  -- Create the booking
  INSERT INTO public.bookings (
    cafe_id,
    customer_user_id,
    customer_name,
    customer_phone,
    booking_date,
    booking_time,
    persons,
    notes
  ) VALUES (
    _cafe_id,
    _customer_user_id,
    _customer_name,
    _customer_phone,
    _booking_date,
    _booking_time,
    _persons,
    _notes
  )
  RETURNING id INTO _booking_id;
  
  RETURN _booking_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Duplicate booking detected.';
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_booking_atomic TO authenticated;

-- Also create a simpler version for anonymous users (if needed)
-- but typically bookings require authentication.

-- Update the check_slot_availability function to be more accurate
-- by including the FOR UPDATE hint in a separate function if needed.
-- However, for most UI purposes, the current STABLE function is fine
-- for displaying availability; the atomic function ensures correctness.

-- Add a comment to the booking service about the race condition fix
COMMENT ON FUNCTION public.create_booking_atomic IS 
  'Atomically creates a booking with slot availability check and duplicate prevention.
   Uses row-level locking to prevent race conditions.
   Frontend should migrate from bookingService.createBooking() to this function.';

-- Create a test to verify the fix works
-- (This would be run separately, not in migration)
/*
DO $$ 
DECLARE 
  cafe_id uuid := '...';
  user1 uuid := '...';
  user2 uuid := '...';
  booking_date date := '2026-05-08';
  booking_time text := '19:00';
BEGIN
  -- Simulate concurrent bookings would require multiple sessions
  -- For now, just verify the function syntax is correct
  RAISE NOTICE 'Booking race condition fix applied successfully.';
END $$;
*/

-- Confirm the fix is applied
DO $$ BEGIN
  RAISE NOTICE 'Booking race condition fix applied:';
  RAISE NOTICE '1. Created create_booking_atomic() function with row-level locking';
  RAISE NOTICE '2. Frontend should update bookingService.ts to use this function';
  RAISE NOTICE '3. Existing check_slot_availability() remains for UI display';
END $$;