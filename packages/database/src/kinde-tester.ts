import type { ServiceTestResult } from './env-validator';

export async function testKindeConfiguration(): Promise<ServiceTestResult> {
  try {
    // Validate required environment variables
    const requiredVars = [
      'KINDE_CLIENT_ID',
      'KINDE_CLIENT_SECRET', 
      'KINDE_ISSUER_URL',
      'KINDE_SITE_URL',
      'KINDE_POST_LOGIN_REDIRECT_URL',
      'KINDE_POST_LOGOUT_REDIRECT_URL'
    ];

    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      return {
        service: 'Kinde Configuration',
        status: 'error',
        message: `Missing required environment variables: ${missing.join(', ')}`
      };
    }

    // Validate URL formats
    const urlVars = [
      'KINDE_ISSUER_URL',
      'KINDE_SITE_URL', 
      'KINDE_POST_LOGIN_REDIRECT_URL',
      'KINDE_POST_LOGOUT_REDIRECT_URL'
    ];

    const invalidUrls = urlVars.filter(varName => {
      try {
        new URL(process.env[varName]!);
        return false;
      } catch {
        return true;
      }
    });

    if (invalidUrls.length > 0) {
      return {
        service: 'Kinde Configuration',
        status: 'error',
        message: `Invalid URL format in: ${invalidUrls.join(', ')}`
      };
    }

    // Validate Kinde issuer URL format
    const issuerUrl = process.env.KINDE_ISSUER_URL!;
    if (!issuerUrl.includes('.kinde.com')) {
      return {
        service: 'Kinde Configuration',
        status: 'warning',
        message: 'KINDE_ISSUER_URL does not appear to be a valid Kinde domain',
        details: { issuerUrl }
      };
    }

    return {
      service: 'Kinde Configuration',
      status: 'success',
      message: 'All configuration variables are properly formatted',
      details: {
        issuerUrl: process.env.KINDE_ISSUER_URL,
        siteUrl: process.env.KINDE_SITE_URL,
        clientId: process.env.KINDE_CLIENT_ID ? 'Set' : 'Missing',
        clientSecret: process.env.KINDE_CLIENT_SECRET ? 'Set' : 'Missing',
        redirectUrls: {
          login: process.env.KINDE_POST_LOGIN_REDIRECT_URL,
          logout: process.env.KINDE_POST_LOGOUT_REDIRECT_URL
        }
      }
    };
  } catch (error) {
    return {
      service: 'Kinde Configuration',
      status: 'error',
      message: `Configuration test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error
    };
  }
}

export async function testKindeConnectivity(): Promise<ServiceTestResult> {
  try {
    if (!process.env.KINDE_ISSUER_URL) {
      return {
        service: 'Kinde Connectivity',
        status: 'error',
        message: 'KINDE_ISSUER_URL is required for connectivity test'
      };
    }

    const issuerUrl = process.env.KINDE_ISSUER_URL;
    
    // Test if we can reach the Kinde issuer
    const wellKnownUrl = `${issuerUrl}/.well-known/openid-configuration`;
    
    const response = await fetch(wellKnownUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return {
        service: 'Kinde Connectivity',
        status: 'error',
        message: `Cannot reach Kinde at ${issuerUrl}. Status: ${response.status}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          url: wellKnownUrl
        }
      };
    }

    const config = await response.json();
    
    // Validate the OpenID configuration has required endpoints
    const requiredEndpoints = ['authorization_endpoint', 'token_endpoint', 'userinfo_endpoint'];
    const missingEndpoints = requiredEndpoints.filter(endpoint => !config[endpoint]);
    
    if (missingEndpoints.length > 0) {
      return {
        service: 'Kinde Connectivity',
        status: 'warning',
        message: `OpenID configuration missing endpoints: ${missingEndpoints.join(', ')}`,
        details: config
      };
    }

    return {
      service: 'Kinde Connectivity',
      status: 'success',
      message: 'Successfully connected to Kinde and retrieved OpenID configuration',
      details: {
        issuer: config.issuer,
        authorizationEndpoint: config.authorization_endpoint,
        tokenEndpoint: config.token_endpoint,
        userinfoEndpoint: config.userinfo_endpoint
      }
    };
  } catch (error) {
    return {
      service: 'Kinde Connectivity',
      status: 'error',
      message: `Connectivity test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error
    };
  }
}

export async function testKindeCallbackUrls(): Promise<ServiceTestResult> {
  try {
    const siteUrl = process.env.KINDE_SITE_URL;
    const loginRedirect = process.env.KINDE_POST_LOGIN_REDIRECT_URL;
    const logoutRedirect = process.env.KINDE_POST_LOGOUT_REDIRECT_URL;

    if (!siteUrl || !loginRedirect || !logoutRedirect) {
      return {
        service: 'Kinde Callback URLs',
        status: 'error',
        message: 'Missing required URL configuration'
      };
    }

    const warnings: string[] = [];
    
    // Check if URLs are localhost in production
    if (process.env.NODE_ENV === 'production') {
      if (siteUrl.includes('localhost') || siteUrl.includes('127.0.0.1')) {
        warnings.push('KINDE_SITE_URL should not be localhost in production');
      }
      if (loginRedirect.includes('localhost') || loginRedirect.includes('127.0.0.1')) {
        warnings.push('KINDE_POST_LOGIN_REDIRECT_URL should not be localhost in production');
      }
      if (logoutRedirect.includes('localhost') || logoutRedirect.includes('127.0.0.1')) {
        warnings.push('KINDE_POST_LOGOUT_REDIRECT_URL should not be localhost in production');
      }
    }

    // Check if redirect URLs start with site URL
    if (!loginRedirect.startsWith(siteUrl)) {
      warnings.push('KINDE_POST_LOGIN_REDIRECT_URL should start with KINDE_SITE_URL');
    }
    if (!logoutRedirect.startsWith(siteUrl)) {
      warnings.push('KINDE_POST_LOGOUT_REDIRECT_URL should start with KINDE_SITE_URL');
    }

    const status = warnings.length > 0 ? 'warning' : 'success';
    const message = warnings.length > 0 
      ? `URL configuration has warnings: ${warnings.join(', ')}`
      : 'URL configuration looks correct';

    return {
      service: 'Kinde Callback URLs',
      status,
      message,
      details: {
        siteUrl,
        loginRedirect,
        logoutRedirect,
        warnings
      }
    };
  } catch (error) {
    return {
      service: 'Kinde Callback URLs',
      status: 'error',
      message: `Callback URL test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error
    };
  }
}

export async function runKindeTests(): Promise<ServiceTestResult[]> {
  const results: ServiceTestResult[] = [];
  
  // Test configuration
  results.push(await testKindeConfiguration());
  
  // Test connectivity only if configuration passes
  const configResult = results[results.length - 1];
  if (configResult.status !== 'error') {
    results.push(await testKindeConnectivity());
    results.push(await testKindeCallbackUrls());
  }
  
  return results;
}