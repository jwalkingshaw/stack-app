-- Migration: Update product status values for new workflow

-- Normalize existing statuses to new workflow values
UPDATE products SET status = 'Draft' WHERE status IN ('draft', 'DRAFT');
UPDATE products SET status = 'Active' WHERE status IN ('active', 'ACTIVE');
UPDATE products SET status = 'Discontinued' WHERE status IN ('discontinued', 'DISCONTINUED');
UPDATE products SET status = 'Archived' WHERE status IN ('Inactive', 'inactive', 'INACTIVE');
UPDATE products SET status = 'Enrichment' WHERE status IN ('Development', 'development', 'DEVELOPMENT');
UPDATE products SET status = 'Review' WHERE status IN ('Pending Launch', 'pending launch', 'PENDING LAUNCH', 'Review', 'review', 'REVIEW');
UPDATE products SET status = 'Draft' WHERE status IS NULL;

-- Update the status constraint to match new workflow
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE products
  ADD CONSTRAINT products_status_check CHECK (
    status IN ('Draft', 'Enrichment', 'Review', 'Active', 'Discontinued', 'Archived')
  );
