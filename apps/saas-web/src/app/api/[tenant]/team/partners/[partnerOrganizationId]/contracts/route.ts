import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireTenantAccess } from "@/lib/tenant-auth";

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
        { error: "Partner contract grants are managed from the brand workspace." },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseServer
      .from("partner_contract_grants" as never)
      .select(
        "id,partner_organization_id,output_profile_id,access_level,status,metadata,created_at,updated_at,output_channel_profiles!inner(id,name,code,profile_type)"
      )
      .eq("organization_id", tenantAccess.organization.id)
      .eq("partner_organization_id", resolvedParams.partnerOrganizationId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed to load partner contract grants:", error);
      return NextResponse.json({ error: "Failed to load partner contract grants." }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("Failed to load partner contract grants:", error);
    return NextResponse.json({ error: "Failed to load partner contract grants." }, { status: 500 });
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
        { error: "Partner contract grants are managed from the brand workspace." },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const outputProfileId =
      typeof body.outputProfileId === "string" ? body.outputProfileId.trim() : "";
    if (!outputProfileId) {
      return NextResponse.json({ error: "outputProfileId is required." }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("partner_contract_grants" as never)
      .upsert(
        ({
          organization_id: tenantAccess.organization.id,
          partner_organization_id: resolvedParams.partnerOrganizationId,
          output_profile_id: outputProfileId,
          access_level: typeof body.accessLevel === "string" ? body.accessLevel : "view",
          status: typeof body.status === "string" ? body.status : "active",
          metadata: typeof body.metadata === "object" && body.metadata ? body.metadata : {},
          created_by: tenantAccess.userId ?? null,
        }) as never,
        {
          onConflict: "organization_id,partner_organization_id,output_profile_id",
          ignoreDuplicates: false,
        }
      )
      .select("*")
      .single();

    if (error || !data) {
      console.error("Failed to upsert partner contract grant:", error);
      return NextResponse.json({ error: "Failed to save partner contract grant." }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Failed to save partner contract grant:", error);
    return NextResponse.json({ error: "Failed to save partner contract grant." }, { status: 500 });
  }
}
