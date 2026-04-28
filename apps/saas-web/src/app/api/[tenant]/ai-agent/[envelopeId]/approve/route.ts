import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { hasOrganizationAccess } from "@/lib/user-context";
import { supabaseServer } from "@/lib/supabase";
import {
  getAiTaskEnvelope,
  updateAiTaskEnvelopeResult,
  logAiActionAudit,
} from "@/lib/ai-foundation";
import type { StagedChange } from "@/lib/claude-agent";

// ---------------------------------------------------------------------------
// POST /api/[tenant]/ai-agent/[envelopeId]/approve
//
// Commits staged changes to the database.
// Body: { change_ids?: string[] }  — if omitted, approves all pending changes.
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; envelopeId: string }> }
) {
  const { tenant, envelopeId } = await params;

  // Auth — require collaborate access (editor+)
  const { getUser } = getKindeServerSession();
  const user = await getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await hasOrganizationAccess(tenant, "collaborate");
  if (!access.hasAccess || !access.organizationId) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  if (access.accessType === "partner") {
    return NextResponse.json({ error: "Partners cannot approve Agent tasks." }, { status: 403 });
  }

  const organizationId = access.organizationId;
  const actorUserId = user.id;

  // Parse optional change_ids filter
  let changeIds: string[] | null = null;
  try {
    const body = await request.json();
    if (Array.isArray(body?.change_ids)) changeIds = body.change_ids as string[];
  } catch {
    // No body or non-JSON — approve all
  }

  // Load envelope
  const envelope = await getAiTaskEnvelope({
    supabase: supabaseServer,
    organizationId,
    envelopeId,
  });
  if (!envelope) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (envelope.status !== "pending") {
    return NextResponse.json(
      { error: `Cannot approve a task with status '${envelope.status}'.` },
      { status: 409 }
    );
  }

  const stagedChanges = (envelope.resultPayload?.staged_changes ?? []) as StagedChange[];
  const toApprove = changeIds
    ? stagedChanges.filter((c) => changeIds!.includes(c.id) && c.approved === null)
    : stagedChanges.filter((c) => c.approved === null);

  const committed: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  // Commit each change in sequence
  for (const change of toApprove) {
    try {
      await commitChange(change, organizationId, supabaseServer, actorUserId);

      await logAiActionAudit({
        supabase: supabaseServer,
        organizationId,
        aiTaskEnvelopeId: envelope.id,
        actorUserId,
        action: `approved_${change.type}`,
        resourceType: change.type,
        resourceId: change.productId ?? change.id,
        status: "recorded",
        metadata: { change_id: change.id, field: change.field, locale: change.locale },
      });

      change.approved = true;
      committed.push(change.id);
    } catch (err) {
      console.error(`Failed to commit change ${change.id}:`, err);
      failed.push({ id: change.id, reason: String(err) });
      change.approved = null; // keep pending so user can retry
    }
  }

  // Mark rejected any that were explicitly not in change_ids
  if (changeIds) {
    for (const change of stagedChanges) {
      if (!changeIds.includes(change.id) && change.approved === null) {
        change.approved = false;
      }
    }
  }

  const allDone = stagedChanges.every((c) => c.approved !== null);
  const newStatus = allDone && failed.length === 0 ? "completed" : "pending";

  await updateAiTaskEnvelopeResult({
    supabase: supabaseServer,
    organizationId,
    envelopeId: envelope.id,
    status: newStatus,
    resultPayload: {
      ...envelope.resultPayload,
      staged_changes: stagedChanges,
    },
    approvedBy: actorUserId,
    approvedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    committed: committed.length,
    failed: failed.length,
    status: newStatus,
    errors: failed.length > 0 ? failed : undefined,
  });
}

// ---------------------------------------------------------------------------
// Commit a single staged change to the database
// ---------------------------------------------------------------------------

async function commitChange(
  change: StagedChange,
  organizationId: string,
  supabase: typeof supabaseServer,
  actorUserId: string
): Promise<void> {
  switch (change.type) {
    case "content_update": {
      if (!change.productId || !change.field || !change.after) {
        throw new Error("Missing required fields for content_update");
      }
      const allowedFields = new Set([
        "short_description",
        "long_description",
        "features",
        "meta_title",
        "meta_description",
        "keywords",
        "brand_line",
      ]);
      if (!allowedFields.has(change.field)) {
        throw new Error(`Field '${change.field}' is not an allowed update target`);
      }
      const { error } = await supabase
        .from("products")
        .update({ [change.field]: change.after })
        .eq("id", change.productId)
        .eq("organization_id", organizationId); // org guard — always present
      if (error) throw new Error(error.message);
      break;
    }

    case "translation": {
      // The agent already called DeepL during the planning phase — `change.after`
      // holds the translated text. We commit it by upserting into product_field_values
      // with the target locale scoped to the product.
      if (!change.productId || !change.field || !change.after || !change.locale) {
        throw new Error("Missing required fields for translation commit");
      }

      // 1. Resolve locale_id from locale code
      const { data: localeRow } = await supabase
        .from("locales")
        .select("id")
        .eq("code", change.locale)
        .maybeSingle();
      if (!localeRow) {
        throw new Error(`Locale '${change.locale}' not found`);
      }
      const localeId = localeRow.id;

      // 2. Resolve product_field_id (create system field record if first use)
      const { data: fieldRow } = await supabase
        .from("product_fields")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("code", change.field)
        .maybeSingle();

      let productFieldId: string | null = fieldRow?.id ?? null;

      if (!productFieldId) {
        const { data: created } = await supabase
          .from("product_fields")
          .insert({
            organization_id: organizationId,
            code: change.field,
            name: change.field.replace(/_/g, " "),
            field_type: "text",
            is_required: false,
            is_unique: false,
            is_localizable: true,
            is_translatable: true,
            sort_order: 1,
            options: { is_system: true, system_key: change.field } as never,
          })
          .select("id")
          .single();
        productFieldId = created?.id ?? null;
      }

      if (!productFieldId) {
        throw new Error(`Could not resolve product field '${change.field}'`);
      }

      // 3. Upsert translated value into product_field_values
      const { data: existing } = await supabase
        .from("product_field_values")
        .select("id")
        .eq("product_id", change.productId)
        .eq("product_field_id", productFieldId)
        .eq("locale_id", localeId)
        .is("market_id", null)
        .is("channel_id", null)
        .is("destination_id", null)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from("product_field_values")
          .update({ value_text: change.after, locale_id: localeId, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("product_field_values")
          .insert({
            product_id: change.productId,
            product_field_id: productFieldId,
            locale_id: localeId,
            value_text: change.after,
          } as never);
        if (error) throw new Error(error.message);
      }
      break;
    }

    case "export": {
      // Export commit (triggering file generation) is Phase 5.
      // The agent's propose_export stages intent; actual export generation
      // is deferred until the async export pipeline is wired.
      break;
    }

    case "publish": {
      // Publish commit (creating portal_publishes) is Phase 5.
      break;
    }

    case "create_family": {
      const meta = change.metadata as Record<string, unknown>;
      const payload: Record<string, unknown> = {
        organization_id: organizationId,
        created_by: actorUserId,
        name: meta.name as string,
        code: meta.code as string,
        description: (meta.description as string) ?? null,
      };
      const { error } = await supabase
        .from("product_families")
        .insert(payload as never);
      if (error) throw new Error(error.message);
      break;
    }

    case "create_product": {
      const meta = change.metadata as Record<string, unknown>;
      const payload: Record<string, unknown> = {
        organization_id: organizationId,
        created_by: actorUserId,
        product_name: meta.product_name as string,
        type: meta.type as string,
        family_id: meta.family_id as string,
        sku: (meta.sku as string) ?? null,
        short_description: (meta.short_description as string) ?? null,
        long_description: (meta.long_description as string) ?? null,
        features: (meta.features as string[]) ?? null,
        status: "Draft",
      };
      const { error } = await supabase
        .from("products")
        .insert(payload as never);
      if (error) throw new Error(error.message);
      break;
    }

    case "create_variants": {
      const meta = change.metadata as Record<string, unknown>;
      const payload: Record<string, unknown> = {
        organization_id: organizationId,
        created_by: actorUserId,
        product_name: meta.product_name as string,
        type: "variant",
        family_id: meta.family_id as string,
        parent_id: meta.parent_id as string,
        sku: (meta.sku as string) ?? null,
        variant_axis: (meta.variant_axis as Record<string, string>) ?? null,
        short_description: (meta.short_description as string) ?? null,
        status: "Draft",
      };
      const { error } = await supabase
        .from("products")
        .insert(payload as never);
      if (error) throw new Error(error.message);
      break;
    }

    default:
      throw new Error(`Unknown change type: ${(change as StagedChange).type}`);
  }
}
