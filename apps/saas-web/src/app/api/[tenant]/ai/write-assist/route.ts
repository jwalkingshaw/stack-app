import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { supabaseServer } from "@/lib/supabase";
import { cache, REDIS_KEY_PREFIX_SAAS } from "@/lib/redis";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";
const HOURLY_LIMIT = 60;

async function checkRateLimit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const now = new Date();
    const key = `${REDIS_KEY_PREFIX_SAAS}:write-assist:rate:${userId}:h:${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
    const count = await cache.incr(key, 3600);
    if (count > HOURLY_LIMIT) {
      return { allowed: false, reason: `Hourly Write Assist limit reached (${HOURLY_LIMIT}/hour). Try again shortly.` };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant } = await params;

  const tenantAccess = await requireTenantAccess(request, tenant);
  if (!tenantAccess.ok) return tenantAccess.response;
  const { organization, userId } = tenantAccess;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: memberRow } = await supabaseServer
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization.id)
    .eq("kinde_user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  const role = memberRow?.role ?? null;
  if (!role || role === "viewer") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const rateCheck = await checkRateLimit(userId);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: rateCheck.reason }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const fieldCode = typeof body.fieldCode === "string" ? body.fieldCode.trim() : "";
  const fieldName = typeof body.fieldName === "string" ? body.fieldName.trim() : fieldCode;
  const fieldType = typeof body.fieldType === "string" ? body.fieldType.trim() : "text";
  const defaultLocale = typeof body.defaultLocale === "string" ? body.defaultLocale.trim() : "en";
  const currentValue = typeof body.currentValue === "string" ? body.currentValue.trim() : "";
  const refinement = typeof body.refinement === "string" ? body.refinement.trim() : "";
  const productContext = body.productContext && typeof body.productContext === "object"
    ? (body.productContext as { productName?: string; familyName?: string; otherFields?: Record<string, unknown> })
    : {};

  if (!fieldCode) {
    return NextResponse.json({ error: "fieldCode is required" }, { status: 400 });
  }

  const { data: locSettings } = await supabaseServer
    .from("organization_localization_settings")
    .select("brand_instructions,preferred_tone")
    .eq("organization_id", organization.id)
    .maybeSingle();

  const brandInstructions = typeof locSettings?.brand_instructions === "string"
    ? locSettings.brand_instructions.trim()
    : "";
  const preferredTone = typeof locSettings?.preferred_tone === "string"
    ? locSettings.preferred_tone
    : "neutral";

  const otherFields = productContext.otherFields ?? {};
  const contextLines = Object.entries(otherFields)
    .map(([k, v]): [string, string] => {
      if (v === null || v === undefined) return [k, ""];
      if (typeof v === "string") return [k, v.trim()];
      if (typeof v === "number" || typeof v === "boolean") return [k, String(v)];
      if (typeof v === "object") {
        const obj = v as Record<string, unknown>;
        // measurement: { value, unit }
        if (obj.value !== undefined && obj.unit !== undefined) return [k, `${obj.value} ${obj.unit}`];
        // price: { amount, currency }
        if (obj.amount !== undefined && obj.currency !== undefined) return [k, `${obj.amount} ${obj.currency}`];
        // text wrapper: { text }
        if (typeof obj.text === "string") return [k, obj.text.trim()];
        return [k, JSON.stringify(v)];
      }
      return [k, String(v)];
    })
    .filter(([, v]) => v.length > 0)
    .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`)
    .join("\n");

  const systemPrompt = [
    "You are a product content writer for a sports nutrition and supplements brand.",
    "Write concise, benefit-led content for the requested field using ONLY the information provided.",
    "Do not invent facts, ingredients, dosages, or claims not present in the context.",
    brandInstructions ? `Brand voice: ${brandInstructions}` : null,
    preferredTone !== "neutral" ? `Tone: ${preferredTone}` : null,
    "",
    "After drafting the content, check it against these universal regulatory rules for sports nutrition content:",
    "1. PROHIBITED: Disease claims — words like 'treats', 'cures', 'prevents', 'heals', 'alleviates' applied to medical conditions.",
    "2. CAUTION: Unqualified health claims — 'boosts immunity', 'improves brain function', 'reduces inflammation' require qualification or rephrasing.",
    "3. CAUTION: Absolute claims — 'the best', 'clinically proven', 'scientifically tested' require substantiation.",
    "",
    "Return a JSON object with this exact structure:",
    '{ "suggestion": "<the drafted content>", "complianceFlags": [ { "phrase": "<flagged phrase>", "rule": "<rule description>", "severity": "error|warning", "suggestion": "<compliant alternative>" } ] }',
    "complianceFlags is an empty array if no issues are found.",
    "Return ONLY the JSON object, no other text.",
  ].filter(Boolean).join("\n");

  const userMessage = [
    `Product: ${productContext.productName ?? "Unknown"}`,
    productContext.familyName ? `Family: ${productContext.familyName}` : null,
    contextLines ? `\nOther product details:\n${contextLines}` : null,
    currentValue ? `\nExisting content for this field (improve or replace as needed):\n${currentValue}` : null,
    "",
    `Write the "${fieldName}" field (type: ${fieldType}).`,
    fieldType === "textarea" ? "Aim for 2-4 sentences, benefit-led." : "Keep it concise — one sentence or phrase.",
    refinement ? `\nAdditional instructions: ${refinement}` : null,
  ].filter(Boolean).join("\n");

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    let parsed: { suggestion: string; complianceFlags: Array<{ phrase: string; rule: string; severity: string; suggestion: string }> };
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      parsed = { suggestion: rawText.trim(), complianceFlags: [] };
    }

    return NextResponse.json({
      suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : rawText.trim(),
      complianceFlags: Array.isArray(parsed.complianceFlags) ? parsed.complianceFlags : [],
    });
  } catch (err) {
    console.error("Write Assist API error:", err);
    return NextResponse.json({ error: "Failed to generate content" }, { status: 500 });
  }
}
