import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { evaluateScopedPermission } from "@/lib/security-permissions";
import {
  replaceAssetScopeAssignments,
  validateAuthoringScope,
} from "@/lib/authoring-scope";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ProductSelection = {
  all: boolean;
  productIds: string[];
  variantIdsByProduct: Record<string, string[]>;
};

type AuthoringScope = {
  mode: "global" | "scoped";
  marketIds: string[];
  channelIds: string[];
  localeIds: string[];
  destinationIds: string[];
};

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

async function requireAssetWritePermission(params: {
  userId: string;
  organizationId: string;
  permissionKey: string;
}) {
  const db = new DatabaseQueries(supabase as any);
  const authService = new AuthService(db);
  return evaluateScopedPermission({
    authService,
    userId: params.userId,
    organizationId: params.organizationId,
    permissionKey: params.permissionKey,
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const values = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    values.add(trimmed);
  }
  return Array.from(values);
}

function normalizeOptionalConfidence(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeAuthoringScope(value: unknown): AuthoringScope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const mode = raw.mode === "scoped" ? "scoped" : "global";
  const scope: AuthoringScope = {
    mode,
    marketIds: normalizeStringArray(raw.marketIds),
    channelIds: normalizeStringArray(raw.channelIds),
    localeIds: normalizeStringArray(raw.localeIds),
    destinationIds: normalizeStringArray(raw.destinationIds),
  };

  if (scope.mode === "global") {
    scope.marketIds = [];
    scope.channelIds = [];
    scope.localeIds = [];
    scope.destinationIds = [];
  }

  return scope;
}

function normalizeProductSelection(value: unknown): ProductSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const selection: ProductSelection = {
    all: Boolean(raw.all),
    productIds: normalizeStringArray(raw.productIds),
    variantIdsByProduct: {},
  };

  if (
    raw.variantIdsByProduct &&
    typeof raw.variantIdsByProduct === "object" &&
    !Array.isArray(raw.variantIdsByProduct)
  ) {
    for (const [productId, variantIds] of Object.entries(
      raw.variantIdsByProduct as Record<string, unknown>
    )) {
      const cleanProductId = String(productId || "").trim();
      if (!cleanProductId) continue;
      const cleanVariantIds = normalizeStringArray(variantIds);
      if (cleanVariantIds.length > 0) {
        selection.variantIdsByProduct[cleanProductId] = cleanVariantIds;
      }
    }
  }

  return selection;
}

function collectSelectionProductIds(selection: ProductSelection): string[] {
  const ids = new Set<string>(selection.productIds);
  for (const variantIds of Object.values(selection.variantIdsByProduct)) {
    for (const variantId of variantIds) {
      ids.add(variantId);
    }
  }
  return Array.from(ids);
}

async function resolveSelectedProductIds(params: {
  organizationId: string;
  selection: ProductSelection;
  appliesToChildren: boolean;
}): Promise<string[]> {
  const { organizationId, selection, appliesToChildren } = params;

  let selectedRows: Array<{ id: string; type: string | null }> = [];

  if (selection.all) {
    const { data, error } = await (supabase as any)
      .from("products")
      .select("id,type")
      .eq("organization_id", organizationId)
      .eq("status", "Active");
    if (error || !Array.isArray(data)) {
      throw new Error("Failed to resolve product selection");
    }
    selectedRows = data as Array<{ id: string; type: string | null }>;
  } else {
    const explicitIds = collectSelectionProductIds(selection);
    if (explicitIds.length === 0) {
      return [];
    }
    const { data, error } = await (supabase as any)
      .from("products")
      .select("id,type")
      .eq("organization_id", organizationId)
      .in("id", explicitIds);
    if (error || !Array.isArray(data)) {
      throw new Error("Failed to resolve product selection");
    }
    selectedRows = data as Array<{ id: string; type: string | null }>;
  }

  const selectedIds = new Set(selectedRows.map((row) => row.id));

  if (!appliesToChildren) {
    return Array.from(selectedIds);
  }

  const parentIds = selectedRows
    .filter((row) => String(row.type || "").toLowerCase() !== "variant")
    .map((row) => row.id);

  if (parentIds.length === 0) {
    return Array.from(selectedIds);
  }

  const { data: descendants, error: descendantsError } = await (supabase as any)
    .from("products")
    .select("id")
    .eq("organization_id", organizationId)
    .in("parent_id", parentIds);

  if (descendantsError) {
    throw new Error("Failed to resolve child variants");
  }

  for (const row of (descendants || []) as Array<{ id: string | null }>) {
    if (row.id) selectedIds.add(row.id);
  }

  return Array.from(selectedIds);
}

async function syncUploadProductLinks(params: {
  organizationId: string;
  userId: string;
  assetId: string;
  assetType: string;
  productIds: string[];
  confidence: number;
  matchReason: string;
  linkType: "auto" | "manual";
}): Promise<void> {
  const { organizationId, userId, assetId, assetType, productIds, confidence, matchReason, linkType } = params;

  const { data: existingLinks, error: existingLinksError } = await (supabase as any)
    .from("product_asset_links")
    .select("id,product_id")
    .eq("organization_id", organizationId)
    .eq("asset_id", assetId)
    .eq("link_context", "upload")
    .eq("is_active", true);

  if (existingLinksError) {
    throw new Error("Failed to load existing upload product links");
  }

  const targetProductIds = new Set(productIds);
  const linksToDeactivate = ((existingLinks || []) as Array<{ id: string; product_id: string | null }>)
    .filter((link) => !link.product_id || !targetProductIds.has(link.product_id))
    .map((link) => link.id);

  if (linksToDeactivate.length > 0) {
    const { error: deactivateError } = await (supabase as any)
      .from("product_asset_links")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("asset_id", assetId)
      .in("id", linksToDeactivate);

    if (deactivateError) {
      throw new Error("Failed to deactivate stale upload product links");
    }
  }

  if (targetProductIds.size > 0) {
    const linkRows = Array.from(targetProductIds).map((productId) => ({
      organization_id: organizationId,
      product_id: productId,
      asset_id: assetId,
      asset_type: assetType,
      link_context: "upload",
      confidence,
      match_reason: matchReason,
      link_type: linkType,
      is_active: true,
      created_by: userId,
    }));

    const { error: upsertError } = await (supabase as any)
      .from("product_asset_links")
      .upsert(linkRows, {
        onConflict: "organization_id,product_id,asset_id,link_context",
      });

    if (upsertError) {
      throw new Error("Failed to upsert upload product links");
    }
  }
}

async function refreshAssetProductIdentifiers(params: {
  organizationId: string;
  assetId: string;
}): Promise<void> {
  const { organizationId, assetId } = params;

  const { data: activeLinks, error: linksError } = await (supabase as any)
    .from("product_asset_links")
    .select("product_id")
    .eq("organization_id", organizationId)
    .eq("asset_id", assetId)
    .eq("is_active", true);

  if (linksError) {
    throw new Error("Failed to refresh asset product identifiers");
  }

  const linkedProductIds = Array.from(
    new Set(
      ((activeLinks || []) as Array<{ product_id: string | null }>)
        .map((row) => row.product_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const identifiers = new Set<string>();

  if (linkedProductIds.length > 0) {
    const { data: productRows, error: productsError } = await (supabase as any)
      .from("products")
      .select("sku,scin")
      .eq("organization_id", organizationId)
      .in("id", linkedProductIds);

    if (productsError) {
      throw new Error("Failed to refresh asset product identifiers");
    }

    for (const row of (productRows || []) as Array<{ sku: string | null; scin: string | null }>) {
      if (row.sku && row.sku.trim()) identifiers.add(row.sku.trim());
      if (row.scin && row.scin.trim()) identifiers.add(row.scin.trim());
    }
  }

  const { error: updateError } = await (supabase as any)
    .from("dam_assets")
    .update({
      product_identifiers: Array.from(identifiers),
    })
    .eq("id", assetId)
    .eq("organization_id", organizationId);

  if (updateError) {
    throw new Error("Failed to refresh asset product identifiers");
  }
}

// PATCH /api/[tenant]/assets/[assetId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; assetId: string }> }
) {
  try {
    const resolvedParams = await params;
    const tenantSlug = resolvedParams.tenant;
    const assetId = resolvedParams.assetId;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite(tenantSlug, selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const tenantAccess = await requireTenantAccess(request, tenantSlug);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }

    const { organization, userId } = tenantAccess;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canEdit = await requireAssetWritePermission({
      userId,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetMetadataEdit,
    });
    if (!canEdit) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to edit asset metadata." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const hasFilename = typeof body.filename === "string";
    const hasLegacyName = typeof body.name === "string";
    const rawFilename = hasFilename ? body.filename : hasLegacyName ? body.name : undefined;
    const filename = typeof rawFilename === "string" ? rawFilename.trim() : undefined;
    const hasDescription = Object.prototype.hasOwnProperty.call(body, "description");
    const hasFolderId = Object.prototype.hasOwnProperty.call(body, "folderId");
    const hasUsageGroupId = Object.prototype.hasOwnProperty.call(body, "usageGroupId");
    const hasKeywords = Object.prototype.hasOwnProperty.call(body, "keywords");
    const hasCategories = Object.prototype.hasOwnProperty.call(body, "categories");
    const hasProductLinks = Object.prototype.hasOwnProperty.call(body, "productLinks");
    const hasAuthoringScope = Object.prototype.hasOwnProperty.call(body, "authoringScope");
    const hasAppliesToChildren = Object.prototype.hasOwnProperty.call(body, "appliesToChildren");
    const hasAutoSuggestedProductLinks = Object.prototype.hasOwnProperty.call(
      body,
      "autoSuggestedProductLinks"
    );
    const hasSuggestedProductLinkConfidence = Object.prototype.hasOwnProperty.call(
      body,
      "suggestedProductLinkConfidence"
    );
    const hasSuggestedProductLinkReason = Object.prototype.hasOwnProperty.call(
      body,
      "suggestedProductLinkReason"
    );
    const description =
      hasDescription && typeof body.description === "string"
        ? body.description.trim()
        : hasDescription
          ? null
          : undefined;
    const folderId =
      hasFolderId && typeof body.folderId === "string" && body.folderId.trim().length > 0
        ? body.folderId.trim()
        : hasFolderId
          ? null
          : undefined;
    const usageGroupId =
      hasUsageGroupId && typeof body.usageGroupId === "string" && body.usageGroupId.trim().length > 0
        ? body.usageGroupId.trim()
        : hasUsageGroupId
          ? null
          : undefined;
    const tags = Array.isArray(body.tags)
      ? body.tags
          .filter((tag: unknown): tag is string => typeof tag === "string")
          .map((tag: string) => tag.trim())
          .filter((tag: string) => tag.length > 0)
      : undefined;
    const keywords = hasKeywords
      ? Array.isArray(body.keywords)
        ? body.keywords
            .filter((keyword: unknown): keyword is string => typeof keyword === "string")
            .map((keyword: string) => keyword.trim())
            .filter((keyword: string) => keyword.length > 0)
        : null
      : undefined;
    const categories = hasCategories
      ? Array.isArray(body.categories)
        ? body.categories
            .filter((category: unknown): category is string => typeof category === "string")
            .map((category: string) => category.trim())
            .filter((category: string) => category.length > 0)
        : null
      : undefined;
    const productLinks =
      hasProductLinks &&
      body.productLinks &&
      typeof body.productLinks === "object" &&
      !Array.isArray(body.productLinks)
        ? body.productLinks
        : hasProductLinks
          ? null
          : undefined;
    const authoringScope =
      hasAuthoringScope && body.authoringScope === null
        ? ({
            mode: "global",
            marketIds: [],
            channelIds: [],
            localeIds: [],
            destinationIds: [],
          } as AuthoringScope)
        : hasAuthoringScope
          ? normalizeAuthoringScope(body.authoringScope)
          : undefined;
    const appliesToChildren =
      hasAppliesToChildren && typeof body.appliesToChildren === "boolean"
        ? body.appliesToChildren
        : hasAppliesToChildren
          ? null
          : undefined;
    const autoSuggestedProductLinks =
      hasAutoSuggestedProductLinks && typeof body.autoSuggestedProductLinks === "boolean"
        ? body.autoSuggestedProductLinks
        : hasAutoSuggestedProductLinks
          ? null
          : undefined;
    const suggestedProductLinkConfidence = hasSuggestedProductLinkConfidence
      ? normalizeOptionalConfidence(body.suggestedProductLinkConfidence)
      : undefined;
    const suggestedProductLinkReason = hasSuggestedProductLinkReason
      ? typeof body.suggestedProductLinkReason === "string"
        ? body.suggestedProductLinkReason.trim() || null
        : body.suggestedProductLinkReason === null
          ? null
          : undefined
      : undefined;

    if ((hasFilename || hasLegacyName) && !filename) {
      return NextResponse.json({ error: "filename cannot be empty" }, { status: 400 });
    }
    if (hasKeywords && keywords === null) {
      return NextResponse.json({ error: "keywords must be an array of strings" }, { status: 400 });
    }
    if (hasCategories && categories === null) {
      return NextResponse.json({ error: "categories must be an array of strings" }, { status: 400 });
    }
    if (hasProductLinks && productLinks === null) {
      return NextResponse.json({ error: "productLinks must be an object" }, { status: 400 });
    }
    if (hasAuthoringScope && !authoringScope) {
      return NextResponse.json({ error: "authoringScope must be an object or null" }, { status: 400 });
    }
    if (hasAppliesToChildren && appliesToChildren === null) {
      return NextResponse.json({ error: "appliesToChildren must be a boolean" }, { status: 400 });
    }
    if (hasAutoSuggestedProductLinks && autoSuggestedProductLinks === null) {
      return NextResponse.json({ error: "autoSuggestedProductLinks must be a boolean" }, { status: 400 });
    }
    if (
      hasSuggestedProductLinkConfidence &&
      body.suggestedProductLinkConfidence !== null &&
      suggestedProductLinkConfidence === null
    ) {
      return NextResponse.json(
        { error: "suggestedProductLinkConfidence must be a number between 0 and 1" },
        { status: 400 }
      );
    }
    if (hasSuggestedProductLinkReason && suggestedProductLinkReason === undefined) {
      return NextResponse.json(
        { error: "suggestedProductLinkReason must be a string or null" },
        { status: 400 }
      );
    }

    const validatedAuthoringScope = hasAuthoringScope
      ? await validateAuthoringScope({
          supabase,
          organizationId: organization.id,
          rawScope: authoringScope,
        })
      : null;

    if (validatedAuthoringScope && !validatedAuthoringScope.ok) {
      return NextResponse.json(
        { error: validatedAuthoringScope.error },
        { status: validatedAuthoringScope.status }
      );
    }

    const { data: existingAsset, error: existingAssetError } = await (supabase as any)
      .from("dam_assets")
      .select("id,metadata,file_type,asset_type")
      .eq("id", assetId)
      .eq("organization_id", organization.id)
      .single();

    if (existingAssetError || !existingAsset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const updatePayload: Record<string, any> = {};
    if (filename !== undefined) {
      updatePayload.filename = filename;
      updatePayload.original_filename = filename;
    }
    if (hasDescription) {
      updatePayload.description = description ? description : null;
    }
    if (tags !== undefined) {
      updatePayload.tags = tags;
    }
    if (hasFolderId) {
      if (folderId) {
        const { data: matchingFolder, error: folderError } = await (supabase as any)
          .from("dam_folders")
          .select("id")
          .eq("id", folderId)
          .eq("organization_id", organization.id)
          .maybeSingle();
        if (folderError || !matchingFolder) {
          return NextResponse.json({ error: "folderId is invalid" }, { status: 400 });
        }
      }
      updatePayload.folder_id = folderId;
    }
    const existingMetadata =
      existingAsset &&
      typeof (existingAsset as any).metadata === "object" &&
      (existingAsset as any).metadata !== null &&
      !Array.isArray((existingAsset as any).metadata)
        ? ((existingAsset as any).metadata as Record<string, any>)
        : {};
    const normalizedProductLinks = hasProductLinks
      ? normalizeProductSelection(productLinks)
      : null;

    if (hasProductLinks && !normalizedProductLinks) {
      return NextResponse.json({ error: "productLinks must be a valid selection object" }, { status: 400 });
    }

    if (
      hasUsageGroupId ||
      hasKeywords ||
      hasCategories ||
      hasProductLinks ||
      hasAuthoringScope ||
      hasAppliesToChildren ||
      hasAutoSuggestedProductLinks ||
      hasSuggestedProductLinkConfidence ||
      hasSuggestedProductLinkReason
    ) {
      const effectiveAppliesToChildren =
        hasAppliesToChildren && appliesToChildren !== null
          ? appliesToChildren
          : Boolean(existingMetadata.appliesToChildren ?? true);

      updatePayload.metadata = {
        ...existingMetadata,
        ...(hasUsageGroupId ? { usageGroupId } : {}),
        ...(hasKeywords ? { keywords } : {}),
        ...(hasCategories ? { categories } : {}),
        ...(hasProductLinks ? { productLinks: normalizedProductLinks } : {}),
        ...(hasAuthoringScope
          ? {
              authoringScope: validatedAuthoringScope && validatedAuthoringScope.ok
                ? validatedAuthoringScope.scope
                : authoringScope,
            }
          : {}),
        ...(hasAppliesToChildren ? { appliesToChildren: effectiveAppliesToChildren } : {}),
        ...(hasAutoSuggestedProductLinks ? { autoSuggestedProductLinks } : {}),
        ...(hasSuggestedProductLinkConfidence ? { suggestedProductLinkConfidence } : {}),
        ...(hasSuggestedProductLinkReason ? { suggestedProductLinkReason } : {}),
      };
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({
        data: existingAsset,
        message: "No asset metadata changes provided",
      });
    }

    const { data: updatedAsset, error: updateError } = await (supabase as any)
      .from("dam_assets")
      .update(updatePayload)
      .eq("id", assetId)
      .eq("organization_id", organization.id)
      .select()
      .single();

    if (updateError) {
      console.error("PATCH /assets/[assetId] DB update failed:", updateError);
      return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
    }

    if (hasProductLinks && normalizedProductLinks) {
      try {
        const effectiveAppliesToChildren =
          hasAppliesToChildren && appliesToChildren !== null
            ? appliesToChildren
            : Boolean(existingMetadata.appliesToChildren ?? true);
        const effectiveAutoSuggestedProductLinks =
          hasAutoSuggestedProductLinks && autoSuggestedProductLinks !== null
            ? autoSuggestedProductLinks
            : Boolean(existingMetadata.autoSuggestedProductLinks ?? false);
        const existingSuggestedConfidence = normalizeOptionalConfidence(
          (existingMetadata as any).suggestedProductLinkConfidence
        );
        const effectiveSuggestedConfidence =
          hasSuggestedProductLinkConfidence && suggestedProductLinkConfidence !== undefined
            ? suggestedProductLinkConfidence
            : existingSuggestedConfidence;
        const existingSuggestedReason =
          typeof (existingMetadata as any).suggestedProductLinkReason === "string"
            ? String((existingMetadata as any).suggestedProductLinkReason).trim() || null
            : null;
        const effectiveSuggestedReason =
          hasSuggestedProductLinkReason && suggestedProductLinkReason !== undefined
            ? suggestedProductLinkReason
            : existingSuggestedReason;
        const linkConfidence =
          effectiveAutoSuggestedProductLinks &&
          typeof effectiveSuggestedConfidence === "number"
            ? effectiveSuggestedConfidence
            : 1;
        const linkMatchReason = effectiveAutoSuggestedProductLinks
          ? effectiveSuggestedReason || "Auto-suggested from filename metadata"
          : "Linked from upload metadata";
        const linkType: "auto" | "manual" = effectiveAutoSuggestedProductLinks ? "auto" : "manual";

        const selectedProductIds = await resolveSelectedProductIds({
          organizationId: organization.id,
          selection: normalizedProductLinks,
          appliesToChildren: effectiveAppliesToChildren,
        });
        const assetTypeForLinking =
          String((updatedAsset as any)?.asset_type || (updatedAsset as any)?.file_type || "").trim() || "general";
        await syncUploadProductLinks({
          organizationId: organization.id,
          userId,
          assetId,
          assetType: assetTypeForLinking,
          productIds: selectedProductIds,
          confidence: linkConfidence,
          matchReason: linkMatchReason,
          linkType,
        });
        await refreshAssetProductIdentifiers({
          organizationId: organization.id,
          assetId,
        });
      } catch (productLinkSyncError) {
        console.error("PATCH /assets/[assetId] product link sync failed:", productLinkSyncError);
        return NextResponse.json(
          { error: "Asset metadata saved, but product links failed to sync. Please retry." },
          { status: 500 }
        );
      }
    }

    if (hasAuthoringScope) {
      const scopeSyncResult = await replaceAssetScopeAssignments({
        supabase,
        organizationId: organization.id,
        assetId,
        rawScope:
          validatedAuthoringScope && validatedAuthoringScope.ok
            ? validatedAuthoringScope.scope
            : authoringScope,
        source: "manual",
        userId,
        metadata: { source: "manual" },
      });

      if (!scopeSyncResult.ok) {
        console.error("PATCH /assets/[assetId] scope assignment sync failed:", scopeSyncResult.error);
        return NextResponse.json(
          { error: "Asset metadata saved, but scope assignments failed to sync. Please retry." },
          { status: scopeSyncResult.status >= 400 ? scopeSyncResult.status : 500 }
        );
      }
    }

    return NextResponse.json({
      data: updatedAsset,
      message: "Asset updated successfully",
    });
  } catch (error) {
    console.error("PATCH /assets/[assetId] failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/assets/[assetId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; assetId: string }> }
) {
  try {
    const resolvedParams = await params;
    const tenantSlug = resolvedParams.tenant;
    const assetId = resolvedParams.assetId;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite(tenantSlug, selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const tenantAccess = await requireTenantAccess(request, tenantSlug);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }

    const { organization, userId } = tenantAccess;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canDelete = await requireAssetWritePermission({
      userId,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetVersionManage,
    });
    if (!canDelete) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to delete assets." },
        { status: 403 }
      );
    }

    const { data: existingAsset, error: existingAssetError } = await (supabase as any)
      .from("dam_assets")
      .select("id")
      .eq("id", assetId)
      .eq("organization_id", organization.id)
      .single();

    if (existingAssetError || !existingAsset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const { error: deleteError } = await (supabase as any)
      .from("dam_assets")
      .delete()
      .eq("id", assetId)
      .eq("organization_id", organization.id);

    if (deleteError) {
      console.error("DELETE /assets/[assetId] DB delete failed:", deleteError);
      return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 });
    }

    return NextResponse.json({
      message: "Asset deleted successfully",
    });
  } catch (error) {
    console.error("DELETE /assets/[assetId] failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
