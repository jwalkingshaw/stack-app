"use client";

import { useState } from "react";
import { Sparkles, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";

interface ComplianceFlag {
  phrase: string;
  rule: string;
  severity: "error" | "warning";
  suggestion: string;
}

interface WriteAssistButtonProps {
  tenant: string;
  productId: string;
  fieldCode: string;
  fieldName: string;
  fieldType: string;
  defaultLocale?: string;
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
  productContext,
  onAccept,
  disabled,
}: WriteAssistButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [complianceFlags, setComplianceFlags] = useState<ComplianceFlag[]>([]);
  const [editedSuggestion, setEditedSuggestion] = useState("");

  const generate = async () => {
    setLoading(true);
    setSuggestion("");
    setComplianceFlags([]);
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
      setComplianceFlags(Array.isArray(data.complianceFlags) ? data.complianceFlags : []);
    } catch {
      toast.error("Failed to generate content");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    void generate();
  };

  const handleAccept = () => {
    onAccept(editedSuggestion);
    setOpen(false);
  };

  const errorFlags = complianceFlags.filter((f) => f.severity === "error");
  const warningFlags = complianceFlags.filter((f) => f.severity === "warning");

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
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 animate-pulse shrink-0" />
                Drafting content…
              </div>
            ) : suggestion ? (
              <>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Suggestion
                  </p>
                  <Textarea
                    value={editedSuggestion}
                    onChange={(e) => setEditedSuggestion(e.target.value)}
                    className="min-h-[120px] resize-none text-sm"
                    placeholder="Generated content will appear here"
                  />
                </div>

                {complianceFlags.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Compliance review
                    </p>
                    {[...errorFlags, ...warningFlags].map((flag, i) => (
                      <div
                        key={i}
                        className="rounded-md border px-3 py-2.5 text-xs space-y-1"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle
                            className={`h-3.5 w-3.5 shrink-0 ${
                              flag.severity === "error" ? "text-red-500" : "text-amber-500"
                            }`}
                          />
                          <Badge
                            variant={flag.severity === "error" ? "error" : "warning"}
                            className="text-[10px]"
                          >
                            {flag.severity === "error" ? "Issue" : "Warning"}
                          </Badge>
                          <span className="font-medium text-foreground">
                            &ldquo;{flag.phrase}&rdquo;
                          </span>
                        </div>
                        <p className="text-muted-foreground pl-5">{flag.rule}</p>
                        {flag.suggestion ? (
                          <p className="text-muted-foreground pl-5">
                            Try: <span className="italic">{flag.suggestion}</span>
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                    <CheckCircle className="h-3.5 w-3.5" />
                    No compliance issues found
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t px-5 py-4 bg-muted/30 shrink-0">
            {suggestion && !loading ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void generate()}
                  className="gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Try again
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAccept}
                    disabled={!editedSuggestion.trim()}
                  >
                    Accept
                  </Button>
                </div>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="ml-auto">
                Cancel
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
