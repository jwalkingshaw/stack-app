'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/loading-spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsContentBoundary, SettingsSecondLevelPage } from './settings-page-content';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface LocalizationDefaultsSettingsProps {
  tenantSlug: string;
}

interface LocalizationSettingsData {
  organization_id: string;
  translation_enabled: boolean;
  write_assist_enabled: boolean;
  deepl_glossary_id: string | null;
  brand_instructions: string;
  preferred_tone: 'neutral' | 'formal' | 'informal' | 'professional' | 'friendly';
  metadata: Record<string, unknown>;
}

interface GlossarySummary {
  id: string;
  name: string;
  source_language_code: string;
  target_language_code: string;
  provider_glossary_id: string | null;
}

interface LocalizationSettingsResponse {
  success: boolean;
  data: {
    settings: LocalizationSettingsData;
  };
}

interface GlossariesResponse {
  success: boolean;
  data: {
    glossaries: GlossarySummary[];
  };
}

const DEFAULT_SETTINGS_STATE: LocalizationSettingsData = {
  organization_id: '',
  translation_enabled: false,
  write_assist_enabled: false,
  deepl_glossary_id: null,
  brand_instructions: '',
  preferred_tone: 'neutral',
  metadata: {},
};

export default function LocalizationDefaultsSettings({ tenantSlug }: LocalizationDefaultsSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [glossaries, setGlossaries] = useState<GlossarySummary[]>([]);
  const [settings, setSettings] = useState<LocalizationSettingsData>(DEFAULT_SETTINGS_STATE);

  const fetchSettings = useCallback(async () => {
    const response = await fetch(`/api/${tenantSlug}/localization/settings`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load localization settings');
    }

    const payload = (await response.json()) as LocalizationSettingsResponse;
    setSettings(payload.data.settings || DEFAULT_SETTINGS_STATE);
  }, [tenantSlug]);

  const fetchGlossaries = useCallback(async () => {
    const response = await fetch(`/api/${tenantSlug}/localization/glossaries`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load translation glossaries');
    }

    const payload = (await response.json()) as GlossariesResponse;
    setGlossaries(payload.data.glossaries || []);
  }, [tenantSlug]);

  const refreshDefaults = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSaveNotice(null);
      await Promise.all([fetchSettings(), fetchGlossaries()]);
    } catch (fetchError) {
      console.error('Failed to load localization defaults:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load localization defaults');
    } finally {
      setLoading(false);
    }
  }, [fetchGlossaries, fetchSettings]);

  useEffect(() => {
    refreshDefaults();
  }, [refreshDefaults]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSaveNotice(null);

      const response = await fetch(`/api/${tenantSlug}/localization/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          translationEnabled: settings.translation_enabled,
          writeAssistEnabled: settings.write_assist_enabled,
          deeplGlossaryId: settings.deepl_glossary_id,
          brandInstructions: settings.brand_instructions,
          preferredTone: settings.preferred_tone,
          metadata: settings.metadata || {},
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to save localization settings');
      }

      await fetchSettings();
      setSaveNotice('Localization settings saved.');
    } catch (saveError) {
      console.error('Failed to save localization settings:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Failed to save localization settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageLoader text="Loading localization defaults..." size="lg" />
      </div>
    );
  }

  return (
    <SettingsSecondLevelPage
      page="localization"
      backLink={
        <Link
          href={`/${tenantSlug}/settings/localization`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Localization</span>
        </Link>
      }
    >
      <SettingsContentBoundary size="md" className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Workspace Defaults</h2>
          <p className="text-muted-foreground">
            Configure translation defaults and writing assistance behavior.
          </p>
        </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {saveNotice ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {saveNotice}
            </div>
          ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Localization Defaults</CardTitle>
          <CardDescription>These settings apply to new translation and write assist runs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
                <div>
                  <div className="text-sm font-medium">Enable Translation</div>
                  <div className="text-xs text-muted-foreground">Allow translation run creation and content generation.</div>
                </div>
                <Switch
                  checked={settings.translation_enabled}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, translation_enabled: Boolean(checked) }))
                  }
                />
              </div>
 
              <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
                <div>
                  <div className="text-sm font-medium">Enable Write Assist</div>
                  <div className="text-xs text-muted-foreground">
                    Allow generation of field-level copy improvement suggestions.
                  </div>
                </div>
                <Switch
                  checked={settings.write_assist_enabled}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, write_assist_enabled: Boolean(checked) }))
                  }
                />
              </div>

            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">Preferred Brand Tone</div>
                <Select
                  value={settings.preferred_tone}
                  onValueChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      preferred_tone:
                        value === 'formal' ||
                        value === 'informal' ||
                        value === 'professional' ||
                        value === 'friendly'
                          ? value
                          : 'neutral',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select preferred tone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="neutral">Neutral</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="informal">Informal</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Default Glossary</div>
                <Select
                  value={settings.deepl_glossary_id || '__none__'}
                  onValueChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      deepl_glossary_id: value === '__none__' ? null : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {glossaries
                      .filter((glossary) => glossary.provider_glossary_id)
                      .map((glossary) => (
                        <SelectItem key={glossary.id} value={glossary.provider_glossary_id || glossary.id}>
                          {glossary.name} ({glossary.source_language_code}{' -> '}{glossary.target_language_code})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">
                  Used as the default glossary for translation and Write Assist runs.
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Brand Instructions</div>
              <Textarea
                value={settings.brand_instructions || ''}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    brand_instructions: event.target.value,
                  }))
                }
                placeholder="Example: Keep tone premium and concise. Never use slang. Emphasize clinical efficacy and compliance-safe claims."
                rows={5}
              />
              <div className="text-xs text-muted-foreground">
                This guidance is injected into translation context and used to infer write tone/style.
              </div>
            </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Localization Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>
      </SettingsContentBoundary>
    </SettingsSecondLevelPage>
  );
}
