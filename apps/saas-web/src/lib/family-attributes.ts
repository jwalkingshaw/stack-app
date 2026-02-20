import { supabaseServer } from '@/lib/supabase';

type FamilyAttributeSeed = {
  attribute_code: string;
  attribute_label: string;
  attribute_type: string;
  is_required: boolean;
  is_unique: boolean;
  validation_rules: Record<string, any>;
  attribute_options: any[];
  help_text: string | null;
};

type FamilyAttributeCompletion = {
  isComplete: boolean;
  requiredCount: number;
  completeCount: number;
  missingAttributes: Array<{ code: string; label: string }>;
};

const isValuePresent = (fieldType: string, value: any): boolean => {
  if (value === null || value === undefined) return false;

  const hasNonEmptyString = (val: any) => String(val).trim().length > 0;
  const hasArrayItems = (val: any) => Array.isArray(val) && val.length > 0;
  const hasObjectKeys = (val: any) =>
    !!val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0;

  switch (fieldType) {
    case 'text':
    case 'textarea':
    case 'select':
    case 'identifier':
    case 'url':
      return String(value).trim().length > 0;
    case 'number':
    case 'decimal':
      return value !== null && value !== undefined && value !== '';
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
    case 'datetime':
      return Boolean(value);
    case 'multiselect':
    case 'multi_select':
      return Array.isArray(value) && value.length > 0;
    case 'table':
      return Array.isArray(value) && value.length > 0;
    case 'measurement':
    case 'price':
    case 'file':
    case 'image':
      if (fieldType === 'file' || fieldType === 'image') {
        if (hasArrayItems(value)) return true;
        if (hasObjectKeys(value)) {
          const assetId = (value as any).assetId || (value as any).id || (value as any).asset_id;
          const url = (value as any).url || (value as any).s3Url || (value as any).s3_url;
          return Boolean(assetId || url);
        }
        return false;
      }

      if (fieldType === 'price') {
        if (hasObjectKeys(value)) {
          const amount = (value as any).amount ?? (value as any).value;
          return amount !== null && amount !== undefined && hasNonEmptyString(amount);
        }
        return hasNonEmptyString(value);
      }

      if (fieldType === 'measurement') {
        if (hasObjectKeys(value)) {
          const components = (value as any).components;
          if (components && typeof components === 'object') {
            return Object.values(components).some((component: any) => {
              const amount = component?.amount ?? component?.value ?? component?.measurement;
              return amount !== null && amount !== undefined && hasNonEmptyString(amount);
            });
          }
          const amount = (value as any).amount ?? (value as any).value ?? (value as any).measurement;
          return amount !== null && amount !== undefined && hasNonEmptyString(amount);
        }
        return hasNonEmptyString(value);
      }

      return false;
    default:
      if (hasArrayItems(value)) {
        return true;
      }
      if (hasObjectKeys(value)) {
        return true;
      }
      return hasNonEmptyString(value);
  }
};

const normalizeAttributeOptions = (fieldType: string, options: any): any[] => {
  if (!options || typeof options !== 'object') return [];

  if (fieldType === 'select' || fieldType === 'multiselect') {
    const { options: rawOptions } = options as { options?: any[] };
    return Array.isArray(rawOptions) ? rawOptions : [];
  }

  return [];
};

const buildFamilyAttributeSeeds = async (
  familyId: string,
  organizationId: string
): Promise<FamilyAttributeSeed[]> => {
  const { data: familyGroups, error: familyGroupsError } = await (supabaseServer as any)
    .from('product_family_field_groups')
    .select('field_group_id, sort_order, hidden_fields')
    .eq('product_family_id', familyId)
    .order('sort_order', { ascending: true });

  if (familyGroupsError) {
    console.error('Error loading family field groups:', familyGroupsError);
    throw new Error('Failed to load family field groups');
  }

  if (!familyGroups || familyGroups.length === 0) {
    return [];
  }

  const groupOrder = new Map<string, number>();
  const hiddenByGroup = new Map<string, Set<string>>();

  familyGroups.forEach((group: any) => {
    groupOrder.set(group.field_group_id, group.sort_order ?? 0);
    const hidden = Array.isArray(group.hidden_fields) ? group.hidden_fields : [];
    hiddenByGroup.set(group.field_group_id, new Set(hidden));
  });

  const groupIds = familyGroups.map((group: any) => group.field_group_id);
  const { data: assignments, error: assignmentsError } = await (supabaseServer as any)
    .from('product_field_group_assignments')
    .select(`
      field_group_id,
      sort_order,
      product_fields (
        id,
        code,
        name,
        description,
        field_type,
        is_required,
        is_unique,
        validation_rules,
        options
      )
    `)
    .in('field_group_id', groupIds);

  if (assignmentsError) {
    console.error('Error loading field group assignments:', assignmentsError);
    throw new Error('Failed to load field group assignments');
  }

  const sortedAssignments = (assignments || []).sort((a: any, b: any) => {
    const groupSortA = groupOrder.get(a.field_group_id) ?? 0;
    const groupSortB = groupOrder.get(b.field_group_id) ?? 0;
    if (groupSortA !== groupSortB) return groupSortA - groupSortB;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const seeds: FamilyAttributeSeed[] = [];
  const seenCodes = new Set<string>();

  sortedAssignments.forEach((assignment: any) => {
    const field = assignment.product_fields;
    if (!field) return;

    const hiddenFields = hiddenByGroup.get(assignment.field_group_id);
    if (hiddenFields?.has(field.id)) return;

    if (seenCodes.has(field.code)) return;
    seenCodes.add(field.code);

    seeds.push({
      attribute_code: field.code,
      attribute_label: field.name,
      attribute_type: field.field_type,
      is_required: Boolean(field.is_required),
      is_unique: Boolean(field.is_unique),
      validation_rules: field.validation_rules || {},
      attribute_options: normalizeAttributeOptions(field.field_type, field.options),
      help_text: field.description || null
    });
  });

  return seeds;
};

export async function ensureFamilyAttributesFromFieldGroups(
  familyId: string
): Promise<{ total: number; inserted: number; removed: number }> {
  const { data: family, error: familyError } = await (supabaseServer as any)
    .from('product_families')
    .select('id, organization_id')
    .eq('id', familyId)
    .single();

  if (familyError || !family) {
    console.error('Error loading family for attribute sync:', familyError);
    throw new Error('Product family not found');
  }

  const organizationId = (family as any).organization_id;
  const seeds = await buildFamilyAttributeSeeds(familyId, organizationId);

  if (seeds.length === 0) {
    const { error: deleteError } = await (supabaseServer as any)
      .from('family_attributes')
      .delete()
      .eq('family_id', familyId)
      .eq('organization_id', organizationId);

    if (deleteError) {
      console.error('Error clearing family attributes:', deleteError);
      throw new Error('Failed to clear family attributes');
    }

    return { total: 0, inserted: 0, removed: 0 };
  }

  const upsertPayload = seeds.map((seed, index) => ({
    organization_id: organizationId,
    family_id: familyId,
    display_order: index,
    inherit_level_1: true,
    inherit_level_2: false,
    ...seed,
    updated_at: new Date().toISOString()
  }));

  const { data: upserted, error: upsertError } = await (supabaseServer as any)
    .from('family_attributes')
    .upsert(upsertPayload, {
      onConflict: 'organization_id,family_id,attribute_code'
    })
    .select('id');

  if (upsertError) {
    console.error('Error syncing family attributes:', upsertError);
    throw new Error('Failed to sync family attributes');
  }

  const codeList = seeds.map((seed) => `"${seed.attribute_code}"`).join(',');
  const { error: deleteError } = await (supabaseServer as any)
    .from('family_attributes')
    .delete()
    .eq('family_id', familyId)
    .eq('organization_id', organizationId)
    .not('attribute_code', 'in', `(${codeList})`);

  if (deleteError) {
    console.error('Error pruning family attributes:', deleteError);
    throw new Error('Failed to prune family attributes');
  }

  const inserted = upserted?.length ?? 0;
  const removed = seeds.length > 0 ? Math.max(0, (upserted?.length || 0) - seeds.length) : 0;

  return { total: seeds.length, inserted, removed };
}

export async function evaluateProductCompleteness(
  organizationId: string,
  productId: string,
  familyId?: string | null,
  overrides: Record<string, any> = {}
): Promise<FamilyAttributeCompletion> {
  if (!familyId) {
    return {
      isComplete: true,
      requiredCount: 0,
      completeCount: 0,
      missingAttributes: []
    };
  }

  await ensureFamilyAttributesFromFieldGroups(familyId);

  const { data: requiredAttributes, error: requiredError } = await (supabaseServer as any)
    .from('family_attributes')
    .select('attribute_code, attribute_label, attribute_type')
    .eq('family_id', familyId)
    .eq('organization_id', organizationId)
    .eq('is_required', true)
    .order('display_order', { ascending: true });

  if (requiredError) {
    console.error('Error loading required family attributes:', requiredError);
    throw new Error('Failed to load required attributes');
  }

  if (!requiredAttributes || requiredAttributes.length === 0) {
    return {
      isComplete: true,
      requiredCount: 0,
      completeCount: 0,
      missingAttributes: []
    };
  }

  const requiredCodes = requiredAttributes.map((attr: any) => attr.attribute_code);
  const { data: fields, error: fieldsError } = await (supabaseServer as any)
    .from('product_fields')
    .select('id, code, field_type')
    .eq('organization_id', organizationId)
    .in('code', requiredCodes);

  if (fieldsError) {
    console.error('Error loading product fields for completeness:', fieldsError);
    throw new Error('Failed to load product fields for completeness');
  }

  const fieldMap = new Map<string, { id: string; type: string }>();
  (fields || []).forEach((field: any) => {
    fieldMap.set(field.code, { id: field.id, type: field.field_type });
  });

  const fieldIds = Array.from(fieldMap.values()).map((field) => field.id);
  const { data: fieldValues, error: valuesError } = fieldIds.length
    ? await (supabaseServer as any)
        .from('product_field_values')
        .select(`
          product_field_id,
          value_text,
          value_number,
          value_boolean,
          value_date,
          value_datetime,
          value_json
        `)
        .eq('product_id', productId)
        .in('product_field_id', fieldIds)
    : { data: [], error: null };

  if (valuesError) {
    console.error('Error loading product field values:', valuesError);
    throw new Error('Failed to load product field values');
  }

  const valueMap = new Map<string, any>();
  (fieldValues || []).forEach((valueRow: any) => {
    const value =
      valueRow.value_text ??
      valueRow.value_number ??
      valueRow.value_boolean ??
      valueRow.value_date ??
      valueRow.value_datetime ??
      valueRow.value_json;
    valueMap.set(valueRow.product_field_id, value);
  });

  const missingAttributes: Array<{ code: string; label: string }> = [];
  let completeCount = 0;

  requiredAttributes.forEach((attr: any) => {
    const code = attr.attribute_code;
    const label = attr.attribute_label;
    const fieldInfo = fieldMap.get(code);
    const fieldType = fieldInfo?.type ?? attr.attribute_type;

    const overrideValue = Object.prototype.hasOwnProperty.call(overrides, code)
      ? overrides[code]
      : undefined;
    const rawValue = overrideValue !== undefined ? overrideValue : fieldInfo ? valueMap.get(fieldInfo.id) : undefined;

    if (isValuePresent(fieldType, rawValue)) {
      completeCount += 1;
    } else {
      missingAttributes.push({ code, label });
    }
  });

  return {
    isComplete: missingAttributes.length === 0,
    requiredCount: requiredAttributes.length,
    completeCount,
    missingAttributes
  };
}
