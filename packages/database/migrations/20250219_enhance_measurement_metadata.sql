-- Migration: Enhance measurement metadata for composite support
-- Date: 2025-02-19
-- Description: Adds metadata columns to measurement families and backfills defaults

BEGIN;

-- Extend measurement_families with richer metadata
ALTER TABLE measurement_families
    ADD COLUMN IF NOT EXISTS is_composite BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS component_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS default_decimal_precision INTEGER,
    ADD COLUMN IF NOT EXISTS allow_negative BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill component schema and defaults for existing families
WITH standard_units AS (
    SELECT
        mf.id,
        mu.code AS standard_unit_code,
        mu.symbol AS standard_unit_symbol
    FROM measurement_families mf
    LEFT JOIN measurement_units mu ON mu.id = mf.standard_unit_id
)
UPDATE measurement_families mf
SET
    is_composite = CASE
        WHEN mf.code = 'dimensions' THEN true
        ELSE false
    END,
    component_schema = CASE
        WHEN mf.code = 'dimensions' THEN '[
            {"key": "length", "label": "Length"},
            {"key": "width", "label": "Width"},
            {"key": "height", "label": "Height"}
        ]'::jsonb
        ELSE '[
            {"key": "value", "label": "Value"}
        ]'::jsonb
    END,
    default_decimal_precision = CASE
        WHEN mf.code IN ('weight', 'volume') THEN 3
        WHEN mf.code = 'dimensions' THEN 2
        ELSE COALESCE(mf.default_decimal_precision, 2)
    END,
    allow_negative = COALESCE(mf.allow_negative, false),
    metadata = jsonb_build_object(
        'conversion_note',
        format(
            'Values are normalized to %s (%s) before storage.',
            COALESCE(su.standard_unit_code, 'the standard unit'),
            COALESCE(su.standard_unit_symbol, '-')
        )
    )
FROM standard_units su
WHERE su.id = mf.id;

COMMIT;
