import Link from "next/link";

export default function DevPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Development Access</h1>
          <p className="text-gray-600 mb-8">
            Bypass authentication for development testing
          </p>
        </div>
        
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-4">
            <Link
              href="/demo-org/assets"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              Enter Assets Demo (demo-org)
            </Link>
            
            <Link
              href="/test-company/assets"
              className="w-full flex justify-center py-2 px-4 border border-input rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Enter Assets Demo (test-company)
            </Link>
            
            <Link
              href="/"
              className="w-full flex justify-center py-2 px-4 text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
        
        <div className="mt-6 text-center text-sm text-gray-500">
          <p><strong>Note:</strong> This is for development only. Set up Kinde auth for production.</p>
        </div>
      </div>
    </div>
  );
}