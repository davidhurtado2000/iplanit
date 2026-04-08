-- Add USD price column to services table for dual-currency pricing
ALTER TABLE services ADD COLUMN IF NOT EXISTS price_usd NUMERIC(10,2);
