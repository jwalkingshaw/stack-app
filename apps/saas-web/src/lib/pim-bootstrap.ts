import { getSupabaseServer } from "@/lib/supabase";
import {
  CORE_BASIC_INFO_GROUP_CODE,
  CORE_DOCUMENTATION_GROUP_CODE,
  CORE_SERVING_INFO_GROUP_CODE
} from '@/lib/pim-core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@stack-app/database';

export async function ensureBasicInformationGroup(
  supabase: SupabaseClient<Database>,
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

  const { data, error } = await getSupabaseServer()
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
  field_type: 'text' | 'textarea' | 'number' | 'identifier' | 'file' | 'select' | 'measurement' | 'table';
  is_required: boolean;
  is_unique: boolean;
  is_localizable?: boolean;
  is_channelable?: boolean;
  sort_order: number;
  validation_rules: Json;
  options: Json;
  field_class?: 'system' | 'output' | 'custom';
  system_key?: string | null;
  is_locked?: boolean;
  is_override_capable?: boolean;
  scope_policy?: 'base' | 'locale' | 'market' | 'output' | 'partner' | 'mixed';
  data_domain?: string;
  value_storage_strategy?: 'product_column' | 'field_value' | 'slot_assignment' | 'partner_document' | 'hybrid';
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
    code: 'brand_name',
    name: 'Brand Name',
    description: 'Brand shown on the product, label, and channel outputs.',
    field_type: 'text',
    is_required: false,
    is_unique: false,
    sort_order: 2,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'brand_name',
      max_length: 120
    },
    data_domain: 'identity'
  },
  {
    code: 'scin',
    name: 'SCIN',
    description: 'System-created immutable identifier.',
    field_type: 'identifier',
    is_required: true,
    is_unique: true,
    sort_order: 3,
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
    sort_order: 4,
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
    sort_order: 5,
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
  },
  {
    code: 'manufacturer_name',
    name: 'Manufacturer Name',
    description: 'Manufacturer name used across labels, registrations, and output contracts.',
    field_type: 'text',
    is_required: false,
    is_unique: false,
    sort_order: 6,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'manufacturer_name',
      max_length: 160
    },
    data_domain: 'identity'
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
      document_type: 'coa',
      allow_multiple: true,
      allowed_mime_groups: ['pdf', 'document', 'image'],
      max_size_mb: 50
    },
    data_domain: 'documentation'
  },
  {
    code: 'coc_documents',
    name: 'COC Documents',
    description: 'Certificates of Conformance linked from DAM assets.',
    field_type: 'file',
    is_required: false,
    is_unique: false,
    sort_order: 2,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'coc_documents',
      document_slot: 'coc',
      document_type: 'coc',
      allow_multiple: true,
      allowed_mime_groups: ['pdf', 'document', 'image'],
      max_size_mb: 50
    },
    data_domain: 'documentation'
  },
  {
    code: 'label_panel_documents',
    name: 'Label Panels',
    description: 'Structured label panel artwork and rendered label files linked from DAM assets.',
    field_type: 'file',
    is_required: false,
    is_unique: false,
    sort_order: 3,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'label_panel_documents',
      document_slot: 'label_panel',
      document_type: 'label_panel',
      allow_multiple: true,
      allowed_mime_groups: ['pdf', 'document', 'image'],
      max_size_mb: 100
    },
    data_domain: 'documentation'
  },
  {
    code: 'spec_sheet_documents',
    name: 'Spec Sheets',
    description: 'Technical product specification sheets linked from DAM assets.',
    field_type: 'file',
    is_required: false,
    is_unique: false,
    sort_order: 4,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'spec_sheet_documents',
      document_slot: 'spec_sheet',
      document_type: 'spec_sheet',
      allow_multiple: true,
      allowed_mime_groups: ['pdf', 'document', 'image'],
      max_size_mb: 50
    },
    data_domain: 'documentation'
  },
  {
    code: 'sell_sheet_documents',
    name: 'Sell Sheets',
    description: 'Commercial sell sheets and partner-ready summaries linked from DAM assets.',
    field_type: 'file',
    is_required: false,
    is_unique: false,
    sort_order: 5,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'sell_sheet_documents',
      document_slot: 'sell_sheet',
      document_type: 'sell_sheet',
      allow_multiple: true,
      allowed_mime_groups: ['pdf', 'document', 'image'],
      max_size_mb: 50
    },
    data_domain: 'documentation'
  },
  {
    code: 'supporting_documents',
    name: 'Supporting Documents',
    description: 'Typed product-supporting regulatory and technical documents linked from DAM assets.',
    field_type: 'file',
    is_required: false,
    is_unique: false,
    sort_order: 6,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'supporting_documents',
      document_slot: 'supporting_document',
      document_type: 'supporting_document',
      allow_multiple: true,
      allowed_mime_groups: ['pdf', 'document', 'image'],
      max_size_mb: 50
    },
    data_domain: 'documentation'
  },
  {
    code: 'legal_documents',
    name: 'Legal Documents (Legacy)',
    description: 'Legacy catch-all legal documents bucket retained for migration compatibility.',
    field_type: 'file',
    is_required: false,
    is_unique: false,
    sort_order: 90,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'legal_documents',
      document_slot: 'legal',
      document_type: 'legal_document',
      deprecated: true,
      allow_multiple: true,
      allowed_mime_groups: ['pdf', 'document', 'image'],
      max_size_mb: 50
    },
    data_domain: 'documentation'
  },
  {
    code: 'sfp_documents',
    name: 'SFP Documents (Legacy)',
    description: 'Legacy supporting product file bucket retained for migration compatibility.',
    field_type: 'file',
    is_required: false,
    is_unique: false,
    sort_order: 91,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'sfp_documents',
      document_slot: 'sfp',
      document_type: 'supporting_document',
      deprecated: true,
      allow_multiple: true,
      allowed_mime_groups: ['pdf', 'document', 'image'],
      max_size_mb: 50
    },
    data_domain: 'documentation'
  }
];

async function ensureDocumentationGroup(
  supabase: SupabaseClient<Database>,
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

  const { data, error } = await getSupabaseServer()
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
  supabase: SupabaseClient<Database>,
  organizationId: string,
  fieldGroupId: string,
  fieldSeeds: CoreFieldSeed[]
): Promise<void> {
  for (const field of fieldSeeds) {
    const { data: upsertedField, error: fieldError } = await getSupabaseServer()
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
          field_class: field.field_class ?? 'system',
          system_key: field.system_key ?? field.code,
          is_locked: field.is_locked ?? true,
          is_override_capable:
            field.is_override_capable ??
            Boolean((field.is_localizable ?? false) || (field.is_channelable ?? false)),
          scope_policy:
            field.scope_policy ??
            ((field.is_localizable ?? false) && (field.is_channelable ?? false)
              ? 'mixed'
              : field.is_localizable ?? false
                ? 'locale'
                : field.is_channelable ?? false
                  ? 'output'
                  : 'base'),
          data_domain: field.data_domain ?? 'general',
          value_storage_strategy:
            field.value_storage_strategy ??
            (field.field_type === 'file' ? 'slot_assignment' : 'field_value'),
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

    const { error: assignmentError } = await getSupabaseServer()
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

const SERVING_INFO_FIELD_SEEDS: CoreFieldSeed[] = [
  {
    code: 'dose_form',
    name: 'Dose Form',
    description: 'Product delivery format (Powder, Capsule, Tablet, etc.). Determines which Facts Panel template applies.',
    field_type: 'select',
    is_required: false,
    is_unique: false,
    sort_order: 10,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'dose_form',
      options: [
        { value: 'Powder',  label: 'Powder' },
        { value: 'Capsule', label: 'Capsule' },
        { value: 'RTD',     label: 'RTD (Ready to Drink)' },
        { value: 'Tablet',  label: 'Tablet' },
        { value: 'Gummy',   label: 'Gummy' },
        { value: 'Softgel', label: 'Softgel' },
        { value: 'Liquid',  label: 'Liquid' },
        { value: 'Bar',     label: 'Bar' },
        { value: 'Other',   label: 'Other' }
      ]
    }
  },
  {
    code: 'unit_count',
    name: 'Unit Count',
    description: 'Count of physical units in the package, such as capsules, gummies, sachets, or tablets.',
    field_type: 'number',
    is_required: false,
    is_unique: false,
    sort_order: 15,
    validation_rules: { min: 1, integer_only: true },
    options: {
      is_system: true,
      system_key: 'unit_count'
    },
    data_domain: 'packaging'
  },
  {
    code: 'package_type',
    name: 'Package Type',
    description: 'Packaging format used for this product such as bottle, tub, pouch, or carton.',
    field_type: 'select',
    is_required: false,
    is_unique: false,
    sort_order: 18,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'package_type',
      options: [
        { value: 'Bottle', label: 'Bottle' },
        { value: 'Tub', label: 'Tub' },
        { value: 'Pouch', label: 'Pouch' },
        { value: 'Carton', label: 'Carton' },
        { value: 'Blister', label: 'Blister' },
        { value: 'Sachet', label: 'Sachet' },
        { value: 'Stick Pack', label: 'Stick Pack' },
        { value: 'Jar', label: 'Jar' },
        { value: 'Other', label: 'Other' }
      ]
    },
    data_domain: 'packaging'
  },
  {
    code: 'serving_size',
    name: 'Serving Size',
    description: 'Amount per single serving (e.g. 32 g, 2 capsules). Required on the Supplement/Nutrition Facts panel (FDA 21 CFR 101.9).',
    field_type: 'measurement',
    is_required: false,
    is_unique: false,
    sort_order: 20,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'serving_size',
      measurement_family_code: 'weight'
    }
  },
  {
    code: 'servings_per_container',
    name: 'Servings Per Container',
    description: 'Number of servings in the container. Required on the Supplement/Nutrition Facts panel (FDA 21 CFR 101.9).',
    field_type: 'number',
    is_required: false,
    is_unique: false,
    sort_order: 30,
    validation_rules: { min: 1, integer_only: true },
    options: {
      is_system: true,
      system_key: 'servings_per_container'
    }
  },
  {
    code: 'net_weight',
    name: 'Net Weight',
    description: 'Total net weight of the product (e.g. 1000 g, 2.2 lb). Required on the product label (FDA 21 CFR 101.105).',
    field_type: 'measurement',
    is_required: false,
    is_unique: false,
    sort_order: 40,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'net_weight',
      measurement_family_code: 'weight'
    }
  },
  {
    code: 'net_volume',
    name: 'Net Volume',
    description: 'Total net volume — use for liquid or RTD products (e.g. 500 ml, 16 fl oz). Required on the label for liquid products (FDA 21 CFR 101.105).',
    field_type: 'measurement',
    is_required: false,
    is_unique: false,
    sort_order: 50,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'net_volume',
      measurement_family_code: 'volume'
    }
  }
];

const COMPLIANCE_EXPANSION_FIELD_SEEDS: CoreFieldSeed[] = [
  {
    code: 'key_actives',
    name: 'Key Actives',
    description: 'Primary active ingredients with dose and unit. Used for marketing claims, sell sheets, and channel output. Separate from the full ingredient list on the label.',
    field_type: 'table',
    is_required: false,
    is_unique: false,
    sort_order: 45,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'key_actives',
      table_definition: {
        columns: [
          {
            key: 'ingredient',
            label: 'Ingredient',
            type: 'text',
            is_editable: true,
            is_required: true,
            placeholder: 'e.g. Creatine Monohydrate'
          },
          {
            key: 'amount',
            label: 'Amount',
            type: 'number',
            is_editable: true,
            is_required: false,
            placeholder: 'e.g. 3'
          },
          {
            key: 'unit',
            label: 'Unit',
            type: 'text',
            is_editable: true,
            is_required: false,
            placeholder: 'e.g. g, mg, IU'
          }
        ],
        meta: {
          allows_custom_rows: true,
          supports_sections: false
        }
      }
    }
  },
  {
    code: 'allergen_statement',
    name: 'Allergen Statement',
    description: 'Allergen and cross-contact statement used on labels, registrations, and partner disclosures.',
    field_type: 'textarea',
    is_required: false,
    is_unique: false,
    is_localizable: true,
    sort_order: 64,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'allergen_statement',
      rows: 3
    },
    data_domain: 'composition'
  },
  {
    code: 'directions_for_use',
    name: 'Directions for Use',
    description: 'How to take the product. Required on supplement labels. Localise per market language.',
    field_type: 'textarea',
    is_required: false,
    is_unique: false,
    is_localizable: true,
    sort_order: 65,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'directions_for_use',
      rows: 5
    }
  },
  {
    code: 'warnings',
    name: 'Warnings',
    description: 'Safety warnings required by FDA and other regulatory bodies. Localise per market language.',
    field_type: 'textarea',
    is_required: false,
    is_unique: false,
    is_localizable: true,
    sort_order: 66,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'warnings',
      rows: 4
    }
  },
  {
    code: 'storage_conditions',
    name: 'Storage Conditions',
    description: 'How the product should be stored (e.g. "Store in a cool, dry place"). Required in some markets. Localise per market language.',
    field_type: 'text',
    is_required: false,
    is_unique: false,
    is_localizable: true,
    sort_order: 67,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'storage_conditions'
    }
  },
  {
    code: 'country_of_origin',
    name: 'Country of Origin',
    description: 'Country where the product is manufactured or substantially transformed. Required by US CBP for dietary supplements.',
    field_type: 'text',
    is_required: false,
    is_unique: false,
    sort_order: 68,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'country_of_origin'
    }
  },
  {
    code: 'certifications',
    name: 'Certifications',
    description: 'Third-party certifications held by this product (e.g. NSF/ANSI 173-2023, Informed Sport, USDA Organic). Required for Amazon US channel listing as of March 2026 cGMP enforcement.',
    field_type: 'table',
    is_required: false,
    is_unique: false,
    sort_order: 70,
    validation_rules: {},
    options: {
      is_system: true,
      system_key: 'certifications',
      table_definition: {
        columns: [
          {
            key: 'cert_name',
            label: 'Certification',
            type: 'text',
            is_editable: true,
            is_required: true,
            placeholder: 'e.g. NSF/ANSI 173-2023'
          },
          {
            key: 'certifying_body',
            label: 'Certifying Body',
            type: 'text',
            is_editable: true,
            is_required: true,
            placeholder: 'e.g. NSF International'
          },
          {
            key: 'cert_number',
            label: 'Certificate No.',
            type: 'text',
            is_editable: true,
            is_required: false,
            placeholder: 'e.g. C12345'
          },
          {
            key: 'expiry_date',
            label: 'Expiry Date',
            type: 'text',
            is_editable: true,
            is_required: false,
            placeholder: 'YYYY-MM-DD'
          }
        ],
        meta: {
          allows_custom_rows: true,
          supports_sections: false
        }
      }
    }
  }
];

async function ensureServingInfoGroup(
  supabase: SupabaseClient<Database>,
  organizationId: string
): Promise<string> {
  const { data, error } = await getSupabaseServer()
    .from('field_groups')
    .upsert(
      {
        organization_id: organizationId,
        code: CORE_SERVING_INFO_GROUP_CODE,
        name: 'Serving & Packaging',
        description:
          'Physical product attributes: dose form, serving size, and net content. All fields are regulatory label requirements or universal product identity.',
        sort_order: 5,
        is_active: true
      },
      { onConflict: 'organization_id,code', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (error || !data?.id) {
    throw error || new Error('Failed to ensure Serving Info field group');
  }

  return data.id as string;
}

async function ensureComplianceGroup(
  supabase: SupabaseClient<Database>,
  organizationId: string
): Promise<string> {
  const { data, error } = await getSupabaseServer()
    .from('field_groups')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('code', 'compliance')
    .single();

  if (error || !data?.id) {
    throw error || new Error('Compliance field group not found — ensure it exists before running bootstrap');
  }

  return data.id as string;
}

export async function ensureCoreBasicInformationFields(
  supabase: SupabaseClient<Database>,
  organizationId: string
): Promise<void> {
  const basicInfoGroupId = await ensureBasicInformationGroup(getSupabaseServer(), organizationId);
  const documentationGroupId = await ensureDocumentationGroup(getSupabaseServer(), organizationId);
  const servingInfoGroupId = await ensureServingInfoGroup(getSupabaseServer(), organizationId);
  const complianceGroupId = await ensureComplianceGroup(getSupabaseServer(), organizationId);

  await ensureFieldsInGroup(getSupabaseServer(), organizationId, basicInfoGroupId, CORE_FIELD_SEEDS);
  await ensureFieldsInGroup(getSupabaseServer(), organizationId, documentationGroupId, DOCUMENTATION_FIELD_SEEDS);
  await ensureFieldsInGroup(getSupabaseServer(), organizationId, servingInfoGroupId, SERVING_INFO_FIELD_SEEDS);
  await ensureFieldsInGroup(getSupabaseServer(), organizationId, complianceGroupId, COMPLIANCE_EXPANSION_FIELD_SEEDS);
}
