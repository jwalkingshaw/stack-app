import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";

import { supabaseServer } from "@/lib/supabase";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { canManageContainerSharing } from "@/lib/security-permissions";

type PartnerRelationshipSummary = {
  id: string;
  partner_organization_id: string;
  status: string;
  access_level: "view" | "edit";
  created_at: string | null;
  updated_at: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function isMissingColumnError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703";
}

function isMissingFoundationError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error?.code === "42P01" || error?.code === "PGRST205") return true;
  const message = String(error?.message || "").toLowerCase();
  return message.includes("share_sets") || message.includes("partner_share_set_grants");
}

function normalizeOrganizationType(
  organization:
    | { organizationType?: unknown; type?: unknown; organization_type?: unknown }
    | null
    | undefined
): "brand" | "partner" {
  const raw =
    organization?.organizationType ??
    organization?.type ??
    organization?.organization_type ??
    "brand";
  return String(raw).toLowerCase() === "partner" ? "partner" : "brand";
}

function normalizeRelationshipAccessLevel(row: Record<string, unknown>): "view" | "edit" {
  const direct = typeof row?.access_level === "string" ? row.access_level.toLowerCase() : "";
  if (direct === "edit" || direct === "view") {
    return direct;
  }

  const permissions = isRecord(row?.permissions) ? row.permissions : null;
  if (permissions) {
    const fromPermissions =
      typeof permissions.access_level === "string"
        ? permissions.access_level.toLowerCase()
        : "";
    if (fromPermissions === "edit" || fromPermissions === "view") {
      return fromPermissions;
    }
    if (permissions.edit === true || permissions.can_edit === true || permissions.write === true) {
      return "edit";
    }
  }

  return "view";
}

async function loadPartnerRelationship(params: {
  organizationId: string;
  partnerOrganizationId: string;
}): Promise<PartnerRelationshipSummary | null> {
  const { organizationId, partnerOrganizationId } = params;

  const attempts: Array<{
    select: string;
    brandColumn: string;
    partnerColumn: string;
  }> = [
    {
      select: "id,partner_organization_id,status,access_level,created_at,status_updated_at,settings",
      brandColumn: "brand_organization_id",
      partnerColumn: "partner_organization_id",
    },
  ];

  for (const attempt of attempts) {
    const result = await (supabaseServer)
      .from("brand_partner_relationships")
      .select(attempt.select)
      .eq(attempt.brandColumn, organizationId)
      .eq(attempt.partnerColumn, partnerOrganizationId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!result.error) {
      const rawRow = Array.isArray(result.data) ? result.data[0] : null;
      if (!isRecord(rawRow)) continue;
      const row = rawRow;
      const partnerOrganizationIdRaw = row[attempt.partnerColumn];
      if (typeof partnerOrganizationIdRaw !== "string" || partnerOrganizationIdRaw.length === 0) {
        continue;
      }

      return {
        id: String(row.id),
        partner_organization_id: partnerOrganizationIdRaw,
        status: String(row.status || "active"),
        access_level: normalizeRelationshipAccessLevel(row),
        created_at: typeof row.created_at === "string" ? row.created_at : null,
        updated_at:
          (typeof row.status_updated_at === "string" ? row.status_updated_at : null) ||
          (typeof row.created_at === "string" ? row.created_at : null),
      };
    }

    if (!isMissingColumnError(result.error)) {
      console.error("Failed to load partner relationship:", result.error);
      return null;
    }
  }

  return null;
}

function parseAction(raw: unknown): "suspend" | "restore" | "revoke" | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value === "suspend" || value === "restore" || value === "revoke") {
    return value;
  }
  return null;
}

function parseAccessLevel(raw: unknown): "view" | "edit" | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value === "view" || value === "edit") {
    return value;
  }
  return null;
}

async function updateRelationshipById(params: {
  relationshipId: string;
  action: "suspend" | "restore" | "revoke" | null;
  accessLevel: "view" | "edit" | null;
}): Promise<boolean> {
  const { relationshipId, action, accessLevel } = params;
  const now = new Date().toISOString();

  const statusByAction: Record<"suspend" | "restore" | "revoke", string> = {
    suspend: "suspended",
    restore: "active",
    revoke: "revoked",
  };

  const v2Payload: Record<string, unknown> = { status_updated_at: now };
  if (accessLevel) v2Payload.access_level = accessLevel;
  if (action) v2Payload.status = statusByAction[action];

  const v2 = await (supabaseServer)
    .from("brand_partner_relationships")
    .update(v2Payload)
    .eq("id", relationshipId)
    .select("id")
    .limit(1);

  if (v2.error) {
    console.error("Failed to update partner relationship:", v2.error);
    return false;
  }

  return Array.isArray(v2.data) && v2.data.length > 0;
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

    const { organization, userId } = tenantAccess;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationType = normalizeOrganizationType(organization);
    if (organizationType !== "brand") {
      return NextResponse.json(
        { error: "Partner relationships are managed in brand workspaces only." },
        { status: 403 }
      );
    }

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);
    const canManage = await canManageContainerSharing({
      authService,
      userId,
      organizationId: organization.id,
    });

    const relationship = await loadPartnerRelationship({
      organizationId: organization.id,
      partnerOrganizationId: resolvedParams.partnerOrganizationId,
    });

    if (!relationship) {
      return NextResponse.json({ error: "Partner relationship not found" }, { status: 404 });
    }

    const { data: partnerOrganization } = await (supabaseServer)
      .from("organizations")
      .select("id,name,slug,organization_type,partner_category")
      .eq("id", resolvedParams.partnerOrganizationId)
      .maybeSingle();

    let grants: Array<Record<string, unknown>> = [];
    let availableSets: Array<Record<string, unknown>> = [];
    let shareSetsEnabled = true;

    const grantsResult = await (supabaseServer)
      .from("partner_share_set_grants")
      .select(
        "id,share_set_id,access_level,status,created_at,updated_at,share_sets(id,name,module_key)"
      )
      .eq("organization_id", organization.id)
      .eq("partner_organization_id", resolvedParams.partnerOrganizationId)
      .eq("status", "active")
      .order("updated_at", { ascending: false });

    if (grantsResult.error) {
      if (isMissingFoundationError(grantsResult.error)) {
        shareSetsEnabled = false;
      } else {
        return NextResponse.json({ error: "Failed to load partner set grants" }, { status: 500 });
      }
    } else {
      grants = ((grantsResult.data || []) as Array<{
        id: string;
        share_set_id: string;
        access_level: string;
        status: string;
        created_at: string;
        updated_at: string;
        share_sets:
          | { id: string; name: string; module_key: string }
          | Array<{ id: string; name: string; module_key: string }>
          | null;
      }>).map((row) => ({
        id: row.id,
        share_set_id: row.share_set_id,
        access_level: row.access_level,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        share_set: Array.isArray(row.share_sets) ? row.share_sets[0] || null : row.share_sets || null,
      }));
    }

    if (shareSetsEnabled) {
      const shareSetsResult = await (supabaseServer)
        .from("share_sets")
        .select("id,name,module_key")
        .eq("organization_id", organization.id)
        .order("module_key", { ascending: true })
        .order("name", { ascending: true });

      if (shareSetsResult.error) {
        if (isMissingFoundationError(shareSetsResult.error)) {
          shareSetsEnabled = false;
        } else {
          return NextResponse.json({ error: "Failed to load available sets" }, { status: 500 });
        }
      } else {
        availableSets = shareSetsResult.data || [];
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        can_manage: canManage,
        organization: {
          id: organization.id,
          slug: organization.slug,
          name: organization.name,
        },
        partner_organization: partnerOrganization || {
          id: resolvedParams.partnerOrganizationId,
          name: resolvedParams.partnerOrganizationId,
          slug: null,
          organization_type: "partner",
          partner_category: null,
        },
        relationship,
        share_sets_enabled: shareSetsEnabled,
        grants,
        available_sets: availableSets,
      },
    });
  } catch (error) {
    console.error("Error in partner relationship GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; partnerOrganizationId: string }> }
) {
  try {
    const resolvedParams = await params;
    const tenantAccess = await requireTenantAccess(request, resolvedParams.tenant);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }

    const { organization, userId } = tenantAccess;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationType = normalizeOrganizationType(organization);
    if (organizationType !== "brand") {
      return NextResponse.json(
        { error: "Partner relationships are managed in brand workspaces only." },
        { status: 403 }
      );
    }

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);
    const canManage = await canManageContainerSharing({
      authService,
      userId,
      organizationId: organization.id,
    });

    if (!canManage) {
      return NextResponse.json(
        { error: "Access denied. You must be an admin or owner to manage partners." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = parseAction(body.action);
    const accessLevel = parseAccessLevel(body.accessLevel);
    if (!action && !accessLevel) {
      return NextResponse.json(
        { error: "Provide action (suspend|restore|revoke) or accessLevel (view|edit)." },
        { status: 400 }
      );
    }

    const relationship = await loadPartnerRelationship({
      organizationId: organization.id,
      partnerOrganizationId: resolvedParams.partnerOrganizationId,
    });
    if (!relationship) {
      return NextResponse.json({ error: "Partner relationship not found" }, { status: 404 });
    }

    const updated = await updateRelationshipById({
      relationshipId: relationship.id,
      action,
      accessLevel,
    });
    if (!updated) {
      return NextResponse.json({ error: "Failed to update partner relationship" }, { status: 500 });
    }

    const refreshed = await loadPartnerRelationship({
      organizationId: organization.id,
      partnerOrganizationId: resolvedParams.partnerOrganizationId,
    });

    return NextResponse.json({
      success: true,
      data: {
        relationship: refreshed,
      },
    });
  } catch (error) {
    console.error("Error in partner relationship PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


