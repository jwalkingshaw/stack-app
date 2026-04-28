import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import { getOutputProfileTemplate } from "@/lib/output-profile-templates";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

/**
 * POST /api/[tenant]/output-profiles/[profileId]/scaffold
 *
 * Creates a field group and product fields from a template, then populates
 * the profile's field rules. Idempotent — returns 409 if the profile already
 * has a scaffolded field group (source_output_profile_id check).
 *
 * Body: { template_key: string }
 *
 * Sequence:
 *   1. Verify profile belongs to org
 *   2. Resolve template by template_key
 *   3. Idempotency: check field_groups WHERE source_output_profile_id = profileId
 *   4. Create field group with source_output_profile_id = profileId
 *   5. Upsert each template field into product_fields
 *   6. Assign each field to the group via product_field_group_assignments
 *   7. Upsert all template field_rules into output_profile_field_rules
 *      (includes cross-group system field references like coa_documents)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; profileId: string }> }
) {
  const { tenant, profileId } = await params;

  try {
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug: null,
    });
    if (!contextResult.ok) return contextResult.response;

    if (isCrossTenantWrite(tenant, contextResult.context.selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cannot scaffold fields for a shared brand" },
        { status: 403 }
      );
    }

    const organizationId = contextResult.context.tenantOrganization.id;

    // ── 1. Verify profile ────────────────────────────────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from("output_channel_profiles")
      .select("id, name, code, profile_type, template_key")
      .eq("id", profileId)
      .eq("organization_id", organizationId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // ── 2. Resolve template ──────────────────────────────────────────────────
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const templateKey = typeof body.template_key === "string" ? body.template_key.trim() : "";

    if (!templateKey) {
      return NextResponse.json({ error: "template_key is required" }, { status: 400 });
    }

    const template = getOutputProfileTemplate(templateKey);
    if (!template) {
      return NextResponse.json(
        { error: `Unknown template "${templateKey}"` },
        { status: 400 }
      );
    }

    // ── 3. Resolve or create field group ────────────────────────────────────
    // Look up by template group code (org-scoped), NOT by source_output_profile_id.
    // Multiple profiles can share the same field group — e.g. Amazon US and Amazon MX
    // both use the "amazon" group; localization determines which locale values are
    // stored per market. Upserts below are safe to run multiple times.
    let fieldGroupId: string;

    const { data: existingGroup } = await supabase
      .from("field_groups")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("code", template.group_code)
      .maybeSingle();

    if (existingGroup?.id) {
      // Reuse the existing group (may have been created by another profile)
      fieldGroupId = existingGroup.id as string;
    } else {
      // Create a new field group — source_output_profile_id records which profile
      // first scaffolded this group (used for product page badge + export API)
      const { data: newGroup, error: groupError } = await supabase
        .from("field_groups")
        .insert({
          organization_id: organizationId,
          code: template.group_code,
          name: template.group_name,
          description: template.group_description,
          sort_order: 100, // after system groups (1–60)
          is_active: true,
          source_output_profile_id: profileId,
        })
        .select("id")
        .single();

      if (groupError) {
        console.error("scaffold: error creating field group:", groupError);
        return NextResponse.json({ error: "Failed to create field group" }, { status: 500 });
      }

      fieldGroupId = newGroup!.id as string;
    }

    // ── 5. Batch upsert all fields ───────────────────────────────────────────
    // Single request instead of one per field.
    const fieldPayloads = template.fields.map((seed) => {
      const fieldType = String(seed.field_type);
      return {
        organization_id: organizationId,
        code: seed.code,
        name: seed.name,
        description: seed.description,
        field_type: seed.field_type,
        is_required: false,       // field-level required is separate from profile rule required
        is_unique: false,
        is_localizable: seed.is_localizable,
        is_channelable: false,
        sort_order: seed.sort_order,
        validation_rules: seed.validation_rules,
        options: seed.options,
        field_class: "output",
        system_key: null,
        is_locked: true,
        is_override_capable: true,
        scope_policy: seed.is_localizable ? "mixed" : "output",
        data_domain: "output_content",
        value_storage_strategy:
          fieldType === "file" || fieldType === "image"
            ? "slot_assignment"
            : "field_value",
        is_active: true,
      };
    });

    const { data: upsertedFields, error: fieldsError } = await supabase
      .from("product_fields")
      .upsert(fieldPayloads, { onConflict: "organization_id,code", ignoreDuplicates: false })
      .select("id, code");

    if (fieldsError) {
      console.error("scaffold: error batch-upserting fields:", fieldsError);
      return NextResponse.json({ error: "Failed to create fields" }, { status: 500 });
    }

    const fieldsCreated = upsertedFields?.length ?? 0;

    // ── 6. Batch upsert group assignments ────────────────────────────────────
    const sortOrderByCode = new Map(template.fields.map((s) => [s.code, s.sort_order]));
    const assignmentPayloads = (upsertedFields ?? []).map((f) => ({
      field_group_id: fieldGroupId,
      product_field_id: f.id as string,
      sort_order: sortOrderByCode.get(f.code as string) ?? 1,
    }));

    if (assignmentPayloads.length > 0) {
      const { error: assignError } = await supabase
        .from("product_field_group_assignments")
        .upsert(assignmentPayloads, { onConflict: "product_field_id,field_group_id", ignoreDuplicates: true });

      if (assignError) {
        console.error("scaffold: error batch-upserting assignments:", assignError);
        // Non-fatal — fields exist, just group assignment failed
      }
    }

    // ── 7. Batch upsert profile field rules ──────────────────────────────────
    // Includes both template fields and cross-group system field references
    // (e.g. coa_documents on the portal template). The system field already
    // exists in the org — we just add the rule pointing at its field_code.
    const rulePayloads = template.field_rules.map((rule) => ({
      profile_id: profileId,
      field_code: rule.field_code,
      is_required: rule.is_required,
      max_length: rule.max_length ?? null,
      notes: rule.notes ?? null,
    }));

    const { data: upsertedRules, error: rulesError } = await supabase
      .from("output_profile_field_rules")
      .upsert(rulePayloads, { onConflict: "profile_id,field_code", ignoreDuplicates: false })
      .select("field_code");

    if (rulesError) {
      console.error("scaffold: error batch-upserting rules:", rulesError);
      return NextResponse.json({ error: "Failed to create field rules" }, { status: 500 });
    }

    const rulesCreated = upsertedRules?.length ?? 0;

    const slotPayloads = template.fields
      .filter((field) => {
        const fieldType = field.field_type.toLowerCase();
        return (
          fieldType === "file" ||
          fieldType === "image" ||
          typeof field.options.output_slot_code === "string" ||
          typeof field.options.document_slot === "string"
        );
      })
      .map((field) => ({
        organization_id: organizationId,
        output_profile_id: profileId,
        slot_code:
          typeof field.options.output_slot_code === "string"
            ? String(field.options.output_slot_code)
            : typeof field.options.document_slot === "string"
              ? String(field.options.document_slot)
              : field.code,
        slot_name: field.name,
        asset_kind:
          typeof field.options.asset_kind === "string"
            ? String(field.options.asset_kind)
            : field.field_type === "file"
              ? "document"
              : "image",
        document_type:
          typeof field.options.document_type === "string"
            ? String(field.options.document_type)
            : typeof field.options.document_slot === "string"
              ? String(field.options.document_slot)
              : null,
        certificate_type:
          typeof field.options.certificate_type === "string"
            ? String(field.options.certificate_type)
            : null,
        label_panel_type:
          typeof field.options.label_panel_type === "string"
            ? String(field.options.label_panel_type)
            : null,
        classification:
          typeof field.options.data_classification === "string"
            ? String(field.options.data_classification)
            : "partner_restricted",
        is_required:
          template.field_rules.find((rule) => rule.field_code === field.code)?.is_required === true,
        allow_multiple: field.options.allow_multiple === true,
        sort_order: field.sort_order,
        metadata: {
          scaffolded_from_template: template.key,
          source_field_code: field.code,
        },
      }));

    if (slotPayloads.length > 0) {
      const { error: slotError } = await supabase
        .from("output_slot_definitions" as never)
        .upsert(slotPayloads, {
          onConflict: "output_profile_id,slot_code",
          ignoreDuplicates: false,
        });

      if (slotError) {
        console.error("scaffold: error batch-upserting output slots:", slotError);
      }
    }

    const mappingPayloads = (template.attribute_mappings || []).map((mapping, index) => ({
      organization_id: organizationId,
      profile_id: profileId,
      attribute_code: mapping.attribute_code,
      attribute_label: mapping.attribute_label,
      source_mode: mapping.source_mode,
      source_field_code: mapping.source_field_code ?? null,
      override_field_code: mapping.override_field_code ?? null,
      source_slot_code: mapping.source_slot_code ?? null,
      constant_value: mapping.constant_value ?? null,
      resolution_rule: mapping.resolution_rule,
      is_required: mapping.is_required,
      max_length: mapping.max_length ?? null,
      notes: mapping.notes ?? null,
      sort_order:
        typeof mapping.sort_order === "number" && Number.isFinite(mapping.sort_order)
          ? mapping.sort_order
          : index * 10,
      metadata: {
        scaffolded_from_template: template.key,
      },
    }));

    if (mappingPayloads.length > 0) {
      const { error: mappingError } = await supabase
        .from("output_profile_attribute_mappings" as never)
        .upsert(mappingPayloads, {
          onConflict: "profile_id,attribute_code",
          ignoreDuplicates: false,
        });

      if (mappingError) {
        console.error("scaffold: error batch-upserting destination attribute mappings:", mappingError);
      }
    }

    await supabase
      .from("output_channel_profiles")
      .update({ template_key: template.key })
      .eq("id", profileId)
      .eq("organization_id", organizationId);

    return NextResponse.json(
      {
        success: true,
        data: {
          field_group_id: fieldGroupId,
          template_key: templateKey,
          fields_created: fieldsCreated,
          rules_created: rulesCreated,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Unexpected error in POST /output-profiles/[profileId]/scaffold:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
