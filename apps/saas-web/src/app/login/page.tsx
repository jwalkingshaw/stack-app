"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AuthLayoutShell } from "@stack-app/ui";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

export default function LoginPage() {
  const t = useTranslations("Login");
  const { isAuthenticated, isLoading } = useAuth();
  const [authLoading, setAuthLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleLogin = () => {
    if (authLoading) return;
    setAuthLoading(true);
    window.location.href = "/api/auth/login";
  };

  const handleSignUp = () => {
    if (authLoading) return;
    setAuthLoading(true);
    window.location.href = "/api/auth/register";
  };

  const handlePartnerSignUp = () => {
    if (authLoading) return;
    setAuthLoading(true);
    const redirect = encodeURIComponent("/onboarding?type=partner&create=1");
    window.location.href = `/api/auth/register?post_login_redirect_url=${redirect}`;
  };

  if (isLoading || authLoading) {
    return (
      <AuthLayoutShell
        authContext={{ isAuthenticated: false }}
        headerProps={{ className: "hidden" }}
        contentClassName="pt-0"
      >
        <div className="flex min-h-screen items-center justify-center px-4 py-12">
          <div className="w-full max-w-[420px] rounded-2xl bg-white px-6 py-8 sm:px-8">
            <div className="space-y-6 text-left">
              <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
                STACKCESS
              </span>
              <div className="flex items-center gap-3">
                <LoadingSkeleton size="md" />
                <p className="text-[var(--font-size-sm)] text-muted-foreground">
                  {authLoading ? t("loadingRedirecting") : t("loadingPreparing")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </AuthLayoutShell>
    );
  }

  return (
    <AuthLayoutShell
      authContext={{ isAuthenticated: false }}
      headerProps={{ className: "hidden" }}
      contentClassName="pt-0"
    >
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px] rounded-2xl bg-white px-6 py-8 sm:px-8">
          <div className="space-y-8 text-left">
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
                STACKCESS
              </span>
              <h1 className="text-[var(--font-size-2xl)] font-semibold leading-tight tracking-tight text-foreground">
                {t("title")}
              </h1>
              <p className="text-[var(--font-size-sm)] text-muted-foreground">
                {t("subtitle")}
              </p>
            </div>

            <div className="space-y-4">
              <Button
                onClick={handleLogin}
                disabled={authLoading}
                className="h-12 w-full rounded-[0.5rem] text-[var(--font-size-base)] font-semibold"
                size="lg"
              >
                {t("actions.signIn")}
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
                className="h-12 w-full rounded-[0.5rem] text-[var(--font-size-base)] font-semibold"
                size="lg"
              >
                {t("actions.createFreeAccount")}
              </Button>

              <Button
                onClick={handlePartnerSignUp}
                variant="outline"
                disabled={authLoading}
                className="h-12 w-full rounded-[0.5rem] text-[var(--font-size-base)] font-semibold"
                size="lg"
              >
                {t("actions.joinAsPartner")}
              </Button>

              <p className="text-xs text-muted-foreground">
                {t("helper")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </AuthLayoutShell>
  );
}
