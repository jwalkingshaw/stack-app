import type { PageContentMode } from "@/components/ui/page-content-container";

export type SettingsPageKey =
  | "organization"
  | "billing"
  | "channels"
  | "destinations"
  | "output-profiles"
  | "output-profile-detail"
  | "markets"
  | "localization"
  | "sets"
  | "product-fields"
  | "product-field-detail"
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
  helperIntro: string;
};

const DEFAULT_SETTINGS_WIDTH_CONFIG: SettingsWidthConfig = {
  mode: "form",
  defaultClassName: "space-y-6",
  helperIntro: "Review and update this settings area for your workspace.",
};

const SETTINGS_WIDTH_MAP: Record<SettingsPageKey, SettingsWidthConfig> = {
  organization: {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Update your workspace name, branding, and core business details.",
  },
  billing: {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Check your plan, usage, and billing details in one place.",
  },
  channels: {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Create and manage the channels your team publishes to.",
  },
  destinations: {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Set where approved content gets delivered and shared.",
  },
  "output-profiles": {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Configure the channels you publish product content to.",
  },
  "output-profile-detail": {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Add fields and mark which are required — this drives readiness scores before syndication.",
  },
  markets: {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Manage your markets and control the default market for the workspace.",
  },
  localization: {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Set how language and translation work across your content.",
  },
  sets: {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Create reusable saved scopes for products or assets, then publish or deliver them from Syndication.",
  },
  "product-fields": {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Manage the fields your team uses to capture product data.",
  },
  "product-field-detail": {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "",
  },
  "field-groups": {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Organize fields into groups so data entry stays clear and consistent.",
  },
  "product-families": {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Define family structures so related products follow the same setup.",
  },
  "field-group-detail": {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Review and adjust this field group to keep forms easy to use.",
  },
  "field-group-edit": {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Update this field group's basic details and organization.",
  },
  "product-family-detail": {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Manage this family so products stay aligned to the same model.",
  },
  team: {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Invite people, manage access, and keep team responsibilities clear.",
  },
  "team-member-detail": {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Review this member's role and workspace access.",
  },
  "team-partner-detail": {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Manage this partner's relationship, access summaries, and portal delivery context.",
  },
  "team-invite": {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Choose the right invite path so new users get the right access quickly.",
  },
  "team-invite-wizard": {
    mode: "form",
    defaultClassName: "space-y-6",
    helperIntro: "Complete the invite details to send access to the right person.",
  },
};

export function getSettingsWidthConfig(page: SettingsPageKey): SettingsWidthConfig {
  return SETTINGS_WIDTH_MAP[page] || DEFAULT_SETTINGS_WIDTH_CONFIG;
}
