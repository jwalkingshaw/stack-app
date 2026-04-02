# CloudFront + S3 Performance Checklist

Use this checklist to validate the production CloudFront distribution used in front of S3 DAM assets.

## Distribution Behavior

- Origin path includes `organizations/*/assets/*` object namespace.
- Origin uses **S3 + Origin Access Control (OAC)**.
- Viewer protocol policy is HTTPS only (redirect HTTP to HTTPS).
- HTTP/3 is enabled.
- Compression (Brotli/Gzip) is enabled where applicable.

## Cache Policy

- Default cache policy excludes cookies.
- Default cache policy excludes request headers except required auth headers (if any).
- Query strings are disabled for immutable asset objects.
- Query strings are allowed only for routes that truly require them.

## Origin Request Policy

- Forward only minimal headers/query/cookies required by origin.
- Avoid forwarding `Cookie` and broad headers for static DAM object paths.

## Origin Shield

- Origin Shield is enabled in the nearest S3 region.

## Logging + Metrics

- CloudFront standard logs or real-time logs are enabled.
- Dashboard tracks:
  - Cache hit ratio
  - Origin request count
  - Origin bytes downloaded
  - Top paths by miss rate and bytes

## Object Metadata Expectations

- Uploaded asset objects use:
  - `Cache-Control: public, max-age=31536000, immutable`
- Generated thumbnails use:
  - `Cache-Control: public, max-age=31536000, immutable`

## Validation Commands

Run from a shell against a representative CloudFront asset URL:

```bash
curl -I https://<cloudfront-domain>/<asset-path>
```

Expected:

- `Cache-Control: public, max-age=31536000, immutable` (for immutable assets)
- `Age` header increases on repeated requests
- `x-cache` transitions to `Hit from cloudfront`
