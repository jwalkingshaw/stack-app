'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import { Building2, Save, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { SettingsPageContent } from './settings-page-content';
import { toast } from '@/components/ui/toast';

interface OrganizationSettingsProps {
  tenantSlug: string;
}

interface OrgSettings {
  name: string;
  website: string;
  description: string;
  logoUrl: string | null;
}

export default function OrganizationSettings({ tenantSlug }: OrganizationSettingsProps) {
  const [orgSettings, setOrgSettings] = useState<OrgSettings>({
    name: '',
    website: '',
    description: '',
    logoUrl: null,
  });
  const [initialSettings, setInitialSettings] = useState<OrgSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/${tenantSlug}/settings/organization`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error('Failed to load organization settings');
        }

        const payload = await response.json();
        const nextSettings: OrgSettings = {
          name: payload?.organization?.name ?? '',
          website: payload?.organization?.website ?? '',
          description: payload?.organization?.description ?? '',
          logoUrl: payload?.organization?.logoUrl ?? null,
        };

        if (!cancelled) {
          setOrgSettings(nextSettings);
          setInitialSettings(nextSettings);
          setLogoLoadFailed(false);
        }
      } catch (error) {
        console.error('Failed to load organization settings:', error);
        if (!cancelled) {
          toast.error('Failed to load organization settings');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const handleSaveSettings = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
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
      };
      setOrgSettings(nextSettings);
      setInitialSettings(nextSettings);
      setLogoLoadFailed(false);
      toast.success('Organization settings saved');
    } catch (error) {
      console.error('Failed to save organization settings:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save organization settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      toast.error('Please upload a PNG or JPG file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be 2MB or smaller');
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
      toast.success('Logo uploaded');
    } catch (error) {
      console.error('Failed to upload logo:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload logo');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const hasChanges = useMemo(() => {
    if (!initialSettings) return false;
    return (
      orgSettings.name !== initialSettings.name ||
      orgSettings.website !== initialSettings.website ||
      orgSettings.description !== initialSettings.description ||
      orgSettings.logoUrl !== initialSettings.logoUrl
    );
  }, [initialSettings, orgSettings]);

  if (isLoading) {
    return (
      <SettingsPageContent page="organization">
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <LoadingSpinner size="md" />
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
            Organization Details
          </CardTitle>
          <CardDescription>
            Manage your workspace information and branding
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Organization Name
              </label>
              <input
                type="text"
                value={orgSettings.name}
                onChange={(e) => setOrgSettings({ ...orgSettings, name: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Website
              </label>
              <input
                type="url"
                value={orgSettings.website}
                onChange={(e) => setOrgSettings({ ...orgSettings, website: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="https://yourcompany.com"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Description
            </label>
            <textarea
              value={orgSettings.description}
              onChange={(e) => setOrgSettings({ ...orgSettings, description: e.target.value })}
              className="w-full px-3 py-2 border border-input rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              rows={4}
              placeholder="Brief description of your organization..."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>
            Upload your organization logo and customize branding
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
              {orgSettings.logoUrl && !logoLoadFailed ? (
                <NextImage
                  src={orgSettings.logoUrl}
                  alt={`${orgSettings.name || 'Organization'} logo`}
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
                {isUploadingLogo ? 'Uploading...' : 'Upload Logo'}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG up to 2MB. Recommended: 200x200px
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="text-sm text-muted-foreground">
            Changes will be applied immediately to your workspace
          </div>
          <Button
            onClick={handleSaveSettings}
            variant="accent-blue"
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? (
              <>
                <LoadingSpinner size="sm" color="white" className="mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </SettingsPageContent>
  );
}
