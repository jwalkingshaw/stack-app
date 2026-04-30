import Link from "next/link";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { isAuthenticated, requireUser } from "@/lib/auth-server";
import { getOrganizationBillingLimits } from "@/lib/billing-policy";
import { getSupabaseServer } from "@/lib/supabase";
import { DatabaseQueries } from "@stack-app/database";
import { canUsePublicShareLinks } from "@/lib/billing-policy";
import { applyInvitePermissions } from "@/lib/invite-permissions";

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return true;
  return ts <= Date.now();
}

type TeaserData = {
  brandName: string;
  updateTitle: string;
  updateSummary: string | null;
  updateId: string;
  brandOrgId: string;
  itemCounts: { products: number; assets: number; promotions: number; total: number };
  isExpired: boolean;
  status: string;
};

function normalizeUuidArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    deduped.add(trimmed);
  }
  return Array.from(deduped);
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  const message = String(error.message || "").toLowerCase();
  return message.includes("onboarding_share_set_ids");
}

async function loadShareLinkSettings(params: {
  organizationId: string;
  token: string;
}): Promise<
  | {
      ok: true;
      row: {
        partner_update_id: string;
        public_enabled: boolean;
        expires_at: string | null;
        onboarding_share_set_ids: string[];
      };
    }
  | { ok: false }
> {
  const withOnboarding = await getSupabaseServer()
    .from("partner_update_shares")
    .select("partner_update_id,public_enabled,expires_at,onboarding_share_set_ids")
    .eq("organization_id", params.organizationId)
    .eq("token", params.token)
    .maybeSingle();

  if (!withOnboarding.error && withOnboarding.data) {
    const row = withOnboarding.data as unknown as {
      partner_update_id: string;
      public_enabled: boolean;
      expires_at: string | null;
      onboarding_share_set_ids?: string[] | null;
    };
    return {
      ok: true,
      row: {
        partner_update_id: String(row.partner_update_id || ""),
        public_enabled: Boolean(row.public_enabled),
        expires_at: row.expires_at,
        onboarding_share_set_ids: normalizeUuidArray(row.onboarding_share_set_ids || []),
      },
    };
  }

  if (withOnboarding.error && !isMissingColumnError(withOnboarding.error)) {
    return { ok: false };
  }

  const legacy = await getSupabaseServer()
    .from("partner_update_shares")
    .select("partner_update_id,public_enabled,expires_at")
    .eq("organization_id", params.organizationId)
    .eq("token", params.token)
    .maybeSingle();

  if (legacy.error || !legacy.data) {
    return { ok: false };
  }

  return {
    ok: true,
    row: {
      partner_update_id: String(legacy.data.partner_update_id || ""),
      public_enabled: Boolean(legacy.data.public_enabled),
      expires_at: legacy.data.expires_at as string | null,
      onboarding_share_set_ids: [],
    },
  };
}

async function applyOnboardingShareSetGrants(params: {
  organizationId: string;
  partnerOrganizationId: string;
  shareSetIds: string[];
  grantedBy: string;
}): Promise<boolean> {
  const shareSetIds = Array.from(new Set(params.shareSetIds));
  if (shareSetIds.length === 0) return true;

  const { data: shareSets, error: shareSetError } = await getSupabaseServer()
    .from("share_sets")
    .select("id,module_key")
    .eq("organization_id", params.organizationId)
    .in("id", shareSetIds)
    .in("module_key", ["assets", "products"]);

  if (shareSetError) return false;
  const validIds = new Set(
    ((shareSets || []) as Array<{ id: string | null }>)
      .map((row) => String(row.id || "").trim())
      .filter(Boolean)
  );
  if (validIds.size !== shareSetIds.length) return false;

  const { data: existingActive, error: existingError } = await getSupabaseServer()
    .from("partner_share_set_grants")
    .select("share_set_id")
    .eq("organization_id", params.organizationId)
    .eq("partner_organization_id", params.partnerOrganizationId)
    .eq("status", "active")
    .in("share_set_id", shareSetIds);

  if (existingError) return false;

  const existingIds = new Set(
    ((existingActive || []) as Array<{ share_set_id: string | null }>)
      .map((row) => String(row.share_set_id || "").trim())
      .filter(Boolean)
  );

  const toInsert = shareSetIds.filter((id) => !existingIds.has(id));
  if (toInsert.length === 0) return true;

  const { error: insertError } = await getSupabaseServer()
    .from("partner_share_set_grants")
    .insert(
      toInsert.map((shareSetId) => ({
        organization_id: params.organizationId,
        partner_organization_id: params.partnerOrganizationId,
        share_set_id: shareSetId,
        access_level: "view",
        status: "active",
        granted_by: params.grantedBy,
        metadata: {
          source: "update_share_link_onboarding",
        },
      }))
    );

  if (insertError && insertError.code !== "23505") {
    return false;
  }

  return true;
}

async function getTeaserData(tenant: string, token: string): Promise<TeaserData | null> {
  const db = new DatabaseQueries(getSupabaseServer());
  const brandOrg = await db.getOrganizationBySlug(tenant);
  if (!brandOrg) return null;
  const { planId } = await getOrganizationBillingLimits(brandOrg.id);
  if (!canUsePublicShareLinks(planId)) {
    return null;
  }

  const shareResult = await loadShareLinkSettings({
    organizationId: brandOrg.id,
    token,
  });

  if (!shareResult.ok) return null;
  const shareRow = shareResult.row;
  if (!shareRow.public_enabled) return null;

  const updateId = String(shareRow.partner_update_id || "");
  if (!updateId) return null;

  const { data: updateRow } = await getSupabaseServer()
    .from("partner_updates")
    .select("id,title,summary,status")
    .eq("organization_id", brandOrg.id)
    .eq("id", updateId)
    .maybeSingle();

  if (!updateRow) return null;

  const { data: kitRows } = await getSupabaseServer()
    .from("partner_update_kit_items")
    .select("id,item_type")
    .eq("organization_id", brandOrg.id)
    .eq("partner_update_id", updateId);

  const items = (kitRows || []) as Array<{ item_type: string }>;
  const products = items.filter((i) => i.item_type === "product").length;
  const assets = items.filter((i) => i.item_type === "asset").length;
  const promotions = items.filter((i) => i.item_type === "email" || i.item_type === "social").length;

  return {
    brandName: brandOrg.name || tenant,
    updateTitle: String(updateRow.title || ""),
    updateSummary: typeof updateRow.summary === "string" ? updateRow.summary : null,
    updateId,
    brandOrgId: brandOrg.id,
    itemCounts: { products, assets, promotions, total: items.length },
    isExpired: isExpired(shareRow.expires_at as string | null),
    status: String(updateRow.status || ""),
  };
}

async function acceptShareAndGetRedirect(params: {
  brandSlug: string;
  brandOrgId: string;
  updateId: string;
  token: string;
  partnerOrgId: string;
  partnerOrgSlug: string;
  userId: string;
}): Promise<{ ok: true; redirectUrl: string } | { ok: false; error: string }> {
  const { brandSlug, brandOrgId, updateId, token, partnerOrgId, partnerOrgSlug, userId } = params;
  const db = new DatabaseQueries(getSupabaseServer());

  const permsResult = await applyInvitePermissions({
    supabase: getSupabaseServer(),
    organizationId: brandOrgId,
    userId,
    userEmail: "",
    invitedBy: "system",
    defaultRole: "partner",
    permissions: {},
  });
  if (!permsResult.applied) {
    return { ok: false, error: permsResult.error || "Failed to set up access" };
  }

  const hasRelationship = await db.hasPartnerAccess(brandOrgId, partnerOrgId);
  if (!hasRelationship) {
    const created = await db.createBrandPartnerRelationship({
      brandOrganizationId: brandOrgId,
      partnerOrganizationId: partnerOrgId,
      accessLevel: "view",
      invitedBy: "system",
    });
    if (!created) {
      console.error("Failed to create brand_partner_relationships row:", { brandOrgId, partnerOrgId });
      return { ok: false, error: "Failed to set up brand access" };
    }

    const shareResult = await loadShareLinkSettings({
      organizationId: brandOrgId,
      token,
    });

    if (!shareResult.ok) {
      return { ok: false, error: "Failed to resolve share link settings" };
    }

    const onboardingApplied = await applyOnboardingShareSetGrants({
      organizationId: brandOrgId,
      partnerOrganizationId: partnerOrgId,
      shareSetIds: shareResult.row.onboarding_share_set_ids,
      grantedBy: userId,
    });
    if (!onboardingApplied) {
      return { ok: false, error: "Failed to apply onboarding access for this share link" };
    }
  }

  const { data: existingRecipient } = await getSupabaseServer()
    .from("partner_update_recipients")
    .select("id")
    .eq("organization_id", brandOrgId)
    .eq("partner_update_id", updateId)
    .eq("partner_organization_id", partnerOrgId)
    .maybeSingle();

  if (!existingRecipient) {
    const { error: recipientError } = await getSupabaseServer().from("partner_update_recipients").insert({
      organization_id: brandOrgId,
      partner_update_id: updateId,
      partner_organization_id: partnerOrgId,
      status: "opened",
      delivery_channels: ["share_link"],
      opened_at: new Date().toISOString(),
      metadata: { source: "share_link_accept", share_token_prefix: token.slice(0, 8) },
    });
    if (recipientError) {
      console.error("Failed to create partner_update_recipients row:", recipientError);
      // Don't fail the redirect — ensurePartnerUpdateRecipient will auto-create if needed
    }
  }

  return {
    ok: true,
    redirectUrl: `/${partnerOrgSlug}/view/${brandSlug}/updates/${updateId}`,
  };
}

function ErrorPage({ title, description }: { title: string; description: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </main>
  );
}

export default async function KitSharePage({
  params,
}: {
  params: Promise<{ tenant: string; token: string }>;
}) {
  const { tenant, token } = await params;

  const teaser = await getTeaserData(tenant, token);

  if (!teaser) {
    return <ErrorPage title="Link unavailable" description="This kit link is invalid or no longer available." />;
  }
  if (teaser.isExpired) {
    return <ErrorPage title="Link expired" description="This kit link has expired. Ask the brand for a new link." />;
  }
  if (teaser.status !== "published") {
    return <ErrorPage title="Not published yet" description="This kit hasn't been published yet." />;
  }

  const currentUrl = `/u/${tenant}/${token}`;

  // ── Authenticated path ───────────────────────────────────────────────────
  const authenticated = await isAuthenticated();

  if (authenticated) {
    const user = await requireUser();

    if (user?.id) {
      const { data: memberRows } = await getSupabaseServer()
        .from("organization_members")
        .select("organization_id, role, organizations(id, name, slug, organization_type)")
        .eq("kinde_user_id", user.id)
        .eq("status", "active");

      type OrgRow = { id: string; name: string; slug: string; organization_type: string };
      const ownOrgs: OrgRow[] = [];

      for (const row of (memberRows || []) as Array<Record<string, unknown>>) {
        const org = row.organizations as OrgRow | null;
        if (!org?.id || !org?.slug) continue;
        const role = typeof row.role === "string" ? row.role : "";
        if (org.organization_type !== "brand" || role !== "partner") {
          ownOrgs.push(org);
        }
      }

      if (ownOrgs.length === 0) {
        redirect(`/onboarding?type=partner&return_to=${encodeURIComponent(currentUrl)}`);
      }

      const partnerOrg =
        ownOrgs.find((o) => o.organization_type === "partner" || o.organization_type !== "brand") ??
        ownOrgs[0];

      const result = await acceptShareAndGetRedirect({
        brandSlug: tenant,
        brandOrgId: teaser.brandOrgId,
        updateId: teaser.updateId,
        token,
        partnerOrgId: partnerOrg.id,
        partnerOrgSlug: partnerOrg.slug,
        userId: user.id,
      });

      if (!result.ok) {
        return <ErrorPage title="Could not access kit" description={result.error} />;
      }

      redirect(result.redirectUrl);
    }
  }

  // ── Unauthenticated path — teaser gate ───────────────────────────────────
  const loginUrl = `/api/auth/login?post_login_redirect_url=${encodeURIComponent(currentUrl)}`;
  const signupUrl = `/api/auth/register?post_login_redirect_url=${encodeURIComponent(currentUrl)}`;

  const { products, assets, promotions, total } = teaser.itemCounts;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">

          {/* Brand header bar */}
          <div className="border-b border-gray-200 bg-muted/30 px-6 py-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground/10">
              <Package className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">You have a new kit from</p>
              <p className="text-sm font-semibold text-foreground">{teaser.brandName}</p>
            </div>
          </div>

          {/* Kit content */}
          <div className="px-6 py-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{teaser.updateTitle}</h1>

            {teaser.updateSummary ? (
              <blockquote className="mt-4 border-l-2 border-border pl-4 text-sm leading-relaxed text-muted-foreground italic">
                {teaser.updateSummary}
              </blockquote>
            ) : null}

            {/* Item count pills */}
            {total > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {products > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-foreground shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                    {products} {products === 1 ? "product" : "products"}
                  </span>
                )}
                {assets > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-foreground shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                    {assets} {assets === 1 ? "asset" : "assets"}
                  </span>
                )}
                {promotions > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-foreground shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {promotions} {promotions === 1 ? "promotion" : "promotions"}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">Kit is being prepared&hellip;</p>
            )}
          </div>

          {/* Access gate */}
          <div className="border-t border-gray-200 bg-muted/20 px-6 py-5">
            <p className="text-sm font-semibold text-foreground">
              Sign in for secure access
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {teaser.brandName} shares product content exclusively with verified partners.
              Access is always free — your account lets you receive future kits and updates from any brand on Stackcess.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Link
                href={signupUrl}
                className="flex-1 rounded-lg bg-foreground px-4 py-2.5 text-center text-sm font-semibold text-background transition-opacity hover:opacity-90"
              >
                Create free account
              </Link>
              <Link
                href={loginUrl}
                className="flex-1 rounded-lg border border-border bg-white px-4 py-2.5 text-center text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
              >
                Sign in
              </Link>
            </div>
          </div>

        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Shared via Stackcess &middot;{" "}
          <Link href="/" className="hover:underline">
            stackcess.com
          </Link>
        </p>
      </div>
    </div>
  );
}
