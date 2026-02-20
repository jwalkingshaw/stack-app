'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Layers,
  Plus,
  Edit,
  Trash2,
  Type
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DataTable, Column, createTableActions } from '@/components/ui/data-table';
import AttributeWorkflowChecklist from './AttributeWorkflowChecklist';

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

const LOCKED_GROUP_CODES = new Set(['basic_info']);
const isLockedFieldGroup = (group: FieldGroup | null | undefined) =>
  !!group && LOCKED_GROUP_CODES.has(group.code);

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
  // State
  const [fieldGroups, setFieldGroups] = useState<FieldGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<FieldGroup | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    sort_order: 1
  });
  const [formLoading, setFormLoading] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

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

  // Auto-generate code when name changes
  useEffect(() => {
    if (formData.name && (!selectedGroup || !showEditDialog)) {
      const autoCode = generateCode(formData.name);
      setFormData(prev => ({ ...prev, code: autoCode }));
    }
  }, [formData.name, selectedGroup, showEditDialog]);

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      description: '',
      sort_order: 1
    });
    setSelectedGroup(null);
    setError(null);
    setDeleteConfirmation('');
  };

  // Create field group
  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.code.trim()) return;

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/field-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
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

  // Update field group
  const handleUpdate = async () => {
    if (!selectedGroup || !formData.name.trim() || !formData.code.trim()) return;

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/field-groups/${selectedGroup.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update field group');
      }

      await fetchFieldGroups(); // Refresh list
      setShowEditDialog(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update field group');
    } finally {
      setFormLoading(false);
    }
  };

  // Delete field group
  const handleDelete = async () => {
    if (!selectedGroup) return;

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/field-groups/${selectedGroup.code}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete field group');
      }

      await fetchFieldGroups(); // Refresh list
      setShowDeleteDialog(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete field group');
    } finally {
      setFormLoading(false);
    }
  };

  // Table columns
  const columns: Column<FieldGroup>[] = [
    {
      key: 'name',
      label: 'Group Name',
      sortable: true,
      width: '50%',
      render: (value, group) => (
        <div>
          <a
            href={`/${tenantSlug}/settings/field-groups/${group.code}`}
            className="font-medium text-foreground hover:text-primary transition-colors cursor-pointer"
          >
            {value}
          </a>
          {isLockedFieldGroup(group) && (
            <div className="mt-1">
              <Badge variant="outline" className="text-xs">System Group</Badge>
            </div>
          )}
          <div className="text-sm text-muted-foreground">{group.description}</div>
        </div>
      )
    },
    {
      key: 'product_fields',
      label: 'Attributes',
      sortable: false,
      width: '20%',
      render: (value) => (
        <span className="text-sm text-muted-foreground">
          {value?.length || 0} attributes
        </span>
      )
    },
    {
      key: 'sort_order',
      label: 'Order',
      sortable: true,
      width: '15%',
      render: (value) => (
        <Badge variant="secondary">#{value}</Badge>
      )
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      width: '15%',
      render: (value) => (
        <span className="text-sm text-muted-foreground">
          {new Date(value).toLocaleDateString()}
        </span>
      )
    }
  ];

  // Table actions
  const actions = [
    createTableActions.view((group: FieldGroup) => {
      window.location.href = `/${tenantSlug}/settings/field-groups/${group.code}`;
    }),
    createTableActions.edit((group: FieldGroup) => {
      if (isLockedFieldGroup(group)) return;
      setSelectedGroup(group);
      setFormData({
        name: group.name,
        code: group.code,
        description: group.description,
        sort_order: group.sort_order
      });
      setShowEditDialog(true);
    }),
    createTableActions.delete((group: FieldGroup) => {
      if (isLockedFieldGroup(group)) return;
      setSelectedGroup(group);
      setShowDeleteDialog(true);
    })
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Attribute Groups</h2>
        <p className="text-muted-foreground">
          Organize attributes into logical groups for better data management
        </p>
      </div>

      <AttributeWorkflowChecklist tenantSlug={tenantSlug} />

      {/* Data Table */}
      <DataTable
        data={fieldGroups}
        columns={columns}
        loading={loading}
        actions={actions}
        hideActions={(group: FieldGroup) => isLockedFieldGroup(group)}
        searchPlaceholder="Search attribute groups..."
        onCreateNew={() => setShowCreateDialog(true)}
        createNewLabel="Create Group"
        emptyState={{
          title: "No attribute groups found",
          description: "Create your first group to organize your attributes.",
          icon: <Layers className="w-8 h-8 text-muted-foreground" />
        }}
      />

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
          <DialogTitle>Create Attribute Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Group Name *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Basic Information, Technical Specs"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Code *
              </label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                placeholder="auto-generated"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Description
              </label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this group..."
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Sort Order
              </label>
              <Input
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 1 }))}
                min="1"
              />
            </div>
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
                {error}
              </div>
            )}
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                variant="accent-blue"
                disabled={formLoading || !formData.name.trim() || !formData.code.trim()}
                className="flex-1"
              >
                {formLoading ? 'Creating...' : 'Create Group'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Attribute Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Group Name *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Basic Information, Technical Specs"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Code *
              </label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                placeholder="auto-generated"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Description
              </label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this group..."
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Sort Order
              </label>
              <Input
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 1 }))}
                min="1"
              />
            </div>
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
                {error}
              </div>
            )}
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowEditDialog(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleUpdate}
                variant="accent-blue"
                disabled={formLoading || !formData.name.trim() || !formData.code.trim()}
                className="flex-1"
              >
                {formLoading ? 'Updating...' : 'Update Group'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Attribute Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete "{selectedGroup?.name}"? This action cannot be undone.
              All attributes in this group will be moved to "Uncategorized".
            </p>
            <p className="text-sm text-muted-foreground font-medium">
              To confirm, type <span className="font-mono bg-muted px-1 rounded">delete</span> in the box below:
            </p>
            <Input
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="Type 'delete' to confirm"
            />
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
                {error}
              </div>
            )}
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={formLoading || deleteConfirmation.toLowerCase() !== 'delete'}
                className="flex-1"
              >
                {formLoading ? 'Deleting...' : 'Delete Group'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


