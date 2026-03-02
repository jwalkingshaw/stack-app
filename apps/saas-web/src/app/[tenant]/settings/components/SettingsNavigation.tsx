'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  Building2,
  Users,
  CreditCard,
  Database,
  Bell,
  Shield,
  Key,
  Package,
  Grid3X3,
  Layers,
  Globe,
  Languages,
  ArrowLeft,
  Link2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkspaceRail } from '@/components/WorkspaceRail';

interface SettingsSection {
  id: string;
  label: string;
  icon: string;
  href: string;
  description: string;
}

interface SafeUser {
  id: string;
  email: string;
  given_name: string | null;
  family_name: string | null;
  picture: string | null;
}

interface SafeOrganization {
  id: string;
  name: string;
  slug: string;
  type: "brand" | "partner";
  partnerCategory: "retailer" | "distributor" | "wholesaler" | null;
  storageUsed: number;
  storageLimit: number;
}

interface SettingsNavigationProps {
  tenantSlug: string;
  organization?: SafeOrganization | null;
  user?: SafeUser | null;
}

const settingsSections: SettingsSection[] = [
  {
    id: "organization",
    label: "Organization",
    icon: "Building2",
    href: "",
    description: "Basic organization information and branding"
  },
  {
    id: "product-families",
    label: "Product Models",
    icon: "Package",
    href: "/product-models",
    description: "Define product models, groups, and variant axes"
  },
  {
    id: "field-groups",
    label: "Attribute Groups",
    icon: "Layers",
    href: "/field-groups",
    description: "Group related attributes for product models"
  },
  {
    id: "product-fields",
    label: "Attributes",
    icon: "Grid3X3",
    href: "/product-fields",
    description: "Define custom attributes for product data"
  },
  {
    id: "markets",
    label: "Markets",
    icon: "Globe",
    href: "/markets",
    description: "Define markets (countries) and languages"
  },
  {
    id: "localization",
    label: "Localization",
    icon: "Languages",
    href: "/localization",
    description: "Configure translation defaults and review localization jobs"
  },
  {
    id: "channels",
    label: "Channels",
    icon: "Layers",
    href: "/channels",
    description: "Define where product content is distributed"
  },
  {
    id: "destinations",
    label: "Destinations",
    icon: "Globe",
    href: "/destinations",
    description: "Define market and platform-specific publish endpoints"
  },
  {
    id: "team",
    label: "Team",
    icon: "Users",
    href: "/team",
    description: "Manage team members and permissions"
  },
  {
    id: "sets",
    label: "Sets",
    icon: "Link2",
    href: "/sets",
    description: "Manage reusable DAM/PIM sets"
  },
  {
    id: "billing",
    label: "Billing",
    icon: "CreditCard",
    href: "/billing",
    description: "Subscription and payment settings"
  },
  {
    id: "storage",
    label: "Storage",
    icon: "Database",
    href: "/storage",
    description: "File storage and usage limits"
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: "Bell",
    href: "/notifications",
    description: "Email and push notification preferences"
  },
  {
    id: "security",
    label: "Security",
    icon: "Shield",
    href: "/security",
    description: "Two-factor authentication and access logs"
  },
  {
    id: "api",
    label: "API Keys",
    icon: "Key",
    href: "/api-keys",
    description: "Manage API keys for integrations"
  }
];

const iconMap = {
  Building2,
  Users,
  CreditCard,
  Database,
  Bell,
  Shield,
  Key,
  Package,
  Grid3X3,
  Layers,
  Globe,
  Languages,
  Link2
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function SettingsNavigation({
  tenantSlug,
  organization,
  user
}: SettingsNavigationProps) {
  const pathname = usePathname();

  const getFullHref = (section: SettingsSection) => {
    return `/${tenantSlug}/settings${section.href}`;
  };

  const isActive = (section: SettingsSection) => {
    const fullHref = getFullHref(section);
    if (section.href === '') {
      // For the root settings page, only match exact path
      return pathname === `/${tenantSlug}/settings`;
    }
    return pathname === fullHref || pathname.startsWith(`${fullHref}/`);
  };

  const storagePercentage = organization && organization.storageLimit > 0
    ? (organization.storageUsed / organization.storageLimit) * 100
    : 0;
  const showWorkspaceRail = organization?.type === "partner";
  const visibleSections = settingsSections;

  return (
    <div className="bg-[#f5f5f5] h-full flex">
      {showWorkspaceRail ? (
        <WorkspaceRail
          currentWorkspaceSlug={tenantSlug}
          currentWorkspaceName={organization?.name || tenantSlug}
          currentPath={pathname}
        />
      ) : null}

      <div className="h-full flex flex-col w-48">
        {/* Back to App Button - aligned with Settings header */}
        <div className="px-2 py-4">
          <Link href={`/${tenantSlug}`}>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 px-3 py-2 text-sm font-normal"
            >
              <ArrowLeft className="h-4 w-4 flex-shrink-0" />
              Back to app
            </Button>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2">
          <div className="space-y-0.5">
            {visibleSections.map((section) => {
              const Icon = iconMap[section.icon as keyof typeof iconMap];
              const active = isActive(section);

              return (
                <Link
                  key={section.id}
                  href={getFullHref(section)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm font-normal rounded-md transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{section.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Storage Stats - matches SaaSSidebar */}
        {organization && organization.storageLimit > 0 && (
          <div className="p-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Storage</span>
              </div>

              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{formatFileSize(organization.storageUsed)}</span>
                <span>{formatFileSize(organization.storageLimit)}</span>
              </div>

              <div className="w-full bg-muted rounded-sm h-1.5 overflow-hidden">
                <div
                  className="bg-primary h-1.5 rounded-sm transition-all duration-300"
                  style={{ width: `${Math.min(storagePercentage, 100)}%` }}
                />
              </div>

              {storagePercentage > 90 && (
                <Button variant="outline" size="sm" className="w-full mt-2 text-xs">
                  Upgrade
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
