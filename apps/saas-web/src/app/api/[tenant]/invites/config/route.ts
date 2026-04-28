import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@stack-app/auth";
import { DatabaseQueries } from "@stack-app/database";

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

type SavedScopeOption = {
  id: string;
  name: string;
  module_key: ShareSetModule;
  scope_kind: "product_scope" | "brand_library_scope";
};

type OutputProfileOption = {
  id: string;
  name: string;
  code: string;
  profile_type: string;
  is_primary: boolean;
};

function isPortalLaunchProfile(profile: {
  profile_type?: string | null;
  code?: string | null;
  name?: string | null;
}): boolean {
  const profileType = String(profile.profile_type || "").trim().toLowerCase();
  const code = String(profile.code || "").trim().toLowerCase();
  const name = String(profile.name || "").trim().toLowerCase();
  if (profileType !== "portal") return false;
  if (!code && !name) return true;
  return (
    code === "portal" ||
    code === "portal-catalog" ||
    code === "generic_portal" ||
    name === "portal" ||
    name === "portal catalog" ||
    name === "partner portal"
  );
}

function isLegacyGlobalScope(row: {
  name?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : null;
  if (metadata?.global === true || metadata?.system_managed === true) {
    return true;
  }
  const normalizedName = String(row.name || "").trim().toLowerCase();
  return normalizedName === "global products" || normalizedName === "global assets";
}

type PermissionBundleRow = Omit<PermissionBundle, "rules">;
type PermissionBundleRuleRow = PermissionBundle["rules"][number];

function parseInvitationType(value: string | null): InvitationType | null {
  if (!value) return "team_member";
  if (value === "team_member" || value === "partner") return value;
  return null;
}

function toSubjectType(invitationType: InvitationType): SubjectType {
  return invitationType === "partner" ? "partner" : "team_member";
}

function isMissingShareSetFoundationError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
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
  const bundleQuery = supabaseServer
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

  const bundleRows = (bundles || []) as PermissionBundleRow[];
  const bundleIds = bundleRows.map((bundle) => bundle.id);
  if (bundleIds.length === 0) {
    return bundleRows.map((bundle) => ({ ...bundle, rules: [] }));
  }

  const { data: rules, error: rulesError } = await (supabaseServer)
    .from("permission_bundle_rules")
    .select("id, permission_bundle_id, module_key, level, scope_defaults")
    .in("permission_bundle_id", bundleIds)
    .order("module_key", { ascending: true });

  if (rulesError) {
    if (isMissingTableError(rulesError)) {
      return bundleRows.map((bundle) => ({ ...bundle, rules: [] }));
    }
    throw rulesError;
  }

  const rulesByBundleId = new Map<string, PermissionBundleRuleRow[]>();
  for (const rule of (rules || []) as PermissionBundleRuleRow[]) {
    const list = rulesByBundleId.get(rule.permission_bundle_id) || [];
    list.push(rule);
    rulesByBundleId.set(rule.permission_bundle_id, list);
  }

  return bundleRows.map((bundle) => ({
    ...bundle,
    rules: rulesByBundleId.get(bundle.id) || [],
  }));
}

async function queryMarkets(organizationId: string): Promise<ShareContainer[]> {
  const { data, error } = await (supabaseServer)
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

async function querySavedScopes(organizationId: string): Promise<SavedScopeOption[]> {
  const result = await (supabaseServer)
    .from("share_sets")
    .select("id,name,module_key,metadata")
    .eq("organization_id", organizationId)
    .in("module_key", ["assets", "products"])
    .order("name", { ascending: true })
    .limit(200);

  if (!result.error) {
    return ((
      result.data || []
    ) as Array<{ id: string; name: string; module_key: string; metadata?: Record<string, unknown> | null }>)
      .filter((row) => !isLegacyGlobalScope(row))
      .filter((row) => row.module_key === "assets" || row.module_key === "products")
      .map((row) => ({
        id: row.id,
        name: row.name,
        module_key: row.module_key as ShareSetModule,
        scope_kind:
          row.module_key === "assets" ? "brand_library_scope" : "product_scope",
      }));
  }

  if (!isMissingShareSetFoundationError(result.error)) {
    throw result.error;
  }

  const legacyResult = await (supabaseServer)
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

  return ((legacyResult.data || []) as Array<{ id: string; name: string }>).map((row) => ({
    id: row.id,
    name: row.name,
    module_key: "assets",
    scope_kind: "brand_library_scope",
  }));
}

async function queryOutputProfiles(organizationId: string): Promise<OutputProfileOption[]> {
  const { data, error } = await supabaseServer
    .from("output_channel_profiles")
    .select("id,name,code,profile_type,is_primary")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }

  const profiles = ((data || []) as OutputProfileOption[]).filter(isPortalLaunchProfile);
  const selectedProfile = profiles[0] ?? null;
  if (!selectedProfile) return [];

  return [
    {
      ...selectedProfile,
      name: "Portal",
      code: "portal",
    },
  ];
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
    const [permissionBundles, markets, savedScopes, outputProfiles] = await Promise.all([
      queryPermissionBundles(organization.id, subjectType),
      queryMarkets(organization.id),
      invitationType === "partner" ? querySavedScopes(organization.id) : Promise.resolve([]),
      invitationType === "partner" ? queryOutputProfiles(organization.id) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        organization_type:
          organization.organizationType === "partner" || organization.type === "partner"
            ? "partner"
            : "brand",
        permission_bundles: permissionBundles,
        markets,
        share_sets: savedScopes,
        saved_scopes: savedScopes,
        output_profiles: outputProfiles,
      },
    });
  } catch (error) {
    console.error("Error in invites config GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

