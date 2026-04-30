export type InlineEditMode = "readonly" | "quick-save" | "confirm-save";

export type InlineEditSaveState = "idle" | "saving" | "saved" | "error";

export type InlineReadonlyReasonCode =
  | "system"
  | "locked"
  | "permission"
  | "scope"
  | "custom";

export interface InlineEditFieldDescriptor {
  code?: string | null;
  systemKey?: string | null;
  isSystem?: boolean;
  isLocked?: boolean;
  canWrite?: boolean;
  modeOverride?: InlineEditMode | null;
  requiresConfirm?: boolean;
}

export interface InlineEditPolicyConfig {
  defaultEditableMode: Exclude<InlineEditMode, "readonly">;
  confirmFieldTokens: Set<string>;
  systemReadonlyReason: string;
  lockedReadonlyReason: string;
  permissionReadonlyReason: string;
}

export interface InlineEditFieldPolicy {
  mode: InlineEditMode;
  readonlyReasonCode: InlineReadonlyReasonCode | null;
  readonlyReason: string | null;
}

export const DEFAULT_CONFIRM_FIELD_TOKENS = new Set<string>([
  "status",
  "sku",
  "barcode",
  "upc",
  "launch_date",
  "msrp",
  "cost_of_goods",
  "margin_percent",
  "family_id",
  "variant_axis",
]);

export const DEFAULT_INLINE_EDIT_POLICY: InlineEditPolicyConfig = {
  defaultEditableMode: "quick-save",
  confirmFieldTokens: DEFAULT_CONFIRM_FIELD_TOKENS,
  systemReadonlyReason: "System field",
  lockedReadonlyReason: "Locked field",
  permissionReadonlyReason: "You do not have permission to edit this field",
};

function normalizeToken(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function shouldUseConfirmSaveMode(
  descriptor: Pick<InlineEditFieldDescriptor, "code" | "systemKey" | "requiresConfirm">,
  config: Pick<InlineEditPolicyConfig, "confirmFieldTokens">
): boolean {
  if (descriptor.requiresConfirm) return true;
  const code = normalizeToken(descriptor.code);
  const systemKey = normalizeToken(descriptor.systemKey);
  return config.confirmFieldTokens.has(systemKey || code);
}

export function resolveInlineEditFieldPolicy(
  descriptor: InlineEditFieldDescriptor,
  policy: InlineEditPolicyConfig = DEFAULT_INLINE_EDIT_POLICY
): InlineEditFieldPolicy {
  if (descriptor.modeOverride) {
    if (descriptor.modeOverride === "readonly") {
      return {
        mode: "readonly",
        readonlyReasonCode: "custom",
        readonlyReason: policy.lockedReadonlyReason,
      };
    }
    return {
      mode: descriptor.modeOverride,
      readonlyReasonCode: null,
      readonlyReason: null,
    };
  }

  if (descriptor.isSystem) {
    return {
      mode: "readonly",
      readonlyReasonCode: "system",
      readonlyReason: policy.systemReadonlyReason,
    };
  }

  if (descriptor.isLocked) {
    return {
      mode: "readonly",
      readonlyReasonCode: "locked",
      readonlyReason: policy.lockedReadonlyReason,
    };
  }

  if (descriptor.canWrite === false) {
    return {
      mode: "readonly",
      readonlyReasonCode: "permission",
      readonlyReason: policy.permissionReadonlyReason,
    };
  }

  if (shouldUseConfirmSaveMode(descriptor, policy)) {
    return {
      mode: "confirm-save",
      readonlyReasonCode: null,
      readonlyReason: null,
    };
  }

  return {
    mode: policy.defaultEditableMode,
    readonlyReasonCode: null,
    readonlyReason: null,
  };
}

