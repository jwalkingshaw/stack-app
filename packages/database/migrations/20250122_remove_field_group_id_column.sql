-- Remove field_group_id column from product_fields table
-- This column will be replaced by junction tables for many-to-many relationships

-- First, remove any foreign key constraints
ALTER TABLE product_fields DROP CONSTRAINT IF EXISTS product_fields_field_group_id_fkey;

-- Remove the column
ALTER TABLE product_fields DROP COLUMN IF EXISTS field_group_id;

-- Update the GET query to remove field_groups join since we no longer have the direct relationship
-- (This will need to be updated in the API code as well)