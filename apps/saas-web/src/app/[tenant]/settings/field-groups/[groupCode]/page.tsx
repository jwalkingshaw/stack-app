'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DeleteConfirmDialog } from '@/components/ui/modal-shells';
import { Input } from '@/components/ui/input';
import { ItemList } from '@/components/ui/item-list';
import { Lock, Plus, Search, Trash2 } from 'lucide-react';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { isLockedFieldGroupCode } from '@/lib/field-group-codes';
import { SettingsSecondLevelPage } from '../../components/settings-page-content';
import { SettingsDetailHeader } from '../../components/settings-detail-header';

const LOCKED_CORE_FIELD_CODES = new Set([
  'title',
  'scin',
  'sku',
  'barcode',
  'coa_documents',
  'legal_documents',
  'sfp_documents',
]);

interface FieldGroup {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  sort_order: number;
  created_at: string;
}

interface AssignedField {
  id: string;
  assignment_id: string;
  name: string;
  code: string;
  field_type?: string;
  type?: string;
  description?: string | null;
  sort_order: number;
  is_required?: boolean;
  is_unique?: boolean;
  is_localizable?: boolean;
  is_channelable?: boolean;
}

interface AvailableField {
  id: string;
  name: string;
  code: string;
  field_type?: string;
  type?: string;
  description?: string | null;
  is_assigned?: boolean;
}

interface AssignedFieldResponse {
  id: string;
  sort_order: number;
  product_fields?: AssignedField | null;
}

interface ErrorResponse {
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

export default function FieldGroupDetailPage({
  params
}: {
  params: Promise<{ tenant: string; groupCode: string }>
}) {
  const { tenant, groupCode } = use(params);
  const router = useRouter();

  const [fieldGroup, setFieldGroup] = useState<FieldGroup | null>(null);
  const [assignedFields, setAssignedFields] = useState<AssignedField[]>([]);
  const [availableFields, setAvailableFields] = useState<AvailableField[]>([]);
  const [availableFieldsSearch, setAvailableFieldsSearch] = useState('');
  const [selectedFieldsToAdd, setSelectedFieldsToAdd] = useState<string[]>([]);
  const [showAddFieldsDialog, setShowAddFieldsDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailsName, setDetailsName] = useState('');
  const [detailsDescription, setDetailsDescription] = useState('');
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [availableFieldsLoading, setAvailableFieldsLoading] = useState(false);
  const [availableFieldsError, setAvailableFieldsError] = useState<string | null>(null);
  const [hasLoadedAvailableFields, setHasLoadedAvailableFields] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAvailableFields([]);
    setAvailableFieldsSearch('');
    setSelectedFieldsToAdd([]);
    setAvailableFieldsError(null);
    setHasLoadedAvailableFields(false);
  }, [tenant, groupCode]);

  const isLockedGroup = isLockedFieldGroupCode(fieldGroup?.code || groupCode);

  const sortedAssignedFields = useMemo(
    () => [...assignedFields].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [assignedFields]
  );

  const filteredAvailableFields = useMemo(() => {
    const search = availableFieldsSearch.trim().toLowerCase();
    return availableFields.filter((field) => {
      if (!search) return true;
      return (
        field.name.toLowerCase().includes(search) ||
        field.code.toLowerCase().includes(search) ||
        (field.description || '').toLowerCase().includes(search)
      );
    });
  }, [availableFields, availableFieldsSearch]);

  const fetchFieldGroup = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const groupResponse = await fetch(`/api/${tenant}/field-groups/${groupCode}`);
      const groupResult = await parseJsonSafely<FieldGroup & ErrorResponse>(groupResponse);

      if (!groupResponse.ok || !groupResult?.id) {
        throw new Error(groupResult?.error || 'Failed to fetch field group');
      }

      setFieldGroup(groupResult);
      setDetailsName(groupResult.name || '');
      setDetailsDescription(groupResult.description || '');

      const fieldsResponse = await fetch(`/api/${tenant}/field-groups/${groupResult.id}/fields`);
      const fieldsResult = await parseJsonSafely<AssignedFieldResponse[] & ErrorResponse>(fieldsResponse);
      if (!fieldsResponse.ok) {
        throw new Error(fieldsResult?.error || 'Failed to fetch attributes');
      }

      const normalized = Array.isArray(fieldsResult)
        ? fieldsResult
            .map((assignment) => {
              const field = assignment.product_fields;
              if (!field?.id || !field.name || !field.code) return null;
              return {
                ...field,
                assignment_id: assignment.id,
                sort_order: assignment.sort_order,
              };
            })
            .filter((field): field is AssignedField => Boolean(field))
        : [];

      setAssignedFields(normalized);
    } catch (fetchError) {
      console.error('Error fetching field group detail:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch field group');
    } finally {
      setLoading(false);
    }
  }, [tenant, groupCode]);

  const fetchAvailableFields = useCallback(async (force = false) => {
    if (availableFieldsLoading) return;
    if (!force && hasLoadedAvailableFields) return;

    try {
      setAvailableFieldsLoading(true);
      setAvailableFieldsError(null);

      const response = await fetch(`/api/${tenant}/field-groups/${groupCode}/available-fields`);
      const result = await parseJsonSafely<AvailableField[] & ErrorResponse>(response);

      if (!response.ok) {
        throw new Error(result?.error || 'Failed to fetch available attributes');
      }

      setAvailableFields(Array.isArray(result) ? result : []);
      setHasLoadedAvailableFields(true);
    } catch (fetchError) {
      console.error('Error fetching available fields:', fetchError);
      setAvailableFields([]);
      setAvailableFieldsError(
        fetchError instanceof Error ? fetchError.message : 'Failed to fetch available attributes'
      );
    } finally {
      setAvailableFieldsLoading(false);
    }
  }, [availableFieldsLoading, hasLoadedAvailableFields, tenant, groupCode]);

  useEffect(() => {
    void fetchFieldGroup();
  }, [fetchFieldGroup]);

  useEffect(() => {
    if (showAddFieldsDialog) {
      void fetchAvailableFields();
    }
  }, [showAddFieldsDialog, fetchAvailableFields]);

  const toggleFieldSelection = (fieldId: string) => {
    setSelectedFieldsToAdd((prev) =>
      prev.includes(fieldId) ? prev.filter(id => id !== fieldId) : [...prev, fieldId]
    );
  };

  const handleAddFieldsToGroup = async () => {
    if (!fieldGroup || selectedFieldsToAdd.length === 0) return;

    try {
      const alreadyAssignedIds = new Set(sortedAssignedFields.map(field => field.id));
      const newFieldIds = selectedFieldsToAdd.filter(id => !alreadyAssignedIds.has(id));

      for (let index = 0; index < newFieldIds.length; index += 1) {
        const fieldId = newFieldIds[index];
        const response = await fetch(`/api/${tenant}/field-groups/${fieldGroup.id}/fields`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_field_id: fieldId,
            sort_order: sortedAssignedFields.length + index + 1
          })
        });

        if (!response.ok) {
          const result = await parseJsonSafely<ErrorResponse>(response);
          throw new Error(result?.error || 'Failed to add attributes');
        }
      }

      await fetchFieldGroup();
      setHasLoadedAvailableFields(false);
      setSelectedFieldsToAdd([]);
      setAvailableFieldsSearch('');
      setShowAddFieldsDialog(false);
    } catch (saveError) {
      console.error('Error adding attributes to group:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Failed to add attributes');
    }
  };

  const handleRemoveFieldFromGroup = async (field: AssignedField) => {
    if (!fieldGroup) return;

    const confirmed = confirm(`Remove "${field.name}" from this attribute group?`);
    if (!confirmed) return;

    try {
      const response = await fetch(
        `/api/${tenant}/field-groups/${fieldGroup.id}/fields?fieldId=${field.id}`,
        { method: 'DELETE' }
      );
      const result = await parseJsonSafely<ErrorResponse>(response);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to remove attribute');
      }
      await fetchFieldGroup();
      setHasLoadedAvailableFields(false);
    } catch (removeError) {
      console.error('Error removing attribute from group:', removeError);
      setError(removeError instanceof Error ? removeError.message : 'Failed to remove attribute');
    }
  };

  const handleDeleteGroup = async () => {
    if (isLockedGroup) return;

    try {
      setDeleteLoading(true);
      setDeleteError(null);

      const response = await fetch(`/api/${tenant}/field-groups/${groupCode}`, {
        method: 'DELETE'
      });
      const result = await parseJsonSafely<ErrorResponse>(response);

      if (!response.ok) {
        throw new Error(result?.error || 'Failed to delete attribute group');
      }

      setShowDeleteDialog(false);
      router.push(`/${tenant}/settings/field-groups`);
    } catch (deleteErr) {
      console.error('Error deleting attribute group:', deleteErr);
      setDeleteError(deleteErr instanceof Error ? deleteErr.message : 'Failed to delete attribute group');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSaveDetails = async (
    nextName: string = detailsName,
    nextDescription: string = detailsDescription
  ) => {
    if (!fieldGroup || isLockedGroup) return;

    const name = nextName.trim();
    const description = nextDescription.trim();
    const currentName = fieldGroup.name.trim();
    const currentDescription = (fieldGroup.description || '').trim();

    if (!name) {
      setDetailsError('Group name is required');
      setDetailsName(fieldGroup.name);
      return;
    }

    if (name === currentName && description === currentDescription) return;

    try {
      setDetailsSaving(true);
      setDetailsError(null);

      const response = await fetch(`/api/${tenant}/field-groups/${groupCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description
        })
      });
      const result = await parseJsonSafely<Partial<FieldGroup> & ErrorResponse>(response);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to update attribute group');
      }

      setFieldGroup((prev) =>
        prev
          ? {
              ...prev,
              name: result?.name ?? name,
              description: result?.description ?? description
            }
          : prev
      );
      setDetailsName((result?.name ?? name) || '');
      setDetailsDescription((result?.description ?? description) || '');
    } catch (saveError) {
      console.error('Error updating attribute group details:', saveError);
      setDetailsError(
        saveError instanceof Error ? saveError.message : 'Failed to update attribute group'
      );
    } finally {
      setDetailsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageSkeleton text="Loading attribute group..." size="lg" variant="settings-detail" />
      </div>
    );
  }

  if (error || !fieldGroup) {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Attribute group not found'}</p>
          <Button variant="outline" onClick={() => router.push(`/${tenant}/settings/field-groups`)}>
            Back to Attribute Groups
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <SettingsSecondLevelPage page="field-group-detail">
        <SettingsDetailHeader
          backHref={`/${tenant}/settings/field-groups`}
          backLabel="Attribute Groups"
          title={fieldGroup.name}
          onRename={isLockedGroup ? undefined : async (name) => handleSaveDetails(name, fieldGroup.description ?? '')}
          description={fieldGroup.description}
          onEditDescription={isLockedGroup ? undefined : async (desc) => handleSaveDetails(fieldGroup.name, desc)}
          descriptionPlaceholder="Add a short description..."
          meta={[{ label: `${sortedAssignedFields.length} attributes` }]}
          actions={
            isLockedGroup ? (
              <Badge variant="neutral" className="gap-1">
                <Lock className="h-3 w-3" />
                Locked
              </Badge>
            ) : (
              <Button
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                disabled={detailsSaving}
                onClick={() => { setDeleteError(null); setShowDeleteDialog(true); }}
              >
                Delete group
              </Button>
            )
          }
        />
        {detailsError && (
          <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {detailsError}
          </div>
        )}

        <section>
          <ItemList
            items={sortedAssignedFields}
            getKey={(field) => field.id}
            renderTitle={(field) => field.name}
            renderSubtitle={(field) => field.description || field.field_type || field.type || 'No description'}
            renderRight={(field) => {
              const fieldCode = (field.code || '').toLowerCase();
              const canRemove = !(isLockedGroup && LOCKED_CORE_FIELD_CODES.has(fieldCode));
              return (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {field.field_type || field.type || 'attribute'}
                  </Badge>
                  {field.is_required ? (
                    <Badge variant="secondary" className="text-xs bg-red-50 text-red-700">
                      Required
                    </Badge>
                  ) : null}
                  {field.is_unique ? (
                    <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">
                      Unique
                    </Badge>
                  ) : null}
                  {field.is_localizable ? (
                    <Badge variant="secondary" className="text-xs bg-green-50 text-green-700">
                      Localizable
                    </Badge>
                  ) : null}
                  {field.is_channelable ? (
                    <Badge variant="secondary" className="text-xs bg-yellow-50 text-yellow-700">
                      Channel
                    </Badge>
                  ) : null}
                  {canRemove ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                      onClick={() => handleRemoveFieldFromGroup(field)}
                      aria-label={`Remove ${field.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              );
            }}
            headerLabel="attributes"
            headerAction={
              !isLockedGroup ? (
                <button
                  type="button"
                  onClick={() => setShowAddFieldsDialog(true)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-foreground/80"
                  aria-label="Add attributes"
                >
                  <Plus className="h-4 w-4" />
                  Add attributes
                </button>
              ) : null
            }
            emptyMessage={
              isLockedGroup
                ? 'No attributes in this system group.'
                : 'No attributes assigned yet. Add attributes to build this group.'
            }
          />
        </section>
      </SettingsSecondLevelPage>

      <Dialog
        open={showAddFieldsDialog}
        onOpenChange={(open) => {
          setShowAddFieldsDialog(open);
          if (!open) {
            setSelectedFieldsToAdd([]);
            setAvailableFieldsSearch('');
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Attributes to {fieldGroup.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={availableFieldsSearch}
                onChange={(e) => setAvailableFieldsSearch(e.target.value)}
                placeholder="Search attributes..."
                className="pl-9"
              />
            </div>

            {availableFieldsLoading ? (
              <div className="rounded-lg border border-border/60 px-4 py-12 text-center text-sm text-muted-foreground">
                Loading attributes...
              </div>
            ) : availableFieldsError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-12 text-center text-sm text-red-700">
                {availableFieldsError}
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <ItemList
                  items={filteredAvailableFields}
                  getKey={(field) => field.id}
                  renderTitle={(field) => field.name}
                  renderSubtitle={(field) => field.description || undefined}
                  renderRight={(field) => (
                    <div className="flex items-center gap-2">
                      {field.is_assigned ? (
                        <Badge variant="secondary" className="text-xs">
                          Already in group
                        </Badge>
                      ) : null}
                      <input
                        type="checkbox"
                        checked={selectedFieldsToAdd.includes(field.id)}
                        disabled={Boolean(field.is_assigned)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => {
                          if (field.is_assigned) return;
                          toggleFieldSelection(field.id);
                        }}
                        className="h-4 w-4 rounded border-border/60"
                      />
                    </div>
                  )}
                  onClickItem={(field) => {
                    if (field.is_assigned) return;
                    toggleFieldSelection(field.id);
                  }}
                  headerLabel="available attributes"
                  showIndicator={false}
                  emptyMessage="No available attributes found."
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddFieldsDialog(false);
                  setSelectedFieldsToAdd([]);
                  setAvailableFieldsSearch('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="accent-blue"
                onClick={handleAddFieldsToGroup}
                disabled={selectedFieldsToAdd.length === 0}
              >
                Add {selectedFieldsToAdd.length} Attribute{selectedFieldsToAdd.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open);
          if (!open) {
            setDeleteError(null);
          }
        }}
        title="Delete Attribute Group"
        description={`Delete "${fieldGroup.name}" permanently. This action cannot be undone.`}
        onConfirm={handleDeleteGroup}
        confirmLabel="Delete group"
        confirmLoading={deleteLoading}
        safetyMode="typed"
        confirmPhrase="delete"
      >
        {deleteError ? (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
            {deleteError}
          </div>
        ) : null}
      </DeleteConfirmDialog>
    </>
  );
}

