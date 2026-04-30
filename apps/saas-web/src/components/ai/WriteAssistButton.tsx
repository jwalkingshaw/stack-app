"use client";

import { useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";

interface WriteAssistButtonProps {
  tenant: string;
  productId: string;
  fieldCode: string;
  fieldName: string;
  fieldType: string;
  defaultLocale?: string;
  currentValue?: string;
  productContext: {
    productName?: string;
    familyName?: string;
    otherFields?: Record<string, unknown>;
  };
  onAccept: (text: string) => void;
  disabled?: boolean;
}

export function WriteAssistButton({
  tenant,
  productId,
  fieldCode,
  fieldName,
  fieldType,
  defaultLocale = "en",
  currentValue,
  productContext,
  onAccept,
  disabled,
}: WriteAssistButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [editedSuggestion, setEditedSuggestion] = useState("");
  const [refinement, setRefinement] = useState("");

  const generate = async () => {
    setLoading(true);
    setSuggestion("");
    setEditedSuggestion("");

    try {
      const res = await fetch(`/api/${tenant}/ai/write-assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          fieldCode,
          fieldName,
          fieldType,
          defaultLocale,
          currentValue: currentValue ?? "",
          refinement,
          productContext,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(typeof err.error === "string" ? err.error : "Failed to generate content");
        return;
      }

      const data = await res.json();
      const text = typeof data.suggestion === "string" ? data.suggestion : "";
      setSuggestion(text);
      setEditedSuggestion(text);
    } catch {
      toast.error("Failed to generate content");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setLoading(true);
    setOpen(true);
    void generate();
  };

  const handleAccept = () => {
    onAccept(editedSuggestion);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        title="Write Assist"
        aria-label="Write Assist"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
      >
        <Sparkles className="h-3.5 w-3.5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          size="panel"
          className="flex flex-col overflow-hidden p-0 max-w-2xl"
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-3.5 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/8 shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-sm font-semibold text-foreground leading-none">
                Write Assist
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{fieldName}</p>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {loading ? (
              <div className="space-y-2" role="status" aria-label="Drafting content">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Suggestion
                </p>
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-4/5" />
                <Skeleton className="h-5 w-3/5" />
                <span className="sr-only">Drafting content…</span>
              </div>
            ) : suggestion ? (
              <>
                {/* Suggestion */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Suggestion
                  </p>
                  <Textarea
                    value={editedSuggestion}
                    onChange={(e) => setEditedSuggestion(e.target.value)}
                    className="min-h-[120px] resize-none text-sm"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleAccept}
                    disabled={!editedSuggestion.trim()}
                  >
                    Accept
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                    Dismiss
                  </Button>
                </div>

                <hr className="border-border/60" />

                {/* Refine */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Refine (optional)
                  </p>
                  <Textarea
                    value={refinement}
                    onChange={(e) => setRefinement(e.target.value)}
                    placeholder="Direction, tone, or focus — e.g. shorter, highlight key benefits, more scientific…"
                    className="min-h-[72px] resize-none text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void generate()}
                  >
                    <RefreshCw className="h-3 w-3" />
                    {refinement.trim() ? "Generate" : "Regenerate"}
                  </Button>
                </div>
              </>
            ) : null}
          </div>

          {/* Disclaimer */}
          <div className="shrink-0 border-t border-border/60 px-5 py-3">
            <p className="text-[11px] text-muted-foreground">
              AI-generated content is guidance only. Verify compliance before publishing.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
