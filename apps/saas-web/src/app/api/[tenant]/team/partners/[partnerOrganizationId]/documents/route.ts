import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { getPartnerRegulatoryPackage } from "@/lib/product-contracts";

function parseProductIds(searchParams: URLSearchParams): string[] {
  const values = searchParams.getAll("productIds");
  const ids = new Set<string>();
  for (const value of values) {
    for (const part of String(value || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)) {
      ids.add(part);
    }
  }
  return Array.from(ids);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; partnerOrganizationId: string }> }
) {
  try {
    const resolvedParams = await params;
    const tenantAccess = await requireTenantAccess(request, resolvedParams.tenant);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }

    if (tenantAccess.organization.organizationType === "partner") {
      return NextResponse.json(
        { error: "Partner regulatory documents are managed from the brand workspace." },
        { status: 403 }
      );
    }

    const searchParams = new URL(request.url).searchParams;
    const outputProfileId = searchParams.get("outputProfileId") ?? searchParams.get("contractId");
    if (!outputProfileId) {
      return NextResponse.json({ error: "outputProfileId is required." }, { status: 400 });
    }

    const productIds = parseProductIds(searchParams);
    if (productIds.length === 0) {
      return NextResponse.json({ error: "At least one productId is required." }, { status: 400 });
    }

    const data = await getPartnerRegulatoryPackage({
      supabase: getSupabaseServer(),
      organizationId: tenantAccess.organization.id,
      partnerOrganizationId: resolvedParams.partnerOrganizationId,
      outputProfileId,
      productIds,
      scope: {
        marketId: searchParams.get("marketId") ?? null,
      },
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Failed to load partner regulatory package:", error);
    return NextResponse.json({ error: "Failed to load partner regulatory package." }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; partnerOrganizationId: string }> }
) {
  try {
    const resolvedParams = await params;
    const tenantAccess = await requireTenantAccess(request, resolvedParams.tenant);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }

    if (tenantAccess.organization.organizationType === "partner") {
      return NextResponse.json(
        { error: "Partner regulatory documents are managed from the brand workspace." },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
    const documentType = typeof body.documentType === "string" ? body.documentType.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";

    if (!assetId || !documentType || !title) {
      return NextResponse.json(
        { error: "assetId, documentType, and title are required." },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabaseServer()
      .from("partner_documents")
      .insert({
        organization_id: tenantAccess.organization.id,
        partner_organization_id: resolvedParams.partnerOrganizationId,
        asset_id: assetId,
        document_type: documentType,
        title,
        description: typeof body.description === "string" ? body.description.trim() : null,
        classification:
          typeof body.classification === "string" ? body.classification : "partner_restricted",
        approval_status:
          typeof body.approvalStatus === "string" ? body.approvalStatus : "pending",
        status: typeof body.status === "string" ? body.status : "active",
        asset_version_id: typeof body.assetVersionId === "string" ? body.assetVersionId : null,
        valid_from: typeof body.validFrom === "string" ? body.validFrom : null,
        valid_to: typeof body.validTo === "string" ? body.validTo : null,
        expires_at: typeof body.expiresAt === "string" ? body.expiresAt : null,
        metadata: typeof body.metadata === "object" && body.metadata ? body.metadata : {},
        created_by: tenantAccess.userId ?? null,
      } as never)
      .select("*")
      .single();

    if (error || !data) {
      console.error("Failed to create partner document:", error);
      return NextResponse.json({ error: "Failed to create partner document." }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Failed to create partner document:", error);
    return NextResponse.json({ error: "Failed to create partner document." }, { status: 500 });
  }
}
