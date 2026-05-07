"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useDeferredValue,
} from "react";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import {
  type ColDef,
  type GridReadyEvent,
  type ICellRendererParams,
  type RowClickedEvent,
  type GetRowIdParams,
  type IHeaderParams,
  type SortChangedEvent,
  type ColumnMovedEvent,
  type ColumnResizedEvent,
  type ColumnVisibleEvent,
  type ColumnState,
  type CellValueChangedEvent,
  type CellClassParams,
  type CellStyle,
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
} from "ag-grid-community";

// Register all Community features once at module load time
ModuleRegistry.registerModules([AllCommunityModule]);
import {
  MoreHorizontal,
  Plus,
  ChevronDown,
  ChevronRight,
  Package,
  GitBranch,
  Layers,
  Edit,
  Trash2,
  Upload,
  Download,
  FileSpreadsheet,
  SlidersHorizontal,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { DeleteConfirmDialog } from "@/components/ui/modal-shells";
import { cn } from "@/lib/utils";
import { BulkActionToolbar } from "@/components/dam/bulk-action-toolbar";
import { TranslationPanel } from "@/components/products/TranslationPanel";
import { ProductDataImportDialog } from "@/components/products/ProductDataImportDialog";
import { fetchJsonWithDedupe } from "@/lib/client-request-cache";
import { buildCsv } from "@/lib/product-imports";
import { type PIMProduct } from "./mock-pim-data";
import { useMarketContext } from "@/components/market-context";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProductStatus = "Draft" | "Enrichment" | "Review" | "Active" | "Discontinued" | "Archived";

const PRODUCT_STATUSES: ProductStatus[] = [
  "Draft", "Enrichment", "Review", "Active", "Discontinued", "Archived",
];

type ProductApiRow = {
  id?: string;
  organization_id?: string;
  organization_slug?: string;
  organization_name?: string;
  type?: PIMProduct["type"];
  parent_id?: string | null;
  has_variants?: boolean;
  variant_count?: number;
  product_name?: string;
  scin?: string;
  sku?: string | null;
  barcode?: string | null;
  upc?: string | null;
  brand_line?: string;
  family_id?: string;
  product_families?: { name?: string | null } | null;
  variant_axis?: PIMProduct["variantAxis"];
  status?: PIMProduct["status"];
  launch_date?: string;
  msrp?: number;
  cost_of_goods?: number;
  margin_percent?: number;
  assets_count?: number;
  content_score?: number;
  short_description?: string | null;
  long_description?: string | null;
  features?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  keywords?: string | null;
  inheritance?: PIMProduct["inheritance"];
  is_inherited?: PIMProduct["isInherited"];
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  last_modified_by?: string;
};

type ErrorPayload = { error?: string };

type ProductShareSetOption = {
  id: string;
  name: string;
  product_count: number;
  variant_count: number;
  item_count: number;
};

type ScopeConstraintOption = { value: string; label: string };

type ProductLinkRecord = {
  product_id?: string | null;
  asset_id?: string | null;
  document_slot_code?: string | null;
  market_id?: string | null;
  locale_id?: string | null;
  is_primary?: boolean | null;
  created_at?: string | null;
  dam_assets?: {
    id?: string | null;
    filename?: string | null;
    s3_url?: string | null;
    thumbnail_urls?: { small?: string | null; medium?: string | null; large?: string | null } | null;
  } | null;
};

type ProductFrontImage = {
  slot: CoreAssetSlot;
  assetId: string;
  previewUrl: string;
  fallbackPreviewUrl: string;
  filename: string | null;
};

type CoreAssetSlot = "front" | "back" | "left" | "right";

export interface PIMGridTableProps {
  tenantSlug: string;
  selectedBrandSlug?: string | null;
  isPartnerAllView?: boolean;
  initialSearchQuery?: string;
  onProductClick?: (product: PIMProduct, options?: { section?: string }) => void;
  onCreateProduct?: () => void;
}

type ProductField = {
  id: string;
  code: string;
  name: string;
  field_type: string;
  field_class?: string;
  system_key?: string | null;
  is_active: boolean;
  is_locked?: boolean;
  is_localizable?: boolean;
  // scope_policy supersedes is_localizable: 'locale' | 'mixed' = localizable
  scope_policy?: string | null;
  sort_order: number;
};

// A locale-scoped column added by the user (Phase 3)
type LocaleCol = {
  baseColId: string;  // e.g. "shortDescription" or "attr_caffeine_content"
  fieldCode: string;  // e.g. "short_description" or "caffeine_content"
  localeId: string;
  localeName: string; // e.g. "Spanish (MX)"
  colId: string;      // `${baseColId}::${localeId}` — unique AG Grid colId
};

// Codes that are already represented as named columns in the System or Content sections.
// Fields matching any of these are excluded from the Attributes picker to avoid duplication.
const CORE_FIELD_CODES = new Set([
  "product_name", "title", "name",
  "sku", "barcode", "upc", "scin",
  "status",
  "brand_line", "brand",
  "family", "family_id", "product_family",
  "msrp", "cost_of_goods", "margin_percent",
  "assets_count", "content_score", "completeness", "readiness",
  "last_modified", "updated_at", "created_at",
]);

// Returns true only for genuine org-created attribute fields that belong in the Attributes section.
const isOrgAttribute = (f: ProductField): boolean =>
  f.field_class === "custom" &&
  !f.system_key &&
  !CORE_FIELD_CODES.has(f.code);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRODUCT_MODEL_FILTER_ALL = "__all_models__";
const PRODUCT_MODEL_FILTER_UNASSIGNED = "__unassigned_model__";
const MAX_INLINE_VARIANTS = 15;
const MAX_CORE_ASSET_FETCH_PRODUCTS = 160;
const CORE_ASSET_SLOT_ORDER: CoreAssetSlot[] = ["front", "back", "left", "right"];
const CORE_ASSET_SLOT_CODES: Record<CoreAssetSlot, string> = {
  front: "image_front", back: "image_back", left: "image_left", right: "image_right",
};

const DEFAULT_VISIBLE_COLUMNS = {
  // System
  status: true, productName: true, sku: true, upc: true,
  scin: true, family: true, contentScore: true, readiness: false,
  assetsCount: false, lastModified: false,
  // Asset image slots
  imageFront: true, imageBack: true, imageLeft: false, imageRight: false,
};

// Mapping from AG Grid colId → product table field name (for save)
const COL_TO_FIELD: Record<string, string> = {
  productName: "product_name",
  sku:         "sku",
  upc:         "upc",
  scin:        "scin",
  status:      "status",
};

// colIds that are never editable (computed/visual or structural columns)
const NON_EDITABLE_COLS = new Set([
  "entity", "assets", "contentScore", "readiness", "assetsCount", "lastModified",
  "family", // Changing family detaches all attribute group assignments — hard-locked
]);

// Column picker sections: entity + productName are locked (lockVisible) — excluded.
const COLUMN_PICKER_SECTIONS: Array<{
  label: string;
  items: Array<{ colId: keyof typeof DEFAULT_VISIBLE_COLUMNS; label: string }>;
}> = [
  {
    label: "System",
    items: [
      { colId: "status",       label: "Status" },
      { colId: "sku",          label: "SKU" },
      { colId: "upc",          label: "Barcode" },
      { colId: "scin",         label: "SCIN" },
      { colId: "family",       label: "Family" },
      { colId: "assetsCount",  label: "Assets Count" },
      { colId: "lastModified", label: "Last Modified" },
      { colId: "contentScore", label: "Completeness" },
      { colId: "readiness",    label: "Readiness" },
    ],
  },
  {
    label: "Images",
    items: [
      { colId: "imageFront", label: "Front Image" },
      { colId: "imageBack",  label: "Back Image" },
      { colId: "imageLeft",  label: "Left Image" },
      { colId: "imageRight", label: "Right Image" },
    ],
  },
];

// Strip any trailing BCP-47 locale code suffix from a locale name.
// Handles names stored as "English (United States) (en-US)" → "English (United States)"
// Works whether or not the code is known, using a regex for the BCP-47 pattern.
const cleanLocaleName = (name: string, code?: string): string => {
  // First try exact suffix match if code is provided
  if (code) {
    const suffix = ` (${code})`;
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length).trim();
  }
  // Fall back to regex: strip trailing " (xx)", " (xx-XX)", " (xx-Xxxx-XX)" etc.
  return name.replace(/\s+\([a-z]{2,3}(?:-[a-zA-Z0-9]{2,8}){0,3}\)\s*$/i, '').trim() || name;
};

const isParentProduct = (p: PIMProduct) => p.type === "parent";
const isVariantProduct = (p: PIMProduct) => p.type === "variant";
const isStandaloneProduct = (p: PIMProduct) => p.type === "standalone";
const isViewAllVariantsRow = (p: PIMProduct) =>
  Boolean((p as PIMProduct & { isViewAllLink?: boolean }).isViewAllLink);

const extractNonEmptyUrl = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

const normalizeScore = (score: unknown): number => {
  const n = typeof score === "number" ? score : typeof score === "string" ? Number.parseFloat(score) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
};

const scoreBarColor = (score: number) => {
  if (score >= 90) return "#00d66b";
  if (score >= 70) return "#f4cb16";
  if (score >= 50) return "#ff9f0a";
  return "#ff3b5c";
};

// ---------------------------------------------------------------------------
// AG Grid theme (v35 Theming API — static hex values only)
// ---------------------------------------------------------------------------

const pimTheme = themeQuartz.withParams({
  accentColor: "#1A7BFF",
  backgroundColor: "#ffffff",
  foregroundColor: "#141618",
  borderColor: "#e5e7eb",
  headerBackgroundColor: "#f8f9fa",
  rowHoverColor: "transparent",
  selectedRowBackgroundColor: "transparent",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  fontSize: 13,
  rowHeight: 72,
  headerHeight: 36,
  cellHorizontalPadding: 12,
  wrapperBorder: false,
  rowBorder: true,
  // Suppress focus ring on rows — navigation intent is shown by row click, not a focus border
});

// ---------------------------------------------------------------------------
// Grid context — shared with cell renderers via params.context
// ---------------------------------------------------------------------------

interface GridContext {
  selectedIdsRef: React.MutableRefObject<Set<string>>;
  expandedParentsRef: React.MutableRefObject<Set<string>>;
  coreAssetsRef: React.MutableRefObject<Record<string, ProductFrontImage[]>>;
  fallbackAssetsRef: React.MutableRefObject<Set<string>>;
  failedAssetsRef: React.MutableRefObject<Set<string>>;
  scoresRef: React.MutableRefObject<Record<string, number>>;
  readinessRef: React.MutableRefObject<Record<string, number>>;
  primaryProfileRef: React.MutableRefObject<{ id: string; name: string; profile_type: string } | null>;
  showHierarchyRef: React.MutableRefObject<boolean>;
  productsRef: React.MutableRefObject<PIMProduct[]>;
  selectableIdsRef: React.MutableRefObject<string[]>;
  handleSelectAllRef: React.MutableRefObject<() => void>;
  isSharedRowFn: (product: Partial<PIMProduct>) => boolean;
  onToggleExpand: (parentId: string) => void;
  onSelect: (productId: string, event?: React.MouseEvent | React.ChangeEvent) => void;
  onStatusChangeRef: React.MutableRefObject<(product: Partial<PIMProduct>, status: ProductStatus) => void>;
  onDeleteSingle: (products: PIMProduct[]) => void;
  onProductClick?: (product: PIMProduct, options?: { section?: string }) => void;
  tenantSlugRef: React.MutableRefObject<string>;
  refreshProductAssetsRef: React.MutableRefObject<(productId: string) => void>;
}

// ---------------------------------------------------------------------------
// Cell renderers — defined outside the component for stable references
// ---------------------------------------------------------------------------

type CRP = ICellRendererParams<PIMProduct, unknown, GridContext>;

function EntityBadgeRenderer({ data }: CRP) {
  if (!data || isViewAllVariantsRow(data)) return null;
  const map: Record<string, { label: string; bg: string; color: string }> = {
    parent:     { label: "P", bg: "#ede9fe", color: "#7c3aed" },
    variant:    { label: "V", bg: "#fce7f3", color: "#be185d" },
    standalone: { label: "S", bg: "#dcfce7", color: "#15803d" },
  };
  const cfg = map[data.type] ?? map.standalone;
  return (
    <div className="flex h-full items-center justify-center">
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold"
        style={{ backgroundColor: cfg.bg, color: cfg.color }}
      >
        {cfg.label}
      </span>
    </div>
  );
}

function SelectAllHeaderRenderer(params: IHeaderParams<PIMProduct, GridContext>) {
  const ctx = params.context;
  const selectable = ctx.selectableIdsRef.current;
  const selected = ctx.selectedIdsRef.current;
  const isAllSelected = selectable.length > 0 && selectable.every((id) => selected.has(id));
  const isIndeterminate = !isAllSelected && selectable.some((id) => selected.has(id));

  return (
    <div className="flex items-center gap-2 px-1">
      <input
        type="checkbox"
        checked={isAllSelected}
        ref={(el) => { if (el) el.indeterminate = isIndeterminate; }}
        onChange={() => ctx.handleSelectAllRef.current()}
        onClick={(e) => e.stopPropagation()}
        className="h-3 w-3 cursor-pointer rounded border-gray-300 text-blue-600"
      />
      <span
        className="cursor-pointer font-medium text-xs uppercase tracking-wider text-gray-500 select-none"
        onClick={() => params.progressSort()}
      >
        Product Name
      </span>
    </div>
  );
}

function NameCellRenderer({ data, context: ctx }: CRP) {
  if (!data) return null;
  if (isViewAllVariantsRow(data)) {
    // Rendered via fullWidthCellRenderer instead
    return null;
  }

  const isSelected = ctx.selectedIdsRef.current.has(data.id);
  const isShared = ctx.isSharedRowFn(data);
  const showHierarchy = ctx.showHierarchyRef.current;
  const isExpanded = isParentProduct(data) && ctx.expandedParentsRef.current.has(data.id);
  const isVariant = isVariantProduct(data);

  return (
    <div
      className="flex h-full items-center gap-2"
      style={{ paddingLeft: isVariant && showHierarchy ? 24 : 0 }}
    >
      {/* Expand/collapse chevron for parents */}
      {showHierarchy && isParentProduct(data) ? (
        <button
          type="button"
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded hover:bg-gray-200"
          onClick={(e) => { e.stopPropagation(); ctx.onToggleExpand(data.id); }}
        >
          {isExpanded
            ? <ChevronDown className="h-3 w-3 text-gray-500" />
            : <ChevronRight className="h-3 w-3 text-gray-500" />}
        </button>
      ) : showHierarchy && isVariant ? (
        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
          <span className="h-px w-2.5 bg-gray-300" />
        </span>
      ) : (
        <span className="h-4 w-4 flex-shrink-0" />
      )}

      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        disabled={isShared}
        onChange={(e) => ctx.onSelect(data.id, e)}
        onClick={(e) => e.stopPropagation()}
        className="h-3 w-3 flex-shrink-0 cursor-pointer rounded border-gray-300 text-blue-600 disabled:opacity-40"
      />

      {/* Name + variant axis */}
      <div className="min-w-0 flex-1 space-y-0.5">
        <span
          className={cn(
            "block truncate text-sm",
            isVariant && showHierarchy ? "text-gray-500" : "text-gray-900"
          )}
        >
          {data.productName}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {isParentProduct(data) && (
            <span className="text-xs text-gray-400">
              {data.variantCount
                ? `${data.variantCount} variant${data.variantCount === 1 ? "" : "s"}`
                : "No variants"}
            </span>
          )}
          {isVariant && data.variantAxis && showHierarchy &&
            Object.entries(data.variantAxis).map(([, v]) => (
              <span
                key={String(v)}
                className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700"
              >
                {String(v)}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}



function makeImageSlotCellRenderer(slot: CoreAssetSlot, slotCode: string, slotLabel: string) {
  function ImageSlotCellRenderer({ data, context: ctx }: CRP) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!data || isViewAllVariantsRow(data)) return null;

    const images = ctx.coreAssetsRef.current[data.id] ?? [];
    const img = images.find((i) => i.slot === slot);
    const failed = img ? ctx.failedAssetsRef.current.has(img.assetId) : false;
    const usingFallback = img ? ctx.fallbackAssetsRef.current.has(img.assetId) : false;
    const src = img && !failed ? (usingFallback ? img.fallbackPreviewUrl : img.previewUrl) : null;

    const upload = async (file: File) => {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("productLink", JSON.stringify({
          productId: data.id,
          linkContext: `product_image_slot:${slotCode}:upload`,
          confidence: 1,
          matchReason: `Uploaded to ${slotLabel} slot`,
          assetType: "image",
          documentSlotCode: slotCode,
          replaceExistingSlot: true,
        }));
        const res = await fetch(`/api/${ctx.tenantSlugRef.current}/assets/upload`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) ctx.refreshProductAssetsRef.current(data.id);
      } finally {
        setIsUploading(false);
      }
    };

    const hasDragFiles = (e: React.DragEvent) =>
      e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes("application/x-moz-file");

    return (
      <div
        className={cn(
          "group relative flex h-full w-full cursor-pointer items-center justify-center",
          isDragOver && "bg-blue-50",
        )}
        onDragEnter={(e) => { if (hasDragFiles(e)) { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); } }}
        onDragOver={(e) => { if (hasDragFiles(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; setIsDragOver(true); } }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file?.type.startsWith("image/")) void upload(file);
        }}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        title={src ? `${slotLabel} — click to replace` : `${slotLabel} — click or drag to upload`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
        {isUploading ? (
          <div className="flex h-14 w-14 items-center justify-center rounded bg-gray-100">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : src ? (
          <NextImage
            src={src}
            alt={img?.filename ?? `${data.productName} ${slotLabel}`}
            width={56}
            height={56}
            className="h-14 w-14 rounded object-cover"
            loading="lazy"
            unoptimized
            onError={() => {
              if (!usingFallback && img!.previewUrl !== img!.fallbackPreviewUrl) {
                ctx.fallbackAssetsRef.current = new Set([...ctx.fallbackAssetsRef.current, img!.assetId]);
              } else {
                ctx.failedAssetsRef.current = new Set([...ctx.failedAssetsRef.current, img!.assetId]);
              }
            }}
          />
        ) : (
          <div className={cn(
            "flex h-14 w-14 items-center justify-center rounded border border-dashed border-gray-200 text-gray-300 transition-colors group-hover:border-gray-400 group-hover:text-gray-400",
            isDragOver && "border-blue-400 text-blue-400",
          )}>
            <Upload className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
    );
  }
  ImageSlotCellRenderer.displayName = `ImageSlotCellRenderer_${slot}`;
  return ImageSlotCellRenderer;
}

const ImageFrontRenderer = makeImageSlotCellRenderer("front", "image_front", "Front");
const ImageBackRenderer  = makeImageSlotCellRenderer("back",  "image_back",  "Back");
const ImageLeftRenderer  = makeImageSlotCellRenderer("left",  "image_left",  "Left");
const ImageRightRenderer = makeImageSlotCellRenderer("right", "image_right", "Right");

function StatusCellRenderer({ data, context: ctx }: CRP) {
  if (!data || isViewAllVariantsRow(data)) return null;
  const isShared = ctx.isSharedRowFn(data);
  return (
    <div className="flex h-full items-center" onClick={(e) => e.stopPropagation()}>
      <Select
        value={data.status ?? "Draft"}
        onValueChange={(v) => ctx.onStatusChangeRef.current(data, v as ProductStatus)}
        disabled={isShared}
      >
        <SelectTrigger className="h-7 w-[130px] text-xs" onPointerDown={(e) => e.stopPropagation()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRODUCT_STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ContentScoreCellRenderer({ data, context: ctx }: CRP) {
  if (!data || isViewAllVariantsRow(data)) return null;
  const live = ctx.scoresRef.current[data.id];
  const score = normalizeScore(Number.isFinite(live) ? live : data.contentScore);
  return (
    <div className="flex h-full items-center gap-2">
      <div
        className="h-1.5 w-[74px] overflow-hidden rounded-full"
        style={{ backgroundColor: "rgba(31,41,55,0.15)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${score}%`,
            backgroundColor: scoreBarColor(score),
            minWidth: score > 0 ? 4 : 0,
          }}
        />
      </div>
      <span className="tabular-nums text-xs text-gray-500">{score}%</span>
    </div>
  );
}

function ReadinessCellRenderer({ data, context: ctx }: CRP) {
  if (!data || isViewAllVariantsRow(data)) return null;
  const raw = ctx.readinessRef.current[data.id];
  if (!Number.isFinite(raw)) return <span className="text-xs text-gray-300">—</span>;
  const score = normalizeScore(raw);
  return (
    <div className="flex h-full items-center gap-2">
      <div
        className="h-1.5 w-[74px] overflow-hidden rounded-full"
        style={{ backgroundColor: "rgba(31,41,55,0.15)" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${score}%`, backgroundColor: scoreBarColor(score), minWidth: score > 0 ? 4 : 0 }}
        />
      </div>
      <span className="tabular-nums text-xs text-gray-500">{score}%</span>
    </div>
  );
}

function ActionsCellRenderer({ data, context: ctx }: CRP) {
  if (!data || isViewAllVariantsRow(data) || ctx.isSharedRowFn(data)) return null;
  return (
    <div className="flex h-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100 focus:outline-none"
          >
            <MoreHorizontal className="h-4 w-4 text-gray-400" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="z-50 min-w-[140px] rounded-lg border border-border bg-white p-1 shadow-lg"
            sideOffset={4}
            align="end"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none hover:bg-muted"
              onClick={() => ctx.onProductClick?.(data)}
            >
              <Edit className="h-3.5 w-3.5" />
              Edit
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 outline-none hover:bg-red-50"
              onClick={() => ctx.onDeleteSingle([data])}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

function ViewAllVariantsRenderer({ data, context: ctx }: CRP) {
  if (!data) return null;
  const parent = ctx.productsRef.current.find((p) => p.id === data.parentId);
  return (
    <div className="flex h-full items-center px-6">
      <button
        type="button"
        className="text-sm text-blue-600 hover:underline"
        onClick={(e) => {
          e.stopPropagation();
          if (parent) ctx.onProductClick?.(parent, { section: "variants" });
        }}
      >
        {data.productName}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PIMGridTable({
  tenantSlug,
  selectedBrandSlug,
  isPartnerAllView = false,
  initialSearchQuery = "",
  onProductClick,
  onCreateProduct,
}: PIMGridTableProps) {
  const router = useRouter();
  const {
    locales, markets, marketLocales,
    selectedChannelId, selectedDestinationId,
    selectedLocale, selectedLocaleId, selectedMarketId,
  } = useMarketContext();
  const normalizedSelectedBrand = (selectedBrandSlug ?? "").trim().toLowerCase();
  const normalizedTenantSlug = tenantSlug.trim().toLowerCase();
  const isSharedBrandView = normalizedSelectedBrand.length > 0 && normalizedSelectedBrand !== normalizedTenantSlug;
  const canCreateProducts = Boolean(onCreateProduct) && !isSharedBrandView;
  const [familyFieldMap, setFamilyFieldMap] = useState<Map<string, Set<string>>>(new Map());
  const familyFieldMapRef = useRef<Map<string, Set<string>>>(new Map());
  const tenantSlugRef = useRef<string>(tenantSlug);
  useEffect(() => { tenantSlugRef.current = tenantSlug; }, [tenantSlug]);
  const refreshProductAssetsRef = useRef<(productId: string) => void>(() => {});

  const isSharedRow = useCallback(
    (product: Partial<PIMProduct>) => {
      if (isSharedBrandView) return true;
      if (!isPartnerAllView) return false;
      const slug = String(product.organizationSlug ?? "").trim().toLowerCase();
      return slug.length > 0 && slug !== normalizedTenantSlug;
    },
    [isPartnerAllView, isSharedBrandView, normalizedTenantSlug]
  );

  // ── State ────────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<PIMProduct[]>([]);
  const [liveContentScoresByProductId, setLiveContentScoresByProductId] = useState<Record<string, number>>({});
  const [liveReadinessScoresByProductId, setLiveReadinessScoresByProductId] = useState<Record<string, number>>({});
  const [primaryProfile, setPrimaryProfile] = useState<{ id: string; name: string; profile_type: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const deferredSearch = useDeferredValue(searchQuery);
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterProductModel, setFilterProductModel] = useState(PRODUCT_MODEL_FILTER_ALL);
  const [sortField, setSortField] = useState<keyof PIMProduct>("productName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [showVariantHierarchy, setShowVariantHierarchy] = useState(true);
  const [coreAssetImagesByProductId, setCoreAssetImagesByProductId] = useState<Record<string, ProductFrontImage[]>>({});
  const [fallbackCoreAssetImageIds, setFallbackCoreAssetImageIds] = useState<Set<string>>(new Set());
  const [failedCoreAssetImageIds, setFailedCoreAssetImageIds] = useState<Set<string>>(new Set());
  const [filterSetId, setFilterSetId] = useState("");
  const [setFilterItemIds, setSetFilterItemIds] = useState<Set<string>>(new Set());
  const [setFilterLoading, setSetFilterLoading] = useState(false);
  const [shareSetOptions, setShareSetOptions] = useState<ProductShareSetOption[]>([]);
  const [selectedShareSetId, setSelectedShareSetId] = useState("");
  const [isLoadingShareSets, setIsLoadingShareSets] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isSubmittingShare, setIsSubmittingShare] = useState(false);
  const [isCreatingShareSet, setIsCreatingShareSet] = useState(false);
  const [newShareSetName, setNewShareSetName] = useState("");
  const [shareMarketIds, setShareMarketIds] = useState<string[]>([]);
  const [shareLocaleIds, setShareLocaleIds] = useState<string[]>([]);
  const [shareDialogError, setShareDialogError] = useState<string | null>(null);
  const [shareStatusMessage, setShareStatusMessage] = useState<string | null>(null);
  const [, setBulkScopeStatusMessage] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pendingDeleteProducts, setPendingDeleteProducts] = useState<PIMProduct[]>([]);
  const [bulkDeleteSubmitting, setBulkDeleteSubmitting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [bulkDeleteStatusMessage, setBulkDeleteStatusMessage] = useState<string | null>(null);
  const [isRemovingFromSet, setIsRemovingFromSet] = useState(false);
  const [canTranslate, setCanTranslate] = useState(false);
  const [isTranslatePanelOpen, setIsTranslatePanelOpen] = useState(false);
  const [isProductImportOpen, setIsProductImportOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [dirtyChanges, setDirtyChanges] = useState<Map<string, unknown>>(new Map()); // key: `${productId}::${colId}`
  const [editModeSnapshot, setEditModeSnapshot] = useState<Map<string, PIMProduct>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  // Phase 3: locale-scoped columns added by the user
  const [localeColumns, setLocaleColumns] = useState<LocaleCol[]>([]);
  // Phase 3: fetched product_field_values keyed productId → colId → value
  const [scopedFieldValues, setScopedFieldValues] = useState<Record<string, Record<string, unknown>>>({});

  useEffect(() => { setSearchQuery(initialSearchQuery); }, [initialSearchQuery]);

  // ── Refs (for AG Grid cell renderer context) ─────────────────────────────
  const gridRef = useRef<AgGridReact<PIMProduct>>(null);
  const selectedIdsRef = useRef(selectedProductIds);
  const expandedParentsRef = useRef(expandedParents);
  const coreAssetsRef = useRef(coreAssetImagesByProductId);
  const fallbackAssetsRef = useRef(fallbackCoreAssetImageIds);
  const failedAssetsRef = useRef(failedCoreAssetImageIds);
  const scoresRef = useRef(liveContentScoresByProductId);
  const readinessRef = useRef(liveReadinessScoresByProductId);
  const primaryProfileRef = useRef(primaryProfile);
  const showHierarchyRef = useRef(showVariantHierarchy);
  const productsRef = useRef(products);
  const selectableIdsRef = useRef<string[]>([]);
  const handleSelectAllRef = useRef<() => void>(() => {});
  const onStatusChangeRef = useRef<(product: Partial<PIMProduct>, status: ProductStatus) => void>(() => {});
  const isEditModeRef = useRef(isEditMode);
  const dirtyChangesRef = useRef(dirtyChanges);
  const scopedFieldValuesRef = useRef(scopedFieldValues);

  // Keep refs in sync with state
  useEffect(() => { selectedIdsRef.current = selectedProductIds; }, [selectedProductIds]);
  useEffect(() => {
    isEditModeRef.current = isEditMode;
    const api = gridRef.current?.api;
    if (api) {
      api.refreshCells({ force: true });
      requestAnimationFrame(() => api.resetRowHeights());
    }
  }, [isEditMode]);

  useEffect(() => { dirtyChangesRef.current = dirtyChanges; }, [dirtyChanges]);
  useEffect(() => { familyFieldMapRef.current = familyFieldMap; }, [familyFieldMap]);
  useEffect(() => { scopedFieldValuesRef.current = scopedFieldValues; }, [scopedFieldValues]);
  useEffect(() => { expandedParentsRef.current = expandedParents; }, [expandedParents]);
  useEffect(() => {
    coreAssetsRef.current = coreAssetImagesByProductId;
    if (Object.keys(coreAssetImagesByProductId).length > 0) {
      gridRef.current?.api?.refreshCells({ force: true });
    }
  }, [coreAssetImagesByProductId]);
  useEffect(() => { fallbackAssetsRef.current = fallbackCoreAssetImageIds; }, [fallbackCoreAssetImageIds]);
  useEffect(() => { failedAssetsRef.current = failedCoreAssetImageIds; }, [failedCoreAssetImageIds]);
  useEffect(() => { scoresRef.current = liveContentScoresByProductId; }, [liveContentScoresByProductId]);
  useEffect(() => { readinessRef.current = liveReadinessScoresByProductId; }, [liveReadinessScoresByProductId]);
  useEffect(() => { primaryProfileRef.current = primaryProfile; }, [primaryProfile]);
  useEffect(() => { showHierarchyRef.current = showVariantHierarchy; }, [showVariantHierarchy]);
  useEffect(() => { productsRef.current = products; }, [products]);

  // Redraw rows to apply pim-row-selected / pim-row-variant-expanded classes
  useEffect(() => {
    gridRef.current?.api?.redrawRows();
    gridRef.current?.api?.refreshCells({ columns: ["productName", "entity"], force: true });
    gridRef.current?.api?.refreshHeader();
  }, [selectedProductIds, expandedParents, showVariantHierarchy]);

  useEffect(() => {
    gridRef.current?.api?.refreshCells({ columns: ["assets"], force: true });
  }, [coreAssetImagesByProductId, fallbackCoreAssetImageIds, failedCoreAssetImageIds]);

  useEffect(() => {
    gridRef.current?.api?.refreshCells({ columns: ["contentScore"], force: true });
  }, [liveContentScoresByProductId]);

  useEffect(() => {
    gridRef.current?.api?.refreshCells({ columns: ["readiness"], force: true });
  }, [liveReadinessScoresByProductId]);

  // ── URL builders ──────────────────────────────────────────────────────────
  // Locale-first: market no longer determines product visibility in the PIM list.
  // Only locale (for scoped override resolution) and brand (partner view) are passed.
  const buildScopedProductsUrl = useCallback(() => {
    const q = new URLSearchParams();
    q.set("listMode", "table");
    if (isPartnerAllView) q.set("view", "all");
    if (normalizedSelectedBrand) q.set("brand", normalizedSelectedBrand);
    const s = deferredSearch.trim();
    if (s.length >= 2) q.set("q", s);
    return q.toString() ? `/api/${tenantSlug}/products?${q}` : `/api/${tenantSlug}/products`;
  }, [deferredSearch, isPartnerAllView, normalizedSelectedBrand, tenantSlug]);

  const buildCompletenessBatchUrl = useCallback(() => {
    const q = new URLSearchParams();
    if (normalizedSelectedBrand) q.set("brand", normalizedSelectedBrand);
    return q.toString()
      ? `/api/${tenantSlug}/products/completeness/batch?${q}`
      : `/api/${tenantSlug}/products/completeness/batch`;
  }, [normalizedSelectedBrand, tenantSlug]);

  const buildReadinessBatchUrl = useCallback(() => {
    const q = new URLSearchParams();
    if (normalizedSelectedBrand) q.set("brand", normalizedSelectedBrand);
    return q.toString()
      ? `/api/${tenantSlug}/products/readiness/batch?${q}`
      : `/api/${tenantSlug}/products/readiness/batch`;
  }, [normalizedSelectedBrand, tenantSlug]);

  // ── Data: products ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetchJsonWithDedupe<{ success?: boolean; data?: ProductApiRow[] }>(
          buildScopedProductsUrl(),
          { ttlMs: 1500 }
        );
        if (cancelled) return;
        if (!res.ok) {
          if ([401, 403, 404].includes(res.status)) { setProducts([]); return; }
          throw new Error(`${res.status}`);
        }
        if (res.data?.success && Array.isArray(res.data.data)) {
          const raw = res.data.data as ProductApiRow[];
          const parentSkuById = new Map<string, string | null>();
          raw.forEach((r) => { if (r.id) parentSkuById.set(r.id, r.sku ?? null); });
          setProducts(raw.map((r) => ({
            id: r.id ?? "",
            organizationId: r.organization_id,
            organizationSlug: r.organization_slug,
            organizationName: r.organization_name,
            type: r.type ?? "standalone",
            parentId: r.parent_id ?? undefined,
            hasVariants: r.has_variants,
            variantCount: r.variant_count,
            productName: r.product_name ?? "",
            scin: r.scin,
            sku: r.sku ?? null,
            upc: r.barcode ?? r.upc ?? undefined,
            brandLine: r.brand_line,
            family: r.product_families?.name ?? undefined,
            familyId: r.family_id ?? undefined,
            variantAxis: r.variant_axis ?? {},
            status: r.status ?? "Draft",
            launchDate: r.launch_date,
            msrp: r.msrp,
            costOfGoods: r.cost_of_goods,
            marginPercent: r.margin_percent,
            assetsCount: r.assets_count ?? 0,
            contentScore: r.content_score ?? 0,
            shortDescription: r.short_description ?? undefined,
            longDescription: r.long_description ?? undefined,
            features: r.features ?? undefined,
            metaTitle: r.meta_title ?? undefined,
            metaDescription: r.meta_description ?? undefined,
            keywords: r.keywords ?? undefined,
            inheritance: r.inheritance ?? {},
            isInherited: r.is_inherited ?? {},
            lastModifiedBy: r.last_modified_by ?? r.created_by ?? "system",
            lastModified: r.updated_at ?? r.created_at ?? new Date().toISOString(),
          })));
        } else {
          setProducts([]);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load products:", err);
        setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [buildScopedProductsUrl]);

  // ── Data: completeness scores ──────────────────────────────────────────────
  const loadedProductIds = useMemo(
    () => [...new Set(products.map((p) => p.id).filter(Boolean))],
    [products]
  );
  const loadedIdsKey = loadedProductIds.join(",");

  useEffect(() => {
    if (isPartnerAllView) { setLiveContentScoresByProductId({}); return; }
    if (loadedProductIds.length === 0) { setLiveContentScoresByProductId({}); return; }
    const ctrl = new AbortController();
    let cancelled = false;
    const url = buildCompletenessBatchUrl();

    const load = async () => {
      const next: Record<string, number> = {};
      for (let i = 0; i < loadedProductIds.length; i += 120) {
        const chunk = loadedProductIds.slice(i, i + 120);
        const res = await fetch(url, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: chunk }), signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const payload = await res.json().catch(() => null) as { data?: { scores?: Record<string, unknown> } } | null;
        Object.entries(payload?.data?.scores ?? {}).forEach(([id, v]) => {
          const n = typeof v === "number" ? v : Number.parseFloat(String(v));
          if (Number.isFinite(n)) next[id] = Math.min(100, Math.max(0, Math.round(n)));
        });
      }
      if (!cancelled) setLiveContentScoresByProductId(next);
    };

    load().catch((err) => { if (!cancelled && (err as { name?: string })?.name !== "AbortError") console.error(err); });
    return () => { cancelled = true; ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildCompletenessBatchUrl, isPartnerAllView, loadedIdsKey]);

  // ── Data: readiness scores ─────────────────────────────────────────────────
  const [readinessVisible, setReadinessVisible] = useState(DEFAULT_VISIBLE_COLUMNS.readiness);

  // ── Column visibility state (mirrors grid; used only to drive picker UI) ──
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);

  // ── Product attribute fields from API (used to populate column picker) ────
  const [productFields, setProductFields] = useState<ProductField[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/${tenantSlug}/product-fields`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: unknown) => {
        if (!cancelled && Array.isArray(data)) {
          setProductFields(
            (data as ProductField[])
              .filter((f) => f.is_active)
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          );
        }
      })
      .catch(() => {/* non-critical */});
    return () => { cancelled = true; };
  }, [tenantSlug]);

  // ── Phase 3: fetch product_field_values for active locale columns ─────────
  useEffect(() => {
    if (localeColumns.length === 0) return;

    const productIds = loadedProductIds;
    if (productIds.length === 0) return;

    const fieldCodes = [...new Set(localeColumns.map((c) => c.fieldCode))];
    const localeIds  = [...new Set(localeColumns.map((c) => c.localeId))];

    let cancelled = false;
    const load = async () => {
      try {
        const q = new URLSearchParams({
          productIds: productIds.join(","),
          fieldCodes:  fieldCodes.join(","),
          localeIds:   localeIds.join(","),
        });
        const res = await fetch(`/api/${tenantSlug}/products/grid-data?${q}`);
        if (!res.ok || cancelled) return;
        const payload = await res.json() as { data?: Record<string, Record<string, unknown>> };
        if (!cancelled) setScopedFieldValues(payload.data ?? {});
      } catch {
        // non-critical
      }
    };

    void load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localeColumns, loadedIdsKey, tenantSlug]);

  // ── Family-scoped attribute field IDs ────────────────────────────────────
  // familyFieldMap: familyId → Set<product_field_id>
  // Built by fetching each visible family's field-group assignments.
  // Used both to drive the column picker (union of all family sets)
  // and to gate per-row cell editability in edit mode.

  // Union of all field IDs across visible families — used by column picker
  const visibleFamilyFieldIds = useMemo(
    () => new Set([...familyFieldMap.values()].flatMap((s) => [...s])),
    [familyFieldMap]
  );

  useEffect(() => {
    if (!readinessVisible || loadedProductIds.length === 0) {
      setPrimaryProfile(null); setLiveReadinessScoresByProductId({});
      return;
    }
    const ctrl = new AbortController();
    let cancelled = false;
    const url = buildReadinessBatchUrl();

    const load = async () => {
      const next: Record<string, number> = {};
      let profile: typeof primaryProfile = null;
      for (let i = 0; i < loadedProductIds.length; i += 120) {
        const chunk = loadedProductIds.slice(i, i + 120);
        const res = await fetch(url, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: chunk }), signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const payload = await res.json().catch(() => null) as {
          data?: { profile?: { id: string; name: string; profile_type: string } | null; scores?: Record<string, unknown> };
        } | null;
        if (i === 0 && payload?.data?.profile) profile = payload.data.profile;
        Object.entries(payload?.data?.scores ?? {}).forEach(([id, v]) => {
          const n = typeof v === "number" ? v : Number.parseFloat(String(v));
          if (Number.isFinite(n)) next[id] = Math.min(100, Math.max(0, Math.round(n)));
        });
      }
      if (!cancelled) { setPrimaryProfile(profile); setLiveReadinessScoresByProductId(next); }
    };

    load().catch((err) => { if (!cancelled && (err as { name?: string })?.name !== "AbortError") console.error(err); });
    return () => { cancelled = true; ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildReadinessBatchUrl, readinessVisible, loadedIdsKey]);

  // ── Data: core asset images ────────────────────────────────────────────────
  const coreAssetProductIds = useMemo(
    () => loadedProductIds.slice(0, MAX_CORE_ASSET_FETCH_PRODUCTS),
    [loadedProductIds]
  );
  const coreAssetIdsKey = coreAssetProductIds.join(",");

  const buildAssetPreviewPath = useCallback(
    (assetId: string) => {
      const q = new URLSearchParams();
      if (isPartnerAllView) q.set("view", "all");
      if (normalizedSelectedBrand) q.set("brand", normalizedSelectedBrand);
      return q.toString()
        ? `/api/${tenantSlug}/assets/${assetId}/preview?${q}`
        : `/api/${tenantSlug}/assets/${assetId}/preview`;
    },
    [isPartnerAllView, normalizedSelectedBrand, tenantSlug]
  );

  // Keep refreshProductAssetsRef current so cell renderers can call it without stale closures.
  useEffect(() => {
    refreshProductAssetsRef.current = async (productId: string) => {
      try {
        const q = new URLSearchParams({
          document_slot_codes: CORE_ASSET_SLOT_ORDER.map((s) => CORE_ASSET_SLOT_CODES[s]).join(","),
          product_ids: productId,
        });
        if (isPartnerAllView) q.set("view", "all");
        if (normalizedSelectedBrand) q.set("brand", normalizedSelectedBrand);
        const res = await fetch(`/api/${tenantSlug}/product-links?${q}`);
        if (!res.ok) return;
        const payload = await res.json() as { data?: ProductLinkRecord[] };
        const links = Array.isArray(payload.data) ? (payload.data as ProductLinkRecord[]) : [];

        const best = new Map<string, { rank: number; ts: number; img: ProductFrontImage }>();
        for (const link of links) {
          const pid = String(link.product_id ?? "").trim();
          const aid = String(link.asset_id ?? link.dam_assets?.id ?? "").trim();
          const sc = String(link.document_slot_code ?? "").trim();
          const slot = CORE_ASSET_SLOT_ORDER.find((s) => CORE_ASSET_SLOT_CODES[s] === sc);
          if (!pid || !aid || !slot) continue;
          const lm = (link.market_id ?? "").trim();
          const ll = (link.locale_id ?? "").trim();
          if (lm && lm !== selectedMarketId) continue;
          if (ll && ll !== selectedLocaleId) continue;
          const rank = (lm ? 3 : 0) + (ll ? 3 : 0) + (link.is_primary ? 1 : 0);
          const ts = link.created_at ? Date.parse(link.created_at) || 0 : 0;
          const key = `${pid}:${slot}`;
          const ex = best.get(key);
          const tu = link.dam_assets?.thumbnail_urls;
          const directUrl = extractNonEmptyUrl(tu?.small) ?? extractNonEmptyUrl(tu?.medium) ?? extractNonEmptyUrl(tu?.large) ?? extractNonEmptyUrl(link.dam_assets?.s3_url);
          const fallback = buildAssetPreviewPath(aid);
          if (!ex || rank > ex.rank || (rank === ex.rank && ts > ex.ts)) {
            best.set(key, { rank, ts, img: { slot, assetId: aid, previewUrl: directUrl ?? fallback, fallbackPreviewUrl: fallback, filename: link.dam_assets?.filename ?? null } });
          }
        }

        const newImages: ProductFrontImage[] = [...best.values()].map((e) => e.img);
        newImages.sort((a, b) => CORE_ASSET_SLOT_ORDER.indexOf(a.slot) - CORE_ASSET_SLOT_ORDER.indexOf(b.slot));
        setCoreAssetImagesByProductId((prev) => ({ ...prev, [productId]: newImages }));
        const newIds = new Set(newImages.map((i) => i.assetId));
        setFallbackCoreAssetImageIds((prev) => new Set([...prev].filter((id) => !newIds.has(id))));
        setFailedCoreAssetImageIds((prev) => new Set([...prev].filter((id) => !newIds.has(id))));
        gridRef.current?.api?.refreshCells({ force: true });
      } catch { /* non-critical */ }
    };
  }, [tenantSlug, isPartnerAllView, normalizedSelectedBrand, buildAssetPreviewPath, selectedMarketId, selectedLocaleId]);

  useEffect(() => {
    if (coreAssetProductIds.length === 0) { setCoreAssetImagesByProductId({}); return; }
    let cancelled = false;

    const load = async () => {
      try {
        const q = new URLSearchParams({
          document_slot_codes: CORE_ASSET_SLOT_ORDER.map((s) => CORE_ASSET_SLOT_CODES[s]).join(","),
          product_ids: coreAssetProductIds.join(","),
        });
        if (isPartnerAllView) q.set("view", "all");
        if (normalizedSelectedBrand) q.set("brand", normalizedSelectedBrand);

        const res = await fetchJsonWithDedupe<{ data?: ProductLinkRecord[] }>(
          `/api/${tenantSlug}/product-links?${q}`, { ttlMs: 15_000 }
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const links = Array.isArray(res.data?.data) ? (res.data.data as ProductLinkRecord[]) : [];
        if (cancelled) return;

        const best = new Map<string, { rank: number; ts: number; img: ProductFrontImage }>();
        for (const link of links) {
          const pid = String(link.product_id ?? "").trim();
          const aid = String(link.asset_id ?? link.dam_assets?.id ?? "").trim();
          const sc = String(link.document_slot_code ?? "").trim();
          const slot = CORE_ASSET_SLOT_ORDER.find((s) => CORE_ASSET_SLOT_CODES[s] === sc);
          if (!pid || !aid || !slot) continue;

          // Scope matching
          const lm = (link.market_id ?? "").trim();
          const ll = (link.locale_id ?? "").trim();
          if (lm && lm !== selectedMarketId) continue;
          if (ll && ll !== selectedLocaleId) continue;

          const rank = (lm ? 3 : 0) + (ll ? 3 : 0) + (link.is_primary ? 1 : 0);
          const ts = link.created_at ? Date.parse(link.created_at) || 0 : 0;
          const key = `${pid}:${slot}`;
          const ex = best.get(key);
          const tu = link.dam_assets?.thumbnail_urls;
          const directUrl = extractNonEmptyUrl(tu?.small) ?? extractNonEmptyUrl(tu?.medium) ?? extractNonEmptyUrl(tu?.large) ?? extractNonEmptyUrl(link.dam_assets?.s3_url);
          const fallback = buildAssetPreviewPath(aid);

          if (!ex || rank > ex.rank || (rank === ex.rank && ts > ex.ts)) {
            best.set(key, {
              rank, ts,
              img: { slot, assetId: aid, previewUrl: directUrl ?? fallback, fallbackPreviewUrl: fallback, filename: link.dam_assets?.filename ?? null },
            });
          }
        }

        const nextMap: Record<string, ProductFrontImage[]> = {};
        for (const [key, entry] of best) {
          const [pid] = key.split(":");
          (nextMap[pid] ??= []).push(entry.img);
        }
        Object.values(nextMap).forEach((imgs) => imgs.sort((a, b) => CORE_ASSET_SLOT_ORDER.indexOf(a.slot) - CORE_ASSET_SLOT_ORDER.indexOf(b.slot)));

        setCoreAssetImagesByProductId(nextMap);
        setFallbackCoreAssetImageIds(new Set());
        setFailedCoreAssetImageIds(new Set());
      } catch (err) {
        if (!cancelled) { console.error("core asset load failed", err); setCoreAssetImagesByProductId({}); }
      }
    };

    void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coreAssetIdsKey, buildAssetPreviewPath, isPartnerAllView, normalizedSelectedBrand, tenantSlug, selectedLocaleId, selectedMarketId]);

  // ── Data: share sets + translation eligibility ────────────────────────────
  const fetchShareSetOptions = useCallback(async () => {
    setIsLoadingShareSets(true);
    setShareDialogError(null);
    try {
      const res = await fetch(`/api/${tenantSlug}/sharing/sets?module=products&page=1&pageSize=200&compact=1`);
      const payload = await res.json().catch(() => ({})) as { error?: string; data?: { product_sets?: ProductShareSetOption[] } };
      if (!res.ok) throw new Error(payload.error ?? "Failed to load saved scopes");
      const opts = payload.data?.product_sets ?? [];
      setShareSetOptions(opts);
      setSelectedShareSetId((prev) => (prev && opts.some((s) => s.id === prev) ? prev : opts[0]?.id ?? ""));
      return opts;
    } catch (err) {
      setShareDialogError(err instanceof Error ? err.message : "Failed to load saved scopes.");
      setShareSetOptions([]);
      return [];
    } finally {
      setIsLoadingShareSets(false);
    }
  }, [tenantSlug]);

  useEffect(() => { void fetchShareSetOptions(); }, [fetchShareSetOptions]);

  useEffect(() => {
    if (!filterSetId) { setSetFilterItemIds(new Set()); return; }
    setSetFilterLoading(true);
    fetch(`/api/${tenantSlug}/sharing/sets/${filterSetId}/items?limit=1000&resolve=false`)
      .then((r) => r.json())
      .then((p: { data?: { items?: Array<{ resource_id: string }> } }) => {
        setSetFilterItemIds(new Set((p.data?.items ?? []).map((i) => i.resource_id)));
      })
      .catch(() => setSetFilterItemIds(new Set()))
      .finally(() => setSetFilterLoading(false));
  }, [filterSetId, tenantSlug]);

  useEffect(() => {
    if (isSharedBrandView) return;
    let cancelled = false;
    fetch(`/api/${tenantSlug}/localization/eligibility`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (!cancelled) setCanTranslate(Boolean(p?.data?.canTranslateProduct)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isSharedBrandView, tenantSlug]);

  // ── Filtering + hierarchy ─────────────────────────────────────────────────
  const productModelOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) {
      const lbl = (p.family ?? "").trim();
      if (lbl && !m.has(lbl.toLowerCase())) m.set(lbl.toLowerCase(), lbl);
    }
    return [...m.entries()].map(([v, l]) => ({ value: v, label: l })).sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);

  const filteredAndSortedProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = products.filter((p) => {
      const ms = !q || p.productName.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)
        || (p.scin ?? "").toLowerCase().includes(q) || (p.upc ?? "").toLowerCase().includes(q);
      const mSt = filterStatus === "All" || p.status === filterStatus;
      const mv = (p.family ?? "").trim().toLowerCase();
      const mMod = filterProductModel === PRODUCT_MODEL_FILTER_ALL
        ? true : filterProductModel === PRODUCT_MODEL_FILTER_UNASSIGNED
        ? mv.length === 0 : mv === filterProductModel;
      const mSet = !filterSetId || setFilterItemIds.has(p.id);
      return ms && mSt && mMod && mSet;
    });

    // Build hierarchy
    if (!showVariantHierarchy) {
      return [...filtered].sort(compareBySortField);
    }

    const filteredIds = new Set(filtered.map((p) => p.id));
    const variantsByParent = new Map<string, PIMProduct[]>();
    filtered.forEach((p) => {
      if (isVariantProduct(p) && p.parentId) {
        (variantsByParent.get(p.parentId) ?? (variantsByParent.set(p.parentId, []), variantsByParent.get(p.parentId)!)).push(p);
      }
    });

    const result: PIMProduct[] = [];
    const seen = new Set<string>();

    filtered.forEach((p) => {
      if (seen.has(p.id)) return;
      if (isParentProduct(p)) {
        result.push(p); seen.add(p.id);
        if (expandedParents.has(p.id)) {
          const variants = variantsByParent.get(p.id) ?? [];
          variants.slice(0, MAX_INLINE_VARIANTS).forEach((v) => { result.push(v); seen.add(v.id); });
          if (variants.length > MAX_INLINE_VARIANTS) {
            result.push({
              id: `${p.id}_view_all_variants`, type: "standalone", parentId: p.id,
              productName: `View all ${variants.length} variants`, sku: "",
              assetsCount: 0, contentScore: 0, lastModified: "", lastModifiedBy: "", status: "Active",
              isViewAllLink: true,
            } as PIMProduct & { isViewAllLink: boolean });
          }
        }
      } else if (isVariantProduct(p)) {
        if (!filteredIds.has(p.parentId ?? "")) { result.push(p); seen.add(p.id); }
      } else {
        result.push(p); seen.add(p.id);
      }
    });

    // Hierarchy-aware sort
    const rowById = new Map(result.map((r) => [r.id, r]));
    return result.sort((a, b) => {
      const ag = isViewAllVariantsRow(a) ? a.parentId! : isVariantProduct(a) && rowById.has(a.parentId ?? "") ? a.parentId! : a.id;
      const bg = isViewAllVariantsRow(b) ? b.parentId! : isVariantProduct(b) && rowById.has(b.parentId ?? "") ? b.parentId! : b.id;
      if (ag !== bg) {
        const ar = rowById.get(ag) ?? a;
        const br = rowById.get(bg) ?? b;
        return compareBySortField(ar, br);
      }
      const ra = isViewAllVariantsRow(a) ? 2 : isVariantProduct(a) ? 1 : 0;
      const rb = isViewAllVariantsRow(b) ? 2 : isVariantProduct(b) ? 1 : 0;
      return ra !== rb ? ra - rb : compareBySortField(a, b);
    });

    function compareBySortField(a: PIMProduct, b: PIMProduct): number {
      if (sortField === "contentScore") {
        const as = normalizeScore(Number.isFinite(scoresRef.current[a.id]) ? scoresRef.current[a.id] : a.contentScore);
        const bs = normalizeScore(Number.isFinite(scoresRef.current[b.id]) ? scoresRef.current[b.id] : b.contentScore);
        return sortDirection === "asc" ? as - bs : bs - as;
      }
      const av = a[sortField]; const bv = b[sortField];
      let cmp = 0;
      if (typeof av === "string" && typeof bv === "string") cmp = av.toLowerCase().localeCompare(bv.toLowerCase());
      else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = 1;
      else if (bv == null) cmp = -1;
      else cmp = String(av).localeCompare(String(bv));
      return sortDirection === "asc" ? cmp : -cmp;
    }
  }, [products, searchQuery, filterStatus, filterProductModel, filterSetId, setFilterItemIds, showVariantHierarchy, expandedParents, sortField, sortDirection]);

  const realProductIds = useMemo(() => new Set(products.map((p) => p.id)), [products]);

  const selectableProductIds = useMemo(
    () => filteredAndSortedProducts.filter((p) => realProductIds.has(p.id) && !isSharedRow(p)).map((p) => p.id),
    [filteredAndSortedProducts, isSharedRow, realProductIds]
  );

  // Keep selectableIdsRef in sync
  useEffect(() => { selectableIdsRef.current = selectableProductIds; }, [selectableProductIds]);

  // ── Family field IDs: fetch field-group assignments for visible product families ──
  // Deduplicate family IDs from visible rows, skip synthetic rows, fetch in parallel.
  const visibleFamilyIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const p of filteredAndSortedProducts) {
      // Skip synthetic "view all variants" rows and products without a family
      if ((p as PIMProduct & { isViewAllLink?: boolean }).isViewAllLink) continue;
      if (p.familyId) ids.add(p.familyId);
    }
    return [...ids].sort().join(",");
  }, [filteredAndSortedProducts]);

  useEffect(() => {
    if (!visibleFamilyIdsKey) {
      setFamilyFieldMap(new Map());
      return;
    }
    const familyIds = visibleFamilyIdsKey.split(",").filter(Boolean);
    let cancelled = false;

    const load = async () => {
      // Build familyId → Set<product_field_id> for each visible family
      const nextMap = new Map<string, Set<string>>();
      await Promise.all(
        familyIds.map(async (familyId) => {
          try {
            const res = await fetch(`/api/${tenantSlug}/product-families/${familyId}/field-groups`);
            if (!res.ok) return;
            const data = await res.json() as unknown[];
            if (cancelled) return;
            const fieldIds = new Set<string>();
            for (const entry of (data as Array<Record<string, unknown>>)) {
              const fg = entry.field_groups as Record<string, unknown> | undefined;
              const assignments = Array.isArray(fg?.product_field_group_assignments)
                ? fg.product_field_group_assignments as Array<Record<string, unknown>>
                : [];
              for (const a of assignments) {
                const fid = String(a.product_field_id ?? "").trim();
                if (fid) fieldIds.add(fid);
              }
            }
            nextMap.set(familyId, fieldIds);
          } catch {
            // non-critical — family just won't appear in the Attributes picker
          }
        })
      );
      if (!cancelled) setFamilyFieldMap(nextMap);
    };

    void load();
    return () => { cancelled = true; };
  }, [visibleFamilyIdsKey, tenantSlug]);

  const selectedShareableProducts = useMemo(
    () => products.filter((p) => selectedProductIds.has(p.id) && !isSharedRow(p)),
    [isSharedRow, products, selectedProductIds]
  );

  const exportableProductIds = useMemo(() => {
    const sel = [...selectedProductIds].filter((id) => selectableProductIds.includes(id));
    return sel.length > 0 ? sel : selectableProductIds;
  }, [selectableProductIds, selectedProductIds]);

  // ── Selection handlers ────────────────────────────────────────────────────
  const handleProductSelect = useCallback((productId: string, e?: React.MouseEvent | React.ChangeEvent) => {
    (e as React.MouseEvent | undefined)?.stopPropagation?.();
    const product = productsRef.current.find((p) => p.id === productId);
    if (!product || isSharedRow(product)) return;

    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      const currently = next.has(productId);
      if (isParentProduct(product)) {
        const variants = productsRef.current.filter((p) => p.parentId === productId);
        if (currently) { next.delete(productId); variants.forEach((v) => next.delete(v.id)); }
        else { next.add(productId); variants.forEach((v) => next.add(v.id)); }
      } else {
        if (currently) {
          next.delete(productId);
          if (isVariantProduct(product) && product.parentId) {
            const siblings = productsRef.current.filter((p) => p.parentId === product.parentId);
            if (!siblings.some((v) => next.has(v.id))) next.delete(product.parentId);
          }
        } else {
          next.add(productId);
          if (isVariantProduct(product) && product.parentId) {
            const siblings = productsRef.current.filter((p) => p.parentId === product.parentId);
            if (siblings.every((v) => next.has(v.id))) next.add(product.parentId);
          }
        }
      }
      return next;
    });
  }, [isSharedRow]);

  const handleSelectAll = useCallback(() => {
    const selectable = selectableIdsRef.current;
    const allSelected = selectable.length > 0 && selectable.every((id) => selectedIdsRef.current.has(id));
    setSelectedProductIds(allSelected ? new Set() : new Set(selectable));
    setShareStatusMessage(null); setBulkScopeStatusMessage(null);
    setBulkDeleteError(null); setBulkDeleteStatusMessage(null);
  }, []);

  // Keep handleSelectAllRef updated
  useEffect(() => { handleSelectAllRef.current = handleSelectAll; }, [handleSelectAll]);

  const handleClearSelection = useCallback(() => {
    setSelectedProductIds(new Set());
    setShareStatusMessage(null); setBulkScopeStatusMessage(null);
    setBulkDeleteError(null); setBulkDeleteStatusMessage(null);
  }, []);

  const toggleParentExpansion = useCallback((parentId: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      next.has(parentId) ? next.delete(parentId) : next.add(parentId);
      return next;
    });
  }, []);

  // ── Status change ──────────────────────────────────────────────────────────
  const handleStatusChange = useCallback(async (product: Partial<PIMProduct>, status: ProductStatus) => {
    if (!product.id || isSharedRow(product)) return;
    try {
      const q = new URLSearchParams();
      if (normalizedSelectedBrand) q.set("brand", normalizedSelectedBrand);
      const url = q.toString() ? `/api/${tenantSlug}/products/${product.id}?${q}` : `/api/${tenantSlug}/products/${product.id}`;
      const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!res.ok) {
        const payload = await res.json().catch(() => null) as ErrorPayload | null;
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, status } : p));
    } catch (err) { console.error("Status update failed:", err); }
  }, [isSharedRow, normalizedSelectedBrand, tenantSlug]);

  // Keep onStatusChangeRef updated
  useEffect(() => { onStatusChangeRef.current = handleStatusChange; }, [handleStatusChange]);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const openDeleteDialogForProducts = useCallback((toDelete: PIMProduct[]) => {
    const filtered = toDelete.filter((p) => !isSharedRow(p));
    if (filtered.length === 0) return;
    setPendingDeleteProducts(filtered);
    setBulkDeleteError(null); setBulkDeleteStatusMessage(null);
    setShareStatusMessage(null); setBulkScopeStatusMessage(null);
    setShowDeleteDialog(true);
  }, [isSharedRow]);

  const handleBulkDelete = useCallback(() => {
    if (selectedShareableProducts.length === 0 || bulkDeleteSubmitting) return;
    openDeleteDialogForProducts(selectedShareableProducts);
  }, [bulkDeleteSubmitting, openDeleteDialogForProducts, selectedShareableProducts]);

  const handleConfirmDelete = useCallback(async () => {
    if (pendingDeleteProducts.length === 0 || bulkDeleteSubmitting) return;
    setBulkDeleteSubmitting(true); setBulkDeleteError(null); setBulkDeleteStatusMessage(null);
    try {
      const deletedIds = new Set<string>();
      const failures: Array<{ name: string; message: string }> = [];
      const queue = [...pendingDeleteProducts].sort((a, b) => {
        const rank = (p: PIMProduct) => isVariantProduct(p) ? 0 : isStandaloneProduct(p) ? 1 : 2;
        return rank(a) - rank(b);
      });
      for (const p of queue) {
        const q = new URLSearchParams();
        if (normalizedSelectedBrand) q.set("brand", normalizedSelectedBrand);
        const url = q.toString() ? `/api/${tenantSlug}/products/${p.id}?${q}` : `/api/${tenantSlug}/products/${p.id}`;
        const res = await fetch(url, { method: "DELETE" });
        if (res.ok) { deletedIds.add(p.id); continue; }
        const payload = await res.json().catch(() => null) as ErrorPayload | null;
        failures.push({ name: p.productName ?? p.id, message: payload?.error ?? `HTTP ${res.status}` });
      }
      if (deletedIds.size > 0) {
        setProducts((prev) => prev.filter((p) => !deletedIds.has(p.id)));
        setSelectedProductIds((prev) => { const next = new Set(prev); deletedIds.forEach((id) => next.delete(id)); return next; });
        setBulkDeleteStatusMessage(`Deleted ${deletedIds.size} product${deletedIds.size === 1 ? "" : "s"}.`);
      }
      if (failures.length > 0) {
        const preview = failures.slice(0, 3).map((f) => `${f.name}: ${f.message}`).join(" | ");
        setBulkDeleteError(`Could not delete ${failures.length} product${failures.length === 1 ? "" : "s"}: ${preview}${failures.length > 3 ? ` (+${failures.length - 3} more)` : ""}`);
      }
      setShowDeleteDialog(false); setPendingDeleteProducts([]);
    } catch (err) {
      setBulkDeleteError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBulkDeleteSubmitting(false);
    }
  }, [bulkDeleteSubmitting, normalizedSelectedBrand, pendingDeleteProducts, tenantSlug]);

  // ── Share handlers ─────────────────────────────────────────────────────────
  const clearShareScopeConstraints = useCallback(() => { setShareMarketIds([]); setShareLocaleIds([]); }, []);

  const openShareDialog = useCallback(async () => {
    if (isSharedBrandView || selectedShareableProducts.length === 0) return;
    setShareDialogError(null); setShareStatusMessage(null); setNewShareSetName(""); clearShareScopeConstraints();
    setIsShareDialogOpen(true);
    if (shareSetOptions.length === 0) await fetchShareSetOptions();
  }, [clearShareScopeConstraints, fetchShareSetOptions, isSharedBrandView, selectedShareableProducts.length, shareSetOptions.length]);

  const handleCreateShareSetInline = useCallback(async () => {
    const name = newShareSetName.trim();
    if (!name) { setShareDialogError("Enter a saved scope name."); return; }
    setIsCreatingShareSet(true); setShareDialogError(null);
    try {
      const res = await fetch(`/api/${tenantSlug}/sharing/sets`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: "products", name }),
      });
      const payload = await res.json().catch(() => ({})) as { error?: string; data?: { id?: string; name?: string } };
      if (!res.ok) throw new Error(payload.error ?? "Failed to create saved scope.");
      const id = payload.data?.id ?? "";
      const nm = payload.data?.name ?? name;
      if (id) {
        setShareSetOptions((prev) => prev.some((s) => s.id === id) ? prev : [{ id, name: nm, product_count: 0, variant_count: 0, item_count: 0 }, ...prev]);
        setSelectedShareSetId(id);
      }
      setNewShareSetName("");
      await fetchShareSetOptions();
    } catch (err) {
      setShareDialogError(err instanceof Error ? err.message : "Failed to create saved scope.");
    } finally {
      setIsCreatingShareSet(false);
    }
  }, [fetchShareSetOptions, newShareSetName, tenantSlug]);

  const handleConfirmShareSelection = useCallback(async () => {
    if (!selectedShareSetId) { setShareDialogError("Select a saved scope first."); return; }
    if (selectedShareableProducts.length === 0) { setShareDialogError("Select at least one product."); return; }
    setIsSubmittingShare(true); setShareDialogError(null);
    try {
      const res = await fetch(`/api/${tenantSlug}/sharing/sets/${selectedShareSetId}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selectedShareableProducts.map((p) => ({ resourceType: p.type === "variant" ? "variant" : "product", resourceId: p.id, marketIds: shareMarketIds, localeIds: shareLocaleIds })) }),
      });
      const payload = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setShareStatusMessage(`Added ${selectedShareableProducts.length} product${selectedShareableProducts.length === 1 ? "" : "s"} to set.`);
      setIsShareDialogOpen(false); setSelectedProductIds(new Set());
    } catch (err) {
      setShareDialogError(err instanceof Error ? err.message : "Failed to update set.");
    } finally {
      setIsSubmittingShare(false);
    }
  }, [selectedShareSetId, selectedShareableProducts, shareLocaleIds, shareMarketIds, tenantSlug]);

  const handleRemoveFromSet = useCallback(async () => {
    if (!filterSetId || selectedShareableProducts.length === 0 || isRemovingFromSet) return;
    setIsRemovingFromSet(true); setShareStatusMessage(null);
    try {
      const res = await fetch(`/api/${tenantSlug}/sharing/sets/${filterSetId}/items`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selectedShareableProducts.map((p) => ({ resourceType: p.type === "variant" ? "variant" : "product", resourceId: p.id })) }),
      });
      const payload = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to remove from set");
      setSetFilterItemIds((prev) => { const next = new Set(prev); selectedShareableProducts.forEach((p) => next.delete(p.id)); return next; });
      setSelectedProductIds(new Set());
      setShareStatusMessage(`Removed ${selectedShareableProducts.length} item${selectedShareableProducts.length === 1 ? "" : "s"} from set.`);
    } catch (err) {
      setShareDialogError(err instanceof Error ? err.message : "Failed to remove from set.");
    } finally {
      setIsRemovingFromSet(false);
    }
  }, [filterSetId, isRemovingFromSet, selectedShareableProducts, tenantSlug]);

  const handleBulkShare = useCallback(() => { void openShareDialog(); }, [openShareDialog]);
  const handleBulkTranslate = useCallback(() => { if (!isSharedBrandView && selectedShareableProducts.length > 0) setIsTranslatePanelOpen(true); }, [isSharedBrandView, selectedShareableProducts.length]);
  const handleBulkEdit = useCallback(() => {
    // Snapshot selected rows so Cancel can revert
    const snapshot = new Map<string, PIMProduct>();
    selectedShareableProducts.forEach((p) => snapshot.set(p.id, { ...p }));
    setEditModeSnapshot(snapshot);
    setDirtyChanges(new Map());
    setIsEditMode(true);
    // Enable single-click editing
    gridRef.current?.api?.setGridOption("singleClickEdit", true);
  }, [selectedShareableProducts]);

  // ── Syndication ────────────────────────────────────────────────────────────
  const handleOpenSyndication = useCallback(() => {
    const params = new URLSearchParams();
    const ids = exportableProductIds.join(",");
    if (ids.length > 0 && ids.length <= 1500) params.set("products", ids);
    router.push(params.toString() ? `/${tenantSlug}/syndication?${params}` : `/${tenantSlug}/syndication`);
  }, [exportableProductIds, router, tenantSlug]);

  // ── CSV Export ─────────────────────────────────────────────────────────────
  const handleExportCsv = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    // Visual/computed columns that have no re-importable value
    const SKIP_COL_IDS = new Set(["entity", "contentScore", "readiness", "assetsCount"]);

    // Map colId → import-compatible field code
    const COL_EXPORT_CODE: Record<string, string> = {
      productName: "product_name",
      status: "status",
      sku: "sku",
      upc: "upc",
      scin: "scin",
      family: "family",
      lastModified: "last_modified",
      imageFront: "image_front",
      imageBack: "image_back",
      imageLeft: "image_left",
      imageRight: "image_right",
    };

    // Get visible columns in display order
    const colState = api.getColumnState();
    type ColMeta = { colId: string; code: string; label: string };
    const colMeta: ColMeta[] = [];
    for (const { colId, hide } of colState) {
      if (hide || SKIP_COL_IDS.has(colId)) continue;
      const colDef = api.getColumnDef(colId);
      if (!colDef) continue;
      const code = COL_EXPORT_CODE[colId] ?? (colId.startsWith("attr_") ? colId.slice(5) : colId);
      const label = typeof colDef.headerName === "string" && colDef.headerName.trim()
        ? colDef.headerName.trim()
        : code;
      colMeta.push({ colId, code, label });
    }

    // Build productId → scin map for parent SCIN lookup on variant rows
    const scinById = new Map<string, string>();
    api.forEachNode((node) => {
      const p = node.data as PIMProduct | undefined;
      if (p?.id && p.scin) scinById.set(p.id, p.scin);
    });

    const headers = [
      "Action [action]",
      "Type [type]",
      "Parent SCIN [parent_scin]",
      ...colMeta.map(({ label, code }) => `${label} [${code}]`),
    ];

    const rows: Array<Array<unknown>> = [];
    api.forEachNodeAfterFilterAndSort((node) => {
      if (!node.data) return;
      const product = node.data as PIMProduct;
      const parentScin = product.type === "variant" && product.parentId
        ? scinById.get(product.parentId) ?? ""
        : "";
      const row: Array<unknown> = ["update", product.type ?? "", parentScin];

      for (const { colId } of colMeta) {
        let value: unknown = "";
        if (colId === "productName") {
          value = product.productName ?? "";
        } else if (colId === "lastModified" && product.lastModified) {
          try { value = new Date(product.lastModified).toLocaleDateString(); } catch { value = product.lastModified; }
        } else if (colId === "imageFront") {
          value = coreAssetsRef.current[product.id]?.find((i) => i.slot === "front")?.assetId ?? "";
        } else if (colId === "imageBack") {
          value = coreAssetsRef.current[product.id]?.find((i) => i.slot === "back")?.assetId ?? "";
        } else if (colId === "imageLeft") {
          value = coreAssetsRef.current[product.id]?.find((i) => i.slot === "left")?.assetId ?? "";
        } else if (colId === "imageRight") {
          value = coreAssetsRef.current[product.id]?.find((i) => i.slot === "right")?.assetId ?? "";
        } else if (colId.startsWith("attr_")) {
          value = (product as unknown as Record<string, unknown>)[colId.slice(5)] ?? "";
        } else {
          value = (product as unknown as Record<string, unknown>)[colId] ?? "";
        }
        row.push(value);
      }
      rows.push(row);
    });

    const csv = buildCsv(headers, rows);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-${tenantSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [tenantSlug]);

  // ── Edit mode: dirty tracking, cancel, save ──────────────────────────────

  const onCellValueChanged = useCallback((event: CellValueChangedEvent<PIMProduct>) => {
    const productId = event.data?.id;
    const colId = event.column.getColId();
    if (!productId || !isEditModeRef.current) return;
    const key = `${productId}::${colId}`;
    setDirtyChanges((prev) => {
      const next = new Map(prev);
      // Locale-scoped columns (colId = "baseColId::localeId") have no entry in
      // editModeSnapshot — compare only against the pre-edit value from valueGetter.
      if (colId.includes("::")) {
        if (event.newValue === event.oldValue) {
          next.delete(key);
        } else {
          next.set(key, event.newValue);
        }
        return next;
      }
      // Base fields: compare against the snapshot to detect reverts
      const original = editModeSnapshot.get(productId);
      const originalField = colId.startsWith("attr_") ? colId.slice(5) : COL_TO_FIELD[colId];
      const originalValue = original ? (original as unknown as Record<string, unknown>)[originalField ?? colId] : undefined;
      if (event.newValue === originalValue || event.newValue === event.oldValue) {
        next.delete(key);
      } else {
        next.set(key, event.newValue);
      }
      return next;
    });
    // Re-render cell to update dirty styling
    event.api.refreshCells({ rowNodes: [event.node], columns: [colId], force: true });
  }, [editModeSnapshot]);

  const handleCancelEdit = useCallback(() => {
    const api = gridRef.current?.api;
    // Stop any active cell editor first
    api?.stopEditing(true);
    // Revert dirty rows to their snapshot values
    if (dirtyChanges.size > 0 && api) {
      const updates: PIMProduct[] = [];
      editModeSnapshot.forEach((originalProduct) => {
        updates.push(originalProduct);
      });
      if (updates.length > 0) api.applyTransaction({ update: updates });
    }
    setDirtyChanges(new Map());
    setEditModeSnapshot(new Map());
    setIsEditMode(false);
    api?.setGridOption("singleClickEdit", false);
    api?.refreshCells({ force: true });
  }, [dirtyChanges.size, editModeSnapshot]);

  const handleSaveEdits = useCallback(async () => {
    if (dirtyChanges.size === 0) return;
    setIsSaving(true);

    // Bucket 1: system/content base fields → per-product PATCH (products table)
    const byProduct = new Map<string, Record<string, unknown>>();
    // Bucket 2: scoped content fields + custom attr fields → bulk-field-update
    type BulkChange = { productId: string; fieldCode: string; value: unknown; scope?: { localeId?: string } };
    const bulkChanges: BulkChange[] = [];

    dirtyChanges.forEach((value, key) => {
      // key = "${productId}::${colId}" where colId may itself contain "::" for locale cols
      const firstSep = key.indexOf("::");
      const productId = key.slice(0, firstSep);
      const colId = key.slice(firstSep + 2);

      // Locale-scoped column: colId = "${baseColId}::${localeId}"
      if (colId.includes("::")) {
        const innerSep = colId.indexOf("::");
        const baseColId = colId.slice(0, innerSep);
        const localeId = colId.slice(innerSep + 2);
        const fieldCode = COL_TO_FIELD[baseColId]
          ?? (baseColId.startsWith("attr_") ? baseColId.slice(5) : null);
        if (fieldCode) {
          bulkChanges.push({ productId, fieldCode, value, scope: { localeId } });
        }
        return;
      }

      // Custom attribute field (base, no scope)
      if (colId.startsWith("attr_")) {
        const fieldCode = colId.slice(5);
        // Skip fields not applicable to this product's family
        const product = editModeSnapshot.get(productId);
        const pf = productFields.find((f) => f.code === fieldCode);
        if (pf && product?.familyId && !familyFieldMapRef.current.get(product.familyId)?.has(pf.id)) return;
        bulkChanges.push({ productId, fieldCode, value });
        return;
      }

      // System / content base field (products table)
      const field = COL_TO_FIELD[colId];
      if (!field) return;
      const changes = byProduct.get(productId) ?? {};
      changes[field] = value;
      byProduct.set(productId, changes);
    });

    let savedCount = 0;
    let failedCount = 0;
    const saveErrors: string[] = [];

    // Save system base fields via per-product PATCH
    const systemRequests = Array.from(byProduct.entries()).map(async ([productId, changes]) => {
      try {
        const res = await fetch(`/api/${tenantSlug}/products/${productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        });
        if (res.ok) {
          savedCount++;
        } else {
          failedCount++;
          const body = await res.json().catch(() => ({})) as { error?: string };
          saveErrors.push(body.error ?? `HTTP ${res.status}`);
        }
      } catch (err) {
        failedCount++;
        saveErrors.push(err instanceof Error ? err.message : "Network error");
      }
    });

    // Save scoped / custom fields via bulk-field-update
    const bulkRequest = bulkChanges.length > 0
      ? (async () => {
          try {
            const res = await fetch(`/api/${tenantSlug}/products/bulk-field-update`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ changes: bulkChanges }),
            });
            if (res.ok) {
              const body = await res.json() as {
                ok: boolean; applied: number;
                failed: Array<{ productId: string; fieldCode: string; error: string }>;
              };
              savedCount += body.applied;
              if (body.failed?.length) {
                failedCount += body.failed.length;
                saveErrors.push(...body.failed.map((f) => `${f.fieldCode}: ${f.error}`));
              }
            } else {
              failedCount++;
              const body = await res.json().catch(() => ({})) as { error?: string };
              saveErrors.push(body.error ?? `HTTP ${res.status}`);
            }
          } catch (err) {
            failedCount++;
            saveErrors.push(err instanceof Error ? err.message : "Network error");
          }
        })()
      : Promise.resolve();

    await Promise.all([...systemRequests, bulkRequest]);

    if (failedCount === 0) {
      // Success: exit edit mode, grid data is already updated in-place
      setDirtyChanges(new Map());
      setEditModeSnapshot(new Map());
      setIsEditMode(false);
      gridRef.current?.api?.setGridOption("singleClickEdit", false);
      gridRef.current?.api?.refreshCells({ force: true });
    } else {
      // Partial failure — stay in edit mode so user can retry
      console.error("[handleSaveEdits] Save errors:", saveErrors);
    }
    setIsSaving(false);
  }, [dirtyChanges, tenantSlug, editModeSnapshot, productFields]);

  // ── AG Grid column state persistence ─────────────────────────────────────
  const colStateKey = `pim-grid-cols-${tenantSlug}`;

  const saveColumnState = useCallback(() => {
    try {
      const state = gridRef.current?.api?.getColumnState();
      if (state) localStorage.setItem(colStateKey, JSON.stringify(state));
    } catch { /* non-critical */ }
  }, [colStateKey]);

  const onGridReady = useCallback((event: GridReadyEvent) => {
    try {
      const saved = localStorage.getItem(colStateKey);
      if (saved) {
        const state = JSON.parse(saved) as ColumnState[];
        event.api.applyColumnState({ state, applyOrder: true });
        // Sync visibility state from saved column state so the picker reflects reality
        const visibilityUpdate: Record<string, boolean> = {};
        for (const col of state) {
          if (col.colId && col.colId in DEFAULT_VISIBLE_COLUMNS) {
            visibilityUpdate[col.colId] = !col.hide;
          }
        }
        if (Object.keys(visibilityUpdate).length > 0) {
          setColumnVisibility((prev) => ({ ...prev, ...visibilityUpdate }));
          const readinessCol = state.find((c) => c.colId === "readiness");
          if (readinessCol && !readinessCol.hide) setReadinessVisible(true);
        }
      }
    } catch { /* non-critical */ }
  }, [colStateKey]);

  // Re-apply saved column state when custom attribute columns are added to the grid
  // (productFields loads async; by then onGridReady has already run)
  useEffect(() => {
    if (productFields.length === 0) return;
    const api = gridRef.current?.api;
    if (!api) return;
    try {
      const saved = localStorage.getItem(colStateKey);
      if (!saved) return;
      const state = JSON.parse(saved) as ColumnState[];
      // Only apply state for attr_ columns to avoid disrupting current sort/order
      const attrState = state.filter((c) => c.colId?.startsWith("attr_"));
      if (attrState.length === 0) return;
      api.applyColumnState({ state: attrState });
      // Sync picker UI for these columns
      const visibilityUpdate: Record<string, boolean> = {};
      for (const col of attrState) {
        if (col.colId) visibilityUpdate[col.colId] = !col.hide;
      }
      setColumnVisibility((prev) => ({ ...prev, ...visibilityUpdate }));
    } catch { /* non-critical */ }
  }, [productFields, colStateKey]);

  const onSortChanged = useCallback((event: SortChangedEvent) => {
    const col = event.api.getColumnState().find((c) => c.sort);
    if (col?.colId && col.sort) {
      setSortField(col.colId as keyof PIMProduct);
      setSortDirection(col.sort as "asc" | "desc");
    }
    saveColumnState();
  }, [saveColumnState]);

  const onColumnVisible = useCallback((event: ColumnVisibleEvent) => {
    if (event.column?.getColId() === "readiness") {
      setReadinessVisible(event.column.isVisible());
    }
    saveColumnState();
  }, [saveColumnState]);

  const handleToggleColumn = useCallback((colId: string, visible: boolean) => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setColumnsVisible([colId], visible);
    setColumnVisibility((prev) => ({ ...prev, [colId]: visible }));
    if (colId === "readiness") setReadinessVisible(visible);
    saveColumnState();
  }, [saveColumnState]);

  // Phase 3: add/remove locale-scoped sibling columns
  const addLocaleColumn = useCallback((baseColId: string, fieldCode: string, localeId: string, localeName: string) => {
    const colId = `${baseColId}::${localeId}`;
    setLocaleColumns((prev) => prev.find((c) => c.colId === colId) ? prev : [...prev, { baseColId, fieldCode, localeId, localeName, colId }]);
  }, []);

  const removeLocaleColumn = useCallback((colId: string) => {
    setLocaleColumns((prev) => prev.filter((c) => c.colId !== colId));
    // Clear any dirty changes for this scoped column
    setDirtyChanges((prev) => {
      const next = new Map(prev);
      for (const key of [...next.keys()]) {
        if (key.endsWith(`::${colId}`)) next.delete(key);
      }
      return next;
    });
  }, []);

  const onRowClicked = useCallback((event: RowClickedEvent<PIMProduct>) => {
    const product = event.data;
    if (!product) return;

    // In edit mode row clicks activate the cell editor — don't navigate
    if (isEditModeRef.current) return;

    // Skip interactive elements — they handle their own clicks
    const target = event.event?.target as HTMLElement | null;
    if (target?.closest("button, input, select, a, [role='combobox'], [data-radix-popper-content-wrapper]")) return;

    if (isViewAllVariantsRow(product)) {
      const parent = productsRef.current.find((p) => p.id === product.parentId);
      if (parent) onProductClick?.(parent, { section: "variants" });
      return;
    }

    onProductClick?.(product);
  }, [onProductClick]);

  // ── Context ────────────────────────────────────────────────────────────────
  const gridContext = useMemo<GridContext>(() => ({
    selectedIdsRef, expandedParentsRef, coreAssetsRef, fallbackAssetsRef, failedAssetsRef,
    scoresRef, readinessRef, primaryProfileRef, showHierarchyRef, productsRef,
    selectableIdsRef, handleSelectAllRef, onStatusChangeRef,
    isSharedRowFn: isSharedRow,
    onToggleExpand: toggleParentExpansion,
    onSelect: handleProductSelect,
    onDeleteSingle: openDeleteDialogForProducts,
    onProductClick,
    tenantSlugRef,
    refreshProductAssetsRef,
  }), [isSharedRow, toggleParentExpansion, handleProductSelect, openDeleteDialogForProducts, onProductClick]);

  // ── Column definitions ─────────────────────────────────────────────────────
  // flex values distribute remaining space proportionally after fixed columns.
  // entity (36px fixed) + assets (~180px fixed) ≈ 216px reserved;
  // everything else stretches to fill the container.
  //
  // Custom attribute columns from product_fields are appended dynamically;
  // they start hidden and are revealed via the column picker.
  const columnDefs = useMemo<ColDef<PIMProduct>[]>(() => {
    // Shared helpers for edit mode
    const isEditable = (params: { data?: PIMProduct | null; column?: { getColId: () => string } }): boolean => {
      if (!isEditModeRef.current) return false;
      if (!params.data) return false;
      const colId = params.column?.getColId() ?? "";
      if (NON_EDITABLE_COLS.has(colId)) return false;
      return selectedIdsRef.current.has(params.data.id);
    };

    const dirtyCellStyle = (params: CellClassParams<PIMProduct>): CellStyle | null | undefined => {
      if (!params.data?.id || !params.column) return null;
      const key = `${params.data.id}::${params.column.getColId()}`;
      if (dirtyChangesRef.current.has(key)) {
        return { borderLeft: "3px solid #f59e0b", paddingLeft: "9px" };
      }
      return null;
    };

    const coreColDefs: ColDef<PIMProduct>[] = [
      {
        colId: "entity", headerName: "", field: "type", cellRenderer: EntityBadgeRenderer,
        width: 36, minWidth: 36, maxWidth: 36,
        resizable: false, sortable: false, lockVisible: true, suppressMovable: true,
        editable: false,
      },
      {
        // Widest column — product name + hierarchy controls + checkbox
        colId: "productName", field: "productName", cellRenderer: NameCellRenderer,
        headerComponent: SelectAllHeaderRenderer,
        minWidth: 220, width: 260,
        sortable: true, comparator: () => 0, lockVisible: true,
        editable: isEditable, cellStyle: dirtyCellStyle,
      },
      {
        colId: "status", headerName: "Status", field: "status", cellRenderer: StatusCellRenderer,
        minWidth: 120, width: 150, sortable: true, comparator: () => 0, hide: !DEFAULT_VISIBLE_COLUMNS.status,
        editable: isEditable, cellStyle: dirtyCellStyle,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: PRODUCT_STATUSES },
      },
      {
        colId: "sku", headerName: "SKU", field: "sku",
        minWidth: 90, width: 130, sortable: true, comparator: () => 0, hide: !DEFAULT_VISIBLE_COLUMNS.sku,
        editable: isEditable, cellStyle: dirtyCellStyle,
      },
      {
        colId: "upc", headerName: "Barcode", field: "upc",
        minWidth: 100, width: 130, sortable: true, comparator: () => 0, hide: !DEFAULT_VISIBLE_COLUMNS.upc,
        editable: isEditable, cellStyle: dirtyCellStyle,
      },
      {
        colId: "scin", headerName: "SCIN", field: "scin",
        minWidth: 80, width: 110, sortable: true, comparator: () => 0, hide: !DEFAULT_VISIBLE_COLUMNS.scin,
        editable: isEditable, cellStyle: dirtyCellStyle,
      },
      {
        colId: "family", headerName: "Family", field: "family",
        minWidth: 100, width: 130, sortable: true, comparator: () => 0, hide: !DEFAULT_VISIBLE_COLUMNS.family,
        editable: false,
      },
      {
        colId: "contentScore", headerName: "Complete", field: "contentScore",
        cellRenderer: ContentScoreCellRenderer,
        minWidth: 130, width: 160, sortable: true, comparator: () => 0, hide: !DEFAULT_VISIBLE_COLUMNS.contentScore,
        editable: false,
      },
      // Hidden by default — revealed via column panel
      {
        colId: "readiness", headerName: "Readiness", cellRenderer: ReadinessCellRenderer,
        minWidth: 130, width: 160, sortable: false, hide: !DEFAULT_VISIBLE_COLUMNS.readiness,
        editable: false,
      },
      {
        colId: "assetsCount", headerName: "Assets #", field: "assetsCount",
        minWidth: 70, width: 90, sortable: true, comparator: () => 0, hide: !DEFAULT_VISIBLE_COLUMNS.assetsCount,
        editable: false,
      },
      {
        colId: "lastModified", headerName: "Modified", field: "lastModified",
        valueFormatter: (p) => { try { return p.value ? new Date(p.value as string).toLocaleDateString() : "—"; } catch { return "—"; } },
        minWidth: 90, width: 110, sortable: true, comparator: () => 0, hide: !DEFAULT_VISIBLE_COLUMNS.lastModified,
        editable: false,
      },
      // ── Image slot columns — drag-drop / click-to-upload ──────────────────
      {
        colId: "imageFront", headerName: "Front", cellRenderer: ImageFrontRenderer,
        width: 120, minWidth: 120, maxWidth: 160, sortable: false,
        hide: !DEFAULT_VISIBLE_COLUMNS.imageFront, editable: false,
      },
      {
        colId: "imageBack", headerName: "Back", cellRenderer: ImageBackRenderer,
        width: 120, minWidth: 120, maxWidth: 160, sortable: false,
        hide: !DEFAULT_VISIBLE_COLUMNS.imageBack, editable: false,
      },
      {
        colId: "imageLeft", headerName: "Left", cellRenderer: ImageLeftRenderer,
        width: 120, minWidth: 120, maxWidth: 160, sortable: false,
        hide: !DEFAULT_VISIBLE_COLUMNS.imageLeft, editable: false,
      },
      {
        colId: "imageRight", headerName: "Right", cellRenderer: ImageRightRenderer,
        width: 120, minWidth: 120, maxWidth: 160, sortable: false,
        hide: !DEFAULT_VISIBLE_COLUMNS.imageRight, editable: false,
      },
    ];

    // ── Locale-scoped sibling columns (Phase 3) ───────────────────────────
    // One ColDef per LocaleCol entry. Values come from scopedFieldValuesRef (fetched via grid-data API).
    const localeColDefs: ColDef<PIMProduct>[] = localeColumns.map((lc): ColDef<PIMProduct> => ({
      colId: lc.colId,
      headerName: `${lc.colId.startsWith("attr_")
        ? (productFields.find((f) => `attr_${f.code}` === lc.baseColId)?.name ?? lc.fieldCode)
        : (COLUMN_PICKER_SECTIONS.flatMap((s) => s.items).find((i) => i.colId === lc.baseColId)?.label ?? lc.fieldCode)
      } (${cleanLocaleName(lc.localeName)})`,
      valueGetter: (params) => {
        if (!params.data?.id) return null;
        return scopedFieldValuesRef.current[params.data.id]?.[`${lc.fieldCode}::${lc.localeId}`] ?? null;
      },
      valueSetter: (params) => {
        if (!params.data?.id) return false;
        // Update ref synchronously so valueGetter sees the new value immediately.
        // AG Grid calls valueGetter after the setter to build event.newValue for
        // onCellValueChanged; without this the ref is stale and newValue === oldValue.
        const scopeKey = `${lc.fieldCode}::${lc.localeId}`;
        scopedFieldValuesRef.current = {
          ...scopedFieldValuesRef.current,
          [params.data.id]: {
            ...(scopedFieldValuesRef.current[params.data.id] ?? {}),
            [scopeKey]: params.newValue,
          },
        };
        setScopedFieldValues(scopedFieldValuesRef.current);
        return true;
      },
      valueFormatter: (p) => p.value != null && p.value !== "" ? String(p.value) : "—",
      editable: isEditable,
      cellStyle: dirtyCellStyle,
      minWidth: 160, width: 200, sortable: false, hide: false,
    }));

    // Dynamically append custom attribute field columns (all hidden by default).
    // Locked fields are never editable. Fields not assigned to a product's family
    // are also non-editable and visually muted so users can't enter inapplicable values.
    const customColDefs: ColDef<PIMProduct>[] = productFields
      .filter(isOrgAttribute)
      .map((f): ColDef<PIMProduct> => {
        const fieldId = f.id;

        const isApplicable = (product: PIMProduct): boolean => {
          if (!product.familyId) return false;
          return familyFieldMapRef.current.get(product.familyId)?.has(fieldId) ?? false;
        };

        return {
          colId: `attr_${f.code}`,
          headerName: f.name,
          valueGetter: (params) => {
            if (!params.data) return null;
            const raw = (params.data as unknown as Record<string, unknown>)[f.code];
            return raw ?? null;
          },
          valueFormatter: (params) => {
            const v = params.value;
            if (v === null || v === undefined) return "—";
            if (typeof v === "boolean") return v ? "Yes" : "No";
            if (typeof v === "object") return JSON.stringify(v);
            return String(v);
          },
          editable: f.is_locked
            ? false
            : (params) => isEditable(params) && !!params.data && isApplicable(params.data),
          cellStyle: (params: CellClassParams<PIMProduct>): CellStyle | null | undefined => {
            if (!params.data?.id || !params.column) return null;
            const key = `${params.data.id}::${params.column.getColId()}`;
            if (dirtyChangesRef.current.has(key)) {
              return { borderLeft: "3px solid #f59e0b", paddingLeft: "9px" };
            }
            if (isEditModeRef.current && !isApplicable(params.data)) {
              return { backgroundColor: "#f3f4f6", color: "#9ca3af", cursor: "not-allowed" };
            }
            return null;
          },
          minWidth: 120, width: 160, sortable: false, hide: true,
        };
      });

    return [...coreColDefs, ...localeColDefs, ...customColDefs];
  }, [productFields, familyFieldMap, localeColumns]);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    suppressMovable: false,
  }), []);

  // In edit mode, show only the products being edited
  const gridRowData = useMemo(() => {
    if (!isEditMode) return filteredAndSortedProducts;
    return filteredAndSortedProducts.filter((p) => editModeSnapshot.has(p.id));
  }, [isEditMode, filteredAndSortedProducts, editModeSnapshot]);


  // ── Filter label helpers ───────────────────────────────────────────────────
  const statusFilterLabel = filterStatus === "All" ? "Status" : filterStatus;
  const modelFilterLabel = filterProductModel === PRODUCT_MODEL_FILTER_ALL ? "Model"
    : filterProductModel === PRODUCT_MODEL_FILTER_UNASSIGNED ? "Unassigned"
    : productModelOptions.find((m) => m.value === filterProductModel)?.label ?? "Model";
  const shareMarketOptions = useMemo<ScopeConstraintOption[]>(
    () => markets.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` })), [markets]
  );
  const shareLocaleOptions = useMemo<ScopeConstraintOption[]>(
    () => locales.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` })), [locales]
  );

  const stats = useMemo(() => ({
    total: products.length,
    parents: products.filter(isParentProduct).length,
    variants: products.filter(isVariantProduct).length,
    standalone: products.filter(isStandaloneProduct).length,
    active: products.filter((p) => p.status === "Active").length,
    draft: products.filter((p) => p.status === "Draft").length,
  }), [products]);

  // ── Column picker dropdown — shared between view toolbar and edit mode bar ─
  const columnPickerDropdown = (align: "start" | "end") => (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" size="sm"
          className="h-8 gap-1.5 border-0 bg-transparent px-3 shadow-none hover:bg-[var(--color-secondary-button-hover)]"
          title="Show or hide columns"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="text-xs">Columns</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-[220px] max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-white p-1 shadow-lg text-sm"
        >
          {/* System + Content sections */}
          {COLUMN_PICKER_SECTIONS.map((section, si) => (
            <React.Fragment key={section.label}>
              {si > 0 && <DropdownMenu.Separator className="my-1 border-t border-border" />}
              <DropdownMenu.Label className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.label}
              </DropdownMenu.Label>
              {section.items.map(({ colId, label }) => {
                // Locale eligibility: scope_policy ('locale'|'mixed') supersedes is_localizable boolean
                const fieldCode = COL_TO_FIELD[colId] ?? colId;
                const productField = productFields.find((pf) => pf.code === fieldCode);
                const isLocalizable =
                  productField?.scope_policy === "locale" ||
                  productField?.scope_policy === "mixed" ||
                  productField?.is_localizable === true;
                const activeLocales = isLocalizable ? localeColumns.filter((c) => c.baseColId === colId) : [];
                return (
                  <React.Fragment key={colId}>
                    <DropdownMenu.CheckboxItem
                      checked={columnVisibility[colId] ?? DEFAULT_VISIBLE_COLUMNS[colId as keyof typeof DEFAULT_VISIBLE_COLUMNS]}
                      onCheckedChange={(checked) => handleToggleColumn(colId, Boolean(checked))}
                      onSelect={(e) => e.preventDefault()}
                      className="relative flex cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-3 text-sm outline-none focus:bg-muted/50 data-[highlighted]:bg-muted/50"
                    >
                      <DropdownMenu.ItemIndicator className="absolute left-2 flex items-center justify-center">
                        <Check className="h-3.5 w-3.5" />
                      </DropdownMenu.ItemIndicator>
                      <span className="flex-1">{label}</span>
                      {isLocalizable && <span className="ml-1.5 text-[11px] text-muted-foreground">🌐</span>}
                    </DropdownMenu.CheckboxItem>
                    {/* Active locale columns for this field — uncheck to remove */}
                    {activeLocales.map((lc) => (
                      <DropdownMenu.CheckboxItem
                        key={lc.colId}
                        checked={true}
                        onCheckedChange={() => removeLocaleColumn(lc.colId)}
                        onSelect={(e) => e.preventDefault()}
                        className="relative flex cursor-default select-none items-center rounded-md py-1.5 pl-12 pr-3 text-xs text-muted-foreground outline-none focus:bg-muted/50 data-[highlighted]:bg-muted/50"
                      >
                        <DropdownMenu.ItemIndicator className="absolute left-6 flex items-center justify-center">
                          <Check className="h-3 w-3" />
                        </DropdownMenu.ItemIndicator>
                        {cleanLocaleName(lc.localeName)}
                      </DropdownMenu.CheckboxItem>
                    ))}
                    {/* "Add locale" items — all org locales (locale-first: no market filter) */}
                    {isLocalizable && locales
                      .filter((l) => !activeLocales.find((lc) => lc.localeId === l.id))
                      .map((l) => (
                        <DropdownMenu.Item
                          key={`add-${colId}-${l.id}`}
                          onSelect={(e) => {
                            e.preventDefault();
                            addLocaleColumn(colId, fieldCode, l.id, cleanLocaleName(l.name, l.code));
                          }}
                          className="relative flex cursor-default select-none items-center rounded-md py-1.5 pl-12 pr-3 text-xs text-muted-foreground outline-none focus:bg-muted/50 data-[highlighted]:bg-muted/50"
                        >
                          <span className="mr-1 opacity-50">+</span> {cleanLocaleName(l.name, l.code)}
                        </DropdownMenu.Item>
                      ))
                    }
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          ))}

          {/* Attribute fields — scoped to families of currently visible products */}
          {productFields.filter((f) => isOrgAttribute(f) && visibleFamilyFieldIds.has(f.id)).length > 0 && (
            <>
              <DropdownMenu.Separator className="my-1 border-t border-border" />
              <DropdownMenu.Label className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Attributes
              </DropdownMenu.Label>
              {productFields.filter((f) => isOrgAttribute(f) && visibleFamilyFieldIds.has(f.id)).map((f) => {
                const colId = `attr_${f.code}`;
                const isLocalizable =
                  f.scope_policy === "locale" ||
                  f.scope_policy === "mixed" ||
                  f.is_localizable === true;
                const activeLocales = isLocalizable ? localeColumns.filter((c) => c.baseColId === colId) : [];
                return (
                  <React.Fragment key={colId}>
                    <DropdownMenu.CheckboxItem
                      checked={columnVisibility[colId] ?? false}
                      onCheckedChange={(checked) => handleToggleColumn(colId, Boolean(checked))}
                      onSelect={(e) => e.preventDefault()}
                      className="relative flex cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-3 text-sm outline-none focus:bg-muted/50 data-[highlighted]:bg-muted/50"
                    >
                      <DropdownMenu.ItemIndicator className="absolute left-2 flex items-center justify-center">
                        <Check className="h-3.5 w-3.5" />
                      </DropdownMenu.ItemIndicator>
                      <span className="flex-1">{f.name}</span>
                      {f.is_locked && <span className="ml-auto text-[10px] text-muted-foreground">locked</span>}
                      {isLocalizable && !f.is_locked && <span className="ml-1.5 text-[11px] text-muted-foreground">🌐</span>}
                    </DropdownMenu.CheckboxItem>
                    {/* Active locale columns for this attribute — uncheck to remove */}
                    {activeLocales.map((lc) => (
                      <DropdownMenu.CheckboxItem
                        key={lc.colId}
                        checked={true}
                        onCheckedChange={() => removeLocaleColumn(lc.colId)}
                        onSelect={(e) => e.preventDefault()}
                        className="relative flex cursor-default select-none items-center rounded-md py-1.5 pl-12 pr-3 text-xs text-muted-foreground outline-none focus:bg-muted/50 data-[highlighted]:bg-muted/50"
                      >
                        <DropdownMenu.ItemIndicator className="absolute left-6 flex items-center justify-center">
                          <Check className="h-3 w-3" />
                        </DropdownMenu.ItemIndicator>
                        {cleanLocaleName(lc.localeName)}
                      </DropdownMenu.CheckboxItem>
                    ))}
                    {/* Add locale — all org locales (locale-first: no market filter) */}
                    {isLocalizable && !f.is_locked && locales
                      .filter((l) => !activeLocales.find((lc) => lc.localeId === l.id))
                      .map((l) => (
                        <DropdownMenu.Item
                          key={`add-${colId}-${l.id}`}
                          onSelect={(e) => {
                            e.preventDefault();
                            addLocaleColumn(colId, f.code, l.id, cleanLocaleName(l.name, l.code));
                          }}
                          className="relative flex cursor-default select-none items-center rounded-md py-1.5 pl-12 pr-3 text-xs text-muted-foreground outline-none focus:bg-muted/50 data-[highlighted]:bg-muted/50"
                        >
                          <span className="mr-1 opacity-50">+</span> {cleanLocaleName(l.name, l.code)}
                        </DropdownMenu.Item>
                      ))
                    }
                  </React.Fragment>
                );
              })}
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="animate-pulse space-y-4 p-4">
        <div className="h-8 w-1/3 rounded bg-gray-200" />
        <div className="h-64 rounded bg-gray-200" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Summary</span>
        <span>Total {stats.total}</span>
        <span>Parents {stats.parents}</span>
        <span>Variants {stats.variants}</span>
        <span>Single SKU {stats.standalone}</span>
        <span>Active {stats.active}</span>
        <span>Draft {stats.draft}</span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {searchQuery ? (
            <div className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
              Filtered by &ldquo;{searchQuery}&rdquo; from header search
            </div>
          ) : null}

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 !w-auto border-0 bg-transparent px-3 shadow-none hover:bg-[var(--color-secondary-button-hover)] [&_svg]:hidden">
              <span>{statusFilterLabel}</span>
            </SelectTrigger>
            <SelectContent className="min-w-[180px]">
              <SelectItem value="All">All Status</SelectItem>
              {PRODUCT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterProductModel} onValueChange={setFilterProductModel}>
            <SelectTrigger className="h-8 !w-auto border-0 bg-transparent px-3 shadow-none hover:bg-[var(--color-secondary-button-hover)] [&_svg]:hidden">
              <span>{modelFilterLabel}</span>
            </SelectTrigger>
            <SelectContent className="min-w-[220px]">
              <SelectItem value={PRODUCT_MODEL_FILTER_ALL}>All Families</SelectItem>
              <SelectItem value={PRODUCT_MODEL_FILTER_UNASSIGNED}>No Family</SelectItem>
              {productModelOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {shareSetOptions.length > 0 && (
            <Select value={filterSetId || "__all__"} onValueChange={(v) => setFilterSetId(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-8 !w-auto border-0 bg-transparent px-3 shadow-none hover:bg-[var(--color-secondary-button-hover)] [&_svg]:hidden">
                <span>{filterSetId ? (shareSetOptions.find((s) => s.id === filterSetId)?.name ?? "Set") : "Set"}</span>
              </SelectTrigger>
              <SelectContent className="min-w-[180px]">
                <SelectItem value="__all__">All Sets</SelectItem>
                {shareSetOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setShowVariantHierarchy(!showVariantHierarchy)}
            className="h-8 gap-1.5 border-0 bg-transparent px-3 shadow-none hover:bg-[var(--color-secondary-button-hover)]"
            title={showVariantHierarchy ? "Switch to flat view" : "Switch to hierarchy view"}
          >
            {showVariantHierarchy ? <GitBranch className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
            <span className="text-xs">{showVariantHierarchy ? "Hierarchy" : "Flat"}</span>
          </Button>

          {/* Column picker */}
          {columnPickerDropdown("end")}

          {/* CSV Export */}
          <Button variant="outline" size="sm" onClick={handleExportCsv}
            className="h-8 gap-1.5 border-0 bg-transparent px-3 shadow-none hover:bg-[var(--color-secondary-button-hover)]"
            title={selectedProductIds.size > 0 ? `Export ${selectedShareableProducts.length} selected products` : "Export all visible products"}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span className="text-xs">Export CSV</span>
          </Button>

          {!isSharedBrandView && (
            <Button variant="outline" size="sm" onClick={() => setIsProductImportOpen(true)}
              className="h-8 gap-1.5 border-0 bg-transparent px-3 shadow-none hover:bg-[var(--color-secondary-button-hover)]"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="text-xs">Import</span>
            </Button>
          )}

          {!isSharedBrandView && (
            <Button variant="outline" size="sm" onClick={handleOpenSyndication}
              className="h-8 gap-1.5 border-0 bg-transparent px-3 shadow-none hover:bg-[var(--color-secondary-button-hover)]"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="text-xs">Syndication</span>
            </Button>
          )}

          {canCreateProducts && (
            <Button onClick={onCreateProduct} className="h-8 gap-1.5 px-3 text-sm">
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          )}
        </div>

        {/* Status messages */}
        {shareStatusMessage && <p className="w-full text-sm text-emerald-700">{shareStatusMessage}</p>}
        {bulkDeleteStatusMessage && <p className="w-full text-sm text-emerald-700">{bulkDeleteStatusMessage}</p>}
        {bulkDeleteError && <p className="w-full text-sm text-red-600">{bulkDeleteError}</p>}
      </div>

      {/* AG Grid */}
      <div className="min-w-0 rounded-lg border border-muted/30 [overflow:clip]">
        <AgGridReact<PIMProduct>
          ref={gridRef}
          className={cn(gridRowData.length === 0 && "pim-grid-empty")}
          theme={pimTheme}
          rowData={gridRowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          context={gridContext}
          getRowId={(params: GetRowIdParams<PIMProduct>) => params.data.id}
          getRowClass={(params) => {
            const data = params.data as PIMProduct | undefined;
            if (!data) return undefined;
            const classes: string[] = [];
            // No selection highlight — row selection is shown via checkbox only
            if (isVariantProduct(data) && data.parentId && expandedParentsRef.current.has(data.parentId)) {
              classes.push("pim-row-variant-expanded");
            }
            return classes.length ? classes.join(" ") : undefined;
          }}
          domLayout="autoHeight"
          suppressCellFocus={!isEditMode}
          isFullWidthRow={(params) => isViewAllVariantsRow(params.rowNode.data as PIMProduct)}
          fullWidthCellRenderer={ViewAllVariantsRenderer}
          onGridReady={onGridReady}
          onSortChanged={onSortChanged}
          onColumnVisible={onColumnVisible}
          onColumnResized={(e: ColumnResizedEvent) => { if (e.finished) saveColumnState(); }}
          onColumnMoved={(e: ColumnMovedEvent) => { if (e.finished) saveColumnState(); }}
          onRowClicked={onRowClicked}
          onCellValueChanged={onCellValueChanged}
          stopEditingWhenCellsLoseFocus
          noRowsOverlayComponent={() => (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">No products found</p>
              <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters</p>
            </div>
          )}
                  tooltipShowDelay={500}
          rowStyle={{ cursor: "pointer" }}
        />
      </div>

      {/* Share dialog */}
      <Dialog open={isShareDialogOpen} onOpenChange={(open) => {
        setIsShareDialogOpen(open);
        if (!open) { setShareDialogError(null); setNewShareSetName(""); clearShareScopeConstraints(); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Selection To Product Saved Scope</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
              Selected: <span className="font-medium text-foreground">{selectedShareableProducts.length} product{selectedShareableProducts.length === 1 ? "" : "s"}</span>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Product Saved Scope</label>
              <Select value={selectedShareSetId} onValueChange={setSelectedShareSetId}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select a saved scope" /></SelectTrigger>
                <SelectContent>
                  {shareSetOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Input
                value={newShareSetName}
                onChange={(e) => setNewShareSetName(e.target.value)}
                placeholder="Or create a new scope..."
                className="h-8 text-sm"
                onKeyDown={(e) => { if (e.key === "Enter") void handleCreateShareSetInline(); }}
              />
              <Button size="sm" variant="outline" className="h-8 px-3 text-xs"
                onClick={() => void handleCreateShareSetInline()}
                disabled={!newShareSetName.trim() || isCreatingShareSet}
              >
                {isCreatingShareSet ? "Creating..." : "Create"}
              </Button>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Scope Constraints (optional)</label>
              <MultiSelect
                options={shareMarketOptions}
                value={shareMarketIds}
                onChange={setShareMarketIds}
                placeholder="All markets"
              />
              <MultiSelect
                options={shareLocaleOptions}
                value={shareLocaleIds}
                onChange={setShareLocaleIds}
                placeholder="All locales"
              />
            </div>
            {!isLoadingShareSets && shareSetOptions.length === 0 && (
              <p className="text-sm text-muted-foreground">No saved scopes yet. Create one above.</p>
            )}
            {shareDialogError && <p className="text-sm text-destructive">{shareDialogError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-8 px-3 text-sm" onClick={() => setIsShareDialogOpen(false)}>Cancel</Button>
            <Button className="h-8 px-3 text-sm"
              onClick={() => void handleConfirmShareSelection()}
              disabled={isSubmittingShare || !selectedShareSetId || selectedShareableProducts.length === 0}
            >
              {isSubmittingShare ? "Adding..." : "Add To Saved Scope"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={(open) => { setShowDeleteDialog(open); if (!open) setPendingDeleteProducts([]); }}
        title={`Delete Product${pendingDeleteProducts.length === 1 ? "" : "s"}`}
        description="This action permanently deletes the selected product records."
        onConfirm={() => { void handleConfirmDelete(); }}
        confirmLoading={bulkDeleteSubmitting}
        confirmDisabled={bulkDeleteSubmitting || pendingDeleteProducts.length === 0}
        safetyMode="typed"
        confirmPhrase="delete"
      >
        <div className="space-y-4">
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">You are about to delete:</p>
            <p>{pendingDeleteProducts.length} product{pendingDeleteProducts.length === 1 ? "" : "s"}</p>
            <p className="mt-1">This cannot be undone.</p>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Selected items</p>
            <div className="space-y-1 text-sm">
              {pendingDeleteProducts.slice(0, 8).map((p) => (
                <p key={p.id} className="text-foreground">
                  {p.productName ?? p.sku ?? p.id}
                  <span className="ml-2 text-muted-foreground">({isVariantProduct(p) ? "Variant" : isParentProduct(p) ? "Parent" : "Single SKU"})</span>
                </p>
              ))}
              {pendingDeleteProducts.length > 8 && <p className="text-muted-foreground">+{pendingDeleteProducts.length - 8} more</p>}
            </div>
          </div>
          {bulkDeleteError && <p className="text-sm text-destructive">{bulkDeleteError}</p>}
        </div>
      </DeleteConfirmDialog>

      <ProductDataImportDialog
        open={isProductImportOpen}
        onOpenChange={setIsProductImportOpen}
        tenantSlug={tenantSlug}
      />

      {/* Edit mode floating bar — replaces bulk toolbar when editing */}
      {isEditMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-border rounded-xl shadow-lg animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-sm font-semibold text-foreground whitespace-nowrap">
              Editing {editModeSnapshot.size} product{editModeSnapshot.size === 1 ? "" : "s"}
            </span>
            {dirtyChanges.size > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {dirtyChanges.size} unsaved
              </span>
            )}
            {/* + Column — add/show columns without leaving edit mode */}
            <div className="border-l border-border pl-3">
              {columnPickerDropdown("start")}
            </div>
            <div className="flex items-center gap-2 border-l border-border pl-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="h-8 px-4"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdits}
                disabled={dirtyChanges.size === 0 || isSaving}
                className="h-8 px-4"
              >
                {isSaving ? "Saving…" : dirtyChanges.size > 0 ? `Save ${dirtyChanges.size} edit${dirtyChanges.size === 1 ? "" : "s"}` : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action toolbar — hidden while in edit mode */}
      {!isEditMode && (
        <BulkActionToolbar
          selectedCount={isSharedBrandView ? 0 : selectedShareableProducts.length}
          onAddToSet={handleBulkShare}
          onRemoveFromSet={filterSetId && !isSharedBrandView ? handleRemoveFromSet : undefined}
          activeSetName={filterSetId ? (shareSetOptions.find((s) => s.id === filterSetId)?.name ?? undefined) : undefined}
          onEdit={handleBulkEdit}
          onDelete={handleBulkDelete}
          onTranslate={canTranslate && !isSharedBrandView ? handleBulkTranslate : undefined}
          onClear={handleClearSelection}
        />
      )}

      {/* Translation panel */}
      {canTranslate && !isSharedBrandView && (
        <TranslationPanel
          tenantSlug={tenantSlug}
          productId={selectedShareableProducts[0]?.id ?? ""}
          productIds={selectedShareableProducts.map((p) => p.id)}
          open={isTranslatePanelOpen}
          onOpenChange={setIsTranslatePanelOpen}
          initialSourceLocaleId={selectedLocaleId ?? undefined}
          productInfoById={Object.fromEntries(
            selectedShareableProducts.map((p) => [p.id, { name: p.productName, thumbnailUrl: coreAssetImagesByProductId[p.id]?.[0]?.previewUrl }])
          )}
          marketContextData={{ locales, markets, marketLocaleAssignments: marketLocales, selectedMarketId, selectedChannelId, selectedDestinationId }}
        />
      )}
    </div>
  );
}
