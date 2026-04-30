"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Save, Tag, FileText, AlertCircle, Shield, Palette, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { AssetTag } from "@stack-app/types";
import {
  ASSET_STATUS_OPTIONS,
  BRAND_LEGAL_APPROVAL_OPTIONS,
  CLAIMS_REVIEW_STATUS_OPTIONS,
  COMPLIANCE_STATUS_OPTIONS,
  ARTWORK_TYPE_OPTIONS,
  PRINT_VS_DIGITAL_OPTIONS,
  CERTIFICATION_OPTIONS,
  REGION_OPTIONS,
  WADA_RISK_OPTIONS,
} from "@stack-app/ui";
import {
  ProductLinkDialog,
  type ProductSelection,
  type VariantSummary,
  createEmptySelection,
  hasProductSelection,
} from "@/components/dam/product-link-dialog";

interface Asset {
  id: string;
  filename: string;
  originalFilename: string;
  fileType: string;
  fileSize: number;
  mimeType: string;
  s3Url: string;
  tags: string[];
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  preview?: string;
}

interface BulkEditorPanelProps {
  assets: Asset[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: BulkUpdateData) => Promise<void>;
  availableTags: AssetTag[];
  tenantSlug?: string;
  availableProducts?: Array<{ id: string; sku?: string; productName?: string; brand?: string }>;
}

interface BulkUpdateData {
  updateFields: {
    tags?: { mode: "replace" | "add" | "remove"; tagIds: string[] };
    description?: { mode: "replace" | "append"; value: string };
    assetStatus?: string;
    complianceStatus?: string;
    brandLegalApproval?: string;
    claimsReviewStatus?: string;
    artworkType?: string;
    printVsDigital?: string;
    certifications?: { mode: "add" | "remove"; values: string[] };
    regulatoryRegion?: { mode: "add" | "remove"; values: string[] };
    wadaRiskLevel?: string;
  };
}

interface FieldState {
  enabled: boolean;
  mode: "replace" | "add" | "remove" | "append";
}

type TagMode = Extract<FieldState["mode"], "replace" | "add" | "remove">;
type DescriptionMode = Extract<FieldState["mode"], "replace" | "append">;

const INITIAL_FIELD_STATES: Record<string, FieldState> = {
  tags: { enabled: false, mode: "add" },
  description: { enabled: false, mode: "replace" },
  statusApproval: { enabled: false, mode: "replace" },
  classification: { enabled: false, mode: "replace" },
  regulatory: { enabled: false, mode: "add" },
  productLinks: { enabled: false, mode: "add" },
};

const INITIAL_FORM_DATA = {
  tagIds: [] as string[],
  description: "",
  assetStatus: "",
  complianceStatus: "",
  brandLegalApproval: "",
  claimsReviewStatus: "",
  artworkType: "",
  printVsDigital: "",
  certificationValues: [] as string[],
  certificationMode: "add" as "add" | "remove",
  regulatoryRegionValues: [] as string[],
  regulatoryRegionMode: "add" as "add" | "remove",
  wadaRiskLevel: "",
};

export function BulkEditorPanel({
  assets,
  isOpen,
  onClose,
  onSave,
  availableTags,
  tenantSlug,
  availableProducts = [],
}: BulkEditorPanelProps) {
  const [fieldStates, setFieldStates] = useState<Record<string, FieldState>>(INITIAL_FIELD_STATES);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [tagFilter, setTagFilter] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{
    total: number;
    completed: number;
    errors: Array<{ assetId: string; error: string }>;
  } | null>(null);

  const [isProductLinkDialogOpen, setIsProductLinkDialogOpen] = useState(false);
  const [productLinkSelection, setProductLinkSelection] = useState<ProductSelection>(createEmptySelection());
  const [variantsByProductId, setVariantsByProductId] = useState<Record<string, VariantSummary[]>>({});
  const [variantsLoadingByProductId, setVariantsLoadingByProductId] = useState<Record<string, boolean>>({});
  const [isApplyingProductLinks, setIsApplyingProductLinks] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFieldStates(INITIAL_FIELD_STATES);
      setFormData(INITIAL_FORM_DATA);
      setTagFilter("");
      setSaveProgress(null);
      setProductLinkSelection(createEmptySelection());
      setVariantsByProductId({});
      setVariantsLoadingByProductId({});
    }
  }, [isOpen]);

  const handleFieldToggle = (field: string) => {
    setFieldStates((prev) => ({
      ...prev,
      [field]: { ...prev[field], enabled: !prev[field].enabled },
    }));
  };

  const handleModeChange = (field: string, mode: FieldState["mode"]) => {
    setFieldStates((prev) => ({
      ...prev,
      [field]: { ...prev[field], mode },
    }));
  };

  const filteredTags = useMemo(() => {
    const query = tagFilter.trim().toLowerCase();
    if (!query) return availableTags;
    return availableTags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [availableTags, tagFilter]);

  const toggleTag = useCallback((tagId: string) => {
    setFormData((prev) => ({
      ...prev,
      tagIds: prev.tagIds.includes(tagId)
        ? prev.tagIds.filter((id) => id !== tagId)
        : [...prev.tagIds, tagId],
    }));
  }, []);

  const handleLoadVariants = useCallback(
    async (productId: string) => {
      if (!tenantSlug) return;
      setVariantsLoadingByProductId((prev) => ({ ...prev, [productId]: true }));
      try {
        const response = await fetch(`/api/${tenantSlug}/products?parentId=${encodeURIComponent(productId)}`);
        if (!response.ok) throw new Error(`Failed to load variants (${response.status})`);
        const payload = await response.json() as { data?: unknown[] };
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        const variants: VariantSummary[] = rows
          .map((v) => {
            if (typeof v !== "object" || !v) return null;
            const row = v as Record<string, unknown>;
            const id = typeof row.id === "string" ? row.id : "";
            if (!id) return null;
            return {
              id,
              sku: typeof row.sku === "string" ? row.sku : undefined,
              productName: typeof row.productName === "string" ? row.productName : "Variant",
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
    },
    [tenantSlug]
  );

  const handleApplyProductLinks = useCallback(async () => {
    if (!tenantSlug || assets.length === 0) return;
    const { all, productIds, variantIdsByProduct } = productLinkSelection;
    const targetIds: string[] = [];
    if (all) {
      availableProducts.forEach((p) => targetIds.push(p.id));
    } else {
      productIds.forEach((id) => targetIds.push(id));
      Object.entries(variantIdsByProduct).forEach(([, variantIds]) =>
        variantIds.forEach((id) => targetIds.push(id))
      );
    }
    if (targetIds.length === 0) return;

    setIsApplyingProductLinks(true);
    for (const asset of assets) {
      for (const productId of targetIds) {
        try {
          await fetch(`/api/${tenantSlug}/product-links`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              product_id: productId,
              asset_id: asset.id,
              link_context: "bulk_edit",
              link_type: "manual",
              confidence: 1,
              match_reason: "Bulk linked from asset workspace",
            }),
          });
        } catch (error) {
          console.error("Failed to link product:", error);
        }
      }
    }
    setIsApplyingProductLinks(false);
    setProductLinkSelection(createEmptySelection());
  }, [tenantSlug, assets, productLinkSelection, availableProducts]);

  const handleSave = useCallback(async () => {
    const updateFields: BulkUpdateData["updateFields"] = {};

    if (fieldStates.tags.enabled) {
      // replace with empty = clear all tags (intentional); add/remove with empty = no-op, skip
      if (fieldStates.tags.mode === "replace" || formData.tagIds.length > 0) {
        updateFields.tags = { mode: fieldStates.tags.mode as TagMode, tagIds: formData.tagIds };
      }
    }
    if (fieldStates.description.enabled && formData.description.trim()) {
      updateFields.description = {
        mode: fieldStates.description.mode as DescriptionMode,
        value: formData.description.trim(),
      };
    }
    if (fieldStates.statusApproval.enabled) {
      if (formData.assetStatus) updateFields.assetStatus = formData.assetStatus;
      if (formData.complianceStatus) updateFields.complianceStatus = formData.complianceStatus;
      if (formData.brandLegalApproval) updateFields.brandLegalApproval = formData.brandLegalApproval;
      if (formData.claimsReviewStatus) updateFields.claimsReviewStatus = formData.claimsReviewStatus;
    }
    if (fieldStates.classification.enabled) {
      if (formData.artworkType) updateFields.artworkType = formData.artworkType;
      if (formData.printVsDigital) updateFields.printVsDigital = formData.printVsDigital;
    }
    if (fieldStates.regulatory.enabled) {
      if (formData.certificationValues.length > 0) {
        updateFields.certifications = { mode: formData.certificationMode, values: formData.certificationValues };
      }
      if (formData.regulatoryRegionValues.length > 0) {
        updateFields.regulatoryRegion = { mode: formData.regulatoryRegionMode, values: formData.regulatoryRegionValues };
      }
      if (formData.wadaRiskLevel) updateFields.wadaRiskLevel = formData.wadaRiskLevel;
    }

    if (Object.keys(updateFields).length === 0) return;

    setIsSaving(true);
    setSaveProgress({ total: assets.length, completed: 0, errors: [] });
    try {
      await onSave({ updateFields });
    } catch (error) {
      console.error("Bulk save failed:", error);
    } finally {
      setIsSaving(false);
    }
  }, [fieldStates, formData, assets.length, onSave]);

  const hasChangesToApply = Object.values(fieldStates).some((s) => s.enabled);

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent side="right" className="flex flex-col w-full max-w-md p-0">
          <SheetHeader className="px-6 py-5 border-b bg-gray-50 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle>Bulk Edit Assets</SheetTitle>
                <p className="text-sm text-muted-foreground mt-0.5">{assets.length} assets selected</p>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {saveProgress && (
              <div className="px-6 py-4 border-b bg-blue-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-900">Updating assets...</span>
                  <span className="text-sm text-blue-700">{saveProgress.completed}/{saveProgress.total}</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(saveProgress.completed / saveProgress.total) * 100}%` }}
                  />
                </div>
                {saveProgress.errors.length > 0 && (
                  <div className="mt-3 text-sm text-red-600">{saveProgress.errors.length} errors occurred</div>
                )}
              </div>
            )}

            <div className="p-6 space-y-6">
              {/* Tags */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="checkbox"
                    id="enable-tags"
                    checked={fieldStates.tags.enabled}
                    onChange={() => handleFieldToggle("tags")}
                    className="w-4 h-4 rounded border-input"
                  />
                  <label htmlFor="enable-tags" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Tags
                  </label>
                </div>
                {fieldStates.tags.enabled && (
                  <div className="ml-7 space-y-3">
                    <Select
                      value={fieldStates.tags.mode}
                      onValueChange={(value) => handleModeChange("tags", value as FieldState["mode"])}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="add">Add to existing tags</SelectItem>
                        <SelectItem value="replace">Replace all tags</SelectItem>
                        <SelectItem value="remove">Remove these tags</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={tagFilter}
                      onChange={(e) => setTagFilter(e.target.value)}
                      placeholder="Search tags..."
                      className="text-sm"
                    />
                    {fieldStates.tags.mode === "replace" && formData.tagIds.length === 0 && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        No tags selected — applying will remove all tags from {assets.length} assets.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {filteredTags.length === 0 && (
                        <span className="text-xs text-gray-500">No tags found</span>
                      )}
                      {filteredTags.map((tag) => {
                        const isSelected = formData.tagIds.includes(tag.id);
                        return (
                          <Badge
                            key={tag.id}
                            variant={isSelected ? "default" : "secondary"}
                            className={cn(
                              "text-xs px-2 py-1 cursor-pointer transition-colors",
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
                )}
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="checkbox"
                    id="enable-description"
                    checked={fieldStates.description.enabled}
                    onChange={() => handleFieldToggle("description")}
                    className="w-4 h-4 rounded border-input"
                  />
                  <label htmlFor="enable-description" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Description
                  </label>
                </div>
                {fieldStates.description.enabled && (
                  <div className="ml-7 space-y-3">
                    <Select
                      value={fieldStates.description.mode}
                      onValueChange={(value) => handleModeChange("description", value as FieldState["mode"])}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="replace">Replace description</SelectItem>
                        <SelectItem value="append">Append to description</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="Enter description..."
                      rows={3}
                      className="w-full resize-none text-sm"
                    />
                    {fieldStates.description.mode === "replace" && !formData.description.trim() && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        Empty value — applying will clear the description on {assets.length} assets.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Status & Approval */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="checkbox"
                    id="enable-status-approval"
                    checked={fieldStates.statusApproval.enabled}
                    onChange={() => handleFieldToggle("statusApproval")}
                    className="w-4 h-4 rounded border-input"
                  />
                  <label htmlFor="enable-status-approval" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Status & Approval
                  </label>
                </div>
                {fieldStates.statusApproval.enabled && (
                  <div className="ml-7 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="block text-xs text-muted-foreground">Asset Status</label>
                        <Select value={formData.assetStatus} onValueChange={(v) => setFormData((p) => ({ ...p, assetStatus: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No change" /></SelectTrigger>
                          <SelectContent>
                            {ASSET_STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs text-muted-foreground">Compliance</label>
                        <Select value={formData.complianceStatus} onValueChange={(v) => setFormData((p) => ({ ...p, complianceStatus: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No change" /></SelectTrigger>
                          <SelectContent>
                            {COMPLIANCE_STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs text-muted-foreground">Brand / Legal</label>
                        <Select value={formData.brandLegalApproval} onValueChange={(v) => setFormData((p) => ({ ...p, brandLegalApproval: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No change" /></SelectTrigger>
                          <SelectContent>
                            {BRAND_LEGAL_APPROVAL_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs text-muted-foreground">Claims Review</label>
                        <Select value={formData.claimsReviewStatus} onValueChange={(v) => setFormData((p) => ({ ...p, claimsReviewStatus: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No change" /></SelectTrigger>
                          <SelectContent>
                            {CLAIMS_REVIEW_STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Classification */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="checkbox"
                    id="enable-classification"
                    checked={fieldStates.classification.enabled}
                    onChange={() => handleFieldToggle("classification")}
                    className="w-4 h-4 rounded border-input"
                  />
                  <label htmlFor="enable-classification" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    Classification
                  </label>
                </div>
                {fieldStates.classification.enabled && (
                  <div className="ml-7 space-y-3">
                    <div className="space-y-1">
                      <label className="block text-xs text-muted-foreground">Artwork Type</label>
                      <Select value={formData.artworkType} onValueChange={(v) => setFormData((p) => ({ ...p, artworkType: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No change" /></SelectTrigger>
                        <SelectContent>
                          {ARTWORK_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs text-muted-foreground">Print vs Digital</label>
                      <Select value={formData.printVsDigital} onValueChange={(v) => setFormData((p) => ({ ...p, printVsDigital: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No change" /></SelectTrigger>
                        <SelectContent>
                          {PRINT_VS_DIGITAL_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* Regulatory */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="checkbox"
                    id="enable-regulatory"
                    checked={fieldStates.regulatory.enabled}
                    onChange={() => handleFieldToggle("regulatory")}
                    className="w-4 h-4 rounded border-input"
                  />
                  <label htmlFor="enable-regulatory" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Regulatory
                  </label>
                </div>
                {fieldStates.regulatory.enabled && (
                  <div className="ml-7 space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-medium text-foreground">Certifications</label>
                        <div className="flex gap-1">
                          {(["add", "remove"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setFormData((p) => ({ ...p, certificationMode: mode }))}
                              className={cn(
                                "rounded px-2 py-0.5 text-xs border",
                                formData.certificationMode === mode
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border hover:border-primary/40"
                              )}
                            >
                              {mode === "add" ? "Add" : "Remove"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <MultiSelect
                        options={CERTIFICATION_OPTIONS}
                        value={formData.certificationValues}
                        onChange={(v) => setFormData((p) => ({ ...p, certificationValues: v }))}
                        placeholder="Select certifications"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-medium text-foreground">Regulatory Regions</label>
                        <div className="flex gap-1">
                          {(["add", "remove"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setFormData((p) => ({ ...p, regulatoryRegionMode: mode }))}
                              className={cn(
                                "rounded px-2 py-0.5 text-xs border",
                                formData.regulatoryRegionMode === mode
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border hover:border-primary/40"
                              )}
                            >
                              {mode === "add" ? "Add" : "Remove"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <MultiSelect
                        options={REGION_OPTIONS}
                        value={formData.regulatoryRegionValues}
                        onChange={(v) => setFormData((p) => ({ ...p, regulatoryRegionValues: v }))}
                        placeholder="Select regions"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-foreground">WADA Risk Level</label>
                      <Select value={formData.wadaRiskLevel} onValueChange={(v) => setFormData((p) => ({ ...p, wadaRiskLevel: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No change" /></SelectTrigger>
                        <SelectContent>
                          {WADA_RISK_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* Product Linking */}
              {tenantSlug && (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <input
                      type="checkbox"
                      id="enable-product-links"
                      checked={fieldStates.productLinks.enabled}
                      onChange={() => handleFieldToggle("productLinks")}
                      className="w-4 h-4 rounded border-input"
                    />
                    <label htmlFor="enable-product-links" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <Link2 className="w-4 h-4" />
                      Product Linking
                    </label>
                  </div>
                  {fieldStates.productLinks.enabled && (
                    <div className="ml-7 space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Link all {assets.length} selected assets to the chosen products. Always additive — existing links are preserved.
                      </p>
                      {hasProductSelection(productLinkSelection) ? (
                        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-foreground">
                          {productLinkSelection.all
                            ? "All products selected"
                            : `${productLinkSelection.productIds.length} product(s) + ${
                                Object.values(productLinkSelection.variantIdsByProduct).flat().length
                              } variant(s) selected`}
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="h-8 px-3 text-sm"
                          onClick={() => setIsProductLinkDialogOpen(true)}
                        >
                          <Link2 className="mr-1 h-3.5 w-3.5" />
                          {hasProductSelection(productLinkSelection) ? "Change Selection" : "Select Products"}
                        </Button>
                        {hasProductSelection(productLinkSelection) && (
                          <Button
                            variant="accent-blue"
                            className="h-8 px-3 text-sm"
                            disabled={isApplyingProductLinks}
                            onClick={() => void handleApplyProductLinks()}
                          >
                            {isApplyingProductLinks ? (
                              <>
                                <LoadingSkeleton size="sm" className="mr-2" />
                                Linking...
                              </>
                            ) : (
                              `Link to ${assets.length} assets`
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <SheetFooter className="border-t bg-gray-50 px-6 py-4 shrink-0">
            <div className="flex gap-3 w-full">
              <Button variant="outline" onClick={onClose} className="flex-1" disabled={isSaving}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleSave()}
                disabled={!hasChangesToApply || isSaving}
                className="flex-1"
              >
                {isSaving ? (
                  <>
                    <LoadingSkeleton size="sm" className="mr-2" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Apply to {assets.length}
                  </>
                )}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ProductLinkDialog
        open={isProductLinkDialogOpen}
        onOpenChange={setIsProductLinkDialogOpen}
        title="Select Products to Link"
        description={`Selected products will be linked to all ${assets.length} assets.`}
        actionLabel="Confirm Selection"
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
      />
    </>
  );
}
