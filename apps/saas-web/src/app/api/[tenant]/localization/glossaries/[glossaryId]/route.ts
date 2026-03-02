import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  isMissingLocalizationFoundationError,
  isOwnerOrAdmin,
  requireLocalizationAccess,
} from "../../_shared";

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

export async function PATCH(
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
    const updatePayload: Record<string, unknown> = {
      updated_by: userId,
    };

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = normalizeString(body?.name);
      if (!name) {
        return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      }
      updatePayload.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
      updatePayload.is_active = Boolean(body?.isActive);
    }
    if (Object.prototype.hasOwnProperty.call(body, "is_active")) {
      updatePayload.is_active = Boolean(body?.is_active);
    }

    const { data, error } = await (supabaseServer as any)
      .from("translation_glossaries")
      .update(updatePayload)
      .eq("organization_id", organization.id)
      .eq("id", resolved.glossaryId)
      .select(GLOSSARY_SELECT)
      .maybeSingle();

    if (error) {
      if (isMissingLocalizationFoundationError(error)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to update translation glossary:", error);
      return NextResponse.json({ error: "Failed to update translation glossary" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Translation glossary not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { glossary: data } });
  } catch (error) {
    console.error("Error in translation glossary PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; glossaryId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireLocalizationAccess(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization, role } = access.context;
    if (!isOwnerOrAdmin(role)) {
      return NextResponse.json(
        { error: "Only owners and admins can manage translation glossaries." },
        { status: 403 }
      );
    }

    const { error } = await (supabaseServer as any)
      .from("translation_glossaries")
      .delete()
      .eq("organization_id", organization.id)
      .eq("id", resolved.glossaryId);

    if (error) {
      if (isMissingLocalizationFoundationError(error)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to delete translation glossary:", error);
      return NextResponse.json({ error: "Failed to delete translation glossary" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in translation glossary DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

