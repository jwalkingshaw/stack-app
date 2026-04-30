"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  ImageIcon,
  ExternalLink,
  Info,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Upload,
  Folder,
  FolderOpen,
  Search,
  FileText,
  LayoutGrid,
  Globe,
  Users,
  History,
  X,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@stack-app/ui";
import { buildTenantPathForScope } from "@/lib/tenant-view-scope";
import { DamAssetCard } from "@/components/dam/dam-asset-card";

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type DamAssetLike = {
  id: string;
  filename?: string;
  original_filename?: string;
  mime_type?: string;
  file_type?: string;
  file_size?: number | null;
  thumbnail_urls?: Record<string, string> | null;
  s3_url?: string | null;
  current_version_number?: number | null;
  current_version_changed_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

type ProductLinkLike = {
  id: string;
  asset_id?: string;
  document_slot_code?: string | null;
  variant_id?: string | null;
  link_context?: string;
  link_type?: string;
  confidence?: number;
  dam_assets?: DamAssetLike | null;
  [key: string]: unknown;
};

type ProductImageSlot = { code: string; label: string; hint: string };

type SlotAssignmentContext = {
  slotCode: string;
  slotLabel: string;
  assetType: "image" | "document";
  acceptMode: "image" | "document";
  productFieldId?: string | null;
  replaceExistingSlot: boolean;
  existingAssetId?: string | null;
};

type FolderRecord = {
  id: string;
  name: string;
  path?: string | null;
  parentId?: string | null;
  parent_id?: string | null;
};

type DocumentSlotField = {
  fieldId: string;
  fieldCode: string;
  slotCode: string;
  label: string;
  hint: string;
  allowMultiple: boolean;
};

export type MediaSubTab = "browse" | "slots" | "variants" | "destination";

export type VariantSummary = {
  id: string;
  sku?: string | null;
  product_name?: string | null;
  status?: string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VARIANT_IMAGE_SLOTS: ProductImageSlot[] = [
  { code: "image_front",          label: "Front Panel",           hint: "Variant-specific front-of-pack view." },
  { code: "label_print_ready",    label: "Label (Print-Ready)",   hint: "CMYK ≥300dpi with bleeds — for printers." },
  { code: "label_digital",        label: "Label (Digital)",       hint: "sRGB version for Amazon, website, and digital channels." },
  { code: "label_regulatory",     label: "Label (Regulatory)",    hint: "FDA/EU-approved PDF for regulatory submissions." },
  { code: "supplement_facts_panel", label: "Supplement Facts Panel", hint: "Extracted Supplement/Nutrition Facts panel for this variant." },
  { code: "image_lifestyle",      label: "Lifestyle",             hint: "Variant-specific lifestyle or flavour shot." },
];

const PRIMARY_DOCUMENT_SLOT_CODES = new Set(["coa", "legal", "sfp"]);

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function isImageLikeAsset(asset: unknown): boolean {
  if (!asset || typeof asset !== "object") return false;
  const a = asset as Record<string, unknown>;
  const mime = String(a.mime_type ?? "").toLowerCase();
  const ftype = String(a.file_type ?? "").toLowerCase();
  return mime.startsWith("image/") || ["jpg","jpeg","png","gif","webp","svg","avif"].includes(ftype);
}

function isDocumentLikeAsset(asset: unknown): boolean {
  if (!asset || typeof asset !== "object") return false;
  if (isImageLikeAsset(asset)) return false;
  const a = asset as Record<string, unknown>;
  const mime = String(a.mime_type ?? "").toLowerCase();
  const ftype = String(a.file_type ?? "").toLowerCase();
  return (
    mime.startsWith("application/") ||
    mime.startsWith("text/") ||
    ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"].includes(ftype)
  );
}

function hasDraggedFiles(e: React.DragEvent): boolean {
  return e.dataTransfer.types?.includes("Files") || e.dataTransfer.types?.includes("application/x-moz-file");
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProductMediaCenterProps {
  tenantSlug: string;
  productId: string;
  productName?: string | null;
  productType?: string | null;
  isSharedBrandView: boolean;
  selectedBrandSlug?: string | null;

  linkedAssets: ProductLinkLike[];
  loadingLinkedAssets: boolean;
  linkedAssetsError: string | null;
  slotUploadError: string | null;
  isMutatingLinks: boolean;
  uploadingSlotCode: string | null;
  dragOverSlotCode: string | null;
  imageSlotLinks: Record<string, ProductLinkLike | null>;
  nonSlotLinkedAssets: ProductLinkLike[];
  visibleImageSlots: ProductImageSlot[];
  showMissingOnlyImageSlots: boolean;
  showAllImageSlots: boolean;
  assetFolders: FolderRecord[];
  selectedUploadFolderId: string;
  slotFileInputRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  variants?: VariantSummary[];

  // Sidebar navigation props
  mediaSubTab?: MediaSubTab;
  onSetMediaSubTab?: (tab: MediaSubTab) => void;
  documentationSlotFields?: DocumentSlotField[];
  documentSlotLinksByFieldId?: Record<string, ProductLinkLike | null>;
  destinationTabContent?: React.ReactNode;
  outputProfiles?: Array<{ id: string; name: string; code: string; profile_type: string }>;
  onSelectDestinationProfile?: (profileId: string) => void;
  activeDestinationProfileId?: string | null;

  onSetDragOverSlotCode: (code: string | null) => void;
  onSetSelectedUploadFolderId: (id: string) => void;
  onSetShowMissingOnlyImageSlots: React.Dispatch<React.SetStateAction<boolean>>;
  onSetShowAllImageSlots: React.Dispatch<React.SetStateAction<boolean>>;
  onSlotDrop: (ctx: SlotAssignmentContext, e: React.DragEvent) => void;
  onSlotFileInputChange: (ctx: SlotAssignmentContext, e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenAssignSlotDialog: (ctx: SlotAssignmentContext, existing?: ProductLinkLike | null) => void;
  onOpenSlotVersionDialog: (ctx: SlotAssignmentContext) => void;
  onOpenVersionHistoryDialog: (label: string, assetId?: string | null) => void;
  onUnlinkAsset: (linkId: string) => void;
  onRelinkAsset: (link: ProductLinkLike) => void;
  onOpenLinkDialog: () => void;
  onFetchAssetFolders: () => Promise<void>;
  onOpenCreateFolderDialog: () => void;
  buildAssetPreviewPath: (assetId: string, token?: string | null) => string;
  onUploadVariantSlot?: (variantId: string, slotCode: string, file: File) => Promise<boolean>;
  onRefreshLinkedAssets?: () => void;
  onAssetVersionCreated?: () => void;
}

// ---------------------------------------------------------------------------
// VariantCoverageRow
// ---------------------------------------------------------------------------

function VariantCoverageRow({
  variant,
  slots,
  slotMap,
  isExpanded,
  onToggle,
  isSharedBrandView,
  onUploadVariantSlot,
  onUnlinkVariantAsset,
}: {
  variant: VariantSummary;
  slots: ProductImageSlot[];
  slotMap: Record<string, ProductLinkLike>;
  isExpanded: boolean;
  onToggle: () => void;
  isSharedBrandView: boolean;
  onUploadVariantSlot?: (variantId: string, slotCode: string, file: File) => Promise<boolean>;
  onUnlinkVariantAsset?: (linkId: string) => void;
}) {
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const assignedCount = slots.filter((s) => Boolean(slotMap[s.code])).length;
  const label = variant.product_name || variant.sku || variant.id;

  const handleFileChange = async (slotCode: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadVariantSlot) return;
    setUploadingSlot(slotCode);
    try {
      await onUploadVariantSlot(variant.id, slotCode, file);
    } finally {
      setUploadingSlot(null);
      if (fileInputRefs.current[slotCode]) fileInputRefs.current[slotCode]!.value = "";
    }
  };

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <span className="w-4 h-4 shrink-0 text-muted-foreground">
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">{label}</span>
          {variant.sku && variant.product_name && (
            <span className="ml-2 text-xs text-muted-foreground">{variant.sku}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {slots.map((slot) => (
            <span
              key={slot.code}
              title={slot.label}
              className={`inline-block w-2 h-2 rounded-full ${
                slotMap[slot.code] ? "bg-emerald-500" : "bg-transparent border border-border"
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground shrink-0 w-12 text-right">
          {assignedCount}/{slots.length}
        </span>
      </button>

      {isExpanded && (
        <div className="divide-y divide-border/40 bg-muted/5">
          {slots.map((slot) => {
            const link = slotMap[slot.code] ?? null;
            const asset = link?.dam_assets ?? null;
            const thumbUrl =
              asset?.thumbnail_urls?.small ?? asset?.thumbnail_urls?.medium ?? asset?.s3_url ?? null;
            const isUploading = uploadingSlot === slot.code;

            return (
              <div
                key={slot.code}
                className="flex items-center gap-3 px-8 py-2.5 bg-background hover:bg-muted/20 transition-colors"
              >
                <div className="w-10 h-10 shrink-0 rounded overflow-hidden bg-muted flex items-center justify-center border border-border/60">
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbUrl}
                      alt={asset?.original_filename ?? asset?.filename ?? ""}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground">{slot.label}</span>
                    {link ? (
                      <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        Assigned
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Empty
                      </span>
                    )}
                  </div>
                  {link && asset ? (
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {asset.original_filename ?? asset.filename}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">{slot.hint}</p>
                  )}
                </div>

                {!isSharedBrandView && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onUploadVariantSlot && (
                      <>
                        <input
                          ref={(node) => { fileInputRefs.current[slot.code] = node; }}
                          type="file"
                          accept="image/*,.pdf,.doc,.docx"
                          className="hidden"
                          onChange={(e) => void handleFileChange(slot.code, e)}
                        />
                        <Button
                          size="sm"
                          variant={link ? "outline" : "accent-blue"}
                          className="h-7 px-2 text-xs"
                          disabled={isUploading}
                          onClick={() => fileInputRefs.current[slot.code]?.click()}
                        >
                          {isUploading ? "Uploading..." : link ? "Replace" : (
                            <><Upload className="w-3 h-3 mr-1" />Add</>
                          )}
                        </Button>
                      </>
                    )}
                    {link && onUnlinkVariantAsset && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => onUnlinkVariantAsset(link.id)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProductMediaCenter
// ---------------------------------------------------------------------------

export function ProductMediaCenter({
  tenantSlug,
  productId,
  productName: _productName,
  productType,
  isSharedBrandView,
  selectedBrandSlug,
  linkedAssets,
  loadingLinkedAssets,
  linkedAssetsError,
  slotUploadError,
  isMutatingLinks,
  uploadingSlotCode,
  dragOverSlotCode,
  imageSlotLinks,
  nonSlotLinkedAssets: _nonSlotLinkedAssets,
  visibleImageSlots,
  showMissingOnlyImageSlots,
  showAllImageSlots,
  assetFolders,
  selectedUploadFolderId: _selectedUploadFolderId,
  slotFileInputRefs,
  variants,
  mediaSubTab,
  onSetMediaSubTab,
  documentationSlotFields,
  documentSlotLinksByFieldId,
  destinationTabContent,
  outputProfiles,
  onSelectDestinationProfile,
  activeDestinationProfileId,
  onSetDragOverSlotCode,
  onSetSelectedUploadFolderId: _onSetSelectedUploadFolderId,
  onSetShowMissingOnlyImageSlots,
  onSetShowAllImageSlots,
  onSlotDrop,
  onSlotFileInputChange,
  onOpenAssignSlotDialog,
  onOpenSlotVersionDialog,
  onOpenVersionHistoryDialog,
  onUnlinkAsset,
  onRelinkAsset: _onRelinkAsset,
  onOpenLinkDialog,
  onFetchAssetFolders,
  onOpenCreateFolderDialog: _onOpenCreateFolderDialog,
  buildAssetPreviewPath,
  onUploadVariantSlot,
  onRefreshLinkedAssets,
  onAssetVersionCreated,
}: ProductMediaCenterProps) {
  // ── Internal state ─────────────────────────────────────────────────────────
  const [expandedVariantIds, setExpandedVariantIds] = useState<Set<string>>(new Set());
  const [sidebarMode, setSidebarMode] = useState<"images" | "documents" | "browse" | "variants" | "destination">("images");
  const [mediaFolderId, setMediaFolderId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [assetFilterFileType, setAssetFilterFileType] = useState<"all" | "image" | "document" | "other">("all");
  const [showMissingOnlyDocumentSlots, setShowMissingOnlyDocumentSlots] = useState(false);
  const [showAllDocumentSlots, setShowAllDocumentSlots] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  // Quick panel state
  const [panelAssetId, setPanelAssetId] = useState<string | null>(null);
  const [panelVersions, setPanelVersions] = useState<Array<Record<string, unknown>>>([]);
  const [panelVersionsLoading, setPanelVersionsLoading] = useState(false);
  const [panelAddingVersion, setPanelAddingVersion] = useState(false);
  const panelFileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync external mediaSubTab → sidebarMode (for readiness-section navigation)
  React.useEffect(() => {
    if (mediaSubTab === "destination") setSidebarMode("destination");
    else if (mediaSubTab === "slots") setSidebarMode("images");
  }, [mediaSubTab]);

  const docSlots = documentationSlotFields ?? [];
  const docSlotLinks = documentSlotLinksByFieldId ?? {};

  const hasVariants = Array.isArray(variants) && variants.length > 0;
  const isParentProduct = productType === "parent" || hasVariants;

  // ── Memos ──────────────────────────────────────────────────────────────────

  const displayedLinkedAssets = useMemo(() => {
    return linkedAssets.filter((link) => {
      const asset = link.dam_assets;
      if (!asset) return false;
      if (mediaFolderId) {
        const af = (asset as Record<string, unknown>).folder_id ?? (asset as Record<string, unknown>).folderId;
        if (af !== mediaFolderId) return false;
      }
      if (assetSearchQuery.trim()) {
        const q = assetSearchQuery.toLowerCase();
        if (!((asset.filename ?? "").toLowerCase().includes(q))) return false;
      }
      if (assetFilterFileType !== "all") {
        const isImg = isImageLikeAsset(asset);
        const isDoc = isDocumentLikeAsset(asset);
        if (assetFilterFileType === "image" && !isImg) return false;
        if (assetFilterFileType === "document" && !isDoc) return false;
        if (assetFilterFileType === "other" && (isImg || isDoc)) return false;
      }
      return true;
    });
  }, [linkedAssets, mediaFolderId, assetSearchQuery, assetFilterFileType]);

  const visibleDocumentSlotFields = useMemo(() => {
    if (showMissingOnlyDocumentSlots) {
      return docSlots.filter((slot) => !Boolean(docSlotLinks[slot.fieldId]));
    }
    if (showAllDocumentSlots) return docSlots;
    const primary = docSlots.filter((slot) => PRIMARY_DOCUMENT_SLOT_CODES.has(slot.slotCode));
    return primary.length > 0 ? primary : docSlots.slice(0, Math.min(3, docSlots.length));
  }, [docSlots, docSlotLinks, showMissingOnlyDocumentSlots, showAllDocumentSlots]);

  const variantCoverageMap = useMemo(() => {
    const map: Record<string, Record<string, ProductLinkLike>> = {};
    for (const link of linkedAssets) {
      const vid = typeof link.variant_id === "string" ? link.variant_id : null;
      const slot = link.document_slot_code ?? null;
      if (!vid || !slot) continue;
      if (!map[vid]) map[vid] = {};
      map[vid][slot] = link;
    }
    return map;
  }, [linkedAssets]);

  // Folder tree helpers
  const idToFolder = useMemo(
    () => new Map(assetFolders.map((f) => [f.id, f])),
    [assetFolders]
  );

  const getDepth = (folder: FolderRecord): number => {
    const parentId = folder.parentId ?? folder.parent_id;
    if (!parentId) return 0;
    const parent = idToFolder.get(parentId);
    return parent ? 1 + getDepth(parent) : 0;
  };

  // Only show folders that contain a linked asset, plus their ancestors
  const relevantFolderIds = useMemo(() => {
    const directIds = new Set<string>();
    for (const link of linkedAssets) {
      const asset = link.dam_assets;
      if (!asset) continue;
      const fid = (asset as Record<string, unknown>).folder_id ?? (asset as Record<string, unknown>).folderId;
      if (typeof fid === "string") directIds.add(fid);
    }
    const relevant = new Set<string>();
    const addWithAncestors = (folderId: string) => {
      if (relevant.has(folderId)) return;
      relevant.add(folderId);
      const folder = idToFolder.get(folderId);
      const parentId = folder?.parentId ?? folder?.parent_id;
      if (parentId) addWithAncestors(parentId);
    };
    for (const fid of directIds) addWithAncestors(fid);
    return relevant;
  }, [linkedAssets, idToFolder]);

  const visibleFolders = useMemo(() => {
    return assetFolders
      .filter((f) => {
        if (relevantFolderIds.size > 0 && !relevantFolderIds.has(f.id)) return false;
        const parentId = f.parentId ?? f.parent_id;
        return !parentId || expandedFolderIds.has(parentId);
      })
      .sort((a, b) => (a.path ?? a.name).localeCompare(b.path ?? b.name));
  }, [assetFolders, expandedFolderIds, relevantFolderIds]);

  const variantFilteredAssets = useMemo(() => {
    if (sidebarMode !== "variants") return [];
    return linkedAssets.filter((link) => {
      if (!selectedVariantId) return true;
      const vid = (link as Record<string, unknown>).variant_id ?? null;
      return vid === null || vid === selectedVariantId;
    });
  }, [linkedAssets, sidebarMode, selectedVariantId]);

  const toggleVariant = (id: string) =>
    setExpandedVariantIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleFolder = (folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  };

  const fetchPanelVersions = async (assetId: string) => {
    setPanelVersionsLoading(true);
    try {
      const res = await fetch(`/api/${tenantSlug}/assets/${assetId}/versions`);
      if (res.ok) {
        const json = await res.json() as { data?: unknown };
        setPanelVersions(Array.isArray(json.data) ? (json.data as Array<Record<string, unknown>>) : []);
      }
    } finally {
      setPanelVersionsLoading(false);
    }
  };

  const openPanel = (assetId: string) => {
    setPanelAssetId(assetId);
    void fetchPanelVersions(assetId);
  };

  const closePanel = () => {
    setPanelAssetId(null);
    setPanelVersions([]);
  };

  const handlePanelAddVersion = async (file: File) => {
    if (!panelAssetId) return;
    setPanelAddingVersion(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/${tenantSlug}/assets/${panelAssetId}/versions`, { method: "POST", body: fd });
      if (res.ok) {
        onAssetVersionCreated?.();
        onRefreshLinkedAssets?.();
        void fetchPanelVersions(panelAssetId);
      }
    } finally {
      setPanelAddingVersion(false);
      if (panelFileInputRef.current) panelFileInputRef.current.value = "";
    }
  };

  const handleUnlinkVariantAsset = async (linkId: string) => {
    await fetch(`/api/${tenantSlug}/product-links/${linkId}`, { method: "DELETE" });
    onRefreshLinkedAssets?.();
  };

  // The asset currently shown in the quick panel
  const panelAsset = useMemo(() => {
    if (!panelAssetId) return null;
    for (const link of linkedAssets) {
      const id = (link as Record<string, unknown>).asset_id ?? link.dam_assets?.id;
      if (id === panelAssetId) return link.dam_assets ?? null;
    }
    return null;
  }, [panelAssetId, linkedAssets]);

  const assignedCount = Object.values(imageSlotLinks).filter(Boolean).length;
  const totalSlots = Object.keys(imageSlotLinks).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex -mx-6 min-h-[600px]">

      {/* ── LEFT: sidebar navigation ─────────────────────────────────────── */}
      <aside className="w-56 shrink-0 border-r border-border/60 overflow-y-auto py-3">

        {/* Images + Documents entries */}
        <div className="px-2 mb-1 space-y-0.5">
          <button
            type="button"
            onClick={() => { setSidebarMode("images"); onSetMediaSubTab?.("slots"); }}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors ${
              sidebarMode === "images"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-4 w-4 shrink-0" />
            Images
          </button>
          <button
            type="button"
            onClick={() => { setSidebarMode("documents"); onSetMediaSubTab?.("slots"); }}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors ${
              sidebarMode === "documents"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4 shrink-0" />
            Documents
          </button>
        </div>

        {/* Assets section */}
        <div className="mx-2 my-2 border-t border-border/40" />
        <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Assets
        </div>

        <div
          className="px-2 space-y-0.5"
          onMouseEnter={() => { if (assetFolders.length === 0) void onFetchAssetFolders(); }}
        >
          {/* All assets */}
          <button
            type="button"
            onClick={() => { setSidebarMode("browse"); setMediaFolderId(null); onSetMediaSubTab?.("browse"); }}
            className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
              sidebarMode === "browse" && !mediaFolderId
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            {sidebarMode === "browse" && !mediaFolderId
              ? <FolderOpen className="h-4 w-4 shrink-0 text-[#2F6BFF]" />
              : <Folder className="h-4 w-4 shrink-0" />}
            All assets
          </button>

          {/* Folder tree */}
          {visibleFolders.map((folder) => {
            const depth = getDepth(folder);
            const isActive = sidebarMode === "browse" && mediaFolderId === folder.id;
            const isExpanded = expandedFolderIds.has(folder.id);
            const folderHasChildren = assetFolders.some(
              (f) => (f.parentId ?? f.parent_id) === folder.id
            );
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => {
                  setSidebarMode("browse");
                  setMediaFolderId(folder.id);
                  onSetMediaSubTab?.("browse");
                  if (folderHasChildren) toggleFolder(folder.id);
                }}
                style={{ paddingLeft: `${8 + depth * 14}px` }}
                className={`flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                {folderHasChildren
                  ? <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  : <span className="w-3.5 shrink-0" />}
                {isActive
                  ? <FolderOpen className="h-4 w-4 shrink-0 text-[#2F6BFF]" />
                  : <Folder className="h-4 w-4 shrink-0" />}
                <span className="truncate">{folder.name}</span>
              </button>
            );
          })}
        </div>

        {/* Variants section — shown for parent products with variants */}
        {isParentProduct && hasVariants && (
          <>
            <div className="mx-2 my-2 border-t border-border/40" />
            <div className="px-2 space-y-0.5">
              <button
                type="button"
                onClick={() => { setSidebarMode("variants"); onSetMediaSubTab?.("browse"); }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors ${
                  sidebarMode === "variants"
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                <Users className="h-4 w-4 shrink-0" />
                Variants
              </button>
            </div>
          </>
        )}

        {/* Destinations section */}
        {outputProfiles && outputProfiles.length > 0 && (
          <>
            <div className="mx-2 my-2 border-t border-border/40" />
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Destinations
            </div>
            <div className="px-2 space-y-0.5">
              {outputProfiles.map((profile) => {
                const isActive = sidebarMode === "destination" && activeDestinationProfileId === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => {
                      setSidebarMode("destination");
                      onSelectDestinationProfile?.(profile.id);
                      onSetMediaSubTab?.("destination");
                    }}
                    className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    <Globe className={`h-4 w-4 shrink-0 ${isActive ? "text-[#2F6BFF]" : ""}`} />
                    <span className="truncate">{profile.name}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </aside>

      {/* ── RIGHT: main content ───────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto px-6 py-4 space-y-4">

        {/* Action buttons (always visible) + search (browse only) */}
        <div className="flex flex-wrap items-center gap-3">
          {sidebarMode === "browse" && (
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={assetSearchQuery}
                onChange={(e) => setAssetSearchQuery(e.target.value)}
                placeholder="Search assets…"
                className="h-8 pl-8 text-xs"
              />
            </div>
          )}
          <div className="flex-1" />
          {!isSharedBrandView ? (
            <div className="flex items-center gap-2">
              <Button variant="accent-blue" size="sm" onClick={onOpenLinkDialog}>
                Link assets
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={buildTenantPathForScope({
                    tenantSlug,
                    scope: selectedBrandSlug || null,
                    suffix: `/assets?product=${encodeURIComponent(productId)}`,
                  })}
                >
                  Open in Assets <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Asset linking disabled in shared brand view.
            </div>
          )}
        </div>

        {/* File type filter pills — browse mode only */}
        {sidebarMode === "browse" && (
          <div className="flex items-center gap-1.5">
            {(["all", "image", "document", "other"] as const).map((ft) => (
              <button
                key={ft}
                type="button"
                onClick={() => setAssetFilterFileType(ft)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  assetFilterFileType === ft
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {ft === "all" ? "All types" : ft === "image" ? "Images" : ft === "document" ? "Documents" : "Other"}
              </button>
            ))}
          </div>
        )}

        {/* Loading skeleton (browse / variants mode) */}
        {(sidebarMode === "browse" || sidebarMode === "variants") && loadingLinkedAssets && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse overflow-hidden rounded-lg border border-border/60">
                <div className="aspect-square bg-muted" />
                <div className="flex flex-col gap-1.5 p-2">
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error banners */}
        {linkedAssetsError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {linkedAssetsError}
          </div>
        )}
        {slotUploadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {slotUploadError}
          </div>
        )}

        {!loadingLinkedAssets && !linkedAssetsError && (
          <>
            {/* ── Browse: asset grid ──────────────────────────────────────── */}
            {sidebarMode === "browse" && (
              <div>
                {displayedLinkedAssets.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-muted">
                      <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <h3 className="mb-1 text-sm font-medium text-foreground">
                      {linkedAssets.length === 0 ? "No linked assets" : "No assets match the current filter"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {linkedAssets.length === 0
                        ? 'Use "Link assets" to associate assets with this product.'
                        : "Try adjusting the search or file type filter."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5">
                    {displayedLinkedAssets.map((link) => {
                      const asset = link.dam_assets;
                      const assetId = link.asset_id ?? asset?.id ?? null;
                      if (!assetId) return null;
                      const slotLabel = link.document_slot_code
                        ? (VARIANT_IMAGE_SLOTS.find((s) => s.code === link.document_slot_code)?.label ?? link.document_slot_code)
                        : null;
                      return (
                        <DamAssetCard
                          key={link.id}
                          assetId={assetId}
                          filename={asset?.filename ?? asset?.original_filename ?? "Asset"}
                          mimeType={String(asset?.mime_type ?? "")}
                          fileType={String(asset?.file_type ?? "")}
                          previewUrl={buildAssetPreviewPath(assetId, String(asset?.current_version_changed_at ?? asset?.updated_at ?? ""))}
                          versionNumber={asset?.current_version_number ?? null}
                          slotLabel={slotLabel}
                          readOnly={isSharedBrandView}
                          onClick={() => openPanel(assetId)}
                          onAddVersion={!isSharedBrandView ? () => onOpenVersionHistoryDialog(slotLabel ?? asset?.filename ?? "Asset", assetId) : undefined}
                          onVersionHistory={!isSharedBrandView ? () => onOpenVersionHistoryDialog(slotLabel ?? asset?.filename ?? "Asset", assetId) : undefined}
                          onUnlink={!isSharedBrandView ? () => onUnlinkAsset(link.id) : undefined}
                          onOpenInAssets={() => window.open(buildTenantPathForScope({ tenantSlug, scope: selectedBrandSlug || null, suffix: `/assets?asset=${assetId}` }), "_blank")}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Images ──────────────────────────────────────────────────── */}
            {sidebarMode === "images" && (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Product Images</h4>
                      <p className="text-xs text-muted-foreground">{assignedCount}/{totalSlots} slots assigned</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={showMissingOnlyImageSlots ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => onSetShowMissingOnlyImageSlots((c) => !c)}
                      >
                        Missing only
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => onSetShowAllImageSlots((c) => !c)}
                      >
                        {showAllImageSlots ? "Show key" : "Show all"}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5">
                    {visibleImageSlots.map((slot) => {
                      const slotLink = imageSlotLinks[slot.code];
                      const slotAsset = slotLink?.dam_assets ?? null;
                      const slotAssetId = slotLink?.asset_id ?? slotAsset?.id ?? null;
                      const previewUrl = slotAssetId
                        ? buildAssetPreviewPath(
                            slotAssetId,
                            String(slotAsset?.current_version_changed_at ?? slotAsset?.updated_at ?? "")
                          )
                        : null;
                      const isImageAsset = isImageLikeAsset(slotAsset);
                      const isAssigned = Boolean(slotAssetId);
                      const slotCtx: SlotAssignmentContext = {
                        slotCode: slot.code,
                        slotLabel: slot.label,
                        assetType: "image",
                        acceptMode: "image",
                        replaceExistingSlot: true,
                        existingAssetId: slotAssetId,
                      };

                      return (
                        <div
                          key={slot.code}
                          className="group relative flex flex-col overflow-hidden rounded border border-border bg-card transition-colors hover:bg-muted/20"
                          onDragEnter={(e) => { if (isSharedBrandView || !hasDraggedFiles(e)) return; e.preventDefault(); e.stopPropagation(); onSetDragOverSlotCode(slot.code); }}
                          onDragOver={(e) => { if (isSharedBrandView || !hasDraggedFiles(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; onSetDragOverSlotCode(slot.code); }}
                          onDragLeave={(e) => { if (isSharedBrandView) return; e.preventDefault(); e.stopPropagation(); onSetDragOverSlotCode(dragOverSlotCode === slot.code ? null : dragOverSlotCode); }}
                          onDrop={(e) => onSlotDrop(slotCtx, e)}
                        >
                          {/* Preview area — matches DamAssetCard aspect-square */}
                          <div
                            className={`relative aspect-square cursor-pointer overflow-hidden ${
                              dragOverSlotCode === slot.code ? "bg-[#2F6BFF]/10" : "bg-muted/20"
                            }`}
                            onClick={() => slotAssetId && openPanel(slotAssetId)}
                          >
                            {uploadingSlotCode === slot.code ? (
                              <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">Uploading...</div>
                            ) : dragOverSlotCode === slot.code ? (
                              <div className="flex h-full items-center justify-center px-2 text-center text-xs font-medium text-[#2F6BFF]">
                                {isAssigned ? "Drop image for new version" : "Drop image to upload"}
                              </div>
                            ) : slotAsset && previewUrl && isImageAsset ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={previewUrl} alt={slotAsset?.filename || slot.label} className="h-full w-full object-contain bg-white" loading="lazy" />
                            ) : slotAsset ? (
                              <div className="flex h-full flex-col items-center justify-center gap-1.5 px-2 text-center">
                                <FileText className="h-8 w-8 text-muted-foreground/30" />
                                <span className="text-xs text-muted-foreground">{slotAsset?.filename || "Linked file"}</span>
                              </div>
                            ) : (
                              <div className="flex h-full flex-col items-center justify-center gap-1.5 px-2 text-center">
                                <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
                                <span className="text-xs text-muted-foreground">Drop, browse, or link.</span>
                              </div>
                            )}

                            {/* Bottom overlay badges — version left, slot label right */}
                            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-1.5">
                              {isAssigned && slotAsset?.current_version_number && slotAsset.current_version_number > 1 ? (
                                <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm">
                                  v{slotAsset.current_version_number}
                                </span>
                              ) : <span />}
                              <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                                {slot.label}
                              </span>
                            </div>

                            {/* Hint tooltip top-right */}
                            <span
                              className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity inline-flex rounded bg-background/80 p-0.5 text-muted-foreground backdrop-blur-sm"
                              title={slot.hint}
                            >
                              <Info className="h-3 w-3" />
                            </span>
                          </div>

                          {/* Info area */}
                          <div className="flex items-center gap-1 p-3">
                            <input
                              ref={(node) => { slotFileInputRefs.current[slot.code] = node; }}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => onSlotFileInputChange(slotCtx, e)}
                            />
                            <p className="flex-1 truncate text-sm font-semibold leading-tight !text-foreground" title={slotAsset?.filename ?? slot.label}>
                              {slotAsset?.filename ?? <span className="font-normal text-muted-foreground">{slot.label}</span>}
                            </p>
                            {!isSharedBrandView && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    disabled={isMutatingLinks}
                                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
                                  >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  {isAssigned ? (
                                    <>
                                      <DropdownMenuItem onSelect={() => slotFileInputRefs.current[slot.code]?.click()} disabled={uploadingSlotCode === slot.code}>
                                        {uploadingSlotCode === slot.code ? "Uploading…" : "New version"}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onSelect={() => onOpenSlotVersionDialog(slotCtx)}>
                                        New version with details
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onSelect={() => onOpenVersionHistoryDialog(slot.label, slotAssetId)}>
                                        Version history
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onSelect={() => openPanel(slotAssetId!)}>
                                        View details
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onSelect={() => onOpenAssignSlotDialog(slotCtx, slotLink)}>
                                        Link from Assets
                                      </DropdownMenuItem>
                                      {slotLink && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem onSelect={() => onUnlinkAsset(slotLink.id)} className="text-destructive focus:text-destructive">
                                            Clear
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <DropdownMenuItem onSelect={() => slotFileInputRefs.current[slot.code]?.click()} disabled={uploadingSlotCode === slot.code}>
                                        {uploadingSlotCode === slot.code ? "Uploading…" : "Upload image"}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onSelect={() => onOpenAssignSlotDialog(slotCtx, slotLink)}>
                                        Link from Assets
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
            )}

            {/* ── Documents ───────────────────────────────────────────────── */}
            {sidebarMode === "documents" && (
              docSlots.length > 0 ? (
                  <div>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Document Slots</h4>
                        <p className="text-xs text-muted-foreground">
                          {docSlots.filter((s) => Boolean(docSlotLinks[s.fieldId])).length}/{docSlots.length} assigned
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={showMissingOnlyDocumentSlots ? "default" : "outline"}
                          className="h-7 px-2 text-xs"
                          onClick={() => setShowMissingOnlyDocumentSlots((c) => !c)}
                        >
                          Missing only
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => setShowAllDocumentSlots((c) => !c)}
                        >
                          {showAllDocumentSlots ? "Show key" : "Show all"}
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5">
                      {visibleDocumentSlotFields.map((slot) => {
                        const slotLink = docSlotLinks[slot.fieldId] ?? null;
                        const slotAsset = slotLink?.dam_assets ?? null;
                        const slotAssetId = slotLink?.asset_id ?? slotAsset?.id ?? null;
                        const isAssigned = Boolean(slotAssetId);
                        const isDragOverDoc = dragOverSlotCode === slot.slotCode;
                        const slotCtx: SlotAssignmentContext = {
                          slotCode: slot.slotCode,
                          slotLabel: slot.label,
                          assetType: "document",
                          acceptMode: "document",
                          productFieldId: slot.fieldId,
                          replaceExistingSlot: true,
                          existingAssetId: slotAssetId,
                        };

                        return (
                          <div
                            key={slot.fieldId}
                            className={`group relative flex flex-col overflow-hidden rounded border transition-colors ${
                              isDragOverDoc
                                ? "border-[#2F6BFF] ring-2 ring-[#2F6BFF]/20"
                                : "border-border hover:bg-muted/20"
                            } bg-card`}
                            onDragEnter={(e) => {
                              if (isSharedBrandView || !hasDraggedFiles(e)) return;
                              e.preventDefault();
                              onSetDragOverSlotCode(slot.slotCode);
                            }}
                            onDragOver={(e) => {
                              if (isSharedBrandView || !hasDraggedFiles(e)) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "copy";
                              onSetDragOverSlotCode(slot.slotCode);
                            }}
                            onDragLeave={(e) => {
                              if (isSharedBrandView) return;
                              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                              onSetDragOverSlotCode(null);
                            }}
                            onDrop={(e) => onSlotDrop(slotCtx, e)}
                          >
                            {/* Document preview area — aspect-square matching DamAssetCard */}
                            <div
                              className={`relative aspect-square cursor-pointer overflow-hidden ${
                                isDragOverDoc ? "bg-[#2F6BFF]/10" : "bg-muted/20"
                              }`}
                              onClick={() => slotAssetId && openPanel(slotAssetId)}
                            >
                              {uploadingSlotCode === slot.slotCode ? (
                                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                                  <Upload className="h-5 w-5 animate-pulse" />
                                  Uploading...
                                </div>
                              ) : isDragOverDoc ? (
                                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-xs font-medium text-[#2F6BFF]">
                                  <FileText className="h-6 w-6" />
                                  {isAssigned ? "Drop for new version" : "Drop to upload"}
                                </div>
                              ) : isAssigned ? (
                                <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                                  <FileText className="h-10 w-10 text-muted-foreground/40" />
                                  <p className="text-[10px] text-muted-foreground/50">{slotAsset?.file_type ?? "doc"}</p>
                                </div>
                              ) : (
                                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5">
                                  <FileText className="h-10 w-10 text-muted-foreground/20" />
                                  <p className="text-[10px] text-muted-foreground/40">Drop, browse, or link</p>
                                </div>
                              )}

                              {/* Bottom overlay: version badge left, slot label right */}
                              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-1.5">
                                {isAssigned && slotAsset?.current_version_number && (slotAsset.current_version_number as number) > 1 ? (
                                  <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm">
                                    v{slotAsset.current_version_number}
                                  </span>
                                ) : <span />}
                                <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                                  {slot.label}
                                </span>
                              </div>
                            </div>

                            {/* Info area */}
                            <div className="flex items-center gap-1 p-3">
                              <input
                                ref={(node) => { slotFileInputRefs.current[slot.slotCode] = node; }}
                                type="file"
                                accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,image/*"
                                className="hidden"
                                onChange={(e) => onSlotFileInputChange(slotCtx, e)}
                              />
                              <p className="flex-1 truncate text-sm font-semibold leading-tight !text-foreground" title={slotAsset?.filename ?? slot.label}>
                                {isAssigned
                                  ? (slotAsset?.filename ?? "Linked document")
                                  : <span className="font-normal text-muted-foreground">{slot.label}</span>
                                }
                              </p>
                              {!isSharedBrandView && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      disabled={isMutatingLinks}
                                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                      <MoreHorizontal className="h-3.5 w-3.5" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    {isAssigned ? (
                                      <>
                                        <DropdownMenuItem onSelect={() => slotFileInputRefs.current[slot.slotCode]?.click()} disabled={uploadingSlotCode === slot.slotCode}>
                                          {uploadingSlotCode === slot.slotCode ? "Uploading…" : "New version"}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => onOpenSlotVersionDialog(slotCtx)}>
                                          New version with details
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => onOpenVersionHistoryDialog(slot.label, slotAssetId)}>
                                          Version history
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onSelect={() => openPanel(slotAssetId!)}>
                                          View details
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => onOpenAssignSlotDialog(slotCtx, slotLink)}>
                                          Link from Assets
                                        </DropdownMenuItem>
                                        {slotLink && (
                                          <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onSelect={() => onUnlinkAsset(slotLink.id)} className="text-destructive focus:text-destructive">
                                              Clear
                                            </DropdownMenuItem>
                                          </>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <DropdownMenuItem onSelect={() => slotFileInputRefs.current[slot.slotCode]?.click()} disabled={uploadingSlotCode === slot.slotCode}>
                                          {uploadingSlotCode === slot.slotCode ? "Uploading…" : "Upload document"}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => onOpenAssignSlotDialog(slotCtx, slotLink)}>
                                          Link from Assets
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-muted">
                      <FileText className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <h3 className="mb-1 text-sm font-medium text-foreground">No document slots defined</h3>
                    <p className="text-xs text-muted-foreground">
                      Document slots are defined by your product family&apos;s documentation field group.
                    </p>
                  </div>
                )
            )}

            {/* ── Variants unified view ──────────────────────────────────── */}
            {sidebarMode === "variants" && isParentProduct && (
              <div>
                {/* Variant pill filter */}
                <div className="mb-4 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedVariantId(null)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      !selectedVariantId
                        ? "border-foreground bg-foreground text-background"
                        : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    All
                  </button>
                  {variants?.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariantId(v.id)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        selectedVariantId === v.id
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      {v.sku ?? v.product_name ?? v.id}
                    </button>
                  ))}
                </div>

                {variantFilteredAssets.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-muted">
                      <Users className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <h3 className="mb-1 text-sm font-medium text-foreground">No assets found</h3>
                    <p className="text-xs text-muted-foreground">
                      {selectedVariantId ? "This variant has no linked assets." : "No assets are linked to this product or its variants."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5">
                    {variantFilteredAssets.map((link) => {
                      const asset = link.dam_assets;
                      const assetId = (link as Record<string, unknown>).asset_id as string ?? asset?.id ?? null;
                      if (!assetId) return null;
                      const vid = (link as Record<string, unknown>).variant_id as string | null ?? null;
                      const isInherited = vid === null && selectedVariantId !== null;
                      const variantLabel = vid ? (variants?.find((v) => v.id === vid)?.sku ?? null) : null;
                      const slotLabel = link.document_slot_code
                        ? (VARIANT_IMAGE_SLOTS.find((s) => s.code === link.document_slot_code)?.label ?? link.document_slot_code)
                        : null;
                      return (
                        <DamAssetCard
                          key={link.id}
                          assetId={assetId}
                          filename={asset?.filename ?? asset?.original_filename ?? "Asset"}
                          mimeType={String(asset?.mime_type ?? "")}
                          fileType={String(asset?.file_type ?? "")}
                          previewUrl={buildAssetPreviewPath(assetId, String(asset?.current_version_changed_at ?? asset?.updated_at ?? ""))}
                          versionNumber={asset?.current_version_number ?? null}
                          slotLabel={slotLabel}
                          isInherited={isInherited}
                          variantLabel={variantLabel}
                          readOnly={isSharedBrandView}
                          onClick={() => openPanel(assetId)}
                          onAddVersion={!isSharedBrandView ? () => onOpenVersionHistoryDialog(slotLabel ?? asset?.filename ?? "Asset", assetId) : undefined}
                          onVersionHistory={!isSharedBrandView ? () => onOpenVersionHistoryDialog(slotLabel ?? asset?.filename ?? "Asset", assetId) : undefined}
                          onUnlink={!isSharedBrandView ? () => onUnlinkAsset(link.id) : undefined}
                          onOpenInAssets={() => window.open(buildTenantPathForScope({ tenantSlug, scope: selectedBrandSlug || null, suffix: `/assets?asset=${assetId}` }), "_blank")}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Destination ──────────────────────────────────────────────── */}
            {sidebarMode === "destination" && (
              <div>
                {destinationTabContent ?? (
                  <div className="py-16 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-muted">
                      <ExternalLink className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <h3 className="mb-1 text-sm font-medium text-foreground">No destination profile active</h3>
                    <p className="text-xs text-muted-foreground">
                      Select an output profile to manage destination-specific files.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Asset Quick Panel ─────────────────────────────────────────────── */}
      {panelAssetId && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l border-border bg-background shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground truncate pr-4">
              {panelAsset?.filename ?? "Asset"}
            </h3>
            <button
              type="button"
              onClick={closePanel}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Preview */}
            <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/10">
              {panelAsset && isImageLikeAsset(panelAsset) && panelAsset.thumbnail_urls ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={buildAssetPreviewPath(panelAssetId, String(panelAsset.current_version_changed_at ?? panelAsset.updated_at ?? ""))}
                  alt={panelAsset.filename ?? ""}
                  className="h-56 w-full object-contain bg-white"
                />
              ) : (
                <div className="flex h-40 items-center justify-center gap-2">
                  <FileText className="h-10 w-10 text-muted-foreground/30" />
                  <span className="text-xs text-muted-foreground">{panelAsset?.file_type ?? "file"}</span>
                </div>
              )}
            </div>

            {/* Key metadata */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Filename</span>
                <span className="font-medium text-foreground truncate max-w-[200px]">{panelAsset?.filename}</span>
              </div>
              {panelAsset?.file_type && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium text-foreground uppercase">{panelAsset.file_type}</span>
                </div>
              )}
              {panelAsset?.current_version_number && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-medium text-foreground">v{panelAsset.current_version_number}</span>
                </div>
              )}
              {panelAsset?.current_version_changed_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last updated</span>
                  <span className="font-medium text-foreground">
                    {new Date(String(panelAsset.current_version_changed_at)).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {/* Add new version */}
            {!isSharedBrandView && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">New Version</p>
                <input
                  ref={panelFileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePanelAddVersion(f); }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs"
                  disabled={panelAddingVersion}
                  onClick={() => panelFileInputRef.current?.click()}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {panelAddingVersion ? "Uploading…" : "Add New Version"}
                </Button>
              </div>
            )}

            {/* Version history */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Version History</p>
              {panelVersionsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-muted" />)}
                </div>
              ) : panelVersions.length === 0 ? (
                <p className="text-xs text-muted-foreground">Only one version exists.</p>
              ) : (
                <div className="space-y-1.5">
                  {panelVersions.map((v) => (
                    <div key={String(v.id)} className="flex items-start gap-2 rounded-md border border-border/50 p-2">
                      <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground">v{String(v.version_number ?? v.versionNumber ?? "")}</p>
                        {Boolean(v.change_comment ?? v.changeComment) && (
                          <p className="text-[10px] text-muted-foreground truncate">{String(v.change_comment ?? v.changeComment ?? "")}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          {v.created_at ? new Date(String(v.created_at)).toLocaleDateString() : ""}
                        </p>
                      </div>
                      {Boolean(v.isCurrent ?? v.is_current) && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Current</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Open in full DAM */}
            <Link
              href={buildTenantPathForScope({ tenantSlug, scope: selectedBrandSlug || null, suffix: `/assets?asset=${panelAssetId}` })}
              target="_blank"
              className="flex items-center justify-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-xs text-muted-foreground hover:border-border hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Edit full metadata in Assets
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
