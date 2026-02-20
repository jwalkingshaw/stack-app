import Link from "next/link";
import { AuthLayoutShell } from "@tradetool/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <AuthLayoutShell
      authContext={{ isAuthenticated: false }}
      headerProps={{ className: "hidden" }}
      contentClassName="pt-0"
    >
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px] space-y-6">
          <div className="space-y-2 text-left">
            <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
              STACKCESS
            </span>
            <h1 className="text-[var(--font-size-2xl)] font-semibold leading-tight tracking-tight text-foreground">Access denied</h1>
            <p className="text-[var(--font-size-sm)] text-muted-foreground">You need to sign in to access this workspace.</p>
          </div>

          <Card className="rounded-2xl border border-muted/30 bg-white shadow-sm">
            <CardContent className="space-y-4 px-6 py-6 sm:px-8">
              <Button asChild className="h-12 w-full rounded-[0.5rem] text-[var(--font-size-base)] font-semibold" size="lg">
                <Link href="/api/auth/login">Sign In</Link>
              </Button>

              <Button asChild variant="secondary" className="h-12 w-full rounded-[0.5rem] text-[var(--font-size-base)] font-semibold" size="lg">
                <Link href="/api/auth/register">Create Account</Link>
              </Button>

              <Button asChild variant="ghost" className="h-11 w-full rounded-[0.5rem] text-sm font-medium">
                <Link href="/">Back to Home</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthLayoutShell>
  );
}
