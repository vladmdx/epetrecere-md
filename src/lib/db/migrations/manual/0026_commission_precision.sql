-- Retain cents: 5% of EUR 450 is EUR 22.50, never EUR 23.
ALTER TABLE commissions ALTER COLUMN amount TYPE numeric(12, 2) USING amount::numeric(12, 2);
