-- Migration: Rename EU/UK "Supplement Facts" templates to "Active Ingredients"
-- Date: 2026-03-23
-- Description: EU/UK don't have a distinct "Supplement Facts" format — supplements
--              use the standard Nutrition Declaration. Renaming to "Active Ingredients"
--              to accurately reflect what this panel represents.

UPDATE product_table_templates
SET label = 'Active Ingredients (EU)'
WHERE label = 'Supplement Facts (EU)';

UPDATE product_table_templates
SET label = 'Active Ingredients (UK)'
WHERE label = 'Supplement Facts (UK)';
