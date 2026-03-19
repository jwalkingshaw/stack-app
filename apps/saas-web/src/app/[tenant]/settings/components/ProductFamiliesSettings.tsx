'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ItemList } from '@/components/ui/item-list';
import { SettingsPageContent } from './settings-page-content';

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
        <p className="text-muted-foreground">
          Define product models with groups, attributes, and variant axes
        </p>
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
                    name: newName
                  }));
                }}
                placeholder="e.g., Supplements, Apparel"
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
                disabled={formLoading || !formData.name.trim()}
                className="flex-1"
              >
                {formLoading ? 'Creating...' : 'Create Model'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </SettingsPageContent>
  );
}


