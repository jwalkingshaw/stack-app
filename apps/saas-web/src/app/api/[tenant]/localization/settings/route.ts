import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { isDeepLConfigured } from "@/lib/deepl";
import {
  isMissingLocalizationFoundationError,
  isOwnerOrAdmin,
  requireLocalizationAccess,
} from "../_shared";

type LocalizationSettingsRow = {
  organization_id: string;
  translation_enabled: boolean;
  write_assist_enabled: boolean;
  auto_create_pending_tasks_for_new_locale: boolean;
  default_source_locale_id: string | null;
  default_target_locale_ids: string[];
  deepl_glossary_id: string | null;
  brand_instructions: string;
  preferred_tone: string;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

const SETTINGS_SELECT = `
  organization_id,
  translation_enabled,
  write_assist_enabled,
  auto_create_pending_tasks_for_new_locale,
  default_source_locale_id,
  default_target_locale_ids,
  deepl_glossary_id,
  brand_instructions,
  preferred_tone,
  metadata,
  created_by,
  updated_by,
  created_at,
  updated_at
`;

const PREFERRED_TONES = new Set([
  "neutral",
  "formal",
  "informal",
  "professional",
  "friendly",
]);

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
  }
  return Array.from(unique);
}

function toSettingsPayload(row: LocalizationSettingsRow | null, organizationId: string) {
  return {
    organization_id: organizationId,
    translation_enabled: Boolean(row?.translation_enabled),
    write_assist_enabled: Boolean(row?.write_assist_enabled),
    auto_create_pending_tasks_for_new_locale: Boolean(row?.auto_create_pending_tasks_for_new_locale),
    default_source_locale_id: row?.default_source_locale_id || null,
    default_target_locale_ids: normalizeStringArray(row?.default_target_locale_ids || []),
    deepl_glossary_id:
      typeof row?.deepl_glossary_id === "string" && row.deepl_glossary_id.trim().length > 0
        ? row.deepl_glossary_id.trim()
        : null,
    brand_instructions:
      typeof row?.brand_instructions === "string" ? row.brand_instructions : "",
    preferred_tone:
      typeof row?.preferred_tone === "string" && PREFERRED_TONES.has(row.preferred_tone)
        ? row.preferred_tone
        : "neutral",
    metadata:
      row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {},
    created_by: row?.created_by || null,
    updated_by: row?.updated_by || null,
    created_at: row?.created_at || null,
    updated_at: row?.updated_at || null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireLocalizationAccess(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const [settingsResult, localesResult] = await Promise.all([
      (supabaseServer as any)
        .from("organization_localization_settings")
        .select(SETTINGS_SELECT)
        .eq("organization_id", organization.id)
        .maybeSingle(),
      (supabaseServer as any)
        .from("locales")
        .select("id,code,name,is_active")
        .eq("organization_id", organization.id)
        .order("name", { ascending: true }),
    ]);

    if (settingsResult.error) {
      if (isMissingLocalizationFoundationError(settingsResult.error)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to load localization settings:", settingsResult.error);
      return NextResponse.json({ error: "Failed to load localization settings" }, { status: 500 });
    }

    if (localesResult.error) {
      console.error("Failed to load locales for localization settings:", localesResult.error);
      return NextResponse.json({ error: "Failed to load locale options" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        settings: toSettingsPayload(settingsResult.data as LocalizationSettingsRow | null, organization.id),
        locales: localesResult.data || [],
        provider: {
          key: "deepl",
          configured: isDeepLConfigured(),
        },
      },
    });
  } catch (error) {
    console.error("Error in localization settings GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireLocalizationAccess(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization, role, userId } = access.context;
    if (!isOwnerOrAdmin(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can manage localization settings." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const translationEnabled = Boolean(body?.translationEnabled ?? body?.translation_enabled);
    const writeAssistEnabled = Boolean(body?.writeAssistEnabled ?? body?.write_assist_enabled);
    const autoCreatePendingTasksForNewLocale = Boolean(
      body?.autoCreatePendingTasksForNewLocale ?? body?.auto_create_pending_tasks_for_new_locale
    );
    const defaultSourceLocaleId =
      typeof body?.defaultSourceLocaleId === "string" && body.defaultSourceLocaleId.trim().length > 0
        ? body.defaultSourceLocaleId.trim()
        : typeof body?.default_source_locale_id === "string" && body.default_source_locale_id.trim().length > 0
          ? body.default_source_locale_id.trim()
          : null;
    const defaultTargetLocaleIds = normalizeStringArray(
      body?.defaultTargetLocaleIds ?? body?.default_target_locale_ids
    );
    const deeplGlossaryIdRaw =
      typeof body?.deeplGlossaryId === "string"
        ? body.deeplGlossaryId
        : typeof body?.deepl_glossary_id === "string"
          ? body.deepl_glossary_id
          : "";
    const deeplGlossaryId = deeplGlossaryIdRaw.trim().length > 0 ? deeplGlossaryIdRaw.trim() : null;
    const brandInstructionsRaw =
      typeof body?.brandInstructions === "string"
        ? body.brandInstructions
        : typeof body?.brand_instructions === "string"
          ? body.brand_instructions
          : "";
    const brandInstructions = brandInstructionsRaw.trim();
    const preferredToneRaw =
      typeof body?.preferredTone === "string"
        ? body.preferredTone
        : typeof body?.preferred_tone === "string"
          ? body.preferred_tone
          : "neutral";
    const preferredTone = preferredToneRaw.trim().toLowerCase();
    const metadata =
      body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};

    if (!PREFERRED_TONES.has(preferredTone)) {
      return NextResponse.json(
        {
          error:
            "preferredTone must be one of: neutral, formal, informal, professional, friendly",
        },
        { status: 400 }
      );
    }

    const { data: localeRows, error: localeError } = await (supabaseServer as any)
      .from("locales")
      .select("id")
      .eq("organization_id", organization.id);

    if (localeError) {
      console.error("Failed to validate locales for localization settings:", localeError);
      return NextResponse.json({ error: "Failed to validate locale options" }, { status: 500 });
    }

    const validLocaleIds = new Set(((localeRows || []) as Array<{ id: string }>).map((row) => row.id));
    if (defaultSourceLocaleId && !validLocaleIds.has(defaultSourceLocaleId)) {
      return NextResponse.json(
        { error: "defaultSourceLocaleId must belong to this organization." },
        { status: 400 }
      );
    }

    const invalidTargetIds = defaultTargetLocaleIds.filter((id) => !validLocaleIds.has(id));
    if (invalidTargetIds.length > 0) {
      return NextResponse.json(
        { error: "defaultTargetLocaleIds contains invalid locale IDs.", invalidLocaleIds: invalidTargetIds },
        { status: 400 }
      );
    }

    const { data: existingRow, error: existingError } = await (supabaseServer as any)
      .from("organization_localization_settings")
      .select("organization_id")
      .eq("organization_id", organization.id)
      .maybeSingle();

    if (existingError) {
      if (isMissingLocalizationFoundationError(existingError)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to resolve existing localization settings:", existingError);
      return NextResponse.json({ error: "Failed to save localization settings" }, { status: 500 });
    }

    let writeResult;
    if (existingRow?.organization_id) {
      writeResult = await (supabaseServer as any)
        .from("organization_localization_settings")
        .update({
          translation_enabled: translationEnabled,
          write_assist_enabled: writeAssistEnabled,
          auto_create_pending_tasks_for_new_locale: autoCreatePendingTasksForNewLocale,
          default_source_locale_id: defaultSourceLocaleId,
          default_target_locale_ids: defaultTargetLocaleIds,
          deepl_glossary_id: deeplGlossaryId,
          brand_instructions: brandInstructions,
          preferred_tone: preferredTone,
          metadata,
          updated_by: userId,
        })
        .eq("organization_id", organization.id)
        .select(SETTINGS_SELECT)
        .single();
    } else {
      writeResult = await (supabaseServer as any)
        .from("organization_localization_settings")
        .insert({
          organization_id: organization.id,
          translation_enabled: translationEnabled,
          write_assist_enabled: writeAssistEnabled,
          auto_create_pending_tasks_for_new_locale: autoCreatePendingTasksForNewLocale,
          default_source_locale_id: defaultSourceLocaleId,
          default_target_locale_ids: defaultTargetLocaleIds,
          deepl_glossary_id: deeplGlossaryId,
          brand_instructions: brandInstructions,
          preferred_tone: preferredTone,
          metadata,
          created_by: userId,
          updated_by: userId,
        })
        .select(SETTINGS_SELECT)
        .single();
    }

    if (writeResult.error) {
      if (isMissingLocalizationFoundationError(writeResult.error)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to persist localization settings:", writeResult.error);
      return NextResponse.json({ error: "Failed to save localization settings" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        settings: toSettingsPayload(writeResult.data as LocalizationSettingsRow, organization.id),
      },
    });
  } catch (error) {
    console.error("Error in localization settings PUT:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
