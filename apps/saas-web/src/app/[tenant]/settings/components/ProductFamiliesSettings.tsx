'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ItemList } from '@/components/ui/item-list';
import { CenteredFormModal } from '@/components/ui/modal-shells';
import { SettingsPageContent } from './settings-page-content';

interface ProductFamily {
  id: string;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
  field_groups_count?: number;
  products_count?: number;
  created_at: string;
  updated_at: string;
}

interface ProductFamiliesSettingsProps {
  tenantSlug: string;
}

export default function ProductFamiliesSettings({ tenantSlug }: ProductFamiliesSettingsProps) {
  const router = useRouter();
  // State
  const [families, setFamilies] = useState<ProductFamily[]>([]);
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
      const rows = (result?.data || result || []) as Partial<ProductFamily>[];
      setFamilies(
        rows.map((row) => ({
          ...row,
          id: String(row.id || ''),
          code: String(row.code || ''),
          name: String(row.name || ''),
          description: String(row.description || ''),
          is_active: row.is_active !== false,
          field_groups_count: Number(row.field_groups_count || 0),
          products_count: Number(row.products_count || 0),
          created_at: String(row.created_at || ''),
          updated_at: String(row.updated_at || ''),
        }))
      );
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
      name: '',
      description: ''
    });
    setError(null);
  };

  // Auto-generate code from name
  const generateCode = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  };

  // Create family
  const handleCreate = async () => {
    const name = formData.name.trim();
    const code = generateCode(name);

    if (!name) {
      setError('Name is required');
      return;
    }

    if (!code) {
      setError('Model name must include letters or numbers');
      return;
    }

    try {
      setFormLoading(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/product-families`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: formData.description,
          code
        })
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

  const filteredFamilies = useMemo(
    () => families.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [families, searchQuery]
  );

  return (
    <SettingsPageContent page="product-families">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Product Models</h2>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
          <strong>Error loading families:</strong> {error}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search models..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <ItemList
        items={filteredFamilies}
        getKey={(family) => family.id}
        renderTitle={(family) => family.name}
        renderSubtitle={(family) => family.description}
        getStatus={(family) => (family.is_active ? 'active' : 'inactive')}
        renderRight={(family) => (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {family.field_groups_count ?? 0} {(family.field_groups_count ?? 0) === 1 ? 'group' : 'groups'}
            </Badge>
            <Badge variant="secondary">
              {family.products_count ?? 0} {(family.products_count ?? 0) === 1 ? 'product' : 'products'}
            </Badge>
          </div>
        )}
        onClickItem={(family) => router.push(`/${tenantSlug}/settings/product-models/${family.code}`)}
        loading={loading}
        loadingRows={8}
        emptyMessage={searchQuery ? 'No models match your search.' : 'No product models yet. Create your first model.'}
        headerLabel="product models"
        onCreate={() => {
          setError(null);
          setShowCreateDialog(true);
        }}
        createLabel="Add product model"
      />

      <CenteredFormModal
        open={showCreateDialog}
        title="Create Product Model"
        onOpenChange={setShowCreateDialog}
        onCancel={() => setShowCreateDialog(false)}
        onPrimaryAction={() => void handleCreate()}
        primaryActionLabel="Create Model"
        primaryActionDisabled={formLoading || !formData.name.trim()}
        primaryActionLoading={formLoading}
        primaryActionLoadingLabel="Creating..."
      >
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            Model Name *
          </label>
          <Input
            value={formData.name}
            onChange={(e) => {
              const newName = e.target.value;
              setFormData(prev => ({
                ...prev,
                name: newName
              }));
            }}
            placeholder="e.g., Supplements, Apparel"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            Description
          </label>
          <Input
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Brief description of this model..."
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


