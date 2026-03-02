"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AuthLayoutShell } from "@tradetool/ui";
import { useMe } from "@/hooks/useMe";
import { Check, Loader2 } from "lucide-react";

export default function WelcomePage() {
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next") || "/";
  const nextPath = useMemo(() => {
    return rawNext.startsWith("/") ? rawNext : "/";
  }, [rawNext]);

  const router = useRouter();
  const { user, loading } = useMe();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "success">("idle");
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    if (
      !loading &&
      user?.given_name &&
      user?.family_name &&
      !hasRedirected
    ) {
      setHasRedirected(true);
      router.replace(nextPath);
    }
  }, [loading, user, router, nextPath, hasRedirected]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) {
        return;
      }

      const trimmedFirst = firstName.trim();
      const trimmedLast = lastName.trim();

      if (!trimmedFirst || !trimmedLast) {
        setError("Please enter both your first and last name.");
        return;
      }

      setSubmitting(true);
      setError(null);

      try {
        const response = await fetch("/api/me/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: trimmedFirst,
            lastName: trimmedLast,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Unable to update your profile.");
        }

        setStatus("success");
        setTimeout(() => {
          router.replace(nextPath);
        }, 600);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong. Please try again."
        );
      } finally {
        setSubmitting(false);
      }
    },
    [firstName, lastName, nextPath, router, submitting]
  );

  if (loading && !user) {
    return (
      <AuthLayoutShell
        authContext={{ isAuthenticated: false }}
        headerProps={{ className: "hidden" }}
        contentClassName="pt-0"
      >
        <div className="flex min-h-screen items-center justify-center px-4 py-12">
          <Card className="w-full max-w-[520px] rounded-2xl border border-muted/30 bg-white shadow-sm">
            <CardContent className="px-6 py-8 sm:px-8">
              <div className="text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-muted/30 bg-white">
                  <Image src="/stackcess-icon-wb-logo.svg" alt="STACKCESS" width={32} height={32} className="h-8 w-8" />
                </div>
                <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-foreground" />
                <p className="text-[var(--font-size-sm)] text-muted-foreground">Getting things ready...</p>
              </div>
            </CardContent>
          </Card>
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
        <Card className="w-full max-w-[520px] rounded-2xl border border-muted/30 bg-white shadow-sm">
          <CardHeader className="space-y-3 px-6 pb-4 pt-8 text-left sm:px-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-muted/30 bg-white">
              <Image src="/stackcess-icon-wb-logo.svg" alt="STACKCESS" width={32} height={32} className="h-8 w-8" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
              STACKCESS
            </span>
            <h1 className="text-[var(--font-size-2xl)] font-semibold leading-tight tracking-tight text-foreground">
              Finish your profile
            </h1>
            <p className="text-[var(--font-size-sm)] text-muted-foreground">
              Add your first and last name so your team can identify you in activity and sharing.
            </p>
          </CardHeader>

          <CardContent className="space-y-5 px-6 pb-8 pt-0 sm:px-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    First name
                  </label>
                  <Input
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="Jane"
                    autoComplete="given-name"
                    required
                    className="h-12 rounded-[0.5rem]"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Last name
                  </label>
                  <Input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder="Doe"
                    autoComplete="family-name"
                    required
                    className="h-12 rounded-[0.5rem]"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {status === "success" && (
                <div className="flex items-center gap-2 rounded-lg border border-[var(--color-success)]/25 bg-[var(--color-success)]/5 px-4 py-3 text-sm text-[var(--color-success)]">
                  <Check className="h-4 w-4" />
                  Profile saved. Redirecting now.
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="h-12 w-full rounded-[0.5rem] text-[var(--font-size-base)] font-semibold"
              >
                {submitting ? "Saving..." : "Save and continue"}
              </Button>
            </form>

            <p className="text-xs text-muted-foreground">
              You can update these details later from your profile menu.
            </p>
          </CardContent>
        </Card>
      </div>
    </AuthLayoutShell>
  );
}
