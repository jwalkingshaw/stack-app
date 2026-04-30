"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, AlertCircle, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type UploadStatus = "queued" | "uploading" | "done" | "error";

type FileItem = {
  id: string;
  file: File;
  filename: string;
  status: UploadStatus;
  progress: number;
  assetId?: string;
  error?: string;
};

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
    return <span className="text-xs text-emerald-600">✓</span>;
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

function FileRow({ item }: { item: FileItem }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-xs">{item.filename}</span>
        <StatusBadge status={item.status} progress={item.progress} />
      </div>
      <div className="mt-1.5">
        <ProgressBar status={item.status} progress={item.progress} />
      </div>
      {item.error && (
        <p className="mt-1 text-xs text-destructive">{item.error}</p>
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
  onDone,
  onFileUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  initialFiles?: File[];
  initialFolderId?: string | null;
  folders?: unknown[]; // kept for API compatibility
  onDone: (uploadedAssetIds: string[]) => void;
  onFileUploaded?: (assetId: string) => void;
}) {
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef<Set<string>>(new Set());
  const initialFilesApplied = useRef(false);

  // Apply initial dropped files once per open
  useEffect(() => {
    if (open && initialFiles && initialFiles.length > 0 && !initialFilesApplied.current) {
      initialFilesApplied.current = true;
      addFiles(initialFiles);
    }
    if (!open) {
      initialFilesApplied.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-close once all files are done/error (nothing queued or uploading)
  useEffect(() => {
    if (fileItems.length === 0) return;
    const allSettled = fileItems.every(
      (f) => f.status === "done" || f.status === "error"
    );
    if (!allSettled) return;

    const uploadedAssetIds = fileItems
      .filter((f) => f.status === "done" && f.assetId)
      .map((f) => f.assetId!);

    const timer = setTimeout(() => {
      onDone(uploadedAssetIds);
      setFileItems([]);
      onOpenChange(false);
    }, 800); // brief pause so the user sees the final ✓ states

    return () => clearTimeout(timer);
  }, [fileItems, onDone, onOpenChange]);

  const startUpload = useCallback(
    async (item: FileItem) => {
      if (uploadingRef.current.has(item.id)) return;
      uploadingRef.current.add(item.id);

      setFileItems((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: "uploading", progress: 0 } : f))
      );

      try {
        const metadata = {
          name: item.filename,
          folderId: initialFolderId ?? null,
          uploadProfileId: "fast",
          assetScope: "internal",
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

        if (assetId) onFileUploaded?.(assetId);
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
    [tenantSlug, onFileUploaded, initialFolderId]
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const newItems: FileItem[] = files.map((file) => ({
        id: makeId(),
        file,
        filename: file.name,
        status: "queued" as UploadStatus,
        progress: 0,
      }));
      setFileItems((prev) => [...prev, ...newItems]);
      for (const item of newItems) {
        void startUpload(item);
      }
    },
    [startUpload]
  );

  const [isDragOver, setIsDragOver] = useState(false);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) addFiles(files);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the panel entirely (not just a child element)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) addFiles(files);
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

          <div
            className="flex flex-1 flex-col overflow-hidden"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {fileItems.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-16 text-center transition-colors ${isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}
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
                    <FileRow key={item.id} item={item} />
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
        </SheetContent>
      </Sheet>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFilePick}
      />
    </>
  );
}
