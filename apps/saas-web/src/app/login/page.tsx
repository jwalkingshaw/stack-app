"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthLayoutShell } from "@tradetool/ui";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [authLoading, setAuthLoading] = useState(false);
  const router = useRouter();

  // Handle authenticated users
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleLogin = () => {
    if (authLoading) return;
    setAuthLoading(true);
    window.location.href = '/api/auth/login';
  };

  const handleSignUp = () => {
    if (authLoading) return;
    setAuthLoading(true);
    window.location.href = '/api/auth/register';
  };

  const handlePartnerSignUp = () => {
    if (authLoading) return;
    setAuthLoading(true);
    const redirect = encodeURIComponent('/onboarding?type=partner&create=1');
    window.location.href = `/api/auth/register?post_login_redirect_url=${redirect}`;
  };

  // Show loading state
  if (isLoading || authLoading) {
    return (
      <AuthLayoutShell
        authContext={{ isAuthenticated: false }}
        headerProps={{ className: "hidden" }}
        contentClassName="pt-0"
      >
        <div className="flex items-center justify-center px-4 py-12 min-h-screen">
          <div className="w-full max-w-[420px] rounded-2xl border border-muted/30 bg-white px-6 py-8 shadow-sm sm:px-8">
            <div className="space-y-6 text-left">
              <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
                STACKCESS
              </span>
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-foreground" />
                <p className="text-[var(--font-size-sm)] text-muted-foreground">
                  {authLoading ? 'Redirecting to authentication...' : 'Preparing your workspace...'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </AuthLayoutShell>
    );
  }

  // Show login form for unauthenticated users
  return (
    <AuthLayoutShell
      authContext={{ isAuthenticated: false }}
      headerProps={{ className: "hidden" }}
      contentClassName="pt-0"
    >
      <div className="flex items-center justify-center px-4 py-12 min-h-screen">
        <div className="w-full max-w-[420px] rounded-2xl border border-muted/30 bg-white px-6 py-8 shadow-sm sm:px-8">
          <div className="space-y-8 text-left">
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
                STACKCESS
              </span>
              <h1 className="text-[var(--font-size-2xl)] font-semibold leading-tight tracking-tight text-foreground">
                Hey friend! Welcome back
              </h1>
              <p className="text-[var(--font-size-sm)] text-muted-foreground">
                Sign in to continue managing your digital assets with STACKCESS.
              </p>
            </div>

            <div className="space-y-4">
              <Button
                onClick={handleLogin}
                disabled={authLoading}
                className="w-full h-12 rounded-[0.5rem] text-[var(--font-size-base)] font-semibold"
                size="lg"
              >
                Sign In
              </Button>

              <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
                <div className="h-px w-full bg-muted/30" />
                <span>or</span>
                <div className="h-px w-full bg-muted/30" />
              </div>

              <Button
                onClick={handleSignUp}
                variant="secondary"
                disabled={authLoading}
                className="w-full h-12 rounded-[0.5rem] text-[var(--font-size-base)] font-semibold"
                size="lg"
              >
                Create Account
              </Button>
              <Button
                onClick={handlePartnerSignUp}
                variant="outline"
                disabled={authLoading}
                className="w-full h-12 rounded-[0.5rem] text-[var(--font-size-base)] font-semibold"
                size="lg"
              >
                Partner Signup
              </Button>
              <p className="text-xs text-muted-foreground">
                New to STACKCESS? Create an account to start inviting your team and organizing assets.
                Retailers and distributors can use Partner Signup to create a paid partner workspace.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AuthLayoutShell>
  );
}
