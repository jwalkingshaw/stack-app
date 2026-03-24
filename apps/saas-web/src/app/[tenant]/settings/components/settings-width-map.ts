import type { PageContentMode } from "@/components/ui/page-content-container";

export type SettingsPageKey =
  | "organization"
  | "billing"
  | "channels"
  | "destinations"
  | "markets"
  | "localization"
  | "sets"
  | "product-fields"
  | "field-groups"
  | "product-families"
  | "field-group-detail"
  | "field-group-edit"
  | "product-family-detail"
  | "team"
  | "team-member-detail"
  | "team-partner-detail"
  | "team-invite"
  | "team-invite-wizard";

type SettingsWidthConfig = {
  mode: PageContentMode;
  defaultClassName: string;
};

const DEFAULT_SETTINGS_WIDTH_CONFIG: SettingsWidthConfig = {
  mode: "form",
  defaultClassName: "space-y-6",
};

const SETTINGS_WIDTH_MAP: Record<SettingsPageKey, SettingsWidthConfig> = {
  organization: { mode: "form", defaultClassName: "space-y-6" },
  billing: { mode: "form", defaultClassName: "space-y-6" },
  channels: { mode: "form", defaultClassName: "space-y-6" },
  destinations: { mode: "form", defaultClassName: "space-y-6" },
  markets: { mode: "form", defaultClassName: "space-y-6" },
  localization: { mode: "form", defaultClassName: "space-y-6" },
  sets: { mode: "form", defaultClassName: "space-y-6" },
  "product-fields": { mode: "form", defaultClassName: "space-y-6" },
  "field-groups": { mode: "form", defaultClassName: "space-y-6" },
  "product-families": { mode: "form", defaultClassName: "space-y-6" },
  "field-group-detail": { mode: "form", defaultClassName: "space-y-6" },
  "field-group-edit": { mode: "form", defaultClassName: "space-y-6" },
  "product-family-detail": { mode: "form", defaultClassName: "space-y-6" },
  team: { mode: "form", defaultClassName: "space-y-6" },
  "team-member-detail": { mode: "form", defaultClassName: "space-y-6" },
  "team-partner-detail": { mode: "form", defaultClassName: "space-y-6" },
  "team-invite": { mode: "form", defaultClassName: "space-y-6" },
  "team-invite-wizard": { mode: "form", defaultClassName: "space-y-6" },
};

export function getSettingsWidthConfig(page: SettingsPageKey): SettingsWidthConfig {
  return SETTINGS_WIDTH_MAP[page] || DEFAULT_SETTINGS_WIDTH_CONFIG;
}
