import { getSupabaseServer } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { DatabaseQueries, createServerClient, type Database } from "@stack-app/database";
import { kindeAPI } from "@/lib/kinde-management";
import { ensureCoreBasicInformationFields } from "@/lib/pim-bootstrap";
import { sendNewSignupNotification, sendWelcomeSignupEmail } from "@/lib/email";
import {
  DEFAULT_UI_LOCALE,
  UI_LOCALE_COOKIE_NAME,
  normalizeUiLocale,
} from "@/lib/ui-locales";
import { DEFAULT_LOCALE_CATALOG } from "@/lib/locale-catalog";

const supabase = createServerClient();
const db = new DatabaseQueries(getSupabaseServer());

const DEFAULT_MARKET_COUNTRY_CODE = "US";

const MARKET_PRESETS: Record<string, { currencyCode: string | null; timezone: string | null }> = {
  AU: { currencyCode: "AUD", timezone: "Australia/Sydney" },
  BR: { currencyCode: "BRL", timezone: "America/Sao_Paulo" },
  CA: { currencyCode: "CAD", timezone: "America/Toronto" },
  CH: { currencyCode: "CHF", timezone: "Europe/Zurich" },
  CN: { currencyCode: "CNY", timezone: "Asia/Shanghai" },
  DE: { currencyCode: "EUR", timezone: "Europe/Berlin" },
  ES: { currencyCode: "EUR", timezone: "Europe/Madrid" },
  FR: { currencyCode: "EUR", timezone: "Europe/Paris" },
  GB: { currencyCode: "GBP", timezone: "Europe/London" },
  HK: { currencyCode: "HKD", timezone: "Asia/Hong_Kong" },
  ID: { currencyCode: "IDR", timezone: "Asia/Jakarta" },
  IE: { currencyCode: "EUR", timezone: "Europe/Dublin" },
  IN: { currencyCode: "INR", timezone: "Asia/Kolkata" },
  IT: { currencyCode: "EUR", timezone: "Europe/Rome" },
  JP: { currencyCode: "JPY", timezone: "Asia/Tokyo" },
  KR: { currencyCode: "KRW", timezone: "Asia/Seoul" },
  MX: { currencyCode: "MXN", timezone: "America/Mexico_City" },
  MY: { currencyCode: "MYR", timezone: "Asia/Kuala_Lumpur" },
  NL: { currencyCode: "EUR", timezone: "Europe/Amsterdam" },
  NZ: { currencyCode: "NZD", timezone: "Pacific/Auckland" },
  PH: { currencyCode: "PHP", timezone: "Asia/Manila" },
  SA: { currencyCode: "SAR", timezone: "Asia/Riyadh" },
  SE: { currencyCode: "SEK", timezone: "Europe/Stockholm" },
  SG: { currencyCode: "SGD", timezone: "Asia/Singapore" },
  TH: { currencyCode: "THB", timezone: "Asia/Bangkok" },
  TR: { currencyCode: "TRY", timezone: "Europe/Istanbul" },
  TW: { currencyCode: "TWD", timezone: "Asia/Taipei" },
  US: { currencyCode: "USD", timezone: "America/New_York" },
  VN: { currencyCode: "VND", timezone: "Asia/Ho_Chi_Minh" },
  ZA: { currencyCode: "ZAR", timezone: "Africa/Johannesburg" },
};

async function ensureOrganizationLocale(params: {
  organizationId: string;
  localeCode: string;
  localeName: string;
}): Promise<{ id: string }> {
  const normalizedCode = params.localeCode.trim();

  const { data: existingLocale, error: existingLocaleError } = await getSupabaseServer()
    .from("locales")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("code", normalizedCode)
    .maybeSingle();

  if (existingLocaleError) {
    throw new Error("Failed to verify default locale.");
  }

  if (existingLocale) {
    const locale = existingLocale as { id: string };
    if (!locale.id) {
      throw new Error("Failed to verify default locale.");
    }
    return locale;
  }

  const { data: createdLocaleRaw, error: createLocaleError } = await getSupabaseServer()
    .from("locales")
    .insert({
      organization_id: params.organizationId,
      code: normalizedCode,
      name: params.localeName,
      is_active: true,
    })
    .select("id")
    .single();
  const createdLocale = createdLocaleRaw as { id: string } | null;

  if (createLocaleError || !createdLocale?.id) {
    throw new Error("Failed to create default locale.");
  }

  return createdLocale;
}

async function resolveLocaleCatalogEntry(localeCode: string): Promise<{ code: string; name: string } | null> {
  const normalizedCode = localeCode.trim();
  if (!normalizedCode) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (getSupabaseServer() as any)
    .from("locale_catalog")
    .select("code,name")
    .eq("code", normalizedCode)
    .eq("is_active", true)
    .maybeSingle();

  if (error && error.code !== "42P01") {
    throw new Error("Failed to verify default content locale.");
  }

  if (data?.code && data?.name) {
    return { code: data.code, name: data.name };
  }

  const fallback = DEFAULT_LOCALE_CATALOG.find((entry) => entry.code === normalizedCode);
  return fallback ? { code: fallback.code, name: fallback.name } : null;
}

async function seedDefaultMarketForWorkspace(params: {
  organizationId: string;
  countryCode: string;
  defaultLocaleCode?: string | null;
}): Promise<{ localeId: string | null }> {
  const normalizedCountryCode = params.countryCode.trim().toUpperCase();
  const { data: countryRaw, error: countryError } = await getSupabaseServer()
    .from("countries")
    .select("code, name")
    .eq("code", normalizedCountryCode)
    .maybeSingle();
  const country = countryRaw as { code: string; name: string } | null;

  if (countryError || !country) {
    throw new Error("Selected default market country is not supported.");
  }

  const preset = MARKET_PRESETS[normalizedCountryCode] || { currencyCode: null, timezone: null };

  const { data: marketRaw, error: marketError } = await getSupabaseServer()
    .from("markets")
    .insert({
      organization_id: params.organizationId,
      code: normalizedCountryCode,
      name: country.name,
      is_default: true,
      currency_code: preset.currencyCode,
      timezone: preset.timezone,
      is_active: true,
    })
    .select("id")
    .single();
  const market = marketRaw as { id: string } | null;

  if (marketError || !market) {
    throw new Error("Failed to create default market.");
  }

  const { data: countryLocalesRaw, error: countryLocalesError } = await getSupabaseServer()
    .from("country_locales")
    .select("locale_code, locale_name, is_primary")
    .eq("country_code", normalizedCountryCode)
    .order("is_primary", { ascending: false })
    .order("locale_name", { ascending: true });
  const countryLocales = (countryLocalesRaw || []) as Array<{
    locale_code: string;
    locale_name: string;
    is_primary: boolean;
  }>;

  if (countryLocalesError) {
    throw new Error("Failed to load primary locale for default market.");
  }

  const explicitLocaleCode =
    typeof params.defaultLocaleCode === "string" && params.defaultLocaleCode.trim().length > 0
      ? params.defaultLocaleCode.trim()
      : null;
  const explicitLocale = explicitLocaleCode
    ? await resolveLocaleCatalogEntry(explicitLocaleCode)
    : null;

  const primaryLocale = countryLocales?.[0] || null;
  const seededLocale =
    explicitLocale ||
    (primaryLocale
      ? {
          code: primaryLocale.locale_code,
          name: primaryLocale.locale_name,
        }
      : null);
  if (!seededLocale) {
    return { localeId: null };
  }

  const locale = await ensureOrganizationLocale({
    organizationId: params.organizationId,
    localeCode: seededLocale.code,
    localeName: seededLocale.name,
  });

  const { error: marketLocaleError } = await getSupabaseServer()
    .from("market_locales")
    .upsert(
      {
        market_id: market.id,
        locale_id: locale.id,
        is_active: true,
      },
      { onConflict: "market_id,locale_id" }
    );

  if (marketLocaleError) {
    throw new Error("Failed to assign default locale to default market.");
  }

  const { error: updateMarketError } = await getSupabaseServer()
    .from("markets")
    .update({ default_locale_id: locale.id })
    .eq("id", market.id);

  if (updateMarketError) {
    throw new Error("Failed to finalize default market locale settings.");
  }

  return { localeId: locale.id };
}

async function seedLocalizationDefaultsForWorkspace(params: {
  organizationId: string;
  defaultLocaleId: string | null;
  userId: string;
}) {
  const metadata =
    params.defaultLocaleId && params.defaultLocaleId.trim().length > 0
      ? ({ default_locale_id: params.defaultLocaleId.trim() } as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const { error } = await getSupabaseServer()
    .from("organization_localization_settings")
    .upsert(
      {
        organization_id: params.organizationId,
        translation_enabled: false,
        write_assist_enabled: false,
        deepl_glossary_id: null,
        brand_instructions: "",
        preferred_tone: "neutral",
        metadata: metadata as unknown as Database["public"]["Tables"]["organization_localization_settings"]["Insert"]["metadata"],
        created_by: params.userId,
        updated_by: params.userId,
      },
      { onConflict: "organization_id" }
    );

  if (error) {
    throw new Error("Failed to seed localization defaults.");
  }
}

// POST /api/workspaces/create
// Create a new workspace
export async function POST(request: NextRequest) {
  try {
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    const userId = typeof user.id === "string" ? user.id.trim() : "";
    const userEmail = typeof user.email === "string" ? user.email : "";

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      name,
      slug,
      industry,
      teamSize,
      organization_type = 'brand',
      partner_category = null,
      default_market_country_code,
      default_content_locale_code,
      default_ui_locale,
    } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Name and slug are required" },
        { status: 400 }
      );
    }

    const normalizedDefaultMarketCountryCode =
      typeof default_market_country_code === "string" && default_market_country_code.trim().length > 0
        ? default_market_country_code.trim().toUpperCase()
        : DEFAULT_MARKET_COUNTRY_CODE;

    if (!/^[A-Z]{2}$/.test(normalizedDefaultMarketCountryCode)) {
      return NextResponse.json(
        { error: "default_market_country_code must be a 2-letter country code." },
        { status: 400 }
      );
    }

    const normalizedDefaultContentLocaleCode =
      typeof default_content_locale_code === "string" && default_content_locale_code.trim().length > 0
        ? default_content_locale_code.trim()
        : null;

    if (!normalizedDefaultContentLocaleCode) {
      return NextResponse.json(
        { error: "default_content_locale_code is required." },
        { status: 400 }
      );
    }

    const defaultContentLocale = await resolveLocaleCatalogEntry(normalizedDefaultContentLocaleCode);
    if (!defaultContentLocale) {
      return NextResponse.json(
        { error: "default_content_locale_code must be a valid locale catalog code." },
        { status: 400 }
      );
    }

    const normalizedDefaultUiLocaleCandidate = normalizeUiLocale(default_ui_locale);
    if (default_ui_locale !== undefined && default_ui_locale !== null && !normalizedDefaultUiLocaleCandidate) {
      return NextResponse.json(
        { error: "default_ui_locale must be one of the supported UI locales." },
        { status: 400 }
      );
    }
    const normalizedDefaultUiLocale = normalizedDefaultUiLocaleCandidate ?? DEFAULT_UI_LOCALE;

    // Validate organization_type
    if (!['brand', 'partner'].includes(organization_type)) {
      return NextResponse.json(
        { error: "Organization type must be 'brand' or 'partner'" },
        { status: 400 }
      );
    }

    const normalizedPartnerCategory =
      typeof partner_category === "string" && partner_category.trim().length > 0
        ? partner_category.trim().toLowerCase()
        : null;
    const validPartnerCategories = ["retailer", "distributor", "wholesaler"];

    if (organization_type === "partner" && !normalizedPartnerCategory) {
      return NextResponse.json(
        { error: "Partner business type is required for partner workspaces." },
        { status: 400 }
      );
    }

    if (
      normalizedPartnerCategory &&
      !validPartnerCategories.includes(normalizedPartnerCategory)
    ) {
      return NextResponse.json(
        { error: "partner_category must be one of: retailer, distributor, wholesaler" },
        { status: 400 }
      );
    }

    console.log('🏢 Creating workspace:', { name, slug, organization_type, userId });

    let organization;
    let kindeOrgId;

    try {
      // Step 1: Create organization in Kinde
      console.log('Creating organization in Kinde:', { name, slug });
      const kindeOrg = await kindeAPI.createOrganization({
        name,
        code: `org_${crypto.randomUUID()}`,
        external_id: slug,
      });

      if (!kindeOrg || !kindeOrg.code) {
        throw new Error('Failed to get Kinde organization ID');
      }

      kindeOrgId = kindeOrg.code;
      console.log('✅ Kinde organization created:', kindeOrgId);

      // Step 2: Create organization in getSupabaseServer()
      organization = await db.createWorkspace({
        name,
        slug,
        kindeOrgId,
        industry,
        teamSize,
        defaultUiLocale: normalizedDefaultUiLocale,
        organizationType: organization_type,
        partnerCategory:
          organization_type === "partner"
            ? (normalizedPartnerCategory as "retailer" | "distributor" | "wholesaler")
            : null,
      });

      if (!organization) {
        throw new Error('Failed to create workspace in getSupabaseServer()');
      }

      console.log('✅ getSupabaseServer() workspace created:', organization.id);
      await ensureCoreBasicInformationFields(getSupabaseServer(), organization.id);
      const baselineSeed = await seedDefaultMarketForWorkspace({
        organizationId: organization.id,
        countryCode: normalizedDefaultMarketCountryCode,
        defaultLocaleCode: defaultContentLocale.code,
      });
      await seedLocalizationDefaultsForWorkspace({
        organizationId: organization.id,
        defaultLocaleId: baselineSeed.localeId,
        userId,
      });

      // Step 3: Add user to organization in Kinde
      if (kindeOrgId) {
        try {
          console.log('Adding user to organization in Kinde');
          await kindeAPI.addUserToOrganization(kindeOrgId, userId);
          console.log('✅ User successfully added to organization in Kinde');
        } catch (error) {
          console.warn('❌ Failed to add user to organization in Kinde:', error);
          throw new Error('Failed to add user to organization in Kinde');
        }
      }

      // Step 4: Add user to organization_members table as owner
      try {
        console.log('Adding user to organization_members table as workspace owner');

        const { data: memberDataRaw, error: memberError } = await getSupabaseServer()
          .from('organization_members')
          .insert({
            organization_id: organization.id,
            kinde_user_id: userId,
            email: userEmail,
            role: 'owner',
            status: 'active',
            invited_by: userId  // Self-reference: workspace owner invited themselves
          })
          .select()
          .single();
        const memberData = memberDataRaw as { id: string } | null;

        if (memberError || !memberData) {
          console.error('Failed to add user to organization_members:', memberError);
          throw new Error('Failed to create workspace member record');
        }

        console.log('✅ User successfully added to organization_members as owner:', memberData.id);
      } catch (error) {
        console.error('Error adding user to organization_members:', error);
        throw new Error('Failed to create workspace member record');
      }

      if (userEmail) {
        try {
          await sendWelcomeSignupEmail({
            to: userEmail,
            organizationName: organization.name,
            recipientName:
              typeof user.given_name === "string" && user.given_name.trim().length > 0
                ? user.given_name
                : typeof user.family_name === "string" && user.family_name.trim().length > 0
                  ? user.family_name
                  : null,
          });
        } catch (welcomeEmailError) {
          console.error("Failed to send welcome signup email:", welcomeEmailError);
        }

        try {
          await sendNewSignupNotification({
            signupEmail: userEmail,
            organizationName: organization.name,
          });
        } catch (notificationError) {
          console.error("Failed to send new signup notification:", notificationError);
        }
      }

    } catch (error) {
      console.error('Error during workspace creation:', error);
      
      // Rollback: Clean up created resources
      if (organization && organization.id) {
        try {
          // Clean up organization_members
          await getSupabaseServer()
            .from('organization_members')
            .delete()
            .eq('organization_id', organization.id);
          
          // Clean up organization
          await getSupabaseServer()
            .from('organizations')
            .delete()
            .eq('id', organization.id);
        } catch (cleanupError) {
          console.error('Failed to cleanup after error:', cleanupError);
        }
      }

      if (kindeOrgId) {
        try {
          await kindeAPI.deleteOrganization(kindeOrgId);
        } catch (kindeCleanupError) {
          console.error('Failed to cleanup Kinde organization:', kindeCleanupError);
        }
      }

      if (error instanceof Error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      } else {
        return NextResponse.json(
          { error: "Failed to create workspace" },
          { status: 500 }
        );
      }
    }

    // Return success response
    const response = NextResponse.json({
      success: true,
      data: {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          kinde_org_id: kindeOrgId,
          type: organization.type,
          organization_type: organization.organizationType || organization.type,
          partner_category: organization.partnerCategory ?? null,
          default_ui_locale: organization.defaultUiLocale || normalizedDefaultUiLocale,
        }
      },
      message: "Workspace created successfully"
    });

    response.cookies.set(UI_LOCALE_COOKIE_NAME, normalizedDefaultUiLocale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;

  } catch (error) {
    console.error("Workspace creation error:", error);
    return NextResponse.json(
      { error: "Failed to create workspace" },
      { status: 500 }
    );
  }
}





