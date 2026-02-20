-- Add code column to product_families for URL-friendly slugs
ALTER TABLE product_families
ADD COLUMN IF NOT EXISTS code VARCHAR(255);

-- Generate codes from existing names (lowercase, replace spaces with hyphens)
UPDATE product_families
SET code = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE code IS NULL;

-- Make code required and unique per organization
ALTER TABLE product_families
ALTER COLUMN code SET NOT NULL;

-- Add unique constraint
ALTER TABLE product_families
ADD CONSTRAINT unique_family_code_per_org UNIQUE (organization_id, code);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_product_families_code ON product_families(code);