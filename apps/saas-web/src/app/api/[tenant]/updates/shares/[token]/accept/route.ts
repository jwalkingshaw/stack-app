import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { DatabaseQueries } from "@stack-app/database";
import { getOrganizationBillingLimits } from "@/lib/billing-policy";
import { supabaseServer } from "@/lib/supabase";
import { applyInvitePermissions } from "@/lib/invite-permissions";
import { canUsePublicShareLinks } from "@/lib/billing-policy";
import { normalizeUuidArray } from "../../../_shared";

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return true;
  return ts <= Date.now();
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  const message = String(error.message || "").toLowerCase();
  return message.includes("onboarding_share_set_ids");
}

async function loadShareRow(params: {
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
  | { ok: false; status: number; error: string }
> {
  const withOnboarding = await supabaseServer
    .from("partner_update_shares")
    .select("partner_update_id,public_enabled,expires_at,onboarding_share_set_ids")
    .eq("organization_id", params.organizationId)
    .eq("token", params.token)
    .maybeSingle();

  if (!withOnboarding.error) {
    const row = withOnboarding.data as {
      partner_update_id: string;
      public_enabled: boolean;
      expires_at: string | null;
      onboarding_share_set_ids?: string[] | null;
    } | null;
    if (!row) {
      return { ok: false, status: 404, error: "Share link not found" };
    }
    return {
      ok: true,
      row: {
        partner_update_id: String(row.partner_update_id),
        public_enabled: Boolean(row.public_enabled),
        expires_at: row.expires_at,
        onboarding_share_set_ids: normalizeUuidArray(row.onboarding_share_set_ids || []),
      },
    };
  }

  if (!isMissingColumnError(withOnboarding.error)) {
    return { ok: false, status: 500, error: "Failed to load share link settings" };
  }

  const legacy = await supabaseServer
    .from("partner_update_shares")
    .select("partner_update_id,public_enabled,expires_at")
    .eq("organization_id", params.organizationId)
    .eq("token", params.token)
    .maybeSingle();

  if (legacy.error) {
    return { ok: false, status: 500, error: "Failed to load share link settings" };
  }
  if (!legacy.data) {
    return { ok: false, status: 404, error: "Share link not found" };
  }

  return {
    ok: true,
    row: {
      partner_update_id: String(legacy.data.partner_update_id),
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
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (params.shareSetIds.length === 0) {
    return { ok: true };
  }

  const normalizedIds = Array.from(new Set(params.shareSetIds));
  const { data: shareSets, error: shareSetError } = await supabaseServer
    .from("share_sets")
    .select("id,module_key")
    .eq("organization_id", params.organizationId)
    .in("id", normalizedIds)
    .in("module_key", ["assets", "products"]);

  if (shareSetError) {
    if (shareSetError.code === "42P01" || shareSetError.code === "PGRST205") {
      return {
        ok: false,
        status: 503,
        error: "Saved scope tables are unavailable. Apply database migrations first.",
      };
    }
    return { ok: false, status: 500, error: "Failed to validate onboarding saved scopes" };
  }

  const validIds = new Set(
    ((shareSets || []) as Array<{ id: string | null }>)
      .map((row) => String(row.id || "").trim())
      .filter(Boolean)
  );

  if (validIds.size !== normalizedIds.length) {
    return {
      ok: false,
      status: 400,
      error: "One or more onboarding saved scopes are invalid for this workspace.",
    };
  }

  const { data: existingActive, error: existingError } = await supabaseServer
    .from("partner_share_set_grants")
    .select("share_set_id")
    .eq("organization_id", params.organizationId)
    .eq("partner_organization_id", params.partnerOrganizationId)
    .eq("status", "active")
    .in("share_set_id", normalizedIds);

  if (existingError) {
    if (existingError.code === "42P01" || existingError.code === "PGRST205") {
      return {
        ok: false,
        status: 503,
        error: "Saved scope grant table is unavailable. Apply database migrations first.",
      };
    }
    return {
      ok: false,
      status: 500,
      error: "Failed to resolve existing onboarding saved scope grants",
    };
  }

  const existingIds = new Set(
    ((existingActive || []) as Array<{ share_set_id: string | null }>)
      .map((row) => String(row.share_set_id || "").trim())
      .filter(Boolean)
  );

  const toInsert = normalizedIds.filter((id) => !existingIds.has(id));
  if (toInsert.length === 0) {
    return { ok: true };
  }

  const insertRows = toInsert.map((shareSetId) => ({
    organization_id: params.organizationId,
    partner_organization_id: params.partnerOrganizationId,
    share_set_id: shareSetId,
    access_level: "view",
    status: "active",
    granted_by: params.grantedBy,
    metadata: {
      source: "update_share_link_onboarding",
    },
  }));

  const { error: insertError } = await supabaseServer
    .from("partner_share_set_grants")
    .insert(insertRows);

  if (insertError) {
    if (insertError.code === "23505") {
      return { ok: true };
    }
    return {
      ok: false,
      status: 500,
      error: "Failed to apply onboarding saved scope grants",
    };
  }

  return { ok: true };
}

// POST /api/[tenant]/updates/shares/[token]/accept
// Called after a partner authenticates via a public kit share link.
// Creates the partner relationship + update recipient, then returns the redirect URL.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; token: string }> }
) {
  try {
    const { tenant, token } = await params;
    const { getUser } = getKindeServerSession();
    const user = await getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = new DatabaseQueries(supabaseServer);

    // Validate the share token
    const brandOrg = await db.getOrganizationBySlug(tenant);
    if (!brandOrg) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }
    const { planId } = await getOrganizationBillingLimits(brandOrg.id);
    if (!canUsePublicShareLinks(planId)) {
      return NextResponse.json({ error: "Public share links are unavailable on this plan" }, { status: 403 });
    }

    const shareRowResult = await loadShareRow({
      organizationId: brandOrg.id,
      token,
    });
    if (!shareRowResult.ok) {
      return NextResponse.json({ error: shareRowResult.error }, { status: shareRowResult.status });
    }
    const shareRow = shareRowResult.row;

    if (!shareRow.public_enabled) {
      return NextResponse.json({ error: "This share link is not active" }, { status: 403 });
    }
    if (isExpired(shareRow.expires_at)) {
      return NextResponse.json({ error: "This share link has expired" }, { status: 410 });
    }

    const updateId = String(shareRow.partner_update_id);

    // Verify the update is published
    const { data: updateRow } = await supabaseServer
      .from("partner_updates")
      .select("id,status")
      .eq("organization_id", brandOrg.id)
      .eq("id", updateId)
      .eq("status", "published")
      .maybeSingle();

    if (!updateRow) {
      return NextResponse.json({ error: "Update not available" }, { status: 404 });
    }

    // Get the body: partnerOrgId
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const partnerOrgId = typeof body.partnerOrgId === "string" ? body.partnerOrgId : null;

    if (!partnerOrgId) {
      return NextResponse.json({ error: "partnerOrgId is required" }, { status: 400 });
    }

    // Verify user is actually a member of that org
    const membership = await db.getOrganizationMembership(partnerOrgId, user.id);
    if (!membership) {
      return NextResponse.json({ error: "You are not a member of the specified organization" }, { status: 403 });
    }

    const { data: partnerOrg } = await supabaseServer
      .from("organizations")
      .select("id,name,slug,organization_type")
      .eq("id", partnerOrgId)
      .maybeSingle();

    if (!partnerOrg) {
      return NextResponse.json({ error: "Partner organization not found" }, { status: 404 });
    }

    // Add user to brand org as partner member (enables RLS access to brand's data)
    const permissionsResult = await applyInvitePermissions({
      supabase: supabaseServer,
      organizationId: brandOrg.id,
      userId: user.id,
      userEmail: user.email || "",
      invitedBy: "system",
      defaultRole: "partner",
      permissions: {},
    });
    if (!permissionsResult.applied) {
      console.error("Failed to apply partner permissions:", permissionsResult.error);
      return NextResponse.json(
        { error: permissionsResult.error || "Failed to set up access" },
        { status: 500 }
      );
    }

    // Create partner relationship (upsert — safe to call multiple times)
    const existingRelationship = await db.hasPartnerAccess(brandOrg.id, partnerOrgId);
    if (!existingRelationship) {
      await db.createBrandPartnerRelationship({
        brandOrganizationId: brandOrg.id,
        partnerOrganizationId: partnerOrgId,
        accessLevel: "view",
        invitedBy: "system",
      });

      const onboardingGrantResult = await applyOnboardingShareSetGrants({
        organizationId: brandOrg.id,
        partnerOrganizationId: partnerOrgId,
        shareSetIds: shareRow.onboarding_share_set_ids,
        grantedBy: user.id,
      });
      if (!onboardingGrantResult.ok) {
        return NextResponse.json(
          { error: onboardingGrantResult.error },
          { status: onboardingGrantResult.status }
        );
      }
    }

    // Create recipient row (upsert) so the partner can view this specific update
    const { data: existingRecipient } = await supabaseServer
      .from("partner_update_recipients")
      .select("id")
      .eq("organization_id", brandOrg.id)
      .eq("partner_update_id", updateId)
      .eq("partner_organization_id", partnerOrgId)
      .maybeSingle();

    if (!existingRecipient) {
      await supabaseServer
        .from("partner_update_recipients")
        .insert({
          organization_id: brandOrg.id,
          partner_update_id: updateId,
          partner_organization_id: partnerOrgId,
          status: "opened",
          delivery_channels: ["share_link"],
          opened_at: new Date().toISOString(),
          metadata: { source: "share_link_accept", share_token_prefix: token.slice(0, 8) },
        });
    }

    // Return redirect URL: /{partnerSlug}/view/{brandSlug}/updates/{updateId}
    const partnerSlug = (partnerOrg as Record<string, unknown>).slug as string;
    const redirectUrl = `/${partnerSlug}/view/${tenant}/updates/${updateId}`;

    return NextResponse.json({ success: true, redirectUrl });
  } catch (error) {
    console.error("Error in kit share accept:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
