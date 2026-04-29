"use client";

import { useState } from "react";
import { Languages, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";

interface SourcePhraseChange {
  sourcePhrase: string;
  reason: string;
  severity: "error" | "warning";
  adaptedTo: string;
}

interface AdaptButtonProps {
  tenant: string;
  fieldCode: string;
  fieldName: string;
  sourceText: string;
  sourceLocale: string;
  targetLocale: string;
  onAccept: (text: string) => void;
  disabled?: boolean;
}

export function AdaptButton({
  tenant,
  fieldCode,
  fieldName,
  sourceText,
  sourceLocale,
  targetLocale,
  onAccept,
  disabled,
}: AdaptButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adaptedText, setAdaptedText] = useState("");
  const [editedText, setEditedText] = useState("");
  const [backTranslation, setBackTranslation] = useState("");
  const [sourcePhraseChanges, setSourcePhraseChanges] = useState<SourcePhraseChange[]>([]);
  const [status, setStatus] = useState<"compliant" | "adapted" | "">("");
  const [refinement, setRefinement] = useState("");

  const adapt = async () => {
    if (!sourceText.trim()) {
      toast.error("No base content to adapt. Add content in the default locale first.");
      return;
    }

    setLoading(true);
    setAdaptedText("");
    setEditedText("");
    setBackTranslation("");
    setSourcePhraseChanges([]);
    setStatus("");

    try {
      const res = await fetch(`/api/${tenant}/ai/adapt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldCode,
          fieldName,
          sourceText,
          sourceLocale,
          targetLocale,
          ...(refinement ? { refinement } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(typeof err.error === "string" ? err.error : "Failed to adapt content");
        return;
      }

      const data = await res.json();
      const text = typeof data.adaptedText === "string" ? data.adaptedText : "";
      setAdaptedText(text);
      setEditedText(text);
      setBackTranslation(typeof data.backTranslation === "string" ? data.backTranslation : "");
      setSourcePhraseChanges(Array.isArray(data.sourcePhraseChanges) ? data.sourcePhraseChanges : []);
      setStatus(data.status === "adapted" ? "adapted" : "compliant");
    } catch {
      toast.error("Failed to adapt content");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setLoading(true);
    setOpen(true);
    void adapt();
  };

  const handleAccept = () => {
    onAccept(editedText);
    setOpen(false);
  };

  const errorChanges = sourcePhraseChanges.filter((c) => c.severity === "error");
  const warningChanges = sourcePhraseChanges.filter((c) => c.severity === "warning");

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled || !sourceText.trim()}
        title="Adapt for this locale"
        aria-label="Adapt for this locale"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
      >
        <Languages className="h-3.5 w-3.5" />
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
              <Languages className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-sm font-semibold text-foreground leading-none">
                Adapt
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{fieldName} · {targetLocale}</p>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {loading ? (
              <div className="space-y-4" role="status" aria-label="Adapting content">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Adapted
                  </p>
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-4/5" />
                  <Skeleton className="h-5 w-3/5" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Roughly means
                  </p>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <span className="sr-only">Adapting content…</span>
              </div>
            ) : adaptedText ? (
              <>
                {/* Adapted text */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Adapted
                  </p>
                  <Textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="min-h-[120px] resize-none text-sm"
                  />
                </div>

                {/* Back-translation */}
                {backTranslation ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Roughly means
                    </p>
                    <p className="text-xs text-muted-foreground italic leading-relaxed">
                      {backTranslation}
                    </p>
                  </div>
                ) : null}

                {/* Compliance changes */}
                {status === "adapted" && sourcePhraseChanges.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Changes made for compliance
                    </p>
                    {[...errorChanges, ...warningChanges].map((change, i) => (
                      <div key={i} className="rounded-md border px-3 py-2.5 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <AlertTriangle
                            className={`h-3.5 w-3.5 shrink-0 ${
                              change.severity === "error" ? "text-red-500" : "text-amber-500"
                            }`}
                          />
                          <Badge
                            variant={change.severity === "error" ? "error" : "warning"}
                            className="text-[10px]"
                          >
                            {change.severity === "error" ? "Corrected" : "Adjusted"}
                          </Badge>
                          <span className="font-medium text-foreground">
                            &ldquo;{change.sourcePhrase}&rdquo;
                          </span>
                        </div>
                        <p className="text-muted-foreground pl-5">{change.reason}</p>
                        {change.adaptedTo ? (
                          <p className="text-muted-foreground pl-5">
                            Adapted to: <span className="italic">{change.adaptedTo}</span>
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : status === "compliant" ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Translated — no compliance changes needed
                  </div>
                ) : null}

                {/* Refinement */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Guidance for regeneration
                  </p>
                  <Textarea
                    value={refinement}
                    onChange={(e) => setRefinement(e.target.value)}
                    placeholder={`e.g. "Avoid any size claims" or paste alternative copy in ${sourceLocale} to translate fresh`}
                    className="min-h-[60px] resize-none text-xs"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleAccept}
                    disabled={!editedText.trim()}
                  >
                    Accept
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                    Dismiss
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void adapt()}
                    className="ml-auto"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {refinement.trim() ? "Apply & Regenerate" : "Regenerate"}
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
