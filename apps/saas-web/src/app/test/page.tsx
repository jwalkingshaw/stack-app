"use client";

import { useState } from "react";
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface TestResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  timestamp: string;
  duration: string;
  summary: {
    total: number;
    success: number;
    warnings: number;
    errors: number;
  };
  environmentVariables: any;
  services: any;
}

export default function TestPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeDetails, setIncludeDetails] = useState(false);

  const runHealthCheck = async () => {
    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      const url = `/api/health-check${includeDetails ? '?details=true' : ''}`;
      const response = await fetch(url);
      const data = await response.json();
      
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
      case 'healthy':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'warning':
      case 'degraded':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'error':
      case 'unhealthy':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-muted/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
      case 'healthy':
        return '✅';
      case 'warning':
      case 'degraded':
        return '⚠️';
      case 'error':
      case 'unhealthy':
        return '❌';
      default:
        return '🔍';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Environment Health Check
          </h1>
          <p className="text-gray-600">
            Test all environment variables and service connections before implementing core features.
          </p>
        </div>

        {/* Test Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeDetails}
                  onChange={(e) => setIncludeDetails(e.target.checked)}
                  className="mr-2"
                />
                Include detailed results
              </label>
            </div>
            
            <button
              onClick={runHealthCheck}
              disabled={isLoading}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" color="white" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <span>🔍</span>
                  <span>Run Health Check</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            <h3 className="font-semibold">Error</h3>
            <p>{error}</p>
          </div>
        )}

        {/* Results Display */}
        {results && (
          <div className="space-y-6">
            {/* Overall Status */}
            <div className={`border rounded-lg p-6 ${getStatusColor(results.status)}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{getStatusIcon(results.status)}</span>
                  <div>
                    <h2 className="text-xl font-semibold capitalize">{results.status}</h2>
                    <p>{results.message}</p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p>Duration: {results.duration}</p>
                  <p>{new Date(results.timestamp).toLocaleString()}</p>
                </div>
              </div>
              
              <div className="mt-4 grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">{results.summary.total}</div>
                  <div className="text-sm">Total Tests</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{results.summary.success}</div>
                  <div className="text-sm">Success</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-600">{results.summary.warnings}</div>
                  <div className="text-sm">Warnings</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">{results.summary.errors}</div>
                  <div className="text-sm">Errors</div>
                </div>
              </div>
            </div>

            {/* Environment Variables */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">Environment Variables</h3>
              
              <div className="mb-4">
                <h4 className="font-medium mb-2">Validation Summary</h4>
                <div className={`p-3 rounded border ${
                  results.environmentVariables.validation.isValid 
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {results.environmentVariables.validation.isValid ? (
                    '✅ All required environment variables are set'
                  ) : (
                    `❌ ${results.environmentVariables.validation.missing.length} missing, ${results.environmentVariables.validation.invalid.length} invalid`
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Supabase */}
                <div className="border rounded p-4">
                  <h5 className="font-medium mb-2">Supabase</h5>
                  <div className="space-y-1 text-sm">
                    <div>URL: {results.environmentVariables.summary.supabase.url}</div>
                    <div>Anon Key: {results.environmentVariables.summary.supabase.anonKey}</div>
                    <div>Service Key: {results.environmentVariables.summary.supabase.serviceKey}</div>
                  </div>
                </div>

                {/* Kinde */}
                <div className="border rounded p-4">
                  <h5 className="font-medium mb-2">Kinde</h5>
                  <div className="space-y-1 text-sm">
                    <div>Client ID: {results.environmentVariables.summary.kinde.clientId}</div>
                    <div>Client Secret: {results.environmentVariables.summary.kinde.clientSecret}</div>
                    <div>Issuer URL: {results.environmentVariables.summary.kinde.issuerUrl}</div>
                    <div>Site URL: {results.environmentVariables.summary.kinde.siteUrl}</div>
                  </div>
                </div>

                {/* AWS */}
                <div className="border rounded p-4">
                  <h5 className="font-medium mb-2">AWS S3</h5>
                  <div className="space-y-1 text-sm">
                    <div>Access Key: {results.environmentVariables.summary.aws.accessKey}</div>
                    <div>Secret Key: {results.environmentVariables.summary.aws.secretKey}</div>
                    <div>Region: {results.environmentVariables.summary.aws.region}</div>
                    <div>Bucket: {results.environmentVariables.summary.aws.bucket}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Service Tests */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">Service Tests</h3>
              
              <div className="space-y-4">
                {Object.entries(results.services).map(([serviceName, serviceData]: [string, any]) => (
                  <div key={serviceName} className="border rounded p-4">
                    <h4 className="font-medium mb-2 capitalize">{serviceName}</h4>
                    
                    {serviceData.tested ? (
                      <div className="space-y-2">
                        {serviceData.results.map((result: any, index: number) => (
                          <div
                            key={index}
                            className={`p-3 rounded border ${getStatusColor(result.status)}`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-start space-x-2">
                                <span>{getStatusIcon(result.status)}</span>
                                <div>
                                  <div className="font-medium">{result.service}</div>
                                  <div className="text-sm">{result.message}</div>
                                </div>
                              </div>
                            </div>
                            
                            {includeDetails && result.details && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-sm font-medium">
                                  View Details
                                </summary>
                                <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                                  {JSON.stringify(result.details, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-gray-500 italic">
                        {serviceData.skipped ? '⏭️ Skipped' : '⚪ Not tested'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!results && !isLoading && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              🚀 Getting Started
            </h3>
            <div className="text-blue-800 space-y-2">
              <p>
                <strong>1. Set up your environment variables</strong> - Copy <code>.env.example</code> to <code>.env</code> and fill in your credentials.
              </p>
              <p>
                <strong>2. Click "Run Health Check"</strong> - This will test all your environment variables and service connections.
              </p>
              <p>
                <strong>3. Fix any issues</strong> - Follow the error messages to resolve configuration problems.
              </p>
              <p>
                <strong>4. Once everything is green</strong> - You're ready to implement core Assets features!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}