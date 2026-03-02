import { NextRequest, NextResponse } from "next/server";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";
import {
  ASSET_VIEW_PERMISSION_KEYS,
  getScopedPermissionSummary,
  resolvePartnerGrantedAssetIds,
  resolvePartnerSharedBrandOrganizationIds,
  resolveCollectionAssetIds,
  resolveTenantBrandViewContext,
} from "@/lib/partner-brand-view";

const DEFAULT_PERMISSIONS = {
  role: "viewer",
  can_download_assets: true,
  can_edit_products: false,
  can_manage_team: false,
  is_owner: false,
  is_admin: false,
  is_partner: false,
};

function emptyPartnerAssetsResponse(context: {
  mode: "tenant" | "partner_brand";
  selectedBrandSlug: string | null;
  tenantSlug: string;
}) {
  return NextResponse.json({
    data: {
      assets: [],
      folders: [],
      tags: [],
      categories: [],
      permissions: {
        ...DEFAULT_PERMISSIONS,
        role: "partner",
        is_partner: true,
      },
      view: {
        mode: context.mode,
        selectedBrandSlug: context.selectedBrandSlug,
        tenantSlug: context.tenantSlug,
      },
    },
  });
}

function parseIsoDateParam(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseCsvIds(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function filterAssetsByRecency(params: {
  assets: any[];
  createdAfter: Date | null;
  updatedAfter: Date | null;
}) {
  const { assets, createdAfter, updatedAfter } = params;
  return assets.filter((asset) => {
    if (createdAfter) {
      const createdAtValue = new Date(asset.createdAt || asset.created_at || 0);
      if (Number.isNaN(createdAtValue.getTime()) || createdAtValue < createdAfter) {
        return false;
      }
    }

    if (updatedAfter) {
      const updatedValue = new Date(
        asset.currentVersionChangedAt ||
          asset.current_version_changed_at ||
          asset.updatedAt ||
          asset.updated_at ||
          asset.createdAt ||
          asset.created_at ||
          0
      );
      if (Number.isNaN(updatedValue.getTime()) || updatedValue < updatedAfter) {
        return false;
      }
    }

    return true;
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const requestUrl = new URL(request.url);
    const selectedBrandSlug = requestUrl.searchParams.get("brand");
    const requestedViewScope = (requestUrl.searchParams.get("view") || "")
      .trim()
      .toLowerCase();
    const selectedFolderId = requestUrl.searchParams.get("folderId");
    const selectedProductIds = Array.from(
      new Set([
        ...parseCsvIds(requestUrl.searchParams.get("productIds")),
        ...parseCsvIds(requestUrl.searchParams.get("productId")),
      ])
    );
    const createdAfter = parseIsoDateParam(requestUrl.searchParams.get("createdAfter"));
    const updatedAfter = parseIsoDateParam(requestUrl.searchParams.get("updatedAfter"));

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const { context } = contextResult;
    const targetOrganizationId = context.targetOrganization.id;
    const db = new DatabaseQueries(supabaseServer);
    const isPartnerAllViewRequest =
      requestedViewScope === "all" &&
      context.mode === "tenant" &&
      context.tenantOrganization.organizationType === "partner";

    if (isPartnerAllViewRequest) {
      const tenantOrganizationId = context.tenantOrganization.id;
      const brandOrganizationIds = await resolvePartnerSharedBrandOrganizationIds({
        partnerOrganizationId: tenantOrganizationId,
      });

      const grantedByBrand = await Promise.all(
        brandOrganizationIds.map(async (brandOrganizationId) => {
          const granted = await resolvePartnerGrantedAssetIds({
            brandOrganizationId,
            partnerOrganizationId: tenantOrganizationId,
          });
          if (!granted.foundationAvailable || granted.assetIds.length === 0) {
            return null;
          }
          return {
            brandOrganizationId,
            assetIds: new Set(granted.assetIds),
          };
        })
      );

      const brandsWithAssets = grantedByBrand.filter(
        (
          row
        ): row is {
          brandOrganizationId: string;
          assetIds: Set<string>;
        } => Boolean(row)
      );

      const ownAssets = await db.getAssetsByOrganization(tenantOrganizationId, undefined, 5000, 0);
      const sharedAssetsByBrand = await Promise.all(
        brandsWithAssets.map(async ({ brandOrganizationId, assetIds }) => {
          const brandAssets = await db.getAssetsByOrganization(brandOrganizationId, undefined, 5000, 0);
          return brandAssets.filter((asset) => assetIds.has(asset.id));
        })
      );

      const mergedAssetsById = new Map<string, any>();
      for (const asset of ownAssets) {
        mergedAssetsById.set(asset.id, {
          ...asset,
          tenant_owned: true,
        });
      }
      for (const asset of sharedAssetsByBrand.flat()) {
        mergedAssetsById.set(asset.id, {
          ...asset,
          tenant_owned: false,
        });
      }

      let assets = Array.from(mergedAssetsById.values());
      assets.sort(
        (a, b) =>
          new Date(String(b.createdAt || b.created_at || 0)).getTime() -
          new Date(String(a.createdAt || a.created_at || 0)).getTime()
      );

      if (selectedFolderId) {
        if (selectedFolderId === "unfiled") {
          assets = assets.filter((asset) => !asset.folderId && !asset.folder_id);
        } else {
          assets = assets.filter(
            (asset) => (asset.folderId || asset.folder_id) === selectedFolderId
          );
        }
      }

      if (selectedProductIds.length > 0) {
        const scopedOrganizationIds = [tenantOrganizationId, ...brandOrganizationIds];
        const { data: productAssetLinks } = await (supabaseServer as any)
          .from("product_asset_links")
          .select("asset_id")
          .in("organization_id", scopedOrganizationIds)
          .in("product_id", selectedProductIds)
          .eq("is_active", true);

        const linkedAssetIds = new Set<string>(
          ((productAssetLinks || []) as Array<{ asset_id: string | null }>)
            .map((row) => row.asset_id)
            .filter((id): id is string => Boolean(id))
        );

        assets = assets.filter((asset) => linkedAssetIds.has(asset.id));
      }
      assets = filterAssetsByRecency({
        assets,
        createdAfter,
        updatedAfter,
      });

      const [folders, permissions, tagsResult, categoriesResult] = await Promise.all([
        db.getFoldersByOrganization(tenantOrganizationId),
        db.getUserPermissions(context.userId, tenantOrganizationId),
        (supabaseServer as any)
          .from("asset_tags")
          .select("*")
          .eq("organization_id", tenantOrganizationId)
          .order("name", { ascending: true }),
        (supabaseServer as any)
          .from("asset_categories")
          .select("*")
          .eq("organization_id", tenantOrganizationId)
          .order("path", { ascending: true }),
      ]);

      return NextResponse.json({
        data: {
          assets,
          folders,
          tags: tagsResult.data || [],
          categories: categoriesResult.data || [],
          permissions,
          view: {
            mode: context.mode,
            selectedBrandSlug: context.selectedBrandSlug,
            tenantSlug: context.tenantOrganization.slug,
          },
        },
      });
    }

    let allowedAssetIds: Set<string> | null = null;
    let hasOrgAssetScope = true;
    let restrictToSharedAssetScope = false;

    if (context.mode === "partner_brand") {
      const grantedSetAssets = await resolvePartnerGrantedAssetIds({
        brandOrganizationId: targetOrganizationId,
        partnerOrganizationId: context.tenantOrganization.id,
      });

      if (grantedSetAssets.foundationAvailable) {
        hasOrgAssetScope = false;
        allowedAssetIds = new Set(grantedSetAssets.assetIds);

        if (grantedSetAssets.assetIds.length === 0) {
          return emptyPartnerAssetsResponse({
            mode: context.mode,
            selectedBrandSlug: context.selectedBrandSlug,
            tenantSlug: context.tenantOrganization.slug,
          });
        }
      } else {
        if (!context.brandMemberId) {
          return emptyPartnerAssetsResponse({
            mode: context.mode,
            selectedBrandSlug: context.selectedBrandSlug,
            tenantSlug: context.tenantOrganization.slug,
          });
        }

        const scopedPermissions = await getScopedPermissionSummary({
          organizationId: targetOrganizationId,
          memberId: context.brandMemberId,
          permissionKeys: ASSET_VIEW_PERMISSION_KEYS,
        });

        hasOrgAssetScope = scopedPermissions.hasOrganizationScope;
        if (!scopedPermissions.hasOrganizationScope) {
          if (scopedPermissions.collectionIds.length > 0) {
            const collectionAssetIds = await resolveCollectionAssetIds({
              organizationId: targetOrganizationId,
              collectionIds: scopedPermissions.collectionIds,
            });
            allowedAssetIds = new Set(collectionAssetIds);
          } else {
            // Fallback for legacy invite grants that are not collection-scoped.
            restrictToSharedAssetScope = true;
          }
        }

        const hasAnyAssetScope =
          scopedPermissions.hasOrganizationScope ||
          scopedPermissions.collectionIds.length > 0 ||
          scopedPermissions.marketIds.length > 0 ||
          scopedPermissions.channelIds.length > 0;

        if (!hasAnyAssetScope) {
          return emptyPartnerAssetsResponse({
            mode: context.mode,
            selectedBrandSlug: context.selectedBrandSlug,
            tenantSlug: context.tenantOrganization.slug,
          });
        }
      }
    }

    let assets = await db.getAssetsByOrganization(
      targetOrganizationId,
      selectedFolderId || undefined,
      5000,
      0
    );

    if (allowedAssetIds) {
      assets = assets.filter((asset) => allowedAssetIds!.has(asset.id));
    }
    if (restrictToSharedAssetScope) {
      assets = assets.filter((asset) => (asset.assetScope || "").toLowerCase() === "shared");
    }

    if (selectedProductIds.length > 0) {
      const { data: productAssetLinks } = await (supabaseServer as any)
        .from("product_asset_links")
        .select("asset_id")
        .eq("organization_id", targetOrganizationId)
        .in("product_id", selectedProductIds)
        .eq("is_active", true);

      const linkedAssetIds = new Set<string>(
        ((productAssetLinks || []) as Array<{ asset_id: string | null }>)
          .map((row) => row.asset_id)
          .filter((id): id is string => Boolean(id))
      );
      assets = assets.filter((asset) => linkedAssetIds.has(asset.id));
    }
    assets = filterAssetsByRecency({
      assets,
      createdAfter,
      updatedAfter,
    });

    let folders = await db.getFoldersByOrganization(targetOrganizationId);
    if (context.mode === "partner_brand" && !hasOrgAssetScope) {
      const directFolderIds = new Set<string>();
      for (const asset of assets) {
        if (asset.folderId) {
          directFolderIds.add(asset.folderId);
        }
      }

      if (directFolderIds.size > 0) {
        const visibleFolderPaths = new Set<string>();
        for (const folder of folders) {
          if (directFolderIds.has(folder.id)) {
            visibleFolderPaths.add(folder.path);
          }
        }

        folders = folders.filter((folder) => {
          for (const path of visibleFolderPaths) {
            if (folder.path === path || path.startsWith(`${folder.path}/`)) {
              return true;
            }
          }
          return false;
        });
      } else {
        folders = [];
      }
    }

    const [{ data: tags }, { data: categories }] = await Promise.all([
      (supabaseServer as any)
        .from("asset_tags")
        .select("*")
        .eq("organization_id", targetOrganizationId)
        .order("name", { ascending: true }),
      (supabaseServer as any)
        .from("asset_categories")
        .select("*")
        .eq("organization_id", targetOrganizationId)
        .order("path", { ascending: true }),
    ]);

    const permissions =
      context.mode === "partner_brand"
        ? {
            ...DEFAULT_PERMISSIONS,
            role: "partner",
            is_partner: true,
          }
        : await db.getUserPermissions(context.userId, targetOrganizationId);

    return NextResponse.json({
      data: {
        assets,
        folders,
        tags: tags || [],
        categories: categories || [],
        permissions,
        view: {
          mode: context.mode,
          selectedBrandSlug: context.selectedBrandSlug,
          tenantSlug: context.tenantOrganization.slug,
        },
      },
    });
  } catch (error) {
    console.error("GET /assets failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
