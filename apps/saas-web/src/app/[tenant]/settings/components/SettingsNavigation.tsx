'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
  Link2,
  Zap,
} from 'lucide-react';
import { BackLinkButton } from '@/components/ui/back-link-button';
import { WorkspaceRail } from '@/components/WorkspaceRail';

interface SettingsSection {
  id: string;
  icon: string;
  href: string;
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
    icon: "Building2",
    href: "",
  },
  {
    id: "product-families",
    icon: "Package",
    href: "/product-models",
  },
  {
    id: "field-groups",
    icon: "Layers",
    href: "/field-groups",
  },
  {
    id: "product-fields",
    icon: "Grid3X3",
    href: "/product-fields",
  },
  {
    id: "markets",
    icon: "Globe",
    href: "/markets",
  },
  {
    id: "localization",
    icon: "Languages",
    href: "/localization",
  },
  {
    id: "output-profiles",
    icon: "Zap",
    href: "/output-profiles",
  },
  {
    id: "team",
    icon: "Users",
    href: "/team",
  },
  {
    id: "sets",
    icon: "Link2",
    href: "/sets",
  },
  {
    id: "billing",
    icon: "CreditCard",
    href: "/billing",
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
  Link2,
  Zap,
};

export default function SettingsNavigation({
  tenantSlug,
  organization,
  planId,
}: SettingsNavigationProps) {
  const t = useTranslations("Settings.Navigation");
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
          currentOrganizationType={organization?.type}
          currentPath={pathname}
        />
      ) : null}

      <div className="h-full flex flex-col w-48">
        <div className="px-2 py-3">
          <BackLinkButton href={`/${tenantSlug}`} label={t("backToApp")} fullWidth icon="chevron" />
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
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{t(`sections.${section.id}`)}</span>
                </Link>
              );
            })}
          </div>
        </nav>

      </div>
    </div>
  );
}
