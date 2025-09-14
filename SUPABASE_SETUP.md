# Supabase Setup Instructions

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Create a new project
3. Wait for project to be ready (takes ~2 minutes)

## 2. Get Your Credentials

From your Supabase dashboard:

1. Go to **Settings** → **API**
2. Copy the following values:

```bash
# Project URL (looks like: https://abcdefgh.supabase.co)
NEXT_PUBLIC_SUPABASE_URL=your_project_url

# Anon/Public key (starts with: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...)
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Service Role key (starts with: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## 3. Update Environment Variables

Update these files with your actual Supabase credentials:

- `apps/saas-web/.env.local`
- `news-feed-blog/.env.local` (if using Supabase there too)

## 4. Run Database Migrations

Once you have the credentials set up:

```bash
# Navigate to database package
cd packages/database

# Run the setup script
npx tsx setup-database.ts
```

This will create all the necessary tables:
- ✅ `organizations` - Store tenant data
- ✅ `dam_folders` - Folder structure  
- ✅ `dam_assets` - File metadata
- ✅ `dam_collections` - Asset collections
- ✅ Row Level Security (RLS) policies

## 5. Test the Setup

1. Visit http://localhost:3000 (newsfeed)
2. Click "Sign Up"
3. Complete the onboarding form
4. Should successfully create organization and redirect to DAM

## Database Schema

### Organizations Table
- Stores tenant/company information
- Includes industry, team size from onboarding
- Tracks storage usage and limits

### DAM Tables
- **Folders**: Hierarchical folder structure
- **Assets**: File metadata, S3 keys, thumbnails
- **Collections**: Curated asset groupings

## Troubleshooting

### Error: "Missing Supabase environment variables"
- Make sure all 3 environment variables are set
- Restart the dev server after adding env vars

### Error: "Failed to execute migration"
- Check that your service role key has admin privileges
- Verify the Supabase project is fully provisioned

### Error: "Organization creation failed"
- Check browser developer console for errors
- Verify database tables were created successfully
- Check that RLS policies allow inserts

## Next Steps

After Supabase is set up:
- Organization creation will work end-to-end
- Users can sign up and get their own tenant
- Ready to add file upload functionality