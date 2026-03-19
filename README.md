# Tradetool Monorepo

A monorepo with two Next.js applications:
- `apps/marketing-site`: public marketing/news site
- `apps/saas-web`: authenticated multi-tenant SaaS app

Shared packages live under `packages/*` (auth, database, storage, UI, types).

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Create local env file:
```bash
cp .env.example .env.local
```

3. Run development:
```bash
npm run dev
```

Useful app-specific commands:
```bash
npm run dev:public   # marketing site (port 3000)
npm run dev:saas     # SaaS app (port 3001)
```

## Validation Commands

```bash
npm run type-check
npm run build --workspace=@tradetool/public-site
npm run build --workspace=@tradetool/saas-web
npm run check:release
```

## Deployment

- Runbook: `docs/DEPLOYMENT_RUNBOOK.md`
- CI workflow: `.github/workflows/ci.yml`
