import { redirect } from "next/navigation";
import { DatabaseQueries } from "@tradetool/database";
import { S3Service } from "@tradetool/storage";
import { supabaseServer } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { isAuthenticated, requireOrganization, requireUser } from "@/lib/auth-server";
import { getOrganizationBillingLimits } from "@/lib/billing-policy";

type AssetRow = {
  id: string;
  original_filename: string;
  mime_type: string;
  s3_key: string;
};

const isShareExpired = (expiresAt?: string) => {
  if (!expiresAt) return true;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return true;
  return ts <= Date.now();
};

type ShareLookup = {
  asset: AssetRow;
  publicEnabled: boolean;
  allowDownloads: boolean;
  expiresAt: string;
  forceAuthenticatedAccess: boolean;
};

const findSharedAsset = async (tenant: string, token: string): Promise<ShareLookup | null> => {
  const db = new DatabaseQueries(supabaseServer);
  const org = await db.getOrganizationBySlug(tenant);
  if (!org) return null;
  const { planId } = await getOrganizationBillingLimits(org.id);

  const { data: shareRow } = await (supabaseServer as any)
    .from("asset_shares")
    .select("asset_id, public_enabled, allow_downloads, expires_at")
    .eq("organization_id", org.id)
    .eq("token", token)
    .maybeSingle();
  if (!shareRow) {
    return null;
  }

  const { data: assetRow } = await (supabaseServer as any)
    .from("dam_assets")
    .select("id, original_filename, mime_type, s3_key")
    .eq("organization_id", org.id)
    .eq("id", (shareRow as any).asset_id)
    .maybeSingle();
  if (!assetRow) {
    return null;
  }

  return {
    asset: assetRow as AssetRow,
    publicEnabled: Boolean((shareRow as any).public_enabled),
    allowDownloads: Boolean((shareRow as any).allow_downloads),
    expiresAt: String((shareRow as any).expires_at),
    forceAuthenticatedAccess: planId === "free",
  };
};

export default async function PublicAssetPage({
  params,
}: {
  params: Promise<{ tenant: string; token: string }>;
}) {
  const { tenant, token } = await params;
  const share = await findSharedAsset(tenant, token);

  if (!share) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-8">
        <div className="rounded-lg border border-border bg-white p-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">Link unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This shared link is invalid or no longer public.
          </p>
        </div>
      </main>
    );
  }

  const expired = isShareExpired(share.expiresAt);
  if (expired) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-8">
        <div className="rounded-lg border border-border bg-white p-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">Link expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This shared link has expired. Ask the owner to generate a new one.
          </p>
        </div>
      </main>
    );
  }

  const publicEnabled = share.publicEnabled;
  const allowDownloads = share.allowDownloads;
  const asset = share.asset;
  const requiresAuthenticatedAccess = !publicEnabled || share.forceAuthenticatedAccess;

  if (requiresAuthenticatedAccess) {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      redirect("/api/auth/login");
    }

    const user = await requireUser();
    if (!user?.id) {
      redirect("/api/auth/login");
    }

    const db = new DatabaseQueries(supabaseServer);
    const organization = await db.getOrganizationBySlug(tenant);
    if (!organization) {
      redirect("/unauthorized");
    }

    const kindeOrg = await requireOrganization();
    if (kindeOrg?.orgCode) {
      if (kindeOrg.orgCode !== organization.kindeOrgId) {
        redirect("/unauthorized");
      }
    } else {
      const membership = await db.getOrganizationMembership(organization.id, user.id);
      if (!membership) {
        redirect("/unauthorized");
      }
    }
  }

  const s3Service = new S3Service();
  const previewUrl = await s3Service.getPresignedDownloadUrl(asset.s3_key, 900);
  const isImage = asset.mime_type?.startsWith("image/");
  const downloadHref = `/api/public/assets/${tenant}/${token}/download`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{asset.original_filename}</h1>
          <p className="text-sm text-muted-foreground">Shared via TradeTool</p>
        </div>
        {allowDownloads && (
          <Button asChild>
            <a href={downloadHref}>Download</a>
          </Button>
        )}
      </header>

      <section className="rounded-lg border border-border bg-muted/20 p-4">
        {isImage ? (
          <img
            src={previewUrl}
            alt={asset.original_filename}
            className="mx-auto max-h-[75vh] w-auto max-w-full rounded-md"
          />
        ) : (
          <div className="py-16 text-center text-muted-foreground">
            Preview is not available for this file type.
          </div>
        )}
      </section>
    </main>
  );
}
