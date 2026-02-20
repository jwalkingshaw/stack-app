'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowLeft,
  Edit,
  List,
  Plus,
  Search,
  Tag,
  Trash2,
  Eye,
  Minus,
  Type
} from 'lucide-react';
import { PageLoader } from '@/components/ui/loading-spinner';

const LOCKED_GROUP_CODES = new Set(['basic_info']);
const LOCKED_CORE_FIELD_CODES = new Set(['title', 'scin', 'sku', 'barcode']);

// This will be the detailed view for a specific field group
export default function FieldGroupDetailPage({
  params
}: {
  params: Promise<{ tenant: string; groupCode: string }>
}) {
  const { tenant, groupCode } = use(params);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('properties');
  const [showAddFieldsDialog, setShowAddFieldsDialog] = useState(false);
  const [availableFieldsSearch, setAvailableFieldsSearch] = useState("");
  const [selectedFieldsToAdd, setSelectedFieldsToAdd] = useState<string[]>([]);

  const [fieldGroup, setFieldGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignedFields, setAssignedFields] = useState<any[]>([]);
  const [availableFields, setAvailableFields] = useState<any[]>([]);
  const [availableFieldsLoading, setAvailableFieldsLoading] = useState(false);
  const [availableFieldsError, setAvailableFieldsError] = useState<string | null>(null);
  const isLockedGroup = LOCKED_GROUP_CODES.has(groupCode);

  useEffect(() => {
    fetchFieldGroup();
  }, [tenant, groupCode]);

  useEffect(() => {
    if (showAddFieldsDialog) {
      fetchAvailableFields();
    }
  }, [showAddFieldsDialog, tenant]);

  const fetchFieldGroup = async () => {
    try {
      setLoading(true);
      const groupResponse = await fetch(`/api/${tenant}/field-groups/${groupCode}`);
      const groupResult = await groupResponse.json();

      if (groupResponse.ok) {
        setFieldGroup(groupResult);

        // Fetch assigned fields
        const fieldsResponse = await fetch(`/api/${tenant}/field-groups/${groupResult.id}/fields`);
        const fieldsResult = await fieldsResponse.json();

        if (fieldsResponse.ok) {
          setAssignedFields(fieldsResult.map((a: any) => ({
            ...a.product_fields,
            assignment_id: a.id,
            sort_order: a.sort_order
          })));
        }
      } else {
        setError(groupResult.error || 'Failed to fetch field group');
      }
    } catch (error) {
      console.error('Error fetching field group:', error);
      setError('Failed to fetch field group');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableFields = async () => {
    try {
      setAvailableFieldsLoading(true);
      setAvailableFieldsError(null);
      const response = await fetch(`/api/${tenant}/field-groups/${groupCode}/available-fields`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to fetch available attributes');
      }
      setAvailableFields(Array.isArray(result) ? result : []);
    } catch (error) {
      console.error('Error fetching available fields:', error);
      setAvailableFields([]);
      setAvailableFieldsError(
        error instanceof Error ? error.message : 'Failed to fetch available attributes'
      );
    } finally {
      setAvailableFieldsLoading(false);
    }
  };

  const [fieldGroupHistory, setFieldGroupHistory] = useState([
    {
      id: "1",
      action: "field_added",
      field_name: "Brand Name",
      user: "John Doe",
      timestamp: "2024-01-15T14:30:00Z",
      details: "Added Brand Name attribute to Basic Information group"
    }
  ]);

  // Field type definitions
  const fieldTypes = [
    { id: "text", label: "Text", icon: Type, description: "Single line text input" },
    { id: "measurement", label: "Measurement", icon: Type, description: "Values with units" },
  ];

  // Helper functions
  const getFieldTypeInfo = (type: string) => {
    const fieldType = fieldTypes.find(ft => ft.id === type);
    return fieldType || { id: type, label: type, icon: Type, description: "" };
  };

  const getGroupFields = () => {
    return assignedFields.sort((a, b) => a.sort_order - b.sort_order);
  };

  const getAvailableFields = () => {
    const search = availableFieldsSearch.trim().toLowerCase();
    return availableFields.filter(field =>
      (
        !search ||
        field.name.toLowerCase().includes(search) ||
        field.code.toLowerCase().includes(search)
      )
    );
  };

  const handleAddFieldsToGroup = async () => {
    if (selectedFieldsToAdd.length === 0 || !fieldGroup) return;

    try {
      const newFields = selectedFieldsToAdd.filter(id => !assignedFields.find(f => f.id === id));

      // Add new fields
      for (const fieldId of newFields) {
        await fetch(`/api/${tenant}/field-groups/${fieldGroup.id}/fields`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_field_id: fieldId,
            sort_order: assignedFields.length + 1
          })
        });
      }

      await fetchFieldGroup();
      setSelectedFieldsToAdd([]);
      setShowAddFieldsDialog(false);
    } catch (error) {
      console.error('Error adding fields:', error);
      setError('Failed to add attributes to group');
    }
  };

  const handleRemoveFieldFromGroup = async (fieldId: string) => {
    const field = assignedFields.find(f => f.id === fieldId);
    if (!fieldGroup || !confirm(`Remove "${field?.name}" from this field group?`)) return;

    try {
      await fetch(`/api/${tenant}/field-groups/${fieldGroup.id}/fields?fieldId=${fieldId}`, {
        method: 'DELETE'
      });

      await fetchFieldGroup();
    } catch (error) {
      console.error('Error removing field:', error);
      setError('Failed to remove field from group');
    }
  };


  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageLoader text="Loading field group..." size="lg" />
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
    <div className="h-full bg-background">
      {/* Header with breadcrumb */}
      <div className="border-b border-border bg-white">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/${tenant}/settings?section=field-groups`)}
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Groups
              </Button>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium">{fieldGroup.name}</span>
              {isLockedGroup && (
                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                  System Group
                </Badge>
              )}
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                {getGroupFields().length} attributes
              </Badge>
            </div>
            {!isLockedGroup && (
              <Button variant="secondary" onClick={() => router.push(`/${tenant}/settings/field-groups/${groupCode}/edit`)}>
                <Edit className="w-4 h-4" />
                Edit Group
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="px-6 py-6">
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <List className="w-5 h-5" />
                  {fieldGroup.name}
                </CardTitle>
                <CardDescription>
                  {fieldGroup.description || "No description"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          {/* Three-tab interface */}
          <div className="border-b border-border">
            <div className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('properties')}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'properties'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Properties
              </button>
              <button
                onClick={() => setActiveTab('fields')}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'fields'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Attributes
                <Badge variant="secondary" className="ml-2">
                  {getGroupFields().length}
                </Badge>
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
            {/* Properties Tab */}
            {activeTab === 'properties' && (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Group Name
                    </label>
                    <div className="text-sm text-foreground p-3 bg-muted/30 rounded-lg">
                      {fieldGroup.name}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Group Code
                    </label>
                    <div className="text-sm text-foreground p-3 bg-muted/30 rounded-lg font-mono">
                      {fieldGroup.code}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Sort Order
                    </label>
                    <div className="text-sm text-foreground p-3 bg-muted/30 rounded-lg">
                      {fieldGroup.sort_order}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Created
                    </label>
                    <div className="text-sm text-foreground p-3 bg-muted/30 rounded-lg">
                      {new Date(fieldGroup.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
                {fieldGroup.description && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Description
                    </label>
                    <div className="text-sm text-foreground p-3 bg-muted/30 rounded-lg">
                      {fieldGroup.description}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Attributes Tab */}
            {activeTab === 'fields' && (
              <div>
                {/* Attributes header with Add button */}
                <div className="p-6 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Attributes</h3>
                      <p className="text-sm text-muted-foreground">
                        Assign attributes to this group. Visibility is controlled at the product family level.
                      </p>
                    </div>
                    <Button variant="accent-blue" onClick={() => setShowAddFieldsDialog(true)}>
                      <Plus className="w-4 h-4" />
                      ADD ATTRIBUTES
                    </Button>
                  </div>
                </div>

                {/* Attributes table */}
                {getGroupFields().length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Tag className="w-12 h-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No Attributes Assigned</h3>
                    <p className="text-muted-foreground mb-6 max-w-md">
                      This field group doesn't have any attributes assigned yet. Add attributes to create the template for this section.
                    </p>
                    <Button variant="accent-blue" onClick={() => setShowAddFieldsDialog(true)}>
                      <Plus className="w-4 h-4" />
                      Add Your First Attribute
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {getGroupFields().map((field) => {
                      const typeInfo = getFieldTypeInfo(field.field_type || field.type);
                      const TypeIcon = typeInfo.icon;

                      return (
                        <div key={field.id} className="p-4">
                          <div className="grid gap-3 md:grid-cols-[minmax(240px,320px),1fr,auto] md:items-start">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                                <TypeIcon className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div>
                                <div className="text-sm font-medium text-foreground">
                                  {field.name}
                                </div>
                                <div className="font-mono text-xs text-muted-foreground">{field.code}</div>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {field.field_type || field.type}
                              </Badge>
                              {field.is_required && (
                                <Badge variant="secondary" className="text-xs bg-red-50 text-red-700">
                                  Required
                                </Badge>
                              )}
                              {field.is_unique && (
                                <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">
                                  Unique
                                </Badge>
                              )}
                              {field.is_localizable && (
                                <Badge variant="secondary" className="text-xs bg-green-50 text-green-700">
                                  Localizable
                                </Badge>
                              )}
                              {field.is_channelable && (
                                <Badge variant="secondary" className="text-xs bg-yellow-50 text-yellow-700">
                                  Channel
                                </Badge>
                              )}
                              {field.description && (
                                <p className="w-full text-xs text-muted-foreground">{field.description}</p>
                              )}
                            </div>
                            {!(isLockedGroup && LOCKED_CORE_FIELD_CODES.has(field.code)) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                onClick={() => handleRemoveFieldFromGroup(field.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div className="p-6">
                <div className="space-y-4">
                  {fieldGroupHistory.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        entry.action === 'field_added' ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        {entry.action === 'field_added' ? (
                          <Plus className={`w-4 h-4 text-green-600`} />
                        ) : (
                          <Minus className={`w-4 h-4 text-red-600`} />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-foreground">{entry.user}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{entry.details}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Attributes Dialog */}
      <Dialog open={showAddFieldsDialog} onOpenChange={setShowAddFieldsDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Add Attributes to {fieldGroup.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <input
                type="text"
                value={availableFieldsSearch}
                onChange={(e) => setAvailableFieldsSearch(e.target.value)}
                placeholder="Search attributes by name or code"
                className="w-full pl-10 pr-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {/* Available attributes list */}
            <div className="max-h-96 overflow-y-auto border rounded-lg">
              {availableFieldsLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  Loading attributes...
                </div>
              ) : availableFieldsError ? (
                <div className="p-8 text-center text-muted-foreground">
                  {availableFieldsError}
                </div>
              ) : getAvailableFields().length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No available attributes found
                </div>
              ) : (
                <div className="divide-y">
                  {getAvailableFields().map((field) => {
                    const isAssigned = Boolean(field.is_assigned);
                    return (
                      <label
                        key={field.id}
                        className={`flex items-center gap-3 p-4 ${
                          isAssigned ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedFieldsToAdd.includes(field.id)}
                          disabled={isAssigned}
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
                          <div className="font-medium">{field.name}</div>
                          <div className="text-sm text-muted-foreground">{field.code}</div>
                        </div>
                        {isAssigned && (
                          <Badge variant="secondary">Already in group</Badge>
                        )}
                        <Badge variant="outline">{field.field_type}</Badge>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddFieldsDialog(false);
                  setSelectedFieldsToAdd([]);
                  setAvailableFieldsSearch("");
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
    </div>
  );
}

