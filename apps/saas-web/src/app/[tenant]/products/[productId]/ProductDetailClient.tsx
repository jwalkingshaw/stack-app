"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Package, Zap, FileText, Settings, ImageIcon, ExternalLink, Info, MoreHorizontal, Languages } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@tradetool/ui";
import { VariantManagement } from "@/components/products/variant-management";
import { TranslationPanel } from "@/components/products/TranslationPanel";
import { InlineDynamicFieldEditor } from "@/components/inline-edit";
import type { ProductField } from "@/components/field-types/DynamicFieldRenderer";
import { VariantNavigationHeader } from "@/components/products/VariantNavigationHeader";
import { PageContentContainer } from "@/components/ui/page-content-container";
import { ItemList } from "@/components/ui/item-list";
import { ScopeToolbar } from "@/components/scope-toolbar";
import { hasLiveScopeControls } from "@/lib/scope-visibility";
import {
  buildCanonicalProductIdentifier,
  generateVariantUrl,
  parseProductIdentifier,
} from "@/lib/product-utils";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { useMarketContext } from "@/components/market-context";
import { fetchJsonWithDedupe } from "@/lib/client-request-cache";
import { buildTenantPathForScope } from "@/lib/tenant-view-scope";
import { isBasicInformationFieldGroupCode } from "@/lib/field-group-codes";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createGlobalAuthoringScope,
  normalizeAuthoringScope,
} from "@/components/scope/authoring-scope-picker";
import { toast } from "@/components/ui/toast";

interface ProductDetailClientProps {
  tenantSlug: string;
  productId: string;
  selectedBrandSlug?: string | null;
}

type ProductImageSlot = {
  code: string;
  label: string;
  hint: string;
};

type ProductDocumentFieldSlot = {
  fieldId: string;
  fieldCode: string;
  slotCode: string;
  label: string;
  hint: string;
  allowMultiple: boolean;
};

type SlotAssignmentContext = {
  slotCode: string;
  slotLabel: string;
  assetType: "image" | "document";
  acceptMode: "image" | "document";
  productFieldId?: string | null;
  replaceExistingSlot: boolean;
  existingAssetId?: string | null;
};

type AssetVersionHistoryRecord = {
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

type FolderRecord = {
  id: string;
  name: string;
  path?: string | null;
  parentId?: string | null;
  parent_id?: string | null;
};

type ProductType = "parent" | "variant" | "standalone";

type ProductFieldLike = ProductField & {
  description?: string;
  field_type: string;
  is_required: boolean;
  is_unique: boolean;
  is_channelable?: boolean;
  is_localizable?: boolean;
  allowed_channel_ids?: string[];
  allowed_market_ids?: string[];
  allowed_locale_ids?: string[];
  sort_order?: number;
  options: Record<string, unknown> & {
    system_key?: string;
    allow_multiple?: boolean;
    document_slot?: string;
    table_definition?: {
      meta?: {
        uses_panel_instances?: boolean;
      };
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type ProductFieldGroupLike = {
  id: string;
  field_group_id: string;
  field_group: {
    code: string;
    name: string;
    description?: string;
    [key: string]: unknown;
  };
  hidden_fields?: string[];
  sort_order?: number;
  fields: ProductFieldLike[];
  [key: string]: unknown;
};

type DamAssetLike = {
  id: string;
  filename?: string;
  originalFilename?: string;
  mime_type?: string;
  mimeType?: string;
  file_type?: string;
  fileType?: string;
  current_version_changed_at?: string | null;
  currentVersionChangedAt?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
};

type ProductLinkLike = {
  id: string;
  asset_id?: string;
  product_field_id?: string;
  document_slot_code?: string;
  link_context?: string;
  link_type?: string;
  confidence?: number;
  dam_assets?: DamAssetLike | null;
  [key: string]: unknown;
};

type ProductState = {
  id: string;
  scin: string;
  productName: string;
  product_name?: string | null;
  sku: string;
  upc: string;
  barcode?: string | null;
  status: string;
  type: ProductType;
  parentId?: string | null;
  parent_id?: string | null;
  parentSku?: string | null;
  parentName?: string | null;
  hasVariants?: boolean;
  has_variants?: boolean;
  variantCount?: number;
  variant_count?: number;
  family_id?: string | null;
  variants?: Record<string, unknown>[];
  marketplace_content: Record<string, unknown>;
  marketplaceContent: Record<string, unknown>;
  [key: string]: unknown;
};

type ApiEnvelope<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
  details?: unknown;
  [key: string]: unknown;
};

type ProductSectionBase = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isSystem: boolean;
  layoutType: "form" | "full-width";
};

type ProductSystemSection = ProductSectionBase & {
  isFieldGroup: false;
};

type ProductFieldGroupSection = ProductSectionBase & {
  isFieldGroup: true;
  fieldGroup: ProductFieldGroupLike;
};

type ProductSection = ProductSystemSection | ProductFieldGroupSection;

const PRODUCT_IMAGE_SLOTS: ProductImageSlot[] = [
  { code: "image_front", label: "Front", hint: "Primary front-of-pack view." },
  { code: "image_back", label: "Back", hint: "Back label and ingredient panel." },
  { code: "image_facts_panel", label: "Facts Panel", hint: "Supplement/Nutrition Facts panel view." },
  { code: "image_label", label: "Label", hint: "Flat label artwork or wrap panel." },
  { code: "image_left", label: "Left", hint: "Left side angle." },
  { code: "image_right", label: "Right", hint: "Right side angle." },
  { code: "image_top", label: "Top", hint: "Cap and top-down view." },
  { code: "image_bottom", label: "Bottom", hint: "Base and underside view." },
  { code: "image_hero", label: "Hero", hint: "Channel-ready hero image." },
  { code: "image_lifestyle", label: "Lifestyle", hint: "In-use or context shot." },
  // Label production slots
  { code: "label_print_ready", label: "Label (Print-Ready)", hint: "CMYK ≥300dpi, with bleeds — for printers. Do not send to partners." },
  { code: "label_digital", label: "Label (Digital)", hint: "sRGB version for Amazon, website, and digital channels." },
  { code: "label_regulatory", label: "Label (Regulatory)", hint: "FDA/EU-approved PDF for regulatory submissions. Not for external distribution." },
  { code: "supplement_facts_panel", label: "Supplement Facts Panel", hint: "Extracted Supplement/Nutrition Facts panel only." },
];

const PRODUCT_IMAGE_SLOT_CODE_SET = new Set(PRODUCT_IMAGE_SLOTS.map((slot) => slot.code));
const PRIMARY_IMAGE_SLOT_CODES = new Set([
  "image_front",
  "image_back",
  "image_hero",
  "image_facts_panel",
  "image_label",
  "label_print_ready",
  "label_digital",
  "label_regulatory",
  "supplement_facts_panel",
]);
const PRIMARY_DOCUMENT_SLOT_CODES = new Set(["coa", "legal", "sfp"]);
const DOCUMENTATION_GROUP_CODE = "documentation";
const MUTABLE_PRODUCT_COLUMNS = new Set([
  "type",
  "parent_id",
  "product_name",
  "sku",
  "barcode",
  "brand_line",
  "family_id",
  "variant_axis",
  "status",
  "launch_date",
  "msrp",
  "cost_of_goods",
  "margin_percent",
  "assets_count",
  "content_score",
  "short_description",
  "long_description",
  "features",
  "specifications",
  "meta_title",
  "meta_description",
  "keywords",
  "weight_g",
  "dimensions",
  "inheritance",
  "is_inherited",
  "marketplace_content",
]);
const PRODUCT_STATUS_OPTIONS = [
  "Draft",
  "Enrichment",
  "Review",
  "Active",
  "Discontinued",
  "Archived",
] as const;
type ProductStatusOption = (typeof PRODUCT_STATUS_OPTIONS)[number];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asApiEnvelope<T = unknown>(value: unknown): ApiEnvelope<T> {
  const payload = asRecord(value);
  return payload ? (payload as ApiEnvelope<T>) : {};
}

async function parseJsonSafely(response: Response): Promise<unknown | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toErrorMessage(payload: ApiEnvelope | null | undefined, fallback: string): string {
  if (payload && typeof payload.error === "string" && payload.error.trim().length > 0) {
    return payload.error;
  }
  return fallback;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toProductType(value: unknown): ProductType {
  if (value === "parent" || value === "variant" || value === "standalone") {
    return value;
  }
  return "standalone";
}

function toTextValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function normalizeProductField(value: unknown): ProductFieldLike | null {
  const field = asRecord(value);
  if (!field) return null;

  const id = String(field.id ?? "").trim();
  const code = String(field.code ?? "").trim();
  if (!id || !code) return null;

  const options = asRecord(field.options) ?? {};
  const tableDefinition = asRecord(options.table_definition);
  const tableMeta = asRecord(tableDefinition?.meta);

  return {
    ...field,
    id,
    code,
    name: typeof field.name === "string" && field.name.trim().length > 0 ? field.name : code,
    description: typeof field.description === "string" ? field.description : undefined,
    field_type:
      typeof field.field_type === "string" && field.field_type.trim().length > 0
        ? field.field_type
        : "text",
    is_required: field.is_required === true,
    is_unique: field.is_unique === true,
    is_channelable: field.is_channelable === true,
    is_localizable: field.is_localizable === true,
    allowed_channel_ids: toStringList(field.allowed_channel_ids),
    allowed_market_ids: toStringList(field.allowed_market_ids),
    allowed_locale_ids: toStringList(field.allowed_locale_ids),
    sort_order: typeof field.sort_order === "number" ? field.sort_order : 0,
    options: {
      ...options,
      system_key: typeof options.system_key === "string" ? options.system_key : undefined,
      allow_multiple: typeof options.allow_multiple === "boolean" ? options.allow_multiple : undefined,
      document_slot: typeof options.document_slot === "string" ? options.document_slot : undefined,
      table_definition: tableDefinition
        ? {
            ...tableDefinition,
            meta: tableMeta
              ? {
                  ...tableMeta,
                  uses_panel_instances:
                    typeof tableMeta.uses_panel_instances === "boolean"
                      ? tableMeta.uses_panel_instances
                      : undefined,
                }
              : undefined,
          }
        : undefined,
    },
  };
}

function normalizeProductFieldGroup(value: unknown): ProductFieldGroupLike | null {
  const groupAssignment = asRecord(value);
  if (!groupAssignment) return null;

  const fieldGroup = asRecord(groupAssignment.field_groups) ?? asRecord(groupAssignment.field_group);
  if (!fieldGroup) return null;

  const code = String(fieldGroup.code ?? "").trim().toLowerCase();
  if (!code) return null;

  const assignments = Array.isArray(fieldGroup.product_field_group_assignments)
    ? fieldGroup.product_field_group_assignments
    : [];
  const allFields = assignments
    .map((assignment) => normalizeProductField(asRecord(assignment)?.product_fields))
    .filter((field): field is ProductFieldLike => Boolean(field))
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

  const hiddenFields = toStringList(groupAssignment.hidden_fields);
  const hiddenFieldSet = new Set(hiddenFields);
  const visibleFields = allFields.filter((field) => !hiddenFieldSet.has(field.id));

  return {
    ...groupAssignment,
    id: String(groupAssignment.id ?? `${code}-assignment`),
    field_group_id: String(groupAssignment.field_group_id ?? fieldGroup.id ?? code),
    field_group: {
      ...fieldGroup,
      code,
      name:
        typeof fieldGroup.name === "string" && fieldGroup.name.trim().length > 0
          ? fieldGroup.name
          : code,
      description: typeof fieldGroup.description === "string" ? fieldGroup.description : undefined,
    },
    hidden_fields: hiddenFields,
    sort_order: typeof groupAssignment.sort_order === "number" ? groupAssignment.sort_order : 0,
    fields: visibleFields,
  };
}

function formatAuditDateTime(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString();
}

function isImageLikeAsset(asset: unknown): boolean {
  const normalizedAsset = asRecord(asset);
  const mimeType = String(normalizedAsset?.mime_type || normalizedAsset?.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) {
    return true;
  }

  const fileType = String(normalizedAsset?.file_type || normalizedAsset?.fileType || "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif", "avif", "svg", "tif", "tiff", "bmp"].includes(fileType)) {
    return true;
  }

  const name = String(normalizedAsset?.filename || normalizedAsset?.originalFilename || "").toLowerCase();
  return /\.(jpg|jpeg|png|webp|gif|avif|svg|tif|tiff|bmp)$/.test(name);
}

function isImageLikeFile(file: File | null | undefined): boolean {
  if (!file) return false;
  const mimeType = String(file.type || "").toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  const name = String(file.name || "").toLowerCase();
  return /\.(jpg|jpeg|png|webp|gif|avif|svg|tif|tiff|bmp|heic|heif)$/.test(name);
}

function isDocumentLikeFile(file: File | null | undefined): boolean {
  if (!file) return false;
  if (isImageLikeFile(file)) return true;

  const mimeType = String(file.type || "").toLowerCase();
  if (
    mimeType.includes("pdf") ||
    mimeType.startsWith("text/") ||
    mimeType.includes("msword") ||
    mimeType.includes("officedocument.wordprocessingml") ||
    mimeType.includes("ms-excel") ||
    mimeType.includes("officedocument.spreadsheetml")
  ) {
    return true;
  }

  const name = String(file.name || "").toLowerCase();
  return /\.(pdf|doc|docx|txt|csv|xls|xlsx)$/.test(name);
}

function hasDraggedFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function extractFirstImageFile(dataTransfer: DataTransfer | null): File | null {
  if (!dataTransfer) return null;

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (const item of Array.from(dataTransfer.items)) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (isImageLikeFile(file)) {
        return file;
      }
    }
  }

  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (const file of Array.from(dataTransfer.files)) {
      if (isImageLikeFile(file)) {
        return file;
      }
    }
  }

  return null;
}

function extractFirstDocumentFile(dataTransfer: DataTransfer | null): File | null {
  if (!dataTransfer) return null;

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (const item of Array.from(dataTransfer.items)) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (isDocumentLikeFile(file)) {
        return file;
      }
    }
  }

  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (const file of Array.from(dataTransfer.files)) {
      if (isDocumentLikeFile(file)) {
        return file;
      }
    }
  }

  return null;
}

function isDocumentLikeAsset(asset: unknown): boolean {
  if (!asset) return false;
  if (isImageLikeAsset(asset)) return true;

  const normalizedAsset = asRecord(asset);
  const mimeType = String(normalizedAsset?.mime_type || normalizedAsset?.mimeType || "").toLowerCase();
  if (
    mimeType.includes("pdf") ||
    mimeType.startsWith("text/") ||
    mimeType.includes("msword") ||
    mimeType.includes("officedocument.wordprocessingml") ||
    mimeType.includes("ms-excel") ||
    mimeType.includes("officedocument.spreadsheetml")
  ) {
    return true;
  }

  const fileType = String(normalizedAsset?.file_type || normalizedAsset?.fileType || "").toLowerCase();
  if (["pdf", "doc", "docx", "txt", "csv", "xls", "xlsx"].includes(fileType)) {
    return true;
  }

  const name = String(normalizedAsset?.filename || normalizedAsset?.originalFilename || "").toLowerCase();
  return /\.(pdf|doc|docx|txt|csv|xls|xlsx)$/.test(name);
}

function resolveDocumentSlotCode(field: ProductFieldLike): string | null {
  const fromOption = String(field?.options?.document_slot || "")
    .trim()
    .toLowerCase();
  if (fromOption) return fromOption;

  const systemKey = String(field?.options?.system_key || "")
    .trim()
    .toLowerCase();
  if (systemKey.endsWith("_documents")) {
    return systemKey.replace(/_documents$/, "");
  }

  const fieldCode = String(field?.code || "")
    .trim()
    .toLowerCase();
  if (fieldCode.endsWith("_documents")) {
    return fieldCode.replace(/_documents$/, "");
  }

  return fieldCode || null;
}

/**
 * ProductDetailClient - Scalable product detail page with adaptive layouts
 *
 * ARCHITECTURE:
 * - System Sections: Non-deletable, predefined sections (Variants, Media Assets)
 * - User Field Groups: Deletable sections created by users via Field Groups settings
 * - Layout Types: 'form' (left-aligned, constrained width) vs 'full-width' (tables/galleries)
 * - Field-Aware Rendering: Automatically detects wide field types and adjusts layout
 */
export function ProductDetailClient({
  tenantSlug,
  productId,
  selectedBrandSlug: selectedBrandSlugProp,
}: ProductDetailClientProps) {
  const TABLE_HEAVY_FIELD_TYPES = ['table', 'gallery', 'asset_collection', 'data_grid'];

  const isConstrainedPanelTable = (field: ProductFieldLike) =>
    field?.field_type === 'table' &&
    field?.options?.table_definition?.meta?.uses_panel_instances === true;

  const isLayoutWideField = (field: ProductFieldLike) => {
    if (!field) return false;
    if (field.field_type !== 'table') {
      return TABLE_HEAVY_FIELD_TYPES.includes(field.field_type);
    }
    return !isConstrainedPanelTable(field);
  };

  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedBrandSlug = useMemo(() => {
    const fromProp = (selectedBrandSlugProp || "").trim().toLowerCase();
    if (fromProp.length > 0) return fromProp;
    return (searchParams.get("brand") || "").trim().toLowerCase();
  }, [searchParams, selectedBrandSlugProp]);
  const selectedBrandQuery = useMemo(() => {
    if (!selectedBrandSlug) return "";
    const query = new URLSearchParams();
    query.set("brand", selectedBrandSlug);
    return query.toString();
  }, [selectedBrandSlug]);
  const isSharedBrandView =
    selectedBrandSlug.length > 0 && selectedBrandSlug !== tenantSlug.toLowerCase();
  const [activeSection, setActiveSection] = useState('attributes-all');
  const hasAutoSelectedInitialSectionRef = useRef(false);
  const [product, setProduct] = useState<ProductState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldGroups, setFieldGroups] = useState<ProductFieldGroupLike[]>([]);
  const [, setLoadingFieldGroups] = useState(false);
  const fieldGroupsCacheRef = useRef<Map<string, ProductFieldGroupLike[]>>(new Map());
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [pendingFieldChanges, setPendingFieldChanges] = useState<Record<string, unknown>>({});
  const [linkedAssets, setLinkedAssets] = useState<ProductLinkLike[]>([]);
  const [loadingLinkedAssets, setLoadingLinkedAssets] = useState(false);
  const [linkedAssetsError, setLinkedAssetsError] = useState<string | null>(null);
  const [isLinkAssetDialogOpen, setIsLinkAssetDialogOpen] = useState(false);
  const [availableAssets, setAvailableAssets] = useState<DamAssetLike[]>([]);
  const [availableAssetQuery, setAvailableAssetQuery] = useState("");
  const [selectedAssetIdsToLink, setSelectedAssetIdsToLink] = useState<Set<string>>(new Set());
  const [isAssignSlotDialogOpen, setIsAssignSlotDialogOpen] = useState(false);
  const [slotAssignmentContext, setSlotAssignmentContext] = useState<SlotAssignmentContext | null>(null);
  const [selectedSlotAssetId, setSelectedSlotAssetId] = useState<string | null>(null);
  const [loadingAvailableAssets, setLoadingAvailableAssets] = useState(false);
  const [isMutatingLinks, setIsMutatingLinks] = useState(false);
  const [uploadingSlotCode, setUploadingSlotCode] = useState<string | null>(null);
  const [dragOverSlotCode, setDragOverSlotCode] = useState<string | null>(null);
  const [slotUploadError, setSlotUploadError] = useState<string | null>(null);
  const [showAllImageSlots, setShowAllImageSlots] = useState(false);
  const [showMissingOnlyImageSlots, setShowMissingOnlyImageSlots] = useState(false);
  const [showAllDocumentSlots, setShowAllDocumentSlots] = useState(false);
  const [showMissingOnlyDocumentSlots, setShowMissingOnlyDocumentSlots] = useState(false);
  const [assetFolders, setAssetFolders] = useState<FolderRecord[]>([]);
  const [selectedUploadFolderId, setSelectedUploadFolderId] = useState<string>("auto");
  const [isCreateFolderDialogOpen, setIsCreateFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderMutationError, setFolderMutationError] = useState<string | null>(null);
  const [isVersionHistoryDialogOpen, setIsVersionHistoryDialogOpen] = useState(false);
  const [versionHistorySlotLabel, setVersionHistorySlotLabel] = useState<string>("");
  const [versionHistoryAssetId, setVersionHistoryAssetId] = useState<string | null>(null);
  const [versionHistoryRecords, setVersionHistoryRecords] = useState<AssetVersionHistoryRecord[]>([]);
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState<string | null>(null);
  const [restoringSlotVersionId, setRestoringSlotVersionId] = useState<string | null>(null);
  const [isSlotVersionDialogOpen, setIsSlotVersionDialogOpen] = useState(false);
  const [slotVersionContext, setSlotVersionContext] = useState<SlotAssignmentContext | null>(null);
  const [slotVersionFile, setSlotVersionFile] = useState<File | null>(null);
  const [slotVersionComment, setSlotVersionComment] = useState("");
  const [slotVersionEffectiveFrom, setSlotVersionEffectiveFrom] = useState("");
  const [slotVersionEffectiveTo, setSlotVersionEffectiveTo] = useState("");
  const [slotVersionDialogError, setSlotVersionDialogError] = useState<string | null>(null);
  const slotFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [, setCompleteness] = useState<{
    percent: number;
    requiredCount: number;
    completeCount: number;
    missingAttributes: Array<{ code: string; label: string }>;
    isComplete: boolean;
    familyId?: string | null;
  } | null>(null);
  const [, setCompletenessLoading] = useState(false);
  const [localizationEligibilityLoading, setLocalizationEligibilityLoading] = useState(false);
  const [canUseTranslateProduct, setCanUseTranslateProduct] = useState(false);
  const [isTranslatePanelOpen, setIsTranslatePanelOpen] = useState(false);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const {
    channels,
    destinations,
    locales,
    markets,
    selectedChannelId,
    selectedMarketId,
    selectedLocaleId,
    selectedDestinationId,
    selectedChannel,
    selectedLocale,
    selectedDestination,
    availableDestinations,
    isLoading: marketContextLoading,
  } = useMarketContext();

  const isScopeReady = useMemo(() => {
    if (marketContextLoading) return false;
    if (markets.length > 0 && !selectedMarketId) return false;
    if (locales.length > 0 && !selectedLocale?.code) return false;
    return true;
  }, [
    marketContextLoading,
    markets.length,
    selectedMarketId,
    locales.length,
    selectedLocale?.code,
  ]);

  const showScopeToolbarSection = useMemo(
    () =>
      !marketContextLoading &&
      hasLiveScopeControls({ channels, destinations }),
    [channels, destinations, marketContextLoading]
  );

  const canEditFields = !isSharedBrandView && isScopeReady;

  const fieldCodeToSystemKeyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of fieldGroups) {
      const fields = Array.isArray(group?.fields) ? group.fields : [];
      for (const field of fields) {
        const code = String(field?.code || "")
          .trim()
          .toLowerCase();
        const systemKey = String(field?.options?.system_key || "")
          .trim()
          .toLowerCase();
        if (!code || !systemKey) continue;
        map.set(code, systemKey);
      }
    }
    return map;
  }, [fieldGroups]);

  const mapFieldKeyToProductColumn = useCallback(
    (rawFieldKey: string): string | null => {
      const trimmedKey = rawFieldKey.trim();
      const normalizedKey = trimmedKey.toLowerCase();

      if (normalizedKey === "scin") return null;
      if (normalizedKey === "title") return "product_name";

      const mappedSystemKey = fieldCodeToSystemKeyMap.get(normalizedKey);
      if (mappedSystemKey && MUTABLE_PRODUCT_COLUMNS.has(mappedSystemKey)) {
        return mappedSystemKey;
      }
      if (MUTABLE_PRODUCT_COLUMNS.has(trimmedKey)) {
        return trimmedKey;
      }

      // Allow custom product field codes to flow to API scoped/global field-value persistence.
      return trimmedKey || null;
    },
    [fieldCodeToSystemKeyMap]
  );

  const authoringScope = useMemo(() => {
    const rawScope =
      product?.marketplace_content?.authoringScope ??
      product?.marketplaceContent?.authoringScope ??
      null;
    return normalizeAuthoringScope(rawScope) || createGlobalAuthoringScope();
  }, [product]);

  const isCurrentViewInsideAuthoringScope = useMemo(() => {
    if (authoringScope.mode !== "scoped") return true;

    const matchesDimension = (selectedId: string | null, allowedIds: string[]) =>
      allowedIds.length === 0 || (selectedId ? allowedIds.includes(selectedId) : false);

    return (
      matchesDimension(selectedMarketId, authoringScope.marketIds) &&
      matchesDimension(selectedChannelId, authoringScope.channelIds) &&
      matchesDimension(selectedLocaleId, authoringScope.localeIds) &&
      matchesDimension(selectedDestinationId, authoringScope.destinationIds)
    );
  }, [
    authoringScope,
    selectedMarketId,
    selectedChannelId,
    selectedLocaleId,
    selectedDestinationId,
  ]);

  const resolveSystemFieldCode = useCallback(
    (field: ProductFieldLike): string =>
      String(field?.options?.system_key || field?.code || "")
        .trim()
        .toLowerCase(),
    []
  );

  const isScinSystemField = useCallback(
    (field: ProductFieldLike): boolean => resolveSystemFieldCode(field) === "scin",
    [resolveSystemFieldCode]
  );

  // Handle field value changes with auto-save
  const handleFieldChange = (fieldCode: string, value: unknown) => {
    if (!canEditFields) return;
    if (fieldCode === 'scin') return;
    console.log(`Ã°Å¸â€œÂ Field "${fieldCode}" changed to:`, value);
    console.log(`Ã°Å¸â€œÂ Field type:`, typeof value);
    console.log(`Ã°Å¸â€œÂ Current fieldValues:`, fieldValues);

    // Update local state immediately for responsive UI
    setFieldValues(prev => {
      const newValues = {
        ...prev,
        [fieldCode]: value
      };
      console.log(`Ã°Å¸â€œÂ New fieldValues:`, newValues);
      return newValues;
    });

    // Track pending changes
    setPendingFieldChanges(prev => ({
      ...prev,
      [fieldCode]: value
    }));

    if (fieldCode === 'title' || fieldCode === 'sku' || fieldCode === 'barcode') {
      const nextTextValue = toTextValue(value);
      setProduct((prev) => {
        if (!prev) return prev;
        if (fieldCode === 'title') {
          return { ...prev, productName: nextTextValue };
        }
        if (fieldCode === 'sku') {
          return { ...prev, sku: nextTextValue };
        }
        return { ...prev, upc: nextTextValue };
      });
    }

  };

  // Save field values to API
  const saveFieldValues = async (
    fieldsToSave: Record<string, unknown>,
    options?: { forceGlobalScope?: boolean }
  ) => {
    if (isSharedBrandView) return;
    if (!options?.forceGlobalScope && !canEditFields) return;
    if (!product?.id) {
      console.error('Ã¢ÂÅ’ Cannot save: product.id is missing');
      return;
    }

    const normalizedFieldsToSave: Record<string, unknown> = {};
    const droppedFields: string[] = [];
    Object.entries(fieldsToSave).forEach(([key, value]) => {
      const mappedKey = mapFieldKeyToProductColumn(key);
      if (!mappedKey) {
        droppedFields.push(key);
        return;
      }
      normalizedFieldsToSave[mappedKey] = value;
    });

    if (droppedFields.length > 0) {
      console.warn('Skipping unsupported product fields during save:', droppedFields);
      setPendingFieldChanges((prev) => {
        const next = { ...prev };
        droppedFields.forEach((key) => {
          delete next[key];
        });
        return next;
      });
    }

    if (Object.keys(normalizedFieldsToSave).length === 0) {
      return;
    }

    const requiredFieldViolations: string[] = [];
    if (Object.prototype.hasOwnProperty.call(normalizedFieldsToSave, "product_name")) {
      const productName = normalizedFieldsToSave.product_name;
      if (typeof productName !== "string" || productName.trim().length === 0) {
        requiredFieldViolations.push("Title");
      }
    }
    if (Object.prototype.hasOwnProperty.call(normalizedFieldsToSave, "sku")) {
      const sku = normalizedFieldsToSave.sku;
      if (typeof sku !== "string" || sku.trim().length === 0) {
        requiredFieldViolations.push("SKU");
      }
    }
    if (requiredFieldViolations.length > 0) {
      console.error(`${requiredFieldViolations.join(" and ")} cannot be empty`);
      return;
    }

    try {
      setSaving(true);
      console.log('Ã°Å¸â€™Â¾ Saving field values:', fieldsToSave);
      console.log('Ã°Å¸â€™Â¾ Product ID:', product.id);
      console.log('Ã°Å¸â€™Â¾ Tenant slug:', tenantSlug);

      const useScopedTarget = !options?.forceGlobalScope;
      const targetMarketId = useScopedTarget ? selectedMarketId : null;
      const targetChannelId = useScopedTarget ? selectedChannelId : null;
      const targetLocaleId = useScopedTarget ? selectedLocaleId : null;
      const targetDestinationId = useScopedTarget ? selectedDestinationId : null;
      const targetLocaleCode = useScopedTarget ? selectedLocale?.code : null;
      const targetChannelCode = useScopedTarget ? selectedChannel?.code : null;
      const targetDestinationCode = useScopedTarget ? selectedDestination?.code : null;

      const query = new URLSearchParams();
      if (targetMarketId) query.set('marketId', targetMarketId);
      if (targetChannelId) query.set('channelId', targetChannelId);
      if (targetLocaleId) query.set('localeId', targetLocaleId);
      if (targetDestinationId) query.set('destinationId', targetDestinationId);
      if (targetLocaleCode) query.set('locale', targetLocaleCode);
      if (targetChannelCode) query.set('channel', targetChannelCode);
      if (targetDestinationCode) query.set('destination', targetDestinationCode);
      if (selectedBrandSlug) query.set('brand', selectedBrandSlug);
      const url = query.toString()
        ? `/api/${tenantSlug}/products/${product.id}?${query.toString()}`
        : `/api/${tenantSlug}/products/${product.id}`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedFieldsToSave)
      });

      const responseData = asApiEnvelope(await parseJsonSafely(response));
      console.log('Ã°Å¸â€œÂ¤ Server response:', responseData);

      if (!response.ok) {
        console.error('Save request failed:', {
          status: response.status,
          statusText: response.statusText,
          body: responseData,
        });
        if (responseData?.details) {
          console.error('Validation details:', JSON.stringify(responseData.details, null, 2));
        }
        throw new Error(toErrorMessage(responseData, `Failed to save field values (${response.status})`));
      }

      console.log('Ã¢Å“â€¦ Field values saved successfully');
      setPendingFieldChanges((prev) => {
        const remaining = { ...prev };
        Object.keys(fieldsToSave).forEach((key) => {
          delete remaining[key];
        });
        return remaining;
      });
      await fetchCompleteness();
    } catch (error) {
      console.error('Error saving field values:', error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const staticSections = useMemo<ProductSystemSection[]>(() => [
    {
      id: 'attributes-all',
      label: 'All Attributes',
      icon: FileText,
      isSystem: true,
      isFieldGroup: false,
      layoutType: 'form',
    },
    {
      id: 'attributes-required',
      label: 'Required',
      icon: FileText,
      isSystem: true,
      isFieldGroup: false,
      layoutType: 'form',
    },
    {
      id: 'attributes-missing',
      label: 'Missing',
      icon: FileText,
      isSystem: true,
      isFieldGroup: false,
      layoutType: 'form',
    },
    {
      id: 'variants',
      label: 'Variants',
      icon: Settings,
      isSystem: true,
      isFieldGroup: false,
      layoutType: 'full-width',
    },
    {
      id: 'media',
      label: 'Assets',
      icon: ImageIcon,
      isSystem: true,
      isFieldGroup: false,
      layoutType: 'full-width',
    },
  ], []);

  const parentOnlySections = useMemo<ProductSystemSection[]>(() => product?.type === 'parent'
    ? [
        {
          id: 'product-settings',
          label: 'Product Settings',
          icon: Settings,
          isSystem: true,
          isFieldGroup: false,
          layoutType: 'form',
        },
      ]
    : [], [product?.type]);


  const isTableHeavyFieldGroup = (fieldGroup: ProductFieldGroupLike) => {
    const fields = Array.isArray(fieldGroup?.fields) ? fieldGroup.fields : [];
    if (fields.length === 0) return false;

    const wideFieldCount = fields.filter((field: ProductFieldLike) => isLayoutWideField(field)).length;

    if (wideFieldCount === 0) return false;

    // Reserve full-width for truly table-heavy sections.
    return (
      wideFieldCount >= 2 ||
      wideFieldCount === fields.length
    );
  };

  // Define content layout types with field-aware detection
  const getContentLayout = (sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);

    if (!section) return 'form';

    // System sections have predefined layouts
    if (section.isSystem && section.layoutType) {
      return section.layoutType;
    }

    // For field groups, check if they contain wide field types
    if (section.isFieldGroup) {
      if (isTableHeavyFieldGroup(section.fieldGroup)) {
        return 'full-width';
      }
    }

    // Default to form layout for user-created field groups
    return section.layoutType || 'form';
  };

  const isFieldValueFilled = (value: unknown) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  };

  // Handle product type conversion (standalone Ã¢â€ â€™ parent)
  const handleProductTypeChange = (newType: 'parent') => {
    if (product) {
      setProduct({ ...product, type: newType });
    }
  };

  const isFieldAllowed = useCallback((field: ProductFieldLike) => {
    if (field?.is_channelable && Array.isArray(field.allowed_channel_ids) && field.allowed_channel_ids.length > 0) {
      if (selectedChannelId && !field.allowed_channel_ids.includes(selectedChannelId)) {
        return false;
      }
    }
    if (field?.is_localizable && Array.isArray(field.allowed_market_ids) && field.allowed_market_ids.length > 0) {
      if (selectedMarketId && !field.allowed_market_ids.includes(selectedMarketId)) {
        return false;
      }
    }
    if (field?.is_localizable && Array.isArray(field.allowed_locale_ids) && field.allowed_locale_ids.length > 0) {
      if (selectedLocaleId && !field.allowed_locale_ids.includes(selectedLocaleId)) {
        return false;
      }
    }
    return true;
  }, [selectedChannelId, selectedMarketId, selectedLocaleId]);

  const filteredFieldGroups = useMemo(() => {
    const processedGroups = fieldGroups.map((group) => ({
      ...group,
      fields: Array.isArray(group.fields)
        ? group.fields.filter(isFieldAllowed)
        : group.fields
    }));

    return processedGroups.sort((a, b) => {
      const aCode = String(a?.field_group?.code || "").trim().toLowerCase();
      const bCode = String(b?.field_group?.code || "").trim().toLowerCase();
      const aIsBasic = isBasicInformationFieldGroupCode(aCode);
      const bIsBasic = isBasicInformationFieldGroupCode(bCode);
      if (aIsBasic && !bIsBasic) return -1;
      if (!aIsBasic && bIsBasic) return 1;

      const aSortOrder = Number(a?.sort_order ?? Number.MAX_SAFE_INTEGER);
      const bSortOrder = Number(b?.sort_order ?? Number.MAX_SAFE_INTEGER);
      if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;

      const aName = String(a?.field_group?.name || "").trim().toLowerCase();
      const bName = String(b?.field_group?.name || "").trim().toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [fieldGroups, isFieldAllowed]);

  const documentationFieldGroup = useMemo(
    () =>
      filteredFieldGroups.find(
        (group) => String(group?.field_group?.code || "").trim().toLowerCase() === DOCUMENTATION_GROUP_CODE
      ) || null,
    [filteredFieldGroups]
  );

  const documentationSectionIdSet = useMemo(() => {
    const ids = new Set<string>();
    filteredFieldGroups.forEach((group) => {
      const code = String(group?.field_group?.code || "").trim().toLowerCase();
      if (code === DOCUMENTATION_GROUP_CODE) {
        ids.add(`fieldgroup-${code}`);
      }
    });
    return ids;
  }, [filteredFieldGroups]);

  const documentationSlotFields = useMemo<ProductDocumentFieldSlot[]>(() => {
    const fields = Array.isArray(documentationFieldGroup?.fields)
      ? documentationFieldGroup.fields
      : [];
    return fields
      .filter((field: ProductFieldLike) => field?.field_type === "file" || field?.field_type === "image")
      .map((field: ProductFieldLike) => {
        const slotCode = resolveDocumentSlotCode(field);
        if (!slotCode) return null;
        return {
          fieldId: String(field.id),
          fieldCode: String(field.code || ""),
          slotCode,
          label: String(field.name || field.code || "Document"),
          hint: String(field.description || "Attach product documentation from Assets."),
          allowMultiple: Boolean(field?.options?.allow_multiple),
        };
      })
      .filter((slot: ProductDocumentFieldSlot | null): slot is ProductDocumentFieldSlot => Boolean(slot))
      .sort((a: ProductDocumentFieldSlot, b: ProductDocumentFieldSlot) => {
        const aField = fields.find((field: ProductFieldLike) => String(field.id) === a.fieldId);
        const bField = fields.find((field: ProductFieldLike) => String(field.id) === b.fieldId);
        return Number(aField?.sort_order || 0) - Number(bField?.sort_order || 0);
      });
  }, [documentationFieldGroup]);

  const documentationSlotCodeSet = useMemo(
    () => new Set(documentationSlotFields.map((slot) => slot.slotCode)),
    [documentationSlotFields]
  );

  const reservedSlotCodeSet = useMemo(
    () => new Set([...Array.from(PRODUCT_IMAGE_SLOT_CODE_SET), ...Array.from(documentationSlotCodeSet)]),
    [documentationSlotCodeSet]
  );

  const dynamicFieldGroupSections = useMemo<ProductFieldGroupSection[]>(
    () =>
      filteredFieldGroups.map((group) => ({
        id: `fieldgroup-${group.field_group.code}`,
        label: group.field_group.name,
        icon: Zap,
        isFieldGroup: true,
        isSystem: false,
        layoutType: 'form', // Default, but can be overridden by field types
        fieldGroup: group,
      })),
    [filteredFieldGroups]
  );

  const sections = useMemo<ProductSection[]>(
    () => [...staticSections, ...parentOnlySections, ...dynamicFieldGroupSections],
    [dynamicFieldGroupSections, parentOnlySections, staticSections]
  );

  const variantInheritanceConfig = useMemo(() => {
    const rawConfig = asRecord(
      product?.marketplace_content?.variantInheritance ??
      product?.marketplaceContent?.variantInheritance
    );

    const inheritByDefault =
      typeof rawConfig?.inheritByDefault === "boolean"
        ? rawConfig.inheritByDefault
        : true;
    const allowChildOverrides =
      typeof rawConfig?.allowChildOverrides === "boolean"
        ? rawConfig.allowChildOverrides
        : true;

    return {
      inheritByDefault,
      allowChildOverrides,
    };
  }, [product]);

  const updateVariantInheritanceConfig = async (
    partial: Partial<{ inheritByDefault: boolean; allowChildOverrides: boolean }>
  ) => {
    if (
      isSharedBrandView ||
      !canEditFields ||
      !product ||
      product.type !== "parent"
    ) {
      return;
    }

    const nextConfig = {
      inheritByDefault: partial.inheritByDefault ?? variantInheritanceConfig.inheritByDefault,
      allowChildOverrides:
        partial.allowChildOverrides ?? variantInheritanceConfig.allowChildOverrides,
    };

    const currentMarketplaceContent =
      product.marketplace_content &&
      typeof product.marketplace_content === "object" &&
      !Array.isArray(product.marketplace_content)
        ? { ...(product.marketplace_content as Record<string, unknown>) }
        : {};

    const nextMarketplaceContent = {
      ...currentMarketplaceContent,
      variantInheritance: {
        inheritByDefault: nextConfig.inheritByDefault,
        allowChildOverrides: nextConfig.allowChildOverrides,
        updatedAt: new Date().toISOString(),
      },
    };

    setProduct((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        marketplace_content: nextMarketplaceContent,
        marketplaceContent: nextMarketplaceContent,
      };
    });

    try {
      await saveFieldValues(
        {
          marketplace_content: nextMarketplaceContent,
        },
        { forceGlobalScope: true }
      );
    } catch (error) {
      console.error("Failed to update variant inheritance defaults:", error);
    }
  };

  const fieldGroupStats = useMemo(() => {
    return filteredFieldGroups.map((group) => {
      const fields = Array.isArray(group.fields) ? group.fields : [];
      const requiredFields = fields.filter((field: ProductFieldLike) => field?.is_required);
      const completeRequired = requiredFields.filter((field: ProductFieldLike) => {
        const value = isScinSystemField(field)
          ? (product?.scin || product?.id || '')
          : fieldValues[field.code];
        return isFieldValueFilled(value);
      }).length;

      return {
        group,
        sectionId: `fieldgroup-${group.field_group.code}`,
        totalFieldCount: fields.length,
        requiredFieldCount: requiredFields.length,
        missingRequiredCount: Math.max(requiredFields.length - completeRequired, 0),
      };
    });
  }, [filteredFieldGroups, fieldValues, isScinSystemField, product?.id, product?.scin]);

  const requiredFieldGroupStats = useMemo(
    () => fieldGroupStats.filter((stats) => stats.requiredFieldCount > 0),
    [fieldGroupStats]
  );
  const missingFieldGroupStats = useMemo(
    () => fieldGroupStats.filter((stats) => stats.missingRequiredCount > 0),
    [fieldGroupStats]
  );

  useEffect(() => {
    const validSections = new Set(sections.map((section) => section.id));
    if (!validSections.has(activeSection)) {
      setActiveSection('attributes-all');
    }
  }, [activeSection, sections]);

  useEffect(() => {
    const requestedSection = (searchParams.get("section") || "").trim().toLowerCase();
    if (!requestedSection) return;
    const normalizedRequestedSection =
      requestedSection === "overview" ? "attributes-all" : requestedSection;

    const alwaysSupportedSections = new Set([
      "attributes-all",
      "attributes-required",
      "attributes-missing",
      "variants",
      "media",
      "product-settings",
    ]);
    const dynamicSectionIds = new Set(sections.map((section) => section.id));

    if (
      alwaysSupportedSections.has(normalizedRequestedSection) ||
      dynamicSectionIds.has(normalizedRequestedSection)
    ) {
      setActiveSection(normalizedRequestedSection);
    }
  }, [searchParams, sections]);

  useEffect(() => {
    if (hasAutoSelectedInitialSectionRef.current) return;

    const requestedSection = (searchParams.get("section") || "").trim().toLowerCase();
    if (requestedSection) {
      hasAutoSelectedInitialSectionRef.current = true;
      return;
    }

    if (activeSection !== 'attributes-all') {
      hasAutoSelectedInitialSectionRef.current = true;
      return;
    }

    if (dynamicFieldGroupSections.length === 0) return;

    const preferredSectionId =
      dynamicFieldGroupSections.find((section) => {
        const code = String(section.fieldGroup?.field_group?.code || '').trim().toLowerCase();
        const name = String(section.label || '').trim().toLowerCase();
        return isBasicInformationFieldGroupCode(code) || name === 'basic information';
      })?.id ?? dynamicFieldGroupSections[0]?.id;

    if (preferredSectionId) {
      setActiveSection(preferredSectionId);
      hasAutoSelectedInitialSectionRef.current = true;
    }
  }, [activeSection, dynamicFieldGroupSections, searchParams]);
  const linkedAssetIdSet = useMemo(
    () => new Set(linkedAssets.map((link) => link?.asset_id || link?.dam_assets?.id).filter(Boolean)),
    [linkedAssets]
  );
  const imageSlotLinks = useMemo(() => {
    const byCode: Record<string, ProductLinkLike | null> = {};
    for (const slot of PRODUCT_IMAGE_SLOTS) {
      byCode[slot.code] = null;
    }

    for (const link of linkedAssets) {
      const slotCode = String(link?.document_slot_code || "").trim().toLowerCase();
      if (!PRODUCT_IMAGE_SLOT_CODE_SET.has(slotCode)) {
        continue;
      }
      if (!byCode[slotCode]) {
        byCode[slotCode] = link;
      }
    }

    return byCode;
  }, [linkedAssets]);
  const documentSlotLinksByFieldId = useMemo(() => {
    const byFieldId: Record<string, ProductLinkLike | null> = {};
    const slotByCode = new Map<string, ProductDocumentFieldSlot>();
    documentationSlotFields.forEach((slot) => {
      byFieldId[slot.fieldId] = null;
      slotByCode.set(slot.slotCode, slot);
    });

    for (const link of linkedAssets) {
      const fieldId = String(link?.product_field_id || "").trim();
      const slotCode = String(link?.document_slot_code || "").trim().toLowerCase();

      if (fieldId && Object.prototype.hasOwnProperty.call(byFieldId, fieldId) && !byFieldId[fieldId]) {
        byFieldId[fieldId] = link;
        continue;
      }

      const matchedSlot = slotByCode.get(slotCode);
      if (matchedSlot && !byFieldId[matchedSlot.fieldId]) {
        byFieldId[matchedSlot.fieldId] = link;
      }
    }

    return byFieldId;
  }, [documentationSlotFields, linkedAssets]);
  const visibleDocumentSlotFields = useMemo(() => {
    const slots = documentationSlotFields;
    if (showMissingOnlyDocumentSlots) {
      return slots.filter((slot) => !Boolean(documentSlotLinksByFieldId[slot.fieldId]));
    }
    if (showAllDocumentSlots) {
      return slots;
    }

    const primarySlots = slots.filter((slot) => PRIMARY_DOCUMENT_SLOT_CODES.has(slot.slotCode));
    if (primarySlots.length > 0) {
      return primarySlots;
    }
    return slots.slice(0, Math.min(3, slots.length));
  }, [
    documentSlotLinksByFieldId,
    documentationSlotFields,
    showAllDocumentSlots,
    showMissingOnlyDocumentSlots,
  ]);
  const visibleImageSlots = useMemo(() => {
    const slots = PRODUCT_IMAGE_SLOTS;
    if (showMissingOnlyImageSlots) {
      return slots.filter((slot) => !Boolean(imageSlotLinks[slot.code]));
    }
    if (showAllImageSlots) {
      return slots;
    }
    return slots.filter((slot) => PRIMARY_IMAGE_SLOT_CODES.has(slot.code));
  }, [imageSlotLinks, showAllImageSlots, showMissingOnlyImageSlots]);
  const nonSlotLinkedAssets = useMemo(
    () =>
      linkedAssets.filter((link) => {
        const slotCode = String(link?.document_slot_code || "").trim().toLowerCase();
        return !reservedSlotCodeSet.has(slotCode);
      }),
    [linkedAssets, reservedSlotCodeSet]
  );
  const filteredAvailableAssets = useMemo(() => {
    const query = availableAssetQuery.trim().toLowerCase();
    return availableAssets.filter((asset) => {
      if (linkedAssetIdSet.has(asset.id)) return false;
      if (!query) return true;
      const haystack = `${asset.originalFilename || asset.filename || ""} ${asset.fileType || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [availableAssets, availableAssetQuery, linkedAssetIdSet]);
  const slotAssignableAssets = useMemo(() => {
    const query = availableAssetQuery.trim().toLowerCase();
    return availableAssets.filter((asset) => {
      if (slotAssignmentContext?.acceptMode === "image" && !isImageLikeAsset(asset)) {
        return false;
      }
      if (slotAssignmentContext?.acceptMode === "document" && !isDocumentLikeAsset(asset)) {
        return false;
      }
      if (!query) return true;
      const haystack = `${asset.originalFilename || asset.filename || ""} ${asset.fileType || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [availableAssets, availableAssetQuery, slotAssignmentContext?.acceptMode]);

  const fetchLinkedAssets = useCallback(async () => {
    if (!tenantSlug || !product?.id) return;
    try {
      setLoadingLinkedAssets(true);
      setLinkedAssetsError(null);
      const query = new URLSearchParams();
      query.set("product_id", product.id);
      if (selectedBrandSlug) {
        query.set("brand", selectedBrandSlug);
      }
      const response = await fetch(`/api/${tenantSlug}/product-links?${query.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch linked assets (${response.status})`);
      }
      const payload = asRecord(await parseJsonSafely(response));
      const payloadData = Array.isArray(payload?.data) ? (payload.data as ProductLinkLike[]) : [];
      setLinkedAssets(payloadData);
    } catch (error) {
      console.error("Failed to fetch linked assets:", error);
      setLinkedAssets([]);
      setLinkedAssetsError("Could not load linked assets.");
    } finally {
      setLoadingLinkedAssets(false);
    }
  }, [tenantSlug, product?.id, selectedBrandSlug]);

  useEffect(() => {
    const isDocumentationSection = documentationSectionIdSet.has(activeSection);
    if (activeSection !== "media" && !isDocumentationSection) return;
    fetchLinkedAssets();
  }, [activeSection, documentationSectionIdSet, fetchLinkedAssets]);

  const fetchAssetFolders = useCallback(async () => {
    if (!tenantSlug) return;
    try {
      const response = await fetch(`/api/organizations/${tenantSlug}/assets/folders`);
      if (!response.ok) {
        throw new Error(`Failed to fetch folders (${response.status})`);
      }
      const payload = asApiEnvelope<unknown[]>(await parseJsonSafely(response));
      setAssetFolders(Array.isArray(payload.data) ? (payload.data as FolderRecord[]) : []);
    } catch (error) {
      console.error("Failed to fetch asset folders:", error);
      setAssetFolders([]);
    }
  }, [tenantSlug]);

  useEffect(() => {
    if (activeSection !== "media" || isSharedBrandView) return;
    fetchAssetFolders();
  }, [activeSection, fetchAssetFolders, isSharedBrandView]);

  const fetchAvailableAssets = async () => {
    if (!tenantSlug) return;
    try {
      setLoadingAvailableAssets(true);
      const query = new URLSearchParams();
      query.set("limit", "200");
      if (selectedBrandSlug) {
        query.set("brand", selectedBrandSlug);
      }
      const response = await fetch(`/api/${tenantSlug}/assets?${query.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch assets (${response.status})`);
      }
      const payload = asRecord(await parseJsonSafely(response));
      const data = asRecord(payload?.data);
      setAvailableAssets(Array.isArray(data?.assets) ? (data.assets as DamAssetLike[]) : []);
      setAssetFolders(Array.isArray(data?.folders) ? (data.folders as FolderRecord[]) : []);
    } catch (error) {
      console.error("Failed to fetch available assets:", error);
      setAvailableAssets([]);
    } finally {
      setLoadingAvailableAssets(false);
    }
  };

  const handleUnlinkAsset = async (linkId: string) => {
    if (isSharedBrandView) return;
    setIsMutatingLinks(true);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/product-links/${linkId}${selectedBrandQuery ? `?${selectedBrandQuery}` : ""}`,
        {
        method: "DELETE",
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to unlink asset (${response.status})`);
      }
      await fetchLinkedAssets();
    } catch (error) {
      console.error("Failed to unlink asset:", error);
    } finally {
      setIsMutatingLinks(false);
    }
  };

  const handleRelinkAsset = async (link: ProductLinkLike) => {
    if (isSharedBrandView) return;
    if (!product?.id) return;
    const assetId = link?.asset_id || link?.dam_assets?.id;
    if (!assetId) return;

    setIsMutatingLinks(true);
    try {
      await fetch(
        `/api/${tenantSlug}/product-links/${link.id}${selectedBrandQuery ? `?${selectedBrandQuery}` : ""}`,
        {
        method: "DELETE",
        }
      );
      await fetch(`/api/${tenantSlug}/product-links${selectedBrandQuery ? `?${selectedBrandQuery}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          asset_id: assetId,
          link_context: "product_detail_relink",
          link_type: "manual",
          confidence: 1,
          match_reason: "Relinked from product detail",
        }),
      });
      await fetchLinkedAssets();
    } catch (error) {
      console.error("Failed to relink asset:", error);
    } finally {
      setIsMutatingLinks(false);
    }
  };

  const handleToggleAssetToLink = (assetId: string) => {
    setSelectedAssetIdsToLink((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const buildAssetPreviewPath = useCallback(
    (assetId: string, versionToken?: string | null) => {
      const query = new URLSearchParams();
      if (selectedBrandSlug) {
        query.set("brand", selectedBrandSlug);
      }
      if (versionToken && versionToken.trim().length > 0) {
        query.set("v", versionToken.trim());
      }
      return query.toString()
        ? `/api/${tenantSlug}/assets/${assetId}/preview?${query.toString()}`
        : `/api/${tenantSlug}/assets/${assetId}/preview`;
    },
    [selectedBrandSlug, tenantSlug]
  );

  const resolveUploadFolderPayload = useCallback(() => {
    if (selectedUploadFolderId === "auto") {
      return {
        autoOrganize: true,
        targetFolderId: null as string | null,
      };
    }
    if (selectedUploadFolderId === "none") {
      return {
        autoOrganize: false,
        targetFolderId: null as string | null,
      };
    }
    return {
      autoOrganize: false,
      targetFolderId: selectedUploadFolderId,
    };
  }, [selectedUploadFolderId]);

  const uploadFileToSlot = useCallback(
    async (params: {
      slotCode: string;
      file: File;
      assetType: "image" | "document";
      acceptMode: "image" | "document";
      productFieldId?: string | null;
      replaceExistingSlot?: boolean;
      existingAssetId?: string | null;
      versionChangeComment?: string | null;
      versionEffectiveFrom?: string | null;
      versionEffectiveTo?: string | null;
    }) => {
      const {
        slotCode,
        file,
        assetType,
        acceptMode,
        productFieldId,
        replaceExistingSlot = true,
        existingAssetId = null,
        versionChangeComment = null,
        versionEffectiveFrom = null,
        versionEffectiveTo = null,
      } = params;
      if (isSharedBrandView || !product?.id) return false;
      const isFileAccepted =
        acceptMode === "image" ? isImageLikeFile(file) : isDocumentLikeFile(file);
      if (!isFileAccepted) {
        const message =
          acceptMode === "image"
            ? "Only image files can be uploaded to image slots."
            : "Only document-compatible files can be uploaded to document slots.";
        setSlotUploadError(message);
        console.error(message);
        return false;
      }

      setSlotUploadError(null);
      setUploadingSlotCode(slotCode);
      setIsMutatingLinks(true);
      try {
        const shouldCreateNewVersion = Boolean(existingAssetId);
        const response = shouldCreateNewVersion
          ? await (async () => {
              const formData = new FormData();
              formData.append("file", file);
              const normalizedComment =
                typeof versionChangeComment === "string" && versionChangeComment.trim().length > 0
                  ? versionChangeComment.trim()
                  : `Updated from product ${assetType} slot: ${slotCode}`;
              formData.append("changeComment", normalizedComment);
              if (typeof versionEffectiveFrom === "string" && versionEffectiveFrom.trim().length > 0) {
                formData.append("effectiveFrom", versionEffectiveFrom.trim());
              }
              if (typeof versionEffectiveTo === "string" && versionEffectiveTo.trim().length > 0) {
                formData.append("effectiveTo", versionEffectiveTo.trim());
              }
              return fetch(
                `/api/${tenantSlug}/assets/${existingAssetId}/versions${selectedBrandQuery ? `?${selectedBrandQuery}` : ""}`,
                {
                  method: "POST",
                  body: formData,
                }
              );
            })()
          : await (async () => {
              const formData = new FormData();
              formData.append("file", file);
              formData.append(
                "productLink",
                JSON.stringify({
                  productId: product.id,
                  linkContext: `product_${assetType}_slot:${slotCode}:upload`,
                  confidence: 1,
                  matchReason: `Uploaded and linked to ${slotCode}`,
                  assetType,
                  documentSlotCode: slotCode,
                  replaceExistingSlot,
                  productFieldId,
                  ...resolveUploadFolderPayload(),
                })
              );
              return fetch(
                `/api/${tenantSlug}/assets/upload${selectedBrandQuery ? `?${selectedBrandQuery}` : ""}`,
                {
                  method: "POST",
                  body: formData,
                }
              );
            })();

        if (!response.ok) {
          const payload = asApiEnvelope(await parseJsonSafely(response));
          const message = toErrorMessage(payload, `Failed to upload asset (${response.status})`);
          setSlotUploadError(message);
          throw new Error(message);
        }

        await fetchLinkedAssets();
        return true;
      } catch (error) {
        console.error("Failed to upload slot asset:", error);
        return false;
      } finally {
        setUploadingSlotCode(null);
        setIsMutatingLinks(false);
      }
    },
    [
      fetchLinkedAssets,
      isSharedBrandView,
      product?.id,
      resolveUploadFolderPayload,
      selectedBrandQuery,
      tenantSlug,
    ]
  );

  const handleSlotFileInputChange = async (
    context: SlotAssignmentContext,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadFileToSlot({
      slotCode: context.slotCode,
      file,
      assetType: context.assetType,
      acceptMode: context.acceptMode,
      productFieldId: context.productFieldId || null,
      replaceExistingSlot: context.replaceExistingSlot,
      existingAssetId: context.existingAssetId || null,
    });
    event.target.value = "";
  };

  const handleSlotDrop = async (
    context: SlotAssignmentContext,
    event: React.DragEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverSlotCode(null);
    setSlotUploadError(null);
    const file =
      context.acceptMode === "image"
        ? extractFirstImageFile(event.dataTransfer)
        : extractFirstDocumentFile(event.dataTransfer);
    if (!file) {
      setSlotUploadError(
        context.acceptMode === "image"
          ? "Drop a local image file. To use existing DAM assets, click Link."
          : "Drop a local document-compatible file. To use existing DAM assets, click Link."
      );
      return;
    }
    await uploadFileToSlot({
      slotCode: context.slotCode,
      file,
      assetType: context.assetType,
      acceptMode: context.acceptMode,
      productFieldId: context.productFieldId || null,
      replaceExistingSlot: context.replaceExistingSlot,
      existingAssetId: context.existingAssetId || null,
    });
  };

  const openAssignSlotDialog = async (
    context: SlotAssignmentContext,
    existingLink?: ProductLinkLike | null
  ) => {
    setSlotAssignmentContext(context);
    const existing = existingLink || imageSlotLinks[context.slotCode];
    setSelectedSlotAssetId(existing?.asset_id || existing?.dam_assets?.id || null);
    setAvailableAssetQuery("");
    setIsAssignSlotDialogOpen(true);
    await fetchAvailableAssets();
  };

  const fetchSlotVersionHistory = useCallback(
    async (assetId: string) => {
      setVersionHistoryRecords([]);
      setVersionHistoryError(null);
      setVersionHistoryLoading(true);
      try {
        const response = await fetch(
          `/api/${tenantSlug}/assets/${assetId}/versions${selectedBrandQuery ? `?${selectedBrandQuery}` : ""}`
        );
        if (!response.ok) {
          const payload = asApiEnvelope(await parseJsonSafely(response));
          throw new Error(toErrorMessage(payload, `Failed to load version history (${response.status})`));
        }
        const payload = asApiEnvelope<unknown[]>(await parseJsonSafely(response));
        const records = Array.isArray(payload.data) ? payload.data : [];
        setVersionHistoryRecords(records as AssetVersionHistoryRecord[]);
      } catch (error) {
        console.error("Failed to load slot version history:", error);
        setVersionHistoryError(
          error instanceof Error ? error.message : "Failed to load version history."
        );
      } finally {
        setVersionHistoryLoading(false);
      }
    },
    [selectedBrandQuery, tenantSlug]
  );

  const openVersionHistoryDialog = useCallback(
    async (slotLabel: string, assetId?: string | null) => {
      if (!assetId) return;
      setVersionHistorySlotLabel(slotLabel);
      setVersionHistoryAssetId(assetId);
      setIsVersionHistoryDialogOpen(true);
      await fetchSlotVersionHistory(assetId);
    },
    [fetchSlotVersionHistory]
  );

  const handleRestoreSlotVersion = useCallback(
    async (record: AssetVersionHistoryRecord) => {
      if (record.isCurrent) return;
      if (!versionHistoryAssetId) return;
      setRestoringSlotVersionId(record.id);
      setVersionHistoryError(null);
      try {
        const response = await fetch(
          `/api/${tenantSlug}/assets/${versionHistoryAssetId}/versions/restore${selectedBrandQuery ? `?${selectedBrandQuery}` : ""}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ versionId: record.id }),
          }
        );
        if (!response.ok) {
          const payload = asApiEnvelope(await parseJsonSafely(response));
          throw new Error(toErrorMessage(payload, `Failed to restore version (${response.status})`));
        }
        await fetchLinkedAssets();
        await fetchSlotVersionHistory(versionHistoryAssetId);
      } catch (error) {
        console.error("Failed to restore slot version:", error);
        setVersionHistoryError(
          error instanceof Error ? error.message : "Failed to restore selected version."
        );
      } finally {
        setRestoringSlotVersionId(null);
      }
    },
    [
      fetchLinkedAssets,
      fetchSlotVersionHistory,
      selectedBrandQuery,
      tenantSlug,
      versionHistoryAssetId,
    ]
  );

  const openSlotVersionDialog = useCallback((context: SlotAssignmentContext) => {
    if (!context.existingAssetId) return;
    setSlotVersionContext(context);
    setSlotVersionFile(null);
    setSlotVersionComment("");
    setSlotVersionEffectiveFrom("");
    setSlotVersionEffectiveTo("");
    setSlotVersionDialogError(null);
    setIsSlotVersionDialogOpen(true);
  }, []);

  const handleSubmitSlotVersionDialog = useCallback(async () => {
    if (!slotVersionContext?.existingAssetId) {
      setSlotVersionDialogError("No assigned asset found for this slot.");
      return;
    }
    if (!slotVersionFile) {
      setSlotVersionDialogError("Select a file to upload as a new version.");
      return;
    }
    if (
      slotVersionEffectiveFrom &&
      slotVersionEffectiveTo &&
      new Date(slotVersionEffectiveTo) < new Date(slotVersionEffectiveFrom)
    ) {
      setSlotVersionDialogError("Effective end date must be on or after the start date.");
      return;
    }

    setSlotVersionDialogError(null);
    const success = await uploadFileToSlot({
      slotCode: slotVersionContext.slotCode,
      file: slotVersionFile,
      assetType: slotVersionContext.assetType,
      acceptMode: slotVersionContext.acceptMode,
      productFieldId: slotVersionContext.productFieldId || null,
      replaceExistingSlot: slotVersionContext.replaceExistingSlot,
      existingAssetId: slotVersionContext.existingAssetId,
      versionChangeComment: slotVersionComment || null,
      versionEffectiveFrom: slotVersionEffectiveFrom || null,
      versionEffectiveTo: slotVersionEffectiveTo || null,
    });
    if (!success) {
      setSlotVersionDialogError("Failed to upload this version. Try again.");
      return;
    }
    setIsSlotVersionDialogOpen(false);
    setSlotVersionContext(null);
    setSlotVersionFile(null);
    setSlotVersionComment("");
    setSlotVersionEffectiveFrom("");
    setSlotVersionEffectiveTo("");
  }, [
    slotVersionComment,
    slotVersionContext,
    slotVersionEffectiveFrom,
    slotVersionEffectiveTo,
    slotVersionFile,
    uploadFileToSlot,
  ]);

  const handleAssignSlotAsset = async () => {
    if (isSharedBrandView) return;
    if (!product?.id || !slotAssignmentContext || !selectedSlotAssetId) return;

    setIsMutatingLinks(true);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/product-links${selectedBrandQuery ? `?${selectedBrandQuery}` : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: product.id,
            asset_id: selectedSlotAssetId,
            asset_type: slotAssignmentContext.assetType,
            link_context: `product_${slotAssignmentContext.assetType}_slot:${slotAssignmentContext.slotCode}`,
            link_type: "manual",
            confidence: 1,
            match_reason: `Linked to ${slotAssignmentContext.slotCode}`,
            document_slot_code: slotAssignmentContext.slotCode,
            product_field_id: slotAssignmentContext.productFieldId || null,
            replace_existing_slot: slotAssignmentContext.replaceExistingSlot,
          }),
        }
      );
      if (!response.ok) {
        const payload = asApiEnvelope(await parseJsonSafely(response));
        throw new Error(toErrorMessage(payload, `Failed to assign slot (${response.status})`));
      }
      setIsAssignSlotDialogOpen(false);
      setSlotAssignmentContext(null);
      setSelectedSlotAssetId(null);
      await fetchLinkedAssets();
    } catch (error) {
      console.error("Failed to assign slot:", error);
    } finally {
      setIsMutatingLinks(false);
    }
  };

  const handleCreateAssetFolder = async () => {
    if (isSharedBrandView) return;
    const trimmedName = newFolderName.trim();
    if (!trimmedName) {
      setFolderMutationError("Folder name is required.");
      return;
    }

    setFolderMutationError(null);
    setIsCreatingFolder(true);
    try {
      const parentId =
        selectedUploadFolderId && !["auto", "none"].includes(selectedUploadFolderId)
          ? selectedUploadFolderId
          : null;
      const response = await fetch(`/api/organizations/${tenantSlug}/assets/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          parentId,
        }),
      });
      if (!response.ok) {
        const payload = asApiEnvelope(await parseJsonSafely(response));
        throw new Error(toErrorMessage(payload, `Failed to create folder (${response.status})`));
      }
      const createdFolder = asApiEnvelope(await parseJsonSafely(response));
      const createdFolderId =
        typeof createdFolder.data === "object" && createdFolder.data
          ? String((createdFolder.data as Record<string, unknown>).id || "")
          : "";
      await fetchAssetFolders();
      if (createdFolderId) {
        setSelectedUploadFolderId(createdFolderId);
      }
      setNewFolderName("");
      setIsCreateFolderDialogOpen(false);
    } catch (error) {
      console.error("Failed to create folder:", error);
      setFolderMutationError(error instanceof Error ? error.message : "Failed to create folder.");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleLinkSelectedAssets = async () => {
    if (isSharedBrandView) return;
    if (!product?.id || selectedAssetIdsToLink.size === 0) return;
    setIsMutatingLinks(true);
    try {
      for (const assetId of selectedAssetIdsToLink) {
        await fetch(`/api/${tenantSlug}/product-links${selectedBrandQuery ? `?${selectedBrandQuery}` : ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: product.id,
            asset_id: assetId,
            link_context: "product_detail",
            link_type: "manual",
            confidence: 1,
            match_reason: "Linked from product detail",
          }),
        });
      }
      setIsLinkAssetDialogOpen(false);
      setSelectedAssetIdsToLink(new Set());
      await fetchLinkedAssets();
    } catch (error) {
      console.error("Failed to link selected assets:", error);
    } finally {
      setIsMutatingLinks(false);
    }
  };

  // Market context handles selection persistence and filtering

  const fetchFieldGroups = useCallback(async (familyId: string) => {
    try {
      // Check cache first
      if (fieldGroupsCacheRef.current.has(familyId)) {
        console.log('Ã¢Å¡Â¡ Using cached field groups for family:', familyId);
        setFieldGroups(fieldGroupsCacheRef.current.get(familyId) || []);
        setLoadingFieldGroups(false);
        return;
      }

      setLoadingFieldGroups(true);
      console.log('Ã°Å¸â€Â Fetching field groups for family:', familyId);
      const startTime = Date.now();

      const groupsQuery = new URLSearchParams();
      if (selectedBrandSlug) groupsQuery.set("brand", selectedBrandSlug);
      const groupsUrl = groupsQuery.toString()
        ? `/api/${tenantSlug}/product-families/${familyId}/field-groups?${groupsQuery.toString()}`
        : `/api/${tenantSlug}/product-families/${familyId}/field-groups`;

      const response = await fetch(groupsUrl, {
        cache: 'no-store'
      });

      if (response.ok) {
        const parsed = await parseJsonSafely(response);
        if (!parsed) {
          throw new Error('Field groups API returned an empty or invalid response');
        }
        const groupsData = Array.isArray(parsed) ? parsed : [];
        console.log('Ã°Å¸â€œÂ¥ Field groups response received in:', Date.now() - startTime, 'ms');
        console.log('Ã°Å¸â€œÅ  Field groups data:', groupsData);

        const processedGroups = groupsData
          .map((item) => normalizeProductFieldGroup(item))
          .filter((group): group is ProductFieldGroupLike => Boolean(group));

        console.log('Ã¢Å“â€¦ Field groups processed:', processedGroups.length, 'groups');
        console.log('Ã°Å¸â€Â First field from first group:', processedGroups[0]?.fields?.[0]);

        // Cache the results without triggering rerender loops.
        fieldGroupsCacheRef.current.set(familyId, processedGroups);
        setFieldGroups(processedGroups);
      } else {
        const errorData = asApiEnvelope(await parseJsonSafely(response));
        console.error('Ã¢ÂÅ’ Field groups API error:', response.status, errorData);
      }
    } catch (err) {
      console.error('Ã¢ÂÅ’ Error fetching field groups:', err);
    } finally {
      setLoadingFieldGroups(false);
      console.log('Ã°Å¸ÂÂ Field groups loading completed');
    }
  }, [tenantSlug, selectedBrandSlug]);

  const fetchCompleteness = useCallback(async () => {
    if (!product?.id || !isScopeReady) return;

    try {
      setCompletenessLoading(true);
      const query = new URLSearchParams();
      if (selectedMarketId) query.set('marketId', selectedMarketId);
      if (selectedChannelId) query.set('channelId', selectedChannelId);
      if (selectedLocaleId) query.set('localeId', selectedLocaleId);
      if (selectedDestinationId) query.set('destinationId', selectedDestinationId);
      if (selectedLocale?.code) query.set('locale', selectedLocale.code);
      if (selectedChannel?.code) query.set('channel', selectedChannel.code);
      if (selectedDestination?.code) query.set('destination', selectedDestination.code);
      if (selectedBrandSlug) query.set('brand', selectedBrandSlug);
      const url = query.toString()
        ? `/api/${tenantSlug}/products/${product.id}/completeness?${query.toString()}`
        : `/api/${tenantSlug}/products/${product.id}/completeness`;
      const response = await fetch(
        url,
        { cache: 'no-store' }
      );
      const data = asApiEnvelope(await parseJsonSafely(response));

      if (!response.ok) {
        console.warn('Completeness API error:', response.status, data);
        return;
      }

      setCompleteness(asRecord(data.data) as {
        percent: number;
        requiredCount: number;
        completeCount: number;
        missingAttributes: Array<{ code: string; label: string }>;
        isComplete: boolean;
        familyId?: string | null;
      } | null);
    } catch (err) {
      console.error('Error fetching completeness:', err);
    } finally {
      setCompletenessLoading(false);
    }
  }, [
    product?.id,
    tenantSlug,
    selectedMarketId,
    selectedChannelId,
    selectedLocaleId,
    selectedDestinationId,
    selectedLocale?.code,
    selectedChannel?.code,
    selectedDestination?.code,
    selectedBrandSlug,
    isScopeReady,
  ]);

  // Load product data from API
  useEffect(() => {
    let isCancelled = false;

    const fetchProduct = async () => {
      try {
        setLoading(true);
        console.log('Ã°Å¸â€Â Fetching product:', productId);
        console.log('Ã°Å¸â€Â GET Request URL:', `/api/${tenantSlug}/products/${productId}`);

        const query = new URLSearchParams();
        if (selectedMarketId) query.set('marketId', selectedMarketId);
        if (selectedChannelId) query.set('channelId', selectedChannelId);
        if (selectedLocaleId) query.set('localeId', selectedLocaleId);
        if (selectedDestinationId) query.set('destinationId', selectedDestinationId);
        if (selectedLocale?.code) query.set('locale', selectedLocale.code);
        if (selectedChannel?.code) query.set('channel', selectedChannel.code);
        if (selectedDestination?.code) query.set('destination', selectedDestination.code);
        if (selectedBrandSlug) query.set('brand', selectedBrandSlug);
        const url = query.toString()
          ? `/api/${tenantSlug}/products/${productId}?${query.toString()}`
          : `/api/${tenantSlug}/products/${productId}`;
        const response = await fetchJsonWithDedupe<ApiEnvelope<Record<string, unknown>>>(url, {
          ttlMs: 1500,
        });
        console.log('Ã°Å¸â€œÂ¥ GET Response status:', response.status);

        const data = asApiEnvelope<Record<string, unknown>>(response.data);
        console.log('Ã°Å¸â€œÂ¥ GET Response data:', data);

        if (!response.ok) {
          throw new Error(toErrorMessage(data, 'Failed to fetch product'));
        }
        if (isCancelled) return;

        if (data?.success && data?.data) {
          const productPayload = data.data;
          const parentProduct = asRecord(data.data.parent_product);
          const productFamily = asRecord(data.data.product_families);
          const marketplaceContent = asRecord(data.data.marketplace_content) ?? {};
          const variants = Array.isArray(data.data.variants)
            ? data.data.variants
                .map((variant) => asRecord(variant))
                .filter((variant): variant is Record<string, unknown> => Boolean(variant))
            : [];
          // Transform API data to component state format
          const productData: ProductState = {
            id: String(data.data.id ?? productId),
            productName:
              toTextValue(data.data.product_name) ||
              toTextValue(data.data.sku) ||
              String(data.data.id ?? ""),
            scin: toTextValue(data.data.scin) || String(data.data.id ?? ""),
            sku: toTextValue(data.data.sku),
            upc: toTextValue(data.data.barcode ?? data.data.upc),
            brand: toTextValue(data.data.brand_line),
            category: toTextValue(productFamily?.name),
            shortDescription: toTextValue(data.data.short_description),
            longDescription: toTextValue(data.data.long_description),
            status: toTextValue(data.data.status) || "Draft",
            type: toProductType(data.data.type),
            parentId: typeof data.data.parent_id === "string" ? data.data.parent_id : null,
            parentSku: toTextValue(parentProduct?.sku),
            parentName: toTextValue(parentProduct?.product_name),
            hasVariants: data.data.has_variants === true,
            variantCount: typeof data.data.variant_count === "number" ? data.data.variant_count : 0,
            variants,
            msrp: data.data.msrp,
            costOfGoods: data.data.cost_of_goods,
            marginPercent: data.data.margin_percent,
            assetsCount: data.data.assets_count,
            contentScore: data.data.content_score,
            features: data.data.features || [],
            specifications: asRecord(data.data.specifications) ?? {},
            metaTitle: data.data.meta_title,
            metaDescription: data.data.meta_description,
            keywords: data.data.keywords || [],
            weightG: data.data.weight_g,
            dimensions: asRecord(data.data.dimensions) ?? {},
            marketplace_content: marketplaceContent,
            marketplaceContent: marketplaceContent,
            createdAt: data.data.created_at,
            updatedAt: data.data.updated_at,
            family_id: typeof data.data.family_id === "string" ? data.data.family_id : null,
          };

          setProduct(productData);

          // Initialize field values from product data
          // Custom fields are stored directly on the product object with their field codes
          const customFieldValues: Record<string, unknown> = {};
          Object.keys(productPayload).forEach(key => {
            // Skip system fields
            const systemFields = ['id', 'organization_id', 'type', 'parent_id', 'product_name', 'scin', 'sku', 'barcode',
              'brand_line', 'family_id', 'status', 'launch_date', 'msrp', 'cost_of_goods', 'margin_percent',
              'assets_count', 'content_score', 'short_description', 'long_description', 'features',
              'specifications', 'meta_title', 'meta_description', 'keywords', 'weight_g', 'dimensions',
              'inheritance', 'is_inherited', 'marketplace_content', 'variant_axis', 'created_at',
              'updated_at', 'created_by', 'last_modified_by', 'has_variants', 'variant_count',
              'product_families', 'parent_product', 'variants'];

            if (
              !systemFields.includes(key) &&
              productPayload[key] !== null &&
              productPayload[key] !== undefined
            ) {
              customFieldValues[key] = productPayload[key];
            }
          });
          customFieldValues.title = toTextValue(data.data.product_name);
          customFieldValues.sku = toTextValue(data.data.sku);
          customFieldValues.barcode = toTextValue(data.data.barcode ?? data.data.upc);
          customFieldValues.scin = toTextValue(data.data.scin) || String(data.data.id ?? "");
          setFieldValues(customFieldValues);
          console.log('Ã°Å¸â€œÂ¦ Loaded custom field values:', customFieldValues);

          if (typeof data.data.family_id === "string" && data.data.family_id) {
            console.log('Ã°Å¸â€â€” Product has family_id:', data.data.family_id);
            fetchFieldGroups(data.data.family_id);
          } else {
            console.log('Ã¢â€žÂ¹Ã¯Â¸Â Product has no family_id - no field groups to load');
            setLoadingFieldGroups(false);
          }

          // Ã°Å¸â€â€ž REDIRECT LOGIC: If this is a variant accessed directly, redirect to proper hierarchy
          if (productData.type === 'variant') {
            const unscopedVariantUrl = generateVariantUrl(
              tenantSlug,
              String(productData.parentId || productData.parentSku || ""),
              productData.id,
              {
                parentLabel: productData.parentName || productData.parentSku || null,
                variantLabel: productData.productName || productData.sku || null,
              }
            );
            const scopeRoot = buildTenantPathForScope({
              tenantSlug,
              scope: selectedBrandSlug || null,
            });
            const tenantPrefix = `/${tenantSlug}`;
            const correctUrl = unscopedVariantUrl.startsWith(tenantPrefix)
              ? `${scopeRoot}${unscopedVariantUrl.slice(tenantPrefix.length)}`
              : unscopedVariantUrl;
            const currentPath = buildTenantPathForScope({
              tenantSlug,
              scope: selectedBrandSlug || null,
              suffix: `/products/${productId}`,
            });

            console.log('Ã°Å¸â€â€ž Variant accessed directly. Redirecting to:', correctUrl);
            console.log('Ã°Å¸â€â€ž Current path:', currentPath);

            // Only redirect if we're not already on the correct URL
            if (currentPath !== correctUrl) {
              router.replace(correctUrl);
              return; // Stop execution to prevent rendering
            }
          } else {
            const canonicalIdentifier = buildCanonicalProductIdentifier(
              productData.id,
              productData.productName || productData.sku || null
            );

            const currentIdentifier = (productId || "").trim();
            const parsedCurrentIdentifier = parseProductIdentifier(currentIdentifier);
            const hasUuidPrefixWithSlug =
              Boolean(parsedCurrentIdentifier.uuid) &&
              currentIdentifier.length > (parsedCurrentIdentifier.uuid?.length || 0);
            // Avoid route churn when URL already carries a UUID + slug.
            const shouldCanonicalize = !hasUuidPrefixWithSlug;
            if (
              shouldCanonicalize &&
              currentIdentifier.toLowerCase() !== canonicalIdentifier.toLowerCase()
            ) {
              const canonicalPath = buildTenantPathForScope({
                tenantSlug,
                scope: selectedBrandSlug || null,
                suffix: `/products/${canonicalIdentifier}`,
              });
              router.replace(canonicalPath);
              return;
            }
          }

          console.log('Ã¢Å“â€¦ Product loaded:', productData.productName);
        } else {
          throw new Error('Invalid response format');
        }
      } catch (err) {
        console.error('Ã¢ÂÅ’ Error fetching product:', err);
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'An error occurred');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    if (productId && tenantSlug && isScopeReady) {
      fetchProduct();
    }

    return () => {
      isCancelled = true;
    };
  }, [
    productId,
    tenantSlug,
    selectedMarketId,
    selectedChannelId,
    selectedLocaleId,
    selectedDestinationId,
    selectedLocale?.code,
    selectedChannel?.code,
    selectedDestination?.code,
    selectedBrandSlug,
    router,
    fetchFieldGroups,
    isScopeReady,
  ]);

  useEffect(() => {
    if (product?.id) {
      fetchCompleteness();
    }
  }, [product?.id, fetchCompleteness]);

  useEffect(() => {
    if (isSharedBrandView) {
      setCanUseTranslateProduct(false);
      return;
    }

    let isCancelled = false;
    const fetchLocalizationEligibility = async () => {
      try {
        setLocalizationEligibilityLoading(true);
        const response = await fetch(`/api/${tenantSlug}/localization/eligibility`);
        if (!response.ok) {
          if (!isCancelled) setCanUseTranslateProduct(false);
          return;
        }

        const payload = asApiEnvelope(await parseJsonSafely(response));
        if (isCancelled) return;

        const payloadData = asRecord(payload.data);
        setCanUseTranslateProduct(Boolean(payloadData?.canTranslateProduct));
      } catch (eligibilityError) {
        console.error('Failed to load localization eligibility:', eligibilityError);
        if (!isCancelled) setCanUseTranslateProduct(false);
      } finally {
        if (!isCancelled) setLocalizationEligibilityLoading(false);
      }
    };

    fetchLocalizationEligibility();
    return () => {
      isCancelled = true;
    };
  }, [isSharedBrandView, tenantSlug]);

  const handleTranslateThisProduct = useCallback(() => {
    if (!product?.id || !canUseTranslateProduct) return;
    setIsTranslatePanelOpen(true);
  }, [canUseTranslateProduct, product?.id]);

  const handleProductStatusChange = async (nextStatus: string) => {
    if (!product?.id || !canEditFields || isSharedBrandView || isUpdatingStatus) return;
    if (!PRODUCT_STATUS_OPTIONS.includes(nextStatus as ProductStatusOption)) return;
    if (nextStatus === product.status) return;

    const previousStatus = product.status;
    setIsUpdatingStatus(true);
    setProduct((prev) => (prev ? { ...prev, status: nextStatus } : prev));

    try {
      await saveFieldValues({ status: nextStatus });
      toast.success(`Status updated to ${nextStatus}.`);
    } catch (error) {
      setProduct((prev) => (prev ? { ...prev, status: previousStatus } : prev));
      console.error("Failed to update product status:", error);
      toast.error("Failed to update product status.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCatalogVisibilityChange = async (nextVisibility: string) => {
    if (!product?.id || !canEditFields || isSharedBrandView) return;
    const prev = String(product.catalog_visibility || "standard");
    if (nextVisibility === prev) return;
    setProduct((p) => (p ? { ...p, catalog_visibility: nextVisibility } : p));
    try {
      await saveFieldValues({ catalog_visibility: nextVisibility });
    } catch (error) {
      setProduct((p) => (p ? { ...p, catalog_visibility: prev } : p));
      console.error("Failed to update catalog visibility:", error);
      toast.error("Failed to update catalog visibility.");
    }
  };

  const handleDeleteProduct = useCallback(async () => {
    if (!product?.id || isSharedBrandView || isDeletingProduct) return;

    const deleteLabel = product.type === "variant" ? "variant" : "product";
    const confirmed = window.confirm(
      `Delete this ${deleteLabel}? This action cannot be undone.`
    );
    if (!confirmed) return;

    setIsDeletingProduct(true);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/products/${product.id}${selectedBrandQuery ? `?${selectedBrandQuery}` : ""}`,
        { method: "DELETE" }
      );
      const payload = asApiEnvelope(await parseJsonSafely(response));
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, `Failed to delete ${deleteLabel}.`));
      }

      toast.success(`${deleteLabel[0].toUpperCase()}${deleteLabel.slice(1)} deleted.`);
      router.push(
        buildTenantPathForScope({
          tenantSlug,
          scope: selectedBrandSlug || null,
          suffix: "/products",
        })
      );
    } catch (error) {
      console.error("Failed to delete product:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete product.");
    } finally {
      setIsDeletingProduct(false);
    }
  }, [
    isDeletingProduct,
    isSharedBrandView,
    product?.id,
    product?.type,
    router,
    selectedBrandQuery,
    selectedBrandSlug,
    tenantSlug,
  ]);

  // Show loading state
  if (loading) {
    return (
      <div className="h-full">
        <PageSkeleton text="Loading product..." size="lg" />
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Package className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            {error?.toLowerCase().includes('not been granted') ? 'Access required' : 'Product not found'}
          </h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Link
            href={buildTenantPathForScope({
              tenantSlug,
              scope: selectedBrandSlug || null,
              suffix: '/products',
            })}
          >
            <button className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
              Back to Products
            </button>
          </Link>
        </div>
      </div>
    );
  }

  // Show message if no product data
  if (!product) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Package className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No product data available</p>
        </div>
      </div>
    );
  }

  const attributeFilterSections = ['attributes-all', 'attributes-required', 'attributes-missing'];
  const parentVariantCount = Math.max(
    Number(product?.variantCount || 0),
    Array.isArray(product?.variants) ? product.variants.length : 0
  );
  const isParentDeleteBlocked = product?.type === "parent" && parentVariantCount > 0;

  const headerStatusPillClass =
    "inline-flex h-8 items-center rounded-full border border-border/60 bg-background px-3 text-xs text-muted-foreground";
  const scopeAlertPillClass =
    "inline-flex h-6 items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 text-xs text-rose-700";
  const sidebarGroupLabelClass =
    'px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';
  const sidebarNavButtonBaseClass =
    'w-full flex min-h-9 items-center justify-between rounded-md px-3 py-2 text-left text-sm font-normal leading-5 transition-colors';
  const contentSectionHeadingClass = 'text-base font-semibold text-foreground';
  const contentSectionHintClass = 'text-xs text-muted-foreground';
  const getSidebarNavButtonStateClass = (isActive: boolean) =>
    isActive
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50';

  return (
    <div className="h-[calc(100%-var(--app-header-height,44px))] min-h-0 overflow-hidden flex flex-col">
      {isSharedBrandView ? (
        <div className="border-b border-border bg-muted/20 px-6 py-3 text-sm text-muted-foreground">
          Shared brand view is read-only. Editing and product creation are disabled.
        </div>
      ) : null}
      {/* Minimal header */}
      <div className="border-b border-border/60 bg-background">
        <div className="flex">
          <div className="w-72 shrink-0 border-r border-border/60 bg-background" aria-hidden="true" />
          <div className="min-w-0 flex-1 px-6 py-3">
            <PageContentContainer mode="form">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-1.5">
              {/* Variant Navigation Header with Cascading Dropdowns */}
              {product.type === 'parent' && product.family_id ? (
                <VariantNavigationHeader
                  tenantSlug={tenantSlug}
                  parentIdentifier={product.id || product.sku}
                  parentName={product.productName}
                  currentVariantIdentifier={undefined}
                  familyId={product.family_id}
                  selectedBrandSlug={selectedBrandSlug || null}
                />
              ) : product.type === 'variant' && (product.parentId || product.parentSku) && product.family_id ? (
                <VariantNavigationHeader
                  tenantSlug={tenantSlug}
                  parentIdentifier={String(product.parentId || product.parentSku || "")}
                  parentName={
                    product.parentName || product.productName.split(' - ')[0]
                  }
                  currentVariantIdentifier={product.id || product.sku}
                  familyId={product.family_id}
                  selectedBrandSlug={selectedBrandSlug || null}
                />
              ) : null}

              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold text-foreground">
                  {product.productName}
                </h1>
                <span className={`inline-flex h-6 items-center rounded-md px-2.5 text-xs font-medium ${
                  product.status === 'Active' ? 'bg-green-100 text-green-700' :
                  product.status === 'Draft' ? 'bg-yellow-100 text-yellow-700' :
                  product.status === 'Enrichment' ? 'bg-blue-100 text-blue-700' :
                  product.status === 'Review' ? 'bg-amber-100 text-amber-700' :
                  product.status === 'Archived' ? 'bg-slate-100 text-slate-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {product.status}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>SCIN: {product.scin || product.id}</span>
                <span>SKU: {product.sku || '-'}</span>
                <span>Barcode: {product.upc || '-'}</span>
              </div>
                  </div>

                  <div className="flex w-full flex-col gap-2 xl:w-auto xl:items-end">
                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      {!isSharedBrandView ? (
                        saving || Object.keys(pendingFieldChanges).length > 0 ? (
                          <span className={headerStatusPillClass}>
                            {saving ? 'Saving changes...' : 'Unsaved changes'}
                          </span>
                        ) : null
                      ) : null}
                      {!isCurrentViewInsideAuthoringScope ? (
                        <span
                          className={scopeAlertPillClass}
                          title="Current view scope is outside product authoring scope."
                        >
                          Out of authoring scope
                        </span>
                      ) : null}
                      {!isScopeReady ? (
                        <span className={scopeAlertPillClass}>Select scope in header</span>
                      ) : null}
                      {!isSharedBrandView ? (
                        <Select
                          value={String(product.status || "Draft")}
                          onValueChange={(nextValue) => {
                            void handleProductStatusChange(nextValue);
                          }}
                          disabled={saving || isUpdatingStatus || !canEditFields}
                        >
                          <SelectTrigger className="h-8 w-[150px] rounded-full border border-border/60 bg-background px-3 text-xs">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            {PRODUCT_STATUS_OPTIONS.map((statusOption) => (
                              <SelectItem key={statusOption} value={statusOption}>
                                {statusOption}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                      {!isSharedBrandView ? (
                        <Select
                          value={String(product.catalog_visibility || "standard")}
                          onValueChange={(nextValue) => {
                            void handleCatalogVisibilityChange(nextValue);
                          }}
                          disabled={saving || !canEditFields}
                        >
                          <SelectTrigger className="h-8 w-[160px] rounded-full border border-border/60 bg-background px-3 text-xs">
                            <SelectValue placeholder="Visibility" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">Standard</SelectItem>
                            <SelectItem value="partner_exclusive">Partner Exclusive</SelectItem>
                            <SelectItem value="restricted">Internal Only</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : null}
                      {!isSharedBrandView ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label="Open product actions"
                              disabled={isDeletingProduct || isUpdatingStatus}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onSelect={() => handleTranslateThisProduct()}
                              disabled={
                                localizationEligibilityLoading ||
                                !canUseTranslateProduct ||
                                !product?.id
                              }
                            >
                              <Languages className="mr-1.5 h-3.5 w-3.5" />
                              Translate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => {
                                void handleDeleteProduct();
                              }}
                              disabled={isDeletingProduct || isParentDeleteBlocked}
                              className="text-destructive focus:text-destructive"
                            >
                              {isParentDeleteBlocked
                                ? `Delete variants first (${parentVariantCount})`
                                : isDeletingProduct
                                ? "Deleting..."
                                : product?.type === "variant"
                                ? "Delete variant"
                                : "Delete product"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </div>
                </div>

                {showScopeToolbarSection ? (
                  <div className="border-t border-border/50 pt-2">
                    <ScopeToolbar showCycleControls />
                  </div>
                ) : null}

              </div>
            </PageContentContainer>
          </div>
        </div>
      </div>

      <div className="flex h-full min-h-0 flex-1">
        {/* Sidebar navigation */}
        <div className="w-72 shrink-0 border-r border-border/60 bg-background overflow-y-auto">
          <div className="px-2 py-3">
            <nav className="space-y-4">
              {product?.type === 'parent' ? (
                <div>
                  <p className={sidebarGroupLabelClass}>Sections</p>
                  <div className="space-y-0.5">
                    <button
                      onClick={() => setActiveSection('product-settings')}
                      className={`${sidebarNavButtonBaseClass} ${getSidebarNavButtonStateClass(activeSection === 'product-settings')}`}
                    >
                      <span className="truncate">Product Settings</span>
                    </button>
                  </div>
                </div>
              ) : null}

              <div>
                <p className={sidebarGroupLabelClass}>
                  Attributes
                </p>

                <div className="space-y-0.5">
                  {dynamicFieldGroupSections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`${sidebarNavButtonBaseClass} ${getSidebarNavButtonStateClass(activeSection === section.id)}`}
                    >
                      <span className="truncate">{section.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 space-y-0.5 border-t border-border pt-3">
                <button
                  onClick={() => setActiveSection('variants')}
                  className={`${sidebarNavButtonBaseClass} ${getSidebarNavButtonStateClass(activeSection === 'variants')}`}
                >
                  <span className="truncate">Variants</span>
                  <span className="text-xs leading-4 text-muted-foreground">{product?.variantCount ?? 0}</span>
                </button>
                <button
                  onClick={() => setActiveSection('media')}
                  className={`${sidebarNavButtonBaseClass} ${getSidebarNavButtonStateClass(activeSection === 'media')}`}
                >
                  <span className="truncate">Assets</span>
                  <span className="text-xs leading-4 text-muted-foreground">{linkedAssets.length}</span>
                </button>
              </div>
            </nav>
          </div>
        </div>

        {/* Main content area */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-6">
            <PageContentContainer
              mode={getContentLayout(activeSection) === 'full-width' ? 'fluid' : 'form'}
            >
              <div className="mb-6 space-y-1">
                <h2 className={contentSectionHeadingClass}>
                  {sections.find(s => s.id === activeSection)?.label || 'Variants'}
                </h2>
                <p className={contentSectionHintClass}>
                  Review and update fields in this section.
                </p>
              </div>

              <div className="w-full">
                {activeSection === 'product-settings' && product?.type === 'parent' && (
                  <div className="mx-auto w-full max-w-4xl space-y-4">
                    <div className="rounded-lg border border-border/60 bg-card p-4">
                      <p className="text-sm font-medium text-foreground">Variant inheritance defaults</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Control how child variants inherit attributes from this parent product.
                      </p>

                      <div className="mt-4 space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">Default mode for new variant fields</p>
                            <p className="text-xs text-muted-foreground">
                              Choose whether new variant fields start inherited or editable.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant={variantInheritanceConfig.inheritByDefault ? 'default' : 'outline'}
                              size="sm"
                              disabled={isSharedBrandView || !canEditFields || saving}
                              onClick={() => void updateVariantInheritanceConfig({ inheritByDefault: true })}
                            >
                              Inherit by default
                            </Button>
                            <Button
                              type="button"
                              variant={!variantInheritanceConfig.inheritByDefault ? 'default' : 'outline'}
                              size="sm"
                              disabled={isSharedBrandView || !canEditFields || saving}
                              onClick={() => void updateVariantInheritanceConfig({ inheritByDefault: false })}
                            >
                              Start editable
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">Allow child override</p>
                            <p className="text-xs text-muted-foreground">
                              If disabled, inherited fields remain locked in Variant Detail unless the variant already has a saved override.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant={variantInheritanceConfig.allowChildOverrides ? 'default' : 'outline'}
                              size="sm"
                              disabled={isSharedBrandView || !canEditFields || saving}
                              onClick={() => void updateVariantInheritanceConfig({ allowChildOverrides: true })}
                            >
                              Allow overrides
                            </Button>
                            <Button
                              type="button"
                              variant={!variantInheritanceConfig.allowChildOverrides ? 'default' : 'outline'}
                              size="sm"
                              disabled={isSharedBrandView || !canEditFields || saving}
                              onClick={() => void updateVariantInheritanceConfig({ allowChildOverrides: false })}
                            >
                              Lock inherited
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/60 bg-card p-4">
                      <p className="text-sm font-medium text-foreground">Current behavior</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Variant editors always show inherited values from the parent. When overrides are allowed, users can switch from
                        inherited to override per field in Variant Detail with a one-click reset back to parent.
                      </p>
                    </div>
                  </div>
                )}

                {attributeFilterSections.includes(activeSection) && (() => {
                  const groupsToShow =
                    activeSection === 'attributes-required'
                      ? requiredFieldGroupStats
                      : activeSection === 'attributes-missing'
                      ? missingFieldGroupStats
                      : fieldGroupStats;

                  const description =
                    activeSection === 'attributes-required'
                      ? 'Attribute groups with required fields for this product family.'
                      : activeSection === 'attributes-missing'
                      ? 'Attribute groups missing one or more required values in the current context.'
                      : 'All attribute groups assigned to this product family.';

                  return (
                    <div className="mx-auto w-full max-w-4xl space-y-4">
                      <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value)}>
                        <TabsList
                          aria-label="Attribute group filters"
                          className="flex-wrap justify-start"
                        >
                          <TabsTrigger value="attributes-all">
                            All groups ({fieldGroupStats.length})
                          </TabsTrigger>
                          <TabsTrigger value="attributes-required">
                            Required ({requiredFieldGroupStats.length})
                          </TabsTrigger>
                          <TabsTrigger value="attributes-missing">
                            Missing ({missingFieldGroupStats.length})
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>

                      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                        <p className="text-sm text-muted-foreground">{description}</p>
                      </div>

                      <ItemList
                        items={groupsToShow}
                        getKey={(stats) => stats.sectionId}
                        renderTitle={(stats) => stats.group.field_group.name}
                        renderSubtitle={(stats) =>
                          stats.group.field_group.description || `${stats.totalFieldCount} fields`
                        }
                        renderRight={(stats) => (
                          <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                              {stats.requiredFieldCount} required
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 ${
                                stats.missingRequiredCount > 0
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {stats.missingRequiredCount > 0
                                ? `${stats.missingRequiredCount} missing`
                                : 'Required complete'}
                            </span>
                          </div>
                        )}
                        onClickItem={(stats) => setActiveSection(stats.sectionId)}
                        emptyMessage="No matching attribute groups in this view."
                        className="border-border/60 bg-card"
                      />
                    </div>
                  );
                })()}

                {activeSection === 'variants' && product && (
                  <div>
                    {isSharedBrandView ? (
                      <div className="rounded-lg border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                        Variant editing is disabled in shared brand view.
                      </div>
                    ) : (
                      <VariantManagement
                        productId={product.id}
                        productSku={product.sku || product.id}
                        tenantSlug={tenantSlug}
                        productType={product.type}
                        productName={product.productName}
                        productFamilyId={product.family_id ?? undefined}
                        onProductTypeChange={handleProductTypeChange}
                      />
                    )}
                  </div>
                )}


                {activeSection.startsWith('fieldgroup-') && (() => {
                  const section = sections.find(s => s.id === activeSection);
                  if (!section || !section.isFieldGroup) return null;

                  const fieldGroup = section.fieldGroup;
                  const groupCode = String(fieldGroup?.field_group?.code || "").trim().toLowerCase();
                  const isDocumentationGroup = groupCode === DOCUMENTATION_GROUP_CODE;
                  const documentationSlotFieldIds = new Set(
                    documentationSlotFields.map((slot) => slot.fieldId)
                  );
                  const isWideFieldGroup = isTableHeavyFieldGroup(fieldGroup);

                  return (
                    <div
                      className={
                        isWideFieldGroup
                          ? 'space-y-5'
                          : 'mx-auto w-full max-w-4xl space-y-5'
                      }
                    >
                      {fieldGroup.fields && fieldGroup.fields.length > 0 ? (
                        <div className="space-y-4">
                          {isDocumentationGroup && documentationSlotFields.length > 0 && (
                            <div className="rounded-lg border border-border/60 bg-card p-4">
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <h4 className="text-sm font-semibold text-foreground">Document Slots</h4>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant={showMissingOnlyDocumentSlots ? "default" : "outline"}
                                    className="h-7 px-2 text-xs"
                                    onClick={() => setShowMissingOnlyDocumentSlots((current) => !current)}
                                  >
                                    Missing only
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => setShowAllDocumentSlots((current) => !current)}
                                  >
                                    {showAllDocumentSlots ? "Show key" : "Show all"}
                                  </Button>
                                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                    {
                                      documentationSlotFields.filter(
                                        (slot) => Boolean(documentSlotLinksByFieldId[slot.fieldId])
                                      ).length
                                    }/{documentationSlotFields.length} assigned
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                                {visibleDocumentSlotFields.map((slot) => {
                                  const slotLink = documentSlotLinksByFieldId[slot.fieldId];
                                  const slotAsset = slotLink?.dam_assets || null;
                                  const slotAssetId = slotLink?.asset_id || slotAsset?.id || null;
                                  const previewUrl = slotAssetId
                                    ? buildAssetPreviewPath(
                                        slotAssetId,
                                        String(
                                          slotAsset?.current_version_changed_at ||
                                            slotAsset?.updated_at ||
                                            ""
                                        )
                                      )
                                    : null;
                                  const isImageAsset = isImageLikeAsset(slotAsset);
                                  const isAssigned = Boolean(slotAssetId);
                                  const sourceField = fieldGroup.fields.find(
                                    (field: ProductFieldLike) => String(field.id) === slot.fieldId
                                  );
                                  const slotContext: SlotAssignmentContext = {
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
                                      className="rounded-lg border border-border/50 bg-background p-3 transition-colors"
                                      onDragEnter={(event) => {
                                        if (isSharedBrandView || !hasDraggedFiles(event)) return;
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setDragOverSlotCode(slot.slotCode);
                                      }}
                                      onDragOver={(event) => {
                                        if (isSharedBrandView || !hasDraggedFiles(event)) return;
                                        event.preventDefault();
                                        event.stopPropagation();
                                        event.dataTransfer.dropEffect = "copy";
                                        setDragOverSlotCode(slot.slotCode);
                                      }}
                                      onDragLeave={(event) => {
                                        if (isSharedBrandView) return;
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setDragOverSlotCode((current) =>
                                          current === slot.slotCode ? null : current
                                        );
                                      }}
                                      onDrop={(event) => handleSlotDrop(slotContext, event)}
                                    >
                                      <div className="mb-2 flex items-center justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                          <p className="truncate text-sm font-medium text-foreground">{slot.label}</p>
                                          <span
                                            className="inline-flex text-muted-foreground hover:text-foreground"
                                            title={slot.hint}
                                            aria-label={`${slot.label} hint`}
                                          >
                                            <Info className="h-3.5 w-3.5" />
                                          </span>
                                          {sourceField?.is_required ? (
                                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                              Required
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>
                                      <div
                                        className={`mb-2 flex h-28 items-center justify-center overflow-hidden rounded-md border ${
                                          dragOverSlotCode === slot.slotCode
                                            ? "border-[#2F6BFF] bg-[#2F6BFF]/10"
                                            : "border-border/60 bg-muted/20"
                                        }`}
                                      >
                                        {uploadingSlotCode === slot.slotCode ? (
                                          <div className="px-2 text-center text-xs text-muted-foreground">
                                            Uploading...
                                          </div>
                                        ) : dragOverSlotCode === slot.slotCode ? (
                                          <div className="px-2 text-center text-xs font-medium text-[#2F6BFF]">
                                            {isAssigned ? "Drop file for new version" : "Drop file to upload"}
                                          </div>
                                        ) : slotAsset && previewUrl && isImageAsset ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={previewUrl}
                                            alt={slotAsset?.filename || slot.label}
                                            className="h-full w-full object-contain bg-white"
                                            loading="lazy"
                                          />
                                        ) : slotAsset ? (
                                          <div className="px-2 text-center text-xs text-muted-foreground">
                                            {slotAsset?.filename || "Linked document"}
                                          </div>
                                        ) : (
                                          <div className="px-2 text-center text-xs text-muted-foreground">
                                            Drop, browse, or link.
                                          </div>
                                        )}
                                      </div>
                                      {isAssigned ? (
                                        <div className="mb-1 truncate text-[11px] text-muted-foreground">
                                          {slotAsset?.filename}
                                        </div>
                                      ) : null}
                                      {!isSharedBrandView ? (
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            ref={(node) => {
                                              slotFileInputRefs.current[slot.slotCode] = node;
                                            }}
                                            type="file"
                                            accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,image/*"
                                            className="hidden"
                                            onChange={(event) => handleSlotFileInputChange(slotContext, event)}
                                          />
                                          <Button
                                            size="sm"
                                            variant={isAssigned ? "outline" : "accent-blue"}
                                            className="h-7 px-2 text-xs"
                                            onClick={() => slotFileInputRefs.current[slot.slotCode]?.click()}
                                            disabled={isMutatingLinks || uploadingSlotCode === slot.slotCode}
                                          >
                                            {isAssigned
                                              ? uploadingSlotCode === slot.slotCode
                                                ? "Uploading"
                                                : "New version"
                                              : uploadingSlotCode === slot.slotCode
                                                ? "Uploading"
                                                : "Add"}
                                          </Button>
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 w-7 px-0"
                                                disabled={isMutatingLinks || uploadingSlotCode === slot.slotCode}
                                                aria-label={`${slot.label} actions`}
                                              >
                                                <MoreHorizontal className="h-3.5 w-3.5" />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-44">
                                              <DropdownMenuItem onSelect={() => openAssignSlotDialog(slotContext, slotLink)}>
                                                Link from Assets
                                              </DropdownMenuItem>
                                              {isAssigned ? (
                                                <DropdownMenuItem
                                                  onSelect={() => openSlotVersionDialog(slotContext)}
                                                >
                                                  New version with details
                                                </DropdownMenuItem>
                                              ) : null}
                                              {isAssigned ? (
                                                <DropdownMenuItem
                                                  onSelect={() => openVersionHistoryDialog(slot.label, slotAssetId)}
                                                >
                                                  Version history
                                                </DropdownMenuItem>
                                              ) : null}
                                              {isAssigned && slotLink ? (
                                                <DropdownMenuItem
                                                  onSelect={() => handleUnlinkAsset(slotLink.id)}
                                                  className="text-destructive"
                                                >
                                                  Clear
                                                </DropdownMenuItem>
                                              ) : null}
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {(isDocumentationGroup
                            ? fieldGroup.fields.filter(
                                (field: ProductFieldLike) => !documentationSlotFieldIds.has(String(field.id))
                              )
                            : fieldGroup.fields
                          ).length > 0 ? (
                            <div className="rounded-lg border border-border/60 bg-background">
                              {(isDocumentationGroup
                                ? fieldGroup.fields.filter(
                                    (field: ProductFieldLike) => !documentationSlotFieldIds.has(String(field.id))
                                  )
                                : fieldGroup.fields
                              ).map((field: ProductFieldLike, index: number) => {
                              const isScinField = isScinSystemField(field);
                              const resolvedFieldValue = isScinField
                                ? (product?.scin || product?.id || '')
                                : fieldValues[field.code];
                              const isWideField = isLayoutWideField(field);
                              return (
                                <div
                                  key={field.id}
                                  className="relative p-4"
                                >
                                  {index > 0 ? (
                                    <div className="absolute left-4 right-4 top-0 h-px bg-border/50" />
                                  ) : null}
                                  <div className="grid gap-4 md:grid-cols-[minmax(220px,280px),1fr] md:items-start">
                                    <div className="space-y-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium text-foreground">
                                          {field.name}
                                        </span>
                                        {field.is_required && (
                                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                            Required
                                          </span>
                                        )}
                                        {isScinField && (
                                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                            System
                                          </span>
                                        )}
                                        {isFieldValueFilled(resolvedFieldValue) && (
                                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                            Complete
                                          </span>
                                        )}
                                      </div>
                                      {field.description && (
                                        <p className="text-xs text-muted-foreground">
                                          {field.description}
                                        </p>
                                      )}
                                    </div>

                                    <div className="lg:pt-0.5">
                                      {isScinField ? (
                                        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground">
                                          {product?.scin || product?.id || 'â€”'}
                                        </div>
                                      ) : field.field_type === 'table' ? (
                                        <div
                                          className={
                                            field.options?.table_definition?.meta?.uses_panel_instances
                                              ? 'bg-transparent'
                                              : 'rounded-lg border border-border/60 bg-muted/30 p-4'
                                          }
                                        >
                                          <InlineDynamicFieldEditor
                                            field={field}
                                            value={resolvedFieldValue}
                                            tenantSlug={tenantSlug}
                                            canEdit={canEditFields}
                                            productName={product?.productName ?? product?.product_name ?? undefined}
                                            ingredients={typeof fieldValues['ingredients'] === 'string' ? fieldValues['ingredients'] : undefined}
                                            otherIngredients={typeof fieldValues['other_ingredients'] === 'string' ? fieldValues['other_ingredients'] : undefined}
                                            readonlyReasonOverride={!isScopeReady ? "Select scope in header" : null}
                                            onCommit={async (nextValue: unknown) => {
                                              handleFieldChange(field.code, nextValue);
                                              await saveFieldValues({
                                                [field.code]: nextValue,
                                              });
                                            }}
                                            rendererClassName={
                                              field.options?.table_definition?.meta?.uses_panel_instances
                                                ? 'bg-transparent'
                                                : 'bg-background rounded-lg border border-border/60 p-4'
                                            }
                                          />
                                        </div>
                                      ) : isWideField ? (
                                        <div className="border-2 border-dashed border-border/70 rounded-lg p-8 text-center text-sm text-muted-foreground">
                                          {field.field_type === 'gallery' && 'Image gallery will be rendered here'}
                                          {field.field_type === 'asset_collection' && 'Asset collection will be rendered here'}
                                          {field.field_type === 'data_grid' && 'Data grid will be rendered here'}
                                        </div>
                                      ) : (
                                        <InlineDynamicFieldEditor
                                          field={field}
                                          value={resolvedFieldValue}
                                          tenantSlug={tenantSlug}
                                          canEdit={canEditFields}
                                          readonlyReasonOverride={!isScopeReady ? "Select scope in header" : null}
                                          onCommit={async (nextValue: unknown) => {
                                            handleFieldChange(field.code, nextValue);
                                            await saveFieldValues({
                                              [field.code]: nextValue,
                                            });
                                          }}
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">No attributes configured for this group.</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {activeSection === 'media' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-foreground">Product Assets</h3>
                      {!isSharedBrandView ? (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="accent-blue"
                            onClick={async () => {
                              setAvailableAssetQuery("");
                              setSelectedAssetIdsToLink(new Set());
                              setIsLinkAssetDialogOpen(true);
                              await fetchAvailableAssets();
                            }}
                          >
                            Link assets
                          </Button>
                          <Button variant="outline" asChild>
                            <Link
                              href={buildTenantPathForScope({
                                tenantSlug,
                                scope: selectedBrandSlug || null,
                                suffix: `/assets?product=${encodeURIComponent(product?.id || "")}`,
                              })}
                            >
                              Open in Assets
                              <ExternalLink className="ml-2 h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          Asset linking is disabled in shared brand view.
                        </div>
                      )}
                    </div>
                    {!isSharedBrandView ? (
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <p className="text-xs font-medium text-muted-foreground">Upload folder</p>
                        <div className="min-w-[240px]">
                          <Select
                            value={selectedUploadFolderId}
                            onValueChange={setSelectedUploadFolderId}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Auto-organize by product" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Auto-organize by product</SelectItem>
                              <SelectItem value="none">Unfiled (no folder)</SelectItem>
                              {assetFolders.map((folder) => (
                                <SelectItem key={folder.id} value={folder.id}>
                                  {folder.path || folder.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          variant="outline"
                          className="h-8 px-3 text-xs"
                          onClick={async () => {
                            setFolderMutationError(null);
                            if (assetFolders.length === 0) {
                              await fetchAssetFolders();
                            }
                            setIsCreateFolderDialogOpen(true);
                          }}
                        >
                          New folder
                        </Button>
                      </div>
                    ) : null}

                    {loadingLinkedAssets && (
                      <div className="text-sm text-muted-foreground py-6">Loading linked assets...</div>
                    )}

                    {linkedAssetsError && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        {linkedAssetsError}
                      </div>
                    )}
                    {slotUploadError && (
                      <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {slotUploadError}
                      </div>
                    )}

                    {!loadingLinkedAssets && !linkedAssetsError && (
                      <div className="mb-6 rounded-lg border border-border/60 bg-card p-4">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-semibold text-foreground">Core Product Images</h4>
                            <p className="text-xs text-muted-foreground">
                              {PRODUCT_IMAGE_SLOTS.length} guided slots. Slot uploads follow your folder setting.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant={showMissingOnlyImageSlots ? "default" : "outline"}
                              className="h-7 px-2 text-xs"
                              onClick={() => setShowMissingOnlyImageSlots((current) => !current)}
                            >
                              Missing only
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => setShowAllImageSlots((current) => !current)}
                            >
                              {showAllImageSlots ? "Show key" : "Show all"}
                            </Button>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {PRODUCT_IMAGE_SLOTS.filter((slot) => Boolean(imageSlotLinks[slot.code])).length}/{PRODUCT_IMAGE_SLOTS.length} assigned
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                          {visibleImageSlots.map((slot) => {
                            const slotLink = imageSlotLinks[slot.code];
                            const slotAsset = slotLink?.dam_assets || null;
                            const slotAssetId = slotLink?.asset_id || slotAsset?.id || null;
                            const previewUrl = slotAssetId
                              ? buildAssetPreviewPath(
                                  slotAssetId,
                                  String(
                                    slotAsset?.current_version_changed_at ||
                                      slotAsset?.updated_at ||
                                      ""
                                  )
                                )
                              : null;
                            const isImageAsset = isImageLikeAsset(slotAsset);
                            const isAssigned = Boolean(slotAssetId);
                            const slotContext: SlotAssignmentContext = {
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
                                className="rounded-lg border border-border/50 bg-background p-3 transition-colors"
                                onDragEnter={(event) => {
                                  if (isSharedBrandView || !hasDraggedFiles(event)) return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setDragOverSlotCode(slot.code);
                                }}
                                onDragOver={(event) => {
                                  if (isSharedBrandView || !hasDraggedFiles(event)) return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  event.dataTransfer.dropEffect = "copy";
                                  setDragOverSlotCode(slot.code);
                                }}
                                onDragLeave={(event) => {
                                  if (isSharedBrandView) return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setDragOverSlotCode((current) =>
                                    current === slot.code ? null : current
                                  );
                                }}
                                onDrop={(event) => handleSlotDrop(slotContext, event)}
                              >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <p className="truncate text-sm font-medium text-foreground">{slot.label}</p>
                                    <span
                                      className="inline-flex text-muted-foreground hover:text-foreground"
                                      title={slot.hint}
                                      aria-label={`${slot.label} hint`}
                                    >
                                      <Info className="h-3.5 w-3.5" />
                                    </span>
                                  </div>
                                </div>
                                <div
                                  className={`mb-2 flex h-32 items-center justify-center overflow-hidden rounded-md border ${
                                    dragOverSlotCode === slot.code
                                      ? "border-[#2F6BFF] bg-[#2F6BFF]/10"
                                      : "border-border/60 bg-muted/20"
                                  }`}
                                  onDragEnter={(event) => {
                                    if (isSharedBrandView || !hasDraggedFiles(event)) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setDragOverSlotCode(slot.code);
                                  }}
                                  onDragOver={(event) => {
                                    if (isSharedBrandView || !hasDraggedFiles(event)) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    event.dataTransfer.dropEffect = "copy";
                                    setDragOverSlotCode(slot.code);
                                  }}
                                  onDragLeave={(event) => {
                                    if (isSharedBrandView) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setDragOverSlotCode((current) =>
                                      current === slot.code ? null : current
                                    );
                                  }}
                                  onDrop={(event) => handleSlotDrop(slotContext, event)}
                                >
                                  {uploadingSlotCode === slot.code ? (
                                    <div className="px-2 text-center text-xs text-muted-foreground">
                                      Uploading...
                                    </div>
                                  ) : dragOverSlotCode === slot.code ? (
                                    <div className="px-2 text-center text-xs font-medium text-[#2F6BFF]">
                                      {isAssigned ? "Drop image for new version" : "Drop image to upload"}
                                    </div>
                                  ) : slotAsset && previewUrl && isImageAsset ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={previewUrl}
                                      alt={slotAsset?.filename || slot.label}
                                      className="h-full w-full object-contain bg-white"
                                      loading="lazy"
                                    />
                                  ) : slotAsset ? (
                                    <div className="px-2 text-center text-xs text-muted-foreground">
                                      {slotAsset?.filename || "Linked file"}
                                    </div>
                                  ) : (
                                    <div className="px-2 text-center text-xs text-muted-foreground">
                                      Drop, browse, or link.
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  {isAssigned ? (
                                    <div className="truncate text-[11px] text-muted-foreground">
                                      {slotAsset?.filename}
                                    </div>
                                  ) : null}
                                  {!isSharedBrandView ? (
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        ref={(node) => {
                                          slotFileInputRefs.current[slot.code] = node;
                                        }}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(event) => handleSlotFileInputChange(slotContext, event)}
                                      />
                                      <Button
                                        size="sm"
                                        variant={isAssigned ? "outline" : "accent-blue"}
                                        className="h-7 px-2 text-xs"
                                        onClick={() => slotFileInputRefs.current[slot.code]?.click()}
                                        disabled={isMutatingLinks || uploadingSlotCode === slot.code}
                                      >
                                        {isAssigned
                                          ? uploadingSlotCode === slot.code
                                            ? "Uploading"
                                            : "New version"
                                          : uploadingSlotCode === slot.code
                                            ? "Uploading"
                                            : "Add"}
                                      </Button>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 w-7 px-0"
                                            disabled={isMutatingLinks || uploadingSlotCode === slot.code}
                                            aria-label={`${slot.label} actions`}
                                          >
                                            <MoreHorizontal className="h-3.5 w-3.5" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-44">
                                          <DropdownMenuItem onSelect={() => openAssignSlotDialog(slotContext, slotLink)}>
                                            Link from Assets
                                          </DropdownMenuItem>
                                          {isAssigned ? (
                                            <DropdownMenuItem
                                              onSelect={() => openSlotVersionDialog(slotContext)}
                                            >
                                              New version with details
                                            </DropdownMenuItem>
                                          ) : null}
                                          {isAssigned ? (
                                            <DropdownMenuItem
                                              onSelect={() => openVersionHistoryDialog(slot.label, slotAssetId)}
                                            >
                                              Version history
                                            </DropdownMenuItem>
                                          ) : null}
                                          {isAssigned && slotLink ? (
                                            <DropdownMenuItem
                                              onSelect={() => handleUnlinkAsset(slotLink.id)}
                                              className="text-destructive"
                                            >
                                              Clear
                                            </DropdownMenuItem>
                                          ) : null}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {!loadingLinkedAssets && !linkedAssetsError && linkedAssets.length === 0 && (
                      <div className="text-center py-12">
                        <div className="text-muted-foreground mb-4">
                          <div className="w-12 h-12 mx-auto bg-muted rounded-md flex items-center justify-center">
                            <ImageIcon className="w-6 h-6" />
                          </div>
                        </div>
                        <h3 className="text-lg font-medium text-foreground mb-2">No linked assets yet</h3>
                        <p className="text-muted-foreground">Upload assets and link them to this product.</p>
                      </div>
                    )}

                    {!loadingLinkedAssets && !linkedAssetsError && linkedAssets.length > 0 && nonSlotLinkedAssets.length === 0 && (
                      <div className="mb-4 rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                        All linked assets are currently assigned to image or document slots.
                      </div>
                    )}

                    {!loadingLinkedAssets && !linkedAssetsError && nonSlotLinkedAssets.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-foreground">Additional Linked Assets</h4>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {nonSlotLinkedAssets.map((link) => (
                            <div key={link.id} className="rounded-lg border border-border bg-card p-4">
                              <div className="text-sm font-medium text-foreground truncate">
                                {link.dam_assets?.filename || "Asset"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {link.dam_assets?.file_type || "unknown"} | {link.link_context || "linked"}
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {link.link_type || "manual"}
                                </span>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {(Number(link.confidence || 0) * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div className="mt-3 flex items-center gap-2">
                                {!isSharedBrandView ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={isMutatingLinks}
                                      onClick={() => handleRelinkAsset(link)}
                                    >
                                      Relink
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive"
                                      disabled={isMutatingLinks}
                                      onClick={() => handleUnlinkAsset(link.id)}
                                    >
                                      Unlink
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Dialog
                      open={isAssignSlotDialogOpen}
                      onOpenChange={(open) => {
                        setIsAssignSlotDialogOpen(open);
                        if (!open) {
                          setSlotAssignmentContext(null);
                          setSelectedSlotAssetId(null);
                        }
                      }}
                    >
                      <DialogContent className="max-w-3xl">
                        <DialogHeader>
                          <DialogTitle>
                            Link Asset to Slot
                            {slotAssignmentContext ? `: ${slotAssignmentContext.slotLabel}` : ""}
                          </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <Input
                            value={availableAssetQuery}
                            onChange={(event) => setAvailableAssetQuery(event.target.value)}
                            placeholder="Search assets by filename"
                          />
                          <div className="max-h-[420px] overflow-y-auto rounded-lg border border-border">
                            {loadingAvailableAssets ? (
                              <div className="px-4 py-6 text-sm text-muted-foreground">Loading assets...</div>
                            ) : slotAssignableAssets.length === 0 ? (
                              <div className="px-4 py-6 text-sm text-muted-foreground">No assets found.</div>
                            ) : (
                              slotAssignableAssets.map((asset) => {
                                const previewUrl = buildAssetPreviewPath(
                                  asset.id,
                                  String(
                                    asset?.currentVersionChangedAt ||
                                      asset?.current_version_changed_at ||
                                      asset?.updatedAt ||
                                      asset?.updated_at ||
                                      ""
                                  )
                                );
                                const isImageAsset = isImageLikeAsset(asset);
                                const checked = selectedSlotAssetId === asset.id;
                                return (
                                  <label
                                    key={asset.id}
                                    className="flex items-center gap-3 border-b border-border/50 px-4 py-3 text-sm last:border-b-0"
                                  >
                                    <input
                                      type="radio"
                                      name="slot-asset-selection"
                                      checked={checked}
                                      onChange={() => setSelectedSlotAssetId(asset.id)}
                                      className="h-4 w-4 border-border"
                                    />
                                    <div className="h-10 w-14 overflow-hidden rounded border border-border/60 bg-muted/30">
                                      {previewUrl && isImageAsset ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={previewUrl}
                                          alt={asset.originalFilename || asset.filename || "Asset"}
                                          className="h-full w-full object-cover"
                                          loading="lazy"
                                        />
                                      ) : null}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="truncate font-medium text-foreground">
                                        {asset.originalFilename || asset.filename || "Asset"}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {asset.fileType || asset.file_type || "unknown"}
                                      </div>
                                    </div>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsAssignSlotDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button
                            disabled={!selectedSlotAssetId || isMutatingLinks || !slotAssignmentContext}
                            onClick={handleAssignSlotAsset}
                          >
                            {isMutatingLinks ? "Linking..." : "Link slot"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog
                      open={isVersionHistoryDialogOpen}
                      onOpenChange={(open) => {
                        setIsVersionHistoryDialogOpen(open);
                        if (!open) {
                          setVersionHistoryAssetId(null);
                          setVersionHistoryRecords([]);
                          setVersionHistoryError(null);
                          setVersionHistoryLoading(false);
                          setRestoringSlotVersionId(null);
                        }
                      }}
                    >
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>
                            Version History
                            {versionHistorySlotLabel ? `: ${versionHistorySlotLabel}` : ""}
                          </DialogTitle>
                        </DialogHeader>
                        <div className="max-h-[420px] overflow-y-auto rounded-lg border border-border">
                          {versionHistoryLoading ? (
                            <div className="px-4 py-6 text-sm text-muted-foreground">
                              Loading version history...
                            </div>
                          ) : versionHistoryError ? (
                            <div className="px-4 py-6 text-sm text-destructive">
                              {versionHistoryError}
                            </div>
                          ) : versionHistoryRecords.length === 0 ? (
                            <div className="px-4 py-6 text-sm text-muted-foreground">
                              No versions available yet.
                            </div>
                          ) : (
                            versionHistoryRecords.map((record) => {
                              const previewUrl =
                                typeof record.previewUrl === "string" && record.previewUrl.trim().length > 0
                                  ? record.previewUrl
                                  : null;
                              const hasImagePreview =
                                String(record.mimeType || "").toLowerCase().startsWith("image/") &&
                                Boolean(previewUrl);

                              return (
                                <div
                                  key={record.id}
                                  className="border-b border-border/50 px-4 py-3 text-sm last:border-b-0"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-foreground">
                                        v{record.versionNumber}
                                      </span>
                                      {record.isCurrent ? (
                                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                          Latest
                                        </span>
                                      ) : null}
                                    </div>
                                    {record.changedAt ? (
                                      <span className="text-xs text-muted-foreground">
                                        {formatAuditDateTime(record.changedAt)}
                                      </span>
                                    ) : null}
                                  </div>
                                    <div className="mt-2 flex items-start gap-3">
                                      {hasImagePreview ? (
                                        <div className="h-16 w-16 overflow-hidden rounded-md border border-border/60 bg-muted/20">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={previewUrl || ""}
                                            alt={`${record.filename} preview`}
                                            className="h-full w-full object-contain bg-white"
                                            loading="lazy"
                                          />
                                        </div>
                                      ) : null}
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <div className="truncate text-xs text-muted-foreground">
                                        {record.filename}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {record.mimeType || "unknown"} | {((record.fileSize || 0) / 1024 / 1024).toFixed(2)} MB
                                      </div>
                                      {record.changeComment ? (
                                        <div className="text-xs text-foreground">
                                          {record.changeComment}
                                        </div>
                                      ) : null}
                                      {record.effectiveFrom || record.effectiveTo ? (
                                        <div className="text-xs text-muted-foreground">
                                          Effective: {record.effectiveFrom ? formatAuditDateTime(record.effectiveFrom) : "Now"}
                                          {" - "}
                                          {record.effectiveTo ? formatAuditDateTime(record.effectiveTo) : "Open"}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                  {!record.isCurrent ? (
                                    <div className="mt-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs"
                                        disabled={Boolean(restoringSlotVersionId)}
                                        onClick={() => void handleRestoreSlotVersion(record)}
                                      >
                                        {restoringSlotVersionId === record.id
                                          ? "Restoring..."
                                          : "Restore as latest"}
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })
                          )}
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsVersionHistoryDialogOpen(false)}>
                            Close
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog
                      open={isSlotVersionDialogOpen}
                      onOpenChange={(open) => {
                        setIsSlotVersionDialogOpen(open);
                        if (!open) {
                          setSlotVersionContext(null);
                          setSlotVersionFile(null);
                          setSlotVersionComment("");
                          setSlotVersionEffectiveFrom("");
                          setSlotVersionEffectiveTo("");
                          setSlotVersionDialogError(null);
                        }
                      }}
                    >
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>
                            New Version
                            {slotVersionContext ? `: ${slotVersionContext.slotLabel}` : ""}
                          </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">File</p>
                            <input
                              type="file"
                              accept={
                                slotVersionContext?.acceptMode === "image"
                                  ? "image/*"
                                  : ".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,image/*"
                              }
                              onChange={(event) =>
                                setSlotVersionFile(event.target.files?.[0] || null)
                              }
                              className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
                            />
                            {slotVersionFile ? (
                              <p className="text-xs text-muted-foreground">{slotVersionFile.name}</p>
                            ) : null}
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">Comment (optional)</p>
                            <Input
                              value={slotVersionComment}
                              onChange={(event) => setSlotVersionComment(event.target.value)}
                              placeholder="Reason for this new version"
                            />
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-foreground">Effective from</p>
                              <Input
                                type="date"
                                value={slotVersionEffectiveFrom}
                                onChange={(event) => setSlotVersionEffectiveFrom(event.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-foreground">Effective to</p>
                              <Input
                                type="date"
                                value={slotVersionEffectiveTo}
                                onChange={(event) => setSlotVersionEffectiveTo(event.target.value)}
                              />
                            </div>
                          </div>
                          {slotVersionDialogError ? (
                            <p className="text-sm text-destructive">{slotVersionDialogError}</p>
                          ) : null}
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsSlotVersionDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button
                            variant="accent-blue"
                            onClick={() => void handleSubmitSlotVersionDialog()}
                            disabled={
                              isMutatingLinks ||
                              !slotVersionFile ||
                              (slotVersionContext
                                ? uploadingSlotCode === slotVersionContext.slotCode
                                : false)
                            }
                          >
                            {slotVersionContext &&
                            uploadingSlotCode === slotVersionContext.slotCode
                              ? "Uploading..."
                              : "Upload version"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={isLinkAssetDialogOpen} onOpenChange={setIsLinkAssetDialogOpen}>
                      <DialogContent className="max-w-3xl">
                        <DialogHeader>
                          <DialogTitle>Link Assets to Product</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <Input
                            value={availableAssetQuery}
                            onChange={(event) => setAvailableAssetQuery(event.target.value)}
                            placeholder="Search assets by filename"
                          />
                          <div className="max-h-[420px] overflow-y-auto rounded-lg border border-border">
                            {loadingAvailableAssets ? (
                              <div className="px-4 py-6 text-sm text-muted-foreground">Loading assets...</div>
                            ) : filteredAvailableAssets.length === 0 ? (
                              <div className="px-4 py-6 text-sm text-muted-foreground">No available assets found.</div>
                            ) : (
                              filteredAvailableAssets.map((asset) => (
                                <label key={asset.id} className="flex items-center gap-3 border-b border-border/50 px-4 py-3 text-sm last:border-b-0">
                                  <input
                                    type="checkbox"
                                    checked={selectedAssetIdsToLink.has(asset.id)}
                                    onChange={() => handleToggleAssetToLink(asset.id)}
                                    className="h-4 w-4 rounded border-border"
                                  />
                                  <div className="min-w-0">
                                    <div className="truncate font-medium text-foreground">
                                      {asset.originalFilename || asset.filename || "Asset"}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {asset.fileType || "unknown"}
                                    </div>
                                  </div>
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsLinkAssetDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button
                            disabled={selectedAssetIdsToLink.size === 0 || isMutatingLinks}
                            onClick={handleLinkSelectedAssets}
                          >
                            {isMutatingLinks ? "Linking..." : `Link ${selectedAssetIdsToLink.size} asset${selectedAssetIdsToLink.size === 1 ? "" : "s"}`}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog
                      open={isCreateFolderDialogOpen}
                      onOpenChange={(open) => {
                        setIsCreateFolderDialogOpen(open);
                        if (!open) {
                          setNewFolderName("");
                          setFolderMutationError(null);
                        }
                      }}
                    >
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Create Asset Folder</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <Input
                            value={newFolderName}
                            onChange={(event) => setNewFolderName(event.target.value)}
                            placeholder="Folder name"
                          />
                          {folderMutationError ? (
                            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                              {folderMutationError}
                            </div>
                          ) : null}
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setIsCreateFolderDialogOpen(false)}
                            disabled={isCreatingFolder}
                          >
                            Cancel
                          </Button>
                          <Button onClick={handleCreateAssetFolder} disabled={isCreatingFolder}>
                            {isCreatingFolder ? "Creating..." : "Create folder"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}

                {!['attributes-all', 'attributes-required', 'attributes-missing', 'variants', 'media', 'product-settings'].includes(activeSection) && !activeSection.startsWith('fieldgroup-') && (
                  <div className="text-center py-12">
                    <div className="text-muted-foreground mb-4">
                      <div className="w-12 h-12 mx-auto bg-muted rounded-md flex items-center justify-center">
                        <FileText className="w-6 h-6" />
                      </div>
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">
                      {sections.find(s => s.id === activeSection)?.label}
                    </h3>
                    <p className="text-muted-foreground">Content for this section will be implemented soon.</p>
                  </div>
                )}
              </div>
            </PageContentContainer>
          </div>
        </div>
      </div>

      {canUseTranslateProduct && product?.id && (
        <TranslationPanel
          tenantSlug={tenantSlug}
          productId={product.id}
          productIds={[product.id]}
          productName={product.productName || product.product_name || product.sku || undefined}
          productFamilyId={product.family_id ?? undefined}
          open={isTranslatePanelOpen}
          onOpenChange={setIsTranslatePanelOpen}
          initialSourceLocaleId={selectedLocaleId ?? undefined}
        />
      )}
    </div>
  );
}

