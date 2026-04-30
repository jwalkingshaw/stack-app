'use client';

import { use, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChevronLeft,
  Save,
  List
} from 'lucide-react';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { isLockedFieldGroupCode } from '@/lib/field-group-codes';
import { SettingsSecondLevelPage } from '../../../components/settings-page-content';

interface FieldGroup {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  sort_order: number;
}

// This will be the edit page for a specific field group
export default function FieldGroupEditPage({
  params
}: {
  params: Promise<{ tenant: string; groupCode: string }>
}) {
  const { tenant, groupCode } = use(params);
  const router = useRouter();
  const isLockedGroup = isLockedFieldGroupCode(groupCode);

  const [fieldGroup, setFieldGroup] = useState<FieldGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFieldGroup = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/${tenant}/field-groups/${groupCode}`);
      const result = (await response.json()) as FieldGroup & { error?: string };

      if (response.ok) {
        setFieldGroup(result);
        setFormData({
          name: result.name,
          code: result.code,
          description: result.description || "",
          sort_order: result.sort_order
        });
      } else {
        setError(result.error || 'Failed to fetch field group');
      }
    } catch (error) {
      console.error('Error fetching field group:', error);
      setError('Failed to fetch field group');
    } finally {
      setLoading(false);
    }
  }, [tenant, groupCode]);

  useEffect(() => {
    void fetchFieldGroup();
  }, [fetchFieldGroup]);

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    sort_order: 1
  });

  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [isSaving, setIsSaving] = useState(false);

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Group name is required';
    }

    if (!formData.code.trim()) {
      newErrors.code = 'Group code is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (isLockedGroup) {
      setErrors({ general: 'This is a system group and cannot be edited.' });
      return;
    }

    if (!validateForm()) return;

    setIsSaving(true);

    try {
      const response = await fetch(`/api/${tenant}/field-groups/${groupCode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok) {
        // Navigate back to view mode with updated code if it changed
        router.push(`/${tenant}/settings/field-groups/${formData.code}`);
      } else {
        setErrors({ general: result.error || 'Failed to save changes' });
      }
    } catch (error) {
      console.error('Error saving field group:', error);
      setErrors({ general: 'Failed to save changes' });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageSkeleton text="Loading field group..." size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button variant="outline" onClick={fetchFieldGroup}>Try Again</Button>
        </div>
      </div>
    );
  }

  if (!fieldGroup) {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Field group not found</p>
        </div>
      </div>
    );
  }

  return (
    <SettingsSecondLevelPage
      page="field-group-edit"
      backLink={
        <Link
          href={`/${tenant}/settings/field-groups/${groupCode}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Attribute Group</span>
        </Link>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Edit {fieldGroup.name}</h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/${tenant}/settings/field-groups/${groupCode}`)}
          >
            Cancel
          </Button>
          <Button
            variant="accent-blue"
            onClick={handleSave}
            disabled={isSaving || isLockedGroup}
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <List className="w-5 h-5" />
              Edit Field Group
            </CardTitle>
            <CardDescription>
              Update the properties of this field group
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Form fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Group Name *
                </label>
              <Input
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Marketing Information, Compliance"
                disabled={isLockedGroup}
                className={errors.name ? 'border-red-500' : ''}
              />
                {errors.name && (
                  <p className="text-sm text-red-600 mt-1">{errors.name}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Group Code *
                </label>
              <Input
                value={formData.code}
                onChange={(e) => handleInputChange('code', e.target.value)}
                placeholder="e.g., marketing_info, compliance"
                disabled={isLockedGroup}
                className={errors.code ? 'border-red-500' : ''}
              />
                {errors.code && (
                  <p className="text-sm text-red-600 mt-1">{errors.code}</p>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Brief description of this field group..."
                rows={3}
                disabled={isLockedGroup}
                className="w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none bg-white text-foreground"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Sort Order
                </label>
                <Input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => handleInputChange('sort_order', parseInt(e.target.value) || 1)}
                  placeholder="1"
                  min="1"
                  disabled={isLockedGroup}
                />
              </div>
            </div>

            {isLockedGroup && (
              <div className="p-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded">
                Basic Information is a system group and cannot be edited.
              </div>
            )}

            {errors.general && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
                {errors.general}
              </div>
            )}

            {/* Warning about code changes */}
            {formData.code !== fieldGroup.code && (
              <div className="bg-yellow-50 p-4 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Warning:</strong> Changing the group code will affect all products and families that reference this field group.
                  Make sure to update any dependencies after saving.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
    </SettingsSecondLevelPage>
  );
}



