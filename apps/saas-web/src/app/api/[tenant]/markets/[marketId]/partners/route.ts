import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import { blockPartnerBrandMutation } from "@/lib/partner-brand-mutation-guard";
import { logSecurityEvent } from "@/lib/security-audit";

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function ensureMarketExists(params: {
  organizationId: string;
  marketId: string;
}): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("markets")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("id", params.marketId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.id);
}

async function requireBrandOwnerOrAdmin(params: {
  organizationId: string;
  userId: string;
  request: NextRequest;
  action: string;
}): Promise<NextResponse | null> {
  const { data: memberRow } = await supabaseServer
    .from("organization_members")
    .select("role")
    .eq("organization_id", params.organizationId)
    .eq("kinde_user_id", params.userId)
    .eq("status", "active")
    .maybeSingle();

  if (memberRow && ["owner", "admin"].includes(String(memberRow.role || ""))) {
    return null;
  }

  await logSecurityEvent(supabaseServer, {
    organizationId: params.organizationId,
    actorUserId: params.userId,
    action: "security.partner_brand_permission_denied",
    resourceType: "partner_market_assignment",
    userAgent: params.request.headers.get("user-agent"),
    metadata: {
      attempted_action: params.action,
      method: params.request.method,
      path: new URL(params.request.url).pathname,
    },
  });

  return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
}

// GET /api/[tenant]/markets/[marketId]/partners
// Returns partners assigned to this market plus available partners to add.
// Legacy output_profile_id values are kept for compatibility and represent
// market-level destination assignments.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; marketId: string }> }
) {
  try {
    const { tenant, marketId: marketIdParam } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");
    const marketId = normalizeToken(marketIdParam);

    if (!marketId) {
      return NextResponse.json({ error: "marketId is required." }, { status: 400 });
    }

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) return contextResult.response;

    const organizationId = contextResult.context.targetOrganization.id;
    const exists = await ensureMarketExists({ organizationId, marketId });
    if (!exists) {
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }

    // Load assigned partners for this market
    const { data: assignments, error: assignmentsError } = await supabaseServer
      .from("partner_market_assignments" as never)
      .select("id,partner_organization_id,valid_from,assigned_by,created_at,output_profile_id")
      .eq("organization_id", organizationId)
      .eq("market_id", marketId)
      .eq("is_active", true);

    if (assignmentsError) {
      const msg = String((assignmentsError as { message?: string }).message || "");
      if (msg.includes("partner_market_assignments") || (assignmentsError as { code?: string }).code === "42P01") {
        return NextResponse.json({ error: "Partner market assignments feature not yet available. Apply database migrations first." }, { status: 503 });
      }
      console.error("Failed to load market partner assignments:", assignmentsError);
      return NextResponse.json({ error: "Failed to load market partners." }, { status: 500 });
    }

    const assignedRows = (assignments || []) as Array<{
      id: string;
      partner_organization_id: string;
      valid_from: string | null;
      assigned_by: string | null;
      created_at: string;
      output_profile_id: string | null;
    }>;

    const assignedPartnerIds = new Set(assignedRows.map((r) => r.partner_organization_id));

    // Resolve partner org details
    const partnerOrgIds = Array.from(assignedPartnerIds);
    let partnerOrgs: Array<{ id: string; name: string; slug: string; partner_category: string | null }> = [];

    if (partnerOrgIds.length > 0) {
      const { data: orgs } = await supabaseServer
        .from("organizations")
        .select("id,name,slug,partner_category")
        .in("id", partnerOrgIds);
      partnerOrgs = (orgs || []) as typeof partnerOrgs;
    }

    const partnerOrgById = new Map(partnerOrgs.map((o) => [o.id, o]));

    const partners = assignedRows.map((row) => {
      const org = partnerOrgById.get(row.partner_organization_id);
      return {
        assignment_id: row.id,
        partner_organization_id: row.partner_organization_id,
        name: org?.name || row.partner_organization_id,
        slug: org?.slug || "",
        partner_category: org?.partner_category || null,
        valid_from: row.valid_from,
        assigned_at: row.created_at,
        output_profile_id: row.output_profile_id ?? null,
        destination_profile_id: row.output_profile_id ?? null,
      };
    });

    // Load available partners (active relationships not yet assigned to this market)
    const { data: relationships } = await supabaseServer
      .from("brand_partner_relationships")
      .select("partner_organization_id")
      .eq("brand_organization_id", organizationId)
      .eq("status", "active");

    const allPartnerIds = (relationships || []).map(
      (r: { partner_organization_id: string }) => r.partner_organization_id
    );
    const availablePartnerIds = allPartnerIds.filter((id) => !assignedPartnerIds.has(id));

    let availablePartners: Array<{ id: string; name: string; slug: string; partner_category: string | null }> = [];
    if (availablePartnerIds.length > 0) {
      const { data: availOrgs } = await supabaseServer
        .from("organizations")
        .select("id,name,slug,partner_category")
        .in("id", availablePartnerIds);
      availablePartners = (availOrgs || []) as typeof availablePartners;
    }

    return NextResponse.json({
      success: true,
      data: { partners, available_partners: availablePartners },
    });
  } catch (error) {
    console.error("Error in market partners GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/markets/[marketId]/partners
// Assigns a partner to this market
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; marketId: string }> }
) {
  try {
    const { tenant, marketId: marketIdParam } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");
    const marketId = normalizeToken(marketIdParam);

    if (!marketId) {
      return NextResponse.json({ error: "marketId is required." }, { status: 400 });
    }

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) return contextResult.response;

    const { context } = contextResult;
    const blockedMutation = await blockPartnerBrandMutation({
      request,
      context,
      action: "markets.partners.assign",
      resourceType: "partner_market_assignment",
      metadata: {
        market_id: marketId,
      },
    });
    if (blockedMutation) return blockedMutation;

    const organizationId = context.targetOrganization.id;
    const denied = await requireBrandOwnerOrAdmin({
      organizationId,
      userId: context.userId,
      request,
      action: "markets.partners.assign",
    });
    if (denied) return denied;

    const exists = await ensureMarketExists({ organizationId, marketId });
    if (!exists) {
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const partnerOrganizationId = normalizeToken(body?.partnerOrganizationId ?? body?.partner_organization_id);
    const validFrom = normalizeToken(body?.validFrom ?? body?.valid_from);

    if (!partnerOrganizationId) {
      return NextResponse.json({ error: "partnerOrganizationId is required." }, { status: 400 });
    }

    // Verify active relationship exists
    const { data: rel } = await supabaseServer
      .from("brand_partner_relationships")
      .select("id")
      .eq("brand_organization_id", organizationId)
      .eq("partner_organization_id", partnerOrganizationId)
      .eq("status", "active")
      .maybeSingle();

    if (!rel) {
      return NextResponse.json({ error: "No active partner relationship found." }, { status: 400 });
    }

    const { error: upsertError } = await supabaseServer
      .from("partner_market_assignments" as never)
      .upsert(
        [{
          organization_id: organizationId,
          market_id: marketId,
          partner_organization_id: partnerOrganizationId,
          is_active: true,
          valid_from: validFrom ?? null,
          assigned_by: context.userId,
          metadata: {
            source: "manual",
            updated_by: context.userId,
            updated_at: new Date().toISOString(),
          },
        }] as never,
        { onConflict: "organization_id,market_id,partner_organization_id" }
      );

    if (upsertError) {
      console.error("Failed to assign partner to market:", upsertError);
      return NextResponse.json({ error: "Failed to assign partner to market." }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Error in market partners POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/[tenant]/markets/[marketId]/partners
// Updates an existing assignment's legacy destination profile reference.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; marketId: string }> }
) {
  try {
    const { tenant, marketId: marketIdParam } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");
    const marketId = normalizeToken(marketIdParam);

    if (!marketId) {
      return NextResponse.json({ error: "marketId is required." }, { status: 400 });
    }

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) return contextResult.response;

    const { context } = contextResult;
    const blockedMutation = await blockPartnerBrandMutation({
      request,
      context,
      action: "markets.partners.update",
      resourceType: "partner_market_assignment",
      metadata: {
        market_id: marketId,
      },
    });
    if (blockedMutation) return blockedMutation;

    const organizationId = context.targetOrganization.id;
    const denied = await requireBrandOwnerOrAdmin({
      organizationId,
      userId: context.userId,
      request,
      action: "markets.partners.update",
    });
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const partnerOrganizationId = normalizeToken(body?.partnerOrganizationId ?? body?.partner_organization_id);

    if (!partnerOrganizationId) {
      return NextResponse.json({ error: "partnerOrganizationId is required." }, { status: 400 });
    }

    // output_profile_id can be null (clear the legacy destination) or a UUID string.
    const outputProfileId: string | null =
      body?.output_profile_id === null ? null : normalizeToken(body?.output_profile_id);

    if (outputProfileId) {
      const { data: profile } = await supabaseServer
        .from("output_channel_profiles" as never)
        .select("id,market_id")
        .eq("id", outputProfileId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (!profile) {
        return NextResponse.json({ error: "Destination profile not found." }, { status: 404 });
      }

      const scopedMarketId = (profile as { market_id?: string | null }).market_id ?? null;
      if (scopedMarketId && scopedMarketId !== marketId) {
        return NextResponse.json(
          { error: "Destination profile market does not match this market assignment." },
          { status: 400 }
        );
      }
    }

    const { error: updateError } = await supabaseServer
      .from("partner_market_assignments" as never)
      .update({ output_profile_id: outputProfileId } as never)
      .eq("organization_id", organizationId)
      .eq("market_id", marketId)
      .eq("partner_organization_id", partnerOrganizationId)
      .eq("is_active", true);

    if (updateError) {
      console.error("Failed to update partner market assignment:", updateError);
      return NextResponse.json({ error: "Failed to update assignment." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in market partners PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/markets/[marketId]/partners?partnerOrganizationId=
// Removes a partner from this market
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; marketId: string }> }
) {
  try {
    const { tenant, marketId: marketIdParam } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");
    const marketId = normalizeToken(marketIdParam);
    const partnerOrganizationId = normalizeToken(
      new URL(request.url).searchParams.get("partnerOrganizationId")
    );

    if (!marketId) {
      return NextResponse.json({ error: "marketId is required." }, { status: 400 });
    }
    if (!partnerOrganizationId) {
      return NextResponse.json({ error: "partnerOrganizationId is required." }, { status: 400 });
    }

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) return contextResult.response;

    const { context } = contextResult;
    const blockedMutation = await blockPartnerBrandMutation({
      request,
      context,
      action: "markets.partners.remove",
      resourceType: "partner_market_assignment",
      metadata: {
        market_id: marketId,
        partner_organization_id: partnerOrganizationId,
      },
    });
    if (blockedMutation) return blockedMutation;

    const organizationId = context.targetOrganization.id;
    const denied = await requireBrandOwnerOrAdmin({
      organizationId,
      userId: context.userId,
      request,
      action: "markets.partners.remove",
    });
    if (denied) return denied;

    const { error: updateError } = await supabaseServer
      .from("partner_market_assignments" as never)
      .update({ is_active: false } as never)
      .eq("organization_id", organizationId)
      .eq("market_id", marketId)
      .eq("partner_organization_id", partnerOrganizationId)
      .eq("is_active", true);

    if (updateError) {
      console.error("Failed to remove partner from market:", updateError);
      return NextResponse.json({ error: "Failed to remove partner from market." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in market partners DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

