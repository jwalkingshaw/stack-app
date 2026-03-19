# Deployment Runbook (Vercel + GitHub)

This runbook is for this monorepo:
- `apps/marketing-site` (public marketing site)
- `apps/saas-web` (authenticated multi-tenant SaaS app)

## 1) Recommended Environment Model

Use three environments:
- `local` for development on your machine
- `preview` for pull requests and branch testing
- `production` for live customers

Use separate external resources where possible:
- Supabase project per environment (or at least separate DB/schema)
- Kinde environment per environment
- S3 bucket/prefix per environment
- Redis DB per environment

## 2) Vercel Project Setup

Create two Vercel projects from this monorepo:

1. Marketing project
- Root Directory: `apps/marketing-site`
- Framework: Next.js
- Production domain: `stackcess.com` and `www.stackcess.com`

2. SaaS project
- Root Directory: `apps/saas-web`
- Framework: Next.js
- Production domain: `app.stackcess.com`
- Add wildcard domain for tenant subdomains: `*.stackcess.com`

Important:
- `NEXT_PUBLIC_TENANT_BASE_DOMAIN` must match the real tenant base domain.
- `NEXT_PUBLIC_APP_URL` should be `https://app.stackcess.com` in production.
- Middleware in `saas-web` depends on those values for subdomain rewrite behavior.

## 3) GitHub and Branch Flow

Recommended flow:
1. Keep `main` as deployable branch.
2. Open PRs from feature branches.
3. Require CI to pass before merge.
4. Use Vercel Preview deployments for each PR.
5. Merge to `main` only when preview is approved.

## 4) Environment Variables

Use root `.env.example` as the source template for local + Vercel variables.

Set variables in Vercel for both projects at:
- `Production`
- `Preview`
- `Development`

Notes:
- Only set `NEXT_PUBLIC_*` values that are safe for the browser.
- Keep all secrets server-side only.
- Use different secrets per environment.

## 5) Database and Migration Discipline

Do not rely only on `setup_database.sql` for production.
Use migrations under:
- `packages/database/migrations`

Recommended process:
1. Apply pending migrations to `preview` database.
2. Verify preview app behavior.
3. Apply the same migrations to `production`.
4. Deploy app after schema is ready.

Never ship app code that expects migrations not yet applied in production.

## 6) Pre-Ship Validation

Run these before each production push:

```bash
npm install
npm run type-check
npm run build --workspace=@tradetool/public-site
npm run build --workspace=@tradetool/saas-web
```

Also validate runtime integrations:
- SaaS health check: `GET /api/health-check?details=true`
- Kinde auth login/logout flow
- Kinde billing webhook endpoint and idempotency
- Supabase read/write paths for core workflows
- S3 upload, read, and signed URL download flow
- Email delivery (Resend) for enabled paths

## 7) Vercel Scheduled Job

SaaS contains a protected scheduled endpoint:
- `POST /api/internal/updates/scheduled`

It requires:
- `UPDATES_SCHEDULER_SECRET`
- `Authorization: Bearer <UPDATES_SCHEDULER_SECRET>` (or `x-updates-scheduler-secret`)

If you schedule this with Vercel Cron, route it through a secure proxy/function that can add the header.

## 8) Observability and Ops Baseline

Before production launch:
- Enable Vercel function logs and alerts
- Enable Supabase alerts and daily backups
- Monitor failed webhook receipts table
- Monitor auth and billing webhook error rates

Define rollback:
1. Re-deploy previous known-good Vercel build.
2. Disable risky feature flags/endpoints if needed.
3. Run DB rollback only if migration is reversible and tested.

## 9) First Production Cut Checklist

- [ ] Marketing project deploys from `apps/marketing-site`
- [ ] SaaS project deploys from `apps/saas-web`
- [ ] Production domains and wildcard subdomain routing configured
- [ ] Production env vars populated for both projects
- [ ] Latest DB migrations applied in production
- [ ] `type-check` and both builds pass in CI
- [ ] Health checks green in production
- [ ] Auth, onboarding, upload, and billing happy-path tested
