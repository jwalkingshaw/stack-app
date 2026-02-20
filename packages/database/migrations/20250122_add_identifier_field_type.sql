-- Add 'identifier' to the field_type check constraint

-- First, let's see the current constraint
-- ALTER TABLE product_fields DROP CONSTRAINT product_fields_field_type_check;

-- Add the new constraint with 'identifier' included
ALTER TABLE product_fields DROP CONSTRAINT IF EXISTS product_fields_field_type_check;

ALTER TABLE product_fields ADD CONSTRAINT product_fields_field_type_check
CHECK (field_type IN (
  'identifier',
  'text',
  'textarea',
  'number',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'select',
  'multiselect',
  'file',
  'image',
  'url',
  'price',
  'measurement',
  'table'
));