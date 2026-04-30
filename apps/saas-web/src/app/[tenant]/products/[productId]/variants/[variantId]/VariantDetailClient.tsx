"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Package, FileText, ImageIcon, Languages, MoreHorizontal, Globe, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { buildCanonicalProductIdentifier, parseProductIdentifier } from "@/lib/product-utils";
import { VariantNavigationHeader } from "@/components/products/VariantNavigationHeader";
import { InlineDynamicFieldEditor } from "@/components/inline-edit";
import type { ProductField } from "@/components/field-types/DynamicFieldRenderer";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { PageContentContainer } from "@/components/ui/page-content-container";
import { ItemList } from "@/components/ui/item-list";
import { cn } from "@/lib/utils";
import { useMarketContext } from "@/components/market-context";
import { useRouter, useSearchParams } from "next/navigation";
import { buildTenantPathForScope } from "@/lib/tenant-view-scope";
import { isBasicInformationFieldGroupCode } from "@/lib/field-group-codes";
import { TranslationPanel } from "@/components/products/TranslationPanel";
import { ProductDetailNavStrip } from "@/components/products/ProductDetailNavStrip";
import { fetchJsonWithDedupe } from "@/lib/client-request-cache";
import { DeleteConfirmDialog } from "@/components/ui/modal-shells";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@stack-app/ui";
import {
  createGlobalAuthoringScope,
  normalizeAuthoringScope,
} from "@/components/scope/authoring-scope-picker";

interface VariantDetailClientProps {
  tenantSlug: string;
  productId: string;
  variantId: string;
  selectedBrandSlug?: string | null;
}

type SectionConfig = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isSystem: boolean;
  isFieldGroup?: boolean;
  fieldGroup?: FieldGroupLike;
};

type VariantRecord = {
  id?: string;
  type?: string;
  parent_id?: string;
  family_id?: string;
  product_name?: string;
  sku?: string;
  barcode?: string;
  upc?: string;
  scin?: string;
  status?: string;
  variant_attributes?: Record<string, unknown>;
  parent_product?: { product_name?: string | null; [key: string]: unknown } | null;
  marketplace_content?: Record<string, unknown>;
  marketplaceContent?: Record<string, unknown>;
  field_values_map?: Record<string, unknown>;
  [key: string]: unknown;
};

type FieldLike = {
  id?: string | number;
  code?: string;
  name?: string;
  description?: string;
  field_type?: string;
  sort_order?: number;
  is_required?: boolean;
  is_unique?: boolean;
  validation_rules?: Record<string, unknown>;
  options?: {
    system_key?: string;
    table_definition?: {
      meta?: {
        uses_panel_instances?: boolean;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type FieldEntryLike = FieldLike & {
  product_field?: FieldLike;
};

type FieldGroupLike = {
  id?: string;
  field_group_id?: string;
  field_groups?: {
    id?: string;
    code?: string;
    name?: string;
    description?: string;
    product_field_group_assignments?: Array<{ product_fields?: FieldEntryLike }>;
    [key: string]: unknown;
  };
  field_group?: {
    id?: string;
    code?: string;
    name?: string;
    description?: string;
    product_field_group_assignments?: Array<{ product_fields?: FieldEntryLike }>;
    [key: string]: unknown;
  };
  hidden_fields?: Array<string | number>;
  sort_order?: number;
  fields?: FieldEntryLike[];
  [key: string]: unknown;
};

type ProductPayload = {
  success?: boolean;
  data?: VariantRecord;
  error?: string;
};

// ── Variant asset slot definitions ───────────────────────────────────────────

const VARIANT_IMAGE_SLOTS = [
  { code: "image_front", label: "Front Panel", hint: "Variant-specific front-of-pack view (e.g. flavor-colored label)." },
  { code: "label_print_ready", label: "Label (Print-Ready)", hint: "CMYK ≥300dpi with bleeds — for printers." },
  { code: "label_digital", label: "Label (Digital)", hint: "sRGB version for Amazon, website, and digital channels." },
  { code: "label_regulatory", label: "Label (Regulatory)", hint: "FDA/EU-approved PDF for regulatory submissions." },
  { code: "supplement_facts_panel", label: "Supplement Facts Panel", hint: "Extracted Supplement/Nutrition Facts panel for this variant." },
  { code: "image_lifestyle", label: "Lifestyle", hint: "Variant-specific lifestyle or flavour shot." },
] as const;

type VariantSlotLink = {
  id: string;
  document_slot_code: string | null;
  variant_id?: string | null;
  dam_assets: {
    id: string;
    filename: string;
    original_filename: string;
    file_type: string;
    mime_type: string;
    thumbnail_urls: Record<string, string> | null;
    s3_url: string | null;
  } | null;
};

function VariantAssetsSection({
  tenantSlug,
  productId,
  variantId,
  parentProductUrl,
  onAssignedCountChange,
}: {
  tenantSlug: string;
  productId: string;
  variantId: string;
  parentProductUrl: string;
  onAssignedCountChange?: (count: number) => void;
}) {
  const [links, setLinks] = React.useState<VariantSlotLink[]>([]);
  const [parentLinks, setParentLinks] = React.useState<VariantSlotLink[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState<string | null>(null);
  const fileInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/${tenantSlug}/product-links?product_ids=${productId}&variant_id=${variantId}`).then((r) => r.json()),
      fetch(`/api/${tenantSlug}/product-links?product_id=${productId}`).then((r) => r.json()),
    ])
      .then(([variantJson, allJson]) => {
        if (cancelled) return;
        setLinks(Array.isArray(variantJson?.data) ? variantJson.data : []);
        const all: VariantSlotLink[] = Array.isArray(allJson?.data) ? allJson.data : [];
        setParentLinks(all.filter((l) => !l.variant_id));
      })
      .catch(() => { if (!cancelled) { setLinks([]); setParentLinks([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantSlug, productId, variantId]);

  const slotMap = React.useMemo(() => {
    const map: Record<string, VariantSlotLink> = {};
    for (const link of links) {
      if (link.document_slot_code) map[link.document_slot_code] = link;
    }
    return map;
  }, [links]);

  const handleRemove = async (linkId: string) => {
    setRemoving(linkId);
    try {
      await fetch(`/api/${tenantSlug}/product-links/${linkId}`, { method: "DELETE" });
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } finally {
      setRemoving(null);
    }
  };

  const handleFileUpload = async (slotCode: string, file: File) => {
    setUploading(slotCode);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "productLink",
        JSON.stringify({
          productId,
          variantId,
          linkContext: `product_image_slot:${slotCode}:upload`,
          confidence: 1,
          matchReason: `Uploaded to variant slot ${slotCode}`,
          assetType: "image",
          documentSlotCode: slotCode,
          replaceExistingSlot: true,
        })
      );
      const res = await fetch(`/api/${tenantSlug}/assets/upload`, { method: "POST", body: formData });
      if (res.ok) {
        const refreshed = await fetch(`/api/${tenantSlug}/product-links?product_ids=${productId}&variant_id=${variantId}`).then((r) => r.json());
        const newLinks: VariantSlotLink[] = Array.isArray(refreshed?.data) ? refreshed.data : [];
        setLinks(newLinks);
        onAssignedCountChange?.(VARIANT_IMAGE_SLOTS.filter((s) => {
          const newMap: Record<string, boolean> = {};
          for (const l of newLinks) { if (l.document_slot_code) newMap[l.document_slot_code] = true; }
          return newMap[s.code];
        }).length);
      }
    } finally {
      setUploading(null);
    }
  };

  React.useEffect(() => {
    onAssignedCountChange?.(VARIANT_IMAGE_SLOTS.filter((s) => slotMap[s.code]).length);
  }, [slotMap, onAssignedCountChange]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 animate-pulse">
        {VARIANT_IMAGE_SLOTS.map((slot) => (
          <div key={slot.code} className="h-48 rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  const assignedCount = VARIANT_IMAGE_SLOTS.filter((s) => slotMap[s.code]).length;
  const parentImageSlots = ["image_front", "image_back", "image_hero", "image_lifestyle", "image_label"];
  const parentVisibleLinks = parentLinks.filter((l) => l.document_slot_code && parentImageSlots.includes(l.document_slot_code));

  return (
    <div className="space-y-8">
      {/* Variant-specific slots */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Variant Assets</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              These assets are specific to this variant and override the parent product&apos;s slots.
            </p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            assignedCount === VARIANT_IMAGE_SLOTS.length
              ? 'bg-emerald-50 text-emerald-700'
              : assignedCount > 0
              ? 'bg-amber-50 text-amber-700'
              : 'bg-muted text-muted-foreground'
          }`}>
            {assignedCount}/{VARIANT_IMAGE_SLOTS.length} assigned
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {VARIANT_IMAGE_SLOTS.map((slot) => {
            const link = slotMap[slot.code];
            const asset = link?.dam_assets ?? null;
            const thumbUrl = asset?.thumbnail_urls?.small || asset?.thumbnail_urls?.medium || asset?.s3_url || null;
            const isUploading = uploading === slot.code;
            const isRemoving = removing === link?.id;

            return (
              <div
                key={slot.code}
                className="group relative overflow-hidden rounded-lg border border-border/60 bg-muted/10"
              >
                {/* Preview area */}
                <div className="relative flex h-48 items-center justify-center bg-muted/20">
                  {isUploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-6 w-6 animate-pulse text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Uploading…</span>
                    </div>
                  ) : thumbUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbUrl} alt={asset?.original_filename || slot.label} className="h-full w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 px-2 pb-1.5">
                        <span className="text-[11px] font-medium text-white">{slot.label}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 px-4 text-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                      <span className="text-xs font-medium text-muted-foreground">{slot.label}</span>
                      <span className="text-[11px] text-muted-foreground/60">{slot.hint}</span>
                    </div>
                  )}
                </div>

                {/* Action bar */}
                <div className="flex items-center gap-1 bg-background px-2 py-1.5">
                  {link ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 flex-1 text-[11px]"
                        disabled={isRemoving || isUploading}
                        onClick={() => fileInputRefs.current[slot.code]?.click()}
                      >
                        Replace
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[11px] text-destructive hover:text-destructive"
                        disabled={isRemoving || isUploading}
                        onClick={() => handleRemove(link.id)}
                      >
                        Remove
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 flex-1 text-[11px]"
                      disabled={isUploading}
                      onClick={() => fileInputRefs.current[slot.code]?.click()}
                    >
                      Upload
                    </Button>
                  )}
                  <input
                    ref={(el) => { fileInputRefs.current[slot.code] = el; }}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(slot.code, file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Parent assets — read-only reference strip */}
      {parentVisibleLinks.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Parent Product Assets</h3>
              <p className="text-xs text-muted-foreground">Shared across all variants. Manage from the parent product.</p>
            </div>
            <a
              href={`${parentProductUrl}?section=media`}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Open parent →
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            {parentVisibleLinks.slice(0, 8).map((link) => {
              const asset = link?.dam_assets;
              const thumbUrl = asset?.thumbnail_urls?.small || asset?.thumbnail_urls?.medium || asset?.s3_url || null;
              return (
                <div key={link.id} className="relative h-16 w-16 overflow-hidden rounded-md border border-border/60 bg-muted/20">
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbUrl} alt={asset?.filename || ""} className="h-full w-full object-cover opacity-70" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toEditorField(field: FieldLike, fallbackCode: string): ProductField {
  return {
    id: String(field.id ?? fallbackCode),
    code: String(field.code ?? fallbackCode),
    name: String(field.name ?? fallbackCode),
    field_type: String(field.field_type ?? "text"),
    is_required: Boolean(field.is_required),
    is_unique: Boolean(field.is_unique),
    description: typeof field.description === "string" ? field.description : undefined,
    options: (field.options ?? {}) as Record<string, unknown>,
    validation_rules: asRecord(field.validation_rules) ?? undefined,
  };
}

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
  "catalog_visibility",
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
async function parseJsonSafely(response: Response): Promise<unknown | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function VariantDetailClient({
  tenantSlug,
  productId,
  variantId,
  selectedBrandSlug: selectedBrandSlugProp,
}: VariantDetailClientProps) {
  const TABLE_HEAVY_FIELD_TYPES = ['table', 'gallery', 'asset_collection', 'data_grid'];
  const getResolvedField = (field: FieldEntryLike | FieldLike | null | undefined) =>
    (field?.product_field || field || null) as FieldLike | null;
  const isConstrainedPanelTable = (field: FieldEntryLike | FieldLike | null | undefined) => {
    const resolved = getResolvedField(field);
    return (
      resolved?.field_type === 'table' &&
      resolved?.options?.table_definition?.meta?.uses_panel_instances === true
    );
  };
  const isLayoutWideField = (field: FieldEntryLike | FieldLike | null | undefined) => {
    const resolved = getResolvedField(field);
    if (!resolved) return false;
    if (resolved.field_type !== 'table') {
      return TABLE_HEAVY_FIELD_TYPES.includes(String(resolved.field_type || ""));
    }
    return !isConstrainedPanelTable(resolved);
  };

  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedBrandSlug = (selectedBrandSlugProp || searchParams.get("brand") || "")
    .trim()
    .toLowerCase();
  const isSharedBrandView =
    selectedBrandSlug.length > 0 && selectedBrandSlug !== tenantSlug.toLowerCase();
  const {
    locales,
    markets,
    marketLocales,
    selectedChannelId,
    selectedDestinationId,
    selectedLocaleId,
    selectedLocale,
    selectedMarketId,
    isLoading: marketContextLoading,
  } = useMarketContext();
  const [activeSection, setActiveSection] = useState('attributes-all');
  const hasAutoSelectedInitialSectionRef = useRef(false);
  const [assignedSlotCount, setAssignedSlotCount] = useState(0);
  const [variant, setVariant] = useState<VariantRecord | null>(null);
  const [parentProduct, setParentProduct] = useState<VariantRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldGroups, setFieldGroups] = useState<FieldGroupLike[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [, setPendingFieldChanges] = useState<Record<string, unknown>>({});
  const [overrideModes, setOverrideModes] = useState<Record<string, boolean>>({});
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, unknown>>({});
  const [localizationEligibilityLoading, setLocalizationEligibilityLoading] = useState(false);
  const [canUseTranslateProduct, setCanUseTranslateProduct] = useState(false);
  const [isTranslatePanelOpen, setIsTranslatePanelOpen] = useState(false);
  const [isDeletingVariant, setIsDeletingVariant] = useState(false);
  const [isDeleteVariantDialogOpen, setIsDeleteVariantDialogOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const resolveSystemFieldCode = useCallback(
    (field: FieldLike): string =>
      String(field?.options?.system_key || field?.code || '')
        .trim()
        .toLowerCase(),
    []
  );

  const isScinSystemField = useCallback(
    (field: FieldLike): boolean => resolveSystemFieldCode(field) === 'scin',
    [resolveSystemFieldCode]
  );

  const buildScopeQueryString = useCallback(() => {
    const query = new URLSearchParams();
    if (selectedMarketId) query.set('marketId', selectedMarketId);
    if (selectedLocaleId) query.set('localeId', selectedLocaleId);
    if (selectedLocale?.code) query.set('locale', selectedLocale.code);
    if (selectedBrandSlug) query.set('brand', selectedBrandSlug);
    return query.toString();
  }, [
    selectedMarketId,
    selectedLocaleId,
    selectedLocale?.code,
    selectedBrandSlug,
  ]);

  const isScopeReady = React.useMemo(() => {
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

  const canEditVariantFields = !isSharedBrandView && isScopeReady;

  const fieldCodeToSystemKeyMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const group of fieldGroups) {
      const fields = Array.isArray(group?.fields) ? group.fields : [];
      for (const fieldRecord of fields) {
        const field = fieldRecord?.product_field || fieldRecord;
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

  const authoringScope = React.useMemo(() => {
    const rawScope =
      variant?.marketplace_content?.authoringScope ??
      variant?.marketplaceContent?.authoringScope ??
      null;
    return normalizeAuthoringScope(rawScope) || createGlobalAuthoringScope();
  }, [variant]);

  const parentVariantInheritanceConfig = React.useMemo(() => {
    const rawConfig = asRecord(
      parentProduct?.marketplace_content?.variantInheritance ??
      parentProduct?.marketplaceContent?.variantInheritance
    );

    return {
      inheritByDefault:
        typeof rawConfig?.inheritByDefault === "boolean"
          ? rawConfig.inheritByDefault
          : true,
      allowChildOverrides:
        typeof rawConfig?.allowChildOverrides === "boolean"
          ? rawConfig.allowChildOverrides
          : true,
    };
  }, [parentProduct]);

  const isCurrentViewInsideAuthoringScope = React.useMemo(() => {
    if (authoringScope.mode !== "scoped") return true;

    const matchesDimension = (selectedId: string | null, allowedIds: string[]) =>
      allowedIds.length === 0 || (selectedId ? allowedIds.includes(selectedId) : false);

    return (
      matchesDimension(selectedMarketId, authoringScope.marketIds) &&
      matchesDimension(selectedLocaleId, authoringScope.localeIds)
    );
  }, [
    authoringScope,
    selectedMarketId,
    selectedLocaleId,
  ]);

  const buildProductUrl = useCallback((id: string) => {
    const scopeQuery = buildScopeQueryString();
    return scopeQuery
      ? `/api/${tenantSlug}/products/${id}?${scopeQuery}`
      : `/api/${tenantSlug}/products/${id}`;
  }, [tenantSlug, buildScopeQueryString]);

  const formatPreviewValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') return '-';
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const valuesEqual = (a: unknown, b: unknown) => {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b) || typeof a === 'object' || typeof b === 'object') {
      return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    }
    return false;
  };

  const isFieldValueFilled = (value: unknown) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  };

  const extractCustomFieldValues = (productData: VariantRecord | null | undefined) => {
    const systemFields = [
      'id',
      'organization_id',
      'type',
      'parent_id',
      'product_name',
      'scin',
      'sku',
      'barcode',
      'brand_line',
      'family_id',
      'status',
      'launch_date',
      'msrp',
      'cost_of_goods',
      'margin_percent',
      'assets_count',
      'content_score',
      'short_description',
      'long_description',
      'features',
      'specifications',
      'meta_title',
      'meta_description',
      'keywords',
      'weight_g',
      'dimensions',
      'inheritance',
      'is_inherited',
      'marketplace_content',
      'variant_axis',
      'created_at',
      'updated_at',
      'created_by',
      'last_modified_by',
      'has_variants',
      'variant_count',
      'product_families',
      'parent_product',
      'variants',
      'siblings'
    ];

    const source = productData || {};
    const custom: Record<string, unknown> = {};
    Object.keys(source).forEach((key) => {
      if (!systemFields.includes(key) && source[key] !== null && source[key] !== undefined) {
        custom[key] = source[key];
      }
    });
    return custom;
  };

  const systemSections = React.useMemo<SectionConfig[]>(
    () => [
      { id: 'attributes-all', label: 'All Attributes', icon: FileText, isSystem: true, isFieldGroup: false },
      { id: 'attributes-required', label: 'Required', icon: FileText, isSystem: true, isFieldGroup: false },
      { id: 'attributes-missing', label: 'Missing', icon: FileText, isSystem: true, isFieldGroup: false },
      { id: 'media', label: 'Assets', icon: ImageIcon, isSystem: true, isFieldGroup: false }
    ],
    []
  );

  const orderedFieldGroups = React.useMemo(() => {
    return [...fieldGroups].sort((a, b) => {
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
  }, [fieldGroups]);

  const fieldGroupSections = React.useMemo<SectionConfig[]>(
    () =>
      orderedFieldGroups.map((fg) => ({
        id: `fieldgroup-${String(fg.field_group?.id || fg.id || "")}`,
        label: String(fg.field_group?.name || "Field Group"),
        icon: FileText,
        isSystem: false,
        isFieldGroup: true,
        fieldGroup: fg
      })),
    [orderedFieldGroups]
  );

  const sections = React.useMemo<SectionConfig[]>(
    () => [...systemSections, ...fieldGroupSections],
    [fieldGroupSections, systemSections]
  );

  useEffect(() => {
    const validSections = new Set(sections.map((section) => section.id));
    if (!validSections.has(activeSection)) {
      setActiveSection('attributes-all');
    }
  }, [activeSection, sections]);

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
    if (fieldGroupSections.length === 0) return;

    const preferredSectionId =
      fieldGroupSections.find((section) => {
        const code = String(section.fieldGroup?.field_group?.code || '').trim().toLowerCase();
        const name = String(section.label || '').trim().toLowerCase();
        return isBasicInformationFieldGroupCode(code) || name === 'basic information';
      })?.id ?? fieldGroupSections[0]?.id;

    if (preferredSectionId) {
      setActiveSection(preferredSectionId);
      hasAutoSelectedInitialSectionRef.current = true;
    }
  }, [activeSection, fieldGroupSections, searchParams]);
  // Save field values to API
  const saveFieldValues = async (fieldsToSave: Record<string, unknown>) => {
    if (isSharedBrandView) return;
    if (!canEditVariantFields) return;
    if (!variant?.id) {
      console.error('âŒ Cannot save: variant.id is missing');
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
      console.warn('Skipping unsupported variant fields during save:', droppedFields);
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
      toast.error(`${requiredFieldViolations.join(" and ")} cannot be empty`);
      return;
    }

    try {
      setSaving(true);
      console.log('ðŸ’¾ Saving field values:', fieldsToSave);

      const response = await fetch(buildProductUrl(variant.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedFieldsToSave)
      });

      const responseData = await parseJsonSafely(response);
      const responseError =
        typeof asRecord(responseData)?.error === "string"
          ? String(asRecord(responseData)?.error)
          : null;

      if (!response.ok) {
        console.error('Save request failed:', {
          status: response.status,
          statusText: response.statusText,
          body: responseData,
        });
        throw new Error(responseError || `Failed to save changes (${response.status})`);
      }

      // Clear pending changes for saved fields
      setPendingFieldChanges(prev => {
        const newPending = { ...prev };
        Object.keys(fieldsToSave).forEach(key => delete newPending[key]);
        return newPending;
      });

      console.log('âœ… Changes saved successfully');
    } catch (error: unknown) {
      console.error('âŒ Error saving field values:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save changes');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const setOverrideValue = (fieldCode: string, value: unknown) => {
    if (!canEditVariantFields) return;
    if (fieldCode === 'scin') return;
    setFieldValues(prev => ({
      ...prev,
      [fieldCode]: value
    }));

    setPendingFieldChanges(prev => ({
      ...prev,
      [fieldCode]: value
    }));
  };

  const clearOverrideValue = (fieldCode: string) => {
    if (!canEditVariantFields) return;
    if (fieldCode === 'scin') return;

    const parentValue = getParentFieldValue(fieldCode);
    const requiredSystemField = fieldCode === "title" || fieldCode === "sku";

    if (requiredSystemField) {
      if (typeof parentValue !== "string" || parentValue.trim().length === 0) {
        toast.error(`Cannot clear required field: ${fieldCode}`);
        return;
      }

      setFieldValues(prev => ({
        ...prev,
        [fieldCode]: parentValue
      }));

      setPendingFieldChanges(prev => ({
        ...prev,
        [fieldCode]: parentValue
      }));

      return;
    }

    setFieldValues(prev => {
      const next = { ...prev };
      delete next[fieldCode];
      return next;
    });

    setPendingFieldChanges(prev => {
      const next = { ...prev };
      delete next[fieldCode];
      return next;
    });
  };

  const enableOverrideMode = (fieldCode: string, parentValue: unknown) => {
    if (!canEditVariantFields) return;
    if (fieldCode === 'scin') return;
    setOverrideModes(prev => ({
      ...prev,
      [fieldCode]: true
    }));
    setOverrideDrafts(prev => ({
      ...prev,
      [fieldCode]: parentValue ?? ''
    }));
  };

  const disableOverrideMode = async (
    fieldCode: string,
    options?: { persist?: boolean }
  ) => {
    if (!canEditVariantFields) return;
    if (fieldCode === 'scin') return;
    const hasOverrideValue = Object.prototype.hasOwnProperty.call(fieldValues, fieldCode);
    const shouldPersist = options?.persist ?? hasOverrideValue;
    setOverrideModes(prev => {
      const next = { ...prev, [fieldCode]: false };
      return next;
    });
    setOverrideDrafts(prev => {
      const next = { ...prev };
      delete next[fieldCode];
      return next;
    });
    if (shouldPersist) {
      clearOverrideValue(fieldCode);
    }
  };

  const isAutoEditableByParentDefault = useCallback(
    (params: {
      fieldCode: string;
      hasOverride: boolean;
      isScinField: boolean;
      isVariantAxis: boolean;
    }) => {
      if (params.isScinField || params.isVariantAxis || params.hasOverride) return false;
      if (!parentVariantInheritanceConfig.allowChildOverrides) return false;
      if (parentVariantInheritanceConfig.inheritByDefault) return false;
      // If user explicitly selected inherit for this field, keep it inherited.
      if (overrideModes[params.fieldCode] === false) return false;
      return true;
    },
    [overrideModes, parentVariantInheritanceConfig.allowChildOverrides, parentVariantInheritanceConfig.inheritByDefault]
  );

  // Load variant data and field groups from API
  useEffect(() => {
    const fetchVariant = async () => {
      try {
        setLoading(true);
        console.log('ðŸ” Fetching variant:', variantId, 'of parent:', productId);

        // Dedicated variant endpoints are not available; resolve variants via product endpoint.
        const [variantResult, initialParentResult] = await Promise.all([
          fetchJsonWithDedupe<ProductPayload>(buildProductUrl(variantId), {
            ttlMs: 3000,
          }),
          fetchJsonWithDedupe<ProductPayload>(buildProductUrl(productId), {
            ttlMs: 3000,
          }),
        ]);
        const variantPayload = variantResult.data;
        if (!variantResult.ok) {
          throw new Error(variantPayload?.error || 'Failed to fetch variant');
        }
        if (!variantPayload?.success || !variantPayload?.data) {
          throw new Error('Invalid variant response format');
        }

        const variantData = variantPayload.data;
        if (variantData.type !== 'variant') {
          throw new Error('Requested record is not a variant');
        }
        setVariant(variantData);

        const parentIdentifier = variantData.parent_id || productId;
        const parentResult =
          parentIdentifier === productId
            ? initialParentResult
            : await fetchJsonWithDedupe<ProductPayload>(buildProductUrl(parentIdentifier), {
                ttlMs: 3000,
              });
        const parentPayload = parentResult.data;
        const parentData =
          parentResult.ok && parentPayload?.success && parentPayload?.data
            ? parentPayload.data
            : null;

        const canonicalParentIdentifier = buildCanonicalProductIdentifier(
          parentIdentifier,
          parentData?.product_name || variantData?.parent_product?.product_name || null
        );
        const canonicalVariantIdentifier = buildCanonicalProductIdentifier(
          String(variantData.id || variantId),
          variantData.product_name || variantData.sku || null
        );
        const parsedParentIdentifier = parseProductIdentifier((productId || "").trim());
        const parsedVariantIdentifier = parseProductIdentifier((variantId || "").trim());
        const hasParentUuidWithSlug =
          Boolean(parsedParentIdentifier.uuid) &&
          (productId || "").trim().length > (parsedParentIdentifier.uuid?.length || 0);
        const hasVariantUuidWithSlug =
          Boolean(parsedVariantIdentifier.uuid) &&
          (variantId || "").trim().length > (parsedVariantIdentifier.uuid?.length || 0);
        const shouldCanonicalizeParent = !hasParentUuidWithSlug;
        const shouldCanonicalizeVariant = !hasVariantUuidWithSlug;
        if (
          (shouldCanonicalizeParent &&
            (productId || "").trim().toLowerCase() !==
              canonicalParentIdentifier.toLowerCase()) ||
          (shouldCanonicalizeVariant &&
            (variantId || "").trim().toLowerCase() !==
              canonicalVariantIdentifier.toLowerCase())
        ) {
          const canonicalPath = buildTenantPathForScope({
            tenantSlug,
            scope: selectedBrandSlug || null,
            suffix: `/products/${canonicalParentIdentifier}/variants/${canonicalVariantIdentifier}`,
          });
          router.replace(canonicalPath);
          return;
        }

        if (parentData) {
          setParentProduct(parentData);

          // Fetch parent's field groups (variant inherits parent's field groups)
          if (parentData.family_id) {
            const scopeQuery = buildScopeQueryString();
            console.log('ðŸ” Fetching field groups for family:', parentData.family_id);
            const fieldGroupsUrl = scopeQuery
              ? `/api/${tenantSlug}/product-families/${parentData.family_id}/field-groups?${scopeQuery}`
              : `/api/${tenantSlug}/product-families/${parentData.family_id}/field-groups`;
            const fieldGroupsResult = await fetchJsonWithDedupe<FieldGroupLike[]>(fieldGroupsUrl, {
              ttlMs: 5000,
            });
            if (fieldGroupsResult.ok) {
              const groupsData = fieldGroupsResult.data || [];
              console.log('ðŸ“¦ Field groups response:', groupsData);

              // Transform the data - extract fields from nested structure (same as ProductDetailClient)
              const processedGroups = groupsData.map((item: FieldGroupLike) => {
                const fieldGroupMeta = item.field_groups ?? item.field_group;
                const allFields = (fieldGroupMeta?.product_field_group_assignments || [])
                  .map((assignment: { product_fields?: FieldEntryLike }) => assignment.product_fields)
                  .filter((field): field is FieldEntryLike => Boolean(field))
                  .sort((a: FieldEntryLike, b: FieldEntryLike) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
                const hiddenFieldIds = new Set((item.hidden_fields || []).map((id) => String(id)));

                const visibleFields = allFields.filter((field: FieldEntryLike) =>
                  !hiddenFieldIds.has(String(field.id ?? ""))
                );

                return {
                  id: item.id,
                  field_group_id: item.field_group_id,
                  field_group: fieldGroupMeta,
                  hidden_fields: item.hidden_fields || [],
                  sort_order: item.sort_order,
                  fields: visibleFields
                };
              });

              console.log('âœ… Setting field groups:', processedGroups);
              setFieldGroups(processedGroups);
            } else {
              console.error('âŒ Field groups fetch failed:', fieldGroupsResult.status);
            }
          } else {
            console.log('âš ï¸ No family_id on parent product');
          }

          const parentValuesMap = extractCustomFieldValues(parentData);
          parentValuesMap.title = parentData.product_name ?? '';
          parentValuesMap.sku = parentData.sku ?? '';
          parentValuesMap.barcode = parentData.barcode ?? parentData.upc ?? '';
          parentValuesMap.scin = parentData.scin ?? parentData.id ?? '';
          setParentProduct((prev: VariantRecord | null) => ({
            ...prev,
            field_values_map: parentValuesMap
          }));
        }

        const valuesMap = extractCustomFieldValues(variantData);
        valuesMap.title = variantData.product_name ?? '';
        valuesMap.sku = variantData.sku ?? '';
        valuesMap.barcode = variantData.barcode ?? variantData.upc ?? '';
        valuesMap.scin = variantData.scin ?? variantData.id ?? '';
        setFieldValues(valuesMap);

        console.log('âœ… Variant loaded:', variantData.product_name);
      } catch (err) {
        console.error('âŒ Error fetching variant:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (variantId && productId && tenantSlug && isScopeReady) {
      fetchVariant();
    }
  }, [
    variantId,
    productId,
    tenantSlug,
    selectedBrandSlug,
    router,
    buildProductUrl,
    buildScopeQueryString,
    isScopeReady,
  ]);

  // Helper to get parent field value for inheritance display
  const getParentFieldValue = useCallback(
    (fieldCode: string) => {
      if (!parentProduct) return null;

      // Use the parent's field values map
      if (parentProduct.field_values_map?.[fieldCode] !== undefined) {
        return parentProduct.field_values_map[fieldCode];
      }

      if (fieldCode === 'title') return parentProduct.product_name ?? null;
      if (fieldCode === 'sku') return parentProduct.sku ?? null;
      if (fieldCode === 'barcode') return parentProduct.barcode ?? parentProduct.upc ?? null;
      if (fieldCode === 'scin') return parentProduct.scin ?? parentProduct.id ?? null;
      return null;
    },
    [parentProduct]
  );

  const fieldGroupStats = React.useMemo(() => {
    return orderedFieldGroups.map((group) => {
      const fields = Array.isArray(group.fields) ? group.fields : [];
      const requiredFields = fields.filter((field: FieldEntryLike) => {
        const productField = field.product_field || field;
        return Boolean(productField?.is_required);
      });

      const completeRequired = requiredFields.filter((field: FieldEntryLike) => {
        const productField = field.product_field || field;
        const fieldCode = productField?.code;
        if (!fieldCode) return false;

        if (isScinSystemField(productField)) {
          return isFieldValueFilled(variant?.scin || variant?.id);
        }

        const hasOverride = Object.prototype.hasOwnProperty.call(fieldValues, fieldCode);
        const parentValue = getParentFieldValue(fieldCode);
        const autoEditable = isAutoEditableByParentDefault({
          fieldCode,
          hasOverride,
          isScinField: false,
          isVariantAxis: false,
        });
        const overrideEnabled =
          hasOverride ||
          (parentVariantInheritanceConfig.allowChildOverrides &&
            (overrideModes[fieldCode] === true || autoEditable));
        const effectiveValue = overrideEnabled
          ? hasOverride
            ? fieldValues[fieldCode]
            : overrideDrafts[fieldCode] ?? parentValue
          : parentValue;
        return isFieldValueFilled(effectiveValue);
      }).length;

      return {
        group,
        sectionId: `fieldgroup-${String(group.field_group?.id || group.id || "")}`,
        totalFieldCount: fields.length,
        requiredFieldCount: requiredFields.length,
        missingRequiredCount: Math.max(requiredFields.length - completeRequired, 0),
      };
    });
  }, [
    orderedFieldGroups,
    fieldValues,
    isAutoEditableByParentDefault,
    overrideDrafts,
    overrideModes,
    parentVariantInheritanceConfig.allowChildOverrides,
    getParentFieldValue,
    isScinSystemField,
    variant,
  ]);

  const requiredFieldGroupStats = React.useMemo(
    () => fieldGroupStats.filter((stats) => stats.requiredFieldCount > 0),
    [fieldGroupStats]
  );
  const missingFieldGroupStats = React.useMemo(
    () => fieldGroupStats.filter((stats) => stats.missingRequiredCount > 0),
    [fieldGroupStats]
  );
  const completenessPercent = React.useMemo(() => {
    const totalRequired = fieldGroupStats.reduce((sum, s) => sum + s.requiredFieldCount, 0);
    const totalMissing = fieldGroupStats.reduce((sum, s) => sum + s.missingRequiredCount, 0);
    if (totalRequired === 0) return null;
    return Math.round(((totalRequired - totalMissing) / totalRequired) * 100);
  }, [fieldGroupStats]);

  const attributeFilterSections = ['attributes-all', 'attributes-required', 'attributes-missing'];
  const headerStatusPillClass =
    "inline-flex h-8 items-center rounded-full border border-border/60 bg-background px-3 text-xs text-muted-foreground";
  const scopeAlertPillClass =
    "inline-flex h-6 items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 text-xs text-rose-700";
  const contentSectionHeadingClass = 'text-base font-semibold text-foreground';
  const contentSectionHintClass = 'text-xs text-muted-foreground';

  const isTableHeavyFieldGroup = (fieldGroup: FieldGroupLike | null | undefined) => {
    const fields = Array.isArray(fieldGroup?.fields) ? fieldGroup.fields : [];
    if (fields.length === 0) return false;

    const wideFieldCount = fields.filter((field: FieldEntryLike) => isLayoutWideField(field)).length;

    if (wideFieldCount === 0) return false;

    return (
      wideFieldCount >= 2 ||
      wideFieldCount === fields.length
    );
  };

  // Helper to determine content layout
  const getContentLayout = (sectionId: string) => {
    if (sectionId === 'assets') return 'full-width';

    const section = sections.find(s => s.id === sectionId);
    if (!section || !section.isFieldGroup || !('fieldGroup' in section)) return 'form';
    if (!section.fieldGroup) return 'form';

    return isTableHeavyFieldGroup(section.fieldGroup) ? 'full-width' : 'form';
  };

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

        const payload = asRecord(await parseJsonSafely(response));
        if (isCancelled) return;

        const payloadData = asRecord(payload?.data);
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

  const handleTranslateThisVariant = useCallback(() => {
    if (!variant?.id || !canUseTranslateProduct) return;
    setIsTranslatePanelOpen(true);
  }, [canUseTranslateProduct, variant?.id]);

  const handleVariantStatusChange = async (nextStatus: string) => {
    if (!variant?.id || !canEditVariantFields || isSharedBrandView || isUpdatingStatus) return;
    if (!PRODUCT_STATUS_OPTIONS.includes(nextStatus as ProductStatusOption)) return;
    if (nextStatus === variant.status) return;

    const previousStatus = variant.status;
    setIsUpdatingStatus(true);
    setVariant((prev: VariantRecord | null) => (prev ? { ...prev, status: nextStatus } : prev));

    try {
      await saveFieldValues({ status: nextStatus });
      toast.success(`Status updated to ${nextStatus}.`);
    } catch (error) {
      setVariant((prev: VariantRecord | null) => (prev ? { ...prev, status: previousStatus } : prev));
      console.error("Failed to update variant status:", error);
      toast.error("Failed to update variant status.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDeleteVariant = useCallback(async () => {
    if (!variant?.id || isSharedBrandView || isDeletingVariant) return;
    setIsDeleteVariantDialogOpen(false);

    setIsDeletingVariant(true);
    try {
      const query = new URLSearchParams();
      if (selectedBrandSlug) query.set("brand", selectedBrandSlug);
      const querySuffix = query.toString() ? `?${query.toString()}` : "";
      const response = await fetch(
        `/api/${tenantSlug}/products/${productId}/variants/${variant.id}${querySuffix}`,
        { method: "DELETE" }
      );
      const payload = asRecord(await parseJsonSafely(response));
      if (!response.ok) {
        throw new Error(
          (typeof payload?.error === "string" && payload.error) || "Failed to delete variant."
        );
      }

      toast.success("Variant deleted.");
      router.push(
        buildTenantPathForScope({
          tenantSlug,
          scope: selectedBrandSlug || null,
          suffix: `/products/${productId}`,
        })
      );
    } catch (error) {
      console.error("Failed to delete variant:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete variant.");
    } finally {
      setIsDeletingVariant(false);
    }
  }, [
    isDeletingVariant,
    isSharedBrandView,
    productId,
    router,
    selectedBrandSlug,
    tenantSlug,
    variant?.id,
  ]);

  // Show loading state
  if (loading) {
    return <PageSkeleton />;
  }

  // Show error state
  if (error || !variant) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Package className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            {error ? 'Error loading variant' : 'Variant not found'}
          </h3>
          <p className="text-muted-foreground mb-4">{error || 'No variant data available'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100%-var(--app-header-height,44px))] min-h-0 overflow-hidden flex flex-col">
      {isSharedBrandView ? (
        <div className="border-b border-gray-200 bg-muted/20 px-6 py-3 text-sm text-muted-foreground">
          Shared brand view is read-only. Editing is disabled.
        </div>
      ) : null}
      {/* Variant header — compact single-row, full-width */}
      <div className="border-b border-gray-200 bg-background">
        {/* Variant navigation breadcrumb */}
        {variant.family_id && (variant.parent_id || parentProduct?.id || parentProduct?.sku) && (
          <div className="border-b border-border/40 px-6 py-1.5">
            <VariantNavigationHeader
              tenantSlug={tenantSlug}
              parentIdentifier={variant.parent_id || parentProduct?.id || parentProduct?.sku || ""}
              parentName={
                parentProduct?.product_name ||
                variant.parent_product?.product_name ||
                "Parent product"
              }
              currentVariantIdentifier={variant.id || variant.sku}
              familyId={variant.family_id}
              selectedBrandSlug={selectedBrandSlug || null}
            />
          </div>
        )}
        {/* Main header row */}
        <div className="flex h-14 items-center gap-3 px-6">
          {/* Variant thumbnail placeholder */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted">
            <Package className="h-4 w-4 text-muted-foreground/40" />
          </div>

          {/* Variant name */}
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
            {variant.product_name || variant.sku || variant.id}
          </h1>

          {/* Right-side metadata + actions */}
          <div className="flex shrink-0 items-center gap-3">
            {/* Variant type chip */}
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Variant
            </span>

            {/* Completeness score */}
            {completenessPercent !== null && (
              <span className={`text-[11px] font-medium ${
                completenessPercent >= 90
                  ? 'text-emerald-600'
                  : completenessPercent < 50
                  ? 'text-amber-600'
                  : 'text-muted-foreground'
              }`}>
                {completenessPercent}%
              </span>
            )}

            {/* SCIN / SKU pills */}
            <span className="hidden rounded border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground xl:inline">
              SCIN: {variant.scin || variant.id}
            </span>
            {variant.sku ? (
              <span className="hidden rounded border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground lg:inline">
                SKU: {variant.sku}
              </span>
            ) : null}

            {/* Locale indicator */}
            {selectedLocale && (
              <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex" title="Current editing language">
                <Globe className="h-3 w-3 shrink-0" />
                {selectedLocale.name || selectedLocale.code}
              </span>
            )}

            {/* Saving indicator */}
            {!isSharedBrandView && saving ? (
              <span className={headerStatusPillClass}>Saving...</span>
            ) : null}

            {/* Scope alerts */}
            {!parentVariantInheritanceConfig.allowChildOverrides ? (
              <span className={scopeAlertPillClass} title="Parent product settings currently lock inherited fields in this variant.">
                Overrides locked
              </span>
            ) : null}
            {!isCurrentViewInsideAuthoringScope ? (
              <span className={scopeAlertPillClass} title="Current view scope is outside variant authoring scope.">
                Out of scope
              </span>
            ) : null}
            {!isScopeReady ? (
              <span className={scopeAlertPillClass}>Language required</span>
            ) : null}

            {/* Status select */}
            {!isSharedBrandView ? (
              <Select
                value={String(variant.status || "Draft")}
                onValueChange={(nextValue) => {
                  void handleVariantStatusChange(nextValue);
                }}
                disabled={saving || isUpdatingStatus || !canEditVariantFields}
              >
                <SelectTrigger className="h-8 w-[130px] rounded-full border border-border/60 bg-background px-3 text-xs">
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

            {/* Actions dropdown */}
            {!isSharedBrandView ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Open variant actions"
                    disabled={isDeletingVariant || isUpdatingStatus}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onSelect={() => handleTranslateThisVariant()}
                    disabled={
                      localizationEligibilityLoading ||
                      !canUseTranslateProduct ||
                      !variant?.id
                    }
                  >
                    <Languages className="mr-1.5 h-3.5 w-3.5" />
                    Translate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setIsDeleteVariantDialogOpen(true);
                    }}
                    disabled={isDeletingVariant}
                    className="text-destructive focus:text-destructive"
                  >
                    {isDeletingVariant ? "Deleting..." : "Delete variant"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </div>

      {/* Horizontal nav strip */}
      <ProductDetailNavStrip
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        dynamicFieldGroupSections={fieldGroupSections.filter(s => !!s.fieldGroup) as Parameters<typeof ProductDetailNavStrip>[0]['dynamicFieldGroupSections']}
        productType="variant"
        assetCount={assignedSlotCount}
        assetSlotTotal={VARIANT_IMAGE_SLOTS.length}
        showProductSettings={false}
        showVariants={false}
        showReadiness={false}
        isSharedBrandView={isSharedBrandView}
        fieldGroupStats={fieldGroupStats}
      />

      {/* Main content area */}
      <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-6">
            <PageContentContainer
              mode={getContentLayout(activeSection) === 'full-width' ? 'fluid' : 'form'}
            >
              <div className="mb-6 space-y-1">
                <h2 className={contentSectionHeadingClass}>
                  {sections.find(s => s.id === activeSection)?.label || 'Variant Attributes'}
                </h2>
                <p className={contentSectionHintClass}>
                  Review and update fields in this section.
                </p>
              </div>

              <div className="w-full">
                {attributeFilterSections.includes(activeSection) && (() => {
                  const groupsToShow =
                    activeSection === 'attributes-required'
                      ? requiredFieldGroupStats
                      : activeSection === 'attributes-missing'
                      ? missingFieldGroupStats
                      : fieldGroupStats;

                  const description =
                    activeSection === 'attributes-required'
                      ? 'Attribute groups with required fields for this variant.'
                      : activeSection === 'attributes-missing'
                      ? 'Attribute groups missing one or more required values for this variant context.'
                      : 'All attribute groups inherited by this variant.';

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
                        renderTitle={(stats) => String(stats.group.field_group?.name || "Field Group")}
                        renderSubtitle={(stats) =>
                          String(stats.group.field_group?.description || `${stats.totalFieldCount} fields`)
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

                {activeSection === 'media' && (
                  <VariantAssetsSection
                    tenantSlug={tenantSlug}
                    productId={productId}
                    variantId={variantId}
                    parentProductUrl={`/${tenantSlug}/products/${productId}`}
                    onAssignedCountChange={setAssignedSlotCount}
                  />
                )}

                {/* Field Group Sections with Parent Inheritance */}
                {activeSection.startsWith('fieldgroup-') && (() => {
                  const section = sections.find(s => s.id === activeSection);
                  if (!section || !section.isFieldGroup || !('fieldGroup' in section)) return null;

                  const fieldGroup = section.fieldGroup;
                  if (!fieldGroup) return null;
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
                          <div className="rounded-lg border border-border/60 bg-background">
                            {fieldGroup.fields
                              .filter((field: FieldEntryLike) => field && (field.product_field || field.code))
                              .sort((a: FieldEntryLike, b: FieldEntryLike) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
                              .map((field: FieldEntryLike, index: number) => {
                                const productField = field.product_field || field;
                                const fieldCode = productField.code;

                                if (!fieldCode) {
                                  console.warn('Field missing code:', field);
                                  return null;
                                }

                                const isScinField = isScinSystemField(productField);
                                const isVariantAxis =
                                  !isScinField &&
                                  Boolean(
                                    variant.variant_attributes &&
                                      Object.prototype.hasOwnProperty.call(
                                        variant.variant_attributes,
                                        fieldCode
                                      )
                                  );

                                const hasOverride = isScinField
                                  ? true
                                  : Object.prototype.hasOwnProperty.call(fieldValues, fieldCode);
                                const parentValue = isScinField ? null : getParentFieldValue(fieldCode);
                                const autoEditable = isAutoEditableByParentDefault({
                                  fieldCode,
                                  hasOverride,
                                  isScinField,
                                  isVariantAxis,
                                });
                                const overrideEnabled = isScinField
                                  ? true
                                  : hasOverride ||
                                    (parentVariantInheritanceConfig.allowChildOverrides &&
                                      (overrideModes[fieldCode] === true || autoEditable));
                                const displayValue = isScinField
                                  ? (variant?.scin || variant?.id || null)
                                  : overrideEnabled
                                  ? hasOverride
                                    ? fieldValues[fieldCode]
                                    : overrideDrafts[fieldCode] ?? parentValue
                                  : parentValue;
                                const inherits = isScinField ? false : !overrideEnabled;
                                const isLockedByParent =
                                  !isScinField &&
                                  !isVariantAxis &&
                                  inherits &&
                                  !hasOverride &&
                                  !parentVariantInheritanceConfig.allowChildOverrides;

                                const isWideField = isLayoutWideField(productField);
                                const hasDescription = Boolean(productField.description);

                                return (
                                  <div
                                    key={field.id || fieldCode}
                                    className="relative p-4"
                                  >
                                    {index > 0 ? (
                                      <div className="absolute left-4 right-4 top-0 h-px bg-border/50" />
                                    ) : null}
                                    <div className="grid gap-4 md:grid-cols-[minmax(220px,280px),1fr] md:items-start">
                                      {/* Left column: label + badges + description */}
                                      <div className="space-y-1.5">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="text-sm font-medium text-foreground">
                                            {productField.name}
                                          </span>
                                          {productField.is_required && (
                                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                              Required
                                            </span>
                                          )}
                                          {isVariantAxis && (
                                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                                              Variant Axis
                                            </span>
                                          )}
                                          {isScinField && (
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                              System
                                            </span>
                                          )}
                                        </div>
                                        {hasDescription && (
                                          <p className="text-xs text-muted-foreground">
                                            {productField.description}
                                          </p>
                                        )}
                                      </div>

                                      {/* Right column: input + subtle inherit/override controls */}
                                      <div className="md:pt-0.5">
                                        {isVariantAxis ? (
                                          <>
                                            <div className="w-full rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm text-foreground">
                                              {formatPreviewValue(displayValue)}
                                            </div>
                                            <div className="mt-2 text-xs text-blue-600">
                                              Variant attributes are managed in the parent product.
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            {isScinField ? (
                                              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground">
                                                {variant?.scin || variant?.id || '—'}
                                              </div>
                                            ) : inherits ? (
                                              <div className="space-y-2">
                                                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                                                  {formatPreviewValue(parentValue)}
                                                </div>
                                                {isLockedByParent ? (
                                                  <p className="text-xs text-muted-foreground">
                                                    Parent product has disabled child overrides for inherited fields.
                                                  </p>
                                                ) : null}
                                              </div>
                                            ) : productField.field_type === 'table' ? (
                                              <div
                                                className={
                                                  productField.options?.table_definition?.meta?.uses_panel_instances
                                                    ? 'bg-transparent'
                                                    : 'rounded-lg border border-border/60 bg-muted/30 p-4'
                                                }
                                              >
                                                <InlineDynamicFieldEditor
                                                  field={toEditorField(productField, fieldCode)}
                                                  value={displayValue}
                                                  tenantSlug={tenantSlug}
                                                  canEdit={canEditVariantFields}
                                                  readonlyReasonOverride={!isScopeReady ? "Language required" : null}
                                                  onCommit={async (nextValue: unknown) => {
                                                    setOverrideDrafts(prev => ({
                                                      ...prev,
                                                      [fieldCode]: nextValue
                                                    }));

                                                    if (valuesEqual(nextValue, parentValue)) {
                                                      await disableOverrideMode(fieldCode);
                                                      const persistValue =
                                                        fieldCode === "title" || fieldCode === "sku"
                                                          ? parentValue
                                                          : null;
                                                      await saveFieldValues({ [fieldCode]: persistValue });
                                                      return;
                                                    }

                                                    setOverrideValue(fieldCode, nextValue);
                                                    await saveFieldValues({ [fieldCode]: nextValue });
                                                  }}
                                                  rendererClassName={
                                                    productField.options?.table_definition?.meta?.uses_panel_instances
                                                      ? 'bg-transparent'
                                                      : 'bg-background rounded-lg border border-border/60 p-4'
                                                  }
                                                />
                                              </div>
                                            ) : isWideField ? (
                                              <div className="border-2 border-dashed border-border/70 rounded-lg p-8 text-center text-sm text-muted-foreground">
                                                {productField.field_type === 'gallery' && 'Image gallery will be rendered here'}
                                                {productField.field_type === 'asset_collection' && 'Asset collection will be rendered here'}
                                                {productField.field_type === 'data_grid' && 'Data grid will be rendered here'}
                                              </div>
                                            ) : (
                                              <InlineDynamicFieldEditor
                                                field={toEditorField(productField, fieldCode)}
                                                value={displayValue}
                                                tenantSlug={tenantSlug}
                                                canEdit={canEditVariantFields}
                                                readonlyReasonOverride={!isScopeReady ? "Language required" : null}
                                                onCommit={async (nextValue: unknown) => {
                                                  setOverrideDrafts(prev => ({
                                                    ...prev,
                                                    [fieldCode]: nextValue
                                                  }));

                                                  if (valuesEqual(nextValue, parentValue)) {
                                                    await disableOverrideMode(fieldCode);
                                                    const persistValue =
                                                      fieldCode === "title" || fieldCode === "sku"
                                                        ? parentValue
                                                        : null;
                                                    await saveFieldValues({ [fieldCode]: persistValue });
                                                    return;
                                                  }

                                                  setOverrideValue(fieldCode, nextValue);
                                                  await saveFieldValues({ [fieldCode]: nextValue });
                                                }}
                                              />
                                            )}
                                          </>
                                        )}
                                        {/* Subtle inherit/override controls — tight below the input, right-aligned */}
                                        {!isVariantAxis && !isScinField && parentVariantInheritanceConfig.allowChildOverrides && (
                                          <div className="flex justify-end">
                                            {inherits ? (
                                              !isLockedByParent && (
                                                <button
                                                  type="button"
                                                  disabled={!canEditVariantFields}
                                                  onClick={() => enableOverrideMode(fieldCode, parentValue)}
                                                  className="text-[11px] text-gray-400 hover:text-gray-600 disabled:opacity-40"
                                                >
                                                  Override
                                                </button>
                                              )
                                            ) : (
                                              <button
                                                type="button"
                                                disabled={!canEditVariantFields}
                                                onClick={() => disableOverrideMode(fieldCode)}
                                                className="text-[11px] text-gray-400 hover:text-gray-600 disabled:opacity-40"
                                              >
                                                ↩ Reset to parent
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">No fields in this group</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {!['attributes-all', 'attributes-required', 'attributes-missing', 'assets', ...sections.filter(s => s.isFieldGroup).map(s => s.id)].includes(activeSection) && (
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

      <DeleteConfirmDialog
        open={isDeleteVariantDialogOpen}
        onOpenChange={(open) => {
          if (isDeletingVariant) return;
          setIsDeleteVariantDialogOpen(open);
        }}
        title="Delete Variant"
        description="Delete this variant? This action cannot be undone."
        onConfirm={() => void handleDeleteVariant()}
        confirmLoading={isDeletingVariant}
        confirmLabel="Delete variant"
      />

      {canUseTranslateProduct && variant?.id && (
        <TranslationPanel
          tenantSlug={tenantSlug}
          productId={variant.id}
          productIds={[variant.id]}
          productName={variant.product_name || variant.sku || undefined}
          productFamilyId={variant.family_id ?? undefined}
          open={isTranslatePanelOpen}
          onOpenChange={setIsTranslatePanelOpen}
          initialSourceLocaleId={selectedLocaleId ?? undefined}
          marketContextData={{
            locales,
            markets,
            marketLocaleAssignments: marketLocales,
            selectedMarketId,
            selectedChannelId,
            selectedDestinationId,
          }}
        />
      )}
    </div>
  );
}
