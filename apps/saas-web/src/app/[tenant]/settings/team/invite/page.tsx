import Link from "next/link";
import { Users, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsPageContent } from "../../components/settings-page-content";

export default async function InviteTypeChooserPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const resolvedParams = await params;
  const tenantSlug = resolvedParams.tenant;

  return (
    <SettingsPageContent page="team-invite">
      <PageHeader
        title="Invite User"
        description="Choose the journey that matches who you are inviting."
        backHref={`/${tenantSlug}/settings/team`}
        backLabel="Back to Team"
        sticky={false}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-background p-5 space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <Users className="h-4 w-4" />
            <h2 className="text-sm font-medium">Team Member</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Invite internal brand users (admin/editor/viewer).
          </p>
          <Button asChild size="sm">
            <Link href={`/${tenantSlug}/settings/team/invite/team`}>Start Team Invite</Link>
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-background p-5 space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <Building2 className="h-4 w-4" />
            <h2 className="text-sm font-medium">Partner</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Invite external distributors, wholesalers, and retailers.
          </p>
          <Button asChild size="sm">
            <Link href={`/${tenantSlug}/settings/team/invite/partner`}>Start Partner Invite</Link>
          </Button>
        </div>
      </div>
    </SettingsPageContent>
  );
}
