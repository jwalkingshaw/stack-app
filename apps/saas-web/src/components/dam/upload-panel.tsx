"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { TagInput } from "@/components/dam/tag-input";
import {
  ProductLinkDialog,
  type ProductSelection,
  type ProductSummary,
  type VariantSummary,
  createEmptySelection,
  hasProductSelection,
} from "@/components/dam/product-link-dialog";

type FolderRecord = {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
};

type UploadStatus = "queued" | "uploading" | "done" | "error";

type FileItem = {
  id: string;
  file: File;
  filename: string;
  status: UploadStatus;
  progress: number;
  assetId?: string;
  error?: string;
  isExpanded: boolean;
  overrides: {
    description: string;
    tags: string[];
    folderId: string | null | undefined; // undefined = use apply-to-all
    assetScope: string | undefined; // undefined = use apply-to-all
  };
  productLinkSelection: ProductSelection;
};

type ApplyToAll = {
  folderId: string | null;
  tags: string[];
  assetScope: string;
};

const ASSET_SCOPE_OPTIONS = [
  { value: "internal", label: "Internal — your team only" },
  { value: "shared", label: "Shared — visible to partners" },
];

let idCounter = 0;
const makeId = () => `uf-${++idCounter}-${Date.now()}`;


function StatusBadge({ status, progress }: { status: UploadStatus; progress: number }) {
  if (status === "queued")
    return <span className="text-xs text-muted-foreground">Queued</span>;
  if (status === "uploading")
    return (
      <span className="flex items-center gap-1 text-xs text-blue-600">
        <Loader2 className="h-3 w-3 animate-spin" />
        {progress}%
      </span>
    );
  if (status === "done")
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Done
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-destructive">
      <AlertCircle className="h-3.5 w-3.5" />
      Error
    </span>
  );
}

function ProgressBar({ status, progress }: { status: UploadStatus; progress: number }) {
  if (status === "queued") return null;
  if (status === "done")
    return <div className="h-0.5 w-full rounded-full bg-green-500" />;
  if (status === "error")
    return <div className="h-0.5 w-full rounded-full bg-destructive" />;
  return (
    <div className="h-0.5 w-full rounded-full bg-border">
      <div
        className="h-full rounded-full bg-blue-500 transition-all"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function FileRow({
  item,
  folders,
  onUpdate,
  onOpenProductLink,
}: {
  item: FileItem;
  folders: FolderRecord[];
  onUpdate: (patch: Partial<FileItem>) => void;
  onOpenProductLink: () => void;
}) {
  const linked = hasProductSelection(item.productLinkSelection);

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="flex items-center gap-2">
        {/* expand toggle */}
        <button
          type="button"
          onClick={() => onUpdate({ isExpanded: !item.isExpanded })}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {item.isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        {/* filename */}
        <Input
          value={item.filename}
          onChange={(e) => onUpdate({ filename: e.target.value })}
          className="h-7 flex-1 border-transparent bg-transparent px-1 text-xs focus:border-input focus:bg-background"
        />

        {/* status */}
        <StatusBadge status={item.status} progress={item.progress} />
      </div>

      {/* progress bar */}
      <div className="mt-1.5 pl-9">
        <ProgressBar status={item.status} progress={item.progress} />
      </div>

      {/* expanded overrides */}
      {item.isExpanded && (
        <div className="ml-9 mt-3 space-y-2.5 border-t border-border pt-2.5">
          {/* description */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Description</label>
            <Input
              value={item.overrides.description}
              onChange={(e) =>
                onUpdate({
                  overrides: { ...item.overrides, description: e.target.value },
                })
              }
              placeholder="Optional description"
              className="h-7 text-xs"
            />
          </div>

          {/* tags override */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Additional tags</label>
            <TagInput
              value={item.overrides.tags}
              onChange={(tags) =>
                onUpdate({ overrides: { ...item.overrides, tags } })
              }
              placeholder="Extra tags for this file..."
            />
          </div>

          {/* folder override */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Folder override</label>
            <Select
              value={item.overrides.folderId ?? "__inherit__"}
              onValueChange={(v) =>
                onUpdate({
                  overrides: {
                    ...item.overrides,
                    folderId: v === "__inherit__" ? undefined : v === "__none__" ? null : v,
                  },
                })
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Inherit from apply-to-all" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__inherit__">Inherit from apply-to-all</SelectItem>
                <SelectItem value="__none__">No folder</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* product link */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={onOpenProductLink}
            >
              <LinkIcon className="h-3 w-3" />
              {linked ? "Edit product links" : "Link to products"}
            </Button>
            {linked && (
              <Badge variant="secondary" className="text-xs">
                Linked
              </Badge>
            )}
          </div>

          {item.error && (
            <p className="text-xs text-destructive">{item.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function UploadPanel({
  open,
  onOpenChange,
  tenantSlug,
  initialFiles,
  initialFolderId,
  folders,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  initialFiles?: File[];
  initialFolderId?: string | null;
  folders: FolderRecord[];
  onDone: (uploadedAssetIds: string[], openBulkEditor?: boolean) => void;
}) {
  const [applyToAll, setApplyToAll] = useState<ApplyToAll>({
    folderId: initialFolderId ?? null,
    tags: [],
    assetScope: "internal",
  });
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [productLinkFileId, setProductLinkFileId] = useState<string | null>(null);
  const [variantsByProductId, setVariantsByProductId] = useState<
    Record<string, VariantSummary[]>
  >({});
  const [variantsLoadingByProductId, setVariantsLoadingByProductId] = useState<
    Record<string, boolean>
  >({});
  const [availableProducts, setAvailableProducts] = useState<ProductSummary[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef<Set<string>>(new Set());
  const initialFilesApplied = useRef(false);

  // Sync initial folder when it changes externally
  useEffect(() => {
    setApplyToAll((prev) => ({ ...prev, folderId: initialFolderId ?? null }));
  }, [initialFolderId]);

  // Fetch product options when panel opens
  useEffect(() => {
    if (!open) return;
    fetch(`/api/${tenantSlug}/products?limit=500`)
      .then((r) => r.json())
      .then((data) => {
        const items: any[] = data?.data?.products ?? data?.products ?? [];
        setAvailableProducts(
          items.map((p) => ({
            id: p.id,
            sku: p.sku,
            productName: p.productName ?? p.product_name ?? p.name ?? "Unnamed",
            brand: p.brand,
            parentId: p.parentId ?? p.parent_id ?? null,
            imageUrl: p.thumbnailUrls?.small ?? p.thumbnail_urls?.small ?? null,
          }))
        );
      })
      .catch(() => {});
  }, [open, tenantSlug]);

  // Apply initial dropped files once per open
  useEffect(() => {
    if (open && initialFiles && initialFiles.length > 0 && !initialFilesApplied.current) {
      initialFilesApplied.current = true;
      addFiles(initialFiles, {
        folderId: initialFolderId ?? null,
        tags: [],
        assetScope: "internal",
      });
    }
    if (!open) {
      initialFilesApplied.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startUpload = useCallback(
    async (item: FileItem, snapshot: ApplyToAll) => {
      if (uploadingRef.current.has(item.id)) return;
      uploadingRef.current.add(item.id);

      setFileItems((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: "uploading", progress: 0 } : f))
      );

      try {
        const folderId =
          item.overrides.folderId !== undefined
            ? item.overrides.folderId
            : snapshot.folderId;
        const tags =
          item.overrides.tags.length > 0
            ? [...snapshot.tags, ...item.overrides.tags]
            : snapshot.tags;
        const assetScope = item.overrides.assetScope ?? snapshot.assetScope;

        const metadata = {
          name: item.filename,
          tags,
          folderId: folderId ?? null,
          uploadProfileId: "fast",
          description: item.overrides.description || null,
          assetScope,
        };

        const formData = new FormData();
        formData.append("file", item.file, item.filename);
        formData.append("metadata", JSON.stringify(metadata));

        const assetId = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `/api/${tenantSlug}/assets/upload`);

          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 90);
              setFileItems((prev) =>
                prev.map((f) => (f.id === item.id ? { ...f, progress: pct } : f))
              );
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                resolve(data?.data?.id ?? "");
              } catch {
                reject(new Error("Invalid response"));
              }
            } else {
              let msg = `Upload failed (${xhr.status})`;
              try {
                const errData = JSON.parse(xhr.responseText);
                if (errData?.error) msg = errData.error;
              } catch { /* ignore */ }
              reject(new Error(msg));
            }
          });

          xhr.addEventListener("error", () => reject(new Error("Network error")));
          xhr.send(formData);
        });

        setFileItems((prev) =>
          prev.map((f) =>
            f.id === item.id ? { ...f, status: "done", progress: 100, assetId } : f
          )
        );

        // Post product links if any selected
        if (assetId) {
          const sel = item.productLinkSelection;
          const links: Array<Record<string, unknown>> = [];
          if (sel.all) {
            links.push({ assetId, appliesToChildren: true });
          } else {
            for (const pid of sel.productIds) {
              links.push({ assetId, productId: pid, appliesToChildren: true });
            }
            for (const [, vids] of Object.entries(sel.variantIdsByProduct)) {
              for (const vid of vids) {
                links.push({ assetId, variantId: vid });
              }
            }
          }
          for (const payload of links) {
            await fetch(`/api/${tenantSlug}/product-links`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }).catch(() => {});
          }
        }
      } catch (err) {
        setFileItems((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: "error", progress: 0, error: (err as Error).message }
              : f
          )
        );
      } finally {
        uploadingRef.current.delete(item.id);
      }
    },
    [tenantSlug]
  );

  const addFiles = useCallback(
    (files: File[], snapshot: ApplyToAll) => {
      const newItems: FileItem[] = files.map((file) => ({
        id: makeId(),
        file,
        filename: file.name,
        status: "queued" as UploadStatus,
        progress: 0,
        isExpanded: false,
        overrides: { description: "", tags: [], folderId: undefined, assetScope: undefined },
        productLinkSelection: createEmptySelection(),
      }));
      setFileItems((prev) => [...prev, ...newItems]);
      for (const item of newItems) {
        void startUpload(item, snapshot);
      }
    },
    [startUpload]
  );

  const handleLoadVariants = useCallback(
    async (productId: string) => {
      setVariantsLoadingByProductId((prev) => ({ ...prev, [productId]: true }));
      try {
        const res = await fetch(
          `/api/${tenantSlug}/products?parentId=${productId}&limit=100`
        );
        const data = await res.json();
        const items: any[] = data?.data?.products ?? data?.products ?? [];
        const variants: VariantSummary[] = items.map((p) => ({
          id: p.id,
          sku: p.sku,
          productName: p.productName ?? p.product_name ?? p.name ?? "Variant",
          parentId: productId,
          imageUrl: p.thumbnailUrls?.small ?? p.thumbnail_urls?.small ?? null,
        }));
        setVariantsByProductId((prev) => ({ ...prev, [productId]: variants }));
      } catch {
        setVariantsByProductId((prev) => ({ ...prev, [productId]: [] }));
      } finally {
        setVariantsLoadingByProductId((prev) => ({ ...prev, [productId]: false }));
      }
    },
    [tenantSlug]
  );

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) addFiles(files, applyToAll);
    e.target.value = "";
  };

  const uploadedAssetIds = fileItems
    .filter((f) => f.status === "done" && f.assetId)
    .map((f) => f.assetId!);

  const activeFileItem = productLinkFileId
    ? fileItems.find((f) => f.id === productLinkFileId) ?? null
    : null;

  const handleDone = (openBulkEditor = false) => {
    onDone(uploadedAssetIds, openBulkEditor);
    setFileItems([]);
    setApplyToAll({ folderId: initialFolderId ?? null, tags: [], assetScope: "internal" });
    onOpenChange(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex flex-col">
          <SheetHeader>
            <div className="flex items-center gap-3">
              <SheetTitle>Upload Assets</SheetTitle>
              {fileItems.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {fileItems.length} {fileItems.length === 1 ? "file" : "files"}
                </span>
              )}
            </div>
          </SheetHeader>

          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Apply to All */}
            <div className="border-b border-border px-6 py-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Apply to all
              </p>
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  {/* Folder */}
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Folder</label>
                    <Select
                      value={applyToAll.folderId ?? "__none__"}
                      onValueChange={(v) =>
                        setApplyToAll((prev) => ({
                          ...prev,
                          folderId: v === "__none__" ? null : v,
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="No folder" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No folder</SelectItem>
                        {folders.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Scope */}
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Visibility</label>
                    <Select
                      value={applyToAll.assetScope}
                      onValueChange={(v) =>
                        setApplyToAll((prev) => ({ ...prev, assetScope: v }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSET_SCOPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Tags */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Tags (added to all)</label>
                  <TagInput
                    value={applyToAll.tags}
                    onChange={(tags) => setApplyToAll((prev) => ({ ...prev, tags }))}
                    placeholder="Add tags..."
                  />
                </div>
              </div>
            </div>

            {/* File list */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {fileItems.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border py-16 text-center transition-colors hover:border-primary/40 hover:bg-muted/30"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Choose files to upload</p>
                    <p className="text-xs text-muted-foreground">or drag and drop onto this page</p>
                  </div>
                </button>
              ) : (
                <div className="space-y-2">
                  {fileItems.map((item) => (
                    <FileRow
                      key={item.id}
                      item={item}
                      folders={folders}
                      onUpdate={(patch) =>
                        setFileItems((prev) =>
                          prev.map((f) => (f.id === item.id ? { ...f, ...patch } : f))
                        )
                      }
                      onOpenProductLink={() => setProductLinkFileId(item.id)}
                    />
                  ))}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    <Upload className="h-4 w-4" />
                    Add more files
                  </button>
                </div>
              )}
            </div>
          </div>

          {uploadedAssetIds.length > 0 && (
            <SheetFooter>
              <Button variant="outline" size="sm" onClick={() => handleDone(false)}>
                Done
              </Button>
              <Button size="sm" onClick={() => handleDone(true)}>
                Bulk Edit Metadata →
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFilePick}
      />

      {/* Per-file product link dialog */}
      {activeFileItem && (
        <ProductLinkDialog
          open={productLinkFileId !== null}
          onOpenChange={(o) => {
            if (!o) setProductLinkFileId(null);
          }}
          title="Link to Products"
          description="Select products or variants to link this asset after upload."
          products={availableProducts}
          variantsByProductId={variantsByProductId}
          variantsLoadingByProductId={variantsLoadingByProductId}
          selection={activeFileItem.productLinkSelection}
          onChange={(sel) =>
            setFileItems((prev) =>
              prev.map((f) =>
                f.id === productLinkFileId ? { ...f, productLinkSelection: sel } : f
              )
            )
          }
          onLoadVariants={handleLoadVariants}
          onApply={() => setProductLinkFileId(null)}
        />
      )}
    </>
  );
}
