import {
  resolvePartnerGrantedAssetIds,
  resolvePartnerGrantedProductIds,
} from "@/lib/partner-brand-view";
import { listRecentPortalPublishes, type PortalPublishRecord } from "@/lib/syndication-runs";
import { getSupabaseServer } from "@/lib/supabase";

export type PartnerDestinationView = {
  id: string;
  name: string;
  code: string;
  profileType: string;
  accessLevel: "view" | "download" | "export";
  source: "grant" | "legacy";
};

export type PartnerEntitlementResult = {
  foundationAvailable: boolean;
  productFoundationAvailable: boolean;
  assetFoundationAvailable: boolean;
  productIds: string[];
  assetIds: string[];
  destinations: PartnerDestinationView[];
  allowedActions: Array<"view" | "download" | "export">;
  portalPublishes: PortalPublishRecord[];
  requestedDestinationGranted: boolean;
  requestedDestinationPublished: boolean;
};

type PartnerGrantScopeSelection = {
  marketId?: string | null;
  channelId?: string | null;
  destinationProfileId?: string | null;
  localeId?: string | null;
  destinationId?: string | null;
};

function isPortalProfileRow(profile: {
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

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    )
  );
}

function intersectIds(baseIds: string[], allowedIds: string[]): string[] {
  if (baseIds.length === 0 || allowedIds.length === 0) return [];
  const allowed = new Set(allowedIds);
  return baseIds.filter((id) => allowed.has(id));
}

async function resolveActivePartnerShareSetIds(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
  moduleKey: "assets" | "products";
}): Promise<string[]> {
  const now = Date.now();
  const { data: grants, error } = await getSupabaseServer()
    .from("partner_share_set_grants")
    .select("share_set_id,expires_at,valid_from")
    .eq("organization_id", params.brandOrganizationId)
    .eq("partner_organization_id", params.partnerOrganizationId)
    .eq("status", "active");

  if (error || !Array.isArray(grants) || grants.length === 0) {
    return [];
  }

  const unexpiredSetIds = Array.from(
    new Set(
      (grants as Array<{ share_set_id: string | null; expires_at: string | null; valid_from: string | null }>)
        .filter((grant) => {
          if (!grant.share_set_id) return false;
          if (grant.valid_from) {
            const validFrom = Date.parse(grant.valid_from);
            if (Number.isFinite(validFrom) && validFrom > now) return false;
          }
          if (!grant.expires_at) return true;
          const expiresAt = Date.parse(grant.expires_at);
          return Number.isFinite(expiresAt) && expiresAt > now;
        })
        .map((grant) => grant.share_set_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  if (unexpiredSetIds.length === 0) return [];

  const { data: sets, error: setsError } = await getSupabaseServer()
    .from("share_sets")
    .select("id")
    .eq("organization_id", params.brandOrganizationId)
    .eq("module_key", params.moduleKey)
    .in("id", unexpiredSetIds);

  if (setsError || !Array.isArray(sets)) {
    return [];
  }

  return Array.from(
    new Set(
      (sets as Array<{ id: string | null }>)
        .map((row) => row.id)
        .filter((id): id is string => Boolean(id))
    )
  );
}

async function resolveLinkedAssetIdsForProducts(params: {
  organizationId: string;
  productIds: string[];
}): Promise<string[]> {
  if (params.productIds.length === 0) return [];

  const assetIds = new Set<string>();

  const [productLinks, slotAssignments] = await Promise.all([
    getSupabaseServer()
      .from("product_asset_links")
      .select("asset_id")
      .eq("organization_id", params.organizationId)
      .in("product_id", params.productIds),
    getSupabaseServer()
      .from("product_output_slot_assignments")
      .select("asset_id,product_id,status")
      .eq("organization_id", params.organizationId)
      .in("product_id", params.productIds)
      .neq("status", "archived"),
  ]);

  if (!productLinks.error && Array.isArray(productLinks.data)) {
    for (const row of productLinks.data as Array<{ asset_id: string | null }>) {
      if (row.asset_id) assetIds.add(row.asset_id);
    }
  }

  if (!slotAssignments.error && Array.isArray(slotAssignments.data)) {
    for (const row of slotAssignments.data as Array<{ asset_id?: string | null }>) {
      if (row.asset_id) assetIds.add(row.asset_id);
    }
  }

  return Array.from(assetIds);
}

async function resolvePortalPublishedProductIds(params: {
  organizationId: string;
  portalPublishes: PortalPublishRecord[];
}): Promise<string[]> {
  if (params.portalPublishes.length === 0) return [];

  const productIds = new Set<string>();
  const runIdsToLoad = new Set<string>();

  for (const publish of params.portalPublishes) {
    const scopedProductIds = toStringArray(publish.scopeMetadata.product_ids);
    for (const productId of scopedProductIds) productIds.add(productId);

    if (scopedProductIds.length === 0 && publish.syndicationRunId) {
      runIdsToLoad.add(publish.syndicationRunId);
    }
  }

  if (runIdsToLoad.size > 0) {
    const { data, error } = await getSupabaseServer()
      .from("syndication_runs")
      .select("id,source_metadata")
      .eq("organization_id", params.organizationId)
      .in("id", Array.from(runIdsToLoad));

    if (error) {
      console.error("Failed to resolve portal publish product scope:", error);
    } else {
      for (const row of (data || []) as Array<{
        id: string;
        source_metadata: Record<string, unknown> | null;
      }>) {
        const sourceMetadata =
          row.source_metadata && typeof row.source_metadata === "object" && !Array.isArray(row.source_metadata)
            ? row.source_metadata
            : {};
        for (const productId of toStringArray(sourceMetadata.product_ids)) {
          productIds.add(productId);
        }
      }
    }
  }

  return Array.from(productIds);
}

async function resolveLegacyDestinationViews(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
  scope?: PartnerGrantScopeSelection;
}): Promise<PartnerDestinationView[]> {
  const destinationIds = new Set<string>();

  const { data: marketAssignments } = await getSupabaseServer()
    .from("partner_market_assignments")
    .select("output_profile_id,market_id")
    .eq("organization_id", params.brandOrganizationId)
    .eq("partner_organization_id", params.partnerOrganizationId)
    .eq("is_active", true);

  for (const row of (marketAssignments || []) as Array<{
    output_profile_id: string | null;
    market_id: string | null;
  }>) {
    if (params.scope?.marketId && row.market_id && row.market_id !== params.scope.marketId) continue;
    if (row.output_profile_id) destinationIds.add(row.output_profile_id);
  }

  const { data: shareSetGrantRows } = await getSupabaseServer()
    .from("partner_share_set_grants")
    .select("share_set_id")
    .eq("organization_id", params.brandOrganizationId)
    .eq("partner_organization_id", params.partnerOrganizationId)
    .eq("status", "active");

  const shareSetIds = Array.from(
    new Set(
      ((shareSetGrantRows || []) as Array<{ share_set_id: string | null }>)
        .map((row) => row.share_set_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  if (shareSetIds.length > 0) {
    const { data: shareSets } = await getSupabaseServer()
      .from("share_sets")
      .select("output_profile_id")
      .eq("organization_id", params.brandOrganizationId)
      .in("id", shareSetIds)
      .not("output_profile_id", "is", null);

    for (const row of (shareSets || []) as unknown as Array<{ output_profile_id: string | null }>) {
      if (row.output_profile_id) destinationIds.add(row.output_profile_id);
    }
  }

  if (destinationIds.size === 0) return [];

  const { data: profiles } = await getSupabaseServer()
    .from("output_channel_profiles")
    .select("id,name,code,profile_type")
    .eq("organization_id", params.brandOrganizationId)
    .in("id", Array.from(destinationIds))
    .eq("is_active", true);

  return ((profiles || []) as Array<{
    id: string;
    name: string;
    code: string;
    profile_type: string;
  }>)
    .filter(isPortalProfileRow)
    .map((profile) => ({
      id: profile.id,
      name: "Portal",
      code: "portal",
      profileType: "portal",
      accessLevel: "view",
      source: "legacy",
    }));
}

export async function resolvePartnerGrantedDestinationViews(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
  scope?: PartnerGrantScopeSelection;
}): Promise<PartnerDestinationView[]> {
  const { data, error } = await getSupabaseServer()
    .from("partner_contract_grants")
    .select(
      "output_profile_id,access_level,status,output_channel_profiles!inner(id,name,code,profile_type)"
    )
    .eq("organization_id", params.brandOrganizationId)
    .eq("partner_organization_id", params.partnerOrganizationId)
    .eq("status", "active");

  if (error) {
    console.error("Failed to resolve partner destination grants:", error);
  }

  const directViews = ((data || []) as Array<{
    output_profile_id: string;
    access_level: "view" | "download" | "export";
    output_channel_profiles:
      | {
          id: string;
          name: string;
          code: string;
          profile_type: string;
        }
      | Array<{
          id: string;
          name: string;
          code: string;
          profile_type: string;
        }>
      | null;
  }>)
    .map((row) => {
      const profile = Array.isArray(row.output_channel_profiles)
        ? row.output_channel_profiles[0] || null
        : row.output_channel_profiles || null;
      if (!profile) return null;
      if (!isPortalProfileRow(profile)) return null;
      return {
        id: profile.id,
        name: "Portal",
        code: "portal",
        profileType: "portal",
        accessLevel: row.access_level,
        source: "grant" as const,
      };
    })
    .filter(
      (
        view
      ): view is {
        id: string;
        name: string;
        code: string;
        profileType: string;
        accessLevel: "view" | "download" | "export";
        source: "grant";
      } => Boolean(view)
    );

  const allViews =
    directViews.length > 0
      ? directViews
      : await resolveLegacyDestinationViews(params);

  if (params.scope?.destinationId) {
    return allViews.filter((view) => view.id === params.scope?.destinationId);
  }

  return allViews.sort((left, right) => left.name.localeCompare(right.name));
}

export async function resolvePartnerEntitlements(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
  scope?: PartnerGrantScopeSelection;
}): Promise<PartnerEntitlementResult> {
  const [products, assets, destinations, portalPublishes, productShareSetIds] = await Promise.all([
    resolvePartnerGrantedProductIds({
      brandOrganizationId: params.brandOrganizationId,
      partnerOrganizationId: params.partnerOrganizationId,
      scope: params.scope,
    }),
    resolvePartnerGrantedAssetIds({
      brandOrganizationId: params.brandOrganizationId,
      partnerOrganizationId: params.partnerOrganizationId,
      scope: params.scope,
    }),
    resolvePartnerGrantedDestinationViews(params),
    listRecentPortalPublishes({
      organizationId: params.brandOrganizationId,
      partnerOrganizationId: params.partnerOrganizationId,
      limit: 8,
    }).catch(() => []),
    resolveActivePartnerShareSetIds({
      brandOrganizationId: params.brandOrganizationId,
      partnerOrganizationId: params.partnerOrganizationId,
      moduleKey: "products",
    }),
  ]);

  const requestedDestinationId = asString(params.scope?.destinationId);
  const filteredPortalPublishes = portalPublishes.filter((publish) => {
    if (params.scope?.marketId && publish.marketId && publish.marketId !== params.scope.marketId) {
      return false;
    }
    if (
      requestedDestinationId &&
      publish.outputProfileId &&
      publish.outputProfileId !== requestedDestinationId
    ) {
      return false;
    }
    return true;
  });

  const requestedDestinationGranted =
    !requestedDestinationId || destinations.some((destination) => destination.id === requestedDestinationId);
  const requestedDestinationPublished =
    !requestedDestinationId ||
    filteredPortalPublishes.some((publish) => publish.outputProfileId === requestedDestinationId);

  const allowedActions = new Set<"view" | "download" | "export">();
  for (const destination of destinations) {
    allowedActions.add("view");
    if (destination.accessLevel === "download" || destination.accessLevel === "export") {
      allowedActions.add("download");
    }
    if (destination.accessLevel === "export") {
      allowedActions.add("export");
    }
  }

  let entitledProductIds = products.productIds;
  let entitledAssetIds = assets.assetIds;

  if (!requestedDestinationGranted) {
    entitledProductIds = [];
    entitledAssetIds = [];
  } else {
    const publishedProductIds = await resolvePortalPublishedProductIds({
      organizationId: params.brandOrganizationId,
      portalPublishes: filteredPortalPublishes,
    });

    if (requestedDestinationId) {
      if (!requestedDestinationPublished) {
        entitledProductIds = [];
        entitledAssetIds = [];
      } else if (publishedProductIds.length > 0) {
        entitledProductIds =
          productShareSetIds.length > 0
            ? intersectIds(entitledProductIds, publishedProductIds)
            : publishedProductIds;
      }
    } else if (filteredPortalPublishes.length > 0 && publishedProductIds.length > 0) {
      entitledProductIds =
        productShareSetIds.length > 0
          ? intersectIds(entitledProductIds, publishedProductIds)
          : publishedProductIds;
    }
  }

  const linkedAssetIds = await resolveLinkedAssetIdsForProducts({
    organizationId: params.brandOrganizationId,
    productIds: entitledProductIds,
  });
  entitledAssetIds = Array.from(new Set([...entitledAssetIds, ...linkedAssetIds]));

  return {
    foundationAvailable: products.foundationAvailable && assets.foundationAvailable,
    productFoundationAvailable: products.foundationAvailable,
    assetFoundationAvailable: assets.foundationAvailable,
    productIds: entitledProductIds,
    assetIds: entitledAssetIds,
    destinations,
    allowedActions: Array.from(allowedActions),
    portalPublishes: filteredPortalPublishes,
    requestedDestinationGranted,
    requestedDestinationPublished,
  };
}
