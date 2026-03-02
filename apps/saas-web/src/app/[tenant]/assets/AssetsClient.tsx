"use client";

import { useState, useEffect, useMemo, useRef, type ChangeEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Upload,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  FileText,
  ChevronRight,
  MoreHorizontal,
  Grid3X3,
  LayoutGrid,
  List,
  Tag,
  Share2,
  Check,
  X,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@tradetool/ui";
import { AssetViewPanel } from "@/components/dam/asset-view-panel";
import { BulkActionToolbar } from "@/components/dam/bulk-action-toolbar";
import { BulkEditorPanel } from "@/components/dam/bulk-editor-panel";
import { PageHeader } from "@/components/ui/page-header";
import type {
  AssetCategory,
  AssetCategoryAssignment,
  AssetTag,
  AssetTagAssignment,
  DamAsset,
  UserPermissions,
} from "@tradetool/types";
import { extractPartnerScopeFromPath, isReservedPartnerScope } from "@/lib/tenant-view-scope";
import { useMarketContext } from "@/components/market-context";
import { stageAssetUploadFiles } from "@/lib/asset-upload-staging";

function getFileIcon(mimeType?: string) {
  if (!mimeType) return <FileText className="w-5 h-5 text-gray-500" />;
  if (mimeType.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-blue-500" />;
  if (mimeType.startsWith('video/')) return <FileText className="w-5 h-5 text-green-500" />;
  if (mimeType.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
  return <FileText className="w-5 h-5 text-gray-500" />;
}

const isImageAsset = (asset: Pick<DamAsset, "mimeType" | "fileType">) =>
  asset.mimeType?.startsWith('image/') || asset.fileType === 'image';

const getAssetPreviewUrl = (
  asset: Pick<DamAsset, "thumbnailUrls" | "s3Url"> & { previewUrl?: string | null }
) =>
  asset.previewUrl ||
  asset.thumbnailUrls?.medium ||
  asset.thumbnailUrls?.small ||
  asset.s3Url;

interface AssetsClientProps {
  tenantSlug: string;
  selectedBrandSlug?: string | null;
}

type FolderRecord = {
  id: string;
  organizationId: string;
  name: string;
  parentId: string | null;
  path: string;
  createdBy: string;
  createdAt: string;
  children?: FolderRecord[];
};

type AssetRecord = DamAsset & {
  tagAssignments: AssetTagAssignment[];
  categoryAssignments: AssetCategoryAssignment[];
  categories?: string[];
  previewUrl?: string | null;
  preview?: string;
  favorite?: boolean;
  tenantOwned?: boolean;
};

type ProductOption = {
  id: string;
  sku?: string;
  productName?: string;
  brand?: string;
  parentId?: string | null;
  productType?: string | null;
};

type AssetShareSetOption = {
  id: string;
  name: string;
  asset_count: number;
  folder_count: number;
  item_count: number;
};

type ScopeConstraintOption = {
  value: string;
  label: string;
};

const NEW_CONTENT_FILTER_OPTIONS = [
  { value: "all", label: "Any time" },
  { value: "1", label: "New in 24h" },
  { value: "7", label: "New in 7 days" },
  { value: "30", label: "New in 30 days" },
  { value: "since_last_visit", label: "Since last visit" },
] as const;

const UPDATED_FILTER_OPTIONS = [
  { value: "all", label: "Any time" },
  { value: "1", label: "Updated in 24h" },
  { value: "7", label: "Updated in 7 days" },
  { value: "30", label: "Updated in 30 days" },
] as const;

const getAssetTagNames = (asset: AssetRecord): string[] => {
  if (!asset?.tagAssignments) {
    return [];
  }

  return asset.tagAssignments
    .map((assignment) => assignment.tag?.name?.trim())
    .filter((name): name is string => Boolean(name));
};

const mapAssetApiToClient = (asset: any): Partial<AssetRecord> => ({
  id: asset?.id,
  organizationId: asset?.organization_id ?? asset?.organizationId,
  folderId: asset?.folder_id ?? asset?.folderId ?? null,
  filename: asset?.filename ?? asset?.original_filename ?? asset?.originalFilename ?? "Untitled",
  originalFilename:
    asset?.original_filename ?? asset?.originalFilename ?? asset?.filename ?? "Untitled",
  fileType: asset?.file_type ?? asset?.fileType ?? "other",
  assetType: asset?.asset_type ?? asset?.assetType,
  assetScope: asset?.asset_scope ?? asset?.assetScope,
  currentVersionNumber: asset?.current_version_number ?? asset?.currentVersionNumber,
  currentVersionComment: asset?.current_version_comment ?? asset?.currentVersionComment ?? null,
  currentVersionEffectiveFrom:
    asset?.current_version_effective_from ?? asset?.currentVersionEffectiveFrom ?? null,
  currentVersionEffectiveTo:
    asset?.current_version_effective_to ?? asset?.currentVersionEffectiveTo ?? null,
  currentVersionChangedBy:
    asset?.current_version_changed_by ?? asset?.currentVersionChangedBy ?? null,
  currentVersionChangedAt:
    asset?.current_version_changed_at ?? asset?.currentVersionChangedAt ?? null,
  fileSize: Number(asset?.file_size ?? asset?.fileSize ?? 0),
  mimeType: asset?.mime_type ?? asset?.mimeType ?? "",
  filePath: asset?.file_path ?? asset?.filePath,
  s3Key: asset?.s3_key ?? asset?.s3Key ?? "",
  s3Url: asset?.s3_url ?? asset?.s3Url ?? "",
  thumbnailUrls: asset?.thumbnail_urls ?? asset?.thumbnailUrls,
  metadata: asset?.metadata,
  tags: Array.isArray(asset?.tags) ? asset.tags : [],
  description: asset?.description ?? null,
  productIdentifiers:
    asset?.product_identifiers ?? asset?.productIdentifiers ?? [],
  createdBy: asset?.created_by ?? asset?.createdBy ?? "",
  createdAt: asset?.created_at ?? asset?.createdAt ?? new Date().toISOString(),
  updatedAt: asset?.updated_at ?? asset?.updatedAt ?? new Date().toISOString(),
  tenantOwned:
    typeof asset?.tenant_owned === "boolean"
      ? asset.tenant_owned
      : typeof asset?.tenantOwned === "boolean"
        ? asset.tenantOwned
        : undefined,
});

const normalizeAssetRecord = (asset: any): AssetRecord => ({
  ...(mapAssetApiToClient(asset) as AssetRecord),
  tagAssignments: Array.isArray(asset?.tagAssignments) ? asset.tagAssignments : [],
  categoryAssignments: Array.isArray(asset?.categoryAssignments)
    ? asset.categoryAssignments
    : [],
  categories: Array.isArray(asset?.categories) ? asset.categories : [],
  previewUrl: typeof asset?.previewUrl === "string" ? asset.previewUrl : null,
  favorite: Boolean(asset?.favorite),
});

const buildFolderTree = (folderList: FolderRecord[]): FolderRecord[] => {
  const folderMap = new Map<string, FolderRecord>();
  const rootFolders: FolderRecord[] = [];

  folderList.forEach((folder) => {
    folderMap.set(folder.id, { ...folder, children: [] });
  });

  folderList.forEach((folder) => {
    const folderItem = folderMap.get(folder.id)!;
    if (folder.parentId && folderMap.has(folder.parentId)) {
      const parent = folderMap.get(folder.parentId)!;
      parent.children!.push(folderItem);
    } else {
      rootFolders.push(folderItem);
    }
  });

  return rootFolders;
};

type AssetEditorUpdates = {
  filename?: string;
  description?: string | null;
  tagIds?: string[];
  categoryIds?: string[];
  primaryCategoryId?: string | null;
  folderId?: string | null;
};

type BulkUpdatePayload = {
  updateFields: {
    tags?: {
      mode: "replace" | "add" | "remove";
      tagIds: string[];
    };
    description?: {
      mode: "replace" | "append";
      value: string;
    };
  };
};

export default function AssetsClient({ tenantSlug, selectedBrandSlug: selectedBrandSlugProp }: AssetsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    channels,
    locales,
    markets,
    selectedChannelId,
    selectedLocaleId,
    selectedMarketId,
  } = useMarketContext();
  const partnerPathScope = useMemo(
    () => extractPartnerScopeFromPath(pathname, tenantSlug),
    [pathname, tenantSlug]
  );
  const isPartnerAllView = partnerPathScope === "all";
  const selectedBrandSlug = useMemo(() => {
    const fromProp = (selectedBrandSlugProp || "").trim().toLowerCase();
    if (fromProp.length > 0) return fromProp;

    if (partnerPathScope) {
      if (
        !isReservedPartnerScope(partnerPathScope) &&
        partnerPathScope !== tenantSlug.toLowerCase()
      ) {
        return partnerPathScope;
      }
      return "";
    }

    return (searchParams.get("brand") || "").trim().toLowerCase();
  }, [partnerPathScope, searchParams, selectedBrandSlugProp, tenantSlug]);
  const isSharedBrandView =
    selectedBrandSlug.length > 0 && selectedBrandSlug !== tenantSlug.toLowerCase();
  // Always use API preview URLs so thumbnails render consistently regardless of bucket ACL.
  const shouldProxyPreviewUrls = true;

  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [folderTree, setFolderTree] = useState<FolderRecord[]>([]);
  const [availableTags, setAvailableTags] = useState<AssetTag[]>([]);
  const [availableCategories, setAvailableCategories] = useState<AssetCategory[]>([]);
  const [userPermissions, setUserPermissions] = useState<UserPermissions | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // grid, list, visual
  const [isUploadDropActive, setIsUploadDropActive] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [filterTag, setFilterTag] = useState("");
  const [newContentFilter, setNewContentFilter] = useState<string>("all");
  const [updatedContentFilter, setUpdatedContentFilter] = useState<string>("all");
  const [isQuickFiltersCollapsed, setIsQuickFiltersCollapsed] = useState(false);
  const [sortBy, setSortBy] = useState("name"); // name, date, size, type
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [isBulkEditorOpen, setIsBulkEditorOpen] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [showRenameFolder, setShowRenameFolder] = useState(false);
  const [showDeleteFolder, setShowDeleteFolder] = useState(false);
  const [showTransferFolderContents, setShowTransferFolderContents] = useState(false);
  const [activeFolder, setActiveFolder] = useState<FolderRecord | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [transferMode, setTransferMode] = useState<"move" | "copy">("move");
  const [transferDestinationFolderId, setTransferDestinationFolderId] = useState("__unfiled__");
  const [transferAssetCount, setTransferAssetCount] = useState<number | null>(null);
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [isTransferringFolderContents, setIsTransferringFolderContents] = useState(false);
  const [isTransferPreviewLoading, setIsTransferPreviewLoading] = useState(false);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareSetOptions, setShareSetOptions] = useState<AssetShareSetOption[]>([]);
  const [selectedShareSetId, setSelectedShareSetId] = useState("");
  const [isLoadingShareSets, setIsLoadingShareSets] = useState(false);
  const [isSubmittingShare, setIsSubmittingShare] = useState(false);
  const [newShareSetName, setNewShareSetName] = useState("");
  const [isCreatingShareSet, setIsCreatingShareSet] = useState(false);
  const [shareDialogError, setShareDialogError] = useState<string | null>(null);
  const [shareStatusMessage, setShareStatusMessage] = useState<string | null>(null);
  const [shareMarketIds, setShareMarketIds] = useState<string[]>([]);
  const [shareChannelIds, setShareChannelIds] = useState<string[]>([]);
  const [shareLocaleIds, setShareLocaleIds] = useState<string[]>([]);
  const [lastVisitedAt, setLastVisitedAt] = useState<string | null>(null);
  const [replaceTargetAssetId, setReplaceTargetAssetId] = useState<string | null>(null);
  const [isReplacingAsset, setIsReplacingAsset] = useState(false);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadDropDepthRef = useRef(0);
  const folderParam = searchParams.get("folder");
  const productsParam = searchParams.get("products") || searchParams.get("product");
  const newContentParam = searchParams.get("new");
  const updatedContentParam = searchParams.get("updated");

  const buildScopedQuery = () => {
    const queryParams = new URLSearchParams();
    if (isPartnerAllView) {
      queryParams.set("view", "all");
    }
    if (selectedFolderId && selectedFolderId !== "unfiled") {
      queryParams.set("folderId", selectedFolderId);
    }
    if (selectedProductIds.length > 0) {
      queryParams.set("productIds", selectedProductIds.join(","));
    }
    if (selectedBrandSlug) {
      queryParams.set("brand", selectedBrandSlug);
    }

    if (newContentFilter === "since_last_visit") {
      if (lastVisitedAt) {
        queryParams.set("createdAfter", lastVisitedAt);
      }
    } else if (newContentFilter !== "all") {
      const days = Number(newContentFilter);
      if (!Number.isNaN(days) && days > 0) {
        const createdAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        queryParams.set("createdAfter", createdAfter);
      }
    }

    if (updatedContentFilter !== "all") {
      const days = Number(updatedContentFilter);
      if (!Number.isNaN(days) && days > 0) {
        const updatedAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        queryParams.set("updatedAfter", updatedAfter);
      }
    }

    return queryParams.toString();
  };

  const buildAssetPreviewProxyUrl = (assetId: string, versionToken?: string | null) => {
    const queryParams = new URLSearchParams();
    if (isPartnerAllView) {
      queryParams.set("view", "all");
    }
    if (selectedBrandSlug) {
      queryParams.set("brand", selectedBrandSlug);
    }
    if (versionToken && versionToken.trim().length > 0) {
      queryParams.set("v", versionToken.trim());
    }
    const queryString = queryParams.toString();
    return `/api/${tenantSlug}/assets/${assetId}/preview${queryString ? `?${queryString}` : ""}`;
  };

  const withPreviewUrls = (assetList: AssetRecord[]): AssetRecord[] =>
    assetList.map((asset) => ({
      ...asset,
      previewUrl: buildAssetPreviewProxyUrl(
        asset.id,
        asset.currentVersionChangedAt || asset.updatedAt || null
      ),
    }));

  useEffect(() => {
    if (!folderParam) {
      setSelectedFolderId(null);
      return;
    }
    setSelectedFolderId(folderParam);
  }, [folderParam]);

  useEffect(() => {
    if (!productsParam) {
      setSelectedProductIds([]);
      return;
    }
    const parsedIds = productsParam
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    setSelectedProductIds(parsedIds);
  }, [productsParam]);

  useEffect(() => {
    if (!newContentParam) {
      setNewContentFilter("all");
      return;
    }
    setNewContentFilter(newContentParam);
  }, [newContentParam]);

  useEffect(() => {
    if (!updatedContentParam) {
      setUpdatedContentFilter("all");
      return;
    }
    setUpdatedContentFilter(updatedContentParam);
  }, [updatedContentParam]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const lastVisitedKey = `assets:lastVisited:${tenantSlug}:${selectedBrandSlug || "self"}`;
    const previous = window.localStorage.getItem(lastVisitedKey);
    setLastVisitedAt(previous || null);
  }, [selectedBrandSlug, tenantSlug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const lastVisitedKey = `assets:lastVisited:${tenantSlug}:${selectedBrandSlug || "self"}`;
    const persistVisit = () => {
      window.localStorage.setItem(lastVisitedKey, new Date().toISOString());
    };

    window.addEventListener("beforeunload", persistVisit);
    return () => {
      persistVisit();
      window.removeEventListener("beforeunload", persistVisit);
    };
  }, [selectedBrandSlug, tenantSlug]);

  // Fetch real assets and folders
  useEffect(() => {
    const controller = new AbortController();

    const fetchAssetsData = async () => {
      try {
        setLoading(true);
        console.log('📥 Fetching assets data for tenant:', tenantSlug);

        const queryString = buildScopedQuery();
        const response = await fetch(`/api/${tenantSlug}/assets${queryString ? `?${queryString}` : ""}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch assets: ${response.status}`);
        }

        const { data } = await response.json();
        console.log('📥 Assets data received:', data);

        setAssets(
          withPreviewUrls(((data.assets || []) as any[]).map((asset) => normalizeAssetRecord(asset)))
        );
        const folderList = (data.folders || []) as FolderRecord[];
        setFolders(folderList);
        setFolderTree(buildFolderTree(folderList));
        setAvailableTags((data.tags || []) as AssetTag[]);
        setAvailableCategories((data.categories || []) as AssetCategory[]);
        setUserPermissions((data.permissions || null) as UserPermissions | null);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") {
          return;
        }
        console.error('Failed to fetch assets data:', error);
        // Fallback to empty arrays on error
        setAssets([]);
        setFolders([]);
        setFolderTree([]);
        setAvailableTags([]);
        setAvailableCategories([]);
        setUserPermissions(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    if (tenantSlug) {
      fetchAssetsData();
    }
    return () => controller.abort();
  }, [
    tenantSlug,
    selectedFolderId,
    selectedProductIds,
    selectedBrandSlug,
    newContentFilter,
    updatedContentFilter,
    lastVisitedAt,
  ]);

  // Refresh assets function
  const refreshAssets = async () => {
    try {
      console.log('🔄 Refreshing assets...');
      const queryString = buildScopedQuery();
      const response = await fetch(`/api/${tenantSlug}/assets${queryString ? `?${queryString}` : ""}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch assets: ${response.status}`);
      }

      const { data } = await response.json();
      setAssets(
        withPreviewUrls(((data.assets || []) as any[]).map((asset) => normalizeAssetRecord(asset)))
      );
      const folderList = (data.folders || []) as FolderRecord[];
      setFolders(folderList);
      setFolderTree(buildFolderTree(folderList));
      setAvailableTags((data.tags || []) as AssetTag[]);
      setAvailableCategories((data.categories || []) as AssetCategory[]);
      setUserPermissions((data.permissions || null) as UserPermissions | null);
      console.log('✅ Assets refreshed');
    } catch (error) {
      console.error('Failed to refresh assets:', error);
    }
  };

  useEffect(() => {
    if (!tenantSlug) return;
    if (isPartnerAllView) {
      setProductOptions([]);
      return;
    }
    const controller = new AbortController();

    const fetchProductOptions = async () => {
      try {
        const queryString = selectedBrandSlug
          ? `?brand=${encodeURIComponent(selectedBrandSlug)}`
          : "";
        const response = await fetch(`/api/${tenantSlug}/products/basic${queryString}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          // Product filters are optional; fail closed without surfacing hard errors.
          setProductOptions([]);
          return;
        }
        const payload = await response.json();
        setProductOptions((payload?.data || []) as ProductOption[]);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") {
          return;
        }
        console.warn("Product options unavailable for asset filter.");
        setProductOptions([]);
      }
    };

    fetchProductOptions();
    return () => controller.abort();
  }, [isPartnerAllView, tenantSlug, selectedBrandSlug]);

  const storageUsed = 1024 * 1024 * 500; // 500MB
  const storageLimit = 5368709120; // 5GB

  const filteredAssets = assets
    .filter(asset => {
      const tagNames = getAssetTagNames(asset);
      const normalizedSearch = searchQuery.toLowerCase();
      const productIdentifiers = asset.productIdentifiers || [];
      const matchesSearch = asset.originalFilename.toLowerCase().includes(normalizedSearch) ||
        (asset.description || "").toLowerCase().includes(normalizedSearch) ||
        productIdentifiers.some((identifier) => identifier.toLowerCase().includes(normalizedSearch)) ||
        tagNames.some((tag: string) => tag.toLowerCase().includes(normalizedSearch));
      const matchesFilter = !filterTag || tagNames.includes(filterTag);
      const matchesFolder =
        !selectedFolderId ||
        (selectedFolderId === "unfiled" ? !asset.folderId : asset.folderId === selectedFolderId);
      return matchesSearch && matchesFilter && matchesFolder;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.originalFilename.localeCompare(b.originalFilename);
        case "date":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "size":
          return b.fileSize - a.fileSize;
        case "type":
          return a.fileType.localeCompare(b.fileType);
        default:
          return 0;
      }
    });

  useEffect(() => {
    if ((newContentFilter !== "all" || updatedContentFilter !== "all") && sortBy === "name") {
      setSortBy("date");
    }
  }, [newContentFilter, updatedContentFilter, sortBy]);

  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of productOptions) {
      map.set(
        product.id,
        product.productName?.trim() || product.sku?.trim() || "Unnamed product"
      );
    }
    return map;
  }, [productOptions]);

  const productFilterOptions = useMemo(
    () =>
      productOptions
        .map((product) => {
          const ownName =
            product.productName?.trim() || product.sku?.trim() || "Unnamed product";
          const parentName = product.parentId ? productNameById.get(product.parentId) : null;
          const hierarchyLabel =
            parentName && parentName !== ownName ? `${parentName} > ${ownName}` : ownName;
          const skuSuffix =
            product.sku && !hierarchyLabel.includes(product.sku)
              ? ` (${product.sku})`
              : "";
          return {
            value: product.id,
            label: `${hierarchyLabel}${skuSuffix}`,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    [productNameById, productOptions]
  );

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    assets.forEach((asset) => {
      getAssetTagNames(asset).forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet);
  }, [assets]);

  const folderMap = useMemo(() => {
    return new Map(
      (folders || []).map((folder: FolderRecord) => [
        folder.id,
        folder.path || folder.name || "Uncategorized",
      ])
    );
  }, [folders]);
  const folderLookup = useMemo(
    () => new Map((folders || []).map((folder: FolderRecord) => [folder.id, folder])),
    [folders]
  );
  const selectedFolder = useMemo(() => {
    if (!selectedFolderId || selectedFolderId === "unfiled") {
      return null;
    }
    return folderLookup.get(selectedFolderId) || null;
  }, [folderLookup, selectedFolderId]);
  const folderBreadcrumb = useMemo(() => {
    if (!selectedFolder) return [];
    const chain: FolderRecord[] = [];
    const visited = new Set<string>();
    let current: FolderRecord | null = selectedFolder;

    while (current && !visited.has(current.id)) {
      chain.unshift(current);
      visited.add(current.id);
      current = current.parentId ? folderLookup.get(current.parentId) || null : null;
    }

    return chain;
  }, [folderLookup, selectedFolder]);
  const childFoldersForMainNav = useMemo(() => {
    if (selectedFolderId === "unfiled") return [];
    const parentId = selectedFolderId || null;
    return (folders || [])
      .filter((folder) => folder.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, selectedFolderId]);
  const activeQuickFilterCount =
    (selectedProductIds.length > 0 ? 1 : 0) +
    (filterTag ? 1 : 0) +
    (newContentFilter !== "all" ? 1 : 0) +
    (updatedContentFilter !== "all" ? 1 : 0) +
    (sortBy !== "name" ? 1 : 0);

  useEffect(() => {
    if (!selectedFolderId || selectedFolderId === "unfiled") return;

    const ancestorIds: string[] = [];
    const visited = new Set<string>();
    let current = folderLookup.get(selectedFolderId) || null;

    while (current?.parentId && !visited.has(current.parentId)) {
      ancestorIds.push(current.parentId);
      visited.add(current.parentId);
      current = folderLookup.get(current.parentId) || null;
    }

    if (ancestorIds.length === 0) return;

    setExpandedFolders((prev) => {
      const next = new Set(prev);
      let changed = false;
      ancestorIds.forEach((id) => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [folderLookup, selectedFolderId]);

  const setAssetsSearchParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`/${tenantSlug}/assets${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const handleSelectFolder = (folderId: string | null) => {
    setAssetsSearchParam("folder", folderId);
  };
  const handleSelectProducts = (productIds: string[]) => {
    setSelectedProductIds(productIds);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("product");
    if (productIds.length === 0) {
      params.delete("products");
    } else {
      params.set("products", productIds.join(","));
    }
    router.replace(`/${tenantSlug}/assets${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const handleSelectNewContentFilter = (value: string) => {
    if (value === "since_last_visit" && !lastVisitedAt) {
      return;
    }
    setNewContentFilter(value);
    setAssetsSearchParam("new", value === "all" ? null : value);
  };

  const handleSelectUpdatedContentFilter = (value: string) => {
    setUpdatedContentFilter(value);
    setAssetsSearchParam("updated", value === "all" ? null : value);
  };

  const toggleFolderExpansion = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const openCreateFolder = (parentId: string | null = null) => {
    setNewFolderParentId(parentId);
    setNewFolderName("");
    setShowCreateFolder(true);
  };

  const openRenameFolder = (folder: FolderRecord) => {
    setActiveFolder(folder);
    setRenameFolderName(folder.name);
    setShowRenameFolder(true);
  };

  const openDeleteFolder = (folder: FolderRecord) => {
    setActiveFolder(folder);
    setShowDeleteFolder(true);
  };

  const openTransferFolderContents = (folder: FolderRecord, mode: "move" | "copy") => {
    setActiveFolder(folder);
    setTransferMode(mode);
    setTransferDestinationFolderId("__unfiled__");
    setTransferAssetCount(null);
    setShowTransferFolderContents(true);
    void fetchTransferPreview(folder.id, mode);
  };

  const fetchTransferPreview = async (sourceFolderId: string, mode: "move" | "copy") => {
    setIsTransferPreviewLoading(true);
    try {
      const response = await fetch(`/api/organizations/${tenantSlug}/assets/folders/${sourceFolderId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: mode === "move" ? "move_contents" : "copy_contents",
          preview: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to load transfer preview: ${response.status}`);
      }

      const result = await response.json();
      setTransferAssetCount(Number(result?.count ?? 0));
    } catch (error) {
      console.error("Failed to fetch transfer preview:", error);
      setTransferAssetCount(null);
    } finally {
      setIsTransferPreviewLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setIsCreatingFolder(true);

    try {
      const response = await fetch(`/api/organizations/${tenantSlug}/assets/folders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: newFolderParentId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create folder: ${response.status}`);
      }

      setShowCreateFolder(false);
      setNewFolderName("");
      setNewFolderParentId(null);
      await refreshAssets();
    } catch (error) {
      console.error("Failed to create folder:", error);
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleRenameFolder = async () => {
    if (!activeFolder || !renameFolderName.trim()) return;
    setIsRenamingFolder(true);

    try {
      const response = await fetch(`/api/organizations/${tenantSlug}/assets/folders/${activeFolder.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: renameFolderName.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to rename folder: ${response.status}`);
      }

      setShowRenameFolder(false);
      setActiveFolder(null);
      setRenameFolderName("");
      await refreshAssets();
    } catch (error) {
      console.error("Failed to rename folder:", error);
    } finally {
      setIsRenamingFolder(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!activeFolder) return;
    setIsDeletingFolder(true);

    try {
      const response = await fetch(`/api/organizations/${tenantSlug}/assets/folders/${activeFolder.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`Failed to delete folder: ${response.status}`);
      }

      if (selectedFolderId === activeFolder.id) {
        handleSelectFolder(null);
      }
      setSelectedFolderIds((prev) => {
        const next = new Set(prev);
        next.delete(activeFolder.id);
        return next;
      });

      setShowDeleteFolder(false);
      setActiveFolder(null);
      await refreshAssets();
    } catch (error) {
      console.error("Failed to delete folder:", error);
    } finally {
      setIsDeletingFolder(false);
    }
  };

  const handleTransferFolderContents = async () => {
    if (!activeFolder) return;
    const countLabel = transferAssetCount ?? "all";
    const confirmed = confirm(
      `This will ${transferMode} ${countLabel} asset${transferAssetCount === 1 ? "" : "s"} from "${activeFolder.name}". Continue?`
    );
    if (!confirmed) return;

    setIsTransferringFolderContents(true);

    try {
      const response = await fetch(`/api/organizations/${tenantSlug}/assets/folders/${activeFolder.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: transferMode === "move" ? "move_contents" : "copy_contents",
          destinationFolderId:
            transferDestinationFolderId === "__unfiled__" ? null : transferDestinationFolderId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${transferMode} folder contents: ${response.status}`);
      }

      setShowTransferFolderContents(false);
      setActiveFolder(null);
      await refreshAssets();
    } catch (error) {
      console.error(`Failed to ${transferMode} folder contents:`, error);
    } finally {
      setIsTransferringFolderContents(false);
    }
  };

  const renderFolderTree = (folderNodes: FolderRecord[]) => {
    return folderNodes.map((folder) => {
      const isExpanded = expandedFolders.has(folder.id);
      const isSelected = selectedFolderId === folder.id;
      const isFolderChecked = selectedFolderIds.has(folder.id);
      const hasChildren = Boolean(folder.children && folder.children.length > 0);

      return (
        <div key={folder.id} className="space-y-1">
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
                  isSelected
                    ? "bg-primary/10 text-primary"
                    : isFolderChecked
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                {canManageLibrary ? (
                  <button
                    onClick={(event) => toggleFolderSelection(folder.id, event)}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                      isFolderChecked
                        ? "border-blue-500 bg-blue-600 text-white"
                        : "border-border bg-background hover:border-blue-400"
                    }`}
                    aria-label={isFolderChecked ? "Deselect folder" : "Select folder"}
                  >
                    {isFolderChecked ? <Check className="h-2.5 w-2.5" /> : null}
                  </button>
                ) : null}
                {hasChildren ? (
                  <button
                    onClick={() => toggleFolderExpansion(folder.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                  >
                    {isExpanded ? <ChevronRight className="h-4 w-4 rotate-90" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                ) : (
                  <span className="h-6 w-6 shrink-0" />
                )}
                <button
                  onClick={() => handleSelectFolder(folder.id)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  {isExpanded ? (
                    <FolderOpen className="h-4 w-4 text-primary" />
                  ) : (
                    <Folder className="h-4 w-4 text-primary" />
                  )}
                  <span className="truncate">{folder.name}</span>
                </button>
                {canManageLibrary ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-muted rounded-md p-1 text-muted-foreground"
                        aria-label={`Folder actions for ${folder.name}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-44">
                      <DropdownMenuItem onSelect={() => openCreateFolder(folder.id)}>
                        New subfolder
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => openTransferFolderContents(folder, "move")}>
                        Move
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => openTransferFolderContents(folder, "copy")}>
                        Copy
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => openRenameFolder(folder)}>
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => openDeleteFolder(folder)} className="text-destructive">
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </ContextMenuTrigger>
            {canManageLibrary ? (
              <ContextMenuContent className="w-48">
                <ContextMenuItem onSelect={() => openCreateFolder(folder.id)}>
                  New subfolder
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => openTransferFolderContents(folder, "move")}>
                  Move
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => openTransferFolderContents(folder, "copy")}>
                  Copy
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => openRenameFolder(folder)}>
                  Rename
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => openDeleteFolder(folder)} className="text-destructive">
                  Delete
                </ContextMenuItem>
              </ContextMenuContent>
            ) : null}
          </ContextMenu>
          {hasChildren && isExpanded && (
            <div className="ml-7 space-y-1">
              {renderFolderTree(folder.children || [])}
            </div>
          )}
        </div>
      );
    });
  };

  // Handle navigation to upload page
  const handleNavigateToUpload = () => {
    if (isSharedBrandView) {
      return;
    }
    const uploadParams = new URLSearchParams();
    if (selectedFolderId && selectedFolderId !== "unfiled") {
      uploadParams.set("folderId", selectedFolderId);
    } else if (selectedFolderId === "unfiled") {
      uploadParams.set("folderId", "none");
    }
    router.push(
      `/${tenantSlug}/assets/upload${uploadParams.toString() ? `?${uploadParams.toString()}` : ""}`
    );
  };

  const isFileDragEvent = (event: React.DragEvent) =>
    Array.from(event.dataTransfer?.types || []).includes("Files");

  const handleUploadDropEnter = (event: React.DragEvent) => {
    if (isSharedBrandView || !canManageLibrary || !isFileDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    uploadDropDepthRef.current += 1;
    setIsUploadDropActive(true);
  };

  const handleUploadDropOver = (event: React.DragEvent) => {
    if (isSharedBrandView || !canManageLibrary || !isFileDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    if (!isUploadDropActive) {
      setIsUploadDropActive(true);
    }
  };

  const handleUploadDropLeave = (event: React.DragEvent) => {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    uploadDropDepthRef.current = Math.max(0, uploadDropDepthRef.current - 1);
    if (uploadDropDepthRef.current === 0) {
      setIsUploadDropActive(false);
    }
  };

  const handleUploadDrop = (event: React.DragEvent) => {
    if (isSharedBrandView || !canManageLibrary || !isFileDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    uploadDropDepthRef.current = 0;
    setIsUploadDropActive(false);

    const files = Array.from(event.dataTransfer.files || []).filter(
      (file) => file instanceof File
    );
    if (files.length === 0) return;

    const uploadToken = stageAssetUploadFiles(files);
    if (!uploadToken) return;

    const uploadParams = new URLSearchParams();
    uploadParams.set("uploadToken", uploadToken);
    if (selectedFolderId && selectedFolderId !== "unfiled") {
      uploadParams.set("folderId", selectedFolderId);
    } else {
      uploadParams.set("folderId", "none");
    }

    router.push(`/${tenantSlug}/assets/upload?${uploadParams.toString()}`);
  };

  const canEditAssets = !isSharedBrandView && Boolean(userPermissions?.can_edit_products);
  const canManageLibrary = canEditAssets;
  const isAssetOwnedByTenant = (asset: AssetRecord | null | undefined) => {
    if (!asset) return false;
    if (typeof asset.tenantOwned === "boolean") {
      return asset.tenantOwned;
    }
    return !isSharedBrandView;
  };
  const canMutateAsset = (asset: AssetRecord | null | undefined) =>
    canEditAssets && isAssetOwnedByTenant(asset);
  const selectableAssetIds = new Set(
    filteredAssets.filter((asset) => canMutateAsset(asset)).map((asset) => asset.id)
  );
  const selectedAssetCount = selectedAssetIds.size;
  const selectedFolderCount = selectedFolderIds.size;
  const totalSelectedShareItems = selectedAssetCount + selectedFolderCount;

  const toggleFolderSelection = (folderId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    setShareStatusMessage(null);
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const selectionSummaryLabel = useMemo(() => {
    const parts: string[] = [];
    if (selectedAssetCount > 0) {
      parts.push(`${selectedAssetCount} file${selectedAssetCount === 1 ? "" : "s"}`);
    }
    if (selectedFolderCount > 0) {
      parts.push(`${selectedFolderCount} folder${selectedFolderCount === 1 ? "" : "s"}`);
    }
    return parts.join(", ");
  }, [selectedAssetCount, selectedFolderCount]);

  const shareMarketOptions = useMemo<ScopeConstraintOption[]>(
    () =>
      markets.map((market) => ({
        value: market.id,
        label: `${market.name} (${market.code})`,
      })),
    [markets]
  );

  const shareChannelOptions = useMemo<ScopeConstraintOption[]>(
    () =>
      channels.map((channel) => ({
        value: channel.id,
        label: `${channel.name} (${channel.code})`,
      })),
    [channels]
  );

  const shareLocaleOptions = useMemo<ScopeConstraintOption[]>(
    () =>
      locales.map((locale) => ({
        value: locale.id,
        label: `${locale.name} (${locale.code})`,
      })),
    [locales]
  );

  const applyCurrentScopeToShareSelection = () => {
    setShareMarketIds(selectedMarketId ? [selectedMarketId] : []);
    setShareChannelIds(selectedChannelId ? [selectedChannelId] : []);
    setShareLocaleIds(selectedLocaleId ? [selectedLocaleId] : []);
  };

  const clearShareScopeConstraints = () => {
    setShareMarketIds([]);
    setShareChannelIds([]);
    setShareLocaleIds([]);
  };

  const fetchShareSetOptions = async (): Promise<AssetShareSetOption[]> => {
    setIsLoadingShareSets(true);
    setShareDialogError(null);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/sharing/sets?module=assets&page=1&pageSize=200`
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        data?: { asset_sets?: AssetShareSetOption[] };
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load asset sets");
      }

      const options = payload.data?.asset_sets || [];
      setShareSetOptions(options);
      setSelectedShareSetId((prev) => {
        if (prev && options.some((set) => set.id === prev)) {
          return prev;
        }
        return options[0]?.id || "";
      });
      return options;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load asset sets";
      setShareDialogError(message);
      setShareSetOptions([]);
      setSelectedShareSetId("");
      return [];
    } finally {
      setIsLoadingShareSets(false);
    }
  };

  const openShareDialog = async () => {
    if (isSharedBrandView || totalSelectedShareItems === 0) {
      return;
    }

    setShareStatusMessage(null);
    setShareDialogError(null);
    setNewShareSetName("");
    clearShareScopeConstraints();
    setIsShareDialogOpen(true);

    if (shareSetOptions.length === 0) {
      await fetchShareSetOptions();
    }
  };

  const handleCreateShareSetInline = async () => {
    const name = newShareSetName.trim();
    if (!name) {
      setShareDialogError("Enter a set name.");
      return;
    }

    setIsCreatingShareSet(true);
    setShareDialogError(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/sharing/sets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          module: "assets",
          name,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        data?: { id?: string; name?: string };
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to create set.");
      }

      const createdId = payload.data?.id || "";
      const createdName = payload.data?.name || name;
      if (createdId) {
        setShareSetOptions((prev) => {
          if (prev.some((set) => set.id === createdId)) {
            return prev;
          }
          return [
            {
              id: createdId,
              name: createdName,
              asset_count: 0,
              folder_count: 0,
              item_count: 0,
            },
            ...prev,
          ];
        });
        setSelectedShareSetId(createdId);
      }

      setNewShareSetName("");
      await fetchShareSetOptions();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create set.";
      setShareDialogError(message);
    } finally {
      setIsCreatingShareSet(false);
    }
  };

  const handleViewAsset = (asset: AssetRecord) => {
    console.log('dY"c Opening asset panel for:', asset.id);
    setSelectedAsset({
      ...asset,
      preview: getAssetPreviewUrl(asset),
    });
    setIsViewOpen(true);
  };

  const selectedAssetIndex = selectedAsset
    ? filteredAssets.findIndex((asset) => asset.id === selectedAsset.id)
    : -1;

  const canViewPrevious = selectedAssetIndex > 0;
  const canViewNext =
    selectedAssetIndex >= 0 && selectedAssetIndex < filteredAssets.length - 1;

  const handleViewPreviousAsset = () => {
    if (!canViewPrevious) return;
    const previousAsset = filteredAssets[selectedAssetIndex - 1];
    if (!previousAsset) return;
    handleViewAsset(previousAsset);
  };

  const handleViewNextAsset = () => {
    if (!canViewNext) return;
    const nextAsset = filteredAssets[selectedAssetIndex + 1];
    if (!nextAsset) return;
    handleViewAsset(nextAsset);
  };

  const handleCloseView = () => {
    setIsViewOpen(false);
    setSelectedAsset(null);
  };

  const handleCreateTag = async (name: string): Promise<AssetTag> => {
    const response = await fetch(`/api/organizations/${tenantSlug}/assets/tags`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      throw new Error('Failed to create tag');
    }

    const tag = (await response.json()) as AssetTag;
    setAvailableTags((prev) => [...prev, tag]);
    return tag;
  };

  const handleSaveAsset = async (updates: AssetEditorUpdates) => {
    if (!selectedAsset) return;
    if (!canMutateAsset(selectedAsset)) return;

    try {
      console.log('🔵 Saving asset updates:', updates);

      const response = await fetch(`/api/${tenantSlug}/assets/${selectedAsset.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update asset: ${response.status}`);
      }

      const { data } = await response.json();
      console.log('🟢 Asset updated successfully:', data);

      setAssets(prevAssets =>
        prevAssets.map(asset =>
          asset.id === data.id
            ? { ...asset, ...data }
            : asset
        )
      );

      setSelectedAsset((prev) => {
        const merged = {
          ...(prev || {}),
          ...(data as AssetRecord),
        } as AssetRecord;

        return {
          ...merged,
          preview: getAssetPreviewUrl(merged),
        };
      });
    } catch (error) {
      console.error('Failed to save asset:', error);
      throw error;
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!assetId) return;
    const targetAsset = assets.find((asset) => asset.id === assetId);
    if (!canMutateAsset(targetAsset)) return;

    try {
      const response = await fetch(`/api/${tenantSlug}/assets/${assetId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete asset: ${response.status}`);
      }

      setAssets((prevAssets) => prevAssets.filter((asset) => asset.id !== assetId));
      setSelectedAssetIds((prev) => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
      setIsViewOpen(false);
      setSelectedAsset(null);

      await refreshAssets();
    } catch (error) {
      console.error('Failed to delete asset:', error);
      throw error;
    }
  };

  const handleVersionCreated = async (updatedAsset: Record<string, any>) => {
    if (!updatedAsset?.id) {
      await refreshAssets();
      return;
    }

    const normalized = mapAssetApiToClient(updatedAsset);
    const assetId = String(normalized.id || updatedAsset.id);

    setAssets((prevAssets) =>
      prevAssets.map((asset) => {
        if (asset.id !== assetId) return asset;
        const merged = { ...asset, ...normalized } as AssetRecord;
        if (shouldProxyPreviewUrls) {
          merged.previewUrl = buildAssetPreviewProxyUrl(
            assetId,
            (merged.currentVersionChangedAt || merged.updatedAt || null) as string | null
          );
        }
        return merged;
      })
    );

    setSelectedAsset((prev) => {
      if (!prev || prev.id !== assetId) return prev;
      const merged = { ...prev, ...normalized } as AssetRecord;
      return {
        ...merged,
        preview: getAssetPreviewUrl(merged),
      };
    });
  };

  // Multi-select functionality
  const handleAssetSelect = (assetId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    setShareStatusMessage(null);
    const targetAsset = filteredAssets.find((asset) => asset.id === assetId);
    if (!targetAsset || !selectableAssetIds.has(assetId)) return;

    if (event?.shiftKey && selectedAssetIds.size > 0) {
      // Range selection with Shift+click
      const assetIds = filteredAssets
        .filter((asset) => selectableAssetIds.has(asset.id))
        .map((asset) => asset.id);
      const lastSelectedIndex = assetIds.findIndex(id => selectedAssetIds.has(id));
      const currentIndex = assetIds.indexOf(assetId);

      if (lastSelectedIndex !== -1) {
        const start = Math.min(lastSelectedIndex, currentIndex);
        const end = Math.max(lastSelectedIndex, currentIndex);
        const rangeIds = assetIds.slice(start, end + 1);

        setSelectedAssetIds(prev => {
          const newSet = new Set(prev);
          rangeIds.forEach(id => newSet.add(id));
          return newSet;
        });
        return;
      }
    }

    setSelectedAssetIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const selectableIds = filteredAssets
      .filter((asset) => selectableAssetIds.has(asset.id))
      .map((asset) => asset.id);
    setShareStatusMessage(null);
    const isAllSelectableSelected =
      selectableIds.length > 0 && selectableIds.every((id) => selectedAssetIds.has(id));
    if (isAllSelectableSelected) {
      // Deselect all
      setSelectedAssetIds(new Set());
    } else {
      // Select all filtered assets
      setSelectedAssetIds(new Set(selectableIds));
    }
  };

  const handleClearSelection = () => {
    setSelectedAssetIds(new Set());
    setSelectedFolderIds(new Set());
    setIsBulkMode(false);
    setIsBulkEditorOpen(false);
  };

  // Bulk action handlers
  const handleBulkEdit = () => {
    console.log('🔵 Opening bulk editor for assets:', selectedAssetIds);
    setIsBulkEditorOpen(true);
  };

  const handleBulkTag = () => {
    // Quick tag mode - open bulk editor with tags pre-selected
    setIsBulkEditorOpen(true);
  };

  const handleBulkMove = () => {
    console.log('🔵 Bulk move not implemented yet');
    // TODO: Implement folder selection modal
  };

  const handleBulkDelete = async () => {
    const deletableAssetIds = Array.from(selectedAssetIds).filter((assetId) => {
      const asset = assets.find((row) => row.id === assetId);
      return canMutateAsset(asset);
    });
    if (deletableAssetIds.length === 0) return;
    const confirmed = confirm(
      `Delete ${deletableAssetIds.length} assets? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await Promise.all(
        deletableAssetIds.map(async (assetId) => {
          const response = await fetch(`/api/${tenantSlug}/assets/${assetId}`, {
            method: 'DELETE',
          });
          if (!response.ok) {
            throw new Error(`Failed to delete asset ${assetId}: ${response.status}`);
          }
        })
      );

      setAssets((prevAssets) =>
        prevAssets.filter((asset) => !deletableAssetIds.includes(asset.id))
      );
      setSelectedAssetIds(new Set());
      setIsBulkMode(false);
      setIsBulkEditorOpen(false);

      if (selectedAsset && deletableAssetIds.includes(selectedAsset.id)) {
        setIsViewOpen(false);
        setSelectedAsset(null);
      }

      await refreshAssets();
    } catch (error) {
      console.error('Failed to bulk delete assets:', error);
      throw error;
    }
  };

  const handleBulkShare = () => {
    void openShareDialog();
  };

  const handleAddAssetToSet = (assetId: string) => {
    const asset = assets.find((row) => row.id === assetId);
    if (!canMutateAsset(asset)) return;
    setSelectedAssetIds(new Set([assetId]));
    setSelectedFolderIds(new Set());
    void openShareDialog();
  };

  const handleCopyAssetUrl = async (asset: AssetRecord) => {
    const url = getAssetPreviewUrl(asset) || asset.s3Url;
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setShareStatusMessage(`Copied URL for "${asset.originalFilename}".`);
    } catch (error) {
      console.error("Failed to copy asset URL:", error);
    }
  };

  const handleDownloadAsset = (asset: AssetRecord) => {
    const url = asset.s3Url || getAssetPreviewUrl(asset);
    if (!url) return;

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.download = asset.originalFilename || asset.filename || "asset";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenContainingFolder = (asset: AssetRecord) => {
    handleSelectFolder(asset.folderId || "unfiled");
  };

  const handleQuickRename = (asset: AssetRecord) => {
    if (!canMutateAsset(asset)) return;
    handleViewAsset(asset);
    setShareStatusMessage("Open asset details to rename.");
  };

  const handleQuickReplace = (assetId: string) => {
    const asset = assets.find((row) => row.id === assetId);
    if (!canMutateAsset(asset) || isReplacingAsset) return;
    setReplaceTargetAssetId(assetId);
    replaceFileInputRef.current?.click();
  };

  const handleReplaceFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const assetId = replaceTargetAssetId;
    event.target.value = "";
    if (!file || !assetId) return;

    setIsReplacingAsset(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const query = new URLSearchParams();
      if (selectedBrandSlug) {
        query.set("brand", selectedBrandSlug);
      }

      const response = await fetch(
        `/api/${tenantSlug}/assets/${assetId}/versions${query.toString() ? `?${query.toString()}` : ""}`,
        {
          method: "POST",
          body: formData,
        }
      );

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        data?: Record<string, any>;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to replace asset");
      }

      if (payload.data) {
        await handleVersionCreated(payload.data);
      } else {
        await refreshAssets();
      }
      setShareStatusMessage("Asset replaced successfully.");
    } catch (error) {
      console.error("Failed to replace asset:", error);
      setShareStatusMessage(
        error instanceof Error ? error.message : "Failed to replace asset."
      );
    } finally {
      setReplaceTargetAssetId(null);
      setIsReplacingAsset(false);
    }
  };

  const handleConfirmShareSelection = async () => {
    if (!selectedShareSetId) {
      setShareDialogError("Select a set first.");
      return;
    }
    if (totalSelectedShareItems === 0) {
      setShareDialogError("Select at least one file or folder to share.");
      return;
    }

    setIsSubmittingShare(true);
    setShareDialogError(null);

    try {
      const itemPayload = [
        ...Array.from(selectedAssetIds).map((resourceId) => ({
          resourceType: "asset",
          resourceId,
          marketIds: shareMarketIds,
          channelIds: shareChannelIds,
          localeIds: shareLocaleIds,
        })),
        ...Array.from(selectedFolderIds).map((resourceId) => ({
          resourceType: "folder",
          resourceId,
          includeDescendants: true,
          marketIds: shareMarketIds,
          channelIds: shareChannelIds,
          localeIds: shareLocaleIds,
        })),
      ];

      const response = await fetch(
        `/api/${tenantSlug}/sharing/sets/${selectedShareSetId}/items`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: itemPayload,
          }),
        }
      );

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || `Failed to update set (${response.status})`);
      }

      setIsShareDialogOpen(false);
      setShareStatusMessage(
        `Added ${selectionSummaryLabel} to the selected set.`
      );
      handleClearSelection();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update set.";
      setShareDialogError(message);
    } finally {
      setIsSubmittingShare(false);
    }
  };

  const handleBulkSave = async (updateData: BulkUpdatePayload) => {
    try {
      console.log('🔵 Bulk saving updates:', updateData);

      // TODO: Call bulk update API
      const response = await fetch(`/api/${tenantSlug}/assets/bulk-update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assetIds: Array.from(selectedAssetIds),
          updates: updateData.updateFields
        }),
      });

      if (!response.ok) {
        throw new Error(`Bulk update failed: ${response.status}`);
      }

      const { data } = await response.json();
      console.log('🟢 Bulk update successful:', data);

      // Refresh assets to show updates
      await refreshAssets();

      // Close bulk editor and clear selection
      setIsBulkEditorOpen(false);
      handleClearSelection();
    } catch (error) {
      console.error('🔴 Bulk update failed:', error);
      throw error;
    }
  };

  const selectedAssets = assets.filter(
    (asset) => selectedAssetIds.has(asset.id) && canMutateAsset(asset)
  );
  const selectableCount = selectableAssetIds.size;
  const selectedSelectableCount = selectedAssets.length;
  const isAllSelected = selectableCount > 0 && selectedSelectableCount === selectableCount;
  const isPartiallySelected =
    selectedSelectableCount > 0 && selectedSelectableCount < selectableCount;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + A for select all
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && filteredAssets.length > 0) {
        e.preventDefault();
        handleSelectAll();
      }
      // Escape to clear selection
      if (e.key === 'Escape' && totalSelectedShareItems > 0) {
        handleClearSelection();
      }
      // Delete key for bulk delete
      if (
        e.key === 'Delete' &&
        selectedAssetIds.size > 0 &&
        !isViewOpen &&
        !isBulkEditorOpen &&
        !isSharedBrandView
      ) {
        handleBulkDelete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    filteredAssets.length,
    selectedAssetIds.size,
    totalSelectedShareItems,
    isViewOpen,
    isBulkEditorOpen,
    isSharedBrandView,
  ]);

  const getGridClasses = () => {
    switch (viewMode) {
      case "list":
        return "space-y-2";
      case "visual":
        return "columns-2 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6 gap-4 space-y-4";
      default: // grid
        return "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-4";
    }
  };

  const renderAssetActions = (asset: AssetRecord, className = "") => {
    const canMutateSelectedAsset = canMutateAsset(asset);
    return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={className || "rounded-md bg-background/90 p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Asset actions for ${asset.originalFilename}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52">
        <DropdownMenuItem onSelect={() => handleViewAsset(asset)}>
          Open
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleOpenContainingFolder(asset)}>
          Open containing folder
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleDownloadAsset(asset)}>
          Download
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handleCopyAssetUrl(asset)}>
          Copy URL
        </DropdownMenuItem>
        {canMutateSelectedAsset ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => handleAddAssetToSet(asset.id)}>
              Add to Set
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleQuickRename(asset)}>
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleQuickReplace(asset.id)}>
              Replace
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                const confirmed = confirm(`Delete "${asset.originalFilename}"?`);
                if (!confirmed) return;
                void handleDeleteAsset(asset.id);
              }}
              className="text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Assets" />
      {isSharedBrandView ? (
        <div className="mx-6 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Viewing shared assets from <span className="font-medium text-foreground">{selectedBrandSlug}</span>.
          Uploading and editing are disabled in shared view.
        </div>
      ) : isPartnerAllView ? (
        <div className="mx-6 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Viewing your library plus brand-shared assets in one workspace.
          Shared brand assets are read-only.
        </div>
      ) : null}
      <div className="flex gap-4 p-4">
        {/* Folder Sidebar */}
        <aside className="w-64 shrink-0 space-y-4">
          <div className="rounded-xl bg-muted/20 p-4">
            <button
              type="button"
              onClick={() => setIsQuickFiltersCollapsed((prev) => !prev)}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Quick Filters</h3>
                {activeQuickFilterCount > 0 ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {activeQuickFilterCount} active
                  </span>
                ) : null}
              </div>
              <ChevronRight
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  isQuickFiltersCollapsed ? "" : "rotate-90"
                }`}
              />
            </button>
            {!isQuickFiltersCollapsed ? (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                    Product
                  </label>
                  <MultiSelect
                    options={productFilterOptions}
                    value={selectedProductIds}
                    onChange={handleSelectProducts}
                    placeholder="Select one or more products"
                    className="h-9"
                    contentClassName="max-h-72 overflow-y-auto"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                    New content
                  </label>
                  <Select
                    value={newContentFilter}
                    onValueChange={handleSelectNewContentFilter}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Any time" />
                    </SelectTrigger>
                    <SelectContent>
                      {NEW_CONTENT_FILTER_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          disabled={option.value === "since_last_visit" && !lastVisitedAt}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                    Updated
                  </label>
                  <Select
                    value={updatedContentFilter}
                    onValueChange={handleSelectUpdatedContentFilter}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Any time" />
                    </SelectTrigger>
                    <SelectContent>
                      {UPDATED_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                    Tags
                  </label>
                  <Select
                    value={filterTag || "all"}
                    onValueChange={(value) => setFilterTag(value === "all" ? "" : value)}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="All tags" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tags</SelectItem>
                      {allTags.map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          {tag}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                    Sort
                  </label>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Sort by name" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Sort by name</SelectItem>
                      <SelectItem value="date">Sort by date</SelectItem>
                      <SelectItem value="size">Sort by size</SelectItem>
                      <SelectItem value="type">Sort by type</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Library</h3>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => handleSelectFolder(null)}>
                  All
                </Button>
                {canManageLibrary ? (
                  <Button size="icon" variant="ghost" onClick={() => openCreateFolder(null)}>
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <button
                onClick={() => handleSelectFolder(null)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
                  !selectedFolderId ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <Home className="h-4 w-4" />
                All Assets
              </button>
              <button
                onClick={() => handleSelectFolder("unfiled")}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
                  selectedFolderId === "unfiled" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <Folder className="h-4 w-4" />
                Unfiled
              </button>
              <div className="pt-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Folders</div>
                <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                  {folderTree.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center">
                      <p className="text-xs text-muted-foreground mb-2">No folders yet.</p>
                      {canManageLibrary ? (
                        <Button size="sm" variant="outline" onClick={() => openCreateFolder(null)}>
                          Create your first folder
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    renderFolderTree(folderTree)
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div
          className="relative flex-1 space-y-6"
          onDragEnter={handleUploadDropEnter}
          onDragOver={handleUploadDropOver}
          onDragLeave={handleUploadDropLeave}
          onDrop={handleUploadDrop}
        >
          {isUploadDropActive && canManageLibrary && !isSharedBrandView ? (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/10">
              <div className="rounded-lg bg-background/95 px-5 py-4 text-center shadow-sm">
                <p className="text-sm font-semibold text-foreground">Drop files to start upload</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Destination:{" "}
                  {selectedFolderId === "unfiled"
                    ? "Unfiled"
                    : selectedFolder?.path || "All assets"}
                </p>
              </div>
            </div>
          ) : null}
          {/* Enhanced Search Section */}
          <div className="bg-background px-1 py-1">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              {/* Search Bar */}
              <div className="flex-1 max-w-2xl">
                <SearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search by filename, tags, description, or product..."
                  className="max-w-none"
                />
                {searchQuery && (
                  <p className="text-sm text-muted-foreground mt-2 ml-1">
                    {filteredAssets.length} {filteredAssets.length === 1 ? 'result' : 'results'} for "{searchQuery}"
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {!isSharedBrandView ? (
                  <Button onClick={handleNavigateToUpload} className="gap-2">
                    <Upload className="w-4 h-4" />
                    Upload Assets
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-muted/20 px-4 py-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <button
                    onClick={() => handleSelectFolder(null)}
                    className={`rounded px-1.5 py-1 transition-colors ${
                      !selectedFolderId
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    }`}
                  >
                    Folders
                  </button>
                  {canManageLibrary ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        openCreateFolder(
                          selectedFolderId && selectedFolderId !== "unfiled"
                            ? selectedFolderId
                            : null
                        )
                      }
                      aria-label="Create folder"
                      title="Create folder"
                      className="h-7 w-7"
                    >
                      <FolderPlus className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {selectedFolderId === "unfiled" ? (
                    <>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      <span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary">
                        Unfiled
                      </span>
                    </>
                  ) : (
                    folderBreadcrumb.map((folder, index) => {
                      const isLast = index === folderBreadcrumb.length - 1;
                      return (
                        <div key={folder.id} className="flex items-center gap-2">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          {isLast ? (
                            <span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary">
                              {folder.name}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSelectFolder(folder.id)}
                              className="rounded px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                            >
                              {folder.name}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              {selectedFolderId === "unfiled" ? (
                <p className="text-xs text-muted-foreground">
                  Unfiled assets are not inside any folder.
                </p>
              ) : childFoldersForMainNav.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {childFoldersForMainNav.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => handleSelectFolder(folder.id)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                    >
                      <Folder className="h-4 w-4" />
                      <span className="truncate max-w-[180px]">{folder.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No subfolders at this level.
                </p>
              )}
            </div>
          </div>

          {/* Enhanced Toolbar */}
          <div className="bg-background px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  {totalSelectedShareItems > 0 ? (
                    <>
                      <button
                        onClick={handleClearSelection}
                        className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                      >
                        <X className="w-4 h-4" />
                        <span className="font-medium">{selectionSummaryLabel} selected</span>
                      </button>
                      {selectedAssetCount > 0 ? (
                        <button
                          onClick={handleSelectAll}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          {isAllSelected ? 'Deselect all files' : 'Select all files'}
                        </button>
                      ) : null}
                      {!isSharedBrandView && canManageLibrary ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleBulkShare}
                          className="gap-2"
                        >
                          <Share2 className="h-4 w-4" />
                          Share selected
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span className="text-lg font-semibold text-foreground">
                        {filteredAssets.length} {filteredAssets.length === 1 ? 'asset' : 'assets'}
                      </span>
                      {selectableCount > 0 && (
                        <button
                          onClick={handleSelectAll}
                          className="text-sm text-gray-500 hover:text-gray-700"
                        >
                          Select all
                        </button>
                      )}
                    </>
                  )}
                  {filterTag && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded text-sm border border-primary/20 shadow-soft">
                      <Tag className="w-4 h-4" />
                      <span className="font-medium">{filterTag}</span>
                      <button
                        onClick={() => setFilterTag("")}
                        className="ml-1 hover:bg-primary/20 rounded-full p-1 transition-colors w-5 h-5 flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Enhanced View Switcher */}
              <div className="flex items-center bg-muted/50 border border-border rounded p-1.5">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`px-3 py-2 text-sm transition-all duration-200 rounded-lg ${
                    viewMode === "grid"
                      ? "bg-background text-primary border border-primary/20"
                      : "hover:bg-background/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-3 py-2 text-sm transition-all duration-200 rounded-lg ${
                    viewMode === "list"
                      ? "bg-background text-primary border border-primary/20"
                      : "hover:bg-background/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("visual")}
                  className={`px-3 py-2 text-sm transition-all duration-200 rounded-lg ${
                    viewMode === "visual"
                      ? "bg-background text-primary border border-primary/20"
                      : "hover:bg-background/50 text-muted-foreground hover:text-foreground"
                  }`}
                  title="Visual scan"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </div>
            {shareStatusMessage ? (
              <p className="mt-3 text-sm text-emerald-700">{shareStatusMessage}</p>
            ) : null}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-auto bg-background">
            {loading ? (
              <div className={getGridClasses()}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className={`${
                      viewMode === "list" ? "h-16" : viewMode === "visual" ? "h-48 mb-4 break-inside-avoid" : "aspect-square"
                    } bg-muted rounded animate-pulse`}
                  />
                ))}
              </div>
            ) : (
              <div className={getGridClasses()}>
                {filteredAssets.map((asset) => {
                  const isSelected = selectedAssetIds.has(asset.id);
                  const isSelectable = selectableAssetIds.has(asset.id);
                  const assetTagNames = getAssetTagNames(asset);
                  const isImage = isImageAsset(asset);
                  const previewUrl = getAssetPreviewUrl(asset);

                  if (viewMode === "list") {
                    return (
                      <div
                        key={asset.id}
                        onClick={() => handleViewAsset(asset)}
                        className={`flex items-center gap-4 p-4 rounded border cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-card border-border hover:bg-muted/30'
                      }`}
                      >
                        {/* Selection Checkbox */}
                        <div className="flex-shrink-0">
                          {isSelectable ? (
                            <button
                              onClick={(e) => handleAssetSelect(asset.id, e)}
                              className={`h-4 w-4 rounded border flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'border-input hover:border-blue-400'
                              }`}
                            >
                              {isSelected && <Check className="h-2.5 w-2.5" />}
                            </button>
                          ) : (
                            <div className="h-4 w-4" />
                          )}
                        </div>

                        <div className="w-14 h-14 bg-muted/30 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden border border-border/50">
                          {isImage && previewUrl ? (
                            <img
                              src={previewUrl}
                              alt={asset.originalFilename}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            getFileIcon(asset.mimeType)
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-foreground truncate">
                            {asset.originalFilename}
                          </h3>
                          {assetTagNames.length > 0 ? (
                            <div className="text-xs text-muted-foreground truncate mt-1">
                              {assetTagNames.slice(0, 2).join(", ")}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex-shrink-0">
                          {renderAssetActions(asset)}
                        </div>
                      </div>
                    );
                  }

                  if (viewMode === "visual") {
                    return (
                      <div
                        key={asset.id}
                        onClick={() => handleViewAsset(asset)}
                        className={`group relative mb-4 break-inside-avoid overflow-hidden rounded border cursor-pointer ${
                          isSelected
                            ? "border-blue-300 bg-blue-50"
                            : "border-border bg-card hover:bg-muted/10"
                        }`}
                      >
                        <div className="absolute left-2 top-2 z-10">
                          {isSelectable ? (
                            <button
                              onClick={(e) => handleAssetSelect(asset.id, e)}
                              className={`h-4 w-4 rounded border flex items-center justify-center transition-all ${
                                isSelected
                                  ? "border-blue-600 bg-blue-600 text-white opacity-100"
                                  : "border-input bg-white opacity-100 hover:border-blue-400"
                              }`}
                            >
                              {isSelected ? <Check className="h-2.5 w-2.5" /> : null}
                            </button>
                          ) : (
                            <div className="h-4 w-4" />
                          )}
                        </div>
                        <div className="absolute right-2 top-2 z-10">
                          {renderAssetActions(asset, "rounded-md bg-background/90 p-1.5 text-muted-foreground hover:bg-background hover:text-foreground")}
                        </div>

                        <div className="bg-muted/20">
                          {isImage && previewUrl ? (
                            <img
                              src={previewUrl}
                              alt={asset.originalFilename}
                              className="w-full h-auto object-cover"
                            />
                          ) : (
                            <div className="flex h-40 w-full items-center justify-center">
                              {getFileIcon(asset.mimeType)}
                            </div>
                          )}
                        </div>

                        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent p-3">
                          <p className="truncate text-sm font-medium text-white" title={asset.originalFilename}>
                            {asset.originalFilename}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={asset.id}
                      onClick={() => handleViewAsset(asset)}
                      className={`relative rounded border overflow-hidden cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-card border-border hover:bg-muted/20'
                      }`}
                    >
                      {/* Selection Checkbox - Top Left */}
                      <div className="absolute top-2 left-2 z-10">
                        {isSelectable ? (
                          <button
                            onClick={(e) => handleAssetSelect(asset.id, e)}
                            className={`h-4 w-4 rounded border flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white opacity-100'
                                : 'bg-white border-input opacity-100 hover:border-blue-400'
                            }`}
                          >
                            {isSelected && <Check className="h-2.5 w-2.5" />}
                          </button>
                        ) : (
                          <div className="h-4 w-4" />
                        )}
                      </div>
                      <div className="absolute top-2 right-2 z-10">
                        {renderAssetActions(asset)}
                      </div>

                      <div className="bg-muted/30 relative aspect-square">
                        {isImage && previewUrl ? (
                          <img
                            src={previewUrl}
                            alt={asset.originalFilename}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-32 flex items-center justify-center">
                            {getFileIcon(asset.mimeType)}
                          </div>
                        )}

                      </div>

                      <div className="p-4">
                        <h3 className="text-sm font-semibold text-foreground truncate mb-2" title={asset.originalFilename}>
                          {asset.originalFilename}
                        </h3>

                        {assetTagNames.length > 0 ? (
                          <div className="text-xs text-muted-foreground truncate">
                            {assetTagNames.slice(0, 2).join(", ")}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!loading && filteredAssets.length === 0 && (
              <div className="text-center py-20">
                <div className="w-24 h-24 mx-auto bg-muted/50 rounded-full flex items-center justify-center mb-8 shadow-soft">
                  <Files className="w-10 h-10 text-muted-foreground opacity-60" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">No assets found</h3>
              </div>
            )}
          </div>
        </div>
      </div>

      <input
        ref={replaceFileInputRef}
        type="file"
        className="hidden"
        onChange={handleReplaceFileChange}
      />

      {/* Asset View Panel */}
      <AssetViewPanel
        tenantSlug={tenantSlug}
        selectedBrandSlug={selectedBrandSlug || null}
        asset={selectedAsset}
        isOpen={isViewOpen}
        onClose={handleCloseView}
        onPrevious={handleViewPreviousAsset}
        onNext={handleViewNextAsset}
        canGoPrevious={canViewPrevious}
        canGoNext={canViewNext}
        onSave={handleSaveAsset}
        onDelete={handleDeleteAsset}
        availableTags={availableTags}
        availableCategories={availableCategories}
        onCreateTag={handleCreateTag}
        canEdit={canMutateAsset(selectedAsset)}
        folders={folders}
        availableProducts={productOptions}
        folderPath={
          selectedAsset?.folderId ? folderMap.get(selectedAsset.folderId) || null : null
        }
        folderName={
          selectedAsset?.folderId ? folderMap.get(selectedAsset.folderId) || null : null
        }
        onVersionCreated={handleVersionCreated}
      />

      <Dialog
        open={isShareDialogOpen}
        onOpenChange={(open) => {
          setIsShareDialogOpen(open);
          if (!open) {
            setShareDialogError(null);
            setNewShareSetName("");
            clearShareScopeConstraints();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Selection To Set</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
              Selected: <span className="font-medium text-foreground">{selectionSummaryLabel || "None"}</span>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Asset Set</label>
              <Select value={selectedShareSetId} onValueChange={setSelectedShareSetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a set" />
                </SelectTrigger>
                <SelectContent>
                  {shareSetOptions.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.name} ({set.asset_count} files, {set.folder_count} folders)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void fetchShareSetOptions();
                  }}
                  disabled={isLoadingShareSets}
                >
                  {isLoadingShareSets ? "Loading..." : "Refresh sets"}
                </Button>
                <Link href={`/${tenantSlug}/settings/sets`} className="text-sm text-primary hover:underline">
                  Manage sets
                </Link>
              </div>
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Optional Scope Constraints
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={applyCurrentScopeToShareSelection}
                    >
                      Use Current View
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={clearShareScopeConstraints}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Empty scope means these files/folders are visible in all markets/channels/locales
                  allowed by the partner grant.
                </p>
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Markets</label>
                    <MultiSelect
                      options={shareMarketOptions}
                      value={shareMarketIds}
                      onChange={setShareMarketIds}
                      placeholder="Select one or more markets"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Channels</label>
                    <MultiSelect
                      options={shareChannelOptions}
                      value={shareChannelIds}
                      onChange={setShareChannelIds}
                      placeholder="Select one or more channels"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Locales</label>
                    <MultiSelect
                      options={shareLocaleOptions}
                      value={shareLocaleIds}
                      onChange={setShareLocaleIds}
                      placeholder="Select one or more locales"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Create New Asset Set
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={newShareSetName}
                    onChange={(event) => setNewShareSetName(event.target.value)}
                    placeholder="Example: Mexico Distributor Core"
                    disabled={isCreatingShareSet}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      void handleCreateShareSetInline();
                    }}
                    disabled={isCreatingShareSet || !newShareSetName.trim()}
                  >
                    {isCreatingShareSet ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>
              {!isLoadingShareSets && shareSetOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No asset sets found yet. Create one above or in Settings.
                </p>
              ) : null}
              {shareDialogError ? (
                <p className="text-sm text-destructive">{shareDialogError}</p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsShareDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                void handleConfirmShareSelection();
              }}
              disabled={isSubmittingShare || !selectedShareSetId || totalSelectedShareItems === 0}
            >
              {isSubmittingShare ? "Adding..." : "Add To Set"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={isSharedBrandView ? 0 : selectedSelectableCount}
        onEdit={handleBulkEdit}
        onTag={handleBulkTag}
        onMove={handleBulkMove}
        onDelete={handleBulkDelete}
        onShare={handleBulkShare}
        onClear={handleClearSelection}
      />

      {/* Bulk Editor Panel */}
      <BulkEditorPanel
        assets={selectedAssets}
        isOpen={isBulkEditorOpen}
        onClose={() => setIsBulkEditorOpen(false)}
        onSave={handleBulkSave}
        availableTags={availableTags}
      />

      {/* Keyboard shortcuts intentionally removed for now */}

      <Dialog open={showCreateFolder} onOpenChange={setShowCreateFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newFolderParentId ? "Create Subfolder" : "Create Folder"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="Folder name"
            />
            {newFolderParentId && (
              <p className="text-xs text-muted-foreground">
                This will be created inside the selected folder.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateFolder(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || isCreatingFolder}>
              {isCreatingFolder ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameFolder} onOpenChange={setShowRenameFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={renameFolderName}
              onChange={(event) => setRenameFolderName(event.target.value)}
              placeholder="Folder name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameFolder(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameFolder} disabled={!renameFolderName.trim() || isRenamingFolder}>
              {isRenamingFolder ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteFolder} onOpenChange={setShowDeleteFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Delete <span className="font-semibold text-foreground">{activeFolder?.name}</span>?
            </p>
            <p>Subfolders will be removed and assets will be unfiled.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteFolder(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteFolder} disabled={isDeletingFolder}>
              {isDeletingFolder ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTransferFolderContents} onOpenChange={setShowTransferFolderContents}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{transferMode === "move" ? "Move" : "Copy"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {transferMode === "move"
                ? "Move all assets in this folder to:"
                : "Copy all assets in this folder to:"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isTransferPreviewLoading
                ? "Calculating impacted assets..."
                : transferAssetCount !== null
                  ? `${transferAssetCount} asset${transferAssetCount === 1 ? "" : "s"} will be ${transferMode === "move" ? "moved" : "copied"}.`
                  : "Unable to determine asset count."}
            </p>
            <Select
              value={transferDestinationFolderId}
              onValueChange={setTransferDestinationFolderId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unfiled__">Unfiled</SelectItem>
                {folders
                  .filter((folder) => folder.id !== activeFolder?.id)
                  .map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.path || folder.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferFolderContents(false)}>
              Cancel
            </Button>
            <Button onClick={handleTransferFolderContents} disabled={isTransferringFolderContents}>
              {isTransferringFolderContents
                ? transferMode === "move"
                  ? "Moving..."
                  : "Copying..."
                : transferMode === "move"
                  ? "Move"
                  : "Copy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

