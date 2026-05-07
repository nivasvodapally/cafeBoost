-- Business-critical features: table QR codes, split bill, order timer, staff metrics

-- 1. Table QR codes enhancement
-- Add QR code URL column to tables for easy scanning
ALTER TABLE tables 
ADD COLUMN IF NOT EXISTS qr_code_url TEXT,
ADD COLUMN IF NOT EXISTS qr_code_generated_at TIMESTAMPTZ;

-- Function to generate table QR code
CREATE OR REPLACE FUNCTION generate_table_qr_code(
  table_id UUID,
  cafe_id UUID
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  table_record RECORD;
  qr_url TEXT;
BEGIN
  -- Get table details
  SELECT table_number, table_name INTO table_record
  FROM tables 
  WHERE id = table_id AND cafe_id = generate_table_qr_code.cafe_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table not found or does not belong to cafe';
  END IF;
  
  -- Generate QR code URL (frontend will handle actual QR generation)
  qr_url := format(
    '%s/app/table/%s?cafe=%s&table=%s',
    (SELECT get_site_url()),
    table_id,
    cafe_id,
    table_record.table_number
  );
  
  -- Update table with QR code URL
  UPDATE tables 
  SET qr_code_url = qr_url,
      qr_code_generated_at = NOW()
  WHERE id = table_id;
  
  RETURN qr_url;
END;
$$;

-- 2. Split bill functionality
-- Create split_bills table to track bill splits
CREATE TABLE IF NOT EXISTS split_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  split_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  split_type TEXT NOT NULL CHECK (split_type IN ('equal', 'percentage', 'custom')),
  split_details JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(original_order_id, split_order_id)
);

-- Function to split bill
CREATE OR REPLACE FUNCTION split_bill(
  order_id UUID,
  split_type TEXT,
  split_details JSONB,
  user_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  original_order RECORD;
  new_order_id UUID;
  split_amount_cents INTEGER;
BEGIN
  -- Get original order details
  SELECT * INTO original_order
  FROM orders 
  WHERE id = order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  
  -- Create new order as a split (using existing split_order function)
  SELECT split_order(order_id, user_id, 'Bill split') INTO new_order_id;
  
  -- Record split bill details
  INSERT INTO split_bills (
    original_order_id,
    split_order_id,
    split_type,
    split_details,
    created_by
  ) VALUES (
    order_id,
    new_order_id,
    split_type,
    split_details,
    user_id
  );
  
  RETURN new_order_id;
END;
$$;

-- 3. Order timer enhancement
-- Add timer columns to orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS timer_paused_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS timer_total_seconds INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS timer_expected_seconds INTEGER,
ADD COLUMN IF NOT EXISTS timer_alert_sent BOOLEAN DEFAULT FALSE;

-- Function to start order timer
CREATE OR REPLACE FUNCTION start_order_timer(
  order_id UUID,
  expected_minutes INTEGER DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE orders 
  SET timer_started_at = NOW(),
      timer_expected_seconds = expected_minutes * 60,
      timer_paused_at = NULL,
      timer_alert_sent = FALSE
  WHERE id = order_id;
END;
$$;

-- Function to pause order timer
CREATE OR REPLACE FUNCTION pause_order_timer(
  order_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  started_at TIMESTAMPTZ;
  current_total INTEGER;
BEGIN
  SELECT timer_started_at, timer_total_seconds INTO started_at, current_total
  FROM orders 
  WHERE id = order_id;
  
  IF started_at IS NOT NULL THEN
    -- Calculate elapsed seconds since start
    UPDATE orders 
    SET timer_paused_at = NOW(),
        timer_total_seconds = COALESCE(current_total, 0) + EXTRACT(EPOCH FROM (NOW() - started_at))
    WHERE id = order_id;
  END IF;
END;
$$;

-- Function to resume order timer
CREATE OR REPLACE FUNCTION resume_order_timer(
  order_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE orders 
  SET timer_started_at = NOW(),
      timer_paused_at = NULL
  WHERE id = order_id;
END;
$$;

-- Function to get order timer status
CREATE OR REPLACE FUNCTION get_order_timer_status(
  order_id UUID
) RETURNS TABLE(
  elapsed_seconds INTEGER,
  expected_seconds INTEGER,
  is_running BOOLEAN,
  is_paused BOOLEAN,
  should_alert BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_record RECORD;
  elapsed INTEGER;
BEGIN
  SELECT timer_started_at, timer_paused_at, timer_total_seconds, timer_expected_seconds, timer_alert_sent
  INTO order_record
  FROM orders 
  WHERE id = order_id;
  
  elapsed := COALESCE(order_record.timer_total_seconds, 0);
  
  IF order_record.timer_started_at IS NOT NULL AND order_record.timer_paused_at IS NULL THEN
    elapsed := elapsed + EXTRACT(EPOCH FROM (NOW() - order_record.timer_started_at));
  END IF;
  
  RETURN QUERY SELECT
    elapsed,
    order_record.timer_expected_seconds,
    order_record.timer_started_at IS NOT NULL AND order_record.timer_paused_at IS NULL,
    order_record.timer_paused_at IS NOT NULL,
    order_record.timer_expected_seconds IS NOT NULL 
      AND elapsed > order_record.timer_expected_seconds 
      AND NOT order_record.timer_alert_sent;
END;
$$;

-- 4. Staff metrics enhancement
-- Create staff_performance_snapshots table for detailed metrics
CREATE TABLE IF NOT EXISTS staff_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cafe_id UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, cafe_id, snapshot_date)
);

-- Function to record staff performance snapshot
CREATE OR REPLACE FUNCTION record_staff_performance_snapshot(
  staff_id UUID,
  cafe_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  metrics JSONB;
BEGIN
  -- Calculate various performance metrics
  SELECT jsonb_build_object(
    'orders_processed', COUNT(DISTINCT o.id),
    'orders_per_hour', ROUND(COUNT(DISTINCT o.id) / NULLIF(EXTRACT(HOUR FROM NOW() - MIN(o.created_at)), 0), 2),
    'average_preparation_time', ROUND(AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))), 2),
    'cancellation_rate', ROUND(COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) * 100.0 / NULLIF(COUNT(o.id), 0), 2),
    'total_revenue', COALESCE(SUM(o.total_amount_cents), 0),
    'customer_satisfaction', COALESCE(AVG(f.rating), 0)
  ) INTO metrics
  FROM orders o
  LEFT JOIN customer_feedback f ON f.order_id = o.id AND f.cafe_id = record_staff_performance_snapshot.cafe_id
  WHERE o.cafe_id = record_staff_performance_snapshot.cafe_id
    AND o.status IN ('completed', 'delivered', 'cancelled')
    AND o.created_at >= CURRENT_DATE
    AND EXISTS (
      SELECT 1 FROM order_items oi
      WHERE oi.order_id = o.id
        AND oi.prepared_by = record_staff_performance_snapshot.staff_id
    );
  
  -- Insert or update snapshot
  INSERT INTO staff_performance_snapshots (staff_id, cafe_id, snapshot_date, metrics)
  VALUES (staff_id, cafe_id, CURRENT_DATE, metrics)
  ON CONFLICT (staff_id, cafe_id, snapshot_date) 
  DO UPDATE SET metrics = EXCLUDED.metrics;
  
  RETURN metrics;
END;
$$;

-- Function to get staff leaderboard
CREATE OR REPLACE FUNCTION get_staff_leaderboard(
  cafe_id UUID,
  period_days INTEGER DEFAULT 7
) RETURNS TABLE(
  staff_id UUID,
  staff_name TEXT,
  role TEXT,
  orders_processed INTEGER,
  average_preparation_time_seconds NUMERIC,
  customer_satisfaction_rating NUMERIC,
  rank INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH staff_stats AS (
    SELECT 
      p.id as staff_id,
      p.full_name as staff_name,
      p.role,
      COUNT(DISTINCT o.id) as orders_processed,
      ROUND(AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at)))) as avg_prep_time,
      ROUND(AVG(f.rating), 2) as satisfaction_rating
    FROM profiles p
    LEFT JOIN order_items oi ON oi.prepared_by = p.id
    LEFT JOIN orders o ON o.id = oi.order_id 
      AND o.cafe_id = get_staff_leaderboard.cafe_id
      AND o.created_at >= NOW() - (period_days || ' days')::INTERVAL
    LEFT JOIN customer_feedback f ON f.order_id = o.id AND f.cafe_id = get_staff_leaderboard.cafe_id
    WHERE p.cafe_id = get_staff_leaderboard.cafe_id
      AND p.role IN ('chef', 'waiter', 'runner', 'cashier')
    GROUP BY p.id, p.full_name, p.role
  )
  SELECT 
    staff_id,
    staff_name,
    role,
    orders_processed,
    avg_prep_time,
    satisfaction_rating,
    ROW_NUMBER() OVER (ORDER BY orders_processed DESC, satisfaction_rating DESC) as rank
  FROM staff_stats
  ORDER BY rank;
END;
$$;

-- RLS policies
ALTER TABLE split_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_performance_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS for split_bills
CREATE POLICY "Users can view split bills for their orders" ON split_bills
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = split_bills.original_order_id
        AND (o.customer_user_id = auth.uid() OR o.cafe_id IN (
          SELECT cafe_id FROM cafe_staff WHERE user_id = auth.uid()
        ))
    )
  );

CREATE POLICY "Staff can create split bills" ON split_bills
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM cafe_staff sa
      WHERE sa.user_id = auth.uid()
        AND sa.cafe_id IN (
          SELECT cafe_id FROM orders WHERE id = split_bills.original_order_id
        )
    )
  );

-- RLS for staff_performance_snapshots
CREATE POLICY "Staff can view their own performance" ON staff_performance_snapshots
  FOR SELECT USING (
    staff_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM cafe_staff sa
      WHERE sa.user_id = auth.uid()
        AND sa.cafe_id = staff_performance_snapshots.cafe_id
        AND sa.role IN ('owner', 'manager')
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_split_bills_original_order ON split_bills(original_order_id);
CREATE INDEX IF NOT EXISTS idx_split_bills_split_order ON split_bills(split_order_id);
CREATE INDEX IF NOT EXISTS idx_staff_performance_snapshots_staff_cafe ON staff_performance_snapshots(staff_id, cafe_id);
CREATE INDEX IF NOT EXISTS idx_staff_performance_snapshots_date ON staff_performance_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_tables_qr_code_url ON tables(qr_code_url) WHERE qr_code_url IS NOT NULL;

-- Add settings to cafes table
ALTER TABLE cafes 
ADD COLUMN IF NOT EXISTS table_qr_codes_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS split_bill_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS order_timer_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS staff_metrics_enabled BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN cafes.table_qr_codes_enabled IS 'Enable QR codes for tables';
COMMENT ON COLUMN cafes.split_bill_enabled IS 'Enable split bill functionality';
COMMENT ON COLUMN cafes.order_timer_enabled IS 'Enable order timer tracking';
COMMENT ON COLUMN cafes.staff_metrics_enabled IS 'Enable staff performance metrics';

-- Update existing cafes to have these features enabled by default
UPDATE cafes SET
  table_qr_codes_enabled = COALESCE(table_qr_codes_enabled, TRUE),
  split_bill_enabled = COALESCE(split_bill_enabled, TRUE),
  order_timer_enabled = COALESCE(order_timer_enabled, TRUE),
  staff_metrics_enabled = COALESCE(staff_metrics_enabled, TRUE);