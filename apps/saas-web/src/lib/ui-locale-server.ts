import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import {
  DEFAULT_UI_LOCALE,
  type UiLocale,
  normalizeUiLocale,
  resolveLocaleFromAcceptLanguage,
} from "@/lib/ui-locales";
import { getSupabaseServer } from "@/lib/supabase";

export async function resolveTenantUiLocale(params: {
  tenantSlug: string;
  acceptLanguageHeader?: string | null;
}): Promise<UiLocale> {
  const tenantSlug = params.tenantSlug.trim().toLowerCase();
  if (!tenantSlug) {
    return resolveLocaleFromAcceptLanguage(params.acceptLanguageHeader ?? null) ?? DEFAULT_UI_LOCALE;
  }

  const { data: organizationRow, error: organizationError } = await getSupabaseServer()
    .from("organizations")
    .select("id,default_ui_locale")
    .eq("slug", tenantSlug)
    .maybeSingle();

  if (organizationError || !organizationRow?.id) {
    return resolveLocaleFromAcceptLanguage(params.acceptLanguageHeader ?? null) ?? DEFAULT_UI_LOCALE;
  }

  const workspaceDefault =
    normalizeUiLocale(organizationRow.default_ui_locale) ?? DEFAULT_UI_LOCALE;

  let memberOverride: UiLocale | null = null;
  try {
    const { getUser } = getKindeServerSession();
    const user = await getUser();
    if (user?.id) {
      const { data: memberRow } = await getSupabaseServer()
        .from("organization_members")
        .select("ui_locale_override")
        .eq("organization_id", organizationRow.id)
        .eq("kinde_user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      memberOverride = normalizeUiLocale(memberRow?.ui_locale_override);
    }
  } catch {
    // Ignore auth/session errors and continue with workspace default.
  }

  return (
    memberOverride ??
    workspaceDefault ??
    resolveLocaleFromAcceptLanguage(params.acceptLanguageHeader ?? null) ??
    DEFAULT_UI_LOCALE
  );
}
