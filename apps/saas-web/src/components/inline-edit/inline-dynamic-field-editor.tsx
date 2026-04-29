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
import { AdaptButton } from "@/components/ai/AdaptButton";

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

interface AdaptContext {
  tenant: string;
  fieldCode: string;
  fieldName: string;
  sourceText: string;
  sourceLocale: string;
  targetLocale: string;
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
  adaptContext?: AdaptContext | null;
  isMissingTranslation?: boolean;
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
  adaptContext = null,
  isMissingTranslation = false,
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

  const showAdapt =
    adaptContext &&
    canEdit &&
    Boolean((field as unknown as Record<string, unknown>).is_translatable) &&
    WRITE_ASSIST_FIELD_TYPES.has(fieldType);

  const showActions = showWriteAssist || showAdapt;
  // Show missing badge on locale variation fields (those with adaptContext) when no value is set
  const showMissingBadge = isMissingTranslation && adaptContext !== null && !editor.isDirty;

  return (
    <div className="group/field rounded-md transition-colors hover:bg-muted/30 -mx-2 px-2">
      <div className="flex items-start gap-1 py-0.5">
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

        {/* Action icons — revealed on row hover/focus only */}
        {showActions ? (
          <div className="shrink-0 pt-1 opacity-0 pointer-events-none transition-opacity duration-[120ms] group-hover/field:opacity-100 group-hover/field:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto">
            {showWriteAssist ? (
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
            ) : null}
            {showAdapt ? (
              <AdaptButton
                tenant={adaptContext.tenant}
                fieldCode={adaptContext.fieldCode}
                fieldName={adaptContext.fieldName}
                sourceText={adaptContext.sourceText}
                sourceLocale={adaptContext.sourceLocale}
                targetLocale={adaptContext.targetLocale}
                disabled={!editor.canEdit}
                onAccept={(text) => {
                  editor.setDraftValue(text);
                  void onCommit(text);
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Passive missing-translation indicator — always visible at rest */}
      {showMissingBadge ? (
        <span className="mb-1 inline-flex items-center rounded-sm border border-dashed border-muted-foreground/30 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground/50">
          Missing
        </span>
      ) : null}

      {readonlyReason ? <p className="mt-1 text-xs text-muted-foreground">{readonlyReason}</p> : null}
    </div>
  );
}
