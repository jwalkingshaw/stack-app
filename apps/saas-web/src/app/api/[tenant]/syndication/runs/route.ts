import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/tenant-auth";
import {
  createPortalPublish,
  createSyndicationRun,
  listRecentPortalPublishes,
  listRecentSyndicationRuns,
  type DeliveryTarget,
  type ScopeSource,
} from "@/lib/syndication-runs";
import { supabaseServer } from "@/lib/supabase";

type CreateRunBody = {
  outputProfileId?: unknown;
  shareSetId?: unknown;
  sourceType?: unknown;
  deliveryTarget?: unknown;
  productIds?: unknown;
  marketId?: unknown;
  localeId?: unknown;
  partnerOrganizationIds?: unknown;
  previewSummary?: unknown;
};

const DELIVERY_TARGETS = new Set<DeliveryTarget>(["portal", "file_export", "direct_channel"]);

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  );
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const tenantAccess = await requireTenantAccess(request, resolvedParams.tenant);
    if (!tenantAccess.ok) return tenantAccess.response;

    if (tenantAccess.organization.organizationType === "partner") {
      return NextResponse.json(
        { error: "Syndication runs are managed from brand workspaces only." },
        { status: 403 }
      );
    }

    const [runs, portalPublishes] = await Promise.all([
      listRecentSyndicationRuns({
        organizationId: tenantAccess.organization.id,
        limit: 8,
      }),
      listRecentPortalPublishes({
        organizationId: tenantAccess.organization.id,
        limit: 8,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        runs,
        portal_publishes: portalPublishes,
      },
    });
  } catch (error) {
    console.error("Failed to load syndication runs:", error);
    return NextResponse.json({ error: "Failed to load syndication runs." }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const tenantAccess = await requireTenantAccess(request, resolvedParams.tenant);
    if (!tenantAccess.ok) return tenantAccess.response;

    if (tenantAccess.organization.organizationType === "partner") {
      return NextResponse.json(
        { error: "Syndication runs are managed from brand workspaces only." },
        { status: 403 }
      );
    }

    const body = ((await request.json().catch(() => ({}))) || {}) as CreateRunBody;
    const outputProfileId = asString(body.outputProfileId);
    const deliveryTarget = asString(body.deliveryTarget) as DeliveryTarget | null;
    const sourceType = (asString(body.sourceType) === "saved_scope"
      ? "saved_scope"
      : "selection") as ScopeSource;
    const shareSetId = asString(body.shareSetId);
    const marketId = asString(body.marketId);
    const localeId = asString(body.localeId);
    const partnerOrganizationIds = asStringArray(body.partnerOrganizationIds);
    const previewSummary = asObject(body.previewSummary);
    const productIds = asStringArray(body.productIds);

    if (!outputProfileId) {
      return NextResponse.json({ error: "outputProfileId is required." }, { status: 400 });
    }
    if (!deliveryTarget || !DELIVERY_TARGETS.has(deliveryTarget)) {
      return NextResponse.json({ error: "deliveryTarget is invalid." }, { status: 400 });
    }
    if (sourceType === "saved_scope" && !shareSetId) {
      return NextResponse.json({ error: "shareSetId is required for saved-scope runs." }, { status: 400 });
    }
    if (deliveryTarget === "portal" && partnerOrganizationIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one partner when publishing to the Partner Portal." },
        { status: 400 }
      );
    }

    if (partnerOrganizationIds.length > 0) {
      const { data: relationships, error: relationshipsError } = await supabaseServer
        .from("brand_partner_relationships")
        .select("partner_organization_id,status")
        .eq("brand_organization_id", tenantAccess.organization.id)
        .in("partner_organization_id", partnerOrganizationIds)
        .eq("status", "active");

      if (relationshipsError) {
        console.error("Failed to validate partner relationships:", relationshipsError);
        return NextResponse.json({ error: "Failed to validate partner relationships." }, { status: 500 });
      }

      const activePartnerIds = new Set(
        ((relationships || []) as Array<{ partner_organization_id: string | null }>)
          .map((row) => row.partner_organization_id)
          .filter((value): value is string => Boolean(value))
      );

      const invalidPartnerId = partnerOrganizationIds.find((id) => !activePartnerIds.has(id));
      if (invalidPartnerId) {
        return NextResponse.json(
          { error: "One or more selected partners are not active for this brand." },
          { status: 400 }
        );
      }
    }

    const readyCount =
      typeof previewSummary.readyCount === "number" ? previewSummary.readyCount : 0;
    const warningCount =
      typeof previewSummary.warningCount === "number" ? previewSummary.warningCount : 0;

    const run = await createSyndicationRun({
      organizationId: tenantAccess.organization.id,
      outputProfileId,
      shareSetId,
      sourceType,
      deliveryTarget,
      marketId,
      localeId,
      productCount: productIds.length,
      readyCount,
      warningCount,
      sourceMetadata: {
        product_ids: productIds,
        scope_source: sourceType,
        saved_scope_id: shareSetId,
      },
      readinessSummary: previewSummary,
      previewMetadata: previewSummary,
      createdBy: tenantAccess.userId ?? null,
    });

    let portalPublish = null;
    if (deliveryTarget === "portal") {
      const { error: contractGrantError } = await supabaseServer
        .from("partner_contract_grants" as never)
        .upsert(
          partnerOrganizationIds.map((partnerOrganizationId) => ({
            organization_id: tenantAccess.organization.id,
            partner_organization_id: partnerOrganizationId,
            output_profile_id: outputProfileId,
            access_level: "view",
            status: "active",
            metadata: {
              source: "syndication",
              delivery_target: "portal",
              syndication_run_id: run.id,
            },
            created_by: tenantAccess.userId ?? null,
          })) as never,
          {
            onConflict: "organization_id,partner_organization_id,output_profile_id",
            ignoreDuplicates: false,
          }
        );

      if (contractGrantError) {
        console.error("Failed to upsert partner destination grants:", contractGrantError);
        return NextResponse.json({ error: "Failed to save destination grants." }, { status: 500 });
      }

      portalPublish = await createPortalPublish({
        organizationId: tenantAccess.organization.id,
        syndicationRunId: run.id,
        outputProfileId,
        partnerOrganizationIds,
        marketId,
        localeId,
        scopeMetadata: {
          source_type: sourceType,
          share_set_id: shareSetId,
          saved_scope_id: shareSetId,
          product_count: productIds.length,
          product_ids: productIds,
        },
        readinessSnapshot: previewSummary,
        metadata: {
          partner_organization_ids: partnerOrganizationIds,
          delivery_target: "portal",
        },
        createdBy: tenantAccess.userId ?? null,
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          run,
          portal_publish: portalPublish,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create syndication run:", error);
    return NextResponse.json({ error: "Failed to create syndication run." }, { status: 500 });
  }
}
