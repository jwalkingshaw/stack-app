import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { isMissingColumnError, requireSharingManagerContext } from "../../../_shared";

type ShareSetModule = "assets" | "products";

type ShareSetRecord = {
  id: string;
  module_key: ShareSetModule;
  name: string;
};

type PartnerGrantRow = {
  id: string;
  partner_organization_id: string;
  access_level: "view" | "edit";
  status: "active" | "revoked";
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PartnerOrganizationRow = {
  id: string;
  name: string;
  slug: string;
  partner_category: string | null;
  organization_type?: string | null;
};

function isMissingShareSetFoundationError(error: any): boolean {
  if (!error) return false;
  if (error?.code === "42P01" || error?.code === "PGRST205") return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("share_sets") ||
    message.includes("partner_share_set_grants")
  );
}

function normalizeAccessLevel(value: unknown): "view" | "edit" {
  if (typeof value !== "string") return "view";
  return value.trim().toLowerCase() === "edit" ? "edit" : "view";
}

async function getShareSet(params: {
  organizationId: string;
  setId: string;
}): Promise<
  | { ok: true; data: ShareSetRecord }
  | { ok: false; status: number; error: string }
> {
  const { organizationId, setId } = params;

  const { data, error } = await (supabaseServer as any)
    .from("share_sets")
    .select("id,module_key,name")
    .eq("id", setId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    if (isMissingShareSetFoundationError(error)) {
      return {
        ok: false,
        status: 503,
        error: "Share set foundation tables are unavailable. Apply database migrations first.",
      };
    }
    return { ok: false, status: 500, error: "Failed to resolve share set" };
  }

  if (!data) {
    return { ok: false, status: 404, error: "Share set not found" };
  }

  return { ok: true, data: data as ShareSetRecord };
}

async function listActivePartnerOrganizationIds(params: {
  brandOrganizationId: string;
}): Promise<
  | { ok: true; ids: string[] }
  | { ok: false; status: number; error: string }
> {
  const { brandOrganizationId } = params;

  const v2 = await (supabaseServer as any)
    .from("brand_partner_relationships")
    .select("partner_organization_id")
    .eq("brand_organization_id", brandOrganizationId)
    .eq("status", "active");

  if (!v2.error) {
    const ids = Array.from(
      new Set(
        ((v2.data || []) as Array<{ partner_organization_id: string | null }>)
          .map((row) => row.partner_organization_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    return { ok: true, ids };
  }

  if (!isMissingColumnError(v2.error)) {
    return { ok: false, status: 500, error: "Failed to load partner relationships" };
  }

  const v1 = await (supabaseServer as any)
    .from("brand_partner_relationships")
    .select("partner_id")
    .eq("brand_id", brandOrganizationId)
    .eq("status", "active");

  if (v1.error) {
    return { ok: false, status: 500, error: "Failed to load partner relationships" };
  }

  const ids = Array.from(
    new Set(
      ((v1.data || []) as Array<{ partner_id: string | null }>)
        .map((row) => row.partner_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  return { ok: true, ids };
}

async function getOrganizationsByIds(ids: string[]) {
  if (ids.length === 0) {
    return { data: [] as PartnerOrganizationRow[], error: null };
  }

  const { data, error } = await (supabaseServer as any)
    .from("organizations")
    .select("id,name,slug,partner_category,organization_type")
    .in("id", ids);

  if (error) {
    return { data: [] as PartnerOrganizationRow[], error };
  }

  return {
    data: (data || []) as PartnerOrganizationRow[],
    error: null,
  };
}

// GET /api/[tenant]/sharing/sets/[setId]/grants
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const shareSet = await getShareSet({
      organizationId: organization.id,
      setId: resolvedParams.setId,
    });
    if (!shareSet.ok) {
      return NextResponse.json({ error: shareSet.error }, { status: shareSet.status });
    }

    const partnerIdsResult = await listActivePartnerOrganizationIds({
      brandOrganizationId: organization.id,
    });
    if (!partnerIdsResult.ok) {
      return NextResponse.json(
        { error: partnerIdsResult.error },
        { status: partnerIdsResult.status }
      );
    }

    const grantsResult = await (supabaseServer as any)
      .from("partner_share_set_grants")
      .select(
        "id,partner_organization_id,access_level,status,expires_at,created_at,updated_at"
      )
      .eq("organization_id", organization.id)
      .eq("share_set_id", shareSet.data.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false });

    if (grantsResult.error) {
      if (isMissingShareSetFoundationError(grantsResult.error)) {
        return NextResponse.json(
          {
            error:
              "Share set foundation tables are unavailable. Apply database migrations first.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Failed to load set partner grants" },
        { status: 500 }
      );
    }

    const grants = (grantsResult.data || []) as PartnerGrantRow[];
    const organizationIds = Array.from(
      new Set([
        ...partnerIdsResult.ids,
        ...grants.map((grant) => grant.partner_organization_id),
      ])
    );

    const organizationsResult = await getOrganizationsByIds(organizationIds);
    if (organizationsResult.error) {
      return NextResponse.json(
        { error: "Failed to load partner organizations" },
        { status: 500 }
      );
    }

    const partnerById = new Map(
      organizationsResult.data
        .filter((row) => row.organization_type === "partner" || !row.organization_type)
        .map((row) => [
          row.id,
          {
            id: row.id,
            name: row.name,
            slug: row.slug,
            partner_category: row.partner_category || null,
          },
        ])
    );

    const mappedGrants = grants.map((grant) => ({
      ...grant,
      partner: partnerById.get(grant.partner_organization_id) || null,
    }));

    const availablePartners = partnerIdsResult.ids
      .map((id) => partnerById.get(id) || null)
      .filter((partner): partner is NonNullable<typeof partner> => Boolean(partner));

    return NextResponse.json({
      success: true,
      data: {
        share_set: shareSet.data,
        grants: mappedGrants,
        available_partners: availablePartners,
      },
    });
  } catch (error) {
    console.error("Error in share set grants GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/sharing/sets/[setId]/grants
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization, userId } = access.context;
    const shareSet = await getShareSet({
      organizationId: organization.id,
      setId: resolvedParams.setId,
    });
    if (!shareSet.ok) {
      return NextResponse.json({ error: shareSet.error }, { status: shareSet.status });
    }

    const body = await request.json().catch(() => ({}));
    const partnerOrganizationId =
      typeof body.partnerOrganizationId === "string"
        ? body.partnerOrganizationId.trim()
        : "";
    const accessLevel = normalizeAccessLevel(body.accessLevel);
    const expiresAtRaw = typeof body.expiresAt === "string" ? body.expiresAt.trim() : "";
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

    if (!partnerOrganizationId) {
      return NextResponse.json(
        { error: "partnerOrganizationId is required" },
        { status: 400 }
      );
    }
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ error: "expiresAt must be a valid date" }, { status: 400 });
    }

    const partnerIdsResult = await listActivePartnerOrganizationIds({
      brandOrganizationId: organization.id,
    });
    if (!partnerIdsResult.ok) {
      return NextResponse.json(
        { error: partnerIdsResult.error },
        { status: partnerIdsResult.status }
      );
    }

    if (!partnerIdsResult.ids.includes(partnerOrganizationId)) {
      return NextResponse.json(
        { error: "Partner organization is not actively related to this brand" },
        { status: 403 }
      );
    }

    const existing = await (supabaseServer as any)
      .from("partner_share_set_grants")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("share_set_id", shareSet.data.id)
      .eq("partner_organization_id", partnerOrganizationId)
      .eq("status", "active")
      .maybeSingle();

    if (existing.error && !isMissingShareSetFoundationError(existing.error)) {
      return NextResponse.json(
        { error: "Failed to resolve existing partner grant" },
        { status: 500 }
      );
    }
    if (existing.error && isMissingShareSetFoundationError(existing.error)) {
      return NextResponse.json(
        {
          error:
            "Share set foundation tables are unavailable. Apply database migrations first.",
        },
        { status: 503 }
      );
    }

    let writeResult;
    if (existing.data?.id) {
      writeResult = await (supabaseServer as any)
        .from("partner_share_set_grants")
        .update({
          access_level: accessLevel,
          granted_by: userId,
          expires_at: expiresAt ? expiresAt.toISOString() : null,
        })
        .eq("id", existing.data.id)
        .eq("organization_id", organization.id)
        .select(
          "id,partner_organization_id,access_level,status,expires_at,created_at,updated_at"
        )
        .single();
    } else {
      writeResult = await (supabaseServer as any)
        .from("partner_share_set_grants")
        .insert({
          organization_id: organization.id,
          partner_organization_id: partnerOrganizationId,
          share_set_id: shareSet.data.id,
          access_level: accessLevel,
          status: "active",
          granted_by: userId,
          expires_at: expiresAt ? expiresAt.toISOString() : null,
          metadata: {},
        })
        .select(
          "id,partner_organization_id,access_level,status,expires_at,created_at,updated_at"
        )
        .single();
    }

    if (writeResult.error || !writeResult.data) {
      return NextResponse.json(
        { error: "Failed to apply partner share grant" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: writeResult.data,
      },
      { status: existing.data?.id ? 200 : 201 }
    );
  } catch (error) {
    console.error("Error in share set grants POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/sharing/sets/[setId]/grants?grantId=...
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const shareSet = await getShareSet({
      organizationId: organization.id,
      setId: resolvedParams.setId,
    });
    if (!shareSet.ok) {
      return NextResponse.json({ error: shareSet.error }, { status: shareSet.status });
    }

    const grantId = new URL(request.url).searchParams.get("grantId")?.trim();
    if (!grantId) {
      return NextResponse.json({ error: "grantId is required" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await (supabaseServer as any)
      .from("partner_share_set_grants")
      .select("id,status")
      .eq("id", grantId)
      .eq("organization_id", organization.id)
      .eq("share_set_id", shareSet.data.id)
      .eq("status", "active")
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: "Failed to resolve grant" }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    const { error: revokeError } = await (supabaseServer as any)
      .from("partner_share_set_grants")
      .update({ status: "revoked" })
      .eq("id", grantId)
      .eq("organization_id", organization.id)
      .eq("share_set_id", shareSet.data.id);

    if (revokeError) {
      return NextResponse.json(
        { error: "Failed to revoke partner grant" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in share set grants DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
