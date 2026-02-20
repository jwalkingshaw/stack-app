import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import type { Organization } from "@tradetool/types";
import { verifyTenantAccess } from "@/lib/tenant-auth";
import { supabaseServer } from "@/lib/supabase";

type ScopeType = "organization" | "market" | "channel" | "collection";
type ShareSetModuleKey = "assets" | "products";

type OrganizationSummary = {
  id: string;
  slug: string;
  name: string;
  organizationType: "brand" | "partner";
};

export const ASSET_VIEW_PERMISSION_KEYS = [
  "asset.download.derivative",
  "asset.download.original",
  "asset.metadata.edit",
  "asset.upload",
  "asset.version.manage",
];

export const PRODUCT_VIEW_PERMISSION_KEYS = [
  "product.market.scope.read",
  "product.market.scope.edit",
  "product.attribute.edit",
  "product.publish.state",
];

export type ScopedPermissionSummary = {
  hasOrganizationScope: boolean;
  marketIds: string[];
  channelIds: string[];
  collectionIds: string[];
};

export type TenantBrandViewContext = {
  userId: string;
  userEmail: string | null;
  tenantOrganization: OrganizationSummary;
  targetOrganization: OrganizationSummary;
  selectedBrandSlug: string | null;
  mode: "tenant" | "partner_brand";
  brandMemberId: string | null;
};

function normalizeOrganizationType(raw: unknown): "brand" | "partner" {
  return raw === "partner" ? "partner" : "brand";
}

function toOrganizationSummary(raw: Organization): OrganizationSummary {
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    organizationType: normalizeOrganizationType(
      (raw as any).organizationType ?? (raw as any).type
    ),
  };
}

function isMissingColumnError(error: any): boolean {
  return error?.code === "42703";
}

function isMissingShareSetFoundationError(error: any): boolean {
  if (!error) return false;
  if (error?.code === "42P01" || error?.code === "PGRST205") return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("share_sets") ||
    message.includes("share_set_items") ||
    message.includes("partner_share_set_grants")
  );
}

async function resolveActivePartnerShareSetIds(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
  moduleKey: ShareSetModuleKey;
}): Promise<{ foundationAvailable: boolean; setIds: string[] }> {
  const { brandOrganizationId, partnerOrganizationId, moduleKey } = params;
  const now = Date.now();

  const { data: grants, error: grantsError } = await (supabaseServer as any)
    .from("partner_share_set_grants")
    .select("share_set_id,expires_at")
    .eq("organization_id", brandOrganizationId)
    .eq("partner_organization_id", partnerOrganizationId)
    .eq("status", "active");

  if (grantsError) {
    if (isMissingShareSetFoundationError(grantsError)) {
      return { foundationAvailable: false, setIds: [] };
    }
    console.error("Failed to resolve partner share set grants:", grantsError);
    return { foundationAvailable: true, setIds: [] };
  }

  const unexpiredSetIds = Array.from(
    new Set(
      ((grants || []) as Array<{ share_set_id: string | null; expires_at: string | null }>)
        .filter((grant) => {
          if (!grant.share_set_id) return false;
          if (!grant.expires_at) return true;
          const expiresAt = Date.parse(grant.expires_at);
          return Number.isFinite(expiresAt) && expiresAt > now;
        })
        .map((grant) => grant.share_set_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  if (unexpiredSetIds.length === 0) {
    return { foundationAvailable: true, setIds: [] };
  }

  const { data: sets, error: setsError } = await (supabaseServer as any)
    .from("share_sets")
    .select("id")
    .eq("organization_id", brandOrganizationId)
    .eq("module_key", moduleKey)
    .in("id", unexpiredSetIds);

  if (setsError) {
    if (isMissingShareSetFoundationError(setsError)) {
      return { foundationAvailable: false, setIds: [] };
    }
    console.error("Failed to resolve share set headers:", setsError);
    return { foundationAvailable: true, setIds: [] };
  }

  return {
    foundationAvailable: true,
    setIds: Array.from(
      new Set(
        ((sets || []) as Array<{ id: string | null }>)
          .map((row) => row.id)
          .filter((id): id is string => Boolean(id))
      )
    ),
  };
}

async function hasActiveBrandRelationship(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
}): Promise<boolean> {
  const { brandOrganizationId, partnerOrganizationId } = params;

  const v2 = await (supabaseServer as any)
    .from("brand_partner_relationships")
    .select("id")
    .eq("brand_organization_id", brandOrganizationId)
    .eq("partner_organization_id", partnerOrganizationId)
    .eq("status", "active")
    .maybeSingle();

  if (!v2.error) {
    return Boolean(v2.data?.id);
  }

  if (!isMissingColumnError(v2.error)) {
    return false;
  }

  const v1 = await (supabaseServer as any)
    .from("brand_partner_relationships")
    .select("id")
    .eq("brand_id", brandOrganizationId)
    .eq("partner_id", partnerOrganizationId)
    .eq("status", "active")
    .maybeSingle();

  if (v1.error) {
    return false;
  }

  return Boolean(v1.data?.id);
}

export async function resolvePartnerSharedBrandOrganizationIds(params: {
  partnerOrganizationId: string;
}): Promise<string[]> {
  const { partnerOrganizationId } = params;

  const v2 = await (supabaseServer as any)
    .from("brand_partner_relationships")
    .select("brand_organization_id")
    .eq("partner_organization_id", partnerOrganizationId)
    .eq("status", "active");

  if (!v2.error) {
    return Array.from(
      new Set(
        ((v2.data || []) as Array<{ brand_organization_id: string | null }>)
          .map((row) => row.brand_organization_id)
          .filter((id): id is string => Boolean(id))
      )
    );
  }

  if (!isMissingColumnError(v2.error)) {
    console.error("Failed to resolve partner shared brands:", v2.error);
    return [];
  }

  const v1 = await (supabaseServer as any)
    .from("brand_partner_relationships")
    .select("brand_id")
    .eq("partner_id", partnerOrganizationId)
    .eq("status", "active");

  if (v1.error) {
    console.error("Failed to resolve partner shared brands (legacy):", v1.error);
    return [];
  }

  return Array.from(
    new Set(
      ((v1.data || []) as Array<{ brand_id: string | null }>)
        .map((row) => row.brand_id)
        .filter((id): id is string => Boolean(id))
    )
  );
}

async function resolveBrandMemberId(params: {
  organizationId: string;
  userId: string;
  userEmail: string | null;
}): Promise<string | null> {
  const { organizationId, userId, userEmail } = params;

  const byUser = await (supabaseServer as any)
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("kinde_user_id", userId)
    .eq("status", "active")
    .limit(1);

  if (!byUser.error && Array.isArray(byUser.data) && byUser.data.length > 0) {
    return byUser.data[0].id as string;
  }

  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const byEmail = await (supabaseServer as any)
    .from("organization_members")
    .select("id,kinde_user_id")
    .eq("organization_id", organizationId)
    .ilike("email", normalizedEmail)
    .eq("status", "active")
    .limit(1);

  if (byEmail.error || !Array.isArray(byEmail.data) || byEmail.data.length === 0) {
    return null;
  }

  const row = byEmail.data[0] as { id: string; kinde_user_id: string | null };
  if (row.kinde_user_id !== userId) {
    await (supabaseServer as any)
      .from("organization_members")
      .update({
        kinde_user_id: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }

  return row.id;
}

export async function resolveTenantBrandViewContext(params: {
  request: NextRequest;
  tenantSlug: string;
  selectedBrandSlug?: string | null;
}): Promise<
  | { ok: true; context: TenantBrandViewContext }
  | { ok: false; response: NextResponse }
> {
  const { request, tenantSlug } = params;
  const selectedBrandSlug = (params.selectedBrandSlug || "").trim().toLowerCase();
  const tenantAccess = await verifyTenantAccess(request, tenantSlug);

  if (!tenantAccess.success || !tenantAccess.organization || !tenantAccess.userId) {
    return {
      ok: false,
      response: tenantAccess.error!,
    };
  }

  const { getUser } = getKindeServerSession();
  const user = await getUser();
  const userEmail = user?.email?.trim().toLowerCase() || null;

  const tenantOrganization = toOrganizationSummary(tenantAccess.organization);
  if (
    !selectedBrandSlug ||
    tenantOrganization.organizationType !== "partner" ||
    selectedBrandSlug === tenantOrganization.slug.toLowerCase()
  ) {
    return {
      ok: true,
      context: {
        userId: tenantAccess.userId,
        userEmail,
        tenantOrganization,
        targetOrganization: tenantOrganization,
        selectedBrandSlug: null,
        mode: "tenant",
        brandMemberId: null,
      },
    };
  }

  const { data: brandOrg, error: brandOrgError } = await (supabaseServer as any)
    .from("organizations")
    .select("id,name,slug,organization_type")
    .eq("slug", selectedBrandSlug)
    .eq("organization_type", "brand")
    .maybeSingle();

  if (brandOrgError || !brandOrg) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Selected brand view was not found." },
        { status: 404 }
      ),
    };
  }

  const relationshipActive = await hasActiveBrandRelationship({
    brandOrganizationId: brandOrg.id,
    partnerOrganizationId: tenantOrganization.id,
  });

  if (!relationshipActive) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Selected brand is not shared with this partner workspace." },
        { status: 403 }
      ),
    };
  }

  const brandMemberId = await resolveBrandMemberId({
    organizationId: brandOrg.id,
    userId: tenantAccess.userId,
    userEmail,
  });

  return {
    ok: true,
    context: {
      userId: tenantAccess.userId,
      userEmail,
      tenantOrganization,
      targetOrganization: {
        id: brandOrg.id,
        slug: brandOrg.slug,
        name: brandOrg.name,
        organizationType: "brand",
      },
      selectedBrandSlug: brandOrg.slug,
      mode: "partner_brand",
      brandMemberId,
    },
  };
}

export async function getScopedPermissionSummary(params: {
  organizationId: string;
  memberId: string;
  permissionKeys: string[];
}): Promise<ScopedPermissionSummary> {
  const { organizationId, memberId, permissionKeys } = params;
  if (permissionKeys.length === 0) {
    return {
      hasOrganizationScope: false,
      marketIds: [],
      channelIds: [],
      collectionIds: [],
    };
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await (supabaseServer as any)
    .from("member_scope_permissions")
    .select("scope_type,market_id,channel_id,collection_id,expires_at")
    .eq("organization_id", organizationId)
    .eq("member_id", memberId)
    .in("permission_key", permissionKeys)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

  if (error || !Array.isArray(data)) {
    return {
      hasOrganizationScope: false,
      marketIds: [],
      channelIds: [],
      collectionIds: [],
    };
  }

  let hasOrganizationScope = false;
  const marketIds = new Set<string>();
  const channelIds = new Set<string>();
  const collectionIds = new Set<string>();

  for (const row of data as Array<{
    scope_type: ScopeType;
    market_id: string | null;
    channel_id: string | null;
    collection_id: string | null;
  }>) {
    if (row.scope_type === "organization") {
      hasOrganizationScope = true;
    }
    if (row.market_id) marketIds.add(row.market_id);
    if (row.channel_id) channelIds.add(row.channel_id);
    if (row.collection_id) collectionIds.add(row.collection_id);
  }

  return {
    hasOrganizationScope,
    marketIds: Array.from(marketIds),
    channelIds: Array.from(channelIds),
    collectionIds: Array.from(collectionIds),
  };
}

function dedupeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out.add(trimmed);
  }
  return Array.from(out);
}

export async function resolveCollectionAssetIds(params: {
  organizationId: string;
  collectionIds: string[];
}): Promise<string[]> {
  const { organizationId } = params;
  const collectionIds = Array.from(new Set(params.collectionIds.filter(Boolean)));
  if (collectionIds.length === 0) {
    return [];
  }

  const { data: collections, error: collectionsError } = await (supabaseServer as any)
    .from("dam_collections")
    .select("id,asset_ids,folder_ids")
    .eq("organization_id", organizationId)
    .in("id", collectionIds);

  if (collectionsError || !Array.isArray(collections)) {
    return [];
  }

  const assetIds = new Set<string>();
  const rootFolderIds = new Set<string>();

  for (const collection of collections as Array<any>) {
    for (const assetId of dedupeStringArray(collection.asset_ids)) {
      assetIds.add(assetId);
    }
    for (const folderId of dedupeStringArray(collection.folder_ids)) {
      rootFolderIds.add(folderId);
    }
  }

  if (rootFolderIds.size === 0) {
    return Array.from(assetIds);
  }

  const { data: rootFolders, error: rootFolderError } = await (supabaseServer as any)
    .from("dam_folders")
    .select("id,path")
    .eq("organization_id", organizationId)
    .in("id", Array.from(rootFolderIds));

  if (rootFolderError) {
    return Array.from(assetIds);
  }

  const descendantFolderIds = new Set<string>();
  const folderPaths = new Set<string>();

  for (const folder of (rootFolders || []) as Array<{ id: string; path: string }>) {
    if (folder.id) descendantFolderIds.add(folder.id);
    if (folder.path) folderPaths.add(folder.path);
  }

  for (const path of folderPaths) {
    const { data: descendants } = await (supabaseServer as any)
      .from("dam_folders")
      .select("id")
      .eq("organization_id", organizationId)
      .like("path", `${path}/%`);

    for (const folder of (descendants || []) as Array<{ id: string }>) {
      if (folder.id) descendantFolderIds.add(folder.id);
    }
  }

  if (descendantFolderIds.size > 0) {
    const { data: folderAssets } = await (supabaseServer as any)
      .from("dam_assets")
      .select("id")
      .eq("organization_id", organizationId)
      .in("folder_id", Array.from(descendantFolderIds));

    for (const row of (folderAssets || []) as Array<{ id: string }>) {
      if (row.id) assetIds.add(row.id);
    }
  }

  return Array.from(assetIds);
}

export async function resolvePartnerGrantedAssetIds(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
}): Promise<{ foundationAvailable: boolean; assetIds: string[] }> {
  const shareSets = await resolveActivePartnerShareSetIds({
    brandOrganizationId: params.brandOrganizationId,
    partnerOrganizationId: params.partnerOrganizationId,
    moduleKey: "assets",
  });

  if (!shareSets.foundationAvailable) {
    return { foundationAvailable: false, assetIds: [] };
  }
  if (shareSets.setIds.length === 0) {
    return { foundationAvailable: true, assetIds: [] };
  }

  const { data: items, error: itemsError } = await (supabaseServer as any)
    .from("share_set_items")
    .select("resource_type,resource_id,include_descendants")
    .eq("organization_id", params.brandOrganizationId)
    .in("share_set_id", shareSets.setIds)
    .in("resource_type", ["asset", "folder"]);

  if (itemsError) {
    if (isMissingShareSetFoundationError(itemsError)) {
      return { foundationAvailable: false, assetIds: [] };
    }
    console.error("Failed to resolve asset share set items:", itemsError);
    return { foundationAvailable: true, assetIds: [] };
  }

  const assetIds = new Set<string>();
  const folderIdsDirect = new Set<string>();
  const folderIdsRecursive = new Set<string>();

  for (const item of (items || []) as Array<{
    resource_type: string;
    resource_id: string | null;
    include_descendants: boolean | null;
  }>) {
    if (!item.resource_id) continue;
    if (item.resource_type === "asset") {
      assetIds.add(item.resource_id);
      continue;
    }
    if (item.resource_type !== "folder") continue;

    if (item.include_descendants) {
      folderIdsRecursive.add(item.resource_id);
    } else {
      folderIdsDirect.add(item.resource_id);
    }
  }

  if (folderIdsDirect.size > 0) {
    const { data: directAssets, error: directAssetsError } = await (supabaseServer as any)
      .from("dam_assets")
      .select("id")
      .eq("organization_id", params.brandOrganizationId)
      .in("folder_id", Array.from(folderIdsDirect));

    if (!directAssetsError) {
      for (const row of (directAssets || []) as Array<{ id: string | null }>) {
        if (row.id) assetIds.add(row.id);
      }
    }
  }

  if (folderIdsRecursive.size > 0) {
    const { data: rootFolders, error: rootFoldersError } = await (supabaseServer as any)
      .from("dam_folders")
      .select("id,path")
      .eq("organization_id", params.brandOrganizationId)
      .in("id", Array.from(folderIdsRecursive));

    if (!rootFoldersError) {
      const folderIds = new Set<string>();
      const rootPaths: string[] = [];

      for (const folder of (rootFolders || []) as Array<{ id: string | null; path: string | null }>) {
        if (folder.id) folderIds.add(folder.id);
        if (folder.path) rootPaths.push(folder.path);
      }

      for (const path of rootPaths) {
        const { data: descendants } = await (supabaseServer as any)
          .from("dam_folders")
          .select("id")
          .eq("organization_id", params.brandOrganizationId)
          .like("path", `${path}/%`);

        for (const folder of (descendants || []) as Array<{ id: string | null }>) {
          if (folder.id) folderIds.add(folder.id);
        }
      }

      if (folderIds.size > 0) {
        const { data: folderAssets } = await (supabaseServer as any)
          .from("dam_assets")
          .select("id")
          .eq("organization_id", params.brandOrganizationId)
          .in("folder_id", Array.from(folderIds));

        for (const row of (folderAssets || []) as Array<{ id: string | null }>) {
          if (row.id) assetIds.add(row.id);
        }
      }
    }
  }

  // Compatibility bridge:
  // Older backfilled sets can carry metadata.legacy_collection_id while not yet
  // having explicit share_set_items rows. Include those assets so legacy data
  // remains visible during migration rollout.
  const { data: setRows, error: setRowsError } = await (supabaseServer as any)
    .from("share_sets")
    .select("id,metadata")
    .eq("organization_id", params.brandOrganizationId)
    .eq("module_key", "assets")
    .in("id", shareSets.setIds);

  if (!setRowsError && Array.isArray(setRows)) {
    const fallbackCollectionIds = new Set<string>();
    for (const row of setRows as Array<{ id: string; metadata: Record<string, unknown> | null }>) {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : null;
      const legacyCollectionId =
        metadata && typeof metadata.legacy_collection_id === "string"
          ? metadata.legacy_collection_id.trim()
          : "";
      if (legacyCollectionId) {
        fallbackCollectionIds.add(legacyCollectionId);
      }
    }

    if (fallbackCollectionIds.size > 0) {
      const legacyAssets = await resolveCollectionAssetIds({
        organizationId: params.brandOrganizationId,
        collectionIds: Array.from(fallbackCollectionIds),
      });
      for (const assetId of legacyAssets) {
        assetIds.add(assetId);
      }
    }
  }

  return { foundationAvailable: true, assetIds: Array.from(assetIds) };
}

export async function resolvePartnerGrantedProductIds(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
}): Promise<{ foundationAvailable: boolean; productIds: string[] }> {
  const shareSets = await resolveActivePartnerShareSetIds({
    brandOrganizationId: params.brandOrganizationId,
    partnerOrganizationId: params.partnerOrganizationId,
    moduleKey: "products",
  });

  if (!shareSets.foundationAvailable) {
    return { foundationAvailable: false, productIds: [] };
  }
  if (shareSets.setIds.length === 0) {
    return { foundationAvailable: true, productIds: [] };
  }

  const { data: items, error: itemsError } = await (supabaseServer as any)
    .from("share_set_items")
    .select("resource_type,resource_id,include_descendants")
    .eq("organization_id", params.brandOrganizationId)
    .in("share_set_id", shareSets.setIds)
    .in("resource_type", ["product", "variant"]);

  if (itemsError) {
    if (isMissingShareSetFoundationError(itemsError)) {
      return { foundationAvailable: false, productIds: [] };
    }
    console.error("Failed to resolve product share set items:", itemsError);
    return { foundationAvailable: true, productIds: [] };
  }

  const productIds = new Set<string>();
  const parentIdsWithDescendants = new Set<string>();

  for (const item of (items || []) as Array<{
    resource_type: string;
    resource_id: string | null;
    include_descendants: boolean | null;
  }>) {
    if (!item.resource_id) continue;

    productIds.add(item.resource_id);
    if (item.resource_type === "product" && item.include_descendants) {
      parentIdsWithDescendants.add(item.resource_id);
    }
  }

  if (parentIdsWithDescendants.size > 0) {
    const { data: descendants } = await (supabaseServer as any)
      .from("products")
      .select("id")
      .eq("organization_id", params.brandOrganizationId)
      .in("parent_id", Array.from(parentIdsWithDescendants));

    for (const row of (descendants || []) as Array<{ id: string | null }>) {
      if (row.id) productIds.add(row.id);
    }
  }

  return { foundationAvailable: true, productIds: Array.from(productIds) };
}
