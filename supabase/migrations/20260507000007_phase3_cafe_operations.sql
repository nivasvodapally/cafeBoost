-- PHASE 3: Cafe Operations System Features
-- Adds table management, cash drawer tracking, and operational alerts (skipping inventory)
-- Created: 2026-05-07

-- 1. Create table_status enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'table_status') THEN
    CREATE TYPE public.table_status AS ENUM ('available', 'occupied', 'reserved', 'cleaning', 'out_of_service');
  END IF;
END $$;

-- 2. Create tables table for table management
CREATE TABLE IF NOT EXISTS public.tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  table_number VARCHAR(20) NOT NULL,
  table_name VARCHAR(100),
  capacity INTEGER NOT NULL DEFAULT 2,
  status public.table_status DEFAULT 'available',
  current_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  current_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  location_description TEXT,
  qr_code_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cafe_id, table_number)
);

-- 3. Create cash_drawer_transactions table
CREATE TABLE IF NOT EXISTS public.cash_drawer_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  staff_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('open', 'close', 'cash_in', 'cash_out', 'sale', 'refund', 'adjustment')),
  amount NUMERIC(10,2) NOT NULL,
  previous_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  new_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  reference_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  reference_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 4. Create operational_alerts table
CREATE TABLE IF NOT EXISTS public.operational_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('low_stock', 'equipment_issue', 'staff_shortage', 'high_wait_time', 'payment_issue', 'system_alert')),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Add table management settings to cafes table
ALTER TABLE public.cafes ADD COLUMN IF NOT EXISTS table_management_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.cafes ADD COLUMN IF NOT EXISTS cash_drawer_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.cafes ADD COLUMN IF NOT EXISTS operational_alerts_enabled BOOLEAN DEFAULT TRUE;

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tables_cafe_id ON public.tables(cafe_id);
CREATE INDEX IF NOT EXISTS idx_tables_status ON public.tables(status);
CREATE INDEX IF NOT EXISTS idx_tables_current_order ON public.tables(current_order_id) WHERE current_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cash_drawer_cafe_id ON public.cash_drawer_transactions(cafe_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_created_at ON public.cash_drawer_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_cafe_id ON public.operational_alerts(cafe_id);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_resolved ON public.operational_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_created_at ON public.operational_alerts(created_at DESC);

-- 7. Create RLS policies
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_drawer_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_alerts ENABLE ROW LEVEL SECURITY;

-- Tables RLS: Staff can view, owners/managers can manage
CREATE POLICY "Staff can view tables" ON public.tables
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cafe_staff WHERE cafe_staff.cafe_id = tables.cafe_id AND cafe_staff.user_id = auth.uid())
  );

CREATE POLICY "Owners and managers can manage tables" ON public.tables
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.cafe_staff 
            WHERE cafe_staff.cafe_id = tables.cafe_id 
            AND cafe_staff.user_id = auth.uid() 
            AND cafe_staff.role IN ('owner', 'manager'))
  );

-- Cash drawer RLS: Staff can view, owners/managers/cashiers can manage
CREATE POLICY "Staff can view cash drawer transactions" ON public.cash_drawer_transactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cafe_staff WHERE cafe_staff.cafe_id = cash_drawer_transactions.cafe_id AND cafe_staff.user_id = auth.uid())
  );

CREATE POLICY "Authorized staff can manage cash drawer" ON public.cash_drawer_transactions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.cafe_staff 
            WHERE cafe_staff.cafe_id = cash_drawer_transactions.cafe_id 
            AND cafe_staff.user_id = auth.uid() 
            AND cafe_staff.role IN ('owner', 'manager', 'cashier'))
  );

-- Operational alerts RLS: Staff can view and update, owners/managers can manage
CREATE POLICY "Staff can view operational alerts" ON public.operational_alerts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cafe_staff WHERE cafe_staff.cafe_id = operational_alerts.cafe_id AND cafe_staff.user_id = auth.uid())
  );

CREATE POLICY "Staff can update operational alerts" ON public.operational_alerts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.cafe_staff WHERE cafe_staff.cafe_id = operational_alerts.cafe_id AND cafe_staff.user_id = auth.uid())
  );

CREATE POLICY "Owners and managers can manage operational alerts" ON public.operational_alerts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.cafe_staff
            WHERE cafe_staff.cafe_id = operational_alerts.cafe_id
            AND cafe_staff.user_id = auth.uid()
            AND cafe_staff.role IN ('owner', 'manager'))
  );

-- 8. Create functions for table management

-- Function to update table status
CREATE OR REPLACE FUNCTION public.update_table_status(
  _table_id UUID,
  _status public.table_status,
  _order_id UUID DEFAULT NULL,
  _booking_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated_id UUID;
BEGIN
  UPDATE public.tables
  SET 
    status = _status,
    current_order_id = _order_id,
    current_booking_id = _booking_id,
    updated_at = NOW()
  WHERE id = _table_id
  RETURNING id INTO _updated_id;
  
  RETURN _updated_id;
END;
$$;

-- Function to get available tables for a time slot
CREATE OR REPLACE FUNCTION public.get_available_tables(
  _cafe_id UUID,
  _persons INTEGER,
  _booking_date DATE DEFAULT NULL,
  _booking_time TIME DEFAULT NULL
)
RETURNS TABLE (
  table_id UUID,
  table_number VARCHAR,
  table_name VARCHAR,
  capacity INTEGER,
  status public.table_status,
  location_description TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.table_number,
    t.table_name,
    t.capacity,
    t.status,
    t.location_description
  FROM public.tables t
  WHERE t.cafe_id = _cafe_id
    AND t.status IN ('available', 'reserved')
    AND t.capacity >= _persons
    AND (t.current_booking_id IS NULL OR 
         NOT EXISTS (
           SELECT 1 FROM public.bookings b 
           WHERE b.id = t.current_booking_id 
           AND b.booking_date = _booking_date 
           AND b.booking_time::TIME = _booking_time
           AND b.status IN ('confirmed', 'checked_in')
         ))
  ORDER BY t.capacity, t.table_number;
END;
$$;

-- 9. Create functions for cash drawer management

-- Function to open cash drawer
CREATE OR REPLACE FUNCTION public.open_cash_drawer(
  _cafe_id UUID,
  _opening_amount NUMERIC(10,2),
  _staff_user_id UUID DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _transaction_id UUID;
BEGIN
  INSERT INTO public.cash_drawer_transactions (
    cafe_id,
    staff_user_id,
    transaction_type,
    amount,
    previous_balance,
    new_balance,
    description,
    notes,
    created_by
  ) VALUES (
    _cafe_id,
    _staff_user_id,
    'open',
    _opening_amount,
    0,
    _opening_amount,
    'Cash drawer opened',
    _notes,
    auth.uid()
  ) RETURNING id INTO _transaction_id;
  
  RETURN _transaction_id;
END;
$$;

-- Function to close cash drawer
CREATE OR REPLACE FUNCTION public.close_cash_drawer(
  _cafe_id UUID,
  _closing_amount NUMERIC(10,2),
  _staff_user_id UUID DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _last_balance NUMERIC(10,2);
  _transaction_id UUID;
BEGIN
  -- Get the last balance
  SELECT new_balance INTO _last_balance
  FROM public.cash_drawer_transactions
  WHERE cafe_id = _cafe_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF _last_balance IS NULL THEN
    _last_balance := 0;
  END IF;
  
  INSERT INTO public.cash_drawer_transactions (
    cafe_id,
    staff_user_id,
    transaction_type,
    amount,
    previous_balance,
    new_balance,
    description,
    notes,
    created_by
  ) VALUES (
    _cafe_id,
    _staff_user_id,
    'close',
    _closing_amount,
    _last_balance,
    _closing_amount,
    'Cash drawer closed',
    _notes,
    auth.uid()
  ) RETURNING id INTO _transaction_id;
  
  RETURN _transaction_id;
END;
$$;

-- Function to get cash drawer summary
CREATE OR REPLACE FUNCTION public.get_cash_drawer_summary(
  _cafe_id UUID,
  _date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  opening_balance NUMERIC(10,2),
  closing_balance NUMERIC(10,2),
  total_sales NUMERIC(10,2),
  total_refunds NUMERIC(10,2),
  cash_in NUMERIC(10,2),
  cash_out NUMERIC(10,2),
  expected_balance NUMERIC(10,2),
  discrepancy NUMERIC(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _opening_record RECORD;
  _closing_record RECORD;
BEGIN
  -- Get opening transaction
  SELECT amount, new_balance INTO _opening_record
  FROM public.cash_drawer_transactions
  WHERE cafe_id = _cafe_id
    AND transaction_type = 'open'
    AND DATE(created_at) = _date
  ORDER BY created_at ASC
  LIMIT 1;
  
  -- Get closing transaction
  SELECT amount, new_balance INTO _closing_record
  FROM public.cash_drawer_transactions
  WHERE cafe_id = _cafe_id
    AND transaction_type = 'close'
    AND DATE(created_at) = _date
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Calculate totals
  RETURN QUERY
  SELECT
    COALESCE(_opening_record.new_balance, 0) AS opening_balance,
    COALESCE(_closing_record.new_balance, 0) AS closing_balance,
    COALESCE(SUM(CASE WHEN transaction_type = 'sale' THEN amount ELSE 0 END), 0) AS total_sales,
    COALESCE(SUM(CASE WHEN transaction_type = 'refund' THEN amount ELSE 0 END), 0) AS total_refunds,
    COALESCE(SUM(CASE WHEN transaction_type = 'cash_in' THEN amount ELSE 0 END), 0) AS cash_in,
    COALESCE(SUM(CASE WHEN transaction_type = 'cash_out' THEN amount ELSE 0 END), 0) AS cash_out,
    COALESCE(_opening_record.new_balance, 0) + 
    COALESCE(SUM(CASE WHEN transaction_type IN ('sale', 'cash_in') THEN amount ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN transaction_type IN ('refund', 'cash_out') THEN amount ELSE 0 END), 0) AS expected_balance,
    COALESCE(_closing_record.new_balance, 0) - (
      COALESCE(_opening_record.new_balance, 0) + 
      COALESCE(SUM(CASE WHEN transaction_type IN ('sale', 'cash_in') THEN amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN transaction_type IN ('refund', 'cash_out') THEN amount ELSE 0 END), 0)
    ) AS discrepancy
  FROM public.cash_drawer_transactions
  WHERE cafe_id = _cafe_id
    AND DATE(created_at) = _date
    AND transaction_type IN ('sale', 'refund', 'cash_in', 'cash_out');
END;
$$;

-- 10. Create functions for operational alerts

-- Function to create operational alert
CREATE OR REPLACE FUNCTION public.create_operational_alert(
  _cafe_id UUID,
  _alert_type VARCHAR(50),
  _severity VARCHAR(20),
  _title VARCHAR(200),
  _description TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alert_id UUID;
BEGIN
  INSERT INTO public.operational_alerts (
    cafe_id,
    alert_type,
    severity,
    title,
    description,
    metadata
  ) VALUES (
    _cafe_id,
    _alert_type,
    _severity,
    _title,
    _description,
    _metadata
  ) RETURNING id INTO _alert_id;
  
  RETURN _alert_id;
END;
$$;

-- Function to resolve operational alert
CREATE OR REPLACE FUNCTION public.resolve_operational_alert(
  _alert_id UUID,
  _resolved_by UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.operational_alerts
  SET 
    resolved = TRUE,
    resolved_at = NOW(),
    resolved_by = COALESCE(_resolved_by, auth.uid()),
    updated_at = NOW()
  WHERE id = _alert_id;
  
  RETURN FOUND;
END;
$$;

-- 11. Create triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_operational_alerts_updated_at BEFORE UPDATE ON public.operational_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 12. Add sample data for testing (optional, can be removed in production)
INSERT INTO public.tables (cafe_id, table_number, table_name, capacity, status, location_description)
SELECT 
  c.id,
  'T' || row_number() OVER (ORDER BY c.id),
  'Table ' || row_number() OVER (ORDER BY c.id),
  CASE 
    WHEN row_number() OVER (PARTITION BY c.id) % 4 = 0 THEN 6
    WHEN row_number() OVER (PARTITION BY c.id) % 3 = 0 THEN 4
    ELSE 2
  END,
  'available',
  'Main dining area'
FROM public.cafes c
CROSS JOIN generate_series(1, 8) -- 8 tables per cafe
WHERE NOT EXISTS (SELECT 1 FROM public.tables WHERE cafe_id = c.id LIMIT 1)
ON CONFLICT DO NOTHING;