'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Package,
  Plus,
  Edit,
  Trash2,
  Eye,
  Settings
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DataTable, Column, createTableActions } from '@/components/ui/data-table';
import { PageContentContainer } from '@/components/ui/page-content-container';
import AttributeWorkflowChecklist from './AttributeWorkflowChecklist';

interface ProductFamily {
  id: string;
  code: string;
  name: string;
  description: string;
  field_groups_count?: number;
  products_count?: number;
  created_at: string;
  updated_at: string;
}

interface ProductFamiliesSettingsProps {
  tenantSlug: string;
}

export default function ProductFamiliesSettings({ tenantSlug }: ProductFamiliesSettingsProps) {
  // State
  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<ProductFamily | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: ''
  });
  const [formLoading, setFormLoading] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  // Fetch families
  const fetchFamilies = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/${tenantSlug}/product-families`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch families');
      }

      const result = await response.json();
      console.log('Product families API response:', result);
      setFamilies(result.data || result || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch families';
      setError(errorMessage);
      console.error('Error fetching families:', {
        error: err,
        message: errorMessage,
        tenantSlug
      });
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchFamilies();
  }, [fetchFamilies]);

  // Reset form
  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: ''
    });
    setSelectedFamily(null);
    setError(null);
    setDeleteConfirmation('');
  };

  // Auto-generate code from name
  const generateCode = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  };

  // Create family
  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.code.trim()) {
      setError('Name and code are required');
      return;
    }

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/product-families`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create family');
      }

      await fetchFamilies(); // Refresh list
      setShowCreateDialog(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create family');
    } finally {
      setFormLoading(false);
    }
  };

  // Update family
  const handleUpdate = async () => {
    if (!selectedFamily || !formData.name.trim()) return;

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/product-families/${selectedFamily.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update family');
      }

      await fetchFamilies(); // Refresh list
      setShowEditDialog(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update family');
    } finally {
      setFormLoading(false);
    }
  };

  // Delete family
  const handleDelete = async () => {
    if (!selectedFamily) return;

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/product-families/${selectedFamily.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete family');
      }

      await fetchFamilies(); // Refresh list
      setShowDeleteDialog(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete family');
    } finally {
      setFormLoading(false);
    }
  };

  // Table columns
  const columns: Column<ProductFamily>[] = [
    {
      key: 'name',
      label: 'Family Name',
      sortable: true,
      width: '25%',
      render: (value, family) => (
        <div>
          <a
            href={`/${tenantSlug}/settings/product-models/${family.code}`}
            className="font-medium text-foreground hover:text-primary transition-colors cursor-pointer"
          >
            {value}
          </a>
          <div className="text-sm text-muted-foreground">{family.description}</div>
        </div>
      )
    },
    {
      key: 'field_groups_count',
      label: 'Groups',
      sortable: true,
      width: '15%',
      render: (value) => (
        <span className="text-sm text-muted-foreground">
          {value || 0} groups
        </span>
      )
    },
    {
      key: 'products_count',
      label: 'Products',
      sortable: true,
      width: '15%',
      render: (value) => (
        <span className="text-sm text-muted-foreground">
          {value || 0} products
        </span>
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
    createTableActions.view((family: ProductFamily) => {
      // Navigate to family detail view
      window.location.href = `/${tenantSlug}/settings/product-models/${family.code}`;
    }),
    createTableActions.edit((family: ProductFamily) => {
      setSelectedFamily(family);
      setFormData({
        code: family.code,
        name: family.name,
        description: family.description
      });
      setShowEditDialog(true);
    }),
    createTableActions.delete((family: ProductFamily) => {
      setSelectedFamily(family);
      setShowDeleteDialog(true);
    })
  ];

  return (
    <PageContentContainer mode="fluid" className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Product Models</h2>
        <p className="text-muted-foreground">
          Define product models with groups, attributes, and variant axes
        </p>
      </div>

      <AttributeWorkflowChecklist tenantSlug={tenantSlug} />

      {/* Error Display */}
      {error && (
        <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
          <strong>Error loading families:</strong> {error}
        </div>
      )}

      {/* Data Table */}
      <DataTable
        data={families}
        columns={columns}
        loading={loading}
        actions={actions}
        searchPlaceholder="Search families..."
        onCreateNew={() => setShowCreateDialog(true)}
        createNewLabel="Create Model"
        emptyState={{
          title: "No product models found",
          description: "Create your first product model to organize products with shared attributes.",
          icon: <Package className="w-8 h-8 text-muted-foreground" />
        }}
      />

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
          <DialogTitle>Create Product Model</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Model Name *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => {
                  const newName = e.target.value;
                  setFormData(prev => ({
                    ...prev,
                    name: newName,
                    code: generateCode(newName)
                  }));
                }}
                placeholder="e.g., Supplements, Apparel"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Code *
                <span className="text-xs text-muted-foreground ml-2">(auto-generated, can be edited)</span>
              </label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                placeholder="e.g., supplements, apparel"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Description
              </label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this model..."
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
                {formLoading ? 'Creating...' : 'Create Model'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
          <DialogTitle>Edit Product Model</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Model Name *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Supplements, Apparel"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Code *
              </label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                placeholder="e.g., supplements, apparel"
                className="font-mono text-sm"
                disabled
              />
              <p className="text-xs text-muted-foreground mt-1">Code cannot be changed after creation</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Description
              </label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this model..."
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
                {formLoading ? 'Updating...' : 'Update Model'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
          <DialogTitle>Delete Product Model</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete "{selectedFamily?.name}"? This action cannot be undone.
              All products in this model will need to be reassigned.
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
                {formLoading ? 'Deleting...' : 'Delete Family'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageContentContainer>
  );
}


