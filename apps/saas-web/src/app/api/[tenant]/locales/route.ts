import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@stack-app/database";
import { resolveOrganizationBaselineScope } from "@/lib/default-market-locale";
import { DEFAULT_LOCALE_CATALOG } from "@/lib/locale-catalog";
import { normalizeAndValidateLocaleCode } from "@/lib/locale-code";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UNIQUE_VIOLATION_ERROR = "23505";
const MISSING_TABLE_ERROR = "42P01";

type LocaleRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type LocalizationSettingsMetadata = Record<string, unknown> | null;

function parseBooleanParam(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeLocaleName(name: string, localeCode: string, localeNameByCode: Map<string, string>): string {
  const trimmed = name.trim();
  if (trimmed.length > 0 && trimmed.toLowerCase() !== localeCode.toLowerCase()) {
    return trimmed;
  }
  return localeNameByCode.get(localeCode.toLowerCase()) || trimmed || localeCode;
}

async function loadLocaleCatalogMap(): Promise<Map<string, string>> {
  // locale_catalog is present in runtime schema but not yet in generated Database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("locale_catalog")
    .select("code,name,is_active")
    .eq("is_active", true);

  if (error && error.code !== MISSING_TABLE_ERROR) {
    console.error("Failed to load locale catalog:", error);
  }

  const entries =
    error?.code === MISSING_TABLE_ERROR
      ? DEFAULT_LOCALE_CATALOG
      : ((data || []) as Array<{ code: string; name: string }>).map((row) => ({
          code: row.code,
          name: row.name,
        }));

  return new Map(entries.map((entry: { code: string; name: string }) => [entry.code.toLowerCase(), entry.name]));
}

function extractDefaultLocaleId(metadata: LocalizationSettingsMetadata): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const rawValue = metadata.default_locale_id;
  if (typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function readDefaultLocaleId(organizationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("organization_localization_settings")
    .select("metadata")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    if (error.code === MISSING_TABLE_ERROR) return null;
    console.error("Failed to read localization settings for default locale:", error);
    return null;
  }

  const explicitDefaultLocaleId = extractDefaultLocaleId((data?.metadata ?? null) as LocalizationSettingsMetadata);
  if (explicitDefaultLocaleId) {
    return explicitDefaultLocaleId;
  }

  const baselineScope = await resolveOrganizationBaselineScope(supabase, organizationId);
  return baselineScope.localeId;
}

async function persistDefaultLocaleId(params: {
  organizationId: string;
  userId: string | null;
  defaultLocaleId: string | null;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: existingRow, error: existingError } = await supabase
    .from("organization_localization_settings")
    .select("organization_id,metadata")
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (existingError) {
    if (existingError.code === MISSING_TABLE_ERROR) {
      return {
        ok: false,
        status: 503,
        error: "Localization settings are unavailable. Apply the localization foundation migrations first.",
      };
    }
    console.error("Failed to resolve localization settings for default locale update:", existingError);
    return { ok: false, status: 500, error: "Failed to update default locale." };
  }

  const currentMetadata =
    existingRow?.metadata && typeof existingRow.metadata === "object" && !Array.isArray(existingRow.metadata)
      ? ({ ...(existingRow.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  if (params.defaultLocaleId) {
    currentMetadata.default_locale_id = params.defaultLocaleId;
  } else {
    delete currentMetadata.default_locale_id;
  }

  if (existingRow?.organization_id) {
    const { error: updateError } = await supabase
      .from("organization_localization_settings")
      .update({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: currentMetadata as any,
        updated_by: params.userId,
      })
      .eq("organization_id", params.organizationId);

    if (updateError) {
      console.error("Failed to update localization settings default locale:", updateError);
      return { ok: false, status: 500, error: "Failed to update default locale." };
    }
    return { ok: true };
  }

  const { error: insertError } = await supabase
    .from("organization_localization_settings")
    .insert({
      organization_id: params.organizationId,
      translation_enabled: false,
      write_assist_enabled: false,
      deepl_glossary_id: null,
      brand_instructions: "",
      preferred_tone: "neutral",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: currentMetadata as any,
      created_by: params.userId,
      updated_by: params.userId,
    });

  if (insertError) {
    console.error("Failed to create localization settings for default locale:", insertError);
    return { ok: false, status: 500, error: "Failed to update default locale." };
  }

  return { ok: true };
}

async function buildLocaleUsage(params: {
  organizationId: string;
  locales: LocaleRow[];
  defaultLocaleId: string | null;
}) {
  const localeIds = params.locales.map((locale) => locale.id);
  const localeIdSet = new Set(localeIds);
  const localeIdToCode = new Map(params.locales.map((locale) => [locale.id, locale.code]));
  const localeCodeToId = new Map(params.locales.map((locale) => [locale.code.toLowerCase(), locale.id]));

  const marketCounts = new Map<string, number>();
  const fieldValueCounts = new Map<string, number>();
  const glossaryCounts = new Map<string, number>();
  const jobCounts = new Map<string, number>();

  const { data: markets, error: marketsError } = await supabase
    .from("markets")
    .select("id,default_locale_id")
    .eq("organization_id", params.organizationId);

  if (marketsError) {
    console.error("Failed to load locale market usage:", marketsError);
  }

  const marketIds = (markets || []).map((market) => market.id);
  if (marketIds.length > 0) {
    const { data: marketLocaleRows, error: marketLocalesError } = await supabase
      .from("market_locales")
      .select("locale_id,is_active")
      .in("market_id", marketIds);

    if (marketLocalesError) {
      console.error("Failed to load locale market assignments:", marketLocalesError);
    } else {
      for (const row of marketLocaleRows || []) {
        if (row.is_active !== true || !localeIdSet.has(row.locale_id)) continue;
        marketCounts.set(row.locale_id, (marketCounts.get(row.locale_id) || 0) + 1);
      }
    }

    for (const market of markets || []) {
      if (!market.default_locale_id || !localeIdSet.has(market.default_locale_id)) continue;
      marketCounts.set(
        market.default_locale_id,
        Math.max(1, marketCounts.get(market.default_locale_id) || 0)
      );
    }
  }

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id")
    .eq("organization_id", params.organizationId);

  if (productsError) {
    console.error("Failed to load products for locale usage:", productsError);
  }

  const productIds = (products || []).map((product) => product.id);
  if (productIds.length > 0 && localeIds.length > 0) {
    const { data: fieldRows, error: fieldError } = await supabase
      .from("product_field_values")
      .select("locale_id")
      .in("product_id", productIds)
      .in("locale_id", localeIds);

    if (fieldError) {
      console.error("Failed to load locale product content usage:", fieldError);
    } else {
      for (const row of fieldRows || []) {
        if (!row.locale_id || !localeIdSet.has(row.locale_id)) continue;
        fieldValueCounts.set(row.locale_id, (fieldValueCounts.get(row.locale_id) || 0) + 1);
      }
    }
  }

  const { data: glossaries, error: glossariesError } = await supabase
    .from("translation_glossaries")
    .select("source_language_code,target_language_code")
    .eq("organization_id", params.organizationId);

  if (glossariesError && glossariesError.code !== MISSING_TABLE_ERROR) {
    console.error("Failed to load locale glossary usage:", glossariesError);
  } else {
    for (const glossary of glossaries || []) {
      const sourceLocaleId = localeCodeToId.get((glossary.source_language_code || "").toLowerCase());
      const targetLocaleId = localeCodeToId.get((glossary.target_language_code || "").toLowerCase());
      if (sourceLocaleId) {
        glossaryCounts.set(sourceLocaleId, (glossaryCounts.get(sourceLocaleId) || 0) + 1);
      }
      if (targetLocaleId) {
        glossaryCounts.set(targetLocaleId, (glossaryCounts.get(targetLocaleId) || 0) + 1);
      }
    }
  }

  const { data: jobs, error: jobsError } = await supabase
    .from("translation_jobs")
    .select("source_locale_id,target_locale_ids")
    .eq("organization_id", params.organizationId);

  if (jobsError && jobsError.code !== MISSING_TABLE_ERROR) {
    console.error("Failed to load locale job usage:", jobsError);
  } else {
    for (const job of jobs || []) {
      if (job.source_locale_id && localeIdSet.has(job.source_locale_id)) {
        jobCounts.set(job.source_locale_id, (jobCounts.get(job.source_locale_id) || 0) + 1);
      }
      const targets = Array.isArray(job.target_locale_ids) ? job.target_locale_ids : [];
      for (const targetLocaleId of targets) {
        if (typeof targetLocaleId !== "string" || !localeIdSet.has(targetLocaleId)) continue;
        jobCounts.set(targetLocaleId, (jobCounts.get(targetLocaleId) || 0) + 1);
      }
    }
  }

  return params.locales.map((locale) => ({
    ...locale,
    display_name: locale.name,
    is_default: params.defaultLocaleId === locale.id,
    market_count: marketCounts.get(locale.id) || 0,
    field_value_count: fieldValueCounts.get(locale.id) || 0,
    glossary_count: glossaryCounts.get(locale.id) || 0,
    job_count: jobCounts.get(locale.id) || 0,
    linked_to_market: (marketCounts.get(locale.id) || 0) > 0,
    used_in_product_content: (fieldValueCounts.get(locale.id) || 0) > 0,
    locale_code: localeIdToCode.get(locale.id) || locale.code,
  }));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const url = new URL(request.url);
    const selectedBrandSlug = url.searchParams.get("brand");
    const includeInactive = parseBooleanParam(url.searchParams.get("includeInactive"));
    const includeUsage = parseBooleanParam(url.searchParams.get("includeUsage"));

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const targetOrganizationId = contextResult.context.targetOrganization.id;
    const localeNameByCode = await loadLocaleCatalogMap();

    let query = supabase
      .from("locales")
      .select("id,code,name,is_active")
      .eq("organization_id", targetOrganizationId)
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching locales:", error);
      return NextResponse.json({ error: "Failed to fetch locales" }, { status: 500 });
    }

    const locales = ((data || []) as LocaleRow[]).map((locale) => ({
      ...locale,
      name: normalizeLocaleName(locale.name, locale.code, localeNameByCode),
    }));

    if (!includeUsage) {
      return NextResponse.json(locales);
    }

    const defaultLocaleId = await readDefaultLocaleId(targetOrganizationId);
    const localeUsage = await buildLocaleUsage({
      organizationId: targetOrganizationId,
      locales,
      defaultLocaleId,
    });

    return NextResponse.json(localeUsage);
  } catch (error) {
    console.error("Error in locales GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const localeNameByCode = await loadLocaleCatalogMap();
    const body = await request.json().catch(() => ({}));
    const normalizedCode = normalizeAndValidateLocaleCode(body?.code);
    const rawName = typeof body?.name === "string" ? body.name : "";

    if (!normalizedCode) {
      return NextResponse.json(
        { error: "Locale code is invalid. Use a BCP-47 style code like en, en-US, fr-CA, or zh-Hant." },
        { status: 400 }
      );
    }

    const name = normalizeLocaleName(rawName, normalizedCode, localeNameByCode);
    if (!name) {
      return NextResponse.json({ error: "Locale name is required." }, { status: 400 });
    }

    const targetOrganizationId = contextResult.context.targetOrganization.id;
    const { data: existingLocale, error: existingError } = await supabase
      .from("locales")
      .select("id,code,name,is_active")
      .eq("organization_id", targetOrganizationId)
      .eq("code", normalizedCode)
      .maybeSingle();

    if (existingError) {
      console.error("Error resolving existing locale:", existingError);
      return NextResponse.json({ error: "Failed to create locale" }, { status: 500 });
    }

    if (existingLocale) {
      if (existingLocale.is_active) {
        return NextResponse.json(
          {
            ...existingLocale,
            name: normalizeLocaleName(existingLocale.name, existingLocale.code, localeNameByCode),
          },
          { status: 200 }
        );
      }

      const { data: reactivatedLocale, error: reactivateError } = await supabase
        .from("locales")
        .update({
          name,
          is_active: true,
        })
        .eq("id", existingLocale.id)
        .select("id,code,name,is_active")
        .single();

      if (reactivateError) {
        console.error("Error reactivating locale:", reactivateError);
        return NextResponse.json({ error: "Failed to reactivate locale" }, { status: 500 });
      }

      return NextResponse.json(
        {
          ...reactivatedLocale,
          name: normalizeLocaleName(reactivatedLocale.name, reactivatedLocale.code, localeNameByCode),
        },
        { status: 200 }
      );
    }

    const { data: createdLocale, error: createError } = await supabase
      .from("locales")
      .insert({
        organization_id: targetOrganizationId,
        code: normalizedCode,
        name,
        is_active: true,
      })
      .select("id,code,name,is_active")
      .single();

    if (createError) {
      if (createError.code === UNIQUE_VIOLATION_ERROR) {
        return NextResponse.json(
          { error: "A locale with this code already exists." },
          { status: 409 }
        );
      }
      console.error("Error creating locale:", createError);
      return NextResponse.json({ error: "Failed to create locale" }, { status: 500 });
    }

    return NextResponse.json(
      {
        ...createdLocale,
        name: normalizeLocaleName(createdLocale.name, createdLocale.code, localeNameByCode),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in locales POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const targetOrganizationId = contextResult.context.targetOrganization.id;
    const userId = contextResult.context.userId || null;
    const body = await request.json().catch(() => ({}));
    const localeId =
      typeof body?.localeId === "string"
        ? body.localeId.trim()
        : typeof body?.locale_id === "string"
          ? body.locale_id.trim()
          : typeof body?.id === "string"
            ? body.id.trim()
            : "";

    if (!localeId) {
      return NextResponse.json({ error: "localeId is required." }, { status: 400 });
    }

    const { data: locale, error: localeError } = await supabase
      .from("locales")
      .select("id,code,name,is_active")
      .eq("organization_id", targetOrganizationId)
      .eq("id", localeId)
      .maybeSingle();

    if (localeError) {
      console.error("Error resolving locale for update:", localeError);
      return NextResponse.json({ error: "Failed to update locale." }, { status: 500 });
    }

    if (!locale) {
      return NextResponse.json({ error: "Locale not found." }, { status: 404 });
    }

    const nextIsActive =
      typeof body?.isActive === "boolean"
        ? body.isActive
        : typeof body?.is_active === "boolean"
          ? body.is_active
          : null;
    const nextIsDefault =
      typeof body?.isDefault === "boolean"
        ? body.isDefault
        : typeof body?.is_default === "boolean"
          ? body.is_default
          : null;

    if (nextIsActive === null && nextIsDefault === null) {
      return NextResponse.json({ error: "No valid locale updates were provided." }, { status: 400 });
    }

    const currentDefaultLocaleId = await readDefaultLocaleId(targetOrganizationId);
    if (nextIsActive === false && currentDefaultLocaleId === locale.id) {
      return NextResponse.json(
        { error: "Select another default locale before deactivating this locale." },
        { status: 400 }
      );
    }

    if (nextIsDefault === true && locale.is_active !== true && nextIsActive !== true) {
      return NextResponse.json(
        { error: "Reactivate this locale before setting it as the default locale." },
        { status: 400 }
      );
    }

    if (nextIsActive !== null) {
      const { error: updateError } = await supabase
        .from("locales")
        .update({ is_active: nextIsActive })
        .eq("organization_id", targetOrganizationId)
        .eq("id", locale.id);

      if (updateError) {
        console.error("Failed to update locale state:", updateError);
        return NextResponse.json({ error: "Failed to update locale." }, { status: 500 });
      }
    }

    if (nextIsDefault !== null) {
      const persistResult = await persistDefaultLocaleId({
        organizationId: targetOrganizationId,
        userId,
        defaultLocaleId: nextIsDefault ? locale.id : null,
      });
      if (!persistResult.ok) {
        return NextResponse.json({ error: persistResult.error }, { status: persistResult.status });
      }
    }

    const localeNameByCode = await loadLocaleCatalogMap();
    const { data: refreshedLocale, error: refreshedError } = await supabase
      .from("locales")
      .select("id,code,name,is_active")
      .eq("organization_id", targetOrganizationId)
      .eq("id", locale.id)
      .single();

    if (refreshedError) {
      console.error("Failed to reload locale after update:", refreshedError);
      return NextResponse.json({ error: "Failed to update locale." }, { status: 500 });
    }

    const defaultLocaleId =
      nextIsDefault === null ? currentDefaultLocaleId : nextIsDefault ? locale.id : null;

    return NextResponse.json({
      ...refreshedLocale,
      name: normalizeLocaleName(refreshedLocale.name, refreshedLocale.code, localeNameByCode),
      is_default: defaultLocaleId === locale.id,
    });
  } catch (error) {
    console.error("Error in locales PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
