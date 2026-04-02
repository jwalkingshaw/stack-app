'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ItemList } from '@/components/ui/item-list';
import { CenteredFormModal } from '@/components/ui/modal-shells';
import { isLockedFieldGroupCode } from '@/lib/field-group-codes';
import { SettingsPageContent } from './settings-page-content';

interface FieldGroup {
  id: string;
  code: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_fields?: Array<{
    id: string;
    name: string;
    field_type: string;
  }>;
}

interface FieldGroupsSettingsProps {
  tenantSlug: string;
}

const isLockedFieldGroup = (group: FieldGroup | null | undefined) =>
  !!group && isLockedFieldGroupCode(group.code);

// Auto-generate code from name
const generateCode = (name: string): string => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
};

export default function FieldGroupsSettings({ tenantSlug }: FieldGroupsSettingsProps) {
  const router = useRouter();
  // State
  const [fieldGroups, setFieldGroups] = useState<FieldGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });
  const [formLoading, setFormLoading] = useState(false);

  // Fetch field groups
  const fetchFieldGroups = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/${tenantSlug}/field-groups`);
      if (!response.ok) throw new Error('Failed to fetch field groups');

      const data = await response.json();
      setFieldGroups(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch field groups');
      console.error('Error fetching field groups:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchFieldGroups();
  }, [fetchFieldGroups]);

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      description: ''
    });
    setError(null);
  };

  // Create field group
  const handleCreate = async () => {
    const name = formData.name.trim();
    const code = generateCode(name);

    if (!name) {
      setError('Group name is required');
      return;
    }

    if (!code) {
      setError('Group name must include letters or numbers');
      return;
    }

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/field-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          code,
          description: formData.description,
          sort_order: fieldGroups.length + 1
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create field group');
      }

      await fetchFieldGroups(); // Refresh list
      setShowCreateDialog(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create field group');
    } finally {
      setFormLoading(false);
    }
  };

  const filteredGroups = useMemo(
    () => fieldGroups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [fieldGroups, searchQuery]
  );

  return (
    <SettingsPageContent page="field-groups">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Attribute Groups</h2>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search groups..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <ItemList
        items={filteredGroups}
        getKey={(group) => group.id}
        renderTitle={(group) => group.name}
        renderSubtitle={(group) => group.description}
        getStatus={(group) => (group.is_active ? 'active' : 'inactive')}
        onClickItem={(group) => router.push(`/${tenantSlug}/settings/field-groups/${group.code}`)}
        isLocked={(group) => isLockedFieldGroup(group)}
        loading={loading}
        loadingRows={8}
        emptyMessage={searchQuery ? 'No groups match your search.' : 'No attribute groups yet. Create your first group.'}
        headerLabel="attribute groups"
        onCreate={() => {
          setError(null);
          setShowCreateDialog(true);
        }}
        createLabel="Add attribute group"
      />

      <CenteredFormModal
        open={showCreateDialog}
        title="Create Attribute Group"
        onOpenChange={setShowCreateDialog}
        onCancel={() => setShowCreateDialog(false)}
        onPrimaryAction={() => void handleCreate()}
        primaryActionLabel="Create Group"
        primaryActionDisabled={formLoading || !formData.name.trim()}
        primaryActionLoading={formLoading}
        primaryActionLoadingLabel="Creating..."
      >
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            Group Name *
          </label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., Basic Information, Technical Specs"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            Description
          </label>
          <Input
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Brief description of this group..."
          />
        </div>
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </CenteredFormModal>

    </SettingsPageContent>
  );
}


