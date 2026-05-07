-- PHASE 2: Booking System Improvement Features
-- Adds waitlist system and enhanced analytics (without SMS)
-- Created: 2026-05-07

-- 1. Add waitlist system columns to bookings table
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS waitlist_position INTEGER;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS waitlist_added_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS waitlist_promoted_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS estimated_wait_time_minutes INTEGER;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS waitlist_notes TEXT;

-- 2. Add booking analytics columns
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS no_show_count INTEGER DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS total_visits INTEGER DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS average_spend NUMERIC(10,2);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS preferred_time TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS special_requests TEXT;

-- 3. Create waitlist_status enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
    CREATE TYPE public.waitlist_status AS ENUM ('active', 'promoted', 'cancelled', 'expired');
  END IF;
END $$;

-- 4. Add waitlist_status column
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS waitlist_status public.waitlist_status;

-- 5. Create function to add booking to waitlist
CREATE OR REPLACE FUNCTION public.add_to_waitlist(
  _cafe_id UUID,
  _customer_user_id UUID,
  _customer_name TEXT,
  _customer_phone TEXT,
  _booking_date DATE,
  _booking_time TEXT,
  _persons INTEGER,
  _notes TEXT DEFAULT NULL,
  _special_requests TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _booking_id UUID;
  _waitlist_position INTEGER;
  _estimated_wait_time INTEGER;
BEGIN
  -- Calculate waitlist position (count of active waitlist bookings for same time slot)
  SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO _waitlist_position
  FROM public.bookings
  WHERE cafe_id = _cafe_id
    AND booking_date = _booking_date
    AND booking_time = _booking_time
    AND waitlist_status = 'active';
  
  -- Estimate wait time (15 minutes per position)
  _estimated_wait_time := _waitlist_position * 15;
  
  -- Create waitlist booking
  INSERT INTO public.bookings (
    cafe_id,
    customer_user_id,
    customer_name,
    customer_phone,
    booking_date,
    booking_time,
    persons,
    status,
    notes,
    waitlist_position,
    waitlist_added_at,
    estimated_wait_time_minutes,
    waitlist_status,
    special_requests
  ) VALUES (
    _cafe_id,
    _customer_user_id,
    _customer_name,
    _customer_phone,
    _booking_date,
    _booking_time,
    _persons,
    'pending',
    _notes,
    _waitlist_position,
    NOW(),
    _estimated_wait_time,
    'active',
    _special_requests
  )
  RETURNING id INTO _booking_id;
  
  RETURN _booking_id;
END;
$$;

-- 6. Create function to promote waitlist booking to confirmed
CREATE OR REPLACE FUNCTION public.promote_waitlist_booking(
  _booking_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cafe_id UUID;
  _booking_date DATE;
  _booking_time TEXT;
  _next_waitlist_position INTEGER;
BEGIN
  -- Get booking details
  SELECT cafe_id, booking_date, booking_time
  INTO _cafe_id, _booking_date, _booking_time
  FROM public.bookings
  WHERE id = _booking_id
    AND waitlist_status = 'active'
    AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Promote the booking
  UPDATE public.bookings
  SET 
    status = 'confirmed',
    waitlist_status = 'promoted',
    waitlist_promoted_at = NOW(),
    estimated_wait_time_minutes = NULL
  WHERE id = _booking_id;
  
  -- Update waitlist positions for remaining bookings
  UPDATE public.bookings b
  SET waitlist_position = b2.new_position
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_added_at) as new_position
    FROM public.bookings
    WHERE cafe_id = _cafe_id
      AND booking_date = _booking_date
      AND booking_time = _booking_time
      AND waitlist_status = 'active'
      AND status = 'pending'
  ) b2
  WHERE b.id = b2.id;
  
  -- Update estimated wait times for remaining bookings
  UPDATE public.bookings
  SET estimated_wait_time_minutes = waitlist_position * 15
  WHERE cafe_id = _cafe_id
    AND booking_date = _booking_date
    AND booking_time = _booking_time
    AND waitlist_status = 'active'
    AND status = 'pending';
  
  RETURN TRUE;
END;
$$;

-- 7. Create function to get waitlist analytics
CREATE OR REPLACE FUNCTION public.get_waitlist_analytics(
  _cafe_id UUID,
  _start_date DATE DEFAULT NULL,
  _end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  total_waitlist_bookings BIGINT,
  average_wait_time_minutes NUMERIC,
  promotion_rate NUMERIC,
  average_party_size NUMERIC,
  peak_waitlist_time TEXT,
  most_common_party_size INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH waitlist_data AS (
    SELECT 
      b.*,
      CASE WHEN b.waitlist_status = 'promoted' THEN 1 ELSE 0 END as promoted
    FROM public.bookings b
    WHERE b.cafe_id = _cafe_id
      AND b.waitlist_position IS NOT NULL
      AND (_start_date IS NULL OR b.booking_date >= _start_date)
      AND (_end_date IS NULL OR b.booking_date <= _end_date)
  )
  SELECT
    COUNT(*)::BIGINT as total_waitlist_bookings,
    AVG(estimated_wait_time_minutes) as average_wait_time_minutes,
    AVG(promoted::INTEGER) * 100 as promotion_rate,
    AVG(persons) as average_party_size,
    MODE() WITHIN GROUP (ORDER BY booking_time) as peak_waitlist_time,
    MODE() WITHIN GROUP (ORDER BY persons)::INTEGER as most_common_party_size
  FROM waitlist_data;
END;
$$;

-- 8. Create function to send booking reminders (in-app only, no SMS)
CREATE OR REPLACE FUNCTION public.send_booking_reminder(
  _booking_id UUID,
  _reminder_type TEXT DEFAULT 'upcoming'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _customer_user_id UUID;
  _cafe_id UUID;
  _booking_date DATE;
  _booking_time TEXT;
  _customer_name TEXT;
  _message TEXT;
BEGIN
  -- Get booking details
  SELECT customer_user_id, cafe_id, booking_date, booking_time, customer_name
  INTO _customer_user_id, _cafe_id, _booking_date, _booking_time, _customer_name
  FROM public.bookings
  WHERE id = _booking_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Create reminder message based on type
  CASE _reminder_type
    WHEN 'upcoming' THEN
      _message := format('Reminder: Your booking at %s is scheduled for %s at %s.', 
        (SELECT name FROM public.cafes WHERE id = _cafe_id),
        _booking_date,
        _booking_time
      );
    WHEN 'waitlist_promoted' THEN
      _message := format('Good news! Your waitlist booking has been confirmed for %s at %s.', 
        _booking_date,
        _booking_time
      );
    WHEN 'tomorrow' THEN
      _message := format('Reminder: Your booking is tomorrow (%s) at %s.', 
        _booking_date,
        _booking_time
      );
    ELSE
      _message := format('Reminder about your booking on %s at %s.', 
        _booking_date,
        _booking_time
      );
  END CASE;
  
  -- Create in-app notification (instead of SMS)
  INSERT INTO public.notifications (
    user_id,
    cafe_id,
    title,
    body,
    kind,
    metadata
  ) VALUES (
    _customer_user_id,
    _cafe_id,
    'Booking Reminder',
    _message,
    'booking_reminder',
    jsonb_build_object(
      'booking_id', _booking_id,
      'booking_date', _booking_date,
      'booking_time', _booking_time,
      'reminder_type', _reminder_type
    )
  );
  
  RETURN TRUE;
END;
$$;

-- 9. Create function to get booking analytics dashboard
CREATE OR REPLACE FUNCTION public.get_booking_analytics_dashboard(
  _cafe_id UUID,
  _days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  total_bookings BIGINT,
  confirmed_bookings BIGINT,
  waitlist_bookings BIGINT,
  no_show_count BIGINT,
  cancellation_rate NUMERIC,
  average_party_size NUMERIC,
  peak_hour TEXT,
  most_popular_day TEXT,
  revenue_from_bookings NUMERIC,
  repeat_customer_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH booking_stats AS (
    SELECT 
      b.*,
      o.total_amount as order_amount,
      LAG(b.customer_user_id) OVER (PARTITION BY b.customer_user_id ORDER BY b.created_at) as prev_booking
    FROM public.bookings b
    LEFT JOIN public.orders o ON o.customer_user_id = b.customer_user_id 
      AND o.cafe_id = b.cafe_id
      AND o.created_at::DATE = b.booking_date
    WHERE b.cafe_id = _cafe_id
      AND b.booking_date >= CURRENT_DATE - (_days_back || ' days')::INTERVAL
  ),
  aggregated AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
      COUNT(*) FILTER (WHERE waitlist_position IS NOT NULL) as waitlist,
      COUNT(*) FILTER (WHERE status = 'no_show') as no_shows,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
      AVG(persons) as avg_party,
      MODE() WITHIN GROUP (ORDER BY EXTRACT(HOUR FROM booking_time::TIME)) as peak_hour_num,
      MODE() WITHIN GROUP (ORDER BY EXTRACT(DOW FROM booking_date)) as peak_day_num,
      SUM(COALESCE(order_amount, 0)) as revenue,
      COUNT(DISTINCT customer_user_id) as unique_customers,
      COUNT(DISTINCT customer_user_id) FILTER (WHERE prev_booking IS NOT NULL) as repeat_customers
    FROM booking_stats
  )
  SELECT
    total::BIGINT,
    confirmed::BIGINT,
    waitlist::BIGINT,
    no_shows::BIGINT,
    (cancelled::NUMERIC / NULLIF(total, 0) * 100) as cancellation_rate,
    avg_party,
    LPAD(peak_hour_num::TEXT, 2, '0') || ':00' as peak_hour,
    CASE peak_day_num
      WHEN 0 THEN 'Sunday'
      WHEN 1 THEN 'Monday'
      WHEN 2 THEN 'Tuesday'
      WHEN 3 THEN 'Wednesday'
      WHEN 4 THEN 'Thursday'
      WHEN 5 THEN 'Friday'
      WHEN 6 THEN 'Saturday'
    END as most_popular_day,
    revenue,
    (repeat_customers::NUMERIC / NULLIF(unique_customers, 0) * 100) as repeat_customer_rate
  FROM aggregated;
END;
$$;

-- 10. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bookings_waitlist_status ON public.bookings(waitlist_status) WHERE waitlist_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_waitlist_position ON public.bookings(waitlist_position) WHERE waitlist_position IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_analytics_date ON public.bookings(cafe_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_history ON public.bookings(customer_user_id, cafe_id, booking_date);

-- 11. Update existing bookings to have default values
UPDATE public.bookings 
SET 
  waitlist_status = CASE 
    WHEN waitlist_position IS NOT NULL THEN 'active'::public.waitlist_status
    ELSE NULL 
  END,
  no_show_count = CASE 
    WHEN status = 'no_show' THEN 1 
    ELSE 0 
  END
WHERE waitlist_status IS NULL;

-- 12. Add RLS policy for waitlist management
DROP POLICY IF EXISTS "Customers can join waitlist" ON public.bookings;
CREATE POLICY "Customers can join waitlist" ON public.bookings
  FOR INSERT WITH CHECK (
    auth.uid() = customer_user_id
    AND status = 'pending'
    AND waitlist_position IS NOT NULL
  );

DROP POLICY IF EXISTS "Staff can manage waitlist" ON public.bookings;
CREATE POLICY "Staff can manage waitlist" ON public.bookings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.cafe_staff sa
      WHERE sa.user_id = auth.uid()
        AND sa.cafe_id = bookings.cafe_id
        AND sa.role IN ('owner', 'manager', 'cashier')
    )
  );

COMMENT ON COLUMN public.bookings.waitlist_position IS 'Position in waitlist (1 = next)';
COMMENT ON COLUMN public.bookings.waitlist_added_at IS 'When customer joined waitlist';
COMMENT ON COLUMN public.bookings.waitlist_promoted_at IS 'When waitlist booking was promoted to confirmed';
COMMENT ON COLUMN public.bookings.estimated_wait_time_minutes IS 'Estimated wait time in minutes';
COMMENT ON COLUMN public.bookings.waitlist_status IS 'Status of waitlist booking: active, promoted, cancelled, expired';
COMMENT ON COLUMN public.bookings.no_show_count IS 'Number of times this customer has been a no-show';
COMMENT ON COLUMN public.bookings.total_visits IS 'Total number of visits by this customer';
COMMENT ON COLUMN public.bookings.average_spend IS 'Average spend per visit';
COMMENT ON COLUMN public.bookings.preferred_time IS 'Customer''s preferred booking time';
COMMENT ON COLUMN public.bookings.special_requests IS 'Special requests or notes for the booking';