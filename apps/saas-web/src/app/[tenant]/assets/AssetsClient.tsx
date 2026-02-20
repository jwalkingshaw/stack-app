"use client";

import { useState, useEffect, useMemo } from "react";
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
  Download,
  ChevronRight,
  MoreHorizontal,
  Grid3X3,
  List,
  LayoutGrid,
  Star,
  Tag,
  Eye,
  Link2,
  Share2,
  Edit3,
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
import { KeyboardShortcutsHelp } from "@/components/dam/keyboard-shortcuts-help";
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

// Simple inline components for demo
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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
};

type ProductOption = {
  id: string;
  sku?: string;
  productName?: string;
  brand?: string;
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

const getAssetTagNames = (asset: AssetRecord): string[] => {
  if (!asset?.tagAssignments) {
    return [];
  }

  return asset.tagAssignments
    .map((assignment) => assignment.tag?.name?.trim())
    .filter((name): name is string => Boolean(name));
};

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
  const shouldProxyPreviewUrls = isPartnerAllView || isSharedBrandView;

  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [folderTree, setFolderTree] = useState<FolderRecord[]>([]);
  const [availableTags, setAvailableTags] = useState<AssetTag[]>([]);
  const [availableCategories, setAvailableCategories] = useState<AssetCategory[]>([]);
  const [userPermissions, setUserPermissions] = useState<UserPermissions | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // grid, list, mosaic
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [filterTag, setFilterTag] = useState("");
  const [linkedOnly, setLinkedOnly] = useState(false);
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
  const folderParam = searchParams.get("folder");
  const productParam = searchParams.get("product");

  const buildScopedQuery = () => {
    const queryParams = new URLSearchParams();
    if (isPartnerAllView) {
      queryParams.set("view", "all");
    }
    if (selectedFolderId && selectedFolderId !== "unfiled") {
      queryParams.set("folderId", selectedFolderId);
    }
    if (selectedProductId) {
      queryParams.set("productId", selectedProductId);
    }
    if (selectedBrandSlug) {
      queryParams.set("brand", selectedBrandSlug);
    }
    return queryParams.toString();
  };

  const buildAssetPreviewProxyUrl = (assetId: string) => {
    const queryParams = new URLSearchParams();
    if (isPartnerAllView) {
      queryParams.set("view", "all");
    }
    if (selectedBrandSlug) {
      queryParams.set("brand", selectedBrandSlug);
    }
    const queryString = queryParams.toString();
    return `/api/${tenantSlug}/assets/${assetId}/preview${queryString ? `?${queryString}` : ""}`;
  };

  const withPreviewUrls = (assetList: AssetRecord[]): AssetRecord[] => {
    if (!shouldProxyPreviewUrls) {
      return assetList;
    }
    return assetList.map((asset) => ({
      ...asset,
      previewUrl: buildAssetPreviewProxyUrl(asset.id),
    }));
  };

  useEffect(() => {
    if (!folderParam) {
      setSelectedFolderId(null);
      return;
    }
    setSelectedFolderId(folderParam);
  }, [folderParam]);

  useEffect(() => {
    if (!productParam) {
      setSelectedProductId(null);
      return;
    }
    setSelectedProductId(productParam);
  }, [productParam]);

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

        setAssets(withPreviewUrls((data.assets || []) as AssetRecord[]));
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
  }, [tenantSlug, selectedFolderId, selectedProductId, selectedBrandSlug]);

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
      setAssets(withPreviewUrls((data.assets || []) as AssetRecord[]));
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
      const matchesLinked = !linkedOnly || (asset.productIdentifiers?.length ?? 0) > 0;
      return matchesSearch && matchesFilter && matchesFolder && matchesLinked;
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

  const handleSelectFolder = (folderId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!folderId) {
      params.delete("folder");
    } else {
      params.set("folder", folderId);
    }
    router.replace(`/${tenantSlug}/assets${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const handleSelectProduct = (productId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!productId) {
      params.delete("product");
    } else {
      params.set("product", productId);
    }
    router.replace(`/${tenantSlug}/assets${params.toString() ? `?${params.toString()}` : ""}`);
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
                    className={`flex h-5 w-5 items-center justify-center rounded border ${
                      isFolderChecked
                        ? "border-blue-500 bg-blue-600 text-white"
                        : "border-border bg-background hover:border-blue-400"
                    }`}
                    aria-label={isFolderChecked ? "Deselect folder" : "Select folder"}
                  >
                    {isFolderChecked ? <Check className="h-3 w-3" /> : null}
                  </button>
                ) : null}
                {hasChildren ? (
                  <button
                    onClick={() => toggleFolderExpansion(folder.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                  >
                    {isExpanded ? <ChevronRight className="h-4 w-4 rotate-90" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                ) : (
                  <span className="h-6 w-6" />
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
    router.push(`/${tenantSlug}/assets/upload`);
  };

  const canEditAssets = !isSharedBrandView && Boolean(userPermissions?.can_edit_products);
  const canManageLibrary = canEditAssets;
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

  // Multi-select functionality
  const handleAssetSelect = (assetId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    setShareStatusMessage(null);

    if (event?.shiftKey && selectedAssetIds.size > 0) {
      // Range selection with Shift+click
      const assetIds = filteredAssets.map(a => a.id);
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
    setShareStatusMessage(null);
    if (selectedAssetIds.size === filteredAssets.length) {
      // Deselect all
      setSelectedAssetIds(new Set());
    } else {
      // Select all filtered assets
      setSelectedAssetIds(new Set(filteredAssets.map(asset => asset.id)));
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
    if (selectedAssetIds.size === 0) return;
    const confirmed = confirm(`Delete ${selectedAssetIds.size} assets? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      await Promise.all(
        Array.from(selectedAssetIds).map(async (assetId) => {
          const response = await fetch(`/api/${tenantSlug}/assets/${assetId}`, {
            method: 'DELETE',
          });
          if (!response.ok) {
            throw new Error(`Failed to delete asset ${assetId}: ${response.status}`);
          }
        })
      );

      setAssets((prevAssets) =>
        prevAssets.filter((asset) => !selectedAssetIds.has(asset.id))
      );
      setSelectedAssetIds(new Set());
      setIsBulkMode(false);
      setIsBulkEditorOpen(false);

      if (selectedAsset && selectedAssetIds.has(selectedAsset.id)) {
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

  const selectedAssets = assets.filter(asset => selectedAssetIds.has(asset.id));
  const isAllSelected = filteredAssets.length > 0 && selectedAssetIds.size === filteredAssets.length;
  const isPartiallySelected = selectedAssetIds.size > 0 && selectedAssetIds.size < filteredAssets.length;

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
      case "mosaic":
        return "columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4";
      default: // grid
        return "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4";
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Assets" />
      {isSharedBrandView ? (
        <div className="mx-6 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Viewing shared assets from <span className="font-medium text-foreground">{selectedBrandSlug}</span>.
          Uploading and editing are disabled in shared view.
        </div>
      ) : null}
      <div className="flex gap-6 p-6">
        {/* Folder Sidebar */}
        <aside className="w-64 shrink-0 space-y-4">
          <div className="rounded-xl border border-border bg-background p-4 shadow-soft">
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
            {canManageLibrary ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Use checkboxes to select folders for sets.
              </p>
            ) : null}
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

          <div className="rounded-xl border border-border bg-background p-4 shadow-soft">
            <h3 className="text-sm font-semibold text-foreground">Quick Filters</h3>
            <div className="mt-3 space-y-2">
              <button
                onClick={() => setLinkedOnly((prev) => !prev)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                  linkedOnly ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Linked Assets
                </span>
                <span className="text-xs font-medium">{linkedOnly ? "On" : "Off"}</span>
              </button>
              <div className="pt-2">
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                  Product
                </label>
                <Select
                  value={selectedProductId || "all"}
                  onValueChange={(value) => handleSelectProduct(value === "all" ? null : value)}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="All products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All products</SelectItem>
                    {productOptions.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.productName || product.sku || "Unnamed product"}
                        {product.sku ? ` (${product.sku})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 space-y-6">
          {/* Enhanced Search Section */}
          <div className="bg-background px-4 py-4 shadow-soft">
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
                <Select
                  value={selectedProductId || "all"}
                  onValueChange={(value) => handleSelectProduct(value === "all" ? null : value)}
                >
                  <SelectTrigger className="min-w-[220px] h-10">
                    <SelectValue placeholder="All products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All products</SelectItem>
                    {productOptions.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.productName || product.sku || "Unnamed product"}
                        {product.sku ? ` (${product.sku})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!isSharedBrandView ? (
                  <Button onClick={handleNavigateToUpload} className="gap-2">
                    <Upload className="w-4 h-4" />
                    Upload Assets
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Enhanced Toolbar */}
          <div className="bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 shadow-soft">
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
                      {filteredAssets.length > 0 && (
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

                {/* Enhanced Filters */}
                <div className="flex items-center gap-4">
                  <Select
                    value={filterTag || "all"}
                    onValueChange={(value) => setFilterTag(value === "all" ? "" : value)}
                  >
                    <SelectTrigger className="min-w-[120px]">
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

                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="min-w-[140px]">
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

              {/* Enhanced View Switcher */}
              <div className="flex items-center bg-muted/50 border border-border rounded p-1.5 shadow-soft">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`px-3 py-2 text-sm transition-all duration-200 rounded-lg ${
                    viewMode === "grid"
                      ? "bg-background shadow-soft text-primary border border-primary/20"
                      : "hover:bg-background/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-3 py-2 text-sm transition-all duration-200 rounded-lg ${
                    viewMode === "list"
                      ? "bg-background shadow-soft text-primary border border-primary/20"
                      : "hover:bg-background/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("mosaic")}
                  className={`px-3 py-2 text-sm transition-all duration-200 rounded-lg ${
                    viewMode === "mosaic"
                      ? "bg-background shadow-soft text-primary border border-primary/20"
                      : "hover:bg-background/50 text-muted-foreground hover:text-foreground"
                  }`}
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
                  <div key={i} className={`${viewMode === "list" ? "h-16" : "aspect-square"} bg-muted rounded animate-pulse shadow-soft`} />
                ))}
              </div>
            ) : (
              <div className={getGridClasses()}>
                {filteredAssets.map((asset) => {
                  const isSelected = selectedAssetIds.has(asset.id);
                  const assetTagNames = getAssetTagNames(asset);
                  const isImage = isImageAsset(asset);
                  const previewUrl = getAssetPreviewUrl(asset);
                  const linkedCount = asset.productIdentifiers?.length ?? 0;

                  if (viewMode === "list") {
                    return (
                      <div
                        key={asset.id}
                        onClick={() => handleViewAsset(asset)}
                        className={`group flex items-center gap-4 p-4 rounded border transition-all duration-300 cursor-pointer hover:-translate-y-0.5 ${
                        isSelected
                          ? 'bg-blue-50 border-blue-300 shadow-md'
                          : 'bg-card border-border hover:shadow-medium hover:border-ring/20'
                      }`}
                      >
                        {/* Selection Checkbox */}
                        <div className="flex-shrink-0">
                          <button
                            onClick={(e) => handleAssetSelect(asset.id, e)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-input hover:border-blue-400'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </button>
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
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-foreground truncate">
                              {asset.originalFilename}
                            </h3>
                            {asset.favorite && <Star className="w-4 h-4 text-yellow-500 fill-current" />}
                            {linkedCount > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                <Link2 className="h-3 w-3" />
                                {linkedCount}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground font-medium">
                            <span>{formatFileSize(asset.fileSize)}</span>
                            <span className="capitalize">{asset.fileType}</span>
                            <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleViewAsset(asset);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          {canEditAssets && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleViewAsset(asset);
                              }}
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={asset.id}
                      onClick={() => handleViewAsset(asset)}
                      className={`group relative rounded border overflow-hidden transition-all duration-300 cursor-pointer hover:-translate-y-1 ${
                        viewMode === "mosaic" ? "break-inside-avoid mb-6" : ""
                      } ${
                        isSelected
                          ? 'bg-blue-50 border-blue-300 shadow-lg'
                          : 'bg-card border-border hover:shadow-medium hover:border-ring/20'
                      }`}
                    >
                      {/* Selection Checkbox - Top Left */}
                      <div className="absolute top-2 left-2 z-10">
                        <button
                          onClick={(e) => handleAssetSelect(asset.id, e)}
                          className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all shadow-sm ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600 text-white opacity-100'
                              : 'bg-white border-input opacity-0 group-hover:opacity-100 hover:border-blue-400'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                        </button>
                      </div>

                      <div className={`bg-muted/30 relative ${viewMode === "mosaic" ? "" : "aspect-square"}`}>
                        {isImage && previewUrl ? (
                          <img
                            src={previewUrl}
                            alt={asset.originalFilename}
                            className={`w-full object-cover ${viewMode === "mosaic" ? "h-auto" : "h-full"}`}
                          />
                        ) : (
                          <div className="w-full h-32 flex items-center justify-center">
                            {getFileIcon(asset.mimeType)}
                          </div>
                        )}

                        {/* Favorite Star */}
                        {asset.favorite && (
                          <div className="absolute top-2 right-2">
                            <Star className="w-4 h-4 text-yellow-500 fill-current" />
                          </div>
                        )}

                        {/* Enhanced Hover Actions */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3">
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-9 w-9 bg-white/90 hover:bg-white border-0 shadow-lg"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleViewAsset(asset);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-9 w-9 bg-white/90 hover:bg-white border-0 shadow-lg"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          {canEditAssets && (
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-9 w-9 bg-white/90 hover:bg-white border-0 shadow-lg"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleViewAsset(asset);
                              }}
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="p-4">
                        <h3 className="text-sm font-semibold text-foreground truncate mb-2" title={asset.originalFilename}>
                          {asset.originalFilename}
                        </h3>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs text-muted-foreground font-medium">
                            {formatFileSize(asset.fileSize)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(asset.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        {linkedCount > 0 && (
                          <div className="mb-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              <Link2 className="h-3 w-3" />
                              Linked to {linkedCount}
                            </span>
                          </div>
                        )}

                        {assetTagNames.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {assetTagNames.slice(0, 2).map((tag: string) => (
                              <button
                                key={tag}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setFilterTag(tag);
                                }}
                                className="inline-block px-2.5 py-1 text-xs bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all duration-200 border border-primary/20 font-medium"
                              >
                                {tag}
                              </button>
                            ))}
                            {assetTagNames.length > 2 && (
                              <span className="inline-block px-2.5 py-1 text-xs bg-muted text-muted-foreground rounded-lg border border-border font-medium">
                                +{assetTagNames.length - 2}
                              </span>
                            )}
                          </div>
                        )}
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
        canEdit={canEditAssets}
        folders={folders}
        availableProducts={productOptions}
        folderPath={
          selectedAsset?.folderId ? folderMap.get(selectedAsset.folderId) || null : null
        }
        folderName={
          selectedAsset?.folderId ? folderMap.get(selectedAsset.folderId) || null : null
        }
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
                      placeholder="All markets"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Channels</label>
                    <MultiSelect
                      options={shareChannelOptions}
                      value={shareChannelIds}
                      onChange={setShareChannelIds}
                      placeholder="All channels"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Locales</label>
                    <MultiSelect
                      options={shareLocaleOptions}
                      value={shareLocaleIds}
                      onChange={setShareLocaleIds}
                      placeholder="All locales"
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
        selectedCount={isSharedBrandView ? 0 : selectedAssetIds.size}
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

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp />

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

