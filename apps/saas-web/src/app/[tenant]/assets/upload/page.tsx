"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Upload, X, Check, CheckCircle2, AlertCircle, Image as ImageIcon, Video, FileText, ArrowLeft, Loader2, ChevronDown, ChevronRight, Link2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
  tags: string[];
  categories: string[];
  keywords: string[];
  usageGroupId?: string;
  productLinks: ProductSelection;
  autoSuggestedProductLinks?: boolean;
  appliesToChildren: boolean;
  folderId?: string | null;
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
};

type AssetUploadRow = AssetUpload & {
  fileLabel?: string;
  usageGroupId?: string;
  tags?: string[];
  categories?: string[];
  keywords?: string[];
  productLinks?: ProductSelection;
  appliesToChildren?: boolean;
  actions?: string;
};

type FolderData = {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
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

const createEmptySelection = (): ProductSelection => ({
  all: false,
  productIds: [],
  variantIdsByProduct: {}
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

const normalizeForMatch = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const suggestProductLinksFromFilename = (
  filename: string,
  products: ProductSummary[]
): ProductSelection | null => {
  const normalized = normalizeForMatch(filename);
  if (!normalized) return null;

  let best: ProductSummary | null = null;
  let bestScore = 0;

  for (const product of products) {
    let score = 0;
    const sku = normalizeForMatch(product.sku || "");
    const name = normalizeForMatch(product.productName || "");

    if (sku && normalized.includes(sku)) score += 10;

    if (name) {
      const parts = name.split(" ").filter((part) => part.length >= 4);
      const matchedPartCount = parts.filter((part) => normalized.includes(part)).length;
      score += Math.min(4, matchedPartCount);
    }

    if (score > bestScore) {
      best = product;
      bestScore = score;
    }
  }

  if (!best || bestScore < 3) return null;

  return {
    all: false,
    productIds: [best.id],
    variantIdsByProduct: {}
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
    <div className="flex min-h-[36px] flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs">
      {value.map((token) => (
        <Badge key={token} variant="secondary" className="flex items-center gap-1 text-[11px]">
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
            Tip: select a parent product, then keep <strong>Applies to Children</strong> on to auto-link its variants on upload.
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
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
  const tenantSlug = params.tenant as string;

  const [assets, setAssets] = useState<AssetUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [variantsByProductId, setVariantsByProductId] = useState<Record<string, VariantSummary[]>>({});
  const [variantsLoadingByProductId, setVariantsLoadingByProductId] = useState<Record<string, boolean>>({});
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [activeProductDialogId, setActiveProductDialogId] = useState<string | null>(null);
  const [bulkProductDialogOpen, setBulkProductDialogOpen] = useState(false);
  const [bulkProductSelection, setBulkProductSelection] = useState<ProductSelection>(createEmptySelection());
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [bulkUsageGroupId, setBulkUsageGroupId] = useState("");
  const [bulkTags, setBulkTags] = useState("");
  const [bulkCategories, setBulkCategories] = useState("");
  const [bulkKeywords, setBulkKeywords] = useState("");
  const [bulkAppliesToChildren, setBulkAppliesToChildren] = useState<"no-change" | "on" | "off">("no-change");
  const [productError, setProductError] = useState<string | null>(null);
  const [savingState, setSavingState] = useState<Record<string, "idle" | "saving" | "error">>({});
  const saveTimers = useRef<Record<string, NodeJS.Timeout>>({});

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
          products.filter((product) => !product.parentId)
        );
        if (!suggested) return asset;
        return {
          ...asset,
          metadata: {
            ...asset.metadata,
            productLinks: suggested,
            autoSuggestedProductLinks: true,
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

  const applyFolderToAssets = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setAssets((prev) =>
      prev.map((asset) => ({
        ...asset,
        metadata: {
          ...asset.metadata,
          folderId
        }
      }))
    );
    assets.forEach((asset) => {
      if (asset.serverAssetId) {
        scheduleSave(asset.id);
      }
    });
  };

  const applyBulkValues = () => {
    const tags = splitTokens(bulkTags);
    const categories = splitTokens(bulkCategories);
    const keywords = splitTokens(bulkKeywords);
    const shouldApplyProducts = hasProductSelection(bulkProductSelection);

    setAssets((prev) =>
      prev.map((asset) => {
        if (!selectedAssetIds.has(asset.id)) return asset;
        return {
          ...asset,
          metadata: {
            ...asset.metadata,
            usageGroupId: bulkUsageGroupId || asset.metadata.usageGroupId,
            tags: tags.length > 0 ? tags : asset.metadata.tags,
            categories: categories.length > 0 ? categories : asset.metadata.categories,
            keywords: keywords.length > 0 ? keywords : asset.metadata.keywords,
            productLinks: shouldApplyProducts ? bulkProductSelection : asset.metadata.productLinks,
            autoSuggestedProductLinks: shouldApplyProducts ? false : asset.metadata.autoSuggestedProductLinks,
            appliesToChildren:
              bulkAppliesToChildren === "no-change"
                ? asset.metadata.appliesToChildren
                : bulkAppliesToChildren === "on"
                  ? true
                  : false
          }
        };
      })
    );
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
                  updates.productLinks !== undefined ? false : asset.metadata.autoSuggestedProductLinks
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
      saveAsset(assetId);
    }, 600);
  };

  const saveAsset = async (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset || !asset.serverAssetId) return;

    setSavingState((prev) => ({ ...prev, [assetId]: "saving" }));
    try {
      const response = await fetch(`/api/${tenantSlug}/assets/${asset.serverAssetId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: asset.metadata.name,
          usageGroupId: asset.metadata.usageGroupId ?? null,
          keywords: asset.metadata.keywords,
          tags: asset.metadata.tags,
          categories: asset.metadata.categories,
          folderId: asset.metadata.folderId ?? null
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to auto-save (${response.status})`);
      }

      setSavingState((prev) => ({ ...prev, [assetId]: "idle" }));
    } catch (error) {
      console.error("Auto-save failed", error);
      setSavingState((prev) => ({ ...prev, [assetId]: "error" }));
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

  const handleFilesAdded = (files: File[]) => {
    const newAssets: AssetUpload[] = files.map((file) => {
      const suggestedProductLinks = suggestProductLinksFromFilename(
        file.name,
        products.filter((product) => !product.parentId)
      );
      return {
        id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
        file,
        status: "pending",
        progress: 0,
        metadata: {
          name: file.name.split(".").slice(0, -1).join(".") || file.name,
          tags: [],
          categories: [],
          keywords: [],
          usageGroupId: undefined,
          productLinks: suggestedProductLinks || createEmptySelection(),
          autoSuggestedProductLinks: Boolean(suggestedProductLinks),
          appliesToChildren: true,
          folderId: selectedFolderId
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
    setTimeout(() => startUploading(newAssets), 300);
  };

  const uploadAsset = async (asset: AssetUpload) => {
    const formData = new FormData();
    formData.append("file", asset.file);
    formData.append(
      "metadata",
      JSON.stringify({
        name: asset.metadata.name,
        tags: asset.metadata.tags,
        categories: asset.metadata.categories,
        keywords: asset.metadata.keywords,
        usageGroupId: asset.metadata.usageGroupId,
        productLinks: asset.metadata.productLinks,
        appliesToChildren: asset.metadata.appliesToChildren,
        folderId: asset.metadata.folderId ?? null
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
      } catch {
        errorMessage = `Upload failed (${response.status})`;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    return result;
  };

  const startUploading = async (assetsToUpload: AssetUpload[]) => {
    setIsUploading(true);

    for (const asset of assetsToUpload) {
      try {
        setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, status: "uploading" } : a)));

        const result = await uploadAsset(asset);

        setAssets((prev) =>
          prev.map((a) =>
            a.id === asset.id
              ? {
                  ...a,
                  status: "completed",
                  progress: 100,
                  serverAssetId: result?.data?.id || a.serverAssetId
                }
              : a
          )
        );
      } catch (error) {
        setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, status: "failed", error: String(error) } : a)));
      }
    }

    setIsUploading(false);
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
  const activeAsset = assets.find((asset) => asset.id === activeProductDialogId);

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
      key: "usageGroupId",
      label: "Usage Group",
      sortable: false,
      className: "min-w-[240px] max-w-[320px]",
      render: (_value, item) => (
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
      )
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
            <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              Suggested
            </span>
          )}
        </Button>
      )
    },
    {
      key: "appliesToChildren",
      label: "Applies to Children",
      sortable: false,
      render: (_value, item) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={item.metadata.appliesToChildren}
            onCheckedChange={(checked) => updateAssetMetadata(item.id, { appliesToChildren: checked })}
          />
          <span className="text-xs text-muted-foreground">{item.metadata.appliesToChildren ? "Yes" : "No"}</span>
        </div>
      )
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Upload destination</h2>
              <p className="text-xs text-gray-600">Applies to all queued uploads.</p>
            </div>
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
          </div>
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
              <div className="text-sm text-gray-600">
                {completedCount} completed - {failedCount} failed
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
                Review them in the Product Link column.
              </div>
            )}

            {selectedCount > 0 && (
              <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-foreground">{selectedCount} selected</span>

                  <Select
                    value={bulkUsageGroupId || "none"}
                    onValueChange={(value) => setBulkUsageGroupId(value === "none" ? "" : value)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Usage group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Usage group</SelectItem>
                      {USAGE_GROUP_OPTIONS.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    value={bulkTags}
                    onChange={(event) => setBulkTags(event.target.value)}
                    placeholder="Tags (comma separated)"
                    className="h-9 w-48 text-xs"
                  />

                  <Input
                    value={bulkCategories}
                    onChange={(event) => setBulkCategories(event.target.value)}
                    placeholder="Categories"
                    className="h-9 w-40 text-xs"
                  />

                  <Input
                    value={bulkKeywords}
                    onChange={(event) => setBulkKeywords(event.target.value)}
                    placeholder="Keywords"
                    className="h-9 w-40 text-xs"
                  />

                  <Select
                    value={bulkAppliesToChildren}
                    onValueChange={(value) => setBulkAppliesToChildren(value as "no-change" | "on" | "off")}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Inheritance" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no-change">Inheritance</SelectItem>
                      <SelectItem value="on">Apply to children</SelectItem>
                      <SelectItem value="off">Do not apply</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button size="sm" variant="outline" onClick={() => setBulkProductDialogOpen(true)}>
                    <Link2 className="mr-2 h-4 w-4" />
                    Set products
                  </Button>

                  <Button size="sm" onClick={applyBulkValues}>
                    Apply
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
        title="Apply product links"
        description="Select products or variants to apply to all selected assets."
        actionLabel="Apply"
        products={products}
        variantsByProductId={variantsByProductId}
        variantsLoadingByProductId={variantsLoadingByProductId}
        selection={bulkProductSelection}
        onChange={setBulkProductSelection}
        onLoadVariants={loadVariants}
        onApply={applyBulkValues}
      />
    </div>
  );
}




