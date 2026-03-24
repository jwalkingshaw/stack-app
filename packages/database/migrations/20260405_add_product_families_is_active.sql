ALTER TABLE public.product_families
ADD COLUMN IF NOT EXISTS is_active boolean;

UPDATE public.product_families
SET is_active = true
WHERE is_active IS NULL;

ALTER TABLE public.product_families
ALTER COLUMN is_active SET DEFAULT true;

ALTER TABLE public.product_families
ALTER COLUMN is_active SET NOT NULL;
