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

type RegulatoryRule = {
  claim_type: string;
  rule_action: string;
  rule_description: string;
  example_violations: string[];
  example_compliant: string[];
  regulatory_reference: string | null;
  severity: string;
};

function buildRulesBlock(rules: RegulatoryRule[]): string {
  if (rules.length === 0) return "";
  return rules
    .map((r) => {
      const violations = r.example_violations?.length
        ? `Prohibited phrases: ${r.example_violations.join(", ")}.`
        : "";
      const compliant = r.example_compliant?.length
        ? `Compliant alternatives: ${r.example_compliant.join(", ")}.`
        : "";
      const ref = r.regulatory_reference ? ` (${r.regulatory_reference})` : "";
      return `- [${r.severity.toUpperCase()}] ${r.rule_description}${ref} ${violations} ${compliant}`.trim();
    })
    .join("\n");
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

  // Fetch org localization settings and locale regulatory rules in parallel
  const [{ data: locSettings }, { data: rulesData }] = await Promise.all([
    supabaseServer
      .from("organization_localization_settings")
      .select("brand_instructions,preferred_tone")
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabaseServer
      .from("locale_regulatory_rules")
      .select("claim_type,rule_action,rule_description,example_violations,example_compliant,regulatory_reference,severity")
      .eq("active", true)
      .or(`locale_code.eq.${defaultLocale},locale_code.eq.*`)
      .order("severity", { ascending: true }),
  ]);

  const brandInstructions = typeof locSettings?.brand_instructions === "string"
    ? locSettings.brand_instructions.trim()
    : "";
  const preferredTone = typeof locSettings?.preferred_tone === "string"
    ? locSettings.preferred_tone
    : "neutral";

  const rules: RegulatoryRule[] = Array.isArray(rulesData) ? rulesData : [];
  const rulesBlock = buildRulesBlock(rules);

  const otherFields = productContext.otherFields ?? {};
  const contextLines = Object.entries(otherFields)
    .map(([k, v]): [string, string] => {
      if (v === null || v === undefined) return [k, ""];
      if (typeof v === "string") return [k, v.trim()];
      if (typeof v === "number" || typeof v === "boolean") return [k, String(v)];
      if (typeof v === "object") {
        const obj = v as Record<string, unknown>;
        if (obj.value !== undefined && obj.unit !== undefined) return [k, `${obj.value} ${obj.unit}`];
        if (obj.amount !== undefined && obj.currency !== undefined) return [k, `${obj.amount} ${obj.currency}`];
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
    `The content will be published in the ${defaultLocale} market. You must write fully compliant copy.`,
    "Apply your knowledge of supplement and sports nutrition regulations for this locale — including food supplement laws, health claim restrictions, and advertising standards.",
    rulesBlock
      ? `\nPlatform compliance rules that must be followed without exception:\n${rulesBlock}`
      : null,
    "",
    "Return ONLY the drafted content as a plain string. No JSON, no compliance notes, no commentary.",
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

    const suggestion = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("Write Assist API error:", err);
    return NextResponse.json({ error: "Failed to generate content" }, { status: 500 });
  }
}
