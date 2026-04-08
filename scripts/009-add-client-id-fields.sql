-- Add DNI and RUC identification fields to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS dni VARCHAR(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ruc VARCHAR(20);
