"use client";

import { useState, useMemo } from "react";
import NextImage from "next/image";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ProductSummary = {
  id: string;
  sku?: string;
  productName: string;
  brand?: string;
  type?: string;
  parentId?: string | null;
  imageUrl?: string | null;
};

export type VariantSummary = {
  id: string;
  sku?: string;
  productName: string;
  parentId: string;
  imageUrl?: string | null;
};

export type ProductSelection = {
  all: boolean;
  productIds: string[];
  variantIdsByProduct: Record<string, string[]>;
};

export const createEmptySelection = (): ProductSelection => ({
  all: false,
  productIds: [],
  variantIdsByProduct: {},
});

export const hasProductSelection = (selection: ProductSelection) => {
  if (selection.all) return true;
  if (selection.productIds.length > 0) return true;
  return Object.values(selection.variantIdsByProduct).some((list) => list.length > 0);
};

export const toggleAllSelection = (selection: ProductSelection): ProductSelection => {
  if (selection.all) {
    return { ...selection, all: false };
  }
  return { all: true, productIds: [], variantIdsByProduct: {} };
};

export const toggleProductSelection = (
  selection: ProductSelection,
  productId: string
): ProductSelection => {
  const productIds = new Set(selection.productIds);
  if (productIds.has(productId)) {
    productIds.delete(productId);
  } else {
    productIds.add(productId);
  }
  return {
    all: false,
    productIds: Array.from(productIds),
    variantIdsByProduct: selection.variantIdsByProduct,
  };
};

export const toggleVariantSelection = (
  selection: ProductSelection,
  productId: string,
  variantId: string
): ProductSelection => {
  const next = {
    all: false,
    productIds: selection.productIds,
    variantIdsByProduct: { ...selection.variantIdsByProduct },
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

export function ProductLinkDialog({
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
  onApply,
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
}) {
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
            Tip: select a parent product, then keep{" "}
            <strong>Applies to Children</strong> on to auto-link current variants
            and future variants created under that parent.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products or SKU"
              className="pl-9"
            />
          </div>

          <div className="rounded-lg border border-border bg-background">
            <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={selection.all}
                onChange={() => onChange(toggleAllSelection(selection))}
                className="h-4 w-4 rounded border-border"
              />
              <span className="font-medium text-foreground">All products</span>
              <span className="text-xs text-muted-foreground">
                Links this asset to every product
              </span>
            </div>

            <div className="max-h-[420px] overflow-y-auto px-2 py-2">
              {filteredProducts.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  No products found.
                </div>
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
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                        <input
                          type="checkbox"
                          checked={selection.productIds.includes(product.id)}
                          onChange={() =>
                            onChange(
                              toggleProductSelection(
                                { ...selection, all: false },
                                product.id
                              )
                            )
                          }
                          className="h-4 w-4 rounded border-border"
                        />
                        <div className="h-8 w-8 overflow-hidden rounded-md border border-border bg-muted/30">
                          {product.imageUrl ? (
                            <NextImage
                              src={product.imageUrl}
                              alt={product.productName || "Product"}
                              className="h-full w-full object-cover"
                              width={32}
                              height={32}
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                              IMG
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground">
                            {product.productName || "Unnamed product"}
                          </div>
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
                              <LoadingSkeleton size="sm" />
                              Loading variants
                            </div>
                          ) : variants.length === 0 ? (
                            <div className="text-xs text-muted-foreground">
                              No variants
                            </div>
                          ) : (
                            variants.map((variant) => (
                              <label
                                key={variant.id}
                                className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-foreground hover:bg-muted/40"
                              >
                                <input
                                  type="checkbox"
                                  checked={variantIds.includes(variant.id)}
                                  onChange={() =>
                                    onChange(
                                      toggleVariantSelection(
                                        selection,
                                        product.id,
                                        variant.id
                                      )
                                    )
                                  }
                                  className="h-3.5 w-3.5 rounded border-border"
                                />
                                <div className="h-6 w-6 overflow-hidden rounded border border-border bg-muted/30">
                                  {variant.imageUrl ? (
                                    <NextImage
                                      src={variant.imageUrl}
                                      alt={variant.productName || "Variant"}
                                      className="h-full w-full object-cover"
                                      width={24}
                                      height={24}
                                      unoptimized
                                    />
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
          <Button
            variant="outline"
            className="h-8 px-3 text-sm"
            onClick={() => onOpenChange(false)}
          >
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
}
