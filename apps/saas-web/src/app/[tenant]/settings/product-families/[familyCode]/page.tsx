'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Layers
} from 'lucide-react';
import { PageLoader } from '@/components/ui/loading-spinner';
import { PageContentContainer } from '@/components/ui/page-content-container';

interface FieldGroup {
  id: string;
  name: string;
  code: string;
  description: string;
}

interface ProductField {
  id: string;
  name: string;
  code: string;
  field_type: string;
  description?: string;
}

interface FamilyFieldGroup {
  id: string;
  field_group_id: string;
  field_group: FieldGroup;
  hidden_fields: string[];
  sort_order: number;
  fields: ProductField[];
}

interface VariantAttribute {
  id: string;
  product_field_id: string;
  field_code: string;
  field_name: string;
  field_type: string;
  field_description?: string;
  sort_order: number;
  is_required: boolean;
  validation_rules?: any;
  options?: any;
}

interface FamilyAttribute {
  id: string;
  attribute_code: string;
  attribute_label: string;
  attribute_type: string;
  is_required: boolean;
  is_unique: boolean;
  help_text?: string;
  inherit_level_1?: boolean;
  inherit_level_2?: boolean;
}

async function parseJsonSafely(response: Response): Promise<any | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function ProductFamilyDetailPage({
  params
}: {
  params: Promise<{ tenant: string; familyCode: string }>
}) {
  const { tenant, familyCode } = use(params);
  const router = useRouter();

  const [family, setFamily] = useState<any>(null);
  const [assignedGroups, setAssignedGroups] = useState<FamilyFieldGroup[]>([]);
  const [allFieldGroups, setAllFieldGroups] = useState<FieldGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddGroupsDialog, setShowAddGroupsDialog] = useState(false);
  const [selectedGroupsToAdd, setSelectedGroupsToAdd] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<string, string[]>>(new Map());
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'pending'>('saved');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Variant attributes state
  const [variantAttributes, setVariantAttributes] = useState<VariantAttribute[]>([]);
  const [allProductFields, setAllProductFields] = useState<ProductField[]>([]);
  const [showAddVariantAttributesDialog, setShowAddVariantAttributesDialog] = useState(false);
  const [selectedFieldsToAdd, setSelectedFieldsToAdd] = useState<string[]>([]);
  const [familyAttributes, setFamilyAttributes] = useState<FamilyAttribute[]>([]);

  useEffect(() => {
    fetchFamily();
    fetchAllFieldGroups();
    fetchHistory();
    fetchAllProductFields();
  }, [tenant, familyCode]);

  // Fetch variant attributes when family is loaded
  useEffect(() => {
    if (family?.id) {
      fetchVariantAttributes();
      fetchFamilyAttributes();
    }
  }, [family?.id]);

  // Debounced save function
  const debouncedSave = useCallback(async () => {
    if (pendingChanges.size === 0) return;

    setSaveStatus('saving');

    try {
      // Save all pending changes
      const savePromises = Array.from(pendingChanges.entries()).map(async ([assignmentId, hiddenFields]) => {
        const response = await fetch(`/api/${tenant}/product-families/${family.id}/field-groups/${assignmentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hidden_fields: hiddenFields })
        });

        if (!response.ok) {
          throw new Error(`Failed to save changes for assignment ${assignmentId}`);
        }
      });

      await Promise.all(savePromises);
      setPendingChanges(new Map());
      setSaveStatus('saved');
    } catch (error) {
      console.error('Error saving changes:', error);
      setError('Failed to save changes');
      setSaveStatus('pending');
    }
  }, [pendingChanges, tenant, family?.id]);

  // Auto-save with debounce
  useEffect(() => {
    if (pendingChanges.size > 0) {
      setSaveStatus('pending');

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout
      saveTimeoutRef.current = setTimeout(() => {
        debouncedSave();
      }, 1000); // Save after 1 second of inactivity
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [pendingChanges, debouncedSave]);

  // Save on page unload/navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingChanges.size > 0) {
        // Use sendBeacon for reliable saving on page unload
        const changes = Array.from(pendingChanges.entries()).map(([assignmentId, hiddenFields]) => ({
          assignmentId,
          hiddenFields
        }));

        navigator.sendBeacon(
          `/api/${tenant}/product-families/${family?.id}/field-groups/batch-save`,
          JSON.stringify({ changes })
        );
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && pendingChanges.size > 0) {
        // Page is being hidden - save immediately
        debouncedSave();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pendingChanges, tenant, family?.id, debouncedSave]);

  const fetchFamily = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/${tenant}/product-families/${familyCode}`);
      const result = await parseJsonSafely(response);

      if (response.ok) {
        if (!result?.data?.id) {
          throw new Error('Failed to fetch family');
        }
        setFamily(result.data);

        const groupsResponse = await fetch(`/api/${tenant}/product-families/${result.data.id}/field-groups`);
        if (groupsResponse.ok) {
          const groupsData = (await parseJsonSafely(groupsResponse)) || [];

          const transformedWithFields = await Promise.all(
            groupsData.map(async (item: any) => {
              const fieldsResponse = await fetch(`/api/${tenant}/field-groups/${item.field_group_id}/fields`);
              let fields: ProductField[] = [];

              if (fieldsResponse.ok) {
                const fieldsData = (await parseJsonSafely(fieldsResponse)) || [];
                fields = fieldsData.map((f: any) => f.product_fields).filter(Boolean);
              } else {
                console.warn('Failed to fetch fields for field group:', item.field_group_id);
              }

              return {
                id: item.id,
                field_group_id: item.field_group_id,
                field_group: item.field_groups,
                hidden_fields: item.hidden_fields || [],
                sort_order: item.sort_order,
                fields
              };
            })
          );

          setAssignedGroups(transformedWithFields || []);
        } else {
          console.warn('Failed to fetch field groups, but continuing with empty array');
          setAssignedGroups([]);
        }
      } else {
        setError(result?.error || 'Failed to fetch family');
      }
    } catch (error) {
      console.error('Error fetching family:', error);
      setError('Failed to fetch family');
    } finally {
      setLoading(false);
    }
  };

  const handleRuleChange = async (updates: { require_sku_on_active?: boolean; require_barcode_on_active?: boolean }) => {
    if (!family?.id) return;
    try {
      setRulesSaving(true);
      const response = await fetch(`/api/${tenant}/product-families/${family.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: family.name,
          description: family.description,
          ...updates
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update rules');
      }

      const data = (await parseJsonSafely(response)) || {};
      setFamily((prev: any) => ({
        ...prev,
        ...data.data
      }));
    } catch (error) {
      console.error('Error updating rules:', error);
      setError('Failed to update rules');
    } finally {
      setRulesSaving(false);
    }
  };

  const fetchAllFieldGroups = async () => {
    try {
      const response = await fetch(`/api/${tenant}/field-groups`);
      if (response.ok) {
        const data = await parseJsonSafely(response);
        setAllFieldGroups(data || []);
      } else {
        console.warn('Failed to fetch all field groups, but continuing with empty array');
        setAllFieldGroups([]);
      }
    } catch (error) {
      console.error('Error fetching field groups:', error);
      setAllFieldGroups([]);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch(`/api/${tenant}/product-families/${familyCode}/history`);
      if (response.ok) {
        const data = await parseJsonSafely(response);
        setHistoryData(data || []);
      } else {
        console.warn('Failed to fetch history, but continuing with empty array');
        setHistoryData([]);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
      setHistoryData([]);
    }
  };

  const fetchVariantAttributes = async () => {
    if (!family?.id) return;

    try {
      const response = await fetch(`/api/${tenant}/product-families/${family.id}/variant-attributes`);
      if (response.ok) {
        const data = (await parseJsonSafely(response)) || {};
        setVariantAttributes(data.data || []);
      } else {
        console.warn('Failed to fetch variant attributes');
        setVariantAttributes([]);
      }
    } catch (error) {
      console.error('Error fetching variant attributes:', error);
      setVariantAttributes([]);
    }
  };

  const fetchFamilyAttributes = async () => {
    if (!family?.id) return;

    try {
      const response = await fetch(`/api/${tenant}/product-families/${family.id}/attributes`);
      if (response.ok) {
        const data = (await parseJsonSafely(response)) || {};
        setFamilyAttributes(data.data || []);
      } else {
        console.warn('Failed to fetch family attributes');
        setFamilyAttributes([]);
      }
    } catch (error) {
      console.error('Error fetching family attributes:', error);
      setFamilyAttributes([]);
    }
  };

  const fetchAllProductFields = async () => {
    try {
      const response = await fetch(`/api/${tenant}/product-fields`);
      if (response.ok) {
        const data = await parseJsonSafely(response);
        setAllProductFields(data || []);
      } else {
        console.warn('Failed to fetch attributes');
        setAllProductFields([]);
      }
    } catch (error) {
      console.error('Error fetching attributes:', error);
      setAllProductFields([]);
    }
  };

  const getAvailableGroups = () => {
    const assignedIds = new Set(assignedGroups.map(ag => ag.field_group_id));
    return allFieldGroups.filter(group => !assignedIds.has(group.id));
  };

  const handleAddGroups = async () => {
    if (selectedGroupsToAdd.length === 0) return;

    try {
      for (let index = 0; index < selectedGroupsToAdd.length; index += 1) {
        const groupId = selectedGroupsToAdd[index];
        const response = await fetch(`/api/${tenant}/product-families/${family.id}/field-groups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field_group_id: groupId,
            sort_order: assignedGroups.length + index + 1
          })
        });

        if (!response.ok) {
          const result = await parseJsonSafely(response);
          throw new Error(result?.error || 'Failed to add field group');
        }
      }

      await fetchFamily();
      await Promise.all([fetchFamilyAttributes(), fetchVariantAttributes()]);
      setSelectedGroupsToAdd([]);
      setShowAddGroupsDialog(false);
    } catch (error) {
      console.error('Error adding groups:', error);
      setError('Failed to add field groups');
    }
  };

  const handleRemoveGroup = async (assignmentId: string) => {
    if (!confirm('Remove this field group from the family?')) return;

    try {
      const response = await fetch(`/api/${tenant}/product-families/${family.id}/field-groups/${assignmentId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const result = await parseJsonSafely(response);
        throw new Error(result?.error || 'Failed to remove field group');
      }

      await fetchFamily();
      await Promise.all([fetchFamilyAttributes(), fetchVariantAttributes()]);
    } catch (error) {
      console.error('Error removing group:', error);
      setError('Failed to remove field group');
    }
  };

  const handleToggleFieldVisibility = (assignmentId: string, fieldId: string, currentlyHidden: boolean) => {
    // Optimistic update - update UI immediately
    setAssignedGroups(prevGroups =>
      prevGroups.map(group => {
        if (group.id === assignmentId) {
          const hiddenFields = group.hidden_fields || [];
          const newHiddenFields = currentlyHidden
            ? hiddenFields.filter(id => id !== fieldId)
            : [...hiddenFields, fieldId];

          // Track this change for later saving
          setPendingChanges(prev => {
            const updated = new Map(prev);
            updated.set(assignmentId, newHiddenFields);
            return updated;
          });

          return {
            ...group,
            hidden_fields: newHiddenFields
          };
        }
        return group;
      })
    );
  };

  // Variant Axes handlers
  const getAvailableProductFields = () => {
    const assignedFieldIds = new Set(variantAttributes.map(va => va.product_field_id));
    const familyAttributeCodes = new Set(familyAttributes.map(attr => attr.attribute_code));
    return allProductFields.filter(field =>
      !assignedFieldIds.has(field.id) && familyAttributeCodes.has(field.code)
    );
  };

  const handleAddVariantAttributes = async () => {
    if (selectedFieldsToAdd.length === 0) return;

    try {
      for (const fieldId of selectedFieldsToAdd) {
        const response = await fetch(`/api/${tenant}/product-families/${family.id}/variant-attributes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_field_id: fieldId,
            sort_order: variantAttributes.length + 1,
            is_required: false
          })
        });

        if (!response.ok) {
          const result = await parseJsonSafely(response);
          throw new Error(result?.error || 'Failed to add variant attribute');
        }
      }

      await fetchVariantAttributes();
      setSelectedFieldsToAdd([]);
      setShowAddVariantAttributesDialog(false);
    } catch (error) {
      console.error('Error adding variant attributes:', error);
      setError('Failed to add variant attributes');
    }
  };

  const handleRemoveVariantAttribute = async (attributeId: string) => {
    if (!confirm('Remove this variant attribute? This may affect existing variants.')) return;

    try {
      await fetch(`/api/${tenant}/product-families/${family.id}/variant-attributes/${attributeId}`, {
        method: 'DELETE'
      });

      await fetchVariantAttributes();
    } catch (error) {
      console.error('Error removing variant attribute:', error);
      setError('Failed to remove variant attribute');
    }
  };

  const handleReorderVariantAttributes = async (reorderedAttributes: VariantAttribute[]) => {
    // Update local state immediately
    setVariantAttributes(reorderedAttributes);

    // Send update to server
    try {
      await fetch(`/api/${tenant}/product-families/${family.id}/variant-attributes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attributes: reorderedAttributes.map((attr, index) => ({
            id: attr.id,
            sort_order: index,
            is_required: attr.is_required
          }))
        })
      });
    } catch (error) {
      console.error('Error reordering variant attributes:', error);
      setError('Failed to reorder variant attributes');
      // Revert on error
      await fetchVariantAttributes();
    }
  };

  const handleToggleVariantAttributeRequired = async (attributeId: string, isRequired: boolean) => {
    try {
      await fetch(`/api/${tenant}/product-families/${family.id}/variant-attributes/${attributeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_required: isRequired })
      });

      // Update local state
      setVariantAttributes(prev =>
        prev.map(attr =>
          attr.id === attributeId ? { ...attr, is_required: isRequired } : attr
        )
      );
    } catch (error) {
      console.error('Error updating variant attribute:', error);
      setError('Failed to update variant attribute');
    }
  };

  const handleVariantAxesDialogOpenChange = (open: boolean) => {
    setShowAddVariantAttributesDialog(open);
    if (open) {
      void fetchFamilyAttributes();
      void fetchVariantAttributes();
    } else {
      setSelectedFieldsToAdd([]);
    }
  };

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageLoader text="Loading family..." size="lg" />
      </div>
    );
  }

  if (error || !family) {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Family not found'}</p>
          <Button variant="outline" onClick={() => router.push(`/${tenant}/settings/product-models`)}>
            Back to Families
          </Button>
        </div>
      </div>
    );
  }

  const hasFamilyAttributes = familyAttributes.length > 0;

  return (
    <div className="h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-white">
        <PageContentContainer mode="content" className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/${tenant}/settings/product-models`)}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Families
              </Button>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium">{family.name}</span>
              <Badge variant="outline">{assignedGroups.length} groups</Badge>
            </div>
          </div>
        </PageContentContainer>
      </div>

      {/* Main content */}
      <PageContentContainer mode="content" className="px-6 py-6">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>{family.name}</CardTitle>
            <CardDescription>{family.description || "No description"}</CardDescription>
          </CardHeader>

          {/* Tabs */}
          <div className="border-b border-border">
            <div className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'overview'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('groups')}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'groups'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Groups
                <Badge variant="secondary" className="ml-2">
                  {assignedGroups.length}
                </Badge>
              </button>
              <button
                onClick={() => setActiveTab('attributes')}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'attributes'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Attributes
                <Badge variant="secondary" className="ml-2">
                  {familyAttributes.length}
                </Badge>
              </button>
              <button
                onClick={() => setActiveTab('variant-axes')}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'variant-axes'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Variant Axes
                <Badge variant="secondary" className="ml-2">
                  {variantAttributes.length}
                </Badge>
              </button>
              <button
                onClick={() => setActiveTab('rules')}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'rules'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Rules & Completeness
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'history'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                History
              </button>
            </div>
          </div>

          <CardContent className="p-0">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div>
                <div className="p-6 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Product Model Overview</h3>
                      <p className="text-sm text-muted-foreground">
                        Families define product types. Groups organize attributes. Attributes are inheritable by default.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 grid gap-4 md:grid-cols-3">
                  <Card className="border border-border/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Groups</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-semibold text-foreground">{assignedGroups.length}</div>
                      <p className="text-xs text-muted-foreground">Attribute groups assigned</p>
                    </CardContent>
                  </Card>
                  <Card className="border border-border/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Attributes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-semibold text-foreground">{familyAttributes.length}</div>
                      <p className="text-xs text-muted-foreground">Attributes in this family</p>
                    </CardContent>
                  </Card>
                  <Card className="border border-border/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Variant Axes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-semibold text-foreground">{variantAttributes.length}</div>
                      <p className="text-xs text-muted-foreground">Attributes used for variants</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* Groups Tab */}
            {activeTab === 'groups' && (
              <div>
                {/* Header with Add button */}
                <div className="p-6 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Groups & Attribute Visibility</h3>
                      <p className="text-sm text-muted-foreground">
                        Assign groups to this family and control which attributes are visible
                      </p>
                    </div>
                    <Button variant="secondary" onClick={() => setShowAddGroupsDialog(true)}>
                      <Plus className="w-4 h-4" />
                      Add Groups
                    </Button>
                  </div>
                </div>

                {/* Groups List */}
                {assignedGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Layers className="w-12 h-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No Groups Assigned</h3>
                    <p className="text-muted-foreground max-w-md">
                      Assign groups to define the product template for this family
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {assignedGroups.map((assignment) => (
                      <div key={assignment.id} className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h4 className="font-medium">{assignment.field_group.name}</h4>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveGroup(assignment.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        {assignment.fields && assignment.fields.length > 0 ? (
                          <div className="space-y-1">
                            <div className="grid gap-1">
                              {assignment.fields.map((field) => {
                                const isVisible = !assignment.hidden_fields?.includes(field.id);
                                return (
                                  <div
                                    key={field.id}
                                    className="flex items-center justify-between py-2 px-3 hover:bg-muted/30 rounded-md transition-colors"
                                  >
                                    <div className="flex-1">
                                      <div className="font-medium text-sm leading-tight">{field.name}</div>
                                    </div>
                                    <Switch
                                      checked={isVisible}
                                      onCheckedChange={() => handleToggleFieldVisibility(assignment.id, field.id, !isVisible)}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            No attributes in this group
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Attributes Tab */}
            {activeTab === 'attributes' && (
              <div>
                <div className="p-6 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Family Attributes</h3>
                      <p className="text-sm text-muted-foreground">
                        Attributes define the data captured for this family and are inheritable by default.
                      </p>
                    </div>
                  </div>
                </div>

                {familyAttributes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Layers className="w-12 h-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No Attributes Yet</h3>
                    <p className="text-muted-foreground max-w-md">
                      Assign groups and attributes first so this family has a product template.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {familyAttributes.map((attribute) => (
                      <div key={attribute.id} className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-foreground">{attribute.attribute_label}</h4>
                              <Badge variant="outline" className="text-xs">
                                {attribute.attribute_type}
                              </Badge>
                              {attribute.is_required && (
                                <Badge variant="default" className="text-xs">
                                  Required
                                </Badge>
                              )}
                              {attribute.is_unique && (
                                <Badge variant="secondary" className="text-xs">
                                  Unique
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Code: {attribute.attribute_code}
                            </div>
                            {attribute.help_text && (
                              <p className="text-sm text-muted-foreground mt-2">{attribute.help_text}</p>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {attribute.inherit_level_1 ? 'Inherits' : 'No inherit'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Variant Axes Tab */}
            {activeTab === 'variant-axes' && (
              <div>
                {/* Header with Add button */}
                <div className="p-6 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Variant Axes</h3>
                      <p className="text-sm text-muted-foreground">
                        Select the attributes that define variant combinations for this family.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => handleVariantAxesDialogOpenChange(true)}
                      disabled={!hasFamilyAttributes}
                    >
                      <Plus className="w-4 h-4" />
                      Add Variant Axes
                    </Button>
                  </div>
                </div>

                {!hasFamilyAttributes && (
                  <div className="mx-6 -mt-2 mb-6 rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">No attributes available yet</p>
                    <p>
                      Assign groups with attributes to this family first so attributes become available for variants.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('groups')}
                      className="mt-3 text-sm font-medium text-primary hover:underline"
                    >
                      Go to Groups
                    </button>
                  </div>
                )}

                {/* Variant Axes List */}
                {variantAttributes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Layers className="w-12 h-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No Variant Axes Configured</h3>
                    <p className="text-muted-foreground max-w-md">
                      {hasFamilyAttributes
                        ? 'Add attributes to define how variants will be structured for this family. For example, add "Flavor" and "Size" attributes to create variants like "Chocolate 2lb" or "Vanilla 5lb".'
                        : 'Assign groups with attributes first so attributes are available to use as variant axes.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {variantAttributes.map((attribute, index) => (
                      <div key={attribute.id} className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                                {index + 1}
                              </span>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-foreground">{attribute.field_name}</h4>
                                <Badge variant="outline" className="text-xs">
                                  {attribute.field_type}
                                </Badge>
                                {attribute.is_required && (
                                  <Badge variant="default" className="text-xs">
                                    Required
                                  </Badge>
                                )}
                              </div>
                              {attribute.field_description && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {attribute.field_description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Required</span>
                              <Switch
                                checked={attribute.is_required}
                                onCheckedChange={(checked) =>
                                  handleToggleVariantAttributeRequired(attribute.id, checked)
                                }
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveVariantAttribute(attribute.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {variantAttributes.length > 0 && (
                  <div className="p-6 border-t border-border bg-muted/30">
                    <div className="flex items-start gap-2">
                      <div className="text-sm text-muted-foreground">
                        <p className="font-medium text-foreground mb-1">How variant axes work:</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Attributes are displayed in the order shown above</li>
                          <li>Required attributes must be filled when creating variants</li>
                          <li>Variant SKUs are not generated automatically</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rules & Completeness Tab */}
            {activeTab === 'rules' && (
              <div>
                <div className="p-6 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Rules & Completeness</h3>
                      <p className="text-sm text-muted-foreground">
                        Configure required attributes and completeness rules by market, channel, or locale.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Require SKU to Activate</p>
                        <p className="text-xs text-muted-foreground">
                          Draft products may omit SKU, but Active products must have one.
                        </p>
                      </div>
                      <Switch
                        checked={family.require_sku_on_active ?? true}
                        onCheckedChange={(checked) => handleRuleChange({ require_sku_on_active: checked })}
                        disabled={rulesSaving}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Require Barcode to Activate</p>
                        <p className="text-xs text-muted-foreground">
                          If enabled, Active products must include a barcode.
                        </p>
                      </div>
                      <Switch
                        checked={family.require_barcode_on_active ?? false}
                        onCheckedChange={(checked) => handleRuleChange({ require_barcode_on_active: checked })}
                        disabled={rulesSaving}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                    <p className="text-sm font-medium text-foreground mb-1">Completeness Rules (Coming Soon)</p>
                    <p className="text-xs text-muted-foreground">
                      Configure required attributes and asset roles by channel, market, or locale.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div>
                <div className="p-6 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Change History</h3>
                      <p className="text-sm text-muted-foreground">
                        Track all changes made to this product family and its groups.
                      </p>
                    </div>
                  </div>
                </div>

                {historyData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Layers className="w-12 h-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No Changes Yet</h3>
                    <p className="text-muted-foreground max-w-md">
                      Changes to this product family and its groups will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {historyData.map((entry, index) => (
                      <div key={index} className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium">{entry.action}</h4>
                              <Badge variant="outline" className="text-xs">
                                {entry.type}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">{entry.description}</p>
                            <div className="text-xs text-muted-foreground">
                              {entry.timestamp && new Date(entry.timestamp).toLocaleString()} by {entry.user}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </PageContentContainer>

      {/* Add Groups Dialog */}
      <Dialog open={showAddGroupsDialog} onOpenChange={setShowAddGroupsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Groups to {family.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {getAvailableGroups().length === 0 ? (
              <p className="text-sm text-muted-foreground">All groups are already assigned to this family.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto border rounded-lg divide-y">
                {getAvailableGroups().map((group) => (
                  <label
                    key={group.id}
                    className="flex items-center gap-3 p-4 hover:bg-muted/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedGroupsToAdd.includes(group.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedGroupsToAdd([...selectedGroupsToAdd, group.id]);
                        } else {
                          setSelectedGroupsToAdd(selectedGroupsToAdd.filter(id => id !== group.id));
                        }
                      }}
                      className="rounded"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{group.name}</div>
                      <div className="text-sm text-muted-foreground">{group.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddGroupsDialog(false);
                  setSelectedGroupsToAdd([]);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="accent-blue"
                onClick={handleAddGroups}
                disabled={selectedGroupsToAdd.length === 0}
              >
                Add {selectedGroupsToAdd.length} Group{selectedGroupsToAdd.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Variant Axes Dialog */}
      <Dialog open={showAddVariantAttributesDialog} onOpenChange={handleVariantAxesDialogOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Variant Axes to {family.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select attributes to use as variant axes. These will define how variants can be created for products in this family.
            </p>

            {getAvailableProductFields().length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {familyAttributes.length === 0
                  ? 'Assign groups with attributes to this family before selecting variant axes.'
                  : 'All available attributes are already assigned as variant axes.'}
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto border rounded-lg divide-y">
                {getAvailableProductFields().map((field) => (
                  <label
                    key={field.id}
                    className="flex items-center gap-3 p-4 hover:bg-muted/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFieldsToAdd.includes(field.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFieldsToAdd([...selectedFieldsToAdd, field.id]);
                        } else {
                          setSelectedFieldsToAdd(selectedFieldsToAdd.filter(id => id !== field.id));
                        }
                      }}
                      className="rounded"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{field.name}</div>
                        <Badge variant="outline" className="text-xs">
                          {field.field_type}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {field.description || `Code: ${field.code}`}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddVariantAttributesDialog(false);
                  setSelectedFieldsToAdd([]);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="accent-blue"
                onClick={handleAddVariantAttributes}
                disabled={selectedFieldsToAdd.length === 0}
              >
                Add {selectedFieldsToAdd.length} Attribute{selectedFieldsToAdd.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

