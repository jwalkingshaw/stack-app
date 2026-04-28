"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import NextImage from "next/image";
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
  MoreVertical,
  Plus,
  Tag as TagIcon,
  Trash,
  X,

  Expand,
  Palette,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/ui/modal-shells";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ASSET_STATUS_OPTIONS,
  ARTWORK_TYPE_OPTIONS,
  COLOR_PROFILE_OPTIONS,
  PRINT_VS_DIGITAL_OPTIONS,
  CERTIFICATION_OPTIONS,
  REGION_OPTIONS,
  WADA_RISK_OPTIONS,
  LICENSE_OWNERSHIP_OPTIONS,
  ENDORSEMENT_TYPE_OPTIONS,
  CHANNEL_OPTIONS,
} from "@stack-app/ui";
import { cn } from "@/lib/utils";
import { MultiSelect } from "@/components/ui/multi-select";
import { TagInput } from "@/components/dam/tag-input";
import {
  ProductLinkDialog,
  type ProductSelection,
  type VariantSummary,
  createEmptySelection,
} from "@/components/dam/product-link-dialog";
import type {
  AssetCategory,
  AssetCategoryAssignment,
  AssetTag,
  AssetTagAssignment,
  DamAsset,
} from "@stack-app/types";

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

type AssetVersionRecord = {
  id: string;
  versionNumber: number;
  filename: string;
  fileSize: number;
  mimeType: string;
  previewUrl?: string | null;
  changeComment?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  changedBy?: string | null;
  changedAt?: string | null;
  isCurrent: boolean;
};

type AssetVersionCreatedPayload = Record<string, unknown>;

type LinkedProductRecord = {
  id: string;
  productId: string;
  productName: string;
  sku?: string;
  brand?: string;
  linkType?: string;
  linkContext?: string;
};

type ApiResponsePayload<TData = unknown> = {
  data?: TData;
  error?: string;
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
  onVersionCreated?: (updatedAsset: AssetVersionCreatedPayload) => Promise<void> | void;
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

async function parseJsonSafely<T = unknown>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const toRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const normalizeLinkedProduct = (value: unknown): LinkedProductRecord | null => {
  const row = toRecord(value);
  if (!row) return null;

  const id = row.id;
  const productId = row.productId ?? row.product_id;
  if (typeof id !== "string" || typeof productId !== "string") {
    return null;
  }

  return {
    id,
    productId,
    productName:
      typeof row.productName === "string"
        ? row.productName
        : typeof row.product_name === "string"
          ? row.product_name
          : "",
    sku: typeof row.sku === "string" ? row.sku : undefined,
    brand: typeof row.brand === "string" ? row.brand : undefined,
    linkType:
      typeof row.linkType === "string"
        ? row.linkType
        : typeof row.link_type === "string"
          ? row.link_type
          : undefined,
    linkContext:
      typeof row.linkContext === "string"
        ? row.linkContext
        : typeof row.link_context === "string"
          ? row.link_context
          : undefined,
  };
};

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

const formatFolderBreadcrumb = (path?: string | null) => {
  if (!path) return "Unfiled";
  const parts = path.split("/").filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "Unfiled";
};

const asTagAssignments = (value: unknown): AssetTagAssignment[] =>
  Array.isArray(value) ? (value as AssetTagAssignment[]) : [];

const asCategoryAssignments = (value: unknown): AssetCategoryAssignment[] =>
  Array.isArray(value) ? (value as AssetCategoryAssignment[]) : [];

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
  onVersionCreated,
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
  const [linkedProducts, setLinkedProducts] = useState<LinkedProductRecord[]>([]);
  const [isLoadingLinkedProducts, setIsLoadingLinkedProducts] = useState(false);
  const [isUpdatingLinks, setIsUpdatingLinks] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState("info");

  const [viewerBackground, setViewerBackground] = useState<"dark" | "light" | "checker">("dark");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [versionHistory, setVersionHistory] = useState<AssetVersionRecord[]>([]);
  const [isLoadingVersionHistory, setIsLoadingVersionHistory] = useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState<string | null>(null);
  const [isUploadingVersion, setIsUploadingVersion] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [versionUploadError, setVersionUploadError] = useState<string | null>(null);
  const [versionChangeComment, setVersionChangeComment] = useState("");
  const [versionEffectiveFrom, setVersionEffectiveFrom] = useState("");
  const [versionEffectiveTo, setVersionEffectiveTo] = useState("");
  const [detailsSaveState, setDetailsSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [details, setDetails] = useState<{
    assetStatus: string;
    complianceStatus: string;
    brandLegalApproval: string;
    claimsReviewStatus: string;
    artworkType: string;
    colorProfile: string;
    printVsDigital: string;
    resolutionDpi: string;
    labelVersion: string;
    formulaVersion: string;
    altText: string;
    licenseOwnership: string;
    usageTerritory: string;
    usagePlatforms: string[];
    usageEnd: string;
    talentPresent: boolean;
    releaseOnFile: boolean;
    athleteNames: string[];
    endorsementType: string;
    talentContractEnd: string;
    ftcDisclosureRequired: boolean;
    certifications: string[];
    regulatoryRegion: string[];
    wadaRiskLevel: string;
    visibleClaims: string[];
    claimsApprovedMarkets: string[];
    expirationDate: string;
  }>({
    assetStatus: "", complianceStatus: "", brandLegalApproval: "", claimsReviewStatus: "",
    artworkType: "", colorProfile: "", printVsDigital: "", resolutionDpi: "", labelVersion: "",
    formulaVersion: "", altText: "", licenseOwnership: "", usageTerritory: "", usagePlatforms: [],
    usageEnd: "", talentPresent: false, releaseOnFile: false, athleteNames: [], endorsementType: "",
    talentContractEnd: "", ftcDisclosureRequired: false, certifications: [], regulatoryRegion: [],
    wadaRiskLevel: "", visibleClaims: [], claimsApprovedMarkets: [], expirationDate: "",
  });
  const [isProductLinkDialogOpen, setIsProductLinkDialogOpen] = useState(false);
  const [productLinkSelection, setProductLinkSelection] = useState<ProductSelection>(createEmptySelection());
  const [variantsByProductId, setVariantsByProductId] = useState<Record<string, VariantSummary[]>>({});
  const [variantsLoadingByProductId, setVariantsLoadingByProductId] = useState<Record<string, boolean>>({});
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");
  const detailsAutoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailsLastSavedRef = useRef<string>("");
  const viewerPaneRef = useRef<HTMLDivElement | null>(null);
  const versionFileInputRef = useRef<HTMLInputElement | null>(null);
  const canEditFields = canEdit;
  const brandQuerySuffix = useMemo(() => {
    const brand = (selectedBrandSlug || "").trim().toLowerCase();
    if (!brand) return "";
    const query = new URLSearchParams();
    query.set("brand", brand);
    return `?${query.toString()}`;
  }, [selectedBrandSlug]);

  const tagAssignments = useMemo(
    () => asTagAssignments(asset?.tagAssignments),
    [asset?.tagAssignments]
  );

  const categoryAssignments = useMemo(
    () => asCategoryAssignments(asset?.categoryAssignments),
    [asset?.categoryAssignments]
  );

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

    const initialTagIds = tagAssignments.map((assignment) => assignment.tagId);
    const initialCategoryIds = categoryAssignments.map(
      (assignment) => assignment.categoryId
    );
    const initialPrimary =
      categoryAssignments.find((assignment) => assignment.isPrimary)?.categoryId || null;

    return {
      filename: asset.filename,
      description: asset.description || "",
      tagIds: initialTagIds,
      categoryIds: initialCategoryIds,
      primaryCategoryId: initialPrimary,
      folderId: asset.folderId ?? null,
    };
  }, [asset, categoryAssignments, tagAssignments]);

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
    setVersionHistory([]);
    setIsLoadingVersionHistory(false);
    setVersionHistoryError(null);
    setIsUploadingVersion(false);
    setRestoringVersionId(null);
    setVersionUploadError(null);
    setVersionChangeComment("");
    setVersionEffectiveFrom("");
    setVersionEffectiveTo("");
    setDetails({
      assetStatus: asset.assetStatus || "",
      complianceStatus: asset.complianceStatus || "",
      brandLegalApproval: asset.brandLegalApproval || "",
      claimsReviewStatus: asset.claimsReviewStatus || "",
      artworkType: asset.artworkType || "",
      colorProfile: asset.colorProfile || "",
      printVsDigital: asset.printVsDigital || "",
      resolutionDpi: asset.resolutionDpi != null ? String(asset.resolutionDpi) : "",
      labelVersion: asset.labelVersion || "",
      formulaVersion: asset.formulaVersion || "",
      altText: asset.altText || "",
      licenseOwnership: asset.licenseOwnership || "",
      usageTerritory: asset.usageTerritory || "",
      usagePlatforms: asset.usagePlatforms || [],
      usageEnd: asset.usageEnd ? asset.usageEnd.slice(0, 10) : "",
      talentPresent: asset.talentPresent ?? false,
      releaseOnFile: asset.releaseOnFile ?? false,
      athleteNames: asset.athleteNames || [],
      endorsementType: asset.endorsementType || "",
      talentContractEnd: asset.talentContractEnd ? asset.talentContractEnd.slice(0, 10) : "",
      ftcDisclosureRequired: asset.ftcDisclosureRequired ?? false,
      certifications: asset.certifications || [],
      regulatoryRegion: asset.regulatoryRegion || [],
      wadaRiskLevel: asset.wadaRiskLevel || "",
      visibleClaims: asset.visibleClaims || [],
      claimsApprovedMarkets: asset.claimsApprovedMarkets || [],
      expirationDate: asset.expirationDate ? asset.expirationDate.slice(0, 10) : "",
    });
    setDetailsSaveState("idle");
    setIsProductLinkDialogOpen(false);
    setProductLinkSelection(createEmptySelection());
    setVariantsByProductId({});
    setVariantsLoadingByProductId({});
    detailsLastSavedRef.current = "";
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

  const activeFolderPath = useMemo(() => {
    if (!selectedFolderId) return null;
    const folder = folders.find((item) => item.id === selectedFolderId);
    return folder?.path || folder?.name || null;
  }, [folders, selectedFolderId]);

  const currentVersionSummary = useMemo(() => {
    if (!asset) {
      return {
        versionNumber: 1,
        changedAt: null as string | null,
        changedBy: null as string | null,
        comment: null as string | null,
        effectiveFrom: null as string | null,
        effectiveTo: null as string | null,
      };
    }
    return {
      versionNumber: Number(asset.currentVersionNumber || 1),
      changedAt: asset.currentVersionChangedAt || asset.updatedAt || null,
      changedBy: asset.currentVersionChangedBy || asset.createdBy || null,
      comment: asset.currentVersionComment || null,
      effectiveFrom: asset.currentVersionEffectiveFrom || null,
      effectiveTo: asset.currentVersionEffectiveTo || null,
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
      const payload = (await response.json()) as ApiResponsePayload<{
        productLinks?: unknown[];
      }>;
      const productLinks = Array.isArray(payload?.data?.productLinks)
        ? payload.data.productLinks
            .map((row) => normalizeLinkedProduct(row))
            .filter((row): row is LinkedProductRecord => row !== null)
        : [];
      setLinkedProducts(productLinks);
    } catch (error) {
      console.error("Failed to fetch linked products:", error);
      setLinkedProducts([]);
    } finally {
      setIsLoadingLinkedProducts(false);
    }
  }, [asset?.id, tenantSlug, brandQuerySuffix]);

  useEffect(() => {
    fetchLinkedProducts();
  }, [fetchLinkedProducts]);

  const fetchVersionHistory = useCallback(async () => {
    if (!asset?.id) {
      setVersionHistory([]);
      return;
    }

    setIsLoadingVersionHistory(true);
    setVersionHistoryError(null);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/assets/${asset.id}/versions${brandQuerySuffix}`
      );
      if (!response.ok) {
        const payload = await parseJsonSafely<ApiResponsePayload>(response);
        throw new Error(payload?.error || `Failed to load version history (${response.status})`);
      }
      const payload = await parseJsonSafely<ApiResponsePayload<AssetVersionRecord[]>>(response);
      setVersionHistory((Array.isArray(payload?.data) ? payload.data : []) as AssetVersionRecord[]);
    } catch (error) {
      console.error("Failed to fetch version history:", error);
      setVersionHistory([]);
      setVersionHistoryError(
        error instanceof Error ? error.message : "Failed to load version history."
      );
    } finally {
      setIsLoadingVersionHistory(false);
    }
  }, [asset?.id, tenantSlug, brandQuerySuffix]);

  useEffect(() => {
    if (!isOpen) return;
    fetchVersionHistory();
  }, [fetchVersionHistory, isOpen]);

  const handleCreateVersion = useCallback(
    async (file: File) => {
      if (!asset?.id) return;
      if (!file) return;

      setIsUploadingVersion(true);
      setVersionUploadError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (versionChangeComment.trim().length > 0) {
          formData.append("changeComment", versionChangeComment.trim());
        }
        if (versionEffectiveFrom.trim().length > 0) {
          formData.append("effectiveFrom", versionEffectiveFrom.trim());
        }
        if (versionEffectiveTo.trim().length > 0) {
          formData.append("effectiveTo", versionEffectiveTo.trim());
        }

        const response = await fetch(
          `/api/${tenantSlug}/assets/${asset.id}/versions${brandQuerySuffix}`,
          {
            method: "POST",
            body: formData,
          }
        );
        if (!response.ok) {
          const payload = await parseJsonSafely<ApiResponsePayload>(response);
          throw new Error(payload?.error || `Failed to create version (${response.status})`);
        }

        const payload = await parseJsonSafely<ApiResponsePayload<AssetVersionCreatedPayload>>(response);
        if (payload?.data && onVersionCreated) {
          await onVersionCreated(payload.data);
        }

        setVersionChangeComment("");
        setVersionEffectiveFrom("");
        setVersionEffectiveTo("");
        await fetchVersionHistory();
      } catch (error) {
        console.error("Failed to upload new asset version:", error);
        setVersionUploadError(
          error instanceof Error ? error.message : "Failed to upload version."
        );
      } finally {
        setIsUploadingVersion(false);
      }
    },
    [
      asset?.id,
      brandQuerySuffix,
      fetchVersionHistory,
      onVersionCreated,
      tenantSlug,
      versionChangeComment,
      versionEffectiveFrom,
      versionEffectiveTo,
    ]
  );

  const handleVersionFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await handleCreateVersion(file);
      event.target.value = "";
    },
    [handleCreateVersion]
  );

  const handleRestoreVersion = useCallback(
    async (version: AssetVersionRecord) => {
      if (!asset?.id) return;
      if (version.isCurrent) return;

      setRestoringVersionId(version.id);
      setVersionUploadError(null);
      try {
        const response = await fetch(
          `/api/${tenantSlug}/assets/${asset.id}/versions/restore${brandQuerySuffix}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ versionId: version.id }),
          }
        );
        if (!response.ok) {
          const payload = await parseJsonSafely<ApiResponsePayload>(response);
          throw new Error(payload?.error || `Failed to restore version (${response.status})`);
        }

        const payload = await parseJsonSafely<ApiResponsePayload<AssetVersionCreatedPayload>>(response);
        if (payload?.data && onVersionCreated) {
          await onVersionCreated(payload.data);
        }
        await fetchVersionHistory();
      } catch (error) {
        console.error("Failed to restore version:", error);
        setVersionUploadError(
          error instanceof Error ? error.message : "Failed to restore selected version."
        );
      } finally {
        setRestoringVersionId(null);
      }
    },
    [asset?.id, brandQuerySuffix, fetchVersionHistory, onVersionCreated, tenantSlug]
  );

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

  const handleDetailsSave = useCallback(async (payload: Record<string, unknown>) => {
    if (!asset?.id) return;
    setDetailsSaveState("saving");
    try {
      const response = await fetch(
        `/api/${tenantSlug}/assets/${asset.id}${brandQuerySuffix}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) throw new Error(`Save failed (${response.status})`);
      setDetailsSaveState("saved");
      setTimeout(() => setDetailsSaveState("idle"), 2000);
    } catch (error) {
      console.error("Failed to save asset details:", error);
      setDetailsSaveState("idle");
    }
  }, [asset?.id, tenantSlug, brandQuerySuffix]);

  const handleLoadVariants = useCallback(async (productId: string) => {
    setVariantsLoadingByProductId((prev) => ({ ...prev, [productId]: true }));
    try {
      const suffix = brandQuerySuffix ? `&${brandQuerySuffix.slice(1)}` : "";
      const response = await fetch(
        `/api/${tenantSlug}/products?parentId=${encodeURIComponent(productId)}${suffix}`
      );
      if (!response.ok) throw new Error(`Failed to load variants (${response.status})`);
      const payload = await response.json() as ApiResponsePayload<unknown[]>;
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const variants: VariantSummary[] = rows
        .map((v) => {
          const row = toRecord(v);
          if (!row) return null;
          const id = typeof row.id === "string" ? row.id : "";
          if (!id) return null;
          return {
            id,
            sku: typeof row.sku === "string" ? row.sku : undefined,
            productName: typeof row.productName === "string"
              ? row.productName
              : typeof row.name === "string" ? row.name : "Variant",
            parentId: productId,
            imageUrl: typeof row.imageUrl === "string" ? row.imageUrl : null,
          };
        })
        .filter((v) => v !== null) as VariantSummary[];
      setVariantsByProductId((prev) => ({ ...prev, [productId]: variants }));
    } catch (error) {
      console.error("Failed to load variants:", error);
      setVariantsByProductId((prev) => ({ ...prev, [productId]: [] }));
    } finally {
      setVariantsLoadingByProductId((prev) => ({ ...prev, [productId]: false }));
    }
  }, [tenantSlug, brandQuerySuffix]);

  const handleApplyProductLinks = useCallback(async () => {
    if (!asset?.id) return;
    const { all, productIds, variantIdsByProduct } = productLinkSelection;
    const requests: Array<{ productId: string }> = [];
    if (all) {
      availableProducts.forEach((p) => requests.push({ productId: p.id }));
    } else {
      productIds.forEach((id) => requests.push({ productId: id }));
      Object.entries(variantIdsByProduct).forEach(([, variantIds]) =>
        variantIds.forEach((id) => requests.push({ productId: id }))
      );
    }
    for (const req of requests) {
      try {
        await fetch(`/api/${tenantSlug}/product-links${brandQuerySuffix}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: req.productId,
            asset_id: asset.id,
            link_context: "asset_workspace",
            link_type: "manual",
            confidence: 1,
            match_reason: "Linked from asset workspace",
          }),
        });
      } catch (error) {
        console.error("Failed to link product:", error);
      }
    }
    setProductLinkSelection(createEmptySelection());
    await fetchLinkedProducts();
  }, [asset?.id, productLinkSelection, availableProducts, tenantSlug, brandQuerySuffix, fetchLinkedProducts]);

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

  useEffect(() => {
    if (!canEdit || !asset) return;

    if (detailsAutoSaveRef.current) clearTimeout(detailsAutoSaveRef.current);

    const snapshot = JSON.stringify(details);
    if (snapshot === detailsLastSavedRef.current) return;

    const payload: Record<string, unknown> = {
      talentPresent: details.talentPresent,
      releaseOnFile: details.releaseOnFile,
      ftcDisclosureRequired: details.ftcDisclosureRequired,
      usagePlatforms: details.usagePlatforms,
      athleteNames: details.athleteNames,
      certifications: details.certifications,
      regulatoryRegion: details.regulatoryRegion,
      visibleClaims: details.visibleClaims,
      claimsApprovedMarkets: details.claimsApprovedMarkets,
      ...(details.assetStatus && { assetStatus: details.assetStatus }),
      ...(details.complianceStatus && { complianceStatus: details.complianceStatus }),
      ...(details.brandLegalApproval && { brandLegalApproval: details.brandLegalApproval }),
      ...(details.claimsReviewStatus && { claimsReviewStatus: details.claimsReviewStatus }),
      ...(details.artworkType && { artworkType: details.artworkType }),
      ...(details.colorProfile && { colorProfile: details.colorProfile }),
      ...(details.printVsDigital && { printVsDigital: details.printVsDigital }),
      ...(details.labelVersion && { labelVersion: details.labelVersion }),
      ...(details.formulaVersion && { formulaVersion: details.formulaVersion }),
      ...(details.altText && { altText: details.altText }),
      ...(details.licenseOwnership && { licenseOwnership: details.licenseOwnership }),
      ...(details.usageTerritory && { usageTerritory: details.usageTerritory }),
      ...(details.usageEnd && { usageEnd: details.usageEnd }),
      ...(details.endorsementType && { endorsementType: details.endorsementType }),
      ...(details.talentContractEnd && { talentContractEnd: details.talentContractEnd }),
      ...(details.wadaRiskLevel && { wadaRiskLevel: details.wadaRiskLevel }),
      ...(details.expirationDate && { expirationDate: details.expirationDate }),
      ...(details.resolutionDpi && !isNaN(parseInt(details.resolutionDpi, 10)) && {
        resolutionDpi: parseInt(details.resolutionDpi, 10),
      }),
    };

    detailsAutoSaveRef.current = setTimeout(async () => {
      try {
        await handleDetailsSave(payload);
        detailsLastSavedRef.current = snapshot;
      } catch (error) {
        console.error("Details auto-save failed:", error);
      }
    }, 800);

    return () => {
      if (detailsAutoSaveRef.current) clearTimeout(detailsAutoSaveRef.current);
    };
  }, [canEdit, asset, details, handleDetailsSave]);

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

  // Keyboard shortcuts intentionally disabled.

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
  const primaryCategory = categoryAssignments.find((assignment) => assignment.isPrimary);

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
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between bg-white">
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
                <LoadingSkeleton size="sm" />
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
                  <NextImage
                    src={previewUrl}
                    alt={asset.originalFilename}
                    className="max-h-full max-w-full object-contain"
                    width={1280}
                    height={900}
                    unoptimized
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
          <div className="border-b border-gray-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <TabsList className="grid flex-1 grid-cols-5">
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="products">Products</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="versions">Versions</TabsTrigger>
                <TabsTrigger value="comments">Comments</TabsTrigger>
              </TabsList>
              {activeTab === "details" && detailsSaveState !== "idle" && (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
                  detailsSaveState === "saving"
                    ? "bg-muted text-muted-foreground"
                    : "bg-emerald-50 text-emerald-700"
                }`}>
                  {detailsSaveState === "saving" ? "Saving…" : "Saved ✓"}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="info" className="space-y-6 mt-0">


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
                {tagAssignments.length === 0 && (
                  <span className="text-sm text-muted-foreground">No tags assigned.</span>
                )}
                {tagAssignments.map((assignment) => (
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
                {categoryAssignments.length === 0 && (
                  <span className="text-sm text-muted-foreground">No categories assigned.</span>
                )}
                {categoryAssignments.map((assignment) => (
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
              <div className="pt-1">
                <Button
                  variant="secondary"
                  className="h-8 px-3 text-sm"
                  onClick={() => setIsProductLinkDialogOpen(true)}
                >
                  <Link2 className="mr-1 h-3.5 w-3.5" />
                  Add Product Link
                </Button>
              </div>
            )}
          </div>
            </TabsContent>

            <TabsContent value="details" className="mt-0">
              <div className="space-y-0 divide-y divide-border">

                {/* Section 1: Status & Approval */}
                <div className="px-1 py-5 space-y-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status & Approval</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Asset Status</label>
                      <Select value={details.assetStatus} onValueChange={(v) => setDetails((p) => ({ ...p, assetStatus: v }))} disabled={!canEdit}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
                        <SelectContent>
                          {ASSET_STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Compliance</label>
                      <Select value={details.complianceStatus} onValueChange={(v) => setDetails((p) => ({ ...p, complianceStatus: v }))} disabled={!canEdit}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pending">Pending Review</SelectItem>
                          <SelectItem value="Approved">Approved</SelectItem>
                          <SelectItem value="Rejected">Rejected</SelectItem>
                          <SelectItem value="Under Review">Under Review</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Brand / Legal</label>
                      <Select value={details.brandLegalApproval} onValueChange={(v) => setDetails((p) => ({ ...p, brandLegalApproval: v }))} disabled={!canEdit}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Approved">Approved</SelectItem>
                          <SelectItem value="Rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Claims Review</label>
                      <Select value={details.claimsReviewStatus} onValueChange={(v) => setDetails((p) => ({ ...p, claimsReviewStatus: v }))} disabled={!canEdit}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="challenged">Challenged</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Section 2: Classification */}
                <div className="px-1 py-5 space-y-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Classification</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                    <div className="col-span-2 space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Artwork Type</label>
                      <Select value={details.artworkType} onValueChange={(v) => setDetails((p) => ({ ...p, artworkType: v }))} disabled={!canEdit}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
                        <SelectContent>
                          {ARTWORK_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Colour Profile</label>
                      <Select value={details.colorProfile} onValueChange={(v) => setDetails((p) => ({ ...p, colorProfile: v }))} disabled={!canEdit}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
                        <SelectContent>
                          {COLOR_PROFILE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Use</label>
                      <Select value={details.printVsDigital} onValueChange={(v) => setDetails((p) => ({ ...p, printVsDigital: v }))} disabled={!canEdit}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
                        <SelectContent>
                          {PRINT_VS_DIGITAL_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Resolution (DPI)</label>
                      <Input
                        type="number"
                        value={details.resolutionDpi}
                        onChange={(e) => setDetails((p) => ({ ...p, resolutionDpi: e.target.value }))}
                        placeholder="e.g. 300"
                        disabled={!canEdit}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Label Version</label>
                      <Input
                        value={details.labelVersion}
                        onChange={(e) => setDetails((p) => ({ ...p, labelVersion: e.target.value }))}
                        placeholder="e.g. v3.2"
                        disabled={!canEdit}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Formula Version</label>
                      <Input
                        value={details.formulaVersion}
                        onChange={(e) => setDetails((p) => ({ ...p, formulaVersion: e.target.value }))}
                        placeholder="e.g. F-2024-03"
                        disabled={!canEdit}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Alt Text</label>
                      <Input
                        value={details.altText}
                        onChange={(e) => setDetails((p) => ({ ...p, altText: e.target.value }))}
                        placeholder="Describe the image for screen readers"
                        disabled={!canEdit}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Rights & Talent */}
                <div className="px-1 py-5 space-y-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Rights & Talent</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">License / Ownership</label>
                      <Select value={details.licenseOwnership} onValueChange={(v) => setDetails((p) => ({ ...p, licenseOwnership: v }))} disabled={!canEdit}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
                        <SelectContent>
                          {LICENSE_OWNERSHIP_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Usage Territory</label>
                      <Select value={details.usageTerritory} onValueChange={(v) => setDetails((p) => ({ ...p, usageTerritory: v }))} disabled={!canEdit}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
                        <SelectContent>
                          {REGION_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Approved Platforms</label>
                      <MultiSelect
                        options={CHANNEL_OPTIONS}
                        value={details.usagePlatforms}
                        onChange={(v) => setDetails((p) => ({ ...p, usagePlatforms: v }))}
                        disabled={!canEdit}
                        placeholder="Select platforms"
                      />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Rights Expiry</label>
                      <Input
                        type="date"
                        value={details.usageEnd}
                        onChange={(e) => setDetails((p) => ({ ...p, usageEnd: e.target.value }))}
                        disabled={!canEdit}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-2 flex items-center justify-between rounded-md bg-muted/40 px-3 py-2.5">
                      <label className="text-xs font-medium text-foreground">Talent Present</label>
                      <Switch
                        checked={details.talentPresent}
                        onCheckedChange={(v) => setDetails((p) => ({ ...p, talentPresent: v }))}
                        disabled={!canEdit}
                      />
                    </div>
                    {details.talentPresent && (
                      <>
                        <div className="col-span-2 flex items-center justify-between rounded-md bg-muted/40 px-3 py-2.5">
                          <label className="text-xs font-medium text-foreground">Release on File</label>
                          <Switch
                            checked={details.releaseOnFile}
                            onCheckedChange={(v) => setDetails((p) => ({ ...p, releaseOnFile: v }))}
                            disabled={!canEdit}
                          />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                          <label className="block text-xs font-medium text-foreground">Athlete / Talent Names</label>
                          <TagInput
                            value={details.athleteNames}
                            onChange={(v) => setDetails((p) => ({ ...p, athleteNames: v }))}
                            placeholder="Enter name, press Enter"
                            disabled={!canEdit}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-medium text-foreground">Endorsement Type</label>
                          <Select value={details.endorsementType} onValueChange={(v) => setDetails((p) => ({ ...p, endorsementType: v }))} disabled={!canEdit}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
                            <SelectContent>
                              {ENDORSEMENT_TYPE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-medium text-foreground">Contract End</label>
                          <Input
                            type="date"
                            value={details.talentContractEnd}
                            onChange={(e) => setDetails((p) => ({ ...p, talentContractEnd: e.target.value }))}
                            disabled={!canEdit}
                            className="h-8 text-xs"
                          />
                        </div>
                      </>
                    )}
                    <div className="col-span-2 flex items-center justify-between rounded-md bg-muted/40 px-3 py-2.5">
                      <label className="text-xs font-medium text-foreground">FTC Disclosure Required</label>
                      <Switch
                        checked={details.ftcDisclosureRequired}
                        onCheckedChange={(v) => setDetails((p) => ({ ...p, ftcDisclosureRequired: v }))}
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 4: Regulatory & Certifications */}
                <div className="px-1 py-5 space-y-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Regulatory & Certifications</p>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Certifications</label>
                      <MultiSelect
                        options={CERTIFICATION_OPTIONS}
                        value={details.certifications}
                        onChange={(v) => setDetails((p) => ({ ...p, certifications: v }))}
                        disabled={!canEdit}
                        placeholder="Select certifications"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Regulatory Regions</label>
                      <MultiSelect
                        options={REGION_OPTIONS}
                        value={details.regulatoryRegion}
                        onChange={(v) => setDetails((p) => ({ ...p, regulatoryRegion: v }))}
                        disabled={!canEdit}
                        placeholder="Select regions"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">WADA Risk</label>
                      <Select value={details.wadaRiskLevel} onValueChange={(v) => setDetails((p) => ({ ...p, wadaRiskLevel: v }))} disabled={!canEdit}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
                        <SelectContent>
                          {WADA_RISK_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Visible Claims</label>
                      <TagInput
                        value={details.visibleClaims}
                        onChange={(v) => setDetails((p) => ({ ...p, visibleClaims: v }))}
                        placeholder='e.g. "30g Protein", press Enter'
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">Claims Approved For</label>
                      <MultiSelect
                        options={REGION_OPTIONS}
                        value={details.claimsApprovedMarkets}
                        onChange={(v) => setDetails((p) => ({ ...p, claimsApprovedMarkets: v }))}
                        disabled={!canEdit}
                        placeholder="Select markets"
                      />
                    </div>
                  </div>
                </div>

              </div>
            </TabsContent>

            <TabsContent value="versions" className="mt-0 space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">Current version</label>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground space-y-1">
                  <div>
                    Version: <span className="text-foreground">v{currentVersionSummary.versionNumber}</span>
                  </div>
                  <div>
                    Updated:{" "}
                    <span className="text-foreground">
                      {currentVersionSummary.changedAt
                        ? formatDate(currentVersionSummary.changedAt)
                        : "Unknown"}
                    </span>
                  </div>
                  {currentVersionSummary.effectiveFrom || currentVersionSummary.effectiveTo ? (
                    <div>
                      Effective window:{" "}
                      <span className="text-foreground">
                        {currentVersionSummary.effectiveFrom
                          ? formatDate(currentVersionSummary.effectiveFrom)
                          : "Now"}
                        {" - "}
                        {currentVersionSummary.effectiveTo
                          ? formatDate(currentVersionSummary.effectiveTo)
                          : "Open"}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              {canEdit && (
                <div className="space-y-3 rounded-lg border border-border/60 bg-card p-3">
                  <label className="block text-sm font-medium text-foreground">
                    Replace with new version
                  </label>
                  <input
                    ref={versionFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(event) => void handleVersionFileInputChange(event)}
                  />
                  <Textarea
                    value={versionChangeComment}
                    onChange={(event) => setVersionChangeComment(event.target.value)}
                    placeholder="Optional change comment"
                    rows={2}
                    className="border-border/60"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      type="date"
                      value={versionEffectiveFrom}
                      onChange={(event) => setVersionEffectiveFrom(event.target.value)}
                    />
                    <Input
                      type="date"
                      value={versionEffectiveTo}
                      onChange={(event) => setVersionEffectiveTo(event.target.value)}
                    />
                  </div>
                  {versionUploadError ? (
                    <p className="text-xs text-destructive">{versionUploadError}</p>
                  ) : null}
                  <Button
                    type="button"
                    variant="accent-blue"
                    className="h-9 px-3"
                    disabled={isUploadingVersion}
                    onClick={() => versionFileInputRef.current?.click()}
                  >
                    {isUploadingVersion ? "Uploading..." : "Browse and upload new version"}
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">Version history</label>
                <div className="rounded-lg border border-border/60">
                  {isLoadingVersionHistory ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground">Loading versions...</div>
                  ) : versionHistoryError ? (
                    <div className="px-3 py-4 text-sm text-destructive">{versionHistoryError}</div>
                  ) : versionHistory.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground">
                      No versions available yet.
                    </div>
                  ) : (
                    versionHistory.map((version, index) => (
                      (() => {
                        const versionPreviewUrl =
                          typeof version.previewUrl === "string" && version.previewUrl.trim().length > 0
                            ? version.previewUrl
                            : null;
                        const hasImagePreview =
                          String(version.mimeType || "").toLowerCase().startsWith("image/") &&
                          Boolean(versionPreviewUrl);

                        return (
                          <div
                            key={version.id}
                            className={cn(
                              "space-y-1 px-3 py-3 text-sm",
                              index !== versionHistory.length - 1 && "border-b border-gray-200"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">v{version.versionNumber}</span>
                                {version.isCurrent ? (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Latest
                                  </Badge>
                                ) : null}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {version.changedAt ? formatDate(version.changedAt) : "Unknown"}
                              </span>
                            </div>
                            <div className="mt-2 flex items-start gap-3">
                              {hasImagePreview ? (
                                <div className="h-16 w-16 overflow-hidden rounded-md border border-border/60 bg-muted/20">
                                  <NextImage
                                    src={versionPreviewUrl || ""}
                                    alt={`${version.filename} preview`}
                                    className="h-full w-full object-contain bg-white"
                                    loading="lazy"
                                    width={64}
                                    height={64}
                                    unoptimized
                                  />
                                </div>
                              ) : null}
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="truncate text-xs text-muted-foreground">{version.filename}</div>
                                <div className="text-xs text-muted-foreground">
                                  {version.mimeType || "unknown"} | {formatFileSize(version.fileSize || 0)}
                                </div>
                                {version.changeComment ? (
                                  <div className="text-xs text-foreground">{version.changeComment}</div>
                                ) : null}
                                {version.effectiveFrom || version.effectiveTo ? (
                                  <div className="text-xs text-muted-foreground">
                                    Effective: {version.effectiveFrom ? formatDate(version.effectiveFrom) : "Now"}
                                    {" - "}
                                    {version.effectiveTo ? formatDate(version.effectiveTo) : "Open"}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            {!version.isCurrent && canEdit ? (
                              <div className="pt-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  disabled={Boolean(restoringVersionId)}
                                  onClick={() => void handleRestoreVersion(version)}
                                >
                                  {restoringVersionId === version.id ? "Restoring..." : "Restore as latest"}
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()
                    ))
                  )}
                </div>
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
      <DeleteConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete asset?"
        description="This action cannot be undone."
        onConfirm={() => void handleDelete()}
        confirmLoading={isDeleting}
      />
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

      <ProductLinkDialog
        open={isProductLinkDialogOpen}
        onOpenChange={setIsProductLinkDialogOpen}
        title="Link Products"
        description="Select products or variants to link to this asset."
        actionLabel="Apply"
        products={availableProducts.map((p) => ({
          id: p.id,
          sku: p.sku,
          productName: p.productName ?? "",
          brand: p.brand,
        }))}
        variantsByProductId={variantsByProductId}
        variantsLoadingByProductId={variantsLoadingByProductId}
        selection={productLinkSelection}
        onChange={setProductLinkSelection}
        onLoadVariants={(productId) => void handleLoadVariants(productId)}
        onApply={() => void handleApplyProductLinks()}
      />
    </>
  );
}

