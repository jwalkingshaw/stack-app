"use client";

import type { ReactNode } from "react";
import { InlineConfirmActions } from "./inline-confirm-actions";
import type { InlineEditMode, InlineEditSaveState } from "./contract";
import { cn } from "@/lib/utils";

interface InlineEditFieldFrameProps {
  mode: InlineEditMode;
  dirty: boolean;
  saveState: InlineEditSaveState;
  errorMessage?: string | null;
  onConfirm?: () => void;
  onCancel?: () => void;
  className?: string;
  actionsClassName?: string;
  statusClassName?: string;
  children: ReactNode;
}

export function InlineEditFieldFrame({
  mode,
  dirty,
  saveState,
  errorMessage = null,
  onConfirm,
  onCancel,
  className,
  actionsClassName,
  statusClassName,
  children,
}: InlineEditFieldFrameProps) {
  const shouldShowConfirm = mode === "confirm-save" && dirty && onConfirm && onCancel;
  const showStatusMessage = mode !== "confirm-save" && (saveState === "saved" || saveState === "error");

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {shouldShowConfirm ? (
          <InlineConfirmActions
            dirty={dirty}
            saving={saveState === "saving"}
            onConfirm={onConfirm}
            onCancel={onCancel}
            className={actionsClassName}
          />
        ) : null}
      </div>

      {showStatusMessage && saveState === "saved" ? (
        <p className={cn("text-xs text-emerald-600", statusClassName)}>Saved</p>
      ) : null}

      {showStatusMessage && saveState === "error" && errorMessage ? (
        <p className={cn("text-xs text-destructive", statusClassName)}>{errorMessage}</p>
      ) : null}
    </div>
  );
}

