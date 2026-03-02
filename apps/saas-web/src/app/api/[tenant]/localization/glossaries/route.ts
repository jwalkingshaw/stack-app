import { NextRequest, NextResponse } from "next/server";
import { createDeepLGlossary, isDeepLConfigured } from "@/lib/deepl";
import { supabaseServer } from "@/lib/supabase";
import {
  isMissingLocalizationFoundationError,
  isOwnerOrAdmin,
  requireLocalizationAccess,
} from "../_shared";

type GlossaryRow = {
  id: string;
  organization_id: string;
  name: string;
  source_language_code: string;
  target_language_code: string;
  provider: string;
  provider_glossary_id: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type GlossaryEntryInput = {
  sourceTerm: string;
  targetTerm: string;
  notes?: string;
};

const GLOSSARY_SELECT = `
  id,
  organization_id,
  name,
  source_language_code,
  target_language_code,
  provider,
  provider_glossary_id,
  is_active,
  metadata,
  created_by,
  created_at,
  updated_at
`;

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEntries(value: unknown): GlossaryEntryInput[] {
  if (!Array.isArray(value)) return [];
  const normalized: GlossaryEntryInput[] = [];
  for (const row of value) {
    const entry = row as Record<string, unknown>;
    const sourceTerm = normalizeString(entry?.sourceTerm);
    const targetTerm = normalizeString(entry?.targetTerm);
    const notes = normalizeString(entry?.notes);
    if (!sourceTerm || !targetTerm) continue;
    normalized.push({
      sourceTerm,
      targetTerm,
      notes: notes || undefined,
    });
  }
  return normalized;
}

async function fetchGlossaryEntryCounts(
  organizationId: string,
  glossaryIds: string[]
): Promise<Record<string, number>> {
  if (glossaryIds.length === 0) return {};
  const { data, error } = await (supabaseServer as any)
    .from("translation_glossary_entries")
    .select("glossary_id")
    .eq("organization_id", organizationId)
    .in("glossary_id", glossaryIds);

  if (error) {
    console.error("Failed to fetch glossary entry counts:", error);
    return {};
  }

  return ((data || []) as Array<{ glossary_id: string }>).reduce(
    (acc, row) => {
      acc[row.glossary_id] = (acc[row.glossary_id] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

async function resolveLocaleCodeById(params: {
  organizationId: string;
  localeId: string | null;
  explicitCode: string | null;
}): Promise<string | null> {
  if (params.explicitCode) {
    return params.explicitCode;
  }
  if (!params.localeId) return null;
  const { data, error } = await (supabaseServer as any)
    .from("locales")
    .select("code")
    .eq("organization_id", params.organizationId)
    .eq("id", params.localeId)
    .maybeSingle();

  if (error) {
    console.error("Failed to resolve locale code for glossary:", error);
    return null;
  }

  const code = normalizeString(data?.code);
  return code ? code : null;
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
    const { data, error } = await (supabaseServer as any)
      .from("translation_glossaries")
      .select(GLOSSARY_SELECT)
      .eq("organization_id", organization.id)
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingLocalizationFoundationError(error)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to list translation glossaries:", error);
      return NextResponse.json({ error: "Failed to list translation glossaries" }, { status: 500 });
    }

    const rows = (data || []) as GlossaryRow[];
    const counts = await fetchGlossaryEntryCounts(
      organization.id,
      rows.map((row) => row.id)
    );

    return NextResponse.json({
      success: true,
      data: {
        glossaries: rows.map((row) => ({
          ...row,
          entry_count: counts[row.id] || 0,
        })),
      },
    });
  } catch (error) {
    console.error("Error in localization glossaries GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
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
        { error: "Only owners and admins can manage translation glossaries." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = normalizeString(body?.name);
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const sourceLocaleCode = await resolveLocaleCodeById({
      organizationId: organization.id,
      localeId: normalizeString(body?.sourceLocaleId ?? body?.source_locale_id),
      explicitCode: normalizeString(body?.sourceLanguageCode ?? body?.source_language_code),
    });
    const targetLocaleCode = await resolveLocaleCodeById({
      organizationId: organization.id,
      localeId: normalizeString(body?.targetLocaleId ?? body?.target_locale_id),
      explicitCode: normalizeString(body?.targetLanguageCode ?? body?.target_language_code),
    });

    if (!sourceLocaleCode || !targetLocaleCode) {
      return NextResponse.json(
        { error: "source and target locale codes are required (either by locale IDs or explicit language codes)." },
        { status: 400 }
      );
    }

    const entries = normalizeEntries(body?.entries);
    const shouldCreateProviderGlossary =
      body?.createProviderGlossary !== false && body?.create_provider_glossary !== false;

    let providerGlossaryId: string | null = null;
    let providerMeta: Record<string, unknown> = {};

    if (entries.length > 0 && shouldCreateProviderGlossary && isDeepLConfigured()) {
      try {
        const providerResult = await createDeepLGlossary({
          name,
          sourceLocaleCode,
          targetLocaleCode,
          entries: entries.map((entry) => ({
            sourceTerm: entry.sourceTerm,
            targetTerm: entry.targetTerm,
          })),
        });
        providerGlossaryId = providerResult.glossaryId;
        providerMeta = {
          providerGlossaryReady: providerResult.ready,
          providerDictionaryCount: providerResult.dictionaryCount,
          providerCreatedAt: new Date().toISOString(),
        };
      } catch (providerError) {
        console.error("Failed to create DeepL glossary:", providerError);
        return NextResponse.json(
          {
            error:
              providerError instanceof Error
                ? providerError.message
                : "Failed to create DeepL glossary",
          },
          { status: 502 }
        );
      }
    }

    const { data: insertedGlossary, error: insertError } = await (supabaseServer as any)
      .from("translation_glossaries")
      .insert({
        organization_id: organization.id,
        name,
        source_language_code: sourceLocaleCode,
        target_language_code: targetLocaleCode,
        provider: "deepl",
        provider_glossary_id: providerGlossaryId,
        metadata: providerMeta,
        created_by: userId,
        updated_by: userId,
      })
      .select(GLOSSARY_SELECT)
      .single();

    if (insertError) {
      if (isMissingLocalizationFoundationError(insertError)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to create translation glossary:", insertError);
      return NextResponse.json({ error: "Failed to create translation glossary" }, { status: 500 });
    }

    const glossary = insertedGlossary as GlossaryRow;
    if (entries.length > 0) {
      const { error: entryInsertError } = await (supabaseServer as any)
        .from("translation_glossary_entries")
        .insert(
          entries.map((entry) => ({
            organization_id: organization.id,
            glossary_id: glossary.id,
            source_term: entry.sourceTerm,
            target_term: entry.targetTerm,
            notes: entry.notes || null,
            created_by: userId,
            updated_by: userId,
          }))
        );

      if (entryInsertError) {
        console.error("Failed to create translation glossary entries:", entryInsertError);
        return NextResponse.json(
          { error: "Glossary created, but failed to create glossary entries." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          glossary: {
            ...glossary,
            entry_count: entries.length,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in localization glossaries POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
