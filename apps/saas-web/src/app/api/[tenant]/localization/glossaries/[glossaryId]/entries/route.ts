import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  isMissingLocalizationFoundationError,
  isOwnerOrAdmin,
  requireLocalizationAccess,
} from "../../../_shared";

type GlossaryEntryInput = {
  sourceTerm: string;
  targetTerm: string;
  notes?: string;
};

const ENTRY_SELECT = `
  id,
  glossary_id,
  source_term,
  target_term,
  notes,
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; glossaryId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireLocalizationAccess(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const { data, error } = await (supabaseServer as any)
      .from("translation_glossary_entries")
      .select(ENTRY_SELECT)
      .eq("organization_id", organization.id)
      .eq("glossary_id", resolved.glossaryId)
      .order("source_term", { ascending: true });

    if (error) {
      if (isMissingLocalizationFoundationError(error)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to list translation glossary entries:", error);
      return NextResponse.json({ error: "Failed to list translation glossary entries" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        entries: data || [],
      },
    });
  } catch (error) {
    console.error("Error in translation glossary entries GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; glossaryId: string }> }
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
    const entries = normalizeEntries(body?.entries);
    if (entries.length === 0) {
      return NextResponse.json({ error: "entries must include at least one source/target pair" }, { status: 400 });
    }

    const { data: glossary, error: glossaryError } = await (supabaseServer as any)
      .from("translation_glossaries")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("id", resolved.glossaryId)
      .maybeSingle();

    if (glossaryError) {
      if (isMissingLocalizationFoundationError(glossaryError)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to load translation glossary for entry replace:", glossaryError);
      return NextResponse.json({ error: "Failed to load translation glossary" }, { status: 500 });
    }
    if (!glossary) {
      return NextResponse.json({ error: "Translation glossary not found" }, { status: 404 });
    }

    const { error: deleteError } = await (supabaseServer as any)
      .from("translation_glossary_entries")
      .delete()
      .eq("organization_id", organization.id)
      .eq("glossary_id", resolved.glossaryId);

    if (deleteError) {
      console.error("Failed to clear translation glossary entries:", deleteError);
      return NextResponse.json({ error: "Failed to replace translation glossary entries" }, { status: 500 });
    }

    const { data: insertedEntries, error: insertError } = await (supabaseServer as any)
      .from("translation_glossary_entries")
      .insert(
        entries.map((entry) => ({
          organization_id: organization.id,
          glossary_id: resolved.glossaryId,
          source_term: entry.sourceTerm,
          target_term: entry.targetTerm,
          notes: entry.notes || null,
          created_by: userId,
          updated_by: userId,
        }))
      )
      .select(ENTRY_SELECT);

    if (insertError) {
      if (isMissingLocalizationFoundationError(insertError)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to insert translation glossary entries:", insertError);
      return NextResponse.json({ error: "Failed to replace translation glossary entries" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        entries: insertedEntries || [],
      },
    });
  } catch (error) {
    console.error("Error in translation glossary entries PUT:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
