import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";

import { supabaseServer } from "@/lib/supabase";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { canSendInvite } from "@/lib/security-permissions";
import { isMissingColumnError, isMissingTableError } from "../../sharing/_shared";

type InvitationType = "team_member" | "partner";
type SubjectType = "team_member" | "partner";
type ShareSetModule = "assets" | "products";

type PermissionBundle = {
  id: string;
  name: string;
  description: string | null;
  subject_type: SubjectType;
  is_default: boolean;
  rules: Array<{
    id: string;
    permission_bundle_id: string;
    module_key: "products" | "assets" | "share_links";
    level: "none" | "view" | "edit" | "admin";
    scope_defaults: Record<string, unknown>;
  }>;
};

type ShareContainer = {
  id: string;
  name: string;
  code?: string | null;
};

type ShareSetOption = {
  id: string;
  name: string;
  module_key: ShareSetModule;
};

function parseInvitationType(value: string | null): InvitationType | null {
  if (!value) return "team_member";
  if (value === "team_member" || value === "partner") return value;
  return null;
}

function toSubjectType(invitationType: InvitationType): SubjectType {
  return invitationType === "partner" ? "partner" : "team_member";
}

function isMissingShareSetFoundationError(error: any): boolean {
  if (!error) return false;
  if (isMissingTableError(error)) return true;
  if (error?.code === "PGRST205") return true;
  const message = String(error?.message || "").toLowerCase();
  return message.includes("share_sets") || message.includes("share_set_items");
}

async function queryPermissionBundles(
  organizationId: string,
  subjectType: SubjectType
): Promise<PermissionBundle[]> {
  let bundleQuery = (supabaseServer as any)
    .from("permission_bundles")
    .select("id, name, description, subject_type, is_default")
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true })
    .eq("subject_type", subjectType);

  const { data: bundles, error: bundlesError } = await bundleQuery;
  if (bundlesError) {
    if (isMissingTableError(bundlesError)) {
      return [];
    }
    throw bundlesError;
  }

  const bundleIds = (bundles || []).map((bundle: any) => bundle.id);
  if (bundleIds.length === 0) {
    return (bundles || []).map((bundle: any) => ({ ...bundle, rules: [] }));
  }

  const { data: rules, error: rulesError } = await (supabaseServer as any)
    .from("permission_bundle_rules")
    .select("id, permission_bundle_id, module_key, level, scope_defaults")
    .in("permission_bundle_id", bundleIds)
    .order("module_key", { ascending: true });

  if (rulesError) {
    if (isMissingTableError(rulesError)) {
      return (bundles || []).map((bundle: any) => ({ ...bundle, rules: [] }));
    }
    throw rulesError;
  }

  const rulesByBundleId = new Map<string, any[]>();
  for (const rule of rules || []) {
    const list = rulesByBundleId.get(rule.permission_bundle_id) || [];
    list.push(rule);
    rulesByBundleId.set(rule.permission_bundle_id, list);
  }

  return (bundles || []).map((bundle: any) => ({
    ...bundle,
    rules: rulesByBundleId.get(bundle.id) || [],
  }));
}

async function queryMarkets(organizationId: string): Promise<ShareContainer[]> {
  const { data, error } = await (supabaseServer as any)
    .from("markets")
    .select("id,name,code,is_active")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }

  return data || [];
}

async function queryShareSets(organizationId: string): Promise<ShareSetOption[]> {
  const result = await (supabaseServer as any)
    .from("share_sets")
    .select("id,name,module_key")
    .eq("organization_id", organizationId)
    .in("module_key", ["assets", "products"])
    .order("name", { ascending: true })
    .limit(200);

  if (!result.error) {
    return ((result.data || []) as Array<any>)
      .filter((row) => row.module_key === "assets" || row.module_key === "products")
      .map((row) => ({
        id: row.id,
        name: row.name,
        module_key: row.module_key as ShareSetModule,
      }));
  }

  if (!isMissingShareSetFoundationError(result.error)) {
    throw result.error;
  }

  const legacyResult = await (supabaseServer as any)
    .from("dam_collections")
    .select("id,name")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .limit(200);

  if (legacyResult.error) {
    if (isMissingColumnError(legacyResult.error)) {
      return [];
    }
    if (isMissingTableError(legacyResult.error)) {
      return [];
    }
    throw legacyResult.error;
  }

  return ((legacyResult.data || []) as Array<any>).map((row) => ({
    id: row.id,
    name: row.name,
    module_key: "assets",
  }));
}

// GET /api/[tenant]/invites/config
// Consolidated invite wizard config endpoint to avoid multiple auth-gated API roundtrips.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);

    const tenantAccess = await requireTenantAccess(request, resolvedParams.tenant);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }

    const { organization, userId } = tenantAccess;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowed = await canSendInvite({
      authService,
      userId,
      organizationId: organization.id,
    });

    if (!allowed) {
      return NextResponse.json(
        { error: "Access denied. You must be an admin or owner to invite users." },
        { status: 403 }
      );
    }

    const invitationType = parseInvitationType(
      request.nextUrl.searchParams.get("invitation_type")
    );
    if (!invitationType) {
      return NextResponse.json(
        { error: "invitation_type must be team_member or partner" },
        { status: 400 }
      );
    }

    const subjectType = toSubjectType(invitationType);
    const [permissionBundles, markets, shareSets] = await Promise.all([
      queryPermissionBundles(organization.id, subjectType),
      queryMarkets(organization.id),
      invitationType === "partner" ? queryShareSets(organization.id) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        permission_bundles: permissionBundles,
        markets,
        share_sets: shareSets,
      },
    });
  } catch (error) {
    console.error("Error in invites config GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
