ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS client_confirmed_at timestamptz;
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
