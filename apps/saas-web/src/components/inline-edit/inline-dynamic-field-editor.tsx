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
import { WriteAssistButton } from "@/components/ai/WriteAssistButton";

const WRITE_ASSIST_FIELD_TYPES = new Set(["text", "textarea"]);

interface WriteAssistContext {
  tenant: string;
  productId: string;
  defaultLocale?: string;
  productContext: {
    productName?: string;
    familyName?: string;
    otherFields?: Record<string, unknown>;
  };
}

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
  writeAssistContext?: WriteAssistContext | null;
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
  writeAssistContext = null,
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

  const showWriteAssist =
    writeAssistContext &&
    canEdit &&
    Boolean((field as unknown as Record<string, unknown>).is_write_assist_enabled) &&
    WRITE_ASSIST_FIELD_TYPES.has(fieldType);

  return (
    <div className="group/field">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
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
        </div>

        {showWriteAssist ? (
          <div className="shrink-0 pt-1">
            <WriteAssistButton
              tenant={writeAssistContext.tenant}
              productId={writeAssistContext.productId}
              fieldCode={field.code}
              fieldName={field.name}
              fieldType={fieldType}
              defaultLocale={writeAssistContext.defaultLocale}
              productContext={writeAssistContext.productContext}
              currentValue={typeof editor.draftValue === "string" ? editor.draftValue : undefined}
              disabled={!editor.canEdit}
              onAccept={(text) => {
                editor.setDraftValue(text);
                void onCommit(text);
              }}
            />
          </div>
        ) : null}
      </div>
      {readonlyReason ? <p className="mt-1 text-xs text-muted-foreground">{readonlyReason}</p> : null}
    </div>
  );
}
