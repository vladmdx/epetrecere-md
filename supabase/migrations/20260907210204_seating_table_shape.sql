-- Additive only: existing tables retain NULL and their legacy visual fallback.
-- Apply before deploying code that selects seating_tables.shape.
ALTER TABLE public.seating_tables ADD COLUMN IF NOT EXISTS shape text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'seating_tables_shape_check'
      AND conrelid = 'public.seating_tables'::regclass
  ) THEN
    ALTER TABLE public.seating_tables
      ADD CONSTRAINT seating_tables_shape_check
      CHECK (shape IS NULL OR shape IN ('round', 'rectangular', 'long'));
  END IF;
END $$;
