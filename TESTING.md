# Environment Testing Guide

Complete guide for testing all environment variables and service connections before implementing core features.

## Quick Start

1. **Start the SAAS platform:**
   ```bash
   npm run dev:saas
   ```

2. **Visit the test page:**
   ```
   http://localhost:3001/test
   ```

3. **Click "Run Health Check"** to test all services

## Manual Testing

### Via API Endpoint

```bash
# Basic health check
curl http://localhost:3001/api/health-check

# Detailed health check
curl "http://localhost:3001/api/health-check?details=true"

# Skip specific tests
curl "http://localhost:3001/api/health-check?skip=s3,kinde"
```

### Via Test Page

1. Navigate to `http://localhost:3001/test`
2. Optionally check "Include detailed results"
3. Click "Run Health Check"
4. Review results and fix any issues

## What Gets Tested

### Environment Variables
- ✅ **Supabase**: URL, anon key, service role key
- ✅ **Kinde**: Client ID/secret, issuer URL, redirect URLs
- ✅ **AWS S3**: Access key, secret key, region, bucket name
- ✅ **Application**: Site URLs and configuration

### Service Connectivity
- ✅ **Supabase**: Connection test, schema validation, RLS policies
- ✅ **Kinde**: Configuration validation, connectivity test, callback URLs
- ✅ **AWS S3**: Credentials validation, bucket access, CRUD operations

## Test Results Explained

### Status Indicators
- 🟢 **Healthy**: All tests passed
- 🟡 **Degraded**: Warnings detected but functional
- 🔴 **Unhealthy**: Critical errors that prevent functionality

### Service-Specific Tests

#### Supabase Tests
1. **Connection Test**: Basic database connectivity
2. **Schema Test**: Verifies all required tables exist
3. **RLS Test**: Checks Row-Level Security policies

#### Kinde Tests
1. **Configuration Test**: Validates environment variables
2. **Connectivity Test**: Checks if Kinde domain is reachable
3. **Callback URLs**: Validates redirect URL configuration

#### S3 Tests
1. **Configuration Test**: Validates AWS credentials format
2. **Connectivity Test**: Checks if S3 endpoint is reachable
3. **Credentials Test**: Verifies AWS authentication
4. **Operations Test**: Tests PUT/GET/DELETE operations

## Common Issues & Solutions

### Environment Variables Missing
```
❌ Missing required environment variables: KINDE_CLIENT_ID, AWS_S3_BUCKET
```
**Solution**: Copy `.env.example` to `.env` and fill in the missing values.

### Supabase Connection Failed
```
❌ Anon key connection failed: Invalid API key
```
**Solutions**:
- Check if `NEXT_PUBLIC_SUPABASE_URL` is correct
- Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Supabase dashboard
- Ensure Supabase project is not paused

### Kinde Configuration Issues
```
❌ Cannot reach Kinde at https://your-domain.kinde.com
```
**Solutions**:
- Verify `KINDE_ISSUER_URL` matches your Kinde domain
- Check if Kinde application is properly configured
- Ensure callback URLs are correctly set in Kinde dashboard

### S3 Access Denied
```
❌ Access denied to bucket 'your-bucket'. Check AWS credentials.
```
**Solutions**:
- Verify AWS credentials are correct
- Check bucket exists and is in the correct region
- Ensure IAM user has proper S3 permissions
- Verify bucket name format (lowercase, no special chars)

### Missing Database Tables
```
❌ Missing required tables: organizations, dam_folders
```
**Solution**: Run the database migration script in your Supabase SQL editor:
```sql
-- Copy contents of packages/database/migrations/setup_database.sql
```

## Production Considerations

### Security Warnings
- 🔍 URLs should not be localhost in production
- 🔍 Use strong, unique passwords and keys
- 🔍 Enable MFA on all service accounts

### Performance Tests
- 🔍 Test with larger datasets
- 🔍 Monitor response times under load
- 🔍 Set up proper monitoring and alerting

### Backup & Recovery
- 🔍 Test database backups
- 🔍 Verify S3 versioning and lifecycle policies
- 🔍 Document recovery procedures

## Next Steps

Once all tests pass:

1. **✅ All Green**: Ready to implement core DAM features
2. **🟡 Some Warnings**: Review warnings but can proceed
3. **🔴 Any Errors**: Must fix errors before proceeding

## Advanced Testing

### Custom Test Scripts

```typescript
import { runSupabaseTests, runKindeTests, runS3Tests } from '@tradetool/database';

// Test individual services
const supabaseResults = await runSupabaseTests();
const kindeResults = await runKindeTests();
const s3Results = await runS3Tests();
```

### CI/CD Integration

```yaml
# Example GitHub Actions step
- name: Health Check
  run: |
    npm start &
    sleep 10
    curl -f http://localhost:3001/api/health-check || exit 1
```

## Support

If tests fail:
1. Check this guide for common solutions
2. Review error details in the test results
3. Verify service dashboards (Supabase, Kinde, AWS)
4. Check browser console for additional errors

Remember: **All services must be green before implementing core features!** 🚀