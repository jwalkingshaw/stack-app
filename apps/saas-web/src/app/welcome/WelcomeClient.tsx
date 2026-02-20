"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/hooks/useMe";
import { Check, Sparkles, User } from "lucide-react";

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
    if (!loading && user) {
      setFirstName(user.given_name || "");
      setLastName(user.family_name || "");
    }
  }, [loading, user]);

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
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-14 w-14 rounded-full border-4 border-slate-700 border-t-blue-400 animate-spin" />
          <p className="text-sm text-slate-300">Getting things ready...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md shadow-[0_30px_80px_-25px_rgba(15,23,42,0.7)] overflow-hidden">
          <div className="px-8 py-10 sm:px-12 sm:py-12">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-3 text-blue-300">
                <Sparkles className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold text-white">
                  Let's personalize your workspace
                </h1>
                <p className="mt-2 text-sm text-slate-300">
                  Add your name so teammates know who just joined. We will use this
                  on invites, comments, and activity feeds.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-10 space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">
                    First name
                  </label>
                  <Input
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="Jane"
                    autoComplete="given-name"
                    required
                    className="mt-2 bg-white/10 border-white/15 text-white placeholder:text-slate-400 focus-visible:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">
                    Last name
                  </label>
                  <Input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder="Doe"
                    autoComplete="family-name"
                    required
                    className="mt-2 bg-white/10 border-white/15 text-white placeholder:text-slate-400 focus-visible:ring-blue-400"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-400/60 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              {status === "success" && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-400/60 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  <Check className="h-4 w-4" />
                  Profile saved! Redirecting you now.
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="w-full bg-blue-500 text-white hover:bg-blue-400 focus-visible:ring-blue-300"
              >
                {submitting ? "Saving..." : "Save and continue"}
              </Button>
            </form>

            <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-start gap-3 text-sm text-slate-300">
                <div className="mt-1 rounded-full bg-slate-800/80 p-1 text-slate-200">
                  <User className="h-4 w-4" />
                </div>
                <p>
                  We only use your name inside Stackcess. You can update it anytime
                  from your profile menu once you're in.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
