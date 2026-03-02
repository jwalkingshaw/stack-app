import { CORE_BASIC_INFO_GROUP_CODE, CORE_DOCUMENTATION_GROUP_CODE } from '@/lib/pim-core';

export async function ensureBasicInformationGroup(
  supabase: any,
  organizationId: string
): Promise<string> {
  const payload = {
    organization_id: organizationId,
    code: CORE_BASIC_INFO_GROUP_CODE,
    name: 'Basic Information',
    description: 'Essential product details and identifiers',
    sort_order: 1,
    is_active: true
  };

  const { data, error } = await supabase
    .from('field_groups')
    .upsert(payload, {
      onConflict: 'organization_id,code',
      ignoreDuplicates: false
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw error || new Error('Failed to ensure Basic Information field group');
  }

  return data.id as string;
}

type CoreFieldSeed = {
  code: string;
  name: string;
  description: string;
  field_type: 'text' | 'identifier' | 'file';
  is_required: boolean;
  is_unique: boolean;
  is_localizable?: boolean;
  is_channelable?: boolean;
  sort_order: number;
  validation_rules: Record<string, any>;
  options: Record<string, any>;
};

const CORE_FIELD_SEEDS: CoreFieldSeed[] = [
  {
    code: 'title',
    name: 'Title',
    description: 'Primary product title.',
    field_type: 'text',
    is_required: true,
    is_unique: false,
    sort_order: 1,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'title',
      max_length: 255
    }
  },
  {
    code: 'scin',
    name: 'SCIN',
    description: 'System-created immutable identifier.',
    field_type: 'identifier',
    is_required: true,
    is_unique: true,
    sort_order: 2,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'scin',
      identifier_kind: 'scin',
      max_length: 8
    }
  },
  {
    code: 'sku',
    name: 'SKU',
    description: 'Business SKU identifier.',
    field_type: 'identifier',
    is_required: false,
    is_unique: true,
    sort_order: 3,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'sku',
      identifier_kind: 'sku',
      max_length: 50
    }
  },
  {
    code: 'barcode',
    name: 'Barcode',
    description: 'Barcode identifier (GTIN/UPC/EAN).',
    field_type: 'identifier',
    is_required: false,
    is_unique: true,
    sort_order: 4,
    validation_rules: {
      allowed_lengths: [8, 12, 13, 14],
      numeric_only: true
    },
    options: {
      is_system: true,
      system_key: 'barcode',
      identifier_kind: 'barcode',
      allowed_formats: ['GTIN', 'UPC', 'EAN'],
      max_length: 14
    }
  }
];

const DOCUMENTATION_FIELD_SEEDS: CoreFieldSeed[] = [
  {
    code: 'coa_documents',
    name: 'COA Documents',
    description: 'Certificates of Analysis linked from DAM assets.',
    field_type: 'file',
    is_required: false,
    is_unique: false,
    sort_order: 1,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'coa_documents',
      document_slot: 'coa',
      allow_multiple: true,
      allowed_mime_groups: ['pdf', 'document', 'image'],
      max_size_mb: 50
    }
  },
  {
    code: 'legal_documents',
    name: 'Legal Documents',
    description: 'Regulatory and legal support documents linked from DAM assets.',
    field_type: 'file',
    is_required: false,
    is_unique: false,
    sort_order: 2,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'legal_documents',
      document_slot: 'legal',
      allow_multiple: true,
      allowed_mime_groups: ['pdf', 'document', 'image'],
      max_size_mb: 50
    }
  },
  {
    code: 'sfp_documents',
    name: 'SFP Documents',
    description: 'Supporting formulation and product files linked from DAM assets.',
    field_type: 'file',
    is_required: false,
    is_unique: false,
    sort_order: 3,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'sfp_documents',
      document_slot: 'sfp',
      allow_multiple: true,
      allowed_mime_groups: ['pdf', 'document', 'image'],
      max_size_mb: 50
    }
  }
];

async function ensureDocumentationGroup(
  supabase: any,
  organizationId: string
): Promise<string> {
  const payload = {
    organization_id: organizationId,
    code: CORE_DOCUMENTATION_GROUP_CODE,
    name: 'Documentation',
    description: 'Compliance, legal, and supporting product files',
    sort_order: 60,
    is_active: true
  };

  const { data, error } = await supabase
    .from('field_groups')
    .upsert(payload, {
      onConflict: 'organization_id,code',
      ignoreDuplicates: false
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw error || new Error('Failed to ensure Documentation field group');
  }

  return data.id as string;
}

async function ensureFieldsInGroup(
  supabase: any,
  organizationId: string,
  fieldGroupId: string,
  fieldSeeds: CoreFieldSeed[]
): Promise<void> {
  for (const field of fieldSeeds) {
    const { data: upsertedField, error: fieldError } = await supabase
      .from('product_fields')
      .upsert(
        {
          organization_id: organizationId,
          code: field.code,
          name: field.name,
          description: field.description,
          field_type: field.field_type,
          is_required: field.is_required,
          is_unique: field.is_unique,
          is_localizable: field.is_localizable ?? false,
          is_channelable: field.is_channelable ?? false,
          sort_order: field.sort_order,
          validation_rules: field.validation_rules,
          options: field.options,
          is_active: true
        },
        {
          onConflict: 'organization_id,code',
          ignoreDuplicates: false
        }
      )
      .select('id')
      .single();

    if (fieldError || !upsertedField?.id) {
      throw fieldError || new Error(`Failed to ensure core field ${field.code}`);
    }

    const { error: assignmentError } = await supabase
      .from('product_field_group_assignments')
      .upsert(
        {
          product_field_id: upsertedField.id,
          field_group_id: fieldGroupId,
          sort_order: field.sort_order
        },
        {
          onConflict: 'product_field_id,field_group_id',
          ignoreDuplicates: false
        }
      );

    if (assignmentError) {
      throw assignmentError;
    }
  }
}

export async function ensureCoreBasicInformationFields(
  supabase: any,
  organizationId: string
): Promise<void> {
  const basicInfoGroupId = await ensureBasicInformationGroup(supabase, organizationId);
  const documentationGroupId = await ensureDocumentationGroup(supabase, organizationId);

  await ensureFieldsInGroup(supabase, organizationId, basicInfoGroupId, CORE_FIELD_SEEDS);
  await ensureFieldsInGroup(
    supabase,
    organizationId,
    documentationGroupId,
    DOCUMENTATION_FIELD_SEEDS
  );
}
