-- Add ability to disable staff runner/KDS entirely
-- This allows cafe owners to turn off staff runner and KDS functionality if they don't need it

-- Add staff_runner_enabled column to cafes table
ALTER TABLE public.cafes ADD COLUMN IF NOT EXISTS staff_runner_enabled BOOLEAN DEFAULT TRUE;

-- Add kds_enabled column to cafes table (separate from staff runner)
ALTER TABLE public.cafes ADD COLUMN IF NOT EXISTS kds_enabled BOOLEAN DEFAULT TRUE;

-- Update existing cafes to have these enabled by default (maintains current behavior)
UPDATE public.cafes SET staff_runner_enabled = TRUE WHERE staff_runner_enabled IS NULL;
UPDATE public.cafes SET kds_enabled = TRUE WHERE kds_enabled IS NULL;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_cafes_staff_runner_enabled ON public.cafes(staff_runner_enabled);
CREATE INDEX IF NOT EXISTS idx_cafes_kds_enabled ON public.cafes(kds_enabled);

-- Add comment explaining the columns
COMMENT ON COLUMN public.cafes.staff_runner_enabled IS 'When FALSE, staff runner functionality (staff dashboard, shift management, etc.) is completely disabled for this cafe.';
COMMENT ON COLUMN public.cafes.kds_enabled IS 'When FALSE, KDS (Kitchen Display System) functionality is completely disabled for this cafe.';