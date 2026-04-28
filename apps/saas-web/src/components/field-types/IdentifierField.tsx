'use client';

import { KeyRound } from 'lucide-react';

export default function IdentifierField() {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-foreground">Identifier field</h4>
          <p className="text-sm leading-6 text-muted-foreground">
            Identifier attributes must stay unique across all products, cannot be channel-specific or localized, and are always required.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border/60 bg-background px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
        <div className="mt-3 space-y-1 text-sm">
          <div className="font-medium text-foreground">SKU</div>
          <div className="font-mono text-muted-foreground">SKU-000123</div>
          <p className="text-xs text-muted-foreground">One unique value per product is required.</p>
        </div>
      </div>
    </div>
  );
}
