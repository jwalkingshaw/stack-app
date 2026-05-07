'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DeleteConfirmDialog } from '@/components/ui/modal-shells';
import { Switch } from '@/components/ui/switch';
import { ItemList } from '@/components/ui/item-list';
import { Plus, Trash2 } from 'lucide-react';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { SettingsSecondLevelPage } from '../../components/settings-page-content';
import { SettingsDetailHeader } from '../../components/settings-detail-header';

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
  validation_rules?: Record<string, unknown> | null;
  options?: unknown;
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

interface ProductFamily {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
}

interface FamilyFieldGroupAssignmentResponse {
  id: string;
  field_group_id: string;
  field_groups: FieldGroup;
  hidden_fields?: string[] | null;
  sort_order: number;
}

interface FieldGroupFieldsResponse {
  product_fields?: ProductField | null;
}

interface ErrorResponse {
  error?: string;
}

interface DataResponse<T> {
  data?: T;
  error?: string;
}

async function parseJsonSafely<T = unknown>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
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

  const [family, setFamily] = useState<ProductFamily | null>(null);
  const [assignedGroups, setAssignedGroups] = useState<FamilyFieldGroup[]>([]);
  const [loadedGroupFieldIds, setLoadedGroupFieldIds] = useState<Set<string>>(new Set());
  const [allFieldGroups, setAllFieldGroups] = useState<FieldGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupFieldsLoading, setGroupFieldsLoading] = useState(false);
  const [loadingAllFieldGroups, setLoadingAllFieldGroups] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddGroupsDialog, setShowAddGroupsDialog] = useState(false);
  const [selectedGroupsToAdd, setSelectedGroupsToAdd] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Map<string, string[]>>(new Map());
  const [, setSaveStatus] = useState<'saved' | 'saving' | 'pending'>('saved');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Variant attributes state
  const [variantAttributes, setVariantAttributes] = useState<VariantAttribute[]>([]);
  const [allProductFields, setAllProductFields] = useState<ProductField[]>([]);
  const [loadingAllProductFields, setLoadingAllProductFields] = useState(false);
  const [showAddVariantAttributesDialog, setShowAddVariantAttributesDialog] = useState(false);
  const [selectedFieldsToAdd, setSelectedFieldsToAdd] = useState<string[]>([]);
  const [familyAttributes, setFamilyAttributes] = useState<FamilyAttribute[]>([]);
  const groupFieldsRequestIdRef = useRef(0);

  // Debounced save function
  const debouncedSave = useCallback(async () => {
    if (pendingChanges.size === 0) return;
    if (!family?.id) return;

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

  const hydrateGroupFields = useCallback(async (
    assignments: FamilyFieldGroupAssignmentResponse[],
    requestId: number
  ) => {
    if (assignments.length === 0) {
      if (requestId === groupFieldsRequestIdRef.current) {
        setLoadedGroupFieldIds(new Set());
        setGroupFieldsLoading(false);
      }
      return;
    }

    setGroupFieldsLoading(true);

    const fieldsByAssignment = new Map<string, ProductField[]>();
    const loadedIds = new Set<string>();

    await Promise.all(
      assignments.map(async (item) => {
        try {
          const fieldsResponse = await fetch(`/api/${tenant}/field-groups/${item.field_group_id}/fields`);
          if (!fieldsResponse.ok) {
            console.warn('Failed to fetch fields for field group:', item.field_group_id);
            loadedIds.add(item.id);
            fieldsByAssignment.set(item.id, []);
            return;
          }

          const fieldsData =
            (await parseJsonSafely<FieldGroupFieldsResponse[]>(fieldsResponse)) || [];
          const fields = fieldsData
            .map((field) => field.product_fields)
            .filter((field): field is ProductField => Boolean(field));

          loadedIds.add(item.id);
          fieldsByAssignment.set(item.id, fields);
        } catch (err) {
          console.error('Error hydrating fields for group:', item.field_group_id, err);
          loadedIds.add(item.id);
          fieldsByAssignment.set(item.id, []);
        }
      })
    );

    if (requestId !== groupFieldsRequestIdRef.current) return;

    setAssignedGroups((prev) =>
      prev.map((group) =>
        fieldsByAssignment.has(group.id)
          ? { ...group, fields: fieldsByAssignment.get(group.id) || [] }
          : group
      )
    );
    setLoadedGroupFieldIds(loadedIds);
    setGroupFieldsLoading(false);
  }, [tenant]);

  const fetchAssignedGroups = useCallback(async (familyId: string) => {
    try {
      setGroupsLoading(true);
      const groupsResponse = await fetch(`/api/${tenant}/product-families/${familyId}/field-groups`);
      if (!groupsResponse.ok) {
        console.warn('Failed to fetch field groups, but continuing with empty array');
        setAssignedGroups([]);
        setLoadedGroupFieldIds(new Set());
        return;
      }

      const groupsData =
        (await parseJsonSafely<FamilyFieldGroupAssignmentResponse[]>(groupsResponse)) || [];

      const transformed = groupsData.map((item) => ({
        id: item.id,
        field_group_id: item.field_group_id,
        field_group: item.field_groups,
        hidden_fields: item.hidden_fields || [],
        sort_order: item.sort_order,
        fields: [] as ProductField[]
      }));

      setAssignedGroups(transformed || []);
      setLoadedGroupFieldIds(new Set());

      const requestId = ++groupFieldsRequestIdRef.current;
      void hydrateGroupFields(groupsData, requestId);
    } catch (err) {
      console.error('Error fetching assigned groups:', err);
      setAssignedGroups([]);
      setLoadedGroupFieldIds(new Set());
    } finally {
      setGroupsLoading(false);
    }
  }, [hydrateGroupFields, tenant]);

  const fetchFamily = useCallback(async (): Promise<ProductFamily | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/${tenant}/product-families/${familyCode}`);
      const result = await parseJsonSafely<DataResponse<ProductFamily>>(response);

      if (!response.ok || !result?.data?.id) {
        setError(result?.error || 'Failed to fetch family');
        setFamily(null);
        return null;
      }

      const normalizedFamily = {
        ...result.data,
        is_active: result.data.is_active !== false,
      };
      setFamily(normalizedFamily);
      return normalizedFamily;
    } catch (err) {
      console.error('Error fetching family:', err);
      setError('Failed to fetch family');
      setFamily(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [tenant, familyCode]);

  const fetchAllFieldGroups = useCallback(async () => {
    if (allFieldGroups.length > 0) return;
    try {
      setLoadingAllFieldGroups(true);
      const response = await fetch(`/api/${tenant}/field-groups`);
      if (response.ok) {
        const data = await parseJsonSafely<FieldGroup[]>(response);
        setAllFieldGroups(data || []);
      } else {
        console.warn('Failed to fetch all field groups, but continuing with empty array');
        setAllFieldGroups([]);
      }
    } catch (error) {
      console.error('Error fetching field groups:', error);
      setAllFieldGroups([]);
    } finally {
      setLoadingAllFieldGroups(false);
    }
  }, [allFieldGroups.length, tenant]);

  const fetchVariantAttributes = useCallback(async () => {
    if (!family?.id) return;

    try {
      const response = await fetch(`/api/${tenant}/product-families/${family.id}/variant-attributes`);
      if (response.ok) {
        const data = (await parseJsonSafely<DataResponse<VariantAttribute[]>>(response)) || {};
        setVariantAttributes(data.data || []);
      } else {
        console.warn('Failed to fetch variant attributes');
        setVariantAttributes([]);
      }
    } catch (error) {
      console.error('Error fetching variant attributes:', error);
      setVariantAttributes([]);
    }
  }, [family?.id, tenant]);

  const fetchFamilyAttributes = useCallback(async () => {
    if (!family?.id) return;

    try {
      const response = await fetch(`/api/${tenant}/product-families/${family.id}/attributes`);
      if (response.ok) {
        const data = (await parseJsonSafely<DataResponse<FamilyAttribute[]>>(response)) || {};
        setFamilyAttributes(data.data || []);
      } else {
        console.warn('Failed to fetch family attributes');
        setFamilyAttributes([]);
      }
    } catch (error) {
      console.error('Error fetching family attributes:', error);
      setFamilyAttributes([]);
    }
  }, [family?.id, tenant]);

  const fetchAllProductFields = useCallback(async () => {
    if (allProductFields.length > 0) return;
    try {
      setLoadingAllProductFields(true);
      const response = await fetch(`/api/${tenant}/product-fields`);
      if (response.ok) {
        const data = await parseJsonSafely<ProductField[]>(response);
        setAllProductFields(data || []);
      } else {
        console.warn('Failed to fetch attributes');
        setAllProductFields([]);
      }
    } catch (error) {
      console.error('Error fetching attributes:', error);
      setAllProductFields([]);
    } finally {
      setLoadingAllProductFields(false);
    }
  }, [allProductFields.length, tenant]);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      const loadedFamily = await fetchFamily();
      if (!isActive || !loadedFamily?.id) return;
      void fetchAssignedGroups(loadedFamily.id);
    };

    void load();

    return () => {
      isActive = false;
    };
  }, [fetchAssignedGroups, fetchFamily]);

  // Fetch variant attributes when family is loaded
  useEffect(() => {
    if (!family?.id) return;
    void fetchVariantAttributes();
    void fetchFamilyAttributes();
  }, [family?.id, fetchVariantAttributes, fetchFamilyAttributes]);

  const getAvailableGroups = () => {
    const assignedIds = new Set(assignedGroups.map(ag => ag.field_group_id));
    return allFieldGroups.filter(group => !assignedIds.has(group.id));
  };

  const handleAddGroups = async () => {
    if (selectedGroupsToAdd.length === 0) return;
    if (!family?.id) return;

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
          const result = await parseJsonSafely<ErrorResponse>(response);
          throw new Error(result?.error || 'Failed to add field group');
        }
      }

      await fetchAssignedGroups(family.id);
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
    if (!family?.id) return;

    try {
      const response = await fetch(`/api/${tenant}/product-families/${family.id}/field-groups/${assignmentId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const result = await parseJsonSafely<ErrorResponse>(response);
        throw new Error(result?.error || 'Failed to remove field group');
      }

      await fetchAssignedGroups(family.id);
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
    if (!family?.id) return;

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
          const result = await parseJsonSafely<ErrorResponse>(response);
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
    if (!family?.id) return;

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

  const handleToggleVariantAttributeRequired = async (attributeId: string, isRequired: boolean) => {
    if (!family?.id) return;
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
      void fetchAllProductFields();
      void fetchFamilyAttributes();
      void fetchVariantAttributes();
    } else {
      setSelectedFieldsToAdd([]);
    }
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroupsToAdd((prev) =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  const toggleFieldSelection = (fieldId: string) => {
    setSelectedFieldsToAdd((prev) =>
      prev.includes(fieldId) ? prev.filter(id => id !== fieldId) : [...prev, fieldId]
    );
  };

  const handleDeleteFamily = async () => {
    if (!family?.id) return;

    try {
      setDeleteLoading(true);
      setDeleteError(null);

      const response = await fetch(`/api/${tenant}/product-families/${family.id}`, {
        method: 'DELETE'
      });
      const result = await parseJsonSafely<ErrorResponse>(response);

      if (!response.ok) {
        throw new Error(result?.error || 'Failed to delete product model');
      }

      setShowDeleteDialog(false);
      router.push(`/${tenant}/settings/product-models`);
    } catch (error) {
      console.error('Error deleting product model:', error);
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete product model');
    } finally {
      setDeleteLoading(false);
    }
  };

  const putFamily = async (patch: Partial<ProductFamily>, rollback: () => void) => {
    if (!family?.id) return;
    try {
      const res = await fetch(`/api/${tenant}/product-families/${family.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: family.name, description: family.description, is_active: family.is_active, ...patch }),
      });
      if (!res.ok) rollback();
      else if ('is_active' in patch && typeof window !== 'undefined') {
        window.dispatchEvent(new Event('market-context:refresh'));
      }
    } catch {
      rollback();
    }
  };

  const handleRenameFamily = async (newName: string) => {
    if (!family) return;
    const prev = family.name;
    setFamily((f) => f ? { ...f, name: newName } : f);
    await putFamily({ name: newName }, () => setFamily((f) => f ? { ...f, name: prev } : f));
  };

  const handleEditFamilyDescription = async (newDescription: string) => {
    if (!family) return;
    const prev = family.description;
    setFamily((f) => f ? { ...f, description: newDescription } : f);
    await putFamily({ description: newDescription }, () => setFamily((f) => f ? { ...f, description: prev } : f));
  };

  const handleToggleActive = async (checked: boolean) => {
    if (!family) return;
    const prev = family.is_active;
    setFamily((f) => f ? { ...f, is_active: checked } : f);
    await putFamily({ is_active: checked }, () => setFamily((f) => f ? { ...f, is_active: prev } : f));
  };

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageSkeleton text="Loading family..." size="lg" variant="settings-detail" />
      </div>
    );
  }

  if (error || !family) {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Family not found'}</p>
          <Button
            variant="outline"
            className="border-0 shadow-none"
            onClick={() => router.push(`/${tenant}/settings/product-models`)}
          >
            Back to Families
          </Button>
        </div>
      </div>
    );
  }

  const hasFamilyAttributes = familyAttributes.length > 0;

  return (
    <>
      <SettingsSecondLevelPage page="product-family-detail">
        <SettingsDetailHeader
          backHref={`/${tenant}/settings/product-models`}
          backLabel="Product Models"
          title={family.name}
          onRename={handleRenameFamily}
          description={family.description}
          onEditDescription={handleEditFamilyDescription}
          descriptionPlaceholder="Add a description..."
          meta={[{ label: family.is_active ? 'Active' : 'Inactive' }]}
          actions={
            <div className="flex items-center gap-2">
              <Switch
                checked={family.is_active}
                onCheckedChange={(checked) => void handleToggleActive(checked)}
              />
              <Button
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                onClick={() => {
                  setDeleteError(null);
                  setShowDeleteDialog(true);
                }}
              >
                Delete model
              </Button>
            </div>
          }
        />
        <section id="groups-section" className="space-y-3">
          <h3 className="text-lg font-medium">Groups & Attribute Visibility</h3>

          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground">
                {assignedGroups.length} {assignedGroups.length === 1 ? 'group' : 'groups'}
              </span>
              <button
                type="button"
                onClick={() => {
                  void fetchAllFieldGroups();
                  setShowAddGroupsDialog(true);
                }}
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-foreground/80"
                aria-label="Add attribute groups"
              >
                <Plus className="h-4 w-4" />
                Add attribute groups
              </button>
            </div>

            {groupsLoading ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                Loading groups...
              </div>
            ) : assignedGroups.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                No groups assigned yet. Add groups to define this model.
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {assignedGroups.map((assignment) => (
                  <div key={assignment.id} className="space-y-3 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-medium text-foreground">{assignment.field_group.name}</h4>
                        {assignment.field_group.description ? (
                          <p className="text-xs text-muted-foreground">{assignment.field_group.description}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveGroup(assignment.id)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-red-700"
                        aria-label={`Remove ${assignment.field_group.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {!loadedGroupFieldIds.has(assignment.id) ? (
                      <div className="py-2 text-sm text-muted-foreground">
                        Loading attributes...
                      </div>
                    ) : (assignment.fields || []).length === 0 ? (
                      <div className="py-2 text-sm text-muted-foreground">
                        No attributes in this group.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {assignment.fields.length} {assignment.fields.length === 1 ? 'attribute' : 'attributes'}
                        </span>
                        <div className="divide-y divide-gray-200">
                          {assignment.fields.map((field) => {
                            const isVisible = !assignment.hidden_fields?.includes(field.id);
                            return (
                              <div key={field.id} className="flex items-center gap-4 py-3">
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-foreground">{field.name}</div>
                                  <div className="mt-0.5 text-xs text-muted-foreground">
                                    {field.description || field.field_type}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    size="sm"
                                    checked={isVisible}
                                    onCheckedChange={() =>
                                      handleToggleFieldVisibility(assignment.id, field.id, !isVisible)
                                    }
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {groupFieldsLoading ? (
              <div className="border-t border-gray-200 px-4 py-2 text-xs text-muted-foreground">
                Syncing attribute visibility data...
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-medium">Variant Axes</h3>

          {!hasFamilyAttributes && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">No attributes available yet</p>
              <p>
                Assign groups with attributes to this family first so attributes become available for variants.
              </p>
              <button
                type="button"
                onClick={() =>
                  document.getElementById('groups-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="mt-3 text-sm font-medium text-primary hover:underline"
              >
                Go to Groups
              </button>
            </div>
          )}

          <ItemList
            items={variantAttributes}
            getKey={(attribute) => attribute.id}
            renderTitle={(attribute) => attribute.field_name}
            renderSubtitle={(attribute) => attribute.field_description || attribute.field_type}
            renderRight={(attribute) => {
              const index = variantAttributes.findIndex((item) => item.id === attribute.id);
              return (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">#{index + 1}</Badge>
                  <span className="text-xs text-muted-foreground">Required</span>
                  <Switch
                    size="sm"
                    checked={attribute.is_required}
                    onCheckedChange={(checked) =>
                      handleToggleVariantAttributeRequired(attribute.id, checked)
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveVariantAttribute(attribute.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            }}
            headerLabel="variant axes"
            headerAction={
              <button
                type="button"
                onClick={() => handleVariantAxesDialogOpenChange(true)}
                disabled={!hasFamilyAttributes}
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-foreground/80 disabled:pointer-events-none disabled:opacity-40"
                aria-label="Add variant axis"
              >
                <Plus className="h-4 w-4" />
                Add variant axis
              </button>
            }
            emptyMessage={
              hasFamilyAttributes
                ? 'No variant axes configured yet.'
                : 'Assign groups with attributes first so attributes are available to use as variant axes.'
            }
          />

          {variantAttributes.length > 0 ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">How variant axes work:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Attributes are displayed in the order shown above</li>
                  <li>Required attributes must be filled when creating variants</li>
                  <li>Variant SKUs are not generated automatically</li>
                </ul>
              </div>
            </div>
          ) : null}
        </section>
      </SettingsSecondLevelPage>

      {/* Add Groups Dialog */}
      <Dialog open={showAddGroupsDialog} onOpenChange={setShowAddGroupsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Groups to {family.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {loadingAllFieldGroups ? (
              <p className="text-sm text-muted-foreground">Loading available groups...</p>
            ) : getAvailableGroups().length === 0 ? (
              <p className="text-sm text-muted-foreground">All groups are already assigned to this product model.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <ItemList
                  items={getAvailableGroups()}
                  getKey={(group) => group.id}
                  renderTitle={(group) => group.name}
                  renderSubtitle={(group) => group.description}
                  renderRight={(group) => (
                    <input
                      type="checkbox"
                      checked={selectedGroupsToAdd.includes(group.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleGroupSelection(group.id)}
                      className="h-4 w-4 rounded border-border/60"
                    />
                  )}
                  onClickItem={(group) => toggleGroupSelection(group.id)}
                  headerLabel="available groups"
                  showIndicator={false}
                  emptyMessage="No groups available to add."
                />
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
              Select attributes to use as variant axes. These will define how variants can be created for products in this product model.
            </p>

            {loadingAllProductFields ? (
              <p className="text-sm text-muted-foreground">Loading available attributes...</p>
            ) : getAvailableProductFields().length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {familyAttributes.length === 0
                  ? 'Assign groups with attributes to this product model before selecting variant axes.'
                  : 'All available attributes are already assigned as variant axes.'}
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <ItemList
                  items={getAvailableProductFields()}
                  getKey={(field) => field.id}
                  renderTitle={(field) => (
                    <div className="flex items-center gap-2">
                      <span>{field.name}</span>
                      <Badge variant="outline" className="text-xs font-normal">
                        {field.field_type}
                      </Badge>
                    </div>
                  )}
                  renderSubtitle={(field) => field.description || field.field_type}
                  renderRight={(field) => (
                    <input
                      type="checkbox"
                      checked={selectedFieldsToAdd.includes(field.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleFieldSelection(field.id)}
                      className="h-4 w-4 rounded border-border/60"
                    />
                  )}
                  onClickItem={(field) => toggleFieldSelection(field.id)}
                  headerLabel="available attributes"
                  showIndicator={false}
                  emptyMessage="No attributes available to add."
                />
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

      {/* Delete Model Dialog */}
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open);
          if (!open) {
            setDeleteError(null);
          }
        }}
        title="Delete Product Model"
        description={`Delete "${family.name}" permanently. This action cannot be undone.`}
        onConfirm={handleDeleteFamily}
        confirmLabel="Delete model"
        confirmLoading={deleteLoading}
        safetyMode="typed"
        confirmPhrase="delete"
      >
        <p className="text-sm text-muted-foreground">
          If products still use this model, deletion will be blocked.
        </p>
        {deleteError ? (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
            {deleteError}
          </div>
        ) : null}
      </DeleteConfirmDialog>
    </>
  );
}

