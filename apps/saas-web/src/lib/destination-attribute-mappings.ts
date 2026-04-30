import type { OutputProfileTemplate } from "@/lib/output-profile-templates";

export type DestinationAttributeSourceMode =
  | "shared_field"
  | "destination_field"
  | "slot"
  | "constant";

export type DestinationAttributeResolutionRule =
  | "destination_override_then_base"
  | "base_only"
  | "destination_only";

export type DestinationAttributeMapping = {
  id: string;
  attributeCode: string;
  attributeLabel: string;
  sourceMode: DestinationAttributeSourceMode;
  sourceFieldCode: string | null;
  overrideFieldCode: string | null;
  sourceSlotCode: string | null;
  constantValue: string | null;
  resolutionRule: DestinationAttributeResolutionRule;
  isRequired: boolean;
  maxLength: number | null;
  notes: string | null;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
  isTemplateDefault?: boolean;
};

export type DestinationAttributeMappingRow = {
  id: string;
  attribute_code: string;
  attribute_label: string;
  source_mode: DestinationAttributeSourceMode;
  source_field_code: string | null;
  override_field_code: string | null;
  source_slot_code: string | null;
  constant_value: string | null;
  resolution_rule: DestinationAttributeResolutionRule;
  is_required: boolean;
  max_length: number | null;
  notes: string | null;
  sort_order: number;
  metadata: Record<string, unknown> | null;
};

export function normalizeDestinationAttributeMappings(
  rows: DestinationAttributeMappingRow[] | null | undefined
): DestinationAttributeMapping[] {
  return (rows || [])
    .map((row) => ({
      id: row.id,
      attributeCode: row.attribute_code,
      attributeLabel: row.attribute_label,
      sourceMode: row.source_mode,
      sourceFieldCode: row.source_field_code,
      overrideFieldCode: row.override_field_code,
      sourceSlotCode: row.source_slot_code,
      constantValue: row.constant_value,
      resolutionRule: row.resolution_rule,
      isRequired: row.is_required,
      maxLength: row.max_length,
      notes: row.notes,
      sortOrder: row.sort_order,
      metadata: row.metadata ?? null,
    }))
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.attributeCode.localeCompare(right.attributeCode);
    });
}

export function buildTemplateDestinationAttributeMappings(
  template: OutputProfileTemplate | null | undefined
): DestinationAttributeMapping[] {
  if (!template?.attribute_mappings?.length) return [];
  return template.attribute_mappings
    .map((mapping, index) => ({
      id: `template:${template.key}:${mapping.attribute_code}`,
      attributeCode: mapping.attribute_code,
      attributeLabel: mapping.attribute_label,
      sourceMode: mapping.source_mode,
      sourceFieldCode: mapping.source_field_code ?? null,
      overrideFieldCode: mapping.override_field_code ?? null,
      sourceSlotCode: mapping.source_slot_code ?? null,
      constantValue: mapping.constant_value ?? null,
      resolutionRule: mapping.resolution_rule,
      isRequired: mapping.is_required,
      maxLength: mapping.max_length ?? null,
      notes: mapping.notes ?? null,
      sortOrder:
        typeof mapping.sort_order === "number" && Number.isFinite(mapping.sort_order)
          ? mapping.sort_order
          : index * 10,
      metadata: {
        template_key: template.key,
      },
      isTemplateDefault: true,
    }))
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.attributeCode.localeCompare(right.attributeCode);
    });
}

export function isValuePresent(value: unknown): boolean {
  if (value === null || typeof value === "undefined") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return false;
}

export function resolveDestinationAttributeValue(params: {
  mapping: DestinationAttributeMapping;
  fieldValueByCode: Map<string, unknown>;
  slotValueByCode?: Map<string, unknown>;
}): unknown {
  const { mapping, fieldValueByCode, slotValueByCode } = params;

  if (mapping.sourceMode === "constant") {
    return mapping.constantValue;
  }

  if (mapping.sourceMode === "slot") {
    return mapping.sourceSlotCode ? slotValueByCode?.get(mapping.sourceSlotCode) ?? null : null;
  }

  if (mapping.sourceMode === "destination_field") {
    return mapping.sourceFieldCode ? fieldValueByCode.get(mapping.sourceFieldCode) ?? null : null;
  }

  const baseValue = mapping.sourceFieldCode
    ? fieldValueByCode.get(mapping.sourceFieldCode) ?? null
    : null;
  const overrideValue = mapping.overrideFieldCode
    ? fieldValueByCode.get(mapping.overrideFieldCode) ?? null
    : null;

  switch (mapping.resolutionRule) {
    case "destination_only":
      return overrideValue;
    case "destination_override_then_base":
      return isValuePresent(overrideValue) ? overrideValue : baseValue;
    case "base_only":
    default:
      return baseValue;
  }
}

export function collectMappedFieldCodes(
  mappings: DestinationAttributeMapping[]
): string[] {
  return Array.from(
    new Set(
      mappings.flatMap((mapping) =>
        [mapping.sourceFieldCode, mapping.overrideFieldCode].filter(
          (value): value is string => Boolean(value)
        )
      )
    )
  );
}

export function collectMappedSlotCodes(
  mappings: DestinationAttributeMapping[]
): string[] {
  return Array.from(
    new Set(
      mappings
        .map((mapping) => mapping.sourceSlotCode)
        .filter((value): value is string => Boolean(value))
    )
  );
}
