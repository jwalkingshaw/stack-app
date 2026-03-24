'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import { Building2, Globe, Languages, Save, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsPageContent } from './settings-page-content';
import { toast } from '@/components/ui/toast';
import {
  DEFAULT_UI_LOCALE,
  SUPPORTED_UI_LOCALES,
  UI_LOCALE_LABELS,
  type UiLocale,
} from '@/lib/ui-locales';

interface OrganizationSettingsProps {
  tenantSlug: string;
}

interface OrgSettings {
  name: string;
  website: string;
  description: string;
  logoUrl: string | null;
  defaultUiLocale: UiLocale;
}

interface PreferenceState {
  uiLocaleOverride: UiLocale | null;
  effectiveUiLocale: UiLocale;
  canManageWorkspaceDefault: boolean;
}

const DEFAULT_ORG_SETTINGS: OrgSettings = {
  name: '',
  website: '',
  description: '',
  logoUrl: null,
  defaultUiLocale: DEFAULT_UI_LOCALE,
};

const DEFAULT_PREFERENCE_STATE: PreferenceState = {
  uiLocaleOverride: null,
  effectiveUiLocale: DEFAULT_UI_LOCALE,
  canManageWorkspaceDefault: false,
};

function normalizeUiLocale(value: unknown): UiLocale {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized === 'es-MX') return 'es-MX';
  return DEFAULT_UI_LOCALE;
}

export default function OrganizationSettings({ tenantSlug }: OrganizationSettingsProps) {
  const t = useTranslations('Settings.Organization');

  const [orgSettings, setOrgSettings] = useState<OrgSettings>(DEFAULT_ORG_SETTINGS);
  const [initialSettings, setInitialSettings] = useState<OrgSettings | null>(null);
  const [preferences, setPreferences] = useState<PreferenceState>(DEFAULT_PREFERENCE_STATE);
  const [initialPreferences, setInitialPreferences] = useState<PreferenceState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOrganizationSettings() {
      setIsLoading(true);
      setInitialSettings(null);
      try {
        const organizationResponse = await fetch(`/api/${tenantSlug}/settings/organization`, {
          cache: 'no-store',
        });

        if (!organizationResponse.ok) {
          throw new Error('Failed to load organization settings');
        }

        const organizationPayload = await organizationResponse.json();

        const nextSettings: OrgSettings = {
          name: organizationPayload?.organization?.name ?? '',
          website: organizationPayload?.organization?.website ?? '',
          description: organizationPayload?.organization?.description ?? '',
          logoUrl: organizationPayload?.organization?.logoUrl ?? null,
          defaultUiLocale: normalizeUiLocale(organizationPayload?.organization?.defaultUiLocale),
        };

        if (!cancelled) {
          setOrgSettings(nextSettings);
          setInitialSettings(nextSettings);
          setLogoLoadFailed(false);
        }
      } catch (error) {
        console.error('Failed to load organization settings:', error);
        if (!cancelled) {
          toast.error(t('toasts.loadError'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    async function loadPreferenceSettings() {
      setPreferencesLoading(true);
      setInitialPreferences(null);
      try {
        const preferenceResponse = await fetch(`/api/${tenantSlug}/settings/preferences`, {
          cache: 'no-store',
        });

        if (!preferenceResponse.ok) {
          throw new Error('Failed to load language preferences');
        }

        const preferencePayload = await preferenceResponse.json();
        const nextPreferences: PreferenceState = {
          uiLocaleOverride:
            preferencePayload?.preference?.uiLocaleOverride &&
            preferencePayload.preference.uiLocaleOverride === 'es-MX'
              ? 'es-MX'
              : preferencePayload?.preference?.uiLocaleOverride === 'en-US'
              ? 'en-US'
              : null,
          effectiveUiLocale: normalizeUiLocale(preferencePayload?.preference?.effectiveUiLocale),
          canManageWorkspaceDefault: Boolean(
            preferencePayload?.permissions?.canManageWorkspaceDefault
          ),
        };

        if (!cancelled) {
          setPreferences(nextPreferences);
          setInitialPreferences(nextPreferences);
        }
      } catch (error) {
        console.error('Failed to load language preferences:', error);
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : t('toasts.loadError'));
        }
      } finally {
        if (!cancelled) {
          setPreferencesLoading(false);
        }
      }
    }

    void loadOrganizationSettings();
    void loadPreferenceSettings();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, t]);

  const saveOrganizationSettings = async () => {
    const response = await fetch(`/api/${tenantSlug}/settings/organization`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: orgSettings.name,
        website: orgSettings.website,
        description: orgSettings.description,
        logoUrl: orgSettings.logoUrl,
        defaultUiLocale: orgSettings.defaultUiLocale,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to save organization settings');
    }

    const nextSettings: OrgSettings = {
      name: payload?.organization?.name ?? orgSettings.name,
      website: payload?.organization?.website ?? orgSettings.website,
      description: payload?.organization?.description ?? orgSettings.description,
      logoUrl: payload?.organization?.logoUrl ?? orgSettings.logoUrl,
      defaultUiLocale: normalizeUiLocale(payload?.organization?.defaultUiLocale),
    };
    setOrgSettings(nextSettings);
    setInitialSettings(nextSettings);
    setPreferences((current) =>
      current.uiLocaleOverride
        ? current
        : {
            ...current,
            effectiveUiLocale: nextSettings.defaultUiLocale,
          }
    );
    setLogoLoadFailed(false);
  };

  const savePreferenceSettings = async () => {
    const response = await fetch(`/api/${tenantSlug}/settings/preferences`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uiLocaleOverride: preferences.uiLocaleOverride,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to save language preference');
    }

    const nextPreferences: PreferenceState = {
      ...preferences,
      uiLocaleOverride:
        payload?.preference?.uiLocaleOverride &&
        payload.preference.uiLocaleOverride === 'es-MX'
          ? 'es-MX'
          : payload?.preference?.uiLocaleOverride === 'en-US'
          ? 'en-US'
          : null,
      effectiveUiLocale: normalizeUiLocale(payload?.preference?.effectiveUiLocale),
    };
    setPreferences(nextPreferences);
    setInitialPreferences(nextPreferences);
  };

  const handleSaveSettings = async () => {
    if (isSaving) return;

    const hasOrgChanges =
      Boolean(initialSettings) &&
      (orgSettings.name !== initialSettings!.name ||
        orgSettings.website !== initialSettings!.website ||
        orgSettings.description !== initialSettings!.description ||
        orgSettings.logoUrl !== initialSettings!.logoUrl ||
        orgSettings.defaultUiLocale !== initialSettings!.defaultUiLocale);
    const hasPreferenceChanges =
      Boolean(initialPreferences) &&
      preferences.uiLocaleOverride !== initialPreferences!.uiLocaleOverride;

    if (!hasOrgChanges && !hasPreferenceChanges) {
      return;
    }

    setIsSaving(true);
    try {
      if (hasOrgChanges) {
        await saveOrganizationSettings();
      }
      if (hasPreferenceChanges) {
        await savePreferenceSettings();
      }
      toast.success(t('toasts.saveSuccess'));
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error(error instanceof Error ? error.message : t('toasts.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      toast.error(t('toasts.logoTypeError'));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error(t('toasts.logoSizeError'));
      return;
    }

    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/${tenantSlug}/settings/organization/logo`, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to upload logo');
      }

      const logoUrl = typeof payload?.logoUrl === 'string' ? payload.logoUrl : null;
      setOrgSettings((current) => ({ ...current, logoUrl }));
      setInitialSettings((current) => (current ? { ...current, logoUrl } : current));
      setLogoLoadFailed(false);
      toast.success(t('toasts.logoUploaded'));
    } catch (error) {
      console.error('Failed to upload logo:', error);
      toast.error(error instanceof Error ? error.message : t('toasts.logoUploadError'));
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const hasChanges = useMemo(() => {
    const hasOrgChanges = initialSettings
      ? orgSettings.name !== initialSettings.name ||
        orgSettings.website !== initialSettings.website ||
        orgSettings.description !== initialSettings.description ||
        orgSettings.logoUrl !== initialSettings.logoUrl ||
        orgSettings.defaultUiLocale !== initialSettings.defaultUiLocale
      : false;
    const hasPreferenceChanges = initialPreferences
      ? preferences.uiLocaleOverride !== initialPreferences.uiLocaleOverride
      : false;
    return hasOrgChanges || hasPreferenceChanges;
  }, [initialSettings, initialPreferences, orgSettings, preferences.uiLocaleOverride]);

  if (isLoading) {
    return (
      <SettingsPageContent page="organization">
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <LoadingSkeleton size="md" />
          </CardContent>
        </Card>
      </SettingsPageContent>
    );
  }

  return (
    <SettingsPageContent page="organization">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            {t('cards.organization.title')}
          </CardTitle>
          <CardDescription>{t('cards.organization.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                {t('fields.name')}
              </label>
              <input
                type="text"
                value={orgSettings.name}
                onChange={(event) =>
                  setOrgSettings((current) => ({ ...current, name: event.target.value }))
                }
                className="w-full px-3 py-2 border border-input rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                {t('fields.website')}
              </label>
              <input
                type="url"
                value={orgSettings.website}
                onChange={(event) =>
                  setOrgSettings((current) => ({ ...current, website: event.target.value }))
                }
                className="w-full px-3 py-2 border border-input rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="https://yourcompany.com"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              {t('fields.description')}
            </label>
            <textarea
              value={orgSettings.description}
              onChange={(event) =>
                setOrgSettings((current) => ({ ...current, description: event.target.value }))
              }
              className="w-full px-3 py-2 border border-input rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              rows={4}
              placeholder={t('fields.descriptionPlaceholder')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('cards.branding.title')}</CardTitle>
          <CardDescription>{t('cards.branding.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
              {orgSettings.logoUrl && !logoLoadFailed ? (
                <NextImage
                  src={orgSettings.logoUrl}
                  alt={t('cards.branding.logoAlt', {
                    workspace: orgSettings.name || t('cards.branding.workspaceFallback'),
                  })}
                  className="w-14 h-14 rounded-md object-cover"
                  width={56}
                  height={56}
                  unoptimized
                  onError={() => setLogoLoadFailed(true)}
                />
              ) : (
                <Building2 className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                className="hidden"
                onChange={handleLogoFileChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingLogo}
              >
                <Upload className="w-4 h-4 mr-2" />
                {isUploadingLogo ? t('cards.branding.uploading') : t('cards.branding.upload')}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                {t('cards.branding.hint')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="w-5 h-5" />
            {t('cards.language.title')}
          </CardTitle>
          <CardDescription>{t('cards.language.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {preferencesLoading ? (
            <p className="text-xs text-muted-foreground">Loading language preferences...</p>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {t('cards.language.workspaceDefault')}
            </label>
            <Select
              value={orgSettings.defaultUiLocale}
              onValueChange={(value) =>
                {
                  const nextLocale = normalizeUiLocale(value);
                  setOrgSettings((current) => ({
                    ...current,
                    defaultUiLocale: nextLocale,
                  }));
                  setPreferences((current) =>
                    current.uiLocaleOverride
                      ? current
                      : {
                          ...current,
                          effectiveUiLocale: nextLocale,
                        }
                  );
                }
              }
              disabled={preferencesLoading || !preferences.canManageWorkspaceDefault}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_UI_LOCALES.map((locale) => (
                  <SelectItem key={locale} value={locale}>
                    {UI_LOCALE_LABELS[locale]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!preferences.canManageWorkspaceDefault ? (
              <p className="text-xs text-muted-foreground">{t('cards.language.workspaceDefaultLocked')}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {t('cards.language.userOverride')}
            </label>
            <Select
              value={preferences.uiLocaleOverride ?? '__workspace_default__'}
              onValueChange={(value) =>
                setPreferences((current) => ({
                  ...current,
                  uiLocaleOverride:
                    value === '__workspace_default__' ? null : normalizeUiLocale(value),
                  effectiveUiLocale:
                    value === '__workspace_default__'
                      ? orgSettings.defaultUiLocale
                      : normalizeUiLocale(value),
                }))
              }
              disabled={preferencesLoading}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__workspace_default__">
                  {t('cards.language.useWorkspaceDefault')}
                </SelectItem>
                {SUPPORTED_UI_LOCALES.map((locale) => (
                  <SelectItem key={locale} value={locale}>
                    {UI_LOCALE_LABELS[locale]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('cards.language.effectiveLabel', {
                locale: UI_LOCALE_LABELS[preferences.effectiveUiLocale],
              })}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Globe className="w-4 h-4" />
            {t('footer.hint')}
          </div>
          <Button onClick={handleSaveSettings} variant="accent-blue" disabled={isSaving || !hasChanges}>
            {isSaving ? (
              <>
                <LoadingSkeleton size="sm" color="white" className="mr-2" />
                {t('actions.saving')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {t('actions.save')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </SettingsPageContent>
  );
}

