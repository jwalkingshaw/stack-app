import type { ServiceTestResult } from './env-validator';

export async function testS3Configuration(): Promise<ServiceTestResult> {
  try {
    // Validate required environment variables
    const requiredVars = [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_REGION',
      'AWS_S3_BUCKET'
    ];

    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      return {
        service: 'S3 Configuration',
        status: 'error',
        message: `Missing required environment variables: ${missing.join(', ')}`
      };
    }

    // Validate AWS region format
    const region = process.env.AWS_REGION!;
    const regionPattern = /^[a-z]{2}-[a-z]+-\d{1}$/;
    
    if (!regionPattern.test(region)) {
      return {
        service: 'S3 Configuration',
        status: 'warning',
        message: `AWS_REGION format may be incorrect: ${region} (expected format: us-east-1)`,
        details: { region }
      };
    }

    // Validate bucket name format
    const bucket = process.env.AWS_S3_BUCKET!;
    const bucketPattern = /^[a-z0-9][a-z0-9\-]*[a-z0-9]$/;
    
    if (!bucketPattern.test(bucket) || bucket.length < 3 || bucket.length > 63) {
      return {
        service: 'S3 Configuration',
        status: 'warning',
        message: `AWS_S3_BUCKET name may be invalid: ${bucket}`,
        details: { bucket }
      };
    }

    // Validate access key format (basic check)
    const accessKey = process.env.AWS_ACCESS_KEY_ID!;
    if (accessKey.length < 16 || accessKey.length > 128) {
      return {
        service: 'S3 Configuration',
        status: 'warning',
        message: 'AWS_ACCESS_KEY_ID format may be incorrect',
        details: { accessKeyLength: accessKey.length }
      };
    }

    return {
      service: 'S3 Configuration',
      status: 'success',
      message: 'S3 configuration appears valid',
      details: {
        region,
        bucket,
        accessKeyId: accessKey.slice(0, 4) + '***',
        secretKey: 'Set (hidden)'
      }
    };
  } catch (error) {
    return {
      service: 'S3 Configuration',
      status: 'error',
      message: `Configuration test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error
    };
  }
}

export async function testS3Connectivity(): Promise<ServiceTestResult> {
  try {
    // We'll use a simple fetch to test AWS credentials without AWS SDK for now
    // This tests if we can reach AWS S3 service
    const region = process.env.AWS_REGION!;
    const bucket = process.env.AWS_S3_BUCKET!;
    
    // Test if we can reach the S3 endpoint
    const s3Endpoint = `https://s3.${region}.amazonaws.com/${bucket}`;
    
    try {
      const response = await fetch(s3Endpoint, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      // We expect a 403 (Forbidden) or 200/404 from S3, not a network error
      if (response.status === 403) {
        return {
          service: 'S3 Connectivity',
          status: 'success',
          message: 'Can reach S3 service (403 Forbidden is expected without proper auth headers)',
          details: {
            endpoint: s3Endpoint,
            status: response.status,
            region,
            bucket
          }
        };
      } else if (response.status === 200 || response.status === 404) {
        return {
          service: 'S3 Connectivity',
          status: 'success',
          message: 'Successfully connected to S3 endpoint',
          details: {
            endpoint: s3Endpoint,
            status: response.status,
            region,
            bucket
          }
        };
      } else {
        return {
          service: 'S3 Connectivity',
          status: 'warning',
          message: `Unexpected response from S3: ${response.status}`,
          details: {
            endpoint: s3Endpoint,
            status: response.status,
            statusText: response.statusText
          }
        };
      }
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === 'TimeoutError') {
        return {
          service: 'S3 Connectivity',
          status: 'error',
          message: 'Timeout connecting to S3 endpoint',
          details: { endpoint: s3Endpoint, timeout: '10s' }
        };
      }
      
      return {
        service: 'S3 Connectivity',
        status: 'error',
        message: `Cannot reach S3 endpoint: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
        details: { endpoint: s3Endpoint, error: fetchError }
      };
    }
  } catch (error) {
    return {
      service: 'S3 Connectivity',
      status: 'error',
      message: `Connectivity test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error
    };
  }
}

export async function testS3Credentials(): Promise<ServiceTestResult> {
  try {
    // Import AWS SDK dynamically to avoid build errors if not installed
    let S3Client, ListBucketsCommand, HeadBucketCommand;
    
    try {
      const AWS = await import('@aws-sdk/client-s3');
      S3Client = AWS.S3Client;
      ListBucketsCommand = AWS.ListBucketsCommand;
      HeadBucketCommand = AWS.HeadBucketCommand;
    } catch (importError) {
      return {
        service: 'S3 Credentials',
        status: 'warning',
        message: 'AWS SDK not available for credential testing. Install @aws-sdk/client-s3 for full testing.',
        details: { importError }
      };
    }

    const client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    const bucket = process.env.AWS_S3_BUCKET!;

    try {
      // Test if we can access the specific bucket
      const headCommand = new HeadBucketCommand({ Bucket: bucket });
      await client.send(headCommand);

      return {
        service: 'S3 Credentials',
        status: 'success',
        message: 'Successfully authenticated with S3 and can access the bucket',
        details: {
          bucket,
          region: process.env.AWS_REGION,
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!.slice(0, 4) + '***'
        }
      };
    } catch (s3Error: any) {
      if (s3Error.name === 'NotFound') {
        return {
          service: 'S3 Credentials',
          status: 'error',
          message: `Bucket '${bucket}' does not exist or is not accessible`,
          details: { bucket, error: s3Error.message }
        };
      } else if (s3Error.name === 'Forbidden') {
        return {
          service: 'S3 Credentials',
          status: 'error',
          message: `Access denied to bucket '${bucket}'. Check your AWS credentials and bucket permissions.`,
          details: { bucket, error: s3Error.message }
        };
      } else if (s3Error.name === 'CredentialsProviderError' || s3Error.name === 'InvalidAccessKeyId') {
        return {
          service: 'S3 Credentials',
          status: 'error',
          message: 'Invalid AWS credentials. Check your ACCESS_KEY_ID and SECRET_ACCESS_KEY.',
          details: { error: s3Error.message }
        };
      } else {
        return {
          service: 'S3 Credentials',
          status: 'error',
          message: `S3 operation failed: ${s3Error.message}`,
          details: { error: s3Error }
        };
      }
    }
  } catch (error) {
    return {
      service: 'S3 Credentials',
      status: 'error',
      message: `Credential test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error
    };
  }
}

export async function testS3Operations(): Promise<ServiceTestResult> {
  try {
    // Import AWS SDK dynamically
    let S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand;
    
    try {
      const AWS = await import('@aws-sdk/client-s3');
      S3Client = AWS.S3Client;
      PutObjectCommand = AWS.PutObjectCommand;
      GetObjectCommand = AWS.GetObjectCommand;
      DeleteObjectCommand = AWS.DeleteObjectCommand;
    } catch (importError) {
      return {
        service: 'S3 Operations',
        status: 'warning',
        message: 'AWS SDK not available for operation testing',
        details: { importError }
      };
    }

    const client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    const bucket = process.env.AWS_S3_BUCKET!;
    const testKey = `test-connectivity-${Date.now()}.txt`;
    const testContent = 'This is a test file created during environment validation.';

    try {
      // Test PUT operation
      const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: testContent,
        ContentType: 'text/plain',
      });
      await client.send(putCommand);

      // Test GET operation
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: testKey,
      });
      const getResult = await client.send(getCommand);
      
      // Test DELETE operation (cleanup)
      const deleteCommand = new DeleteObjectCommand({
        Bucket: bucket,
        Key: testKey,
      });
      await client.send(deleteCommand);

      return {
        service: 'S3 Operations',
        status: 'success',
        message: 'Successfully tested PUT, GET, and DELETE operations',
        details: {
          bucket,
          testKey,
          operations: ['PUT', 'GET', 'DELETE'],
          contentType: getResult.ContentType
        }
      };
    } catch (s3Error: any) {
      // Try to cleanup test file if it was created
      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucket,
          Key: testKey,
        });
        await client.send(deleteCommand);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      return {
        service: 'S3 Operations',
        status: 'error',
        message: `S3 operation failed: ${s3Error.message}`,
        details: { 
          bucket,
          testKey,
          error: s3Error.message,
          errorCode: s3Error.name
        }
      };
    }
  } catch (error) {
    return {
      service: 'S3 Operations',
      status: 'error',
      message: `Operation test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error
    };
  }
}

export async function runS3Tests(): Promise<ServiceTestResult[]> {
  const results: ServiceTestResult[] = [];
  
  // Test configuration
  results.push(await testS3Configuration());
  
  // Test connectivity if configuration passes
  const configResult = results[results.length - 1];
  if (configResult.status !== 'error') {
    results.push(await testS3Connectivity());
    results.push(await testS3Credentials());
    
    // Test operations only if credentials work
    const credentialResult = results[results.length - 1];
    if (credentialResult.status === 'success') {
      results.push(await testS3Operations());
    }
  }
  
  return results;
}