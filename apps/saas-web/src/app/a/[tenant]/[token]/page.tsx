import Image from "next/image";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { isAuthenticated, requireOrganization, requireUser } from "@/lib/auth-server";
import { canUsePublicShareLinks, getOrganizationBillingLimits } from "@/lib/billing-policy";
import { getSupabaseServer } from "@/lib/supabase";
import { DatabaseQueries } from "@stack-app/database";
import { S3Service } from "@stack-app/storage";

type AssetRow = {
  id: string;
  original_filename: string;
  mime_type: string;
  s3_key: string;
};

type AssetShareRow = {
  asset_id: string;
  public_enabled: boolean;
  allow_downloads: boolean;
  expires_at: string;
};

type ShareLookup = {
  asset: AssetRow;
  publicEnabled: boolean;
  allowDownloads: boolean;
  expiresAt: string;
  forceAuthenticatedAccess: boolean;
};

const isShareExpired = (expiresAt?: string) => {
  if (!expiresAt) return true;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return true;
  return ts <= Date.now();
};

const findSharedAsset = async (tenant: string, token: string): Promise<ShareLookup | null> => {
  const db = new DatabaseQueries(getSupabaseServer());
  const org = await db.getOrganizationBySlug(tenant);
  if (!org) return null;

  const { planId } = await getOrganizationBillingLimits(org.id);

  const { data: shareRowRaw } = await getSupabaseServer()
    .from("asset_shares")
    .select("asset_id, public_enabled, allow_downloads, expires_at")
    .eq("organization_id", org.id)
    .eq("token", token)
    .maybeSingle();

  if (!shareRowRaw) return null;
  const shareRow = shareRowRaw as Partial<AssetShareRow>;
  if (typeof shareRow.asset_id !== "string") return null;

  const { data: assetRowRaw } = await getSupabaseServer()
    .from("dam_assets")
    .select("id, original_filename, mime_type, s3_key")
    .eq("organization_id", org.id)
    .eq("id", shareRow.asset_id)
    .maybeSingle();

  if (!assetRowRaw) return null;
  const assetRow = assetRowRaw as Partial<AssetRow>;
  if (
    typeof assetRow.id !== "string" ||
    typeof assetRow.original_filename !== "string" ||
    typeof assetRow.mime_type !== "string" ||
    typeof assetRow.s3_key !== "string"
  ) {
    return null;
  }

  return {
    asset: {
      id: assetRow.id,
      original_filename: assetRow.original_filename,
      mime_type: assetRow.mime_type,
      s3_key: assetRow.s3_key,
    },
    publicEnabled: Boolean(shareRow.public_enabled),
    allowDownloads: Boolean(shareRow.allow_downloads),
    expiresAt: typeof shareRow.expires_at === "string" ? shareRow.expires_at : "",
    forceAuthenticatedAccess: !canUsePublicShareLinks(planId),
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

  if (isShareExpired(share.expiresAt)) {
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

  const requiresAuthenticatedAccess = !share.publicEnabled || share.forceAuthenticatedAccess;

  if (requiresAuthenticatedAccess) {
    const authenticated = await isAuthenticated();
    if (!authenticated) redirect("/api/auth/login");

    const user = await requireUser();
    if (!user?.id) redirect("/api/auth/login");

    const db = new DatabaseQueries(getSupabaseServer());
    const organization = await db.getOrganizationBySlug(tenant);
    if (!organization) redirect("/unauthorized");

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
  const previewUrl = await s3Service.getPresignedDownloadUrl(share.asset.s3_key, 900);
  const isImage = share.asset.mime_type.startsWith("image/");
  const downloadHref = `/api/public/assets/${tenant}/${token}/download`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{share.asset.original_filename}</h1>
          <p className="text-sm text-muted-foreground">Shared via TradeTool</p>
        </div>
        {share.allowDownloads && (
          <Button asChild>
            <a href={downloadHref}>Download</a>
          </Button>
        )}
      </header>

      <section className="rounded-lg border border-border bg-muted/20 p-4">
        {isImage ? (
          <Image
            src={previewUrl}
            alt={share.asset.original_filename}
            width={1600}
            height={1200}
            unoptimized
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
