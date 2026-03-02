BEGIN;

-- One-time URL backfill for existing asset records.
-- Usage:
--   SET app.cloudfront_domain = 'dxxxxxx.cloudfront.net';
--   Then execute this migration file.
--
-- If app.cloudfront_domain is not set, this migration is a no-op.

DO $$
DECLARE
  raw_cloudfront_domain TEXT := trim(COALESCE(current_setting('app.cloudfront_domain', true), ''));
  cloudfront_domain TEXT;
  cloudfront_prefix TEXT;
BEGIN
  cloudfront_domain := regexp_replace(raw_cloudfront_domain, '^https?://', '', 'i');
  cloudfront_domain := regexp_replace(cloudfront_domain, '/+$', '');

  IF cloudfront_domain = '' THEN
    RAISE NOTICE 'Skipping CloudFront URL backfill. Set app.cloudfront_domain before running.';
    RETURN;
  END IF;

  cloudfront_prefix := 'https://' || cloudfront_domain || '/';

  UPDATE dam_assets AS a
  SET
    s3_url = regexp_replace(
      a.s3_url,
      '^https://[^/]+\.amazonaws\.com/',
      cloudfront_prefix
    ),
    thumbnail_urls = (
      SELECT COALESCE(
        jsonb_object_agg(
          kv.key,
          CASE
            WHEN jsonb_typeof(kv.value) = 'string' THEN
              to_jsonb(
                regexp_replace(
                  trim(both '"' from kv.value::text),
                  '^https://[^/]+\.amazonaws\.com/',
                  cloudfront_prefix
                )
              )
            ELSE kv.value
          END
        ),
        '{}'::jsonb
      )
      FROM jsonb_each(COALESCE(a.thumbnail_urls, '{}'::jsonb)) AS kv(key, value)
    )
  WHERE
    a.s3_url ~ '^https://[^/]+\.amazonaws\.com/'
    OR EXISTS (
      SELECT 1
      FROM jsonb_each(COALESCE(a.thumbnail_urls, '{}'::jsonb)) AS kv(key, value)
      WHERE
        jsonb_typeof(kv.value) = 'string'
        AND trim(both '"' from kv.value::text) ~ '^https://[^/]+\.amazonaws\.com/'
    );

  UPDATE dam_asset_versions AS v
  SET
    s3_url = regexp_replace(
      v.s3_url,
      '^https://[^/]+\.amazonaws\.com/',
      cloudfront_prefix
    ),
    thumbnail_urls = (
      SELECT COALESCE(
        jsonb_object_agg(
          kv.key,
          CASE
            WHEN jsonb_typeof(kv.value) = 'string' THEN
              to_jsonb(
                regexp_replace(
                  trim(both '"' from kv.value::text),
                  '^https://[^/]+\.amazonaws\.com/',
                  cloudfront_prefix
                )
              )
            ELSE kv.value
          END
        ),
        '{}'::jsonb
      )
      FROM jsonb_each(COALESCE(v.thumbnail_urls, '{}'::jsonb)) AS kv(key, value)
    )
  WHERE
    v.s3_url ~ '^https://[^/]+\.amazonaws\.com/'
    OR EXISTS (
      SELECT 1
      FROM jsonb_each(COALESCE(v.thumbnail_urls, '{}'::jsonb)) AS kv(key, value)
      WHERE
        jsonb_typeof(kv.value) = 'string'
        AND trim(both '"' from kv.value::text) ~ '^https://[^/]+\.amazonaws\.com/'
    );
END
$$;

COMMIT;
