import { mapLocaleToTranslationCode } from "@/lib/translation-locale";

const DEFAULT_DEEPL_PRO_BASE_URL = "https://api.deepl.com";
const DEFAULT_DEEPL_FREE_BASE_URL = "https://api-free.deepl.com";

type DeepLFormality = "default" | "more" | "less" | "prefer_more" | "prefer_less";

type DeepLTranslationRow = {
  detected_source_language?: string;
  text?: string;
  billed_characters?: number;
};

type DeepLTranslationResponse = {
  translations?: DeepLTranslationRow[];
};

type DeepLGlossaryDictionaryRequest = {
  source_lang: string;
  target_lang: string;
  entries: string;
  entries_format: "tsv";
};

type DeepLGlossaryCreateResponse = {
  glossary_id?: string;
  name?: string;
  ready?: boolean;
  creation_time?: string;
  dictionaries?: Array<{
    source_lang?: string;
    target_lang?: string;
    entry_count?: number;
  }>;
};

type DeepLWriteImprovementRow = {
  text?: string;
  target_language?: string;
  detected_source_language?: string;
};

type DeepLWriteResponse = {
  improvements?: DeepLWriteImprovementRow[];
};

export type DeepLTranslationResult = {
  translatedText: string;
  detectedSourceLanguage?: string;
  billedCharacters: number;
};

export type DeepLWriteResult = {
  improvedText: string;
  targetLanguage?: string;
  detectedSourceLanguage?: string;
  billedCharacters: number;
};

export function getDeepLApiKey(): string | null {
  const key = String(process.env.DEEPL_API_KEY || "").trim();
  return key.length > 0 ? key : null;
}

export function isDeepLConfigured(): boolean {
  return Boolean(getDeepLApiKey());
}

function isFreePlanKey(apiKey: string): boolean {
  return apiKey.endsWith(":fx");
}

function getDeepLApiBaseUrl(apiKey: string): string {
  const configured = String(process.env.DEEPL_API_BASE_URL || "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  return isFreePlanKey(apiKey) ? DEFAULT_DEEPL_FREE_BASE_URL : DEFAULT_DEEPL_PRO_BASE_URL;
}

function countCharacters(input: string): number {
  return Array.from(input).length;
}

function mapLocaleCodeForDeepL(value: string): string {
  const mapped = mapLocaleToTranslationCode(value, "deepl");
  return mapped.replace("_", "-");
}

export async function translateWithDeepL(params: {
  texts: string[];
  targetLocaleCode: string;
  sourceLocaleCode?: string | null;
  context?: string | null;
  glossaryId?: string | null;
  formality?: DeepLFormality;
}): Promise<DeepLTranslationResult[]> {
  const apiKey = getDeepLApiKey();
  if (!apiKey) {
    throw new Error("DeepL API key is not configured");
  }

  const inputTexts = params.texts.map((value) => String(value || "")).filter((value) => value.length > 0);
  if (inputTexts.length === 0) {
    return [];
  }

  const targetLang = mapLocaleToTranslationCode(params.targetLocaleCode, "deepl");
  const sourceLang = params.sourceLocaleCode
    ? mapLocaleToTranslationCode(params.sourceLocaleCode, "deepl")
    : null;

  const payload = new URLSearchParams();
  for (const text of inputTexts) {
    payload.append("text", text);
  }
  payload.append("target_lang", targetLang);
  if (sourceLang) {
    payload.append("source_lang", sourceLang);
  }
  if (params.context && params.context.trim().length > 0) {
    payload.append("context", params.context.trim());
  }
  if (params.glossaryId && params.glossaryId.trim().length > 0) {
    payload.append("glossary_id", params.glossaryId.trim());
  }
  if (params.formality) {
    payload.append("formality", params.formality);
  }

  const response = await fetch(`${getDeepLApiBaseUrl(apiKey)}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`DeepL translation failed (${response.status}): ${errorBody || response.statusText}`);
  }

  const payloadJson = (await response.json()) as DeepLTranslationResponse;
  const translations = Array.isArray(payloadJson?.translations) ? payloadJson.translations : [];

  if (translations.length !== inputTexts.length) {
    throw new Error("DeepL translation response count mismatch");
  }

  return translations.map((row, index) => {
    const translatedText = String(row?.text || "");
    const billedCharacters = Number.isFinite(row?.billed_characters)
      ? Number(row?.billed_characters)
      : countCharacters(inputTexts[index]);
    return {
      translatedText,
      detectedSourceLanguage:
        typeof row?.detected_source_language === "string" ? row.detected_source_language : undefined,
      billedCharacters,
    };
  });
}

export async function getDeepLUsage(): Promise<{
  characterCount: number;
  characterLimit: number | null;
}> {
  const apiKey = getDeepLApiKey();
  if (!apiKey) {
    throw new Error("DeepL API key is not configured");
  }

  const response = await fetch(`${getDeepLApiBaseUrl(apiKey)}/v2/usage`, {
    method: "GET",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`DeepL usage check failed (${response.status}): ${errorBody || response.statusText}`);
  }

  const payload = (await response.json()) as {
    character_count?: number;
    character_limit?: number;
  };

  return {
    characterCount: Number.isFinite(payload?.character_count) ? Number(payload.character_count) : 0,
    characterLimit:
      Number.isFinite(payload?.character_limit) && Number(payload.character_limit) > 0
        ? Number(payload.character_limit)
        : null,
  };
}

export async function createDeepLGlossary(params: {
  name: string;
  sourceLocaleCode: string;
  targetLocaleCode: string;
  entries: Array<{ sourceTerm: string; targetTerm: string }>;
}): Promise<{
  glossaryId: string;
  ready: boolean;
  dictionaryCount: number;
}> {
  const apiKey = getDeepLApiKey();
  if (!apiKey) {
    throw new Error("DeepL API key is not configured");
  }

  const sourceLang = mapLocaleCodeForDeepL(params.sourceLocaleCode);
  const targetLang = mapLocaleCodeForDeepL(params.targetLocaleCode);
  const sanitizedEntries = params.entries
    .map((entry) => ({
      source: String(entry.sourceTerm || "").trim(),
      target: String(entry.targetTerm || "").trim(),
    }))
    .filter((entry) => entry.source.length > 0 && entry.target.length > 0);

  if (sanitizedEntries.length === 0) {
    throw new Error("Glossary entries are required to create a DeepL glossary");
  }

  const entryLines = sanitizedEntries
    .map((entry) => `${entry.source}\t${entry.target}`)
    .join("\n");

  const dictionaries: DeepLGlossaryDictionaryRequest[] = [
    {
      source_lang: sourceLang,
      target_lang: targetLang,
      entries: entryLines,
      entries_format: "tsv",
    },
  ];

  const response = await fetch(`${getDeepLApiBaseUrl(apiKey)}/v3/glossaries`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: params.name,
      dictionaries,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`DeepL glossary creation failed (${response.status}): ${errorBody || response.statusText}`);
  }

  const payload = (await response.json()) as DeepLGlossaryCreateResponse;
  const glossaryId = String(payload?.glossary_id || "").trim();
  if (!glossaryId) {
    throw new Error("DeepL glossary creation succeeded but no glossary_id was returned");
  }

  return {
    glossaryId,
    ready: Boolean(payload?.ready),
    dictionaryCount: Array.isArray(payload?.dictionaries) ? payload.dictionaries.length : 0,
  };
}

function resolveWriteTargetLanguage(code: string): string {
  const mapped = mapLocaleCodeForDeepL(code);
  const supported = new Set([
    "DE",
    "EN",
    "EN-GB",
    "EN-US",
    "ES",
    "FR",
    "IT",
    "PT",
    "PT-BR",
    "PT-PT",
  ]);

  if (supported.has(mapped)) return mapped;

  const base = mapped.split("-")[0];
  if (supported.has(base)) return base;

  throw new Error(
    `DeepL Write does not currently support target language '${code}'.`
  );
}

export async function improveTextWithDeepL(params: {
  texts: string[];
  targetLocaleCode: string;
  writingStyle?:
    | "default"
    | "academic"
    | "business"
    | "casual"
    | "simple"
    | "prefer_academic"
    | "prefer_business"
    | "prefer_casual"
    | "prefer_simple";
  tone?:
    | "default"
    | "confident"
    | "diplomatic"
    | "enthusiastic"
    | "friendly"
    | "prefer_confident"
    | "prefer_diplomatic"
    | "prefer_enthusiastic"
    | "prefer_friendly";
}): Promise<DeepLWriteResult[]> {
  const apiKey = getDeepLApiKey();
  if (!apiKey) {
    throw new Error("DeepL API key is not configured");
  }

  const inputTexts = params.texts.map((value) => String(value || "")).filter((value) => value.length > 0);
  if (inputTexts.length === 0) {
    return [];
  }

  const targetLang = resolveWriteTargetLanguage(params.targetLocaleCode);
  const payload: Record<string, unknown> = {
    text: inputTexts,
    target_lang: targetLang,
  };

  // DeepL Write accepts either writing_style OR tone, not both.
  const tone =
    params.tone && params.tone !== "default" ? params.tone : null;
  const writingStyle =
    params.writingStyle && params.writingStyle !== "default" ? params.writingStyle : null;
  if (tone) {
    payload.tone = tone;
  } else if (writingStyle) {
    payload.writing_style = writingStyle;
  }

  const response = await fetch(`${getDeepLApiBaseUrl(apiKey)}/v2/write/rephrase`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`DeepL Write failed (${response.status}): ${errorBody || response.statusText}`);
  }

  const payloadJson = (await response.json()) as DeepLWriteResponse;
  const improvements = Array.isArray(payloadJson?.improvements) ? payloadJson.improvements : [];

  if (improvements.length !== inputTexts.length) {
    throw new Error("DeepL Write response count mismatch");
  }

  return improvements.map((row, index) => ({
    improvedText: String(row?.text || ""),
    targetLanguage: typeof row?.target_language === "string" ? row.target_language : undefined,
    detectedSourceLanguage:
      typeof row?.detected_source_language === "string" ? row.detected_source_language : undefined,
    billedCharacters: countCharacters(inputTexts[index]),
  }));
}
