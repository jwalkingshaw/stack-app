import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { resolveTenantUiLocale } from "@/lib/ui-locale-server";
import {
  DEFAULT_UI_LOCALE,
  UI_LOCALE_COOKIE_NAME,
  normalizeUiLocale,
  resolveLocaleFromAcceptLanguage,
} from "@/lib/ui-locales";

export default getRequestConfig(async () => {
  const headerStore = await headers();
  const cookieStore = await cookies();

  const tenantSlug = (headerStore.get("x-tenant-slug") || "").trim().toLowerCase();
  const acceptLanguage = headerStore.get("accept-language");

  const locale = tenantSlug
    ? await resolveTenantUiLocale({
        tenantSlug,
        acceptLanguageHeader: acceptLanguage,
      })
    : normalizeUiLocale(cookieStore.get(UI_LOCALE_COOKIE_NAME)?.value) ??
      resolveLocaleFromAcceptLanguage(acceptLanguage) ??
      DEFAULT_UI_LOCALE;

  let messages: Record<string, unknown>;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    messages = (await import(`../../messages/${DEFAULT_UI_LOCALE}.json`)).default;
  }

  return {
    locale,
    messages,
  };
});
