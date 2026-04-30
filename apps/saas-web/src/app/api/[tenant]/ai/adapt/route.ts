import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { getSupabaseServer } from "@/lib/supabase";
import { cache, REDIS_KEY_PREFIX_SAAS } from "@/lib/redis";
import { translateWithDeepL } from "@/lib/deepl";

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}
const MODEL = "claude-haiku-4-5-20251001";
const HOURLY_LIMIT = 60;

async function checkRateLimit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const now = new Date();
    const key = `${REDIS_KEY_PREFIX_SAAS}:adapt:rate:${userId}:h:${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
    const count = await cache.incr(key, 3600);
    if (count > HOURLY_LIMIT) {
      return { allowed: false, reason: `Hourly Adapt limit reached (${HOURLY_LIMIT}/hour). Try again shortly.` };
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

type SourcePhraseChange = {
  sourcePhrase: string;
  reason: string;
  severity: "error" | "warning";
  adaptedTo: string;
};

function buildRulesBlock(rules: RegulatoryRule[]): string {
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

// Maps locale codes to regulatory regions for rule lookup
function resolveRegionFromLocale(localeCode: string): string {
  const code = localeCode.toLowerCase();
  if (code === "en-us") return "US";
  if (code === "en-au") return "AU";
  if (code === "en-gb") return "UK";
  if (code === "es-mx") return "MX";
  // EU member state languages
  const euLocales = ["de", "fr", "it", "es", "nl", "pl", "pt", "sv", "da", "fi", "el", "cs", "hu", "ro", "sk", "bg", "hr", "et", "lv", "lt", "sl", "mt"];
  const base = code.split("-")[0];
  if (euLocales.includes(base)) return "EU";
  return "*";
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

  const { data: memberRow } = await getSupabaseServer()
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

  const sourceText = typeof body.sourceText === "string" ? body.sourceText.trim() : "";
  const sourceLocale = typeof body.sourceLocale === "string" ? body.sourceLocale.trim() : "en";
  const targetLocale = typeof body.targetLocale === "string" ? body.targetLocale.trim() : "";
  const fieldName = typeof body.fieldName === "string" ? body.fieldName.trim() : "";
  const refinement = typeof body.refinement === "string" ? body.refinement.trim() : "";

  if (!sourceText) return NextResponse.json({ error: "sourceText is required" }, { status: 400 });
  if (!targetLocale) return NextResponse.json({ error: "targetLocale is required" }, { status: 400 });

  const targetRegion = resolveRegionFromLocale(targetLocale);

  // Fetch regulatory rules for this locale/region (locale-specific + universal '*')
  const { data: rulesData } = await getSupabaseServer()
    .from("locale_regulatory_rules")
    .select("claim_type,rule_action,rule_description,example_violations,example_compliant,regulatory_reference,severity")
    .eq("active", true)
    .or(
      `and(locale_code.eq.${targetLocale},region_code.eq.${targetRegion}),and(locale_code.eq.*,region_code.eq.${targetRegion}),and(locale_code.eq.*,region_code.eq.*)`
    )
    .order("severity", { ascending: true });

  const rules: RegulatoryRule[] = Array.isArray(rulesData) ? rulesData : [];

  // Step 1: Translate with DeepL
  let translatedText: string;
  try {
    const [result] = await translateWithDeepL({
      texts: [sourceText],
      targetLocaleCode: targetLocale,
      sourceLocaleCode: sourceLocale,
    });
    translatedText = result.translatedText;
  } catch (err) {
    console.error("DeepL translation error:", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }

  let adaptedText = translatedText;
  let sourcePhraseChanges: SourcePhraseChange[] = [];

  // Step 2: If rules exist OR refinement instructions provided, pass through Claude
  if (rules.length > 0 || refinement) {
    const rulesBlock = rules.length > 0 ? buildRulesBlock(rules) : null;

    const systemPromptLines = [
      `You are a compliance editor for sports nutrition content in the ${targetLocale} market (${targetRegion} regulatory zone).`,
      "You will receive a translated text. Your job is to review it against the regulatory rules below and produce a fully compliant version.",
      "Apply your knowledge of supplement regulations for this market in addition to the explicit rules listed.",
    ];

    if (rulesBlock) {
      systemPromptLines.push("", `Regulatory rules for ${targetLocale} / ${targetRegion}:`, rulesBlock);
    }

    systemPromptLines.push(
      "",
      "Instructions:",
      "1. If the text is already compliant, return it unchanged.",
      "2. If any phrase violates a rule, rewrite ONLY that phrase to be compliant. Preserve the rest of the text exactly.",
      "3. For each change you make, record the original source phrase (in the source language, not the translated language), the rule it violated, and what you changed it to in the target language.",
      "",
      "Return a JSON object with this exact structure:",
      '{ "adaptedText": "<fully compliant translated text>", "sourcePhraseChanges": [ { "sourcePhrase": "<original phrase in source language>", "reason": "<rule description>", "severity": "error|warning", "adaptedTo": "<replacement in target language>" } ] }',
      "sourcePhraseChanges is an empty array if no changes were needed.",
      "Return ONLY the JSON object.",
    );

    const systemPrompt = systemPromptLines.join("\n");

    const userMessageLines = [
      `Source text (${sourceLocale}): ${sourceText}`,
      `Translated text (${targetLocale}): ${translatedText}`,
      fieldName ? `Field: ${fieldName}` : null,
    ];

    if (refinement) {
      userMessageLines.push(
        "",
        `Editor instructions for this regeneration: ${refinement}`,
        "Apply these instructions while still ensuring the result is compliant. If the instructions provide alternative copy in the source language, translate that copy instead and check it for compliance.",
      );
    }

    userMessageLines.push("", "Review the translated text for compliance and return the result as JSON.");

    const userMessage = userMessageLines.filter(Boolean).join("\n");

    try {
      const response = await getAnthropic().messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      const rawText = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");

      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText) as {
          adaptedText?: string;
          sourcePhraseChanges?: SourcePhraseChange[];
        };
        adaptedText = typeof parsed.adaptedText === "string" ? parsed.adaptedText : translatedText;
        sourcePhraseChanges = Array.isArray(parsed.sourcePhraseChanges) ? parsed.sourcePhraseChanges : [];
      } catch {
        // Claude response wasn't valid JSON — use the raw translation, no changes
        adaptedText = translatedText;
        sourcePhraseChanges = [];
      }
    } catch (err) {
      console.error("Adapt compliance check error:", err);
      // Fall back to DeepL translation without compliance pass
      adaptedText = translatedText;
      sourcePhraseChanges = [];
    }
  }

  // Step 3: Back-translate the adapted text so the user can verify it
  let backTranslation = "";
  try {
    const [backResult] = await translateWithDeepL({
      texts: [adaptedText],
      targetLocaleCode: sourceLocale,
      sourceLocaleCode: targetLocale,
    });
    backTranslation = backResult.translatedText;
  } catch {
    // Non-fatal — back-translation is a UX aid, not required
  }

  return NextResponse.json({
    adaptedText,
    backTranslation,
    sourcePhraseChanges,
    status: sourcePhraseChanges.length > 0 ? "adapted" : "compliant",
  });
}
