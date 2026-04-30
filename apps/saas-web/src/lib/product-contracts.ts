import { getSupabaseServer } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@stack-app/database";
import {
  getOutputProfileTemplate,
  type OutputProfileTemplate,
} from "@/lib/output-profile-templates";
import {
  buildTemplateDestinationAttributeMappings,
  collectMappedFieldCodes,
  DestinationAttributeMapping,
  normalizeDestinationAttributeMappings,
  resolveDestinationAttributeValue,
} from "@/lib/destination-attribute-mappings";
import {
  resolveOrganizationBaselineScope,
  type OrganizationBaselineScope,
} from "@/lib/default-market-locale";

export type ContractScopeContext = {
  marketId?: string | null;
  channelId?: string | null;
  localeId?: string | null;
  destinationId?: string | null;
  channelCode?: string | null;
  localeCode?: string | null;
  destinationCode?: string | null;
  partnerOrganizationId?: string | null;
};

type ProductFieldDefinitionRow = {
  id: string;
  code: string;
  name: string;
  field_type: string;
  field_class?: string | null;
  system_key?: string | null;
  is_locked?: boolean | null;
  is_override_capable?: boolean | null;
  is_required?: boolean | null;
  is_localizable?: boolean | null;
  is_channelable?: boolean | null;
  scope_policy?: string | null;
  data_domain?: string | null;
  value_storage_strategy?: string | null;
  validation_rules?: Record<string, unknown> | null;
  options?: Record<string, unknown> | null;
};

type ProductFieldValueRow = {
  product_field_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_datetime: string | null;
  value_json: unknown;
  market_id: string | null;
  channel_id: string | null;
  locale_id: string | null;
  destination_id: string | null;
  channel: string | null;
  locale: string | null;
};

type OutputProfileRow = {
  id: string;
  code: string;
  name: string;
  profile_type: string;
  template_key?: string | null;
  share_with_partners?: boolean | null;
  metadata?: Record<string, unknown> | null;
};

type OutputProfileFieldRuleRow = {
  field_code: string;
  is_required: boolean;
  max_length: number | null;
  notes: string | null;
};

type OutputProfileAttributeMappingRow = {
  id: string;
  attribute_code: string;
  attribute_label: string;
  source_mode: "shared_field" | "destination_field" | "slot" | "constant";
  source_field_code: string | null;
  override_field_code: string | null;
  source_slot_code: string | null;
  constant_value: string | null;
  resolution_rule: "destination_override_then_base" | "base_only" | "destination_only";
  is_required: boolean;
  max_length: number | null;
  notes: string | null;
  sort_order: number;
  metadata: Record<string, unknown> | null;
};

type DamAssetSummary = {
  id: string;
  filename: string | null;
  original_filename: string | null;
  file_type: string | null;
  current_version_number?: number | null;
  approval_status?: string | null;
  document_type?: string | null;
  certificate_type?: string | null;
  label_panel_type?: string | null;
  asset_kind?: string | null;
  data_classification?: string | null;
  effective_version_policy?: string | null;
};

type LegacyProductAssetLinkRow = {
  id: string;
  product_field_id: string | null;
  document_slot_code: string | null;
  output_profile_id?: string | null;
  market_id: string | null;
  channel_id: string | null;
  locale_id: string | null;
  destination_id: string | null;
  variant_id?: string | null;
  sort_order?: number | null;
  document_expiry_date?: string | null;
  dam_assets?: DamAssetSummary | DamAssetSummary[] | null;
};

type OutputSlotDefinitionRow = {
  id: string;
  slot_code: string;
  slot_name: string;
  asset_kind: string;
  document_type: string | null;
  certificate_type: string | null;
  label_panel_type: string | null;
  classification: string;
  is_required: boolean;
  allow_multiple: boolean;
  sort_order: number;
  metadata: Record<string, unknown> | null;
};

type ProductOutputSlotAssignmentRow = {
  id: string;
  slot_definition_id: string;
  asset_version_id: string | null;
  status: string;
  pinned_version: boolean;
  market_id: string | null;
  channel_id: string | null;
  locale_id: string | null;
  destination_id: string | null;
  dam_assets?: DamAssetSummary | DamAssetSummary[] | null;
};

type PartnerDocumentRow = {
  id: string;
  document_type: string;
  classification: string;
  approval_status: string;
  status: string;
  title: string;
  description: string | null;
  expires_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  metadata: Record<string, unknown> | null;
  asset_version_id: string | null;
  dam_assets?: DamAssetSummary | DamAssetSummary[] | null;
  partner_document_product_assignments?: Array<{
    product_id: string | null;
    family_id: string | null;
    market_id: string | null;
  }>;
  partner_document_contract_assignments?: Array<{
    output_profile_id: string;
    market_id: string | null;
  }>;
};

export type NormalizedContractField = {
  fieldId: string;
  code: string;
  name: string;
  fieldType: string;
  fieldClass: "system" | "output" | "custom";
  systemKey: string | null;
  isLocked: boolean;
  isOverrideCapable: boolean;
  isRequired: boolean;
  dataDomain: string | null;
  scopePolicy: string | null;
  valueStorageStrategy: string | null;
  value: unknown;
  notes: string | null;
  maxLength: number | null;
};

export type NormalizedContractSlot = {
  slotCode: string;
  slotName: string;
  assetKind: string;
  documentType: string | null;
  certificateType: string | null;
  labelPanelType: string | null;
  classification: string;
  isRequired: boolean;
  allowMultiple: boolean;
  assignedAsset: DamAssetSummary | null;
  assignmentId: string | null;
  assignmentSource: "slot_assignment" | "legacy_link" | null;
  pinnedVersion: boolean;
  expiryDate: string | null;
};

export type PartnerRegulatoryDocument = {
  id: string;
  documentType: string;
  title: string;
  classification: string;
  approvalStatus: string;
  status: string;
  expiresAt: string | null;
  asset: DamAssetSummary | null;
  pinnedVersion: boolean;
  coverage: {
    productIds: string[];
    familyIds: string[];
    marketIds: string[];
    outputProfileIds: string[];
  };
};

export type NormalizedDestinationAttribute = {
  attributeCode: string;
  attributeLabel: string;
  sourceMode: "shared_field" | "destination_field" | "slot" | "constant";
  sourceFieldCode: string | null;
  overrideFieldCode: string | null;
  sourceSlotCode: string | null;
  constantValue: string | null;
  resolutionRule: "destination_override_then_base" | "base_only" | "destination_only";
  isRequired: boolean;
  maxLength: number | null;
  notes: string | null;
  value: unknown;
  isTemplateDefault: boolean;
};

export type NormalizedProductContract = {
  productId: string;
  familyId: string | null;
  outputProfile: OutputProfileRow | null;
  baseFields: NormalizedContractField[];
  outputFields: NormalizedContractField[];
  attributeMappings: NormalizedDestinationAttribute[];
  slotRequirements: NormalizedContractSlot[];
  partnerDocuments: PartnerRegulatoryDocument[];
  missingRequirements: Array<{
    kind: "field" | "slot" | "partner_document";
    field_code: string;
    notes: string | null;
    label: string;
  }>;
};

export type ContractReadinessResult = {
  profile_id: string;
  profile_name: string;
  profile_code: string;
  profile_type: string;
  total_required: number;
  complete_count: number;
  percent: number;
  is_ready: boolean;
  missing: Array<{
    field_code: string;
    notes: string | null;
    kind?: "field" | "slot" | "partner_document";
    label?: string;
  }>;
  warnings: Array<{
    field_code: string;
    issue: string;
  }>;
  slot_summary: {
    required: number;
    complete: number;
  };
  partner_document_summary: {
    required: number;
    complete: number;
  };
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function normalizeAssetRow(
  value: DamAssetSummary | DamAssetSummary[] | null | undefined
): DamAssetSummary | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function resolveFieldClass(field: ProductFieldDefinitionRow): "system" | "output" | "custom" {
  if (field.field_class === "system" || field.field_class === "output" || field.field_class === "custom") {
    return field.field_class;
  }
  if (field.options?.is_system === true) return "system";
  return "custom";
}

function scoreDimensionByIdOrCode(params: {
  rowId: string | null;
  rowCode?: string | null;
  selectedId?: string | null;
  selectedCode?: string | null;
  weight: number;
}): number {
  const rowCode = params.rowCode ? params.rowCode.toLowerCase() : null;
  const selectedCode = params.selectedCode ? params.selectedCode.toLowerCase() : null;

  if (params.selectedId) {
    if (params.rowId === params.selectedId) return params.weight;
    if (selectedCode && rowCode && selectedCode === rowCode) return params.weight - 4;
    if (!params.rowId && !rowCode) return 1;
    return -1000;
  }

  if (selectedCode) {
    if (rowCode && selectedCode === rowCode) return params.weight;
    if (!params.rowId && !rowCode) return 1;
    return -1000;
  }

  if (!params.rowId && !rowCode) return 2;
  return -1000;
}

function scoreScopedValueRow(
  row: ProductFieldValueRow,
  scope: ContractScopeContext,
  baseline: OrganizationBaselineScope | null = null
): number {
  const rowLocaleCode = row.locale ? row.locale.toLowerCase() : null;
  const selectedLocaleCode = scope.localeCode ? scope.localeCode.toLowerCase() : null;
  const baselineLocaleCode = baseline?.localeCode ?? null;

  const marketScore = (() => {
    if (scope.marketId) {
      if (row.market_id === scope.marketId) return 32;
      if (baseline?.marketId && row.market_id === baseline.marketId) return 4;
      if (!row.market_id) return 1;
      return -1000;
    }
    if (!row.market_id) return 2;
    if (baseline?.marketId && row.market_id === baseline.marketId) return 1;
    return -1000;
  })();

  const localeScore = (() => {
    if (scope.localeId) {
      if (row.locale_id === scope.localeId) return 24;
      if (selectedLocaleCode && rowLocaleCode && selectedLocaleCode === rowLocaleCode) return 20;
      if (
        baseline?.localeId &&
        ((row.locale_id && row.locale_id === baseline.localeId) ||
          (baselineLocaleCode && rowLocaleCode && rowLocaleCode === baselineLocaleCode))
      ) {
        return 4;
      }
      if (!row.locale_id && !rowLocaleCode) return 1;
      return -1000;
    }

    if (selectedLocaleCode) {
      if (rowLocaleCode && selectedLocaleCode === rowLocaleCode) return 24;
      if (baselineLocaleCode && rowLocaleCode && rowLocaleCode === baselineLocaleCode) return 4;
      if (!row.locale_id && !rowLocaleCode) return 1;
      return -1000;
    }

    if (!row.locale_id && !rowLocaleCode) return 2;
    if (
      baseline?.localeId &&
      ((row.locale_id && row.locale_id === baseline.localeId) ||
        (baselineLocaleCode && rowLocaleCode && rowLocaleCode === baselineLocaleCode))
    ) {
      return 1;
    }
    return -1000;
  })();

  return (
    marketScore +
    scoreDimensionByIdOrCode({
      rowId: row.channel_id,
      rowCode: row.channel,
      selectedId: scope.channelId,
      selectedCode: scope.channelCode,
      weight: 24,
    }) +
    localeScore +
    scoreDimensionByIdOrCode({
      rowId: row.destination_id,
      selectedId: scope.destinationId,
      selectedCode: scope.destinationCode,
      weight: 16,
    })
  );
}

function scoreLegacyLinkRow(
  row: LegacyProductAssetLinkRow,
  scope: ContractScopeContext,
  outputProfileId: string | null,
  baseline: OrganizationBaselineScope | null = null
): number {
  const profileScore =
    outputProfileId && row.output_profile_id
      ? row.output_profile_id === outputProfileId
        ? 48
        : -1000
      : outputProfileId && !row.output_profile_id
        ? 8
        : 8;

  const selectedLocaleCode = scope.localeCode ? scope.localeCode.toLowerCase() : null;
  const baselineLocaleCode = baseline?.localeCode ?? null;
  const marketScore = (() => {
    if (scope.marketId) {
      if (row.market_id === scope.marketId) return 24;
      if (baseline?.marketId && row.market_id === baseline.marketId) return 4;
      if (!row.market_id) return 1;
      return -1000;
    }
    if (!row.market_id) return 2;
    if (baseline?.marketId && row.market_id === baseline.marketId) return 1;
    return -1000;
  })();

  const localeScore = (() => {
    if (scope.localeId) {
      if (row.locale_id === scope.localeId) return 18;
      if (baseline?.localeId && row.locale_id === baseline.localeId) return 4;
      if (!row.locale_id) return 1;
      return -1000;
    }
    if (selectedLocaleCode) {
      if (baselineLocaleCode && selectedLocaleCode === baselineLocaleCode && row.locale_id === baseline?.localeId) {
        return 4;
      }
      if (!row.locale_id) return 1;
      return -1000;
    }
    if (!row.locale_id) return 2;
    if (baseline?.localeId && row.locale_id === baseline.localeId) return 1;
    return -1000;
  })();

  return (
    profileScore +
    marketScore +
    scoreDimensionByIdOrCode({
      rowId: row.channel_id,
      selectedId: scope.channelId,
      selectedCode: scope.channelCode,
      weight: 18,
    }) +
    localeScore +
    scoreDimensionByIdOrCode({
      rowId: row.destination_id,
      selectedId: scope.destinationId,
      selectedCode: scope.destinationCode,
      weight: 12,
    })
  );
}

function toTypedFieldValue(row: ProductFieldValueRow): unknown {
  if (row.value_text !== null && typeof row.value_text !== "undefined") return row.value_text;
  if (row.value_number !== null && typeof row.value_number !== "undefined") return row.value_number;
  if (row.value_boolean !== null && typeof row.value_boolean !== "undefined") return row.value_boolean;
  if (row.value_date !== null && typeof row.value_date !== "undefined") return row.value_date;
  if (row.value_datetime !== null && typeof row.value_datetime !== "undefined") return row.value_datetime;
  if (row.value_json !== null && typeof row.value_json !== "undefined") return row.value_json;
  return null;
}

function isValuePresent(value: unknown): boolean {
  if (value === null || typeof value === "undefined") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return false;
}

function resolveTemplate(profile: OutputProfileRow | null): OutputProfileTemplate | null {
  if (!profile) return null;
  const candidates = [
    typeof profile.template_key === "string" ? profile.template_key.trim() : "",
    profile.code,
  ].filter((value) => value.length > 0);
  for (const candidate of candidates) {
    const template = getOutputProfileTemplate(candidate);
    if (template) return template;
  }
  return null;
}

function mapRequiredPartnerDocumentTypes(profile: OutputProfileRow | null): string[] {
  const metadata = profile?.metadata || {};
  return asStringArray(metadata.required_partner_document_types);
}

function inferLegacySlotDefinitions(params: {
  rules: OutputProfileFieldRuleRow[];
  fieldsByCode: Map<string, ProductFieldDefinitionRow>;
}): NormalizedContractSlot[] {
  const inferredSlots = params.rules.map((rule): NormalizedContractSlot | null => {
      const field = params.fieldsByCode.get(rule.field_code);
      if (!field) return null;

      const fieldType = String(field.field_type || "").toLowerCase();
      const options = field.options || {};
      const slotCodeFromOption =
        typeof options.output_slot_code === "string"
          ? options.output_slot_code
          : typeof options.document_slot === "string"
            ? options.document_slot
            : null;
      const slotCode = slotCodeFromOption || field.code;
      const assetKind =
        typeof options.asset_kind === "string"
          ? options.asset_kind
          : fieldType === "file"
            ? "document"
            : fieldType === "image"
              ? "image"
              : null;

      if (!assetKind && !slotCode.includes("image") && fieldType !== "file") {
        return null;
      }

      const slot: NormalizedContractSlot = {
        slotCode,
        slotName: field.name,
        assetKind: assetKind || "image",
        documentType:
          typeof options.document_type === "string"
            ? options.document_type
            : typeof options.document_slot === "string"
              ? options.document_slot
              : null,
        certificateType:
          typeof options.certificate_type === "string" ? options.certificate_type : null,
        labelPanelType:
          typeof options.label_panel_type === "string" ? options.label_panel_type : null,
        classification:
          typeof options.data_classification === "string" ? options.data_classification : "partner_restricted",
        isRequired: rule.is_required,
        allowMultiple: options.allow_multiple === true,
        assignedAsset: null,
        assignmentId: null,
        assignmentSource: null,
        pinnedVersion: false,
        expiryDate: null,
      };

      return slot;
    });

  return inferredSlots.filter((slot): slot is NormalizedContractSlot => slot !== null);
}

function mergeSlotDefinitions(
  explicitSlots: OutputSlotDefinitionRow[],
  inferredSlots: NormalizedContractSlot[]
): NormalizedContractSlot[] {
  const merged = new Map<string, NormalizedContractSlot>();

  for (const slot of inferredSlots) {
    merged.set(slot.slotCode, slot);
  }

  for (const explicit of explicitSlots) {
    merged.set(explicit.slot_code, {
      slotCode: explicit.slot_code,
      slotName: explicit.slot_name,
      assetKind: explicit.asset_kind,
      documentType: explicit.document_type,
      certificateType: explicit.certificate_type,
      labelPanelType: explicit.label_panel_type,
      classification: explicit.classification,
      isRequired: explicit.is_required,
      allowMultiple: explicit.allow_multiple,
      assignedAsset: null,
      assignmentId: null,
      assignmentSource: null,
      pinnedVersion: false,
      expiryDate: null,
    });
  }

  return Array.from(merged.values()).sort((left, right) =>
    left.slotCode.localeCompare(right.slotCode)
  );
}

async function loadProfileRules(
  supabase: SupabaseClient<Database>,
  profileId: string
): Promise<OutputProfileFieldRuleRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("output_profile_field_rules")
    .select("field_code,is_required,max_length,notes")
    .eq("profile_id", profileId);

  if (error) {
    console.error("Failed to load destination profile field rules:", error);
    return [];
  }

  return (data || []) as OutputProfileFieldRuleRow[];
}

async function loadProfileAttributeMappings(
  supabase: SupabaseClient<Database>,
  profile: OutputProfileRow | null
): Promise<DestinationAttributeMapping[]> {
  if (!profile) return [];

  const { data, error } = await getSupabaseServer()
    .from("output_profile_attribute_mappings")
    .select(
      "id,attribute_code,attribute_label,source_mode,source_field_code,override_field_code,source_slot_code,constant_value,resolution_rule,is_required,max_length,notes,sort_order,metadata"
    )
    .eq("profile_id", profile.id)
    .order("sort_order", { ascending: true })
    .order("attribute_code", { ascending: true });

  if (error) {
    console.error("Failed to load destination attribute mappings:", error);
    return buildTemplateDestinationAttributeMappings(resolveTemplate(profile));
  }

  const normalized = normalizeDestinationAttributeMappings(
    (data || []) as OutputProfileAttributeMappingRow[]
  );

  if (normalized.length > 0) {
    return normalized;
  }

  return buildTemplateDestinationAttributeMappings(resolveTemplate(profile));
}

async function loadFieldDefinitions(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  fieldCodes: string[]
): Promise<Map<string, ProductFieldDefinitionRow>> {
  if (fieldCodes.length === 0) return new Map();
  const { data, error } = await getSupabaseServer()
    .from("product_fields")
    .select(
      "id,code,name,field_type,field_class,system_key,is_locked,is_override_capable,is_required,is_localizable,is_channelable,scope_policy,data_domain,value_storage_strategy,validation_rules,options"
    )
    .eq("organization_id", organizationId)
    .in("code", fieldCodes);

  if (error) {
    console.error("Failed to load product field definitions:", error);
    return new Map();
  }

  return new Map(
    (((data || []) as unknown) as ProductFieldDefinitionRow[]).map((field) => [field.code, field])
  );
}

async function loadProductFieldValues(
  supabase: SupabaseClient<Database>,
  productId: string,
  fieldIds: string[]
): Promise<Map<string, ProductFieldValueRow[]>> {
  if (fieldIds.length === 0) return new Map();

  const { data, error } = await getSupabaseServer()
    .from("product_field_values")
    .select(
      "product_field_id,value_text,value_number,value_boolean,value_date,value_datetime,value_json,market_id,channel_id,locale_id,destination_id,channel,locale"
    )
    .eq("product_id", productId)
    .in("product_field_id", fieldIds);

  if (error) {
    console.error("Failed to load product field values:", error);
    return new Map();
  }

  const rowsByFieldId = new Map<string, ProductFieldValueRow[]>();
  ((data || []) as ProductFieldValueRow[]).forEach((row) => {
    const list = rowsByFieldId.get(row.product_field_id) || [];
    list.push(row);
    rowsByFieldId.set(row.product_field_id, list);
  });
  return rowsByFieldId;
}

async function loadOutputSlotDefinitions(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  outputProfileId: string
): Promise<OutputSlotDefinitionRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("output_slot_definitions")
    .select(
      "id,slot_code,slot_name,asset_kind,document_type,certificate_type,label_panel_type,classification,is_required,allow_multiple,sort_order,metadata"
    )
    .eq("organization_id", organizationId)
    .eq("output_profile_id", outputProfileId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to load output slot definitions:", error);
    return [];
  }

  return (data || []) as OutputSlotDefinitionRow[];
}

async function loadProductOutputSlotAssignments(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  productId: string,
  outputProfileId: string
): Promise<ProductOutputSlotAssignmentRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("product_output_slot_assignments")
    .select(
      "id,slot_definition_id,asset_version_id,status,pinned_version,market_id,channel_id,locale_id,destination_id,dam_assets:asset_id(id,filename,original_filename,file_type,current_version_number,approval_status,document_type,certificate_type,label_panel_type,asset_kind,data_classification,effective_version_policy)"
    )
    .eq("organization_id", organizationId)
    .eq("product_id", productId)
    .eq("output_profile_id", outputProfileId)
    .eq("status", "active");

  if (error) {
    console.error("Failed to load product output slot assignments:", error);
    return [];
  }

  return (data || []) as ProductOutputSlotAssignmentRow[];
}

async function loadLegacyProductAssetLinks(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  productId: string,
  outputProfileId: string | null,
  relevantFieldIds: string[],
  relevantSlotCodes: string[]
): Promise<LegacyProductAssetLinkRow[]> {
  let query = getSupabaseServer()
    .from("product_asset_links")
    .select(
      "id,product_field_id,document_slot_code,output_profile_id,market_id,channel_id,locale_id,destination_id,variant_id,sort_order,document_expiry_date,dam_assets!inner(id,filename,original_filename,file_type,current_version_number,approval_status,document_type,certificate_type,label_panel_type,asset_kind,data_classification,effective_version_policy)"
    )
    .eq("organization_id", organizationId)
    .eq("product_id", productId)
    .eq("is_active", true);

  if (outputProfileId) {
    query = query.or(`output_profile_id.eq.${outputProfileId},output_profile_id.is.null`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to load legacy product asset links:", error);
    return [];
  }

  return ((((data || []) as unknown) as LegacyProductAssetLinkRow[])).filter((row) => {
    const matchesField = row.product_field_id && relevantFieldIds.includes(row.product_field_id);
    const matchesSlot = row.document_slot_code && relevantSlotCodes.includes(row.document_slot_code);
    return Boolean(matchesField || matchesSlot);
  });
}

async function loadPartnerDocuments(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  partnerOrganizationId: string,
  outputProfileId: string | null,
  productId: string,
  familyId: string | null,
  marketId: string | null
): Promise<PartnerRegulatoryDocument[]> {
  const { data, error } = await getSupabaseServer()
    .from("partner_documents")
    .select(
      "id,document_type,classification,approval_status,status,title,description,expires_at,valid_from,valid_to,metadata,asset_version_id,dam_assets:asset_id(id,filename,original_filename,file_type,current_version_number,approval_status,document_type,certificate_type,label_panel_type,asset_kind,data_classification,effective_version_policy),partner_document_product_assignments(product_id,family_id,market_id),partner_document_contract_assignments(output_profile_id,market_id)"
    )
    .eq("organization_id", organizationId)
    .eq("partner_organization_id", partnerOrganizationId)
    .eq("status", "active");

  if (error) {
    console.error("Failed to load partner documents:", error);
    return [];
  }

  return ((data || []) as PartnerDocumentRow[])
    .filter((document) => {
      const productAssignments = document.partner_document_product_assignments || [];
      const contractAssignments = document.partner_document_contract_assignments || [];

      const matchesProduct =
        productAssignments.length === 0 ||
        productAssignments.some((assignment) => {
          if (marketId && assignment.market_id && assignment.market_id !== marketId) return false;
          if (assignment.product_id && assignment.product_id === productId) return true;
          if (familyId && assignment.family_id && assignment.family_id === familyId) return true;
          return !assignment.product_id && !assignment.family_id;
        });

      const matchesContract =
        !outputProfileId ||
        contractAssignments.length === 0 ||
        contractAssignments.some((assignment) => {
          if (assignment.output_profile_id !== outputProfileId) return false;
          if (marketId && assignment.market_id && assignment.market_id !== marketId) return false;
          return true;
        });

      return matchesProduct && matchesContract;
    })
    .map((document) => ({
      id: document.id,
      documentType: document.document_type,
      title: document.title,
      classification: document.classification,
      approvalStatus: document.approval_status,
      status: document.status,
      expiresAt: document.expires_at,
      asset: normalizeAssetRow(document.dam_assets),
      pinnedVersion: Boolean(document.asset_version_id),
      coverage: {
        productIds: Array.from(
          new Set(
            (document.partner_document_product_assignments || [])
              .map((assignment) => assignment.product_id)
              .filter((value): value is string => Boolean(value))
          )
        ),
        familyIds: Array.from(
          new Set(
            (document.partner_document_product_assignments || [])
              .map((assignment) => assignment.family_id)
              .filter((value): value is string => Boolean(value))
          )
        ),
        marketIds: Array.from(
          new Set(
            [
              ...(document.partner_document_product_assignments || []).map((assignment) => assignment.market_id),
              ...(document.partner_document_contract_assignments || []).map((assignment) => assignment.market_id),
            ].filter((value): value is string => Boolean(value))
          )
        ),
        outputProfileIds: Array.from(
          new Set(
            (document.partner_document_contract_assignments || [])
              .map((assignment) => assignment.output_profile_id)
              .filter((value): value is string => Boolean(value))
          )
        ),
      },
    }));
}

async function loadProductFamilyId(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  productId: string
): Promise<string | null> {
  const { data, error } = await getSupabaseServer()
    .from("products")
    .select("family_id")
    .eq("organization_id", organizationId)
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load product family:", error);
    return null;
  }

  return typeof data?.family_id === "string" ? data.family_id : null;
}

export async function getProductContract(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  productId: string;
  outputProfileId?: string | null;
  scope?: ContractScopeContext;
}): Promise<NormalizedProductContract> {
  const {
    supabase,
    organizationId,
    productId,
    outputProfileId = null,
    scope = {},
  } = params;

  let profile: OutputProfileRow | null = null;
  let rules: OutputProfileFieldRuleRow[] = [];
  let attributeMappings: DestinationAttributeMapping[] = [];

  if (outputProfileId) {
    const { data: profileData, error: profileError } = await getSupabaseServer()
      .from("output_channel_profiles")
      .select("id,code,name,profile_type,template_key,share_with_partners,metadata")
      .eq("organization_id", organizationId)
      .eq("id", outputProfileId)
      .maybeSingle();

    if (profileError) {
      console.error("Failed to load destination profile:", profileError);
    } else if (profileData) {
      profile = (profileData as unknown) as OutputProfileRow;
      rules = await loadProfileRules(getSupabaseServer(), outputProfileId);
      attributeMappings = await loadProfileAttributeMappings(getSupabaseServer(), profile);
    }
  }

  const template = resolveTemplate(profile);
  const templateFieldCodes = template?.fields.map((field) => field.code) || [];
  const ruleFieldCodes = rules.map((rule) => rule.field_code);

  const allFieldCodes = Array.from(
    new Set([
      ...ruleFieldCodes,
      ...templateFieldCodes,
      ...collectMappedFieldCodes(attributeMappings),
      "title",
      "brand_name",
      "scin",
      "sku",
      "barcode",
      "dose_form",
      "unit_count",
      "package_type",
      "serving_size",
      "servings_per_container",
      "net_weight",
      "net_volume",
      "facts_panel",
      "ingredients",
      "other_ingredients",
      "key_actives",
      "allergen_statement",
      "directions_for_use",
      "warnings",
      "storage_conditions",
      "country_of_origin",
      "manufacturer_name",
      "certifications",
    ])
  );

  const fieldsByCode = await loadFieldDefinitions(getSupabaseServer(), organizationId, allFieldCodes);
  const fieldIds = Array.from(new Set(Array.from(fieldsByCode.values()).map((field) => field.id)));
  const valuesByFieldId = await loadProductFieldValues(getSupabaseServer(), productId, fieldIds);
  const familyId = await loadProductFamilyId(getSupabaseServer(), organizationId, productId);
  const baselineScope = await resolveOrganizationBaselineScope(getSupabaseServer(), organizationId);

  const normalizedFields = Array.from(fieldsByCode.values()).map((field) => {
    const rows = valuesByFieldId.get(field.id) || [];
    const winner = rows
      .map((row) => ({ row, score: scoreScopedValueRow(row, scope, baselineScope) }))
      .filter((entry) => entry.score > -500)
      .sort((left, right) => right.score - left.score)[0]?.row;
    const rule = rules.find((candidate) => candidate.field_code === field.code) || null;
    return {
      fieldId: field.id,
      code: field.code,
      name: field.name,
      fieldType: field.field_type,
      fieldClass: resolveFieldClass(field),
      systemKey: field.system_key ?? null,
      isLocked: Boolean(field.is_locked),
      isOverrideCapable: Boolean(field.is_override_capable),
      isRequired: Boolean(rule?.is_required ?? field.is_required),
      dataDomain: field.data_domain ?? null,
      scopePolicy: field.scope_policy ?? null,
      valueStorageStrategy: field.value_storage_strategy ?? null,
      value: winner ? toTypedFieldValue(winner) : null,
      notes: rule?.notes ?? null,
      maxLength: rule?.max_length ?? null,
    } satisfies NormalizedContractField;
  });

  const baseFields = normalizedFields.filter((field) => field.fieldClass !== "output");
  const outputFields = normalizedFields.filter((field) => field.fieldClass === "output");

  const explicitSlotDefinitions = outputProfileId
    ? await loadOutputSlotDefinitions(getSupabaseServer(), organizationId, outputProfileId)
    : [];
  const inferredSlots = inferLegacySlotDefinitions({ rules, fieldsByCode });
  const slots = mergeSlotDefinitions(explicitSlotDefinitions, inferredSlots);

  const explicitAssignments = outputProfileId
    ? await loadProductOutputSlotAssignments(getSupabaseServer(), organizationId, productId, outputProfileId)
    : [];
  const legacyLinks = await loadLegacyProductAssetLinks(
    supabase,
    organizationId,
    productId,
    outputProfileId,
    Array.from(
      new Set(
        inferredSlots
          .map((slot) =>
            Array.from(fieldsByCode.values()).find((field) => field.code === slot.slotCode)?.id || null
          )
          .filter((value): value is string => Boolean(value))
      )
    ),
    slots.map((slot) => slot.slotCode)
  );

  const explicitBySlotId = new Map(
    explicitAssignments.map((assignment) => [assignment.slot_definition_id, assignment])
  );

  const slotRequirements = slots.map((slot) => {
    const explicitDefinition = explicitSlotDefinitions.find((definition) => definition.slot_code === slot.slotCode);
    const explicitAssignment =
      explicitDefinition ? explicitBySlotId.get(explicitDefinition.id) || null : null;

    if (explicitAssignment) {
      return {
        ...slot,
        assignedAsset: normalizeAssetRow(explicitAssignment.dam_assets),
        assignmentId: explicitAssignment.id,
        assignmentSource: "slot_assignment" as const,
        pinnedVersion: Boolean(explicitAssignment.pinned_version || explicitAssignment.asset_version_id),
      };
    }

    const legacyAssignment = legacyLinks
      .map((row) => ({
        row,
        score: scoreLegacyLinkRow(row, scope, outputProfileId, baselineScope),
      }))
      .filter((entry) => entry.score > -500)
      .filter((entry) => {
        if (entry.row.document_slot_code && entry.row.document_slot_code === slot.slotCode) return true;
        if (!entry.row.product_field_id) return false;
        const field = Array.from(fieldsByCode.values()).find(
          (candidate) => candidate.id === entry.row.product_field_id
        );
        return field?.code === slot.slotCode;
      })
      .sort((left, right) => right.score - left.score)[0]?.row;

    return {
      ...slot,
      assignedAsset: normalizeAssetRow(legacyAssignment?.dam_assets),
      assignmentId: legacyAssignment?.id ?? null,
      assignmentSource: legacyAssignment ? ("legacy_link" as const) : null,
      pinnedVersion: false,
      expiryDate: legacyAssignment?.document_expiry_date ?? null,
    };
  });

  const partnerDocuments =
    scope.partnerOrganizationId && profile
      ? await loadPartnerDocuments(
          supabase,
          organizationId,
          scope.partnerOrganizationId,
          profile.id,
          productId,
          familyId,
          scope.marketId ?? null
        )
      : [];

  const fieldValueByCode = new Map(
    normalizedFields.map((field) => [field.code, field.value] as const)
  );
  const slotValueByCode = new Map(
    slotRequirements.map((slot) => [slot.slotCode, slot.assignedAsset] as const)
  );
  const normalizedAttributeMappings: NormalizedDestinationAttribute[] = attributeMappings.map(
    (mapping) => ({
      attributeCode: mapping.attributeCode,
      attributeLabel: mapping.attributeLabel,
      sourceMode: mapping.sourceMode,
      sourceFieldCode: mapping.sourceFieldCode,
      overrideFieldCode: mapping.overrideFieldCode,
      sourceSlotCode: mapping.sourceSlotCode,
      constantValue: mapping.constantValue,
      resolutionRule: mapping.resolutionRule,
      isRequired: mapping.isRequired,
      maxLength: mapping.maxLength,
      notes: mapping.notes,
      value: resolveDestinationAttributeValue({
        mapping,
        fieldValueByCode,
        slotValueByCode,
      }),
      isTemplateDefault: Boolean(mapping.isTemplateDefault),
    })
  );

  const missingRequirements: NormalizedProductContract["missingRequirements"] = [];
  if (normalizedAttributeMappings.length > 0) {
    for (const mapping of normalizedAttributeMappings) {
      if (!mapping.isRequired) continue;
      if (!isValuePresent(mapping.value)) {
        missingRequirements.push({
          kind: "field",
          field_code: mapping.attributeCode,
          notes: mapping.notes,
          label: mapping.attributeLabel,
        });
      }
    }
  } else {
    for (const field of normalizedFields) {
      const isSlotBacked =
        field.fieldType === "file" ||
        field.fieldType === "image" ||
        field.valueStorageStrategy === "slot_assignment";
      if (!field.isRequired || isSlotBacked) continue;
      if (!isValuePresent(field.value)) {
        missingRequirements.push({
          kind: "field",
          field_code: field.code,
          notes: field.notes,
          label: field.name,
        });
      }
    }
  }

  for (const slot of slotRequirements) {
    if (!slot.isRequired) continue;
    if (!slot.assignedAsset) {
      missingRequirements.push({
        kind: "slot",
        field_code: slot.slotCode,
        notes: null,
        label: slot.slotName,
      });
    }
  }

  const requiredPartnerDocumentTypes = mapRequiredPartnerDocumentTypes(profile);
  for (const requiredDocumentType of requiredPartnerDocumentTypes) {
    const match = partnerDocuments.some((document) => document.documentType === requiredDocumentType);
    if (!match) {
      missingRequirements.push({
        kind: "partner_document",
        field_code: requiredDocumentType,
        notes: "Missing partner document coverage",
        label: requiredDocumentType,
      });
    }
  }

  return {
    productId,
    familyId,
    outputProfile: profile,
    baseFields,
    outputFields,
    attributeMappings: normalizedAttributeMappings,
    slotRequirements,
    partnerDocuments,
    missingRequirements,
  };
}

export async function getContractReadiness(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  productId: string;
  outputProfile: OutputProfileRow;
  scope?: ContractScopeContext;
}): Promise<ContractReadinessResult> {
  const contract = await getProductContract({
    supabase: params.supabase,
    organizationId: params.organizationId,
    productId: params.productId,
    outputProfileId: params.outputProfile.id,
    scope: params.scope,
  });

  const requiredFields =
    contract.attributeMappings.length > 0
      ? contract.attributeMappings.filter((mapping) => mapping.isRequired)
      : [...contract.baseFields, ...contract.outputFields].filter((field) => {
          const isSlotBacked =
            field.fieldType === "file" ||
            field.fieldType === "image" ||
            field.valueStorageStrategy === "slot_assignment";
          return field.isRequired && !isSlotBacked;
        });

  const completeFields = requiredFields.filter((field) => isValuePresent(field.value)).length;
  const requiredSlots = contract.slotRequirements.filter((slot) => slot.isRequired);
  const completeSlots = requiredSlots.filter((slot) => Boolean(slot.assignedAsset)).length;
  const requiredPartnerDocumentTypes = mapRequiredPartnerDocumentTypes(contract.outputProfile);
  const completePartnerDocs = requiredPartnerDocumentTypes.filter((type) =>
    contract.partnerDocuments.some((document) => document.documentType === type)
  ).length;

  const warnings: ContractReadinessResult["warnings"] = [];

  for (const field of requiredFields) {
    if (!field.maxLength || typeof field.value !== "string") continue;
    if (field.value.length > field.maxLength) {
      warnings.push({
        field_code: "attributeCode" in field ? field.attributeCode : field.code,
        issue: `Exceeds max length of ${field.maxLength} (${field.value.length} chars)`,
      });
    }
  }

  for (const slot of contract.slotRequirements) {
    if (!slot.assignedAsset) continue;
    if (slot.classification === "regulated_confidential" && !slot.pinnedVersion) {
      warnings.push({
        field_code: slot.slotCode,
        issue: "Regulated slot is not pinned to a specific approved version",
      });
    }
  }

  for (const document of contract.partnerDocuments) {
    if (document.classification === "regulated_confidential" && !document.pinnedVersion) {
      warnings.push({
        field_code: document.documentType,
        issue: "Partner regulatory document is not pinned to a specific approved version",
      });
    }
    if (document.expiresAt && Date.parse(document.expiresAt) < Date.now()) {
      warnings.push({
        field_code: document.documentType,
        issue: "Partner regulatory document is expired",
      });
    }
  }

  const totalRequired = requiredFields.length + requiredSlots.length + requiredPartnerDocumentTypes.length;
  const completeCount = completeFields + completeSlots + completePartnerDocs;
  const percent = totalRequired === 0 ? 100 : Math.round((completeCount / totalRequired) * 100);

  return {
    profile_id: params.outputProfile.id,
    profile_name: params.outputProfile.name,
    profile_code: params.outputProfile.code,
    profile_type: params.outputProfile.profile_type,
    total_required: totalRequired,
    complete_count: completeCount,
    percent,
    is_ready: contract.missingRequirements.length === 0,
    missing: contract.missingRequirements,
    warnings,
    slot_summary: {
      required: requiredSlots.length,
      complete: completeSlots,
    },
    partner_document_summary: {
      required: requiredPartnerDocumentTypes.length,
      complete: completePartnerDocs,
    },
  };
}

export async function getProductContractReadinessList(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  productId: string;
  scope?: ContractScopeContext;
}): Promise<ContractReadinessResult[]> {
  const { data, error } = await params.supabase
    .from("output_channel_profiles")
    .select("id,code,name,profile_type,template_key,share_with_partners,metadata")
    .eq("organization_id", params.organizationId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to load destination profiles for readiness:", error);
    return [];
  }

  const profiles = ((data || []) as unknown) as OutputProfileRow[];
  const results: ContractReadinessResult[] = [];
  for (const profile of profiles) {
    results.push(
      await getContractReadiness({
        supabase: params.supabase,
        organizationId: params.organizationId,
        productId: params.productId,
        outputProfile: profile,
        scope: params.scope,
      })
    );
  }
  return results;
}

export async function getPartnerRegulatoryPackage(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  partnerOrganizationId: string;
  outputProfileId: string;
  productIds: string[];
  scope?: ContractScopeContext;
}): Promise<{
  outputProfileId: string;
  partnerOrganizationId: string;
  productContracts: NormalizedProductContract[];
  documents: PartnerRegulatoryDocument[];
}> {
  const productContracts: NormalizedProductContract[] = [];
  const documentMap = new Map<string, PartnerRegulatoryDocument>();

  for (const productId of params.productIds) {
    const contract = await getProductContract({
      supabase: params.supabase,
      organizationId: params.organizationId,
      productId,
      outputProfileId: params.outputProfileId,
      scope: {
        ...(params.scope || {}),
        partnerOrganizationId: params.partnerOrganizationId,
      },
    });
    productContracts.push(contract);
    for (const document of contract.partnerDocuments) {
      documentMap.set(document.id, document);
    }
  }

  return {
    outputProfileId: params.outputProfileId,
    partnerOrganizationId: params.partnerOrganizationId,
    productContracts,
    documents: Array.from(documentMap.values()),
  };
}

export const productContractsTestUtils = {
  isValuePresent,
  scoreDimensionByIdOrCode,
  resolveFieldClass,
  mapRequiredPartnerDocumentTypes,
};

