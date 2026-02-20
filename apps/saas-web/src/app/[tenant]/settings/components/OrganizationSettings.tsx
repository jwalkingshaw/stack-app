'use client';

import { useState } from 'react';
import { Building2, Save, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface OrganizationSettingsProps {
  tenantSlug: string;
}

interface OrgSettings {
  name: string;
  website: string;
  description: string;
}

export default function OrganizationSettings({ tenantSlug }: OrganizationSettingsProps) {
  const [orgSettings, setOrgSettings] = useState<OrgSettings>({
    name: 'Stack Brand',
    website: 'https://stackbrand.com',
    description: 'A modern nutrition and wellness brand focused on premium supplements'
  });

  const [loading, setLoading] = useState(false);

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      // TODO: Implement API call to save organization settings
      console.log('Saving organization settings:', orgSettings);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Failed to save organization settings:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
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
        <CardContent className="space-y-4">
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
              rows={3}
              placeholder="Brief description of your organization..."
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="text-sm text-muted-foreground">
              Changes will be applied immediately to your workspace
            </div>
            <Button
              onClick={handleSaveSettings}
              variant="accent-blue"
              disabled={loading}
            >
              {loading ? (
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
          </div>
        </CardContent>
      </Card>

      {/* Organization Logo/Branding */}
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
              <Building2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <Button variant="outline" size="sm">
                <Upload className="w-4 h-4 mr-2" />
                Upload Logo
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG up to 2MB. Recommended: 200x200px
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

