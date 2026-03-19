'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  Building2,
  Users,
  CreditCard,
  Package,
  Grid3X3,
  Layers,
  Globe,
  Languages,
  Link2
} from 'lucide-react';
import { BackLinkButton } from '@/components/ui/back-link-button';
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
  logoUrl?: string | null;
  storageUsed: number;
  storageLimit: number;
}

interface SettingsNavigationProps {
  tenantSlug: string;
  organization?: SafeOrganization | null;
  user?: SafeUser | null;
  planId?: string;
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
  }
];

const iconMap = {
  Building2,
  Users,
  CreditCard,
  Package,
  Grid3X3,
  Layers,
  Globe,
  Languages,
  Link2
};

export default function SettingsNavigation({
  tenantSlug,
  organization,
  planId,
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

  const showWorkspaceRail = organization?.type === "partner";
  const isStarter = planId === 'starter';
  const visibleSections = settingsSections.filter((s) => {
    if (s.id === 'localization' && isStarter) return false;
    return true;
  });

  return (
    <div className="bg-[#f5f5f5] h-full flex">
      {showWorkspaceRail ? (
        <WorkspaceRail
          currentWorkspaceSlug={tenantSlug}
          currentWorkspaceName={organization?.name || tenantSlug}
          currentWorkspaceLogoUrl={organization?.logoUrl ?? null}
          currentPath={pathname}
        />
      ) : null}

      <div className="h-full flex flex-col w-48">
        <div className="px-2 py-3">
          <BackLinkButton href={`/${tenantSlug}`} label="Back to app" fullWidth icon="chevron" />
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

      </div>
    </div>
  );
}
