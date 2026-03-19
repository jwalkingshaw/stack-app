"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { type InlineEditMode, type InlineEditSaveState } from "./contract";

type EqualityFn<T> = (left: T, right: T) => boolean;

export interface UseInlineEditFieldOptions<T> {
  mode: InlineEditMode;
  value: T;
  canEdit?: boolean;
  onCommit: (nextValue: T) => Promise<void> | void;
  equals?: EqualityFn<T>;
  clearSavedAfterMs?: number;
}

export interface InlineKeyDownOptions {
  commitOnEnter?: boolean;
}

export interface UseInlineEditFieldResult<T> {
  mode: InlineEditMode;
  canEdit: boolean;
  value: T;
  draftValue: T;
  committedValue: T;
  isDirty: boolean;
  saveState: InlineEditSaveState;
  errorMessage: string | null;
  setDraftValue: (nextValue: T) => void;
  commitDraft: () => Promise<boolean>;
  cancelDraft: () => void;
  handleBlur: () => void;
  handleKeyDown: (event: KeyboardEvent<HTMLElement>, options?: InlineKeyDownOptions) => void;
}

function defaultEquals<T>(left: T, right: T): boolean {
  return Object.is(left, right);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Failed to save changes";
}

export function useInlineEditField<T>({
  mode,
  value,
  canEdit = true,
  onCommit,
  equals = defaultEquals,
  clearSavedAfterMs = 1200,
}: UseInlineEditFieldOptions<T>): UseInlineEditFieldResult<T> {
  const [draftValue, setDraftValueState] = useState<T>(value);
  const [committedValue, setCommittedValue] = useState<T>(value);
  const [saveState, setSaveState] = useState<InlineEditSaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const saveStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const isDirty = useMemo(() => !equals(draftValue, committedValue), [committedValue, draftValue, equals]);

  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    const externalValueChanged = !equals(value, committedValue);
    if (!externalValueChanged) return;

    setCommittedValue(value);
    setDraftValueState((currentDraft) => (dirtyRef.current ? currentDraft : value));
  }, [committedValue, equals, value]);

  useEffect(
    () => () => {
      if (saveStateTimerRef.current) {
        clearTimeout(saveStateTimerRef.current);
        saveStateTimerRef.current = null;
      }
    },
    []
  );

  const clearSaveStateTimer = useCallback(() => {
    if (!saveStateTimerRef.current) return;
    clearTimeout(saveStateTimerRef.current);
    saveStateTimerRef.current = null;
  }, []);

  const setDraftValue = useCallback((nextValue: T) => {
    if (!canEdit || mode === "readonly") return;
    setErrorMessage(null);
    if (saveState === "error") {
      setSaveState("idle");
    }
    setDraftValueState(nextValue);
  }, [canEdit, mode, saveState]);

  const commitDraft = useCallback(async (): Promise<boolean> => {
    if (!canEdit || mode === "readonly") return false;
    if (saveState === "saving") return false;
    if (!isDirty) return true;

    setSaveState("saving");
    setErrorMessage(null);
    clearSaveStateTimer();

    try {
      await onCommit(draftValue);
      setCommittedValue(draftValue);
      setSaveState("saved");
      if (clearSavedAfterMs > 0) {
        saveStateTimerRef.current = setTimeout(() => {
          setSaveState("idle");
        }, clearSavedAfterMs);
      }
      return true;
    } catch (error) {
      setSaveState("error");
      setErrorMessage(toErrorMessage(error));
      return false;
    }
  }, [canEdit, clearSaveStateTimer, clearSavedAfterMs, draftValue, isDirty, mode, onCommit, saveState]);

  const cancelDraft = useCallback(() => {
    clearSaveStateTimer();
    setDraftValueState(committedValue);
    setErrorMessage(null);
    setSaveState("idle");
  }, [clearSaveStateTimer, committedValue]);

  const handleBlur = useCallback(() => {
    if (mode !== "quick-save") return;
    if (!canEdit || !isDirty || saveState === "saving") return;
    void commitDraft();
  }, [canEdit, commitDraft, isDirty, mode, saveState]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, options?: InlineKeyDownOptions) => {
      const commitOnEnter = options?.commitOnEnter ?? true;

      if (event.key === "Escape") {
        event.preventDefault();
        cancelDraft();
        return;
      }

      if (!commitOnEnter) return;
      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
      if (!canEdit || mode === "readonly") return;

      event.preventDefault();
      void commitDraft();
    },
    [canEdit, cancelDraft, commitDraft, mode]
  );

  return {
    mode,
    canEdit: canEdit && mode !== "readonly",
    value,
    draftValue,
    committedValue,
    isDirty,
    saveState,
    errorMessage,
    setDraftValue,
    commitDraft,
    cancelDraft,
    handleBlur,
    handleKeyDown,
  };
}

