'use client';

import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { ItemList } from '@/components/ui/item-list';
import { SettingsPageContent } from './settings-page-content';

interface LocalizationHomeProps {
  tenantSlug: string;
}

type LocalizationFeature = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  statusTone: 'neutral' | 'info';
  statusLabel: string;
  metadataLabel: string;
};

export default function LocalizationHome({ tenantSlug }: LocalizationHomeProps) {
  const router = useRouter();
  const features: LocalizationFeature[] = [
    {
      id: 'locales',
      title: 'Locales',
      subtitle: 'Manage active organization locales and the default content locale used across Product Detail and Syndication.',
      href: `/${tenantSlug}/settings/localization/defaults?focus=locales`,
      statusTone: 'neutral',
      statusLabel: 'Manage',
      metadataLabel: 'Locale governance',
    },
    {
      id: 'adaptation',
      title: 'Adaptation',
      subtitle: 'Set shared tone and brand instructions for AI-assisted locale adaptation and rewriting.',
      href: `/${tenantSlug}/settings/localization/defaults?focus=adaptation`,
      statusTone: 'neutral',
      statusLabel: 'Manage',
      metadataLabel: 'AI adaptation',
    },
    {
      id: 'glossaries',
      title: 'Glossaries',
      subtitle: 'Manage terminology used across locale adaptation, translation, and writing assistance.',
      href: `/${tenantSlug}/settings/localization/glossaries`,
      statusTone: 'info',
      statusLabel: 'Manage',
      metadataLabel: 'Terminology',
    },
    {
      id: 'activity',
      title: 'Translation Activity',
      subtitle: 'Create locale adaptation runs, monitor progress, and review generated content.',
      href: `/${tenantSlug}/settings/localization/activity`,
      statusTone: 'info',
      statusLabel: 'Open',
      metadataLabel: 'Runs and review',
    },
  ];

  return (
    <SettingsPageContent page="localization" modeOverride="form">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Localization</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Source of truth for locale adaptation. Manage locales, adaptation defaults, terminology, and activity here.
        </p>
      </div>

      <ItemList
        items={features}
        getKey={(item) => item.id}
        renderTitle={(item) => item.title}
        renderSubtitle={(item) => item.subtitle}
        renderRight={(item) => (
          <div className="flex items-center gap-2">
            <Badge variant={item.statusTone}>{item.statusLabel}</Badge>
            <Badge variant="secondary">{item.metadataLabel}</Badge>
          </div>
        )}
        onClickItem={(item) => router.push(item.href)}
        loading={false}
        loadingRows={3}
        headerLabel="localization areas"
        className="w-full"
      />
    </SettingsPageContent>
  );
}
