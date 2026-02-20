"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Copy,
  Download,
  FileText,
  Folder,
  Image as ImageIcon,
  Link2,
  Loader2,
  MoreVertical,
  Plus,
  Tag as TagIcon,
  Trash,
  X,
  Edit3,
  Expand,
  Palette,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@tradetool/ui";
import { cn } from "@/lib/utils";
import type {
  AssetCategory,
  AssetCategoryAssignment,
  AssetTag,
  AssetTagAssignment,
  DamAsset,
} from "@tradetool/types";

type AssetWithAssignments = DamAsset & {
  tagAssignments: AssetTagAssignment[];
  categoryAssignments: AssetCategoryAssignment[];
  preview?: string | null;
  previewUrl?: string | null;
};

type AssetEditorSavePayload = {
  filename?: string;
  description?: string | null;
  tagIds?: string[];
  categoryIds?: string[];
  primaryCategoryId?: string | null;
  folderId?: string | null;
};

interface AssetViewPanelProps {
  tenantSlug: string;
  selectedBrandSlug?: string | null;
  asset: AssetWithAssignments | null;
  isOpen: boolean;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  onSave: (updates: AssetEditorSavePayload) => Promise<void>;
  onDelete: (assetId: string) => Promise<void>;
  availableTags: AssetTag[];
  availableCategories: AssetCategory[];
  onCreateTag: (name: string) => Promise<AssetTag>;
  canEdit: boolean;
  folderName?: string | null;
  folderPath?: string | null;
  folders?: Array<{
    id: string;
    name: string;
    path: string;
    parentId: string | null;
  }>;
  availableProducts?: Array<{
    id: string;
    sku?: string;
    productName?: string;
    brand?: string;
  }>;
}

const arrayEquals = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return "0 MB";
  return (bytes / 1024 / 1024).toFixed(1) + "MB";
};

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const getPreviewUrl = (asset: AssetWithAssignments) =>
  asset.preview ||
  asset.previewUrl ||
  asset.thumbnailUrls?.medium ||
  asset.thumbnailUrls?.small ||
  asset.s3Url;

const isSignedAssetUrl = (url: string) => {
  const lower = url.toLowerCase();
  return (
    lower.includes("x-amz-signature=") ||
    lower.includes("x-amz-credential=") ||
    lower.includes("x-amz-security-token=") ||
    lower.includes("signature=") ||
    lower.includes("token=")
  );
};

const withCacheBuster = (url: string | undefined, token: string | undefined) => {
  if (!url) return null;
  if (!token) return url;
  if (isSignedAssetUrl(url)) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(token)}`;
};

const formatMetadataValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "—";
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const formatMetadataKey = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatFolderBreadcrumb = (path?: string | null) => {
  if (!path) return "Unfiled";
  const parts = path.split("/").filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "Unfiled";
};

export function AssetViewPanel({
  tenantSlug,
  selectedBrandSlug,
  asset,
  isOpen,
  onClose,
  onPrevious,
  onNext,
  canGoPrevious = false,
  canGoNext = false,
  onSave,
  onDelete,
  availableTags,
  availableCategories,
  onCreateTag,
  canEdit,
  folderName,
  folderPath,
  folders = [],
  availableProducts = [],
}: AssetViewPanelProps) {
  const [filename, setFilename] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isLoadingShare, setIsLoadingShare] = useState(false);
  const [isSavingShare, setIsSavingShare] = useState(false);
  const [sharePublicEnabled, setSharePublicEnabled] = useState(false);
  const [shareAllowDownloads, setShareAllowDownloads] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareCopyLabel, setShareCopyLabel] = useState("Copy link");
  const [linkedProducts, setLinkedProducts] = useState<Array<{
    id: string;
    productId: string;
    productName: string;
    sku?: string;
    brand?: string;
    linkType?: string;
    linkContext?: string;
  }>>([]);
  const [isLoadingLinkedProducts, setIsLoadingLinkedProducts] = useState(false);
  const [productToLinkId, setProductToLinkId] = useState<string>("none");
  const [isUpdatingLinks, setIsUpdatingLinks] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState("info");
  const [isEditMode, setIsEditMode] = useState(false);
  const [viewerBackground, setViewerBackground] = useState<"dark" | "light" | "checker">("dark");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");
  const viewerPaneRef = useRef<HTMLDivElement | null>(null);
  const canEditFields = canEdit && isEditMode;
  const brandQuerySuffix = useMemo(() => {
    const brand = (selectedBrandSlug || "").trim().toLowerCase();
    if (!brand) return "";
    const query = new URLSearchParams();
    query.set("brand", brand);
    return `?${query.toString()}`;
  }, [selectedBrandSlug]);

  const initialState = useMemo(() => {
    if (!asset) {
      return {
        filename: "",
        description: "",
        tagIds: [] as string[],
        categoryIds: [] as string[],
        primaryCategoryId: null as string | null,
        folderId: null as string | null,
      };
    }

    const initialTagIds = asset.tagAssignments.map((assignment) => assignment.tagId);
    const initialCategoryIds = asset.categoryAssignments.map(
      (assignment) => assignment.categoryId
    );
    const initialPrimary =
      asset.categoryAssignments.find((assignment) => assignment.isPrimary)?.categoryId || null;

    return {
      filename: asset.filename,
      description: asset.description || "",
      tagIds: initialTagIds,
      categoryIds: initialCategoryIds,
      primaryCategoryId: initialPrimary,
      folderId: asset.folderId ?? null,
    };
  }, [asset]);

  useEffect(() => {
    if (!asset) return;
    setFilename(asset.filename);
    setDescription(asset.description || "");
    setSelectedTagIds(initialState.tagIds);
    setSelectedCategoryIds(initialState.categoryIds);
    setPrimaryCategoryId(initialState.primaryCategoryId);
    setSelectedFolderId(initialState.folderId);
    setTagFilter("");
    setNewTagName("");
    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
    setIsShareDialogOpen(false);
    setIsLoadingShare(false);
    setIsSavingShare(false);
    setSharePublicEnabled(false);
    setShareAllowDownloads(false);
    setShareUrl("");
    setShareCopyLabel("Copy link");
    setIsDownloading(false);
    setActiveTab("info");
    setIsEditMode(false);
    lastSavedRef.current = JSON.stringify({
      filename: initialState.filename,
      description: initialState.description,
      selectedTagIds: initialState.tagIds,
      selectedCategoryIds: initialState.categoryIds,
      primaryCategoryId: initialState.primaryCategoryId,
      folderId: initialState.folderId,
    });
  }, [asset, initialState]);

  const hasChanges = useMemo(() => {
    if (!asset) return false;
    if (filename.trim() !== initialState.filename) return true;
    if ((description || "").trim() !== (initialState.description || "")) return true;
    if (!arrayEquals(selectedTagIds, initialState.tagIds)) return true;
    if (!arrayEquals(selectedCategoryIds, initialState.categoryIds)) return true;
    if ((primaryCategoryId || null) !== (initialState.primaryCategoryId || null)) return true;
    if ((selectedFolderId || null) !== (initialState.folderId || null)) return true;
    return false;
  }, [
    asset,
    filename,
    description,
    selectedTagIds,
    selectedCategoryIds,
    primaryCategoryId,
    selectedFolderId,
    initialState,
  ]);

  const filteredTags = useMemo(() => {
    const query = tagFilter.trim().toLowerCase();
    if (!query) return availableTags;
    return availableTags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [availableTags, tagFilter]);

  const metadataEntries = useMemo(() => {
    if (!asset?.metadata) return [];
    const hiddenKeys = new Set(["name", "filename", "fileName", "originalFilename"]);
    return Object.entries(asset.metadata).filter(([key]) => !hiddenKeys.has(key));
  }, [asset]);

  const activeFolderPath = useMemo(() => {
    if (!selectedFolderId) return null;
    const folder = folders.find((item) => item.id === selectedFolderId);
    return folder?.path || folder?.name || null;
  }, [folders, selectedFolderId]);

  const rightsSummary = useMemo(() => {
    if (!asset?.metadata) return { usageRights: null as string | null, validTo: null as string | null };
    const usageRights =
      (asset.metadata as any).usageRights ||
      (asset.metadata as any).usage_rights ||
      (asset.metadata as any).usageGroupId ||
      null;
    const validTo =
      (asset.metadata as any).validTo ||
      (asset.metadata as any).valid_to ||
      null;
    return { usageRights, validTo };
  }, [asset]);

  const versionSummary = useMemo(() => {
    if (!asset?.metadata) return { supersedesAssetId: null as string | null };
    return {
      supersedesAssetId:
        (asset.metadata as any).supersedesAssetId ||
        (asset.metadata as any).supersedes_asset_id ||
        null,
    };
  }, [asset]);

  const fetchLinkedProducts = useCallback(async () => {
    if (!asset?.id || !tenantSlug) {
      setLinkedProducts([]);
      return;
    }

    setIsLoadingLinkedProducts(true);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/assets/${asset.id}/product-context${brandQuerySuffix}`
      );
      if (!response.ok) {
        throw new Error(`Failed to load linked products (${response.status})`);
      }
      const payload = await response.json();
      setLinkedProducts((payload?.data?.productLinks || []) as any[]);
    } catch (error) {
      console.error("Failed to fetch linked products:", error);
      setLinkedProducts([]);
    } finally {
      setIsLoadingLinkedProducts(false);
    }
  }, [asset?.id, tenantSlug]);

  useEffect(() => {
    fetchLinkedProducts();
  }, [fetchLinkedProducts]);

  const handleLinkProduct = useCallback(async () => {
    if (!asset?.id || productToLinkId === "none") return;
    setIsUpdatingLinks(true);
    try {
      const response = await fetch(`/api/${tenantSlug}/product-links${brandQuerySuffix}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productToLinkId,
          asset_id: asset.id,
          link_context: "asset_workspace",
          link_type: "manual",
          confidence: 1,
          match_reason: "Linked from asset workspace",
        }),
      });

      if (!response.ok && response.status !== 409) {
        throw new Error(`Failed to link product (${response.status})`);
      }

      setProductToLinkId("none");
      await fetchLinkedProducts();
    } catch (error) {
      console.error("Failed to link product:", error);
    } finally {
      setIsUpdatingLinks(false);
    }
  }, [asset?.id, productToLinkId, tenantSlug, fetchLinkedProducts, brandQuerySuffix]);

  const handleUnlinkProduct = useCallback(async (linkId: string) => {
    setIsUpdatingLinks(true);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/product-links/${linkId}${brandQuerySuffix}`,
        {
        method: "DELETE",
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to unlink product (${response.status})`);
      }
      await fetchLinkedProducts();
    } catch (error) {
      console.error("Failed to unlink product:", error);
    } finally {
      setIsUpdatingLinks(false);
    }
  }, [tenantSlug, fetchLinkedProducts, brandQuerySuffix]);

  const handleRelinkProduct = useCallback(async (link: { id: string; productId: string }) => {
    if (!asset?.id) return;
    setIsUpdatingLinks(true);
    try {
      await fetch(`/api/${tenantSlug}/product-links/${link.id}${brandQuerySuffix}`, {
        method: "DELETE",
      });
      await fetch(`/api/${tenantSlug}/product-links${brandQuerySuffix}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: link.productId,
          asset_id: asset.id,
          link_context: "asset_workspace_relink",
          link_type: "manual",
          confidence: 1,
          match_reason: "Relinked from asset workspace",
        }),
      });
      await fetchLinkedProducts();
    } catch (error) {
      console.error("Failed to relink product:", error);
    } finally {
      setIsUpdatingLinks(false);
    }
  }, [asset?.id, tenantSlug, fetchLinkedProducts, brandQuerySuffix]);

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }, []);

  const toggleCategory = useCallback(
    (categoryId: string) => {
      setSelectedCategoryIds((prev) => {
        if (prev.includes(categoryId)) {
          const next = prev.filter((id) => id !== categoryId);
          if (primaryCategoryId === categoryId) {
            setPrimaryCategoryId(null);
          }
          return next;
        }
        return [...prev, categoryId];
      });
    },
    [primaryCategoryId]
  );

  const handleCreateTag = useCallback(async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      const created = await onCreateTag(name);
      setSelectedTagIds((prev) => [...prev, created.id]);
      setNewTagName("");
      setTagFilter("");
    } catch (error) {
      console.error("Failed to create tag", error);
    }
  }, [newTagName, onCreateTag]);

  const handleDelete = useCallback(async () => {
    if (!asset) return;
    setIsDeleting(true);
    try {
      await onDelete(asset.id);
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }, [asset, onDelete]);

  const handleSave = useCallback(async () => {
    if (!asset || !hasChanges) return;
    setIsSaving(true);
    try {
      const nextDescription = description.trim();
      await onSave({
        filename: filename.trim(),
        description: nextDescription ? nextDescription : null,
        tagIds: selectedTagIds,
        categoryIds: selectedCategoryIds,
        primaryCategoryId,
        folderId: selectedFolderId,
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    asset,
    hasChanges,
    onSave,
    filename,
    description,
    selectedTagIds,
    selectedCategoryIds,
    primaryCategoryId,
    selectedFolderId,
  ]);

  useEffect(() => {
    if (!canEditFields || !asset) return;
    if (!hasChanges) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    const snapshot = JSON.stringify({
      filename: filename.trim(),
      description: description.trim(),
      selectedTagIds,
      selectedCategoryIds,
      primaryCategoryId,
      folderId: selectedFolderId,
    });

    if (snapshot === lastSavedRef.current) return;

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await handleSave();
        lastSavedRef.current = snapshot;
      } catch (error) {
        console.error("Auto-save failed", error);
      }
    }, 800);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    asset,
    canEditFields,
    hasChanges,
    filename,
    description,
    selectedTagIds,
    selectedCategoryIds,
    primaryCategoryId,
    selectedFolderId,
    handleSave,
  ]);

  const cycleViewerBackground = useCallback(() => {
    setViewerBackground((prev) => {
      if (prev === "dark") return "light";
      if (prev === "light") return "checker";
      return "dark";
    });
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    if (!viewerPaneRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await viewerPaneRef.current.requestFullscreen();
      }
    } catch (error) {
      console.error("Failed to toggle fullscreen:", error);
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isShareDialogOpen || isDeleteDialogOpen) return;

      const isMenuOpen = Boolean(
        document.querySelector(
          "[data-radix-dropdown-menu-content][data-state='open'], [role='menu'][data-state='open']"
        )
      );
      if (isMenuOpen) return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isTypingField =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        Boolean(target?.isContentEditable);

      const isInteractiveTarget = Boolean(
        target?.closest(
          "button, a, [role='button'], [role='switch'], [role='menuitem'], [role='tab'], [role='combobox']"
        )
      );

      if (isTypingField || isInteractiveTarget) return;

      if (event.key === "ArrowLeft" && canGoPrevious) {
        event.preventDefault();
        onPrevious?.();
        return;
      }

      if (event.key === "ArrowRight" && canGoNext) {
        event.preventDefault();
        onNext?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isShareDialogOpen, isDeleteDialogOpen, canGoPrevious, canGoNext, onPrevious, onNext]);

  const handleDownload = async () => {
    if (!asset?.id || isDownloading) return;
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/${tenantSlug}/assets/${asset.id}/download`);
      if (!response.ok) {
        throw new Error(`Failed to generate download URL (${response.status})`);
      }

      const payload = await response.json();
      const url = payload?.downloadUrl as string | undefined;
      if (!url) {
        throw new Error("Download URL missing in response");
      }

      const link = document.createElement("a");
      link.href = url;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Failed to download asset:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const loadShareSettings = useCallback(async () => {
    if (!asset?.id) return;
    setIsLoadingShare(true);
    try {
      const response = await fetch(`/api/${tenantSlug}/assets/${asset.id}/share`);
      if (!response.ok) {
        throw new Error(`Failed to load share settings (${response.status})`);
      }
      const payload = await response.json();
      setSharePublicEnabled(Boolean(payload?.publicEnabled));
      setShareAllowDownloads(Boolean(payload?.allowDownloads));
      setShareUrl(typeof payload?.shareUrl === "string" ? payload.shareUrl : "");
    } catch (error) {
      console.error("Failed to load share settings:", error);
    } finally {
      setIsLoadingShare(false);
    }
  }, [asset?.id, tenantSlug]);

  const updateShareSettings = useCallback(
    async (updates: { publicEnabled?: boolean; allowDownloads?: boolean }) => {
      if (!asset?.id) return;
      setIsSavingShare(true);
      try {
        const response = await fetch(`/api/${tenantSlug}/assets/${asset.id}/share`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (!response.ok) {
          throw new Error(`Failed to update share settings (${response.status})`);
        }
        const payload = await response.json();
        setSharePublicEnabled(Boolean(payload?.publicEnabled));
        setShareAllowDownloads(Boolean(payload?.allowDownloads));
        setShareUrl(typeof payload?.shareUrl === "string" ? payload.shareUrl : "");
      } catch (error) {
        console.error("Failed to update share settings:", error);
      } finally {
        setIsSavingShare(false);
      }
    },
    [asset?.id, tenantSlug]
  );

  useEffect(() => {
    if (!isShareDialogOpen) return;
    void loadShareSettings();
  }, [isShareDialogOpen, loadShareSettings]);

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopyLabel("Copied");
      setTimeout(() => setShareCopyLabel("Copy link"), 1500);
    } catch (error) {
      console.error("Failed to copy share link:", error);
    }
  };

  if (!asset) return null;

  const previewUrl = withCacheBuster(getPreviewUrl(asset), asset.updatedAt);
  const isImage = asset.mimeType?.startsWith("image/");
  const primaryCategory = asset.categoryAssignments.find((assignment) => assignment.isPrimary);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-transparent transition-opacity z-40",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      <div
        className={cn(
          "fixed inset-0 w-screen h-screen bg-white shadow-2xl transform transition-transform duration-300 z-50 flex flex-col overflow-hidden",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-white">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{asset.originalFilename}</h2>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" disabled={isDeleting} aria-label="Asset actions">
                    <MoreVertical className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setIsDeleteDialogOpen(true);
                    }}
                    disabled={isDeleting}
                    className="cursor-pointer text-sm font-medium text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    <Trash className="mr-2 h-4 w-4" />
                    {isDeleting ? "Deleting..." : "Delete"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              type="button"
              variant="ghost"
              className="h-9 gap-1.5 px-3"
              onClick={() => void handleDownload()}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isDownloading ? "Preparing..." : "Download"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-9 gap-1.5 px-3"
              onClick={() => setIsShareDialogOpen(true)}
            >
              <Share2 className="h-4 w-4" />
              Share
            </Button>
            <div className="flex items-center overflow-hidden rounded-md border border-border">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-none border-r border-border"
                onClick={onPrevious}
                disabled={!canGoPrevious}
                aria-label="Previous asset"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-none"
                onClick={onNext}
                disabled={!canGoNext}
                aria-label="Next asset"
              >
                <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div
            ref={viewerPaneRef}
            className={cn(
              "relative flex min-h-0 flex-1 flex-col",
              viewerBackground === "dark" && "bg-[#0f1115]",
              viewerBackground === "light" && "bg-[#f3f4f6]",
              viewerBackground === "checker" &&
                "bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f8fafc_0%_50%)] bg-[length:20px_20px]"
            )}
          >
            <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-2xl bg-black/70 p-1.5 backdrop-blur">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={isEditMode ? "secondary" : "ghost"}
                  className="h-9 w-9 p-0 text-white hover:bg-white/20 hover:text-white"
                  disabled={!canEdit}
                  onClick={() => setIsEditMode((prev) => !prev)}
                  title={isEditMode ? "Stop edit mode" : "Start edit mode"}
                  aria-label={isEditMode ? "Stop edit mode" : "Start edit mode"}
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0 text-white hover:bg-white/20 hover:text-white"
                  onClick={cycleViewerBackground}
                  title={`Change background (${viewerBackground})`}
                  aria-label={`Change background (${viewerBackground})`}
                >
                  <Palette className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0 text-white hover:bg-white/20 hover:text-white"
                  onClick={handleToggleFullscreen}
                  title={isFullscreen ? "Exit full screen" : "Full screen"}
                  aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
                >
                  <Expand className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-6 pb-6 pt-15 md:px-8 md:pb-8 md:pt-18">
              <div
                className={cn(
                  "flex h-full w-full items-center justify-center rounded-lg",
                  viewerBackground === "dark" ? "bg-black/40" : "bg-white/60"
                )}
              >
                {isImage && previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={asset.originalFilename}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full min-h-[420px] w-full items-center justify-center text-white/70">
                    <FileText className="h-12 w-12" />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-white/10 bg-black/70 px-6 py-4 text-xs text-white/80 md:grid-cols-4">
              <div className="flex items-start gap-2">
                <ImageIcon className="h-3.5 w-3.5" />
                <div className="space-y-1">
                  <div>{formatFileSize(asset.fileSize)}</div>
                  <div className="text-[11px] uppercase tracking-wide text-white/60">{asset.mimeType}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TagIcon className="h-3.5 w-3.5" />
                <span className="capitalize">{asset.assetScope || "internal"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                <span>Uploaded {formatDate(asset.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                <span>Updated {formatDate(asset.updatedAt)}</span>
              </div>
            </div>
          </div>

          <div className="flex h-full w-full max-w-[440px] flex-col border-l border-border bg-white">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border px-6 py-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="info">Info</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
              <TabsTrigger value="comments">Comments</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="info" className="space-y-6 mt-0">
              {canEditFields && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  Edit mode is on. Changes auto-save in this panel.
                </div>
              )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Location</label>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Folder className="w-4 h-4" />
              <span>{formatFolderBreadcrumb(activeFolderPath || folderPath || folderName)}</span>
            </div>
            {canEditFields && (
              <div className="pt-2">
                <Select
                  value={selectedFolderId || "unfiled"}
                  onValueChange={(value) =>
                    setSelectedFolderId(value === "unfiled" ? null : value)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Move to folder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unfiled">Unfiled</SelectItem>
                    {folders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.path || folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  Moving the asset updates its folder immediately.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Filename</label>
            {canEditFields ? (
              <Input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="border-0 bg-muted/20 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            ) : (
              <div className="rounded-lg bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {filename || "Untitled"}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Description
            </label>
            {canEditFields ? (
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description for this asset..."
                rows={3}
                className="border-0 bg-muted/20 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            ) : (
              <div className="rounded-lg bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {description.trim() || "No description yet."}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">
              Tags
            </label>
            {canEditFields ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    placeholder="Search tags..."
                    className="flex-1 border-0 bg-muted/20 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <Input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="New tag"
                    className="flex-1 border-0 bg-muted/20 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreateTag}
                    disabled={!newTagName.trim()}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Create
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {filteredTags.length === 0 && (
                    <span className="text-sm text-muted-foreground">No tags found</span>
                  )}
                  {filteredTags.map((tag) => {
                    const isSelected = selectedTagIds.includes(tag.id);
                    return (
                      <Badge
                        key={tag.id}
                        variant={isSelected ? "default" : "secondary"}
                        className={cn(
                          "cursor-pointer text-xs px-2 py-1 transition-colors",
                          isSelected ? "bg-primary text-primary-foreground" : ""
                        )}
                        onClick={() => toggleTag(tag.id)}
                      >
                        {tag.name}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {asset.tagAssignments.length === 0 && (
                  <span className="text-sm text-muted-foreground">No tags assigned.</span>
                )}
                {asset.tagAssignments.map((assignment) => (
                  <Badge key={assignment.id} variant="secondary" className="text-xs">
                    {assignment.tag?.name || "Tag"}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">Categories</label>
            {canEditFields ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {availableCategories.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      No categories defined yet. Create categories in settings.
                    </span>
                  )}
                  {availableCategories.map((category) => {
                    const isSelected = selectedCategoryIds.includes(category.id);
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => toggleCategory(category.id)}
                        className={cn(
                          "flex items-center gap-2 border rounded-full px-3 py-1 text-xs transition-colors",
                          isSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/40"
                        )}
                      >
                        {category.path || category.name}
                      </button>
                    );
                  })}
                </div>
                {selectedCategoryIds.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Primary category</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setPrimaryCategoryId(null)}
                        className={cn(
                          "px-2 py-1 text-xs border rounded-full",
                          primaryCategoryId === null
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/40"
                        )}
                      >
                        None
                      </button>
                      {selectedCategoryIds.map((categoryId) => {
                        const category = availableCategories.find((c) => c.id === categoryId);
                        if (!category) return null;
                        const isPrimary = primaryCategoryId === category.id;
                        return (
                          <button
                            type="button"
                            key={category.id}
                            onClick={() => setPrimaryCategoryId(category.id)}
                            className={cn(
                              "px-2 py-1 text-xs border rounded-full",
                              isPrimary
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border hover:border-primary/40"
                            )}
                          >
                            {category.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {asset.categoryAssignments.length === 0 && (
                  <span className="text-sm text-muted-foreground">No categories assigned.</span>
                )}
                {asset.categoryAssignments.map((assignment) => (
                  <Badge
                    key={assignment.id}
                    variant={assignment.isPrimary ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {assignment.category?.name || assignment.category?.path || "Category"}
                    {assignment.isPrimary ? " (Primary)" : ""}
                  </Badge>
                ))}
              </div>
            )}
            {!canEditFields && primaryCategory && (
              <p className="text-xs text-muted-foreground">
                Primary category: {primaryCategory.category?.name || primaryCategory.category?.path}
              </p>
            )}
          </div>
            </TabsContent>

            <TabsContent value="products" className="space-y-6 mt-0">

          {asset.productIdentifiers && asset.productIdentifiers.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Product identifiers
              </label>
              <div className="flex flex-wrap gap-2">
                {asset.productIdentifiers.map((identifier) => (
                  <Badge key={identifier} variant="outline" className="text-xs">
                    {identifier}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Linked products</label>
            {isLoadingLinkedProducts ? (
              <div className="rounded-lg bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                Loading linked products...
              </div>
            ) : linkedProducts.length === 0 ? (
              <div className="rounded-lg bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                No linked products.
              </div>
            ) : (
              <div className="space-y-2">
                {linkedProducts.map((link) => (
                  <div key={link.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <div className="text-xs text-foreground">
                      {link.productName || "Product"}
                      {link.sku ? ` (${link.sku})` : ""}
                    </div>
                    {canEditFields && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={isUpdatingLinks}
                          onClick={() => handleRelinkProduct({ id: link.id, productId: link.productId })}
                        >
                          Relink
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive"
                          disabled={isUpdatingLinks}
                          onClick={() => handleUnlinkProduct(link.id)}
                        >
                          Unlink
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {canEditFields && (
              <div className="flex items-center gap-2 pt-1">
                <Select value={productToLinkId} onValueChange={setProductToLinkId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Link a product" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select product</SelectItem>
                    {availableProducts.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.productName || product.sku || "Unnamed product"}
                        {product.sku ? ` (${product.sku})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableProducts.length === 0 && (
                  <span className="text-xs text-muted-foreground">No products available</span>
                )}
                <Button
                  variant="secondary"
                  className="h-9 px-3"
                  disabled={productToLinkId === "none" || isUpdatingLinks}
                  onClick={handleLinkProduct}
                >
                  <Link2 className="mr-1 h-3.5 w-3.5" />
                  Link
                </Button>
              </div>
            )}
          </div>
            </TabsContent>

            <TabsContent value="metadata" className="space-y-6 mt-0">

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Rights</label>
            <div className="rounded-lg bg-muted/20 px-3 py-2 text-sm text-muted-foreground space-y-1">
              <div>
                Usage rights: <span className="text-foreground">{rightsSummary.usageRights || "Not set"}</span>
              </div>
              <div>
                Valid to:{" "}
                <span className="text-foreground">
                  {rightsSummary.validTo ? formatDate(rightsSummary.validTo) : "No expiry"}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Version</label>
            <div className="rounded-lg bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              Supersedes asset:{" "}
              <span className="text-foreground">{versionSummary.supersedesAssetId || "None"}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Permissions</label>
            <div className="rounded-lg bg-muted/20 px-3 py-2 text-sm text-muted-foreground space-y-1">
              <div>
                Access: <span className="text-foreground capitalize">{asset.assetScope || "internal"}</span>
              </div>
              <div>
                Editing: <span className="text-foreground">{canEdit ? "Allowed" : "View only"}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Metadata</label>
            {metadataEntries.length === 0 ? (
              <div className="rounded-lg bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                No metadata added yet.
              </div>
            ) : (
              <div className="rounded-lg bg-card">
                {metadataEntries.map(([key, value], index) => (
                  <div
                    key={key}
                    className={cn(
                      "grid grid-cols-1 gap-2 px-4 py-2 text-sm sm:grid-cols-[140px_1fr] sm:gap-4",
                      index !== metadataEntries.length - 1 && "border-b border-border/40"
                    )}
                  >
                    <span className="text-muted-foreground">{formatMetadataKey(key)}</span>
                    <span className="text-foreground">{formatMetadataValue(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
            </TabsContent>

            <TabsContent value="comments" className="mt-0 space-y-2">
              <label className="block text-sm font-medium text-foreground">Comments</label>
              <div className="rounded-lg bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                Comment threads will appear here for marketing review and approvals.
              </div>
            </TabsContent>
          </div>
        </Tabs>

          </div>
        </div>
      </div>
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete asset?</DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-2xl font-semibold text-foreground">
              Share a link to {asset.originalFilename}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Configure public access settings and copy a short link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
              <div>
                <p className="text-base font-medium text-foreground">Enable Public Access</p>
                <p className="text-sm text-muted-foreground">Anyone with this link can view the asset.</p>
              </div>
              <Switch
                checked={sharePublicEnabled}
                disabled={isLoadingShare || isSavingShare}
                onCheckedChange={(checked) => void updateShareSettings({ publicEnabled: checked })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
              <div>
                <p className="text-base font-medium text-foreground">Allow Downloads</p>
                <p className="text-sm text-muted-foreground">Allow visitors to download from the public link.</p>
              </div>
              <Switch
                checked={shareAllowDownloads}
                disabled={isLoadingShare || isSavingShare || !sharePublicEnabled}
                onCheckedChange={(checked) => void updateShareSettings({ allowDownloads: checked })}
              />
            </div>
            <div className="space-y-2 pt-2">
              <p className="text-sm font-medium text-foreground">Share link</p>
              <div className="flex items-center gap-2">
                <Input
                  value={shareUrl}
                  readOnly
                  placeholder="Generating link..."
                  className="h-11"
                />
                <Button
                  type="button"
                  className="h-11 min-w-32"
                  onClick={() => void handleCopyShareLink()}
                  disabled={!shareUrl}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {shareCopyLabel}
                </Button>
              </div>
              {(isLoadingShare || isSavingShare) && (
                <p className="text-xs text-muted-foreground">
                  {isLoadingShare ? "Loading share settings..." : "Saving share settings..."}
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
