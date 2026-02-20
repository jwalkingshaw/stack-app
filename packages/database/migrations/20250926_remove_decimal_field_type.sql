-- Remove 'decimal' and 'datetime' from field_type check constraint
-- NumberField handles decimal values, DateField handles datetime with format options

-- First, update existing rows to use consolidated field types
UPDATE product_fields SET field_type = 'number' WHERE field_type = 'decimal';
UPDATE product_fields SET field_type = 'date' WHERE field_type = 'datetime';

-- Now update the constraint
ALTER TABLE product_fields DROP CONSTRAINT IF EXISTS product_fields_field_type_check;

ALTER TABLE product_fields ADD CONSTRAINT product_fields_field_type_check
CHECK (field_type IN (
  'identifier',
  'text',
  'textarea',
  'number',
  'boolean',
  'date',
  'select',
  'multiselect',
  'file',
  'image',
  'url',
  'price',
  'measurement',
  'table'
));