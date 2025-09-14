# Tradetool Monorepo

A modern SAAS platform with Digital Asset Management capabilities.

## Architecture

- **Public Site**: News/blog platform (Next.js + Sanity)
- **SAAS Platform**: Multi-tenant Marketing Management Platform with DAM
- **Tech Stack**: Next.js 15, Supabase, Kinde Auth, AWS S3

## Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Fill in your environment variables
   ```

3. **Start development servers**
   ```bash
   # All apps
   npm run dev
   
   # Individual apps
   npm run dev:public    # Public site (port 3000)
   npm run dev:saas      # SAAS platform (port 3001)
   ```

## Project Structure

```
tradetool/
├── apps/
│   ├── public-site/       # Public news/blog site
│   └── saas-web/          # SAAS platform dashboard
├── packages/
│   ├── types/             # Shared TypeScript types
│   ├── database/          # Supabase client & queries
│   ├── auth/              # Kinde auth utilities
│   └── storage/           # S3 storage utilities
└── shared/                # Shared utilities & configs
```

## Key Features

### Digital Asset Management (DAM)
- Multi-tenant file storage with S3
- Automatic thumbnail generation
- Folder organization and tagging
- Secure file sharing with permissions
- Search and filtering capabilities

### Authentication & Authorization
- Kinde-based multi-tenant auth
- Organization-level access control
- Role-based permissions
- Subscription billing integration

### Database
- Supabase PostgreSQL with Row-Level Security
- Real-time subscriptions for collaborative features
- Optimized queries for large asset libraries

## Development Commands

```bash
npm run dev          # Start all development servers
npm run build        # Build all apps
npm run lint         # Lint all code
npm run type-check   # Type check all packages
npm run clean        # Clean build artifacts
```