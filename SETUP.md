# Tradetool Setup Guide

Complete setup guide for the Tradetool monorepo with SAAS MMP and DAM features.

## Prerequisites

- Node.js 18+ and npm 8+
- Supabase account and project
- Kinde account and application
- AWS account with S3 access

## 1. Environment Setup

1. **Copy environment variables:**
   ```bash
   cp .env.example .env
   ```

2. **Fill in your environment variables in `.env`:**

### Supabase Configuration
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Kinde Authentication
```env
KINDE_CLIENT_ID=your_kinde_client_id
KINDE_CLIENT_SECRET=your_kinde_client_secret
KINDE_ISSUER_URL=https://your-domain.kinde.com
KINDE_SITE_URL=http://localhost:3001
KINDE_POST_LOGOUT_REDIRECT_URL=http://localhost:3001
KINDE_POST_LOGIN_REDIRECT_URL=http://localhost:3001/dashboard
```

### AWS S3 Storage
```env
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-dam-bucket
```

### Application URLs
```env
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

## 2. Database Setup (Supabase)

1. **Create a new Supabase project** at https://supabase.com

2. **Run the database migration:**
   - Go to your Supabase dashboard
   - Navigate to SQL Editor
   - Copy and execute the contents of `packages/database/migrations/setup_database.sql`

3. **Verify setup:**
   - Check that all tables are created: `organizations`, `dam_folders`, `dam_assets`, `dam_collections`
   - Verify Row Level Security is enabled
   - Confirm indexes and triggers are in place

## 3. Kinde Authentication Setup

1. **Create a Kinde account** at https://kinde.com

2. **Set up your application:**
   - Create a new application in Kinde dashboard
   - Set application type to "Web Application"
   - Configure callback URLs:
     - Allowed callback URLs: `http://localhost:3001/api/auth/kinde_callback`
     - Allowed logout redirect URLs: `http://localhost:3001`

3. **Configure Organizations:**
   - Enable organizations in your Kinde application
   - Create a test organization for development
   - Add yourself as a member

4. **Get your credentials:**
   - Copy Client ID and Client Secret to your `.env` file
   - Copy your domain URL (e.g., `https://your-domain.kinde.com`)

## 4. AWS S3 Setup

1. **Create an S3 bucket:**
   ```bash
   # Replace 'your-dam-bucket' with your actual bucket name
   aws s3 mb s3://your-dam-bucket
   ```

2. **Configure CORS policy:**
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
       "AllowedOrigins": ["http://localhost:3001"],
       "ExposeHeaders": []
     }
   ]
   ```

3. **Set up IAM permissions:**
   - Create IAM user with S3 access
   - Attach policy with permissions for your bucket
   - Copy Access Key ID and Secret Access Key to `.env`

## 5. Install Dependencies

```bash
# Install all workspace dependencies
npm install

# Verify installation
npm run type-check
```

## 6. Start Development Servers

### Start both applications:
```bash
npm run dev
```

### Or start individually:
```bash
# Public site (port 3000)
npm run dev:public

# SAAS platform (port 3001)
npm run dev:saas
```

## 7. Test the Setup

### 1. **Test Public Site:**
- Visit http://localhost:3000
- Verify the news/blog site loads correctly

### 2. **Test SAAS Platform:**
- Visit http://localhost:3001
- Click "Get Started" or "Sign In"
- Complete Kinde authentication flow
- Verify redirect to organization dashboard

### 3. **Test Multi-Tenant Access:**
- After login, check URL: `http://localhost:3001/your-org-code/dam`
- Verify organization-specific dashboard loads
- Test navigation between different sections

## 8. Verify Database Integration

1. **Check organization sync:**
   - Login should automatically create organization in Supabase
   - Check `organizations` table in Supabase dashboard

2. **Test storage tracking:**
   - Verify storage usage appears in dashboard
   - Default limit should be 5GB

## Development Workflow

### Project Structure
```
tradetool/
├── apps/
│   ├── news-feed-blog/     # Public site (existing)
│   └── saas-web/           # SAAS platform
├── packages/
│   ├── types/              # Shared TypeScript types
│   ├── database/           # Supabase utilities
│   └── [other packages]
└── shared/                 # Shared configs
```

### Common Commands
```bash
# Development
npm run dev                 # Start all apps
npm run dev:saas           # Start SAAS platform only

# Building
npm run build              # Build all apps
npm run build:saas         # Build SAAS platform only

# Type checking
npm run type-check         # Check all packages

# Linting
npm run lint               # Lint all code
```

## Troubleshooting

### Common Issues

1. **"Authentication required" errors:**
   - Verify Kinde environment variables are correct
   - Check callback URLs match exactly
   - Ensure cookies are enabled in browser

2. **Database connection errors:**
   - Verify Supabase URL and keys are correct
   - Check if RLS policies are properly configured
   - Ensure service role key has proper permissions

3. **Organization not found:**
   - Check if organization exists in Kinde
   - Verify organization sync is working (`/api/auth/sync`)
   - Check Supabase `organizations` table

4. **TypeScript errors:**
   - Run `npm run type-check` to identify issues
   - Ensure all workspace dependencies are installed
   - Verify import paths are correct

### Development Tips

1. **Use separate browser profiles** for testing different organizations
2. **Check browser developer tools** for network errors and console logs
3. **Use Supabase dashboard** to inspect database state
4. **Monitor Kinde dashboard** for authentication logs

## Next Steps

Once setup is complete, you can:

1. **Implement DAM Features:**
   - File upload with S3 integration
   - Asset browsing and organization
   - Search and filtering capabilities

2. **Add Marketing Features:**
   - Campaign management
   - Analytics and reporting
   - Team collaboration tools

3. **Production Deployment:**
   - Configure production environment variables
   - Set up CI/CD pipeline
   - Configure domain and SSL

## Support

If you encounter issues:
1. Check this setup guide
2. Review error logs in browser console
3. Check Supabase and Kinde dashboards for errors
4. Verify all environment variables are correctly set