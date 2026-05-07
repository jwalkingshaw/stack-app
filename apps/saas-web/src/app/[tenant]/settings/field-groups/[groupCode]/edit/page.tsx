'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { isLockedFieldGroupCode } from '@/lib/field-group-codes';
import { SettingsSecondLevelPage } from '../../../components/settings-page-content';
import { SettingsDetailHeader } from '../../../components/settings-detail-header';

interface FieldGroup {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  sort_order: number;
}

export default function FieldGroupEditPage({
  params,
}: {
  params: Promise<{ tenant: string; groupCode: string }>;
}) {
  const { tenant, groupCode } = use(params);
  const router = useRouter();
  const isLockedGroup = isLockedFieldGroupCode(groupCode);

  const [fieldGroup, setFieldGroup] = useState<FieldGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', code: '', description: '', sort_order: 1 });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

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
          description: result.description || '',
          sort_order: result.sort_order,
        });
      } else {
        setError(result.error || 'Failed to fetch field group');
      }
    } catch {
      setError('Failed to fetch field group');
    } finally {
      setLoading(false);
    }
  }, [tenant, groupCode]);

  useEffect(() => { void fetchFieldGroup(); }, [fetchFieldGroup]);

  const handleSave = async () => {
    if (isLockedGroup) { setFormErrors({ general: 'This is a system group and cannot be edited.' }); return; }
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Group name is required';
    if (!formData.code.trim()) newErrors.code = 'Group code is required';
    setFormErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/${tenant}/field-groups/${groupCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = (await response.json()) as { error?: string };
      if (response.ok) {
        router.push(`/${tenant}/settings/field-groups/${formData.code}`);
      } else {
        setFormErrors({ general: result.error || 'Failed to save changes' });
      }
    } catch {
      setFormErrors({ general: 'Failed to save changes' });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="h-full bg-background"><PageSkeleton text="Loading..." size="lg" variant="settings-detail" /></div>;
  if (error || !fieldGroup) return (
    <div className="h-full bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-600 mb-4">{error || 'Field group not found'}</p>
        <Button variant="outline" onClick={fetchFieldGroup}>Try Again</Button>
      </div>
    </div>
  );

  return (
    <SettingsSecondLevelPage page="field-group-edit">
      <SettingsDetailHeader
        backHref={`/${tenant}/settings/field-groups/${groupCode}`}
        backLabel={fieldGroup.name}
        title={`Edit ${fieldGroup.name}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push(`/${tenant}/settings/field-groups/${groupCode}`)}>
              Cancel
            </Button>
            <Button variant="accent-blue" onClick={() => void handleSave()} disabled={isSaving || isLockedGroup}>
              {isSaving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        }
      />

      {isLockedGroup && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          This is a system group and cannot be edited.
        </div>
      )}

      {formErrors.general && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{formErrors.general}</div>
      )}

      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Group Name *</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              disabled={isLockedGroup}
              className={formErrors.name ? 'border-red-500' : ''}
            />
            {formErrors.name && <p className="text-xs text-red-600">{formErrors.name}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Group Code *</label>
            <Input
              value={formData.code}
              onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
              disabled={isLockedGroup}
              className={`font-mono ${formErrors.code ? 'border-red-500' : ''}`}
            />
            {formErrors.code && <p className="text-xs text-red-600">{formErrors.code}</p>}
            {formData.code !== fieldGroup.code && (
              <p className="text-xs text-amber-700">
                Changing the code affects all products and families that reference this group.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
            rows={3}
            disabled={isLockedGroup}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="w-48 flex flex-col gap-1.5">
          <label className="text-sm font-medium">Sort Order</label>
          <Input
            type="number"
            value={formData.sort_order}
            onChange={(e) => setFormData((p) => ({ ...p, sort_order: parseInt(e.target.value) || 1 }))}
            min="1"
            disabled={isLockedGroup}
          />
        </div>
      </div>
    </SettingsSecondLevelPage>
  );
}
