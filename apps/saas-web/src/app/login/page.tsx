"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AuthLayoutShell } from "@tradetool/ui";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const { isAuthenticated, isLoading, organization, user } = useAuth();
  const [authLoading, setAuthLoading] = useState(false);
  const router = useRouter();

  // Handle authenticated users
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (organization?.slug) {
        // User has organization - go to workspace
        router.push(`/${organization.slug}`);
      } else {
        // User needs to create organization - go to onboarding
        router.push('/onboarding');
      }
    }
  }, [isLoading, isAuthenticated, organization, router]);

  const handleLogin = () => {
    setAuthLoading(true);
    window.location.href = '/api/auth/login';
  };

  const handleSignUp = () => {
    setAuthLoading(true);
    window.location.href = '/api/auth/register';
  };

  // Show loading state
  if (isLoading || authLoading) {
    return (
      <AuthLayoutShell authContext={{ isAuthenticated: false }}>
        <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 4rem)' }}>
          <Card className="max-w-md w-full shadow-xl border-0">
            <CardContent className="pt-8 pb-8">
              <div className="text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-4 text-slate-600" />
                <p className="text-slate-600 text-sm">
                  {authLoading ? 'Redirecting to authentication...' : 'Loading...'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </AuthLayoutShell>
    );
  }

  // Show login form for unauthenticated users
  return (
    <AuthLayoutShell authContext={{ isAuthenticated: false }}>
      <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 4rem)' }}>
        <Card className="max-w-md w-full shadow-xl border-0">
          <CardHeader className="text-center pb-2">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              Welcome to STACKCESS
            </h1>
            <p className="text-slate-600 text-sm leading-relaxed">
              Your unified workspace for digital assets and brand management
            </p>
          </CardHeader>
          
          <CardContent className="space-y-4 pt-2">
            {/* Login Button */}
            <Button 
              onClick={handleLogin}
              className="w-full h-12 text-base font-medium bg-slate-900 hover:bg-slate-800 transition-all duration-200"
              size="lg"
            >
              Sign In
            </Button>
            
            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white text-slate-500">or</span>
              </div>
            </div>
            
            {/* Sign Up Button */}
            <Button 
              onClick={handleSignUp}
              variant="outline"
              className="w-full h-12 text-base font-medium border-slate-200 hover:bg-slate-50 transition-all duration-200"
              size="lg"
            >
              Create Account
            </Button>
          </CardContent>
        </Card>
      </div>
    </AuthLayoutShell>
  );
}