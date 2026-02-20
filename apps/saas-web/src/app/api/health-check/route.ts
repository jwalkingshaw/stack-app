import { NextRequest, NextResponse } from "next/server";
import { 
  validateEnvironmentVariables, 
  getEnvironmentSummary,
  runSupabaseTests,
  runKindeTests,
  runS3Tests,
  type ServiceTestResult
} from "@tradetool/database";

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const includeDetails = searchParams.get('details') === 'true';
    const skipTests = searchParams.get('skip')?.split(',') || [];

    console.log('🔍 Starting environment health check...');

    // 1. Validate environment variables
    console.log('📋 Validating environment variables...');
    const envValidation = validateEnvironmentVariables();
    const envSummary = getEnvironmentSummary();

    // 2. Run service tests in parallel
    const testPromises: Promise<any>[] = [];
    
    if (!skipTests.includes('supabase')) {
      console.log('🗄️ Testing Supabase connection...');
      testPromises.push(
        runSupabaseTests().then((results: ServiceTestResult[]) => ({ service: 'supabase', results }))
      );
    }

    if (!skipTests.includes('kinde')) {
      console.log('🔐 Testing Kinde configuration...');
      testPromises.push(
        runKindeTests().then((results: ServiceTestResult[]) => ({ service: 'kinde', results }))
      );
    }

    if (!skipTests.includes('s3')) {
      console.log('☁️ Testing S3 connectivity...');
      testPromises.push(
        runS3Tests().then((results: ServiceTestResult[]) => ({ service: 's3', results }))
      );
    }

    const serviceTests = await Promise.all(testPromises);
    
    // 3. Aggregate results
    const allResults = serviceTests.flatMap(test => test.results);
    const errorCount = allResults.filter((r: ServiceTestResult) => r.status === 'error').length;
    const warningCount = allResults.filter((r: ServiceTestResult) => r.status === 'warning').length;
    const successCount = allResults.filter((r: ServiceTestResult) => r.status === 'success').length;

    // 4. Determine overall health status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    let statusMessage: string;

    if (errorCount === 0 && warningCount === 0) {
      overallStatus = 'healthy';
      statusMessage = 'All systems operational';
    } else if (errorCount === 0) {
      overallStatus = 'degraded';
      statusMessage = `${warningCount} warning(s) detected`;
    } else {
      overallStatus = 'unhealthy';
      statusMessage = `${errorCount} error(s) and ${warningCount} warning(s) detected`;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`✅ Health check completed in ${duration}ms - Status: ${overallStatus}`);

    // 5. Build response
    const response = {
      status: overallStatus,
      message: statusMessage,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      environment: process.env.NODE_ENV || 'development',
      summary: {
        total: allResults.length,
        success: successCount,
        warnings: warningCount,
        errors: errorCount
      },
      environmentVariables: {
        validation: envValidation,
        summary: envSummary
      },
      services: serviceTests.reduce((acc, test) => {
        acc[test.service] = {
          tested: true,
          results: test.results.map((r: ServiceTestResult) => ({
            service: r.service,
            status: r.status,
            message: r.message,
            ...(includeDetails && r.details ? { details: r.details } : {})
          }))
        };
        return acc;
      }, {} as Record<string, any>)
    };

    // Add skipped services
    skipTests.forEach(service => {
      if (['supabase', 'kinde', 's3'].includes(service)) {
        response.services[service] = {
          tested: false,
          skipped: true,
          reason: 'Skipped via query parameter'
        };
      }
    });

    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
    
    return NextResponse.json(response, { 
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.error('❌ Health check failed:', error);

    const { searchParams } = new URL(request.url);
    const includeDetails = searchParams.get('details') === 'true';

    return NextResponse.json(
      {
        status: 'unhealthy',
        message: 'Health check failed due to internal error',
        timestamp: new Date().toISOString(),
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
        ...(includeDetails && { errorDetails: error })
      },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
  }
}

// Simple health check endpoint for load balancers
export async function HEAD(request: NextRequest) {
  try {
    // Quick environment validation only
    const envValidation = validateEnvironmentVariables();
    
    if (!envValidation.isValid) {
      return new NextResponse(null, { status: 503 });
    }
    
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    return new NextResponse(null, { status: 503 });
  }
}