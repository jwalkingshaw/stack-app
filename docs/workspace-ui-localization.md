# Workspace UI Localization Workflow

## Stack
- Runtime i18n: `next-intl`
- Source locale: `apps/saas-web/messages/en-US.json`
- Initial target locale: `apps/saas-web/messages/es-MX.json`
- Localization platform: Crowdin (`.crowdin.yml`)
- MT pre-translation: DeepL in Crowdin workflow (human review before merge)

## Locale Resolution
Tenant pages resolve UI locale in this order:
1. `organization_members.ui_locale_override`
2. `organizations.default_ui_locale`
3. `Accept-Language` best match
4. `en-US`

Non-tenant pages use:
1. `tt_locale` cookie
2. `Accept-Language` best match
3. `en-US`

## CI Guardrails
- `npm run i18n:check` validates locale key parity between `en-US` and `es-MX`.
- CI runs this check in `.github/workflows/ci.yml`.

## API Surface
- `POST /api/workspaces/create` accepts `default_ui_locale`.
- `GET/PATCH /api/[tenant]/settings/organization` returns and updates `defaultUiLocale`.
- `GET/PATCH /api/[tenant]/settings/preferences` manages per-member `uiLocaleOverride`.

## v1 Scope
- UI language only (`en-US`, `es-MX`) for shell/onboarding/settings.
- Product/content translation remains in existing DeepL localization job workflows.
