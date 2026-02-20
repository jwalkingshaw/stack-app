// Environment variable validation utility
export interface EnvValidationResult {
  isValid: boolean;
  missing: string[];
  invalid: string[];
  warnings: string[];
}

export interface ServiceTestResult {
  service: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  details?: any;
}

export function validateEnvironmentVariables(): EnvValidationResult {
  const result: EnvValidationResult = {
    isValid: true,
    missing: [],
    invalid: [],
    warnings: []
  };

  // Required Supabase variables
  const supabaseVars = {
    'NEXT_PUBLIC_SUPABASE_URL': process.env.NEXT_PUBLIC_SUPABASE_URL,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  // Required Kinde variables
  const kindeVars = {
    'KINDE_CLIENT_ID': process.env.KINDE_CLIENT_ID,
    'KINDE_CLIENT_SECRET': process.env.KINDE_CLIENT_SECRET,
    'KINDE_ISSUER_URL': process.env.KINDE_ISSUER_URL,
    'KINDE_SITE_URL': process.env.KINDE_SITE_URL,
    'KINDE_POST_LOGOUT_REDIRECT_URL': process.env.KINDE_POST_LOGOUT_REDIRECT_URL,
    'KINDE_POST_LOGIN_REDIRECT_URL': process.env.KINDE_POST_LOGIN_REDIRECT_URL,
  };

  // Required AWS variables
  const awsVars = {
    'AWS_ACCESS_KEY_ID': process.env.AWS_ACCESS_KEY_ID,
    'AWS_SECRET_ACCESS_KEY': process.env.AWS_SECRET_ACCESS_KEY,
    'AWS_REGION': process.env.AWS_REGION,
    'AWS_S3_BUCKET': process.env.AWS_S3_BUCKET,
  };

  // Optional but recommended
  const optionalVars = {
    'NEXT_PUBLIC_APP_URL': process.env.NEXT_PUBLIC_APP_URL,
    'NEXT_PUBLIC_TENANT_BASE_DOMAIN': process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN,
  };

  // Check required variables
  const allRequiredVars = { ...supabaseVars, ...kindeVars, ...awsVars };
  
  Object.entries(allRequiredVars).forEach(([key, value]) => {
    if (!value) {
      result.missing.push(key);
      result.isValid = false;
    } else if (value.trim() === '') {
      result.invalid.push(`${key} is empty`);
      result.isValid = false;
    }
  });

  // Check optional variables
  Object.entries(optionalVars).forEach(([key, value]) => {
    if (!value) {
      result.warnings.push(`${key} is not set (recommended for production)`);
    }
  });

  // Validate URL formats
  const urlVars = ['NEXT_PUBLIC_SUPABASE_URL', 'KINDE_ISSUER_URL', 'KINDE_SITE_URL', 'KINDE_POST_LOGOUT_REDIRECT_URL', 'KINDE_POST_LOGIN_REDIRECT_URL'];
  
  urlVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      try {
        new URL(value);
      } catch {
        result.invalid.push(`${varName} is not a valid URL: ${value}`);
        result.isValid = false;
      }
    }
  });

  // Validate Supabase URL format
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('.supabase.co')) {
    result.warnings.push('NEXT_PUBLIC_SUPABASE_URL does not appear to be a Supabase URL');
  }

  // Validate Kinde URL format
  if (process.env.KINDE_ISSUER_URL && !process.env.KINDE_ISSUER_URL.includes('.kinde.com')) {
    result.warnings.push('KINDE_ISSUER_URL does not appear to be a Kinde URL');
  }

  // Validate AWS region format
  if (process.env.AWS_REGION && !/^[a-z]{2}-[a-z]+-\d{1}$/.test(process.env.AWS_REGION)) {
    result.warnings.push('AWS_REGION format may be incorrect (expected format: us-east-1)');
  }

  return result;
}

export function getEnvironmentSummary() {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Set' : '✗ Missing',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing',
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Set' : '✗ Missing',
    },
    kinde: {
      clientId: process.env.KINDE_CLIENT_ID ? '✓ Set' : '✗ Missing',
      clientSecret: process.env.KINDE_CLIENT_SECRET ? '✓ Set' : '✗ Missing',
      issuerUrl: process.env.KINDE_ISSUER_URL ? '✓ Set' : '✗ Missing',
      siteUrl: process.env.KINDE_SITE_URL ? '✓ Set' : '✗ Missing',
      redirectUrls: {
        login: process.env.KINDE_POST_LOGIN_REDIRECT_URL ? '✓ Set' : '✗ Missing',
        logout: process.env.KINDE_POST_LOGOUT_REDIRECT_URL ? '✓ Set' : '✗ Missing',
      }
    },
    aws: {
      accessKey: process.env.AWS_ACCESS_KEY_ID ? '✓ Set' : '✗ Missing',
      secretKey: process.env.AWS_SECRET_ACCESS_KEY ? '✓ Set' : '✗ Missing',
      region: process.env.AWS_REGION ? '✓ Set' : '✗ Missing',
      bucket: process.env.AWS_S3_BUCKET ? '✓ Set' : '✗ Missing',
    }
  };
}
