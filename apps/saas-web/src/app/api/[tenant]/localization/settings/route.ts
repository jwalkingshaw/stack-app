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

function toSettingsPayload(row: LocalizationSettingsRow | null, organizationId: string) {
  return {
    organization_id: organizationId,
    translation_enabled: Boolean(row?.translation_enabled),
    write_assist_enabled: Boolean(row?.write_assist_enabled),
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
      supabaseServer
        .from("organization_localization_settings")
        .select(SETTINGS_SELECT)
        .eq("organization_id", organization.id)
        .maybeSingle(),
      supabaseServer
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

    const { data: existingRow, error: existingError } = await supabaseServer
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeResult = await (supabaseServer as any)
        .from("organization_localization_settings")
        .update({
          translation_enabled: translationEnabled,
          write_assist_enabled: writeAssistEnabled,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeResult = await (supabaseServer as any)
        .from("organization_localization_settings")
        .insert({
          organization_id: organization.id,
          translation_enabled: translationEnabled,
          write_assist_enabled: writeAssistEnabled,
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
