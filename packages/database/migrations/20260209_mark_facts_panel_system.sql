-- Migration: Mark facts_panel as system attribute
-- Date: 2026-02-09

BEGIN;

UPDATE product_fields
SET options = jsonb_set(
    COALESCE(options, '{}'::jsonb),
    '{is_system}',
    'true'::jsonb,
    true
),
updated_at = NOW()
WHERE code = 'facts_panel';

COMMIT;
