"use client";

import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InlineConfirmActionsProps {
  dirty: boolean;
  saving?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function InlineConfirmActions({
  dirty,
  saving = false,
  disabled = false,
  onConfirm,
  onCancel,
  className,
  confirmLabel = "Save",
  cancelLabel = "Discard",
}: InlineConfirmActionsProps) {
  if (!dirty) return null;

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onConfirm}
        disabled={disabled || saving}
        title={confirmLabel}
        aria-label={confirmLabel}
        className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onCancel}
        disabled={disabled || saving}
        title={cancelLabel}
        aria-label={cancelLabel}
        className="text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

