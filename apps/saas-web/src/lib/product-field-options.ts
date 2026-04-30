type UnknownRecord = Record<string, unknown>;

export type ProductFieldOption = {
  id: string;
  label: string;
  value: string;
  sort_order: number;
};

type FieldType = string;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toOptionToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function normalizeBooleanLike(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return null;
}

function normalizeNumberLike(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isSelectLikeFieldType(fieldType: FieldType): boolean {
  const normalized = String(fieldType || "").trim().toLowerCase();
  return normalized === "select" || normalized === "multiselect" || normalized === "multi_select";
}

function isMultiSelectFieldType(fieldType: FieldType): boolean {
  const normalized = String(fieldType || "").trim().toLowerCase();
  return normalized === "multiselect" || normalized === "multi_select";
}

function normalizeOptionList(value: unknown): ProductFieldOption[] {
  const rawOptions = Array.isArray(value) ? value : [];
  const seenValues = new Set<string>();
  const normalized: ProductFieldOption[] = [];

  rawOptions.forEach((entry, index) => {
    const optionRecord = asRecord(entry);
    const rawLabel = trimString(optionRecord.label ?? entry);
    const rawValue = trimString(optionRecord.value);
    const canonicalValue = toOptionToken(rawValue || rawLabel);
    const label = rawLabel || rawValue;

    if (!label || !canonicalValue || seenValues.has(canonicalValue)) {
      return;
    }

    seenValues.add(canonicalValue);
    normalized.push({
      id: trimString(optionRecord.id) || canonicalValue,
      label,
      value: canonicalValue,
      sort_order: index + 1,
    });
  });

  return normalized;
}

function buildOptionAliasMap(options: ProductFieldOption[]): Map<string, string> {
  const aliases = new Map<string, string>();

  options.forEach((option) => {
    const candidates = [
      option.value,
      option.label,
      option.value.toLowerCase(),
      option.label.toLowerCase(),
      toOptionToken(option.value),
      toOptionToken(option.label),
    ];

    candidates.forEach((candidate) => {
      const normalized = typeof candidate === "string" ? candidate.trim() : "";
      if (!normalized || aliases.has(normalized)) return;
      aliases.set(normalized, option.value);
    });
  });

  return aliases;
}

function resolveCanonicalOptionValue(
  rawValue: unknown,
  options: ProductFieldOption[]
): { value: string | null; invalid: boolean } {
  if (rawValue === null || typeof rawValue === "undefined") {
    return { value: null, invalid: false };
  }

  const raw = trimString(rawValue);
  if (!raw) {
    return { value: null, invalid: false };
  }

  const aliases = buildOptionAliasMap(options);
  const directMatch = aliases.get(raw) ?? aliases.get(raw.toLowerCase()) ?? aliases.get(toOptionToken(raw));
  if (!directMatch) {
    return { value: null, invalid: true };
  }

  return { value: directMatch, invalid: false };
}

export function normalizeProductFieldOptions(params: {
  fieldType: FieldType;
  options: unknown;
  defaultValue?: unknown;
}): {
  options: Record<string, unknown>;
  defaultValue: unknown;
  error?: string;
} {
  const fieldType = String(params.fieldType || "").trim().toLowerCase();
  const baseOptions = { ...asRecord(params.options) };

  if (fieldType === "boolean") {
    const displayStyleCandidate = trimString(baseOptions.display_style ?? baseOptions.displayStyle).toLowerCase();
    const displayStyle =
      displayStyleCandidate === "toggle" || displayStyleCandidate === "radio"
        ? displayStyleCandidate
        : "checkbox";
    const defaultCandidate =
      params.defaultValue ?? baseOptions.default_value ?? baseOptions.defaultValue ?? false;
    const defaultValue = normalizeBooleanLike(defaultCandidate);
    if (defaultValue === null) {
      return {
        options: baseOptions,
        defaultValue: null,
        error: "Boolean attributes must use true or false defaults.",
      };
    }

    return {
      options: {
        ...baseOptions,
        display_style: displayStyle,
        true_label: trimString(baseOptions.true_label ?? baseOptions.trueLabel) || "Yes",
        false_label: trimString(baseOptions.false_label ?? baseOptions.falseLabel) || "No",
        default_value: defaultValue,
        defaultValue,
      },
      defaultValue: null,
    };
  }

  if (!isSelectLikeFieldType(fieldType)) {
    return {
      options: baseOptions,
      defaultValue: params.defaultValue,
    };
  }

  const normalizedOptions = normalizeOptionList(baseOptions.options ?? baseOptions.choices);
  const normalized = {
    ...baseOptions,
    options: normalizedOptions,
  } as Record<string, unknown>;
  delete normalized.choices;

  if (typeof baseOptions.placeholder === "string") {
    normalized.placeholder = baseOptions.placeholder.trim();
  }
  if (typeof baseOptions.allowEmpty === "boolean") {
    normalized.allowEmpty = baseOptions.allowEmpty;
  }
  if (typeof baseOptions.allow_empty === "boolean") {
    normalized.allow_empty = baseOptions.allow_empty;
  }

  if (isMultiSelectFieldType(fieldType)) {
    const maxSelections = normalizeNumberLike(baseOptions.max_selections);
    const minSelections = normalizeNumberLike(baseOptions.min_selections);
    if (typeof maxSelections === "number") normalized.max_selections = Math.max(1, Math.round(maxSelections));
    if (typeof minSelections === "number") normalized.min_selections = Math.max(0, Math.round(minSelections));

    const rawDefault =
      params.defaultValue ?? baseOptions.defaultValue ?? baseOptions.default_value ?? [];
    const rawValues = Array.isArray(rawDefault)
      ? rawDefault
      : rawDefault === null || typeof rawDefault === "undefined" || trimString(rawDefault).length === 0
        ? []
        : [rawDefault];

    const nextDefaults: string[] = [];
    const seenDefaults = new Set<string>();
    for (const rawValue of rawValues) {
      const resolved = resolveCanonicalOptionValue(rawValue, normalizedOptions);
      if (resolved.invalid) {
        return {
          options: normalized,
          defaultValue: [],
          error: "Multi-select defaults must match configured option values.",
        };
      }
      if (!resolved.value || seenDefaults.has(resolved.value)) continue;
      seenDefaults.add(resolved.value);
      nextDefaults.push(resolved.value);
    }

    if (
      typeof normalized.max_selections === "number" &&
      nextDefaults.length > (normalized.max_selections as number)
    ) {
      return {
        options: normalized,
        defaultValue: [],
        error: "Multi-select defaults exceed the configured maximum selections.",
      };
    }

    normalized.defaultValue = nextDefaults;
    normalized.default_value = nextDefaults;

    return {
      options: normalized,
      defaultValue: null,
    };
  }

  const resolvedDefault = resolveCanonicalOptionValue(
    params.defaultValue ?? baseOptions.defaultValue ?? baseOptions.default_value ?? null,
    normalizedOptions
  );
  if (resolvedDefault.invalid) {
    return {
      options: normalized,
      defaultValue: null,
      error: "Select defaults must match configured option values.",
    };
  }

  normalized.defaultValue = resolvedDefault.value ?? "";
  normalized.default_value = resolvedDefault.value;

  return {
    options: normalized,
    defaultValue: resolvedDefault.value,
  };
}

export function normalizeProductFieldValue(params: {
  fieldType: FieldType;
  options: unknown;
  value: unknown;
  fieldLabel?: string;
}): { value: unknown; error?: string } {
  const fieldType = String(params.fieldType || "").trim().toLowerCase();
  const fieldLabel = trimString(params.fieldLabel) || "This field";

  if (fieldType === "boolean") {
    if (params.value === null || typeof params.value === "undefined") {
      return { value: null };
    }
    if (typeof params.value === "string" && params.value.trim().length === 0) {
      return { value: null };
    }
    const normalized = normalizeBooleanLike(params.value);
    if (normalized === null) {
      return { value: null, error: `${fieldLabel} must be true or false.` };
    }
    return { value: normalized };
  }

  if (!isSelectLikeFieldType(fieldType)) {
    return { value: params.value };
  }

  const options = normalizeOptionList(asRecord(params.options).options ?? asRecord(params.options).choices);

  if (isMultiSelectFieldType(fieldType)) {
    if (params.value === null || typeof params.value === "undefined") {
      return { value: null };
    }

    const rawValues = Array.isArray(params.value)
      ? params.value
      : trimString(params.value).length > 0
        ? [params.value]
        : [];
    const normalizedValues: string[] = [];
    const seenValues = new Set<string>();

    for (const rawValue of rawValues) {
      const resolved = resolveCanonicalOptionValue(rawValue, options);
      if (resolved.invalid) {
        return { value: null, error: `${fieldLabel} contains an invalid option.` };
      }
      if (!resolved.value || seenValues.has(resolved.value)) continue;
      seenValues.add(resolved.value);
      normalizedValues.push(resolved.value);
    }

    if (normalizedValues.length === 0) {
      return { value: null };
    }

    return { value: normalizedValues };
  }

  const resolved = resolveCanonicalOptionValue(params.value, options);
  if (resolved.invalid) {
    return { value: null, error: `${fieldLabel} must match one of the configured options.` };
  }

  return { value: resolved.value };
}
