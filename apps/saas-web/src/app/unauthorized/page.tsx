import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-gray-400 mb-4">401</h1>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-8">
            You need to sign in to access this application.
          </p>
        </div>
        
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-4">
            <Link
              href="/api/auth/login"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign In
            </Link>
            
            <Link
              href="/api/auth/register"
              className="w-full flex justify-center py-2 px-4 border border-input rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Create Account
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
          <p>Need help? Contact support for assistance.</p>
        </div>
      </div>
    </div>
  );
}