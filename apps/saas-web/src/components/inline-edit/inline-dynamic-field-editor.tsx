"use client";

import { useCallback, useMemo } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import {
  DynamicFieldRenderer,
  type ProductField,
} from "@/components/field-types/DynamicFieldRenderer";
import { InlineEditFieldFrame } from "./inline-edit-field-frame";
import {
  type InlineEditFieldDescriptor,
  type InlineEditMode,
  resolveInlineEditFieldPolicy,
} from "./contract";
import { useInlineEditField } from "./use-inline-edit-field";

interface InlineDynamicFieldEditorProps {
  field: ProductField;
  value: unknown;
  tenantSlug?: string;
  canEdit: boolean;
  fieldDescriptor?: Partial<InlineEditFieldDescriptor>;
  modeOverride?: InlineEditMode | null;
  readonlyReasonOverride?: string | null;
  rendererClassName?: string;
  productName?: string;
  ingredients?: string;
  otherIngredients?: string;
  onCommit: (nextValue: unknown) => Promise<void> | void;
}

const ENTER_COMMIT_FIELD_TYPES = new Set([
  "text",
  "number",
  "date",
  "measurement",
  "price",
]);

function areFieldValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object" || !left || !right) {
    return false;
  }
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function InlineDynamicFieldEditor({
  field,
  value,
  tenantSlug,
  canEdit,
  fieldDescriptor,
  modeOverride = null,
  readonlyReasonOverride = null,
  rendererClassName,
  productName,
  ingredients,
  otherIngredients,
  onCommit,
}: InlineDynamicFieldEditorProps) {
  const descriptor = useMemo(
    () => ({
      code: field?.code,
      systemKey: field?.options?.system_key,
      canWrite: canEdit,
      modeOverride,
      ...fieldDescriptor,
    }),
    [canEdit, field?.code, field?.options?.system_key, fieldDescriptor, modeOverride]
  );

  const policy = useMemo(() => resolveInlineEditFieldPolicy(descriptor), [descriptor]);
  const editor = useInlineEditField({
    mode: policy.mode,
    value,
    canEdit,
    onCommit,
    equals: areFieldValuesEqual,
  });

  const fieldType = String(field?.field_type || "").trim().toLowerCase();
  const commitOnEnter = ENTER_COMMIT_FIELD_TYPES.has(fieldType);

  const handleBlurCapture = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const relatedTarget = event.relatedTarget as Node | null;
      if (relatedTarget && event.currentTarget.contains(relatedTarget)) return;
      editor.handleBlur();
    },
    [editor]
  );

  const handleKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      editor.handleKeyDown(event, { commitOnEnter });
    },
    [commitOnEnter, editor]
  );

  const readonlyReason =
    policy.mode === "readonly" ? readonlyReasonOverride || policy.readonlyReason : null;

  return (
    <div>
      <InlineEditFieldFrame
        mode={policy.mode}
        dirty={editor.isDirty}
        saveState={editor.saveState}
        errorMessage={editor.errorMessage}
        onConfirm={() => {
          void editor.commitDraft();
        }}
        onCancel={editor.cancelDraft}
      >
        <div onBlurCapture={handleBlurCapture} onKeyDownCapture={handleKeyDownCapture}>
          <DynamicFieldRenderer
            field={field}
            value={editor.draftValue}
            onChange={(_fieldCode, nextValue) => editor.setDraftValue(nextValue)}
            tenantSlug={tenantSlug}
            disabled={!editor.canEdit}
            className={rendererClassName}
            productName={productName}
            ingredients={ingredients}
            otherIngredients={otherIngredients}
          />
        </div>
      </InlineEditFieldFrame>
      {readonlyReason ? <p className="mt-1 text-xs text-muted-foreground">{readonlyReason}</p> : null}
    </div>
  );
}
