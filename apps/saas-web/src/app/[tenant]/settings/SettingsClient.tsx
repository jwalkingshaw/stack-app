'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Users,
  CreditCard,
  Database,
  Bell,
  Shield,
  Key,
  Download,
  Package,
  Grid3X3,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import OrganizationSettings from './components/OrganizationSettings';
import ProductFamiliesSettings from './components/ProductFamiliesSettings';
import FieldGroupsSettings from './components/FieldGroupsSettings';
import ProductFieldsSettings from './components/ProductFieldsSettings';

interface SettingsClientProps {
  tenantSlug: string;
}

const settingsSections = [
  {
    id: "organization",
    label: "Organization",
    icon: Building2,
    description: "Basic organization information and branding"
  },
  {
    id: "product-families",
    label: "Product Models",
    icon: Package,
    description: "Define product models with groups and variant axes"
  },
  {
    id: "product-fields",
    label: "Attributes",
    icon: Grid3X3,
    description: "Define custom attributes for product data"
  },
  {
    id: "field-groups",
    label: "Attribute Groups",
    icon: Layers,
    description: "Group related attributes for better organization"
  },
  {
    id: "team",
    label: "Team",
    icon: Users,
    description: "Manage team members and permissions"
  },
  {
    id: "billing",
    label: "Billing",
    icon: CreditCard,
    description: "Subscription and payment settings"
  },
  {
    id: "storage",
    label: "Storage",
    icon: Database,
    description: "File storage and usage limits"
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    description: "Email and push notification preferences"
  },
  {
    id: "security",
    label: "Security",
    icon: Shield,
    description: "Two-factor authentication and access logs"
  },
  {
    id: "api",
    label: "API Keys",
    icon: Key,
    description: "Manage API keys for integrations"
  }
];

export default function SettingsClient({ tenantSlug }: SettingsClientProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("organization");

  const renderContent = () => {
    switch (activeSection) {
      case "organization":
        return <OrganizationSettings tenantSlug={tenantSlug} />;
      case "product-families":
        return <ProductFamiliesSettings tenantSlug={tenantSlug} />;
      case "product-fields":
        return <ProductFieldsSettings tenantSlug={tenantSlug} />;
      case "field-groups":
        return <FieldGroupsSettings tenantSlug={tenantSlug} />;
      case "team":
        return <div className="p-8 text-center text-muted-foreground">Team management - Coming soon</div>;
      case "billing":
        return <div className="p-8 text-center text-muted-foreground">Billing settings - Coming soon</div>;
      case "storage":
        return <div className="p-8 text-center text-muted-foreground">Storage settings - Coming soon</div>;
      case "notifications":
        return <div className="p-8 text-center text-muted-foreground">Notification settings - Coming soon</div>;
      case "security":
        return <div className="p-8 text-center text-muted-foreground">Security settings - Coming soon</div>;
      case "api":
        return <div className="p-8 text-center text-muted-foreground">API Keys - Coming soon</div>;
      default:
        return <OrganizationSettings tenantSlug={tenantSlug} />;
    }
  };

  return (
    <div className="max-w-full mx-auto">
      {renderContent()}
    </div>
  );
}
