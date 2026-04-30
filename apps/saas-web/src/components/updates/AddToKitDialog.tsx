"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DraftUpdate = {
  id: string;
  title: string;
  updated_at: string;
};

export type KitItemInput = {
  type: "product" | "asset";
  id: string;
  name?: string;
};

interface AddToKitDialogProps {
  tenantSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: KitItemInput[];
}

export function AddToKitDialog({ tenantSlug, open, onOpenChange, items }: AddToKitDialogProps) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedUpdateId, setSelectedUpdateId] = useState<string>("new");
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/${tenantSlug}/updates?status=draft&pageSize=50`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setDrafts([]);
        return;
      }
      const payload = await response.json();
      setDrafts(Array.isArray(payload.data) ? payload.data : []);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    if (!open) return;
    setSelectedUpdateId("new");
    setNewTitle("");
    setError(null);
    void fetchDrafts();
  }, [open, fetchDrafts]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      let updateId = selectedUpdateId;

      if (selectedUpdateId === "new") {
        const title = newTitle.trim() || `Kit – ${new Date().toLocaleDateString()}`;
        const createResponse = await fetch(`/api/${tenantSlug}/updates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, status: "draft" }),
        });
        const createPayload = await createResponse.json().catch(() => ({}));
        if (!createResponse.ok) {
          setError((createPayload as { error?: string }).error || "Failed to create kit.");
          return;
        }
        updateId = (createPayload as { data?: { id?: string } }).data?.id ?? "";
        if (!updateId) {
          setError("Failed to create kit.");
          return;
        }
      }

      const kitItems = items.map((item) => ({
        itemType: item.type,
        ...(item.type === "product" ? { productId: item.id } : { assetId: item.id }),
        title: item.name || null,
      }));

      const addResponse = await fetch(`/api/${tenantSlug}/updates/${updateId}/kit-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: kitItems }),
      });
      if (!addResponse.ok) {
        const addPayload = await addResponse.json().catch(() => ({}));
        setError((addPayload as { error?: string }).error || "Failed to add items to kit.");
        return;
      }

      onOpenChange(false);
      router.push(`/${tenantSlug}/updates/${updateId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const productCount = items.filter((i) => i.type === "product").length;
  const assetCount = items.filter((i) => i.type === "asset").length;
  const itemLabel =
    items.length === 1
      ? (items[0].name || (items[0].type === "product" ? "1 product" : "1 asset"))
      : productCount > 0 && assetCount > 0
        ? `${productCount} product${productCount > 1 ? "s" : ""} and ${assetCount} asset${assetCount > 1 ? "s" : ""}`
        : productCount > 0
          ? `${productCount} product${productCount > 1 ? "s" : ""}`
          : `${assetCount} asset${assetCount > 1 ? "s" : ""}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Kit</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Add <span className="font-medium text-foreground">{itemLabel}</span> to a Partner Update kit.
          </p>

          {/* New kit option */}
          <button
            type="button"
            onClick={() => setSelectedUpdateId("new")}
            className={cn(
              "w-full rounded-lg border px-4 py-3 text-left transition-colors",
              selectedUpdateId === "new"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
            )}
          >
            <div className="flex items-center gap-3">
              <PackagePlus className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">New kit</p>
                <p className="text-xs text-muted-foreground">Create a new draft update</p>
              </div>
            </div>
            {selectedUpdateId === "new" && (
              <div className="mt-3">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={`Kit – ${new Date().toLocaleDateString()}`}
                  className="h-8 text-sm"
                  autoFocus
                />
              </div>
            )}
          </button>

          {/* Existing drafts */}
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-muted/40" />
              ))}
            </div>
          ) : drafts.length > 0 ? (
            <div className="space-y-1.5">
              <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Existing drafts
              </p>
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {drafts.map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => setSelectedUpdateId(draft.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left transition-colors",
                      selectedUpdateId === draft.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{draft.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "Adding..." : "Add to Kit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
