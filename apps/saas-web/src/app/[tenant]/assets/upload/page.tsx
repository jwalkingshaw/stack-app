"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Upload,
  X,
  Check,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Video,
  FileText,
  ArrowLeft,
  Loader2,
  ChevronDown,
  ChevronRight,
  Link2,
  Search,
  SlidersHorizontal,
  Undo2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { consumeStagedAssetUploadFiles } from "@/lib/asset-upload-staging";
import {
  AuthoringScopePicker,
  AuthoringScopeValue,
  createGlobalAuthoringScope,
  getAuthoringScopeSummary,
  normalizeAuthoringScope,
} from "@/components/scope/authoring-scope-picker";

// Types

type UploadStatus = "pending" | "uploading" | "completed" | "failed";

type ProductSummary = {
  id: string;
  sku?: string;
  productName: string;
  brand?: string;
  type?: string;
  parentId?: string | null;
  imageUrl?: string | null;
};

type VariantSummary = {
  id: string;
  sku?: string;
  productName: string;
  parentId: string;
  imageUrl?: string | null;
};

type ProductSelection = {
  all: boolean;
  productIds: string[];
  variantIdsByProduct: Record<string, string[]>;
};

type AssetMetadata = {
  name: string;
  description: string;
  tags: string[];
  categories: string[];
  keywords: string[];
  usageGroupId?: string;
  productLinks: ProductSelection;
  authoringScope: AuthoringScopeValue;
  autoSuggestedProductLinks?: boolean;
  suggestedProductLinkConfidence?: number;
  suggestedProductLinkReason?: string;
  appliesToChildren: boolean;
  folderId?: string | null;
};

type ProductLinkSuggestion = {
  selection: ProductSelection;
  confidence: number;
  reason: string;
};

type AssetUpload = {
  id: string;
  file: File;
  preview?: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  metadata: AssetMetadata;
  serverAssetId?: string;
  dynamicSetMatches?: Array<{ id: string; name: string }>;
};

type AssetUploadRow = AssetUpload & {
  fileLabel?: string;
  description?: string;
  usageGroupId?: string;
  tags?: string[];
  categories?: string[];
  keywords?: string[];
  productLinks?: ProductSelection;
  authoringScope?: AuthoringScopeValue;
  appliesToChildren?: boolean;
  validation?: string[];
  actions?: string;
};

type FolderData = {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
};

type UploadProfile = {
  id: string;
  label: string;
  summary: string;
  requirements: {
    title: boolean;
    description: boolean;
    tags: boolean;
    productLink: boolean;
    usageGroup: boolean;
  };
};

type BulkCollectionMode = "no-change" | "append" | "replace" | "clear";
type BulkUsageGroupMode = "no-change" | "set" | "clear";
type BulkProductMode = "no-change" | "replace" | "clear";
type BulkInheritanceMode = "no-change" | "set-on" | "set-off";
type BulkScopeMode = "no-change" | "set" | "add" | "clear";

type BulkEditUndoSnapshot = {
  assetIds: string[];
  metadataByAssetId: Record<string, AssetMetadata>;
  assetCount: number;
  createdAt: number;
};

type BulkOperationSummaryItem = {
  key: string;
  label: string;
  detail: string;
};

const USAGE_GROUP_OPTIONS = [
  { id: "specifications", label: "Specifications" },
  { id: "marketing", label: "Marketing" },
  { id: "compliance", label: "Compliance" },
  { id: "training", label: "Training" },
  { id: "sales", label: "Sales" },
  { id: "packaging", label: "Packaging" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "regulatory", label: "Regulatory" }
];

const AUTOMATION_USAGE_GROUP_RULES: Array<{ usageGroupId: string; keywords: string[] }> = [
  { usageGroupId: "regulatory", keywords: ["coa", "legal", "regulatory", "compliance", "cert", "certificate", "msds"] },
  { usageGroupId: "specifications", keywords: ["spec", "specification", "datasheet", "tech", "technical"] },
  { usageGroupId: "marketing", keywords: ["marketing", "campaign", "social", "ad", "advert"] },
  { usageGroupId: "packaging", keywords: ["pack", "packaging", "label", "carton"] },
  { usageGroupId: "training", keywords: ["training", "manual", "guide", "howto", "how-to"] },
  { usageGroupId: "sales", keywords: ["sales", "sellsheet", "sell-sheet", "linecard", "line-card"] },
  { usageGroupId: "lifestyle", keywords: ["lifestyle", "ugc", "in-use", "inuse"] },
];

const UPLOAD_PROFILES: UploadProfile[] = [
  {
    id: "fast",
    label: "Fast Upload",
    summary: "Requires title only. Best for quick ingestion.",
    requirements: {
      title: true,
      description: false,
      tags: false,
      productLink: false,
      usageGroup: false,
    },
  },
  {
    id: "standard",
    label: "Standard DAM",
    summary: "Requires title, tags, product link, and usage group.",
    requirements: {
      title: true,
      description: false,
      tags: true,
      productLink: true,
      usageGroup: true,
    },
  },
  {
    id: "compliance",
    label: "Compliance",
    summary: "Requires title, description, tags, product link, and usage group.",
    requirements: {
      title: true,
      description: true,
      tags: true,
      productLink: true,
      usageGroup: true,
    },
  },
];

const createEmptySelection = (): ProductSelection => ({
  all: false,
  productIds: [],
  variantIdsByProduct: {}
});

const cloneProductSelection = (selection: ProductSelection): ProductSelection => ({
  all: selection.all,
  productIds: [...selection.productIds],
  variantIdsByProduct: Object.fromEntries(
    Object.entries(selection.variantIdsByProduct).map(([productId, variantIds]) => [productId, [...variantIds]])
  )
});

const cloneAuthoringScopeValue = (scope: AuthoringScopeValue): AuthoringScopeValue => ({
  mode: scope.mode,
  marketIds: [...scope.marketIds],
  channelIds: [...scope.channelIds],
  localeIds: [...scope.localeIds],
  destinationIds: [...scope.destinationIds],
});

const mergeAuthoringScopes = (
  currentScope: AuthoringScopeValue,
  incomingScope: AuthoringScopeValue
): AuthoringScopeValue => {
  const current = normalizeAuthoringScope(currentScope);
  const incoming = normalizeAuthoringScope(incomingScope);

  if (incoming.mode !== "scoped") {
    return cloneAuthoringScopeValue(current);
  }
  if (current.mode !== "scoped") {
    return cloneAuthoringScopeValue(incoming);
  }

  return normalizeAuthoringScope({
    mode: "scoped",
    marketIds: Array.from(new Set([...current.marketIds, ...incoming.marketIds])),
    channelIds: Array.from(new Set([...current.channelIds, ...incoming.channelIds])),
    localeIds: Array.from(new Set([...current.localeIds, ...incoming.localeIds])),
    destinationIds: Array.from(new Set([...current.destinationIds, ...incoming.destinationIds])),
  });
};

const cloneAssetMetadata = (metadata: AssetMetadata): AssetMetadata => ({
  name: metadata.name,
  description: metadata.description,
  tags: [...metadata.tags],
  categories: [...metadata.categories],
  keywords: [...metadata.keywords],
  usageGroupId: metadata.usageGroupId,
  productLinks: cloneProductSelection(metadata.productLinks),
  authoringScope: cloneAuthoringScopeValue(normalizeAuthoringScope(metadata.authoringScope)),
  autoSuggestedProductLinks: metadata.autoSuggestedProductLinks,
  suggestedProductLinkConfidence: metadata.suggestedProductLinkConfidence,
  suggestedProductLinkReason: metadata.suggestedProductLinkReason,
  appliesToChildren: metadata.appliesToChildren,
  folderId: metadata.folderId
});

const splitTokens = (value: string) =>
  value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

const formatFileSize = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const order = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, order);
  return `${size.toFixed(order === 0 ? 0 : 1)} ${units[order]}`;
};

const applyCollectionMode = (params: {
  current: string[];
  mode: BulkCollectionMode;
  input: string;
}): string[] => {
  const { current, mode, input } = params;
  if (mode === "no-change") return current;
  if (mode === "clear") return [];

  const tokens = splitTokens(input);
  if (mode === "replace") {
    return Array.from(new Set(tokens));
  }
  if (mode === "append") {
    return Array.from(new Set([...current, ...tokens]));
  }
  return current;
};

const formatCollectionModeLabel = (mode: BulkCollectionMode): string => {
  if (mode === "append") return "Append";
  if (mode === "replace") return "Replace";
  if (mode === "clear") return "Clear";
  return "No change";
};

const hasProductSelection = (selection: ProductSelection) => {
  if (selection.all) return true;
  if (selection.productIds.length > 0) return true;
  return Object.values(selection.variantIdsByProduct).some((list) => list.length > 0);
};

const getVariantCount = (selection: ProductSelection) =>
  Object.values(selection.variantIdsByProduct).reduce((sum, list) => sum + list.length, 0);

const formatProductSummary = (selection: ProductSelection) => {
  if (selection.all) return "All products";
  const parentCount = selection.productIds.length;
  const variantCount = getVariantCount(selection);
  if (parentCount === 0 && variantCount === 0) return "Select products";
  const parentText = parentCount > 0 ? `${parentCount} parent${parentCount === 1 ? "" : "s"}` : "";
  const variantText = variantCount > 0 ? `${variantCount} variant${variantCount === 1 ? "" : "s"}` : "";
  if (parentText && variantText) return `${parentText} - ${variantText}`;
  return parentText || variantText;
};

const formatSuggestionConfidence = (confidence?: number): string => {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) {
    return "Suggested";
  }
  const percent = Math.max(0, Math.min(100, Math.round(confidence * 100)));
  const band = percent >= 90 ? "High" : percent >= 70 ? "Medium" : "Low";
  return `Suggested ${band} (${percent}%)`;
};

const getUsageGroupLabel = (usageGroupId?: string): string => {
  if (!usageGroupId) return "Unknown";
  return USAGE_GROUP_OPTIONS.find((option) => option.id === usageGroupId)?.label || usageGroupId;
};

const deriveUsageGroupSuggestion = (asset: AssetUpload): string | undefined => {
  if (asset.metadata.usageGroupId) return undefined;

  const haystack = [
    asset.metadata.name,
    ...asset.metadata.tags,
    ...asset.metadata.categories,
    ...asset.metadata.keywords,
    asset.file.type
  ]
    .join(" ")
    .toLowerCase();

  if (!haystack.trim()) return undefined;

  for (const rule of AUTOMATION_USAGE_GROUP_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return rule.usageGroupId;
    }
  }

  if (asset.file.type === "application/pdf") {
    return "regulatory";
  }

  return undefined;
};

const getValidationIssues = (asset: AssetUpload, profile: UploadProfile): string[] => {
  const issues: string[] = [];
  const { requirements } = profile;

  if (requirements.title && !asset.metadata.name.trim()) {
    issues.push("Missing title");
  }
  if (requirements.description && !asset.metadata.description.trim()) {
    issues.push("Missing description");
  }
  if (requirements.tags && asset.metadata.tags.length === 0) {
    issues.push("Missing tags");
  }
  if (requirements.productLink && !hasProductSelection(asset.metadata.productLinks)) {
    issues.push("Missing product");
  }
  if (requirements.usageGroup && !asset.metadata.usageGroupId) {
    issues.push("Missing usage group");
  }

  return issues;
};

const normalizeForMatch = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const suggestProductLinksFromFilename = (
  filename: string,
  products: ProductSummary[]
): ProductLinkSuggestion | null => {
  const normalized = normalizeForMatch(filename);
  if (!normalized) return null;

  let best: ProductSummary | null = null;
  let bestScore = 0;
  let bestReason = "";

  for (const product of products) {
    let score = 0;
    let reason = "";
    const sku = normalizeForMatch(product.sku || "");
    const name = normalizeForMatch(product.productName || "");
    const isVariant = Boolean(product.parentId);

    if (sku && normalized.includes(sku)) {
      score += isVariant ? 12 : 10;
      reason = isVariant ? "Filename matched variant SKU" : "Filename matched parent SKU";
    }

    if (name) {
      const parts = name.split(" ").filter((part) => part.length >= 4);
      const matchedPartCount = parts.filter((part) => normalized.includes(part)).length;
      score += Math.min(isVariant ? 5 : 4, matchedPartCount);
      if (!reason && matchedPartCount > 0) {
        reason = `Filename matched ${matchedPartCount} ${isVariant ? "variant" : "product"} name token${matchedPartCount === 1 ? "" : "s"}`;
      }
    }

    if (score > bestScore) {
      best = product;
      bestScore = score;
      bestReason = reason;
    }
  }

  if (!best || bestScore < 3) return null;

  let confidence = 0.55;
  if (bestScore >= 12) {
    confidence = 0.96;
  } else if (bestScore >= 10) {
    confidence = 0.92;
  } else if (bestScore >= 7) {
    confidence = 0.8;
  } else if (bestScore >= 4) {
    confidence = 0.68;
  }

  const selection: ProductSelection = best.parentId
    ? {
        all: false,
        productIds: [],
        variantIdsByProduct: {
          [best.parentId]: [best.id]
        }
      }
    : {
        all: false,
        productIds: [best.id],
        variantIdsByProduct: {}
      };

  return {
    selection,
    confidence,
    reason: bestReason || "Filename similarity match"
  };
};

const toggleAllSelection = (selection: ProductSelection): ProductSelection => {
  if (selection.all) {
    return { ...selection, all: false };
  }
  return {
    all: true,
    productIds: [],
    variantIdsByProduct: {}
  };
};

const toggleProductSelection = (selection: ProductSelection, productId: string): ProductSelection => {
  const productIds = new Set(selection.productIds);
  if (productIds.has(productId)) {
    productIds.delete(productId);
  } else {
    productIds.add(productId);
  }
  return {
    all: false,
    productIds: Array.from(productIds),
    variantIdsByProduct: selection.variantIdsByProduct
  };
};

const toggleVariantSelection = (
  selection: ProductSelection,
  productId: string,
  variantId: string
): ProductSelection => {
  const next = {
    all: false,
    productIds: selection.productIds,
    variantIdsByProduct: { ...selection.variantIdsByProduct }
  };
  const current = new Set(next.variantIdsByProduct[productId] || []);
  if (current.has(variantId)) {
    current.delete(variantId);
  } else {
    current.add(variantId);
  }
  if (current.size === 0) {
    delete next.variantIdsByProduct[productId];
  } else {
    next.variantIdsByProduct[productId] = Array.from(current);
  }
  return next;
};

const getStatusLabel = (status: UploadStatus) => {
  switch (status) {
    case "uploading":
      return "Uploading";
    case "completed":
      return "Uploaded";
    case "failed":
      return "Failed";
    default:
      return "Pending";
  }
};

const getStatusColor = (status: UploadStatus) => {
  switch (status) {
    case "uploading":
      return "text-blue-600";
    case "completed":
      return "text-green-600";
    case "failed":
      return "text-red-600";
    default:
      return "text-muted-foreground";
  }
};

const TagInput = ({ value, onChange, placeholder, ariaLabel }: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
}) => {
  const [inputValue, setInputValue] = useState("");

  const addTokens = useCallback(
    (raw: string) => {
      const tokens = splitTokens(raw);
      if (tokens.length === 0) return;
      const next = Array.from(new Set([...(value || []), ...tokens]));
      onChange(next);
      setInputValue("");
    },
    [value, onChange]
  );

  const removeToken = (token: string) => {
    onChange(value.filter((item) => item !== token));
  };

  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs">
      {value.map((token) => (
        <Badge key={token} variant="secondary" className="flex items-center gap-1 px-2 py-0.5 text-xs">
          {token}
          <button
            type="button"
            onClick={() => removeToken(token)}
            className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        aria-label={ariaLabel}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onBlur={() => addTokens(inputValue)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addTokens(inputValue);
          }
          if (event.key === "Backspace" && inputValue.length === 0 && value.length > 0) {
            removeToken(value[value.length - 1]);
          }
        }}
        className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        placeholder={placeholder}
      />
    </div>
  );
};

const ProductLinkDialog = ({
  open,
  onOpenChange,
  title,
  description,
  actionLabel = "Done",
  products,
  variantsByProductId,
  variantsLoadingByProductId,
  selection,
  onChange,
  onLoadVariants,
  onApply
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  actionLabel?: string;
  products: ProductSummary[];
  variantsByProductId: Record<string, VariantSummary[]>;
  variantsLoadingByProductId: Record<string, boolean>;
  selection: ProductSelection;
  onChange: (selection: ProductSelection) => void;
  onLoadVariants: (productId: string) => void;
  onApply?: () => void;
}) => {
  const [search, setSearch] = useState("");
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  const filteredProducts = useMemo(() => {
    const parentProducts = products.filter((product) => !product.parentId);
    if (!search.trim()) return parentProducts;
    const query = search.toLowerCase();
    return parentProducts.filter((product) => {
      const haystack = `${product.productName || ""} ${product.sku || ""} ${product.brand || ""}`
        .toLowerCase()
        .trim();
      return haystack.includes(query);
    });
  }, [products, search]);

  const handleToggleExpand = (productId: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
        if (!variantsByProductId[productId]) {
          onLoadVariants(productId);
        }
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Tip: select a parent product, then keep <strong>Applies to Children</strong> on to auto-link current variants and future variants created under that parent.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products or SKU"
              className="pl-9"
            />
          </div>

          <div className="rounded-lg border border-border bg-background">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={selection.all}
                onChange={() => onChange(toggleAllSelection(selection))}
                className="h-4 w-4 rounded border-border"
              />
              <span className="font-medium text-foreground">All products</span>
              <span className="text-xs text-muted-foreground">Links this asset to every product</span>
            </div>

            <div className="max-h-[420px] overflow-y-auto px-2 py-2">
              {filteredProducts.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">No products found.</div>
              ) : (
                filteredProducts.map((product) => {
                  const isExpanded = expandedProducts.has(product.id);
                  const variants = variantsByProductId[product.id] || [];
                  const isLoadingVariants = variantsLoadingByProductId[product.id];
                  const variantIds = selection.variantIdsByProduct[product.id] || [];

                  return (
                    <div key={product.id} className="rounded-md px-2 py-2 hover:bg-muted/40">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleExpand(product.id)}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border"
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <input
                          type="checkbox"
                          checked={selection.productIds.includes(product.id)}
                          onChange={() => onChange(toggleProductSelection({ ...selection, all: false }, product.id))}
                          className="h-4 w-4 rounded border-border"
                        />
                        <div className="h-8 w-8 overflow-hidden rounded-md border border-border bg-muted/30">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.productName || "Product"} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">IMG</div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground">{product.productName || "Unnamed product"}</div>
                          <div className="text-xs text-muted-foreground">
                            {product.sku ? `SKU ${product.sku}` : "No SKU"}
                            {product.brand ? ` - ${product.brand}` : ""}
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="ml-12 mt-2 space-y-1">
                          {isLoadingVariants ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Loading variants
                            </div>
                          ) : variants.length === 0 ? (
                            <div className="text-xs text-muted-foreground">No variants</div>
                          ) : (
                            variants.map((variant) => (
                              <label
                                key={variant.id}
                                className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-foreground hover:bg-muted/40"
                              >
                                <input
                                  type="checkbox"
                                  checked={variantIds.includes(variant.id)}
                                  onChange={() => onChange(toggleVariantSelection(selection, product.id, variant.id))}
                                  className="h-3.5 w-3.5 rounded border-border"
                                />
                                <div className="h-6 w-6 overflow-hidden rounded border border-border bg-muted/30">
                                  {variant.imageUrl ? (
                                    <img src={variant.imageUrl} alt={variant.productName || "Variant"} className="h-full w-full object-cover" />
                                  ) : null}
                                </div>
                                <span className="flex-1">
                                  {variant.productName || "Variant"}
                                  {variant.sku ? ` (${variant.sku})` : ""}
                                </span>
                              </label>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-8 px-3 text-sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="h-8 px-3 text-sm"
            onClick={() => {
              onApply?.();
              onOpenChange(false);
            }}
          >
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
export default function ModernUploadPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantSlug = params.tenant as string;
  const initialFolderParam = searchParams.get("folderId");
  const initialFolderId =
    initialFolderParam && initialFolderParam !== "none" ? initialFolderParam : null;
  const stagedUploadToken = searchParams.get("uploadToken");

  const [assets, setAssets] = useState<AssetUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [variantsByProductId, setVariantsByProductId] = useState<Record<string, VariantSummary[]>>({});
  const [variantsLoadingByProductId, setVariantsLoadingByProductId] = useState<Record<string, boolean>>({});
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(initialFolderId);
  const [activeProductDialogId, setActiveProductDialogId] = useState<string | null>(null);
  const [activeScopeDialogId, setActiveScopeDialogId] = useState<string | null>(null);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [bulkProductDialogOpen, setBulkProductDialogOpen] = useState(false);
  const [bulkUsageGroupMode, setBulkUsageGroupMode] = useState<BulkUsageGroupMode>("no-change");
  const [bulkProductSelection, setBulkProductSelection] = useState<ProductSelection>(createEmptySelection());
  const [bulkProductMode, setBulkProductMode] = useState<BulkProductMode>("no-change");
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [bulkTagsMode, setBulkTagsMode] = useState<BulkCollectionMode>("no-change");
  const [bulkUsageGroupId, setBulkUsageGroupId] = useState("");
  const [bulkTags, setBulkTags] = useState("");
  const [bulkCategoriesMode, setBulkCategoriesMode] = useState<BulkCollectionMode>("no-change");
  const [bulkCategories, setBulkCategories] = useState("");
  const [bulkKeywordsMode, setBulkKeywordsMode] = useState<BulkCollectionMode>("no-change");
  const [bulkKeywords, setBulkKeywords] = useState("");
  const [bulkInheritanceMode, setBulkInheritanceMode] = useState<BulkInheritanceMode>("no-change");
  const [bulkScopeMode, setBulkScopeMode] = useState<BulkScopeMode>("no-change");
  const [bulkScopeValue, setBulkScopeValue] = useState<AuthoringScopeValue>(createGlobalAuthoringScope());
  const [lastBulkEditSnapshot, setLastBulkEditSnapshot] = useState<BulkEditUndoSnapshot | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [savingState, setSavingState] = useState<Record<string, "idle" | "saving" | "error">>({});
  const [selectedUploadProfileId, setSelectedUploadProfileId] = useState<string>("standard");
  const [uploadAuthoringScope, setUploadAuthoringScope] = useState<AuthoringScopeValue>(
    createGlobalAuthoringScope()
  );
  const assetsRef = useRef<AssetUpload[]>([]);
  const saveTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const stagedUploadTokenRef = useRef<string | null>(null);
  const activeUploadProfile = useMemo(
    () => UPLOAD_PROFILES.find((profile) => profile.id === selectedUploadProfileId) || UPLOAD_PROFILES[1],
    [selectedUploadProfileId]
  );

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(
    () => () => {
      for (const timer of Object.values(saveTimers.current)) {
        clearTimeout(timer);
      }
    },
    []
  );

  useEffect(() => {
    if (!tenantSlug) return;

    const fetchProducts = async () => {
      try {
        const response = await fetch(`/api/${tenantSlug}/products/basic`);
        if (!response.ok) {
          throw new Error(`Failed to fetch products (${response.status})`);
        }
        const payload = await response.json();
        setProducts((payload?.data || []) as ProductSummary[]);
        setProductError(null);
      } catch (error) {
        console.error("Failed to load products", error);
        setProductError("Products could not be loaded. You can still fill other fields and upload.");
      }
    };

    fetchProducts();
  }, [tenantSlug]);

  useEffect(() => {
    if (!tenantSlug) return;

    const fetchFolders = async () => {
      try {
        const response = await fetch(`/api/organizations/${tenantSlug}/assets/folders`);
        if (!response.ok) {
          throw new Error(`Failed to fetch folders (${response.status})`);
        }
        const payload = await response.json();
        setFolders((payload?.data || []) as FolderData[]);
      } catch (error) {
        console.error("Failed to load folders", error);
        setFolders([]);
      }
    };

    fetchFolders();
  }, [tenantSlug]);

  useEffect(() => {
    if (products.length === 0) return;
    setAssets((prev) =>
      prev.map((asset) => {
        if (hasProductSelection(asset.metadata.productLinks) || asset.metadata.autoSuggestedProductLinks) {
          return asset;
        }
        const suggested = suggestProductLinksFromFilename(
          asset.file.name,
          products
        );
        if (!suggested) return asset;
        return {
          ...asset,
          metadata: {
            ...asset.metadata,
            productLinks: suggested.selection,
            autoSuggestedProductLinks: true,
            suggestedProductLinkConfidence: suggested.confidence,
            suggestedProductLinkReason: suggested.reason,
          },
        };
      })
    );
  }, [products]);

  const loadVariants = useCallback(
    async (productId: string) => {
      if (variantsByProductId[productId] || variantsLoadingByProductId[productId]) return;
      setVariantsLoadingByProductId((prev) => ({ ...prev, [productId]: true }));
      try {
        const response = await fetch(`/api/${tenantSlug}/products/${productId}/variants`);
        if (!response.ok) {
          throw new Error("Failed to load variants");
        }
        const payload = await response.json();
        const variants = (payload?.data || []).map((variant: any) => ({
          id: variant.id,
          sku: variant.sku,
          productName: variant.product_name || variant.productName,
          parentId: productId,
          imageUrl: variant.primary_image_url || variant.primaryImageUrl || null
        }));
        setVariantsByProductId((prev) => ({ ...prev, [productId]: variants }));
      } catch (error) {
        console.error("Failed to load variants", error);
        setVariantsByProductId((prev) => ({ ...prev, [productId]: [] }));
      } finally {
        setVariantsLoadingByProductId((prev) => ({ ...prev, [productId]: false }));
      }
    },
    [tenantSlug, variantsByProductId, variantsLoadingByProductId]
  );

  const selectedCount = selectedAssetIds.size;
  const selectedAssetIdsArray = useMemo(() => Array.from(selectedAssetIds), [selectedAssetIds]);
  const selectedUploadedCount = useMemo(
    () => assets.filter((asset) => selectedAssetIds.has(asset.id) && Boolean(asset.serverAssetId)).length,
    [assets, selectedAssetIds]
  );
  const selectedAutomationSuggestionCount = useMemo(
    () =>
      assets.filter(
        (asset) =>
          selectedAssetIds.has(asset.id) &&
          !asset.metadata.usageGroupId &&
          Boolean(deriveUsageGroupSuggestion(asset))
      ).length,
    [assets, selectedAssetIds]
  );

  const toggleSelectAll = () => {
    if (selectedAssetIds.size === assets.length) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(assets.map((asset) => asset.id)));
    }
  };

  const toggleSelectAsset = (assetId: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedAssetIds(new Set());
  };

  const applyAuthoringScopeToQueuedAssets = useCallback((scope: AuthoringScopeValue) => {
    const normalizedScope = normalizeAuthoringScope(scope);
    setUploadAuthoringScope(cloneAuthoringScopeValue(normalizedScope));

    setAssets((prev) =>
      prev.map((asset) =>
        asset.status === "completed"
          ? asset
          : {
              ...asset,
              metadata: {
                ...asset.metadata,
                authoringScope: cloneAuthoringScopeValue(normalizedScope),
              },
            }
      )
    );
  }, []);

  const resetBulkEditorForm = () => {
    setBulkUsageGroupMode("no-change");
    setBulkUsageGroupId("");
    setBulkTagsMode("no-change");
    setBulkTags("");
    setBulkCategoriesMode("no-change");
    setBulkCategories("");
    setBulkKeywordsMode("no-change");
    setBulkKeywords("");
    setBulkProductMode("no-change");
    setBulkProductSelection(createEmptySelection());
    setBulkInheritanceMode("no-change");
    setBulkScopeMode("no-change");
    setBulkScopeValue(createGlobalAuthoringScope());
  };

  const applyFolderToAssets = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    const uploadedAssetIds = assetsRef.current
      .filter((asset) => Boolean(asset.serverAssetId))
      .map((asset) => asset.id);
    setAssets((prev) =>
      prev.map((asset) => ({
        ...asset,
        metadata: {
          ...asset.metadata,
          folderId
        }
      }))
    );
    uploadedAssetIds.forEach((assetId) => scheduleSave(assetId));
  };

  const applyAutomationSuggestionsToSelected = () => {
    const selectedSet = new Set(selectedAssetIdsArray);
    const selectedAssets = assetsRef.current.filter((asset) => selectedSet.has(asset.id));
    if (selectedAssets.length === 0) return;

    const metadataByAssetId: Record<string, AssetMetadata> = {};
    const changedAssetIds: string[] = [];
    for (const asset of selectedAssets) {
      metadataByAssetId[asset.id] = cloneAssetMetadata(asset.metadata);
      if (!asset.metadata.usageGroupId && deriveUsageGroupSuggestion(asset)) {
        changedAssetIds.push(asset.id);
      }
    }
    if (changedAssetIds.length === 0) return;

    setLastBulkEditSnapshot({
      assetIds: selectedAssetIdsArray,
      metadataByAssetId,
      assetCount: selectedAssets.length,
      createdAt: Date.now()
    });

    const changedSet = new Set(changedAssetIds);
    setAssets((prev) =>
      prev.map((asset) => {
        if (!changedSet.has(asset.id)) return asset;
        const suggestedUsageGroupId = deriveUsageGroupSuggestion(asset);
        if (!suggestedUsageGroupId) return asset;
        return {
          ...asset,
          metadata: {
            ...asset.metadata,
            usageGroupId: suggestedUsageGroupId
          }
        };
      })
    );

    const uploadedChangedAssetIds = assetsRef.current
      .filter((asset) => changedSet.has(asset.id) && Boolean(asset.serverAssetId))
      .map((asset) => asset.id);
    uploadedChangedAssetIds.forEach((assetId) => {
      scheduleSave(assetId);
    });
  };

  const canApplyBulkEdit = useMemo(() => {
    if (selectedAssetIdsArray.length === 0) return false;
    const hasAnyOperation =
      bulkUsageGroupMode !== "no-change" ||
      bulkTagsMode !== "no-change" ||
      bulkCategoriesMode !== "no-change" ||
      bulkKeywordsMode !== "no-change" ||
      bulkProductMode !== "no-change" ||
      bulkInheritanceMode !== "no-change" ||
      bulkScopeMode !== "no-change";

    if (!hasAnyOperation) return false;
    if (bulkUsageGroupMode === "set" && !bulkUsageGroupId) return false;
    if ((bulkTagsMode === "append" || bulkTagsMode === "replace") && splitTokens(bulkTags).length === 0) {
      return false;
    }
    if (
      (bulkCategoriesMode === "append" || bulkCategoriesMode === "replace") &&
      splitTokens(bulkCategories).length === 0
    ) {
      return false;
    }
    if ((bulkKeywordsMode === "append" || bulkKeywordsMode === "replace") && splitTokens(bulkKeywords).length === 0) {
      return false;
    }
    if (bulkProductMode === "replace" && !hasProductSelection(bulkProductSelection)) {
      return false;
    }
    if (bulkScopeMode === "add") {
      const normalizedScope = normalizeAuthoringScope(bulkScopeValue);
      const hasScopedDimensions =
        normalizedScope.mode === "scoped" &&
        (normalizedScope.marketIds.length > 0 ||
          normalizedScope.channelIds.length > 0 ||
          normalizedScope.localeIds.length > 0 ||
          normalizedScope.destinationIds.length > 0);
      if (!hasScopedDimensions) return false;
    }
    return true;
  }, [
    selectedAssetIdsArray,
    bulkUsageGroupMode,
    bulkUsageGroupId,
    bulkTagsMode,
    bulkTags,
    bulkCategoriesMode,
    bulkCategories,
    bulkKeywordsMode,
    bulkKeywords,
    bulkProductMode,
    bulkProductSelection,
    bulkInheritanceMode,
    bulkScopeMode,
    bulkScopeValue
  ]);

  const bulkOperationSummary = useMemo<BulkOperationSummaryItem[]>(() => {
    const items: BulkOperationSummaryItem[] = [];

    if (bulkUsageGroupMode === "set" && bulkUsageGroupId) {
      const option = USAGE_GROUP_OPTIONS.find((entry) => entry.id === bulkUsageGroupId);
      items.push({
        key: "usageGroup",
        label: "Usage group",
        detail: `Set to ${option?.label || bulkUsageGroupId}`,
      });
    } else if (bulkUsageGroupMode === "clear") {
      items.push({
        key: "usageGroup",
        label: "Usage group",
        detail: "Clear value",
      });
    }

    if (bulkTagsMode !== "no-change") {
      const tokenCount = splitTokens(bulkTags).length;
      items.push({
        key: "tags",
        label: "Tags",
        detail:
          bulkTagsMode === "clear"
            ? "Clear all tags"
            : `${formatCollectionModeLabel(bulkTagsMode)} ${tokenCount} tag${tokenCount === 1 ? "" : "s"}`,
      });
    }

    if (bulkCategoriesMode !== "no-change") {
      const tokenCount = splitTokens(bulkCategories).length;
      items.push({
        key: "categories",
        label: "Categories",
        detail:
          bulkCategoriesMode === "clear"
            ? "Clear all categories"
            : `${formatCollectionModeLabel(bulkCategoriesMode)} ${tokenCount} categor${tokenCount === 1 ? "y" : "ies"}`,
      });
    }

    if (bulkKeywordsMode !== "no-change") {
      const tokenCount = splitTokens(bulkKeywords).length;
      items.push({
        key: "keywords",
        label: "Keywords",
        detail:
          bulkKeywordsMode === "clear"
            ? "Clear all keywords"
            : `${formatCollectionModeLabel(bulkKeywordsMode)} ${tokenCount} keyword${tokenCount === 1 ? "" : "s"}`,
      });
    }

    if (bulkProductMode === "replace") {
      items.push({
        key: "products",
        label: "Product links",
        detail: `Replace with ${formatProductSummary(bulkProductSelection)}`,
      });
    } else if (bulkProductMode === "clear") {
      items.push({
        key: "products",
        label: "Product links",
        detail: "Clear all product links",
      });
    }

    if (bulkInheritanceMode === "set-on") {
      items.push({
        key: "inheritance",
        label: "Inheritance",
        detail: "Set to apply to children",
      });
    } else if (bulkInheritanceMode === "set-off") {
      items.push({
        key: "inheritance",
        label: "Inheritance",
        detail: "Set to not apply to children",
      });
    }

    if (bulkScopeMode === "set") {
      items.push({
        key: "scope",
        label: "Authoring scope",
        detail: `Set to ${getAuthoringScopeSummary(bulkScopeValue)}`,
      });
    } else if (bulkScopeMode === "add") {
      items.push({
        key: "scope",
        label: "Authoring scope",
        detail: `Add ${getAuthoringScopeSummary(bulkScopeValue)}`,
      });
    } else if (bulkScopeMode === "clear") {
      items.push({
        key: "scope",
        label: "Authoring scope",
        detail: "Clear to Global",
      });
    }

    return items;
  }, [
    bulkUsageGroupMode,
    bulkUsageGroupId,
    bulkTagsMode,
    bulkTags,
    bulkCategoriesMode,
    bulkCategories,
    bulkKeywordsMode,
    bulkKeywords,
    bulkProductMode,
    bulkProductSelection,
    bulkInheritanceMode,
    bulkScopeMode,
    bulkScopeValue
  ]);

  const applyBulkValues = () => {
    if (!canApplyBulkEdit) return;
    const selectedSet = new Set(selectedAssetIdsArray);
    const selectedAssets = assetsRef.current.filter((asset) => selectedSet.has(asset.id));
    if (selectedAssets.length === 0) return;

    const metadataByAssetId: Record<string, AssetMetadata> = {};
    for (const asset of selectedAssets) {
      metadataByAssetId[asset.id] = cloneAssetMetadata(asset.metadata);
    }
    setLastBulkEditSnapshot({
      assetIds: selectedAssetIdsArray,
      metadataByAssetId,
      assetCount: selectedAssets.length,
      createdAt: Date.now()
    });

    setAssets((prev) =>
      prev.map((asset) => {
        if (!selectedSet.has(asset.id)) return asset;
        let nextMetadata = cloneAssetMetadata(asset.metadata);

        if (bulkUsageGroupMode === "set" && bulkUsageGroupId) {
          nextMetadata.usageGroupId = bulkUsageGroupId;
        } else if (bulkUsageGroupMode === "clear") {
          nextMetadata.usageGroupId = undefined;
        }

        nextMetadata.tags = applyCollectionMode({
          current: nextMetadata.tags,
          mode: bulkTagsMode,
          input: bulkTags
        });
        nextMetadata.categories = applyCollectionMode({
          current: nextMetadata.categories,
          mode: bulkCategoriesMode,
          input: bulkCategories
        });
        nextMetadata.keywords = applyCollectionMode({
          current: nextMetadata.keywords,
          mode: bulkKeywordsMode,
          input: bulkKeywords
        });

        if (bulkProductMode === "replace") {
          nextMetadata.productLinks = cloneProductSelection(bulkProductSelection);
          nextMetadata.autoSuggestedProductLinks = false;
          nextMetadata.suggestedProductLinkConfidence = undefined;
          nextMetadata.suggestedProductLinkReason = undefined;
        } else if (bulkProductMode === "clear") {
          nextMetadata.productLinks = createEmptySelection();
          nextMetadata.autoSuggestedProductLinks = false;
          nextMetadata.suggestedProductLinkConfidence = undefined;
          nextMetadata.suggestedProductLinkReason = undefined;
        }

        if (bulkInheritanceMode === "set-on") {
          nextMetadata.appliesToChildren = true;
        } else if (bulkInheritanceMode === "set-off") {
          nextMetadata.appliesToChildren = false;
        }

        if (bulkScopeMode === "set") {
          nextMetadata.authoringScope = cloneAuthoringScopeValue(normalizeAuthoringScope(bulkScopeValue));
        } else if (bulkScopeMode === "add") {
          nextMetadata.authoringScope = mergeAuthoringScopes(nextMetadata.authoringScope, bulkScopeValue);
        } else if (bulkScopeMode === "clear") {
          nextMetadata.authoringScope = createGlobalAuthoringScope();
        }

        return {
          ...asset,
          metadata: nextMetadata
        };
      })
    );

    const selectedUploadedAssetIds = assetsRef.current
      .filter((asset) => selectedSet.has(asset.id) && Boolean(asset.serverAssetId))
      .map((asset) => asset.id);
    selectedUploadedAssetIds.forEach((assetId) => {
      scheduleSave(assetId);
    });

    setBulkEditorOpen(false);
    resetBulkEditorForm();
  };

  const undoLastBulkEdit = () => {
    if (!lastBulkEditSnapshot) return;
    const snapshot = lastBulkEditSnapshot;
    const selectedSet = new Set(snapshot.assetIds);

    setAssets((prev) =>
      prev.map((asset) => {
        const previousMetadata = snapshot.metadataByAssetId[asset.id];
        if (!previousMetadata) return asset;
        return {
          ...asset,
          metadata: cloneAssetMetadata(previousMetadata)
        };
      })
    );

    const uploadedAssetIds = assetsRef.current
      .filter((asset) => selectedSet.has(asset.id) && Boolean(asset.serverAssetId))
      .map((asset) => asset.id);
    uploadedAssetIds.forEach((assetId) => {
      scheduleSave(assetId);
    });

    setLastBulkEditSnapshot(null);
  };

  const updateAssetMetadata = (assetId: string, updates: Partial<AssetMetadata>) => {
    setAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              metadata: {
                ...asset.metadata,
                ...updates,
                autoSuggestedProductLinks:
                  updates.productLinks !== undefined ? false : asset.metadata.autoSuggestedProductLinks,
                suggestedProductLinkConfidence:
                  updates.productLinks !== undefined
                    ? undefined
                    : asset.metadata.suggestedProductLinkConfidence,
                suggestedProductLinkReason:
                  updates.productLinks !== undefined ? undefined : asset.metadata.suggestedProductLinkReason
              }
            }
          : asset
      )
    );
    scheduleSave(assetId);
  };

  const scheduleSave = (assetId: string) => {
    if (saveTimers.current[assetId]) {
      clearTimeout(saveTimers.current[assetId]);
    }
    saveTimers.current[assetId] = setTimeout(() => {
      void saveAsset(assetId);
    }, 600);
  };

  const saveAsset = async (assetId: string) => {
    const asset = assetsRef.current.find((a) => a.id === assetId);
    if (!asset || !asset.serverAssetId) return;

    setSavingState((prev) => ({ ...prev, [assetId]: "saving" }));
    try {
      const payload: Record<string, unknown> = {
        description: asset.metadata.description || null,
        usageGroupId: asset.metadata.usageGroupId ?? null,
        keywords: asset.metadata.keywords,
        tags: asset.metadata.tags,
        categories: asset.metadata.categories,
        folderId: asset.metadata.folderId ?? null,
        productLinks: asset.metadata.productLinks,
        authoringScope: asset.metadata.authoringScope,
        appliesToChildren: asset.metadata.appliesToChildren,
        autoSuggestedProductLinks: asset.metadata.autoSuggestedProductLinks ?? false,
        suggestedProductLinkConfidence: asset.metadata.suggestedProductLinkConfidence ?? null,
        suggestedProductLinkReason: asset.metadata.suggestedProductLinkReason ?? null
      };
      const trimmedFilename = asset.metadata.name.trim();
      if (trimmedFilename.length > 0) {
        payload.filename = trimmedFilename;
      }

      const response = await fetch(`/api/${tenantSlug}/assets/${asset.serverAssetId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to auto-save (${response.status}): ${errorBody || "Unknown error"}`);
      }

      setSavingState((prev) => ({ ...prev, [assetId]: "idle" }));
    } catch (error) {
      console.error("Auto-save failed", { assetId, error });
      setSavingState((prev) => ({ ...prev, [assetId]: "error" }));
    } finally {
      delete saveTimers.current[assetId];
    }
  };

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDragging) setIsDragging(true);
    },
    [isDragging]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    handleFilesAdded(files);
  };

  const handleFilesAdded = (files: File[], folderOverride?: string | null) => {
    const targetFolderId = folderOverride === undefined ? selectedFolderId : folderOverride;
    const newAssets: AssetUpload[] = files.map((file) => {
      const suggestedProductLink = suggestProductLinksFromFilename(
        file.name,
        products
      );
      return {
        id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
        file,
        status: "pending",
        progress: 0,
        metadata: {
          name: file.name.split(".").slice(0, -1).join(".") || file.name,
          description: "",
          tags: [],
          categories: [],
          keywords: [],
          usageGroupId: undefined,
          productLinks: suggestedProductLink?.selection || createEmptySelection(),
          authoringScope: cloneAuthoringScopeValue(uploadAuthoringScope),
          autoSuggestedProductLinks: Boolean(suggestedProductLink),
          suggestedProductLinkConfidence: suggestedProductLink?.confidence,
          suggestedProductLinkReason: suggestedProductLink?.reason,
          appliesToChildren: true,
          folderId: targetFolderId
        }
      };
    });

    newAssets.forEach((asset) => {
      if (asset.file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => {
          setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, preview: reader.result as string } : a)));
        };
        reader.readAsDataURL(asset.file);
      }
    });

    setAssets((prev) => [...prev, ...newAssets]);
    const readyAssets = newAssets.filter(
      (asset) => getValidationIssues(asset, activeUploadProfile).length === 0
    );
    if (readyAssets.length > 0) {
      setTimeout(() => {
        void startUploading(readyAssets);
      }, 300);
    }
  };

  useEffect(() => {
    if (!stagedUploadToken) return;
    if (stagedUploadTokenRef.current === stagedUploadToken) return;

    stagedUploadTokenRef.current = stagedUploadToken;

    const stagedFiles = consumeStagedAssetUploadFiles(stagedUploadToken);
    if (stagedFiles.length > 0) {
      setSelectedFolderId(initialFolderId);
      handleFilesAdded(stagedFiles, initialFolderId);
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("uploadToken");
    const nextQuery = nextParams.toString();
    router.replace(`/${tenantSlug}/assets/upload${nextQuery ? `?${nextQuery}` : ""}`);
  }, [handleFilesAdded, initialFolderId, router, searchParams, stagedUploadToken, tenantSlug]);

  const uploadAsset = async (asset: AssetUpload) => {
    const formData = new FormData();
    formData.append("file", asset.file);
    formData.append(
      "metadata",
      JSON.stringify({
        name: asset.metadata.name,
        description: asset.metadata.description,
        tags: asset.metadata.tags,
        categories: asset.metadata.categories,
        keywords: asset.metadata.keywords,
        usageGroupId: asset.metadata.usageGroupId,
        productLinks: asset.metadata.productLinks,
        authoringScope: asset.metadata.authoringScope,
        appliesToChildren: asset.metadata.appliesToChildren,
        autoSuggestedProductLinks: asset.metadata.autoSuggestedProductLinks ?? false,
        suggestedProductLinkConfidence: asset.metadata.suggestedProductLinkConfidence ?? null,
        suggestedProductLinkReason: asset.metadata.suggestedProductLinkReason ?? null,
        folderId: asset.metadata.folderId ?? null,
        uploadProfileId: selectedUploadProfileId
      })
    );

    const response = await fetch(`/api/${tenantSlug}/assets/upload`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = "Upload failed";
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (Array.isArray(errorJson.validationIssues) && errorJson.validationIssues.length > 0) {
          errorMessage = `${errorMessage}: ${errorJson.validationIssues.join(", ")}`;
        }
      } catch {
        errorMessage = `Upload failed (${response.status})`;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    return result;
  };

  const startUploading = async (assetsToUpload: AssetUpload[]) => {
    if (isUploading) return;
    if (!assetsToUpload || assetsToUpload.length === 0) return;
    setIsUploading(true);

    const uploadQueue = [...assetsToUpload];
    const concurrency = Math.min(4, uploadQueue.length);

    const workers = Array.from({ length: concurrency }, async () => {
      while (uploadQueue.length > 0) {
        const asset = uploadQueue.shift();
        if (!asset) break;

        try {
          setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, status: "uploading" } : a)));

          const result = await uploadAsset(asset);
          const matchedSets = Array.isArray(result?.meta?.dynamicSetMatches?.sets)
            ? (result.meta.dynamicSetMatches.sets as Array<{ id?: string; name?: string }>)
                .filter((set) => typeof set?.id === "string" && typeof set?.name === "string")
                .map((set) => ({ id: String(set.id), name: String(set.name) }))
            : [];

          setAssets((prev) =>
            prev.map((a) =>
              a.id === asset.id
                ? {
                    ...a,
                    status: "completed",
                    progress: 100,
                    serverAssetId: result?.data?.id || a.serverAssetId,
                    dynamicSetMatches: matchedSets
                  }
                : a
            )
          );
        } catch (error) {
          setAssets((prev) =>
            prev.map((a) =>
              a.id === asset.id
                ? {
                    ...a,
                    status: "failed",
                    error: error instanceof Error ? error.message : String(error)
                  }
                : a
            )
          );
        }
      }
    });

    await Promise.all(workers);
    setIsUploading(false);
  };

  const uploadReadyPendingAssets = () => {
    if (isUploading) return;
    if (pendingReadyAssets.length === 0) return;
    void startUploading(pendingReadyAssets);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFilesAdded(files);
    }
  };

  const removeAsset = useCallback((id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) return ImageIcon;
    if (file.type.startsWith("video/")) return Video;
    return FileText;
  };

  const getStatusIcon = (status: UploadStatus) => {
    switch (status) {
      case "uploading":
        return Loader2;
      case "completed":
        return Check;
      case "failed":
        return AlertCircle;
      default:
        return null;
    }
  };

  const completedCount = assets.filter((a) => a.status === "completed").length;
  const failedCount = assets.filter((a) => a.status === "failed").length;
  const suggestedLinkCount = assets.filter((a) => a.metadata.autoSuggestedProductLinks).length;
  const highConfidenceSuggestedLinkCount = assets.filter(
    (asset) =>
      asset.metadata.autoSuggestedProductLinks &&
      typeof asset.metadata.suggestedProductLinkConfidence === "number" &&
      asset.metadata.suggestedProductLinkConfidence >= 0.9
  ).length;
  const assetsWithDynamicSetMatches = useMemo(
    () => assets.filter((asset) => (asset.dynamicSetMatches || []).length > 0),
    [assets]
  );
  const dynamicSetMatchAssetCount = assetsWithDynamicSetMatches.length;
  const dynamicMatchedSetNames = useMemo(
    () =>
      Array.from(
        new Set(
          assetsWithDynamicSetMatches.flatMap((asset) => (asset.dynamicSetMatches || []).map((set) => set.name))
        )
      ),
    [assetsWithDynamicSetMatches]
  );
  const activeAsset = assets.find((asset) => asset.id === activeProductDialogId);
  const activeScopeAsset = assets.find((asset) => asset.id === activeScopeDialogId);
  const validationIssuesByAssetId = useMemo(() => {
    const byId: Record<string, string[]> = {};
    for (const asset of assets) {
      byId[asset.id] = getValidationIssues(asset, activeUploadProfile);
    }
    return byId;
  }, [activeUploadProfile, assets]);
  const pendingReadyAssets = useMemo(
    () =>
      assets.filter(
        (asset) => asset.status === "pending" && (validationIssuesByAssetId[asset.id] || []).length === 0
      ),
    [assets, validationIssuesByAssetId]
  );
  const pendingBlockedAssets = useMemo(
    () =>
      assets.filter(
        (asset) => asset.status === "pending" && (validationIssuesByAssetId[asset.id] || []).length > 0
      ),
    [assets, validationIssuesByAssetId]
  );

  const columns: Column<AssetUploadRow>[] = [
    {
      key: "id",
      label: (
        <input
          type="checkbox"
          checked={assets.length > 0 && selectedAssetIds.size === assets.length}
          onChange={toggleSelectAll}
          className="h-4 w-4 rounded border-border"
        />
      ),
      sortable: false,
      render: (_value, item) => (
        <input
          type="checkbox"
          checked={selectedAssetIds.has(item.id)}
          onChange={() => toggleSelectAsset(item.id)}
          className="h-4 w-4 rounded border-border"
        />
      )
    },
    {
      key: "file",
      label: "File",
      sortable: false,
      render: (_value, item) => {
        const FileIcon = getFileIcon(item.file);
        return (
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-md border border-border bg-muted/30">
              {item.preview ? (
                <img src={item.preview} alt={item.file.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <FileIcon className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">{item.file.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatFileSize(item.file.size)} - {item.file.type.split("/")[0]}
              </div>
            </div>
          </div>
        );
      }
    },
    {
      key: "metadata",
      label: "Name",
      sortable: false,
      className: "min-w-[280px] max-w-[340px]",
      render: (_value, item) => (
        <Input
          value={item.metadata.name}
          onChange={(event) => updateAssetMetadata(item.id, { name: event.target.value })}
          className="h-9 text-xs w-full"
        />
      )
    },
    {
      key: "description",
      label: "Description",
      sortable: false,
      className: "min-w-[260px] max-w-[340px]",
      render: (_value, item) => (
        <Input
          value={item.metadata.description}
          onChange={(event) => updateAssetMetadata(item.id, { description: event.target.value })}
          className="h-9 text-xs w-full"
          placeholder="Describe this asset"
        />
      )
    },
    {
      key: "usageGroupId",
      label: "Usage Group",
      sortable: false,
      className: "min-w-[240px] max-w-[320px]",
      render: (_value, item) => {
        const suggestedUsageGroupId = deriveUsageGroupSuggestion(item);
        return (
          <div className="space-y-1">
            <Select
              value={item.metadata.usageGroupId || "none"}
              onValueChange={(value) =>
                updateAssetMetadata(item.id, {
                  usageGroupId: value === "none" ? undefined : value
                })
              }
            >
              <SelectTrigger className="h-9 w-full text-xs">
                <SelectValue placeholder="Select group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select group</SelectItem>
                {USAGE_GROUP_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!item.metadata.usageGroupId && suggestedUsageGroupId && (
              <div className="text-[11px] text-amber-700">
                Suggested: {getUsageGroupLabel(suggestedUsageGroupId)}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: "tags",
      label: "Tags",
      sortable: false,
      render: (_value, item) => (
        <TagInput
          value={item.metadata.tags}
          onChange={(value) => updateAssetMetadata(item.id, { tags: value })}
          placeholder="Add tag"
          ariaLabel="Tags"
        />
      )
    },
    {
      key: "categories",
      label: "Categories",
      sortable: false,
      render: (_value, item) => (
        <TagInput
          value={item.metadata.categories}
          onChange={(value) => updateAssetMetadata(item.id, { categories: value })}
          placeholder="Add category"
          ariaLabel="Categories"
        />
      )
    },
    {
      key: "keywords",
      label: "Keywords",
      sortable: false,
      render: (_value, item) => (
        <TagInput
          value={item.metadata.keywords}
          onChange={(value) => updateAssetMetadata(item.id, { keywords: value })}
          placeholder="Add keyword"
          ariaLabel="Keywords"
        />
      )
    },
    {
      key: "productLinks",
      label: "Product Link",
      sortable: false,
      render: (_value, item) => (
        <Button
          size="sm"
          variant="outline"
          className="h-9 text-xs"
          onClick={() => setActiveProductDialogId(item.id)}
        >
          <Link2 className="mr-2 h-4 w-4" />
          {formatProductSummary(item.metadata.productLinks)}
          {item.metadata.autoSuggestedProductLinks && hasProductSelection(item.metadata.productLinks) && (
            <span
              title={item.metadata.suggestedProductLinkReason || undefined}
              className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
            >
              {formatSuggestionConfidence(item.metadata.suggestedProductLinkConfidence)}
            </span>
          )}
        </Button>
      )
    },
    {
      key: "authoringScope",
      label: "Scope",
      sortable: false,
      className: "min-w-[220px] max-w-[300px]",
      render: (_value, item) => (
        <Button
          size="sm"
          variant="outline"
          className="h-9 text-xs"
          onClick={() => setActiveScopeDialogId(item.id)}
          title={getAuthoringScopeSummary(item.metadata.authoringScope)}
        >
          {getAuthoringScopeSummary(item.metadata.authoringScope)}
        </Button>
      )
    },
    {
      key: "appliesToChildren",
      label: "Children Inheritance",
      sortable: false,
      render: (_value, item) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={item.metadata.appliesToChildren}
            onCheckedChange={(checked) => updateAssetMetadata(item.id, { appliesToChildren: checked })}
          />
          <span className="text-xs text-muted-foreground">
            {item.metadata.appliesToChildren ? "Current + future variants" : "Current selection only"}
          </span>
        </div>
      )
    },
    {
      key: "validation",
      label: "Validation",
      sortable: false,
      className: "min-w-[240px] max-w-[320px]",
      render: (_value, item) => {
        const issues = validationIssuesByAssetId[item.id] || [];
        if (issues.length === 0) {
          return (
            <Badge variant="secondary" className="text-[11px] bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              Ready
            </Badge>
          );
        }

        const visibleIssues = issues.slice(0, 2);
        const hiddenCount = Math.max(0, issues.length - visibleIssues.length);
        return (
          <div className="flex flex-wrap items-center gap-1">
            {visibleIssues.map((issue) => (
              <Badge
                key={`${item.id}-${issue}`}
                variant="secondary"
                className="text-[11px] bg-amber-100 text-amber-800 hover:bg-amber-100"
              >
                {issue}
              </Badge>
            ))}
            {hiddenCount > 0 && (
              <Badge variant="secondary" className="text-[11px]">
                +{hiddenCount} more
              </Badge>
            )}
          </div>
        );
      }
    },
    {
      key: "status",
      label: "Status",
      sortable: false,
      render: (_value, item) => {
        const StatusIcon = getStatusIcon(item.status);
        return (
          <div className="flex items-center gap-2">
            {StatusIcon && (
              <StatusIcon
                className={cn("h-4 w-4", getStatusColor(item.status), {
                  "animate-spin": item.status === "uploading"
                })}
              />
            )}
            <span className={cn("text-xs", getStatusColor(item.status))}>{getStatusLabel(item.status)}</span>
            {item.status === "failed" && item.error && (
              <span className="text-xs text-red-600">- {item.error}</span>
            )}
          </div>
        );
      }
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      render: (_value, item) => (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => removeAsset(item.id)}
        >
          <X className="h-4 w-4" />
        </Button>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => router.push(`/${tenantSlug}/assets`)} className="text-gray-600">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Assets
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Upload Assets</h1>
              <p className="text-gray-600">Drag and drop files anywhere to get started</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-4 shadow-soft">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Upload destination</h2>
              <p className="text-xs text-gray-600">
                Applies to all queued uploads. Profile controls required metadata before upload.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Select
                value={selectedFolderId || "none"}
                onValueChange={(value) => applyFolderToAssets(value === "none" ? null : value)}
              >
                <SelectTrigger className="h-9 min-w-[240px] text-xs">
                  <SelectValue placeholder="Select folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No folder (unfiled)</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.path || folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedUploadProfileId} onValueChange={setSelectedUploadProfileId}>
                <SelectTrigger className="h-9 min-w-[240px] text-xs">
                  <SelectValue placeholder="Select upload profile" />
                </SelectTrigger>
                <SelectContent>
                  {UPLOAD_PROFILES.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-gray-600">{activeUploadProfile.summary}</div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-4 shadow-soft">
          <AuthoringScopePicker
            title="Authoring scope"
            description="Applies to all queued uploads. Header context is for viewing/filtering only unless you apply it here."
            value={uploadAuthoringScope}
            onChange={applyAuthoringScopeToQueuedAssets}
          />
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ease-in-out",
            isDragging ? "border-blue-400 bg-blue-50 scale-[1.01]" : "border-input bg-white hover:border-muted-foreground hover:bg-gray-50"
          )}
        >
          {isDragging && <div className="pointer-events-none absolute inset-0 bg-blue-500/10 rounded-xl flex items-center justify-center"></div>}

          <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Upload your assets</h3>
          <p className="text-gray-600 mb-4 text-sm">Drag and drop files here, or click to browse</p>

          <input
            type="file"
            multiple
            accept="image/*,video/*,.pdf"
            onChange={handleFileInputChange}
            className="hidden"
            id="file-input"
          />
          <Button onClick={() => document.getElementById("file-input")?.click()} className="cursor-pointer">
            Choose Files
          </Button>

          <div className="mt-3 text-xs text-gray-500">Supports: Images, Videos, PDFs - Max 100MB per file</div>
        </div>

        {assets.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-gray-900">Assets ({assets.length})</h2>
                {isUploading && <span className="text-xs text-muted-foreground">Uploading...</span>}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-600">
                  {pendingReadyAssets.length} ready - {pendingBlockedAssets.length} blocked - {completedCount} completed - {failedCount} failed
                </div>
                <Button
                  size="sm"
                  onClick={uploadReadyPendingAssets}
                  disabled={isUploading || pendingReadyAssets.length === 0}
                >
                  Upload ready ({pendingReadyAssets.length})
                </Button>
                {lastBulkEditSnapshot && (
                  <Button size="sm" variant="outline" onClick={undoLastBulkEdit}>
                    <Undo2 className="mr-2 h-4 w-4" />
                    Undo bulk ({lastBulkEditSnapshot.assetCount})
                  </Button>
                )}
              </div>
            </div>

            {productError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {productError}
              </div>
            )}

            {!productError && suggestedLinkCount > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Suggested product links were applied to {suggestedLinkCount} asset{suggestedLinkCount === 1 ? "" : "s"} based on filename/SKU.
                {highConfidenceSuggestedLinkCount > 0
                  ? ` ${highConfidenceSuggestedLinkCount} high-confidence suggestion${highConfidenceSuggestedLinkCount === 1 ? "" : "s"} detected.`
                  : ""}
                {" "}Review them in the Product Link column.
              </div>
            )}

            {dynamicSetMatchAssetCount > 0 && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                Phase 5 rules auto-added {dynamicSetMatchAssetCount} uploaded asset
                {dynamicSetMatchAssetCount === 1 ? "" : "s"} to set
                {dynamicMatchedSetNames.length === 1 ? "" : "s"}.
                {dynamicMatchedSetNames.length > 0
                  ? ` Matched: ${dynamicMatchedSetNames.slice(0, 4).join(", ")}${dynamicMatchedSetNames.length > 4 ? "..." : ""}.`
                  : ""}
              </div>
            )}

            {pendingBlockedAssets.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {pendingBlockedAssets.length} asset{pendingBlockedAssets.length === 1 ? "" : "s"} blocked by the
                active profile. Fill required fields shown in the Validation column, then click{" "}
                <strong>Upload ready</strong>.
              </div>
            )}

            {selectedCount > 0 && (
              <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-foreground">{selectedCount} selected</span>
                  <Button size="sm" onClick={() => setBulkEditorOpen(true)}>
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Bulk edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={applyAutomationSuggestionsToSelected}
                    disabled={selectedAutomationSuggestionCount === 0}
                  >
                    Apply rule suggestions ({selectedAutomationSuggestionCount})
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearSelection}>
                    Clear selection
                  </Button>
                </div>
              </div>
            )}

            <DataTable
              data={assets}
              columns={columns}
              searchable={false}
              sortable={false}
              className="w-full"
              wrapperClassName="overflow-x-auto"
            />
          </div>
        )}

        {assets.length > 0 && assets.some((a) => a.status === "completed") && (
          <div className="bg-card border border-border rounded-xl p-5 text-center shadow-soft">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="text-foreground font-semibold mb-1">Assets uploaded successfully</p>
            <p className="text-muted-foreground text-sm mb-4">You can now organize, tag, and link them to products.</p>
            <Button onClick={() => router.push(`/${tenantSlug}/assets`)}>View All Assets</Button>
          </div>
        )}
      </div>

      <Dialog open={bulkEditorOpen} onOpenChange={setBulkEditorOpen}>
        <DialogContent className="left-auto right-0 top-0 h-screen max-w-xl translate-x-0 translate-y-0 gap-0 rounded-none border-l p-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
          <div className="flex h-full flex-col">
            <DialogHeader className="border-b border-border px-6 py-5">
              <DialogTitle>Bulk edit selected assets</DialogTitle>
              <DialogDescription>
                Apply operations to {selectedCount} selected item{selectedCount === 1 ? "" : "s"}.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-xs">
                <div className="font-medium text-foreground">
                  {selectedCount} selected
                  {selectedUploadedCount > 0 ? ` - ${selectedUploadedCount} already uploaded (will autosave)` : ""}
                </div>
                {bulkOperationSummary.length === 0 ? (
                  <div className="mt-1 text-muted-foreground">No operations selected yet.</div>
                ) : (
                  <div className="mt-2 space-y-1">
                    {bulkOperationSummary.map((item) => (
                      <div key={item.key} className="flex items-start justify-between gap-2">
                        <span className="font-medium text-foreground">{item.label}</span>
                        <span className="text-muted-foreground">{item.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Usage Group</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={bulkUsageGroupMode} onValueChange={(value) => setBulkUsageGroupMode(value as BulkUsageGroupMode)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Operation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no-change">No change</SelectItem>
                      <SelectItem value="set">Set value</SelectItem>
                      <SelectItem value="clear">Clear</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={bulkUsageGroupId || "none"}
                    onValueChange={(value) => setBulkUsageGroupId(value === "none" ? "" : value)}
                    disabled={bulkUsageGroupMode !== "set"}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Usage group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select group</SelectItem>
                      {USAGE_GROUP_OPTIONS.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Tags</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={bulkTagsMode} onValueChange={(value) => setBulkTagsMode(value as BulkCollectionMode)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Operation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no-change">No change</SelectItem>
                      <SelectItem value="append">Append</SelectItem>
                      <SelectItem value="replace">Replace</SelectItem>
                      <SelectItem value="clear">Clear</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={bulkTags}
                    onChange={(event) => setBulkTags(event.target.value)}
                    placeholder="Comma separated tags"
                    className="h-9 text-xs"
                    disabled={bulkTagsMode !== "append" && bulkTagsMode !== "replace"}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Categories</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    value={bulkCategoriesMode}
                    onValueChange={(value) => setBulkCategoriesMode(value as BulkCollectionMode)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Operation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no-change">No change</SelectItem>
                      <SelectItem value="append">Append</SelectItem>
                      <SelectItem value="replace">Replace</SelectItem>
                      <SelectItem value="clear">Clear</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={bulkCategories}
                    onChange={(event) => setBulkCategories(event.target.value)}
                    placeholder="Comma separated categories"
                    className="h-9 text-xs"
                    disabled={bulkCategoriesMode !== "append" && bulkCategoriesMode !== "replace"}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Keywords</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={bulkKeywordsMode} onValueChange={(value) => setBulkKeywordsMode(value as BulkCollectionMode)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Operation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no-change">No change</SelectItem>
                      <SelectItem value="append">Append</SelectItem>
                      <SelectItem value="replace">Replace</SelectItem>
                      <SelectItem value="clear">Clear</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={bulkKeywords}
                    onChange={(event) => setBulkKeywords(event.target.value)}
                    placeholder="Comma separated keywords"
                    className="h-9 text-xs"
                    disabled={bulkKeywordsMode !== "append" && bulkKeywordsMode !== "replace"}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Product Links</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={bulkProductMode} onValueChange={(value) => setBulkProductMode(value as BulkProductMode)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Operation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no-change">No change</SelectItem>
                      <SelectItem value="replace">Replace</SelectItem>
                      <SelectItem value="clear">Clear</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 justify-start text-xs"
                    onClick={() => setBulkProductDialogOpen(true)}
                    disabled={bulkProductMode !== "replace"}
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    {formatProductSummary(bulkProductSelection)}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Inheritance</h3>
                <Select
                  value={bulkInheritanceMode}
                  onValueChange={(value) => setBulkInheritanceMode(value as BulkInheritanceMode)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Operation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-change">No change</SelectItem>
                    <SelectItem value="set-on">Set to apply to children</SelectItem>
                    <SelectItem value="set-off">Set to not apply</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Authoring Scope</h3>
                <Select value={bulkScopeMode} onValueChange={(value) => setBulkScopeMode(value as BulkScopeMode)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Operation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-change">No change</SelectItem>
                    <SelectItem value="set">Set scope</SelectItem>
                    <SelectItem value="add">Add to scope</SelectItem>
                    <SelectItem value="clear">Clear to global</SelectItem>
                  </SelectContent>
                </Select>

                {bulkScopeMode === "set" || bulkScopeMode === "add" ? (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <AuthoringScopePicker
                      showHeader={false}
                      value={bulkScopeValue}
                      onChange={(next) => setBulkScopeValue(normalizeAuthoringScope(next))}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <DialogFooter className="border-t border-border px-6 py-4 sm:justify-between">
              <Button variant="ghost" onClick={resetBulkEditorForm}>
                Reset form
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setBulkEditorOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={applyBulkValues} disabled={!canApplyBulkEdit}>
                  Apply {bulkOperationSummary.length} change{bulkOperationSummary.length === 1 ? "" : "s"}
                </Button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ProductLinkDialog
        open={Boolean(activeProductDialogId && activeAsset)}
        onOpenChange={(open) => {
          if (!open) setActiveProductDialogId(null);
        }}
        title="Link products"
        description={
          activeAsset ? `Choose products and variants for ${activeAsset.metadata.name || activeAsset.file.name}.` : undefined
        }
        products={products}
        variantsByProductId={variantsByProductId}
        variantsLoadingByProductId={variantsLoadingByProductId}
        selection={activeAsset?.metadata.productLinks || createEmptySelection()}
        onChange={(selection) => {
          if (!activeAsset) return;
          updateAssetMetadata(activeAsset.id, { productLinks: selection });
        }}
        onLoadVariants={loadVariants}
      />

      <ProductLinkDialog
        open={bulkProductDialogOpen}
        onOpenChange={setBulkProductDialogOpen}
        title="Select product links"
        description="Choose products or variants for the bulk replace operation."
        products={products}
        variantsByProductId={variantsByProductId}
        variantsLoadingByProductId={variantsLoadingByProductId}
        selection={bulkProductSelection}
        onChange={setBulkProductSelection}
        onLoadVariants={loadVariants}
      />

      <Dialog
        open={Boolean(activeScopeDialogId && activeScopeAsset)}
        onOpenChange={(open) => {
          if (!open) setActiveScopeDialogId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Set authoring scope</DialogTitle>
            <DialogDescription>Overrides scope for this file only.</DialogDescription>
          </DialogHeader>
          {activeScopeAsset ? (
            <AuthoringScopePicker
              showHeader={false}
              value={activeScopeAsset.metadata.authoringScope}
              onChange={(scope) =>
                updateAssetMetadata(activeScopeAsset.id, {
                  authoringScope: normalizeAuthoringScope(scope),
                })
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}




