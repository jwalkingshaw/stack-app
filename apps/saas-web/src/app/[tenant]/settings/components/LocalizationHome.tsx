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
      id: 'defaults',
      title: 'Workspace Defaults',
      subtitle: 'Translation controls, tone, glossary, and brand instructions.',
      href: `/${tenantSlug}/settings/localization/defaults`,
      statusTone: 'neutral',
      statusLabel: 'Configure',
      metadataLabel: 'Workspace controls',
    },
    {
      id: 'glossaries',
      title: 'Glossaries',
      subtitle: 'Manage brand terminology used in translation and writing assistance.',
      href: `/${tenantSlug}/settings/localization/glossaries`,
      statusTone: 'info',
      statusLabel: 'Manage',
      metadataLabel: 'Terminology',
    },
    {
      id: 'activity',
      title: 'Translation Activity',
      subtitle: 'Create runs, monitor progress, and review generated translations.',
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
        <p className="text-muted-foreground">
          Choose an area to manage translations and writing assistance.
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
