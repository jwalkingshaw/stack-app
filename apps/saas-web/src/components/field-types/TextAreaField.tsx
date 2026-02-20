'use client';

import { FileText } from 'lucide-react';

interface TextAreaFieldProps {}

export default function TextAreaField(_: TextAreaFieldProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-foreground">Multi-line text input</h4>
          <p className="text-sm leading-6 text-muted-foreground">
            Captures larger bodies of copy such as descriptions or usage notes. No additional configuration required.
          </p>
        </div>
      </div>
    </div>
  );
}
