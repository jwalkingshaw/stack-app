"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, X, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable, Column } from "@/components/ui/data-table";
import { toast } from "@/components/ui/toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateVariantUrl } from "@/lib/product-utils";

interface VariantAttribute {
  id: string;
  product_field_id: string;
  field_code: string;
  field_name: string;
  field_type: string;
  is_required: boolean;
  options?: any;
}

interface ProductVariant {
  id: string;
  scin?: string;
  sku: string | null;
  product_name: string;
  variant_attributes: Record<string, any>;
  primary_image_url?: string;
  status: string;
  barcode?: string;
  isNew?: boolean; // Flag for the new row being added
}

interface InlineVariantTableProps {
  productId: string;
  productSku: string | null;
  productName: string;
  tenantSlug: string;
  variantAttributes: VariantAttribute[];
  existingVariants: ProductVariant[];
  onVariantCreated: () => void;
  onProductTypeChange: (newType: 'parent') => void;
  productType: 'standalone' | 'parent' | 'variant';
  emptyStateOverride?: {
    title: string;
    description: string;
    icon?: ReactNode;
  };
}

export function InlineVariantTable({
  productId,
  productSku,
  productName,
  tenantSlug,
  variantAttributes,
  existingVariants,
  onVariantCreated,
  onProductTypeChange,
  productType,
  emptyStateOverride
}: InlineVariantTableProps) {
  const router = useRouter();
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newVariantData, setNewVariantData] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showMatrixDialog, setShowMatrixDialog] = useState(false);
  const [matrixInputs, setMatrixInputs] = useState<Record<string, string>>({});
  const [matrixSelections, setMatrixSelections] = useState<Record<string, string[]>>({});
  const [matrixPreview, setMatrixPreview] = useState<Array<Record<string, any>>>([]);
  const [matrixEdits, setMatrixEdits] = useState<Array<Record<string, string>>>(
    []
  );
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixCreating, setMatrixCreating] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [previewCreatedScins, setPreviewCreatedScins] = useState<string[]>([]);
  const [matrixCommitted, setMatrixCommitted] = useState(false);

  const handleAddNewRow = () => {
    setIsAddingRow(true);
    setNewVariantData({ status: 'Draft' });
  };

  const handleCancelAdd = () => {
    setIsAddingRow(false);
    setNewVariantData({});
  };

  const handleSaveNewVariant = async () => {
    // Validate required fields
    // Check required variant attributes
    const missingRequired = variantAttributes
      .filter(attr => attr.is_required && !newVariantData[attr.field_code])
      .map(attr => attr.field_name);

    if (missingRequired.length > 0) {
      toast.error(`Please fill in: ${missingRequired.join(', ')}`);
      return;
    }

    const nextStatus = newVariantData.status || 'Draft';
    if (nextStatus === 'Active' && (!newVariantData.sku || !newVariantData.sku.trim())) {
      toast.error('Active variants must include a SKU.');
      return;
    }

    try {
      setIsSaving(true);

      // Convert to parent if needed
      if (productType === 'standalone') {
        await fetch(`/api/${tenantSlug}/products/${productId}/convert-to-parent`, {
          method: 'POST'
        });
        onProductTypeChange('parent');
      }

    // Extract variant attributes from newVariantData
    const { sku, barcode, status: statusValue, ...attributeValues } = newVariantData;
    const resolvedStatus = statusValue || 'Draft';
    const axisValues = variantAttributes
      .map((attr) => attributeValues[attr.field_code])
      .filter(Boolean)
      .map((value) => String(value));
    const computedName = `${productName} ${axisValues.join(' ')}`.trim();

    const newVariant = {
      sku: sku?.trim() || null,
      barcode: barcode?.trim() || null,
      product_name: computedName,
      variant_attribute_values: attributeValues,
      status: resolvedStatus
    };

      const response = await fetch(`/api/${tenantSlug}/products/${productId}/variants/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variants: [newVariant] })
      });

      if (response.ok) {
        toast.success('Variant created successfully');
        setIsAddingRow(false);
        setNewVariantData({});
        onVariantCreated();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create variant');
      }
    } catch (error: any) {
      console.error('Error creating variant:', error);
      toast.error(error.message || 'Failed to create variant');
    } finally {
      setIsSaving(false);
    }
  };

  const navigateToVariant = (variant: ProductVariant) => {
    if (variant.isNew) return; // Don't navigate if it's the new row
    const variantUrl = generateVariantUrl(
      tenantSlug,
      productId || productSku || "",
      variant.id || variant.sku || "",
      {
        parentLabel: productName || productSku || null,
        variantLabel: variant.product_name || variant.sku || null,
      }
    );
    if (variantUrl) {
      router.push(variantUrl);
    }
  };

  const handleVariantStatusChange = async (variantId: string, nextStatus: string) => {
    try {
      setStatusUpdatingId(variantId);
      const response = await fetch(
        `/api/${tenantSlug}/products/${productId}/variants/${variantId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus })
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update status');
      }

      toast.success('Variant status updated');
      onVariantCreated();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update variant status');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const buildAxisPayload = () => {
    const axes: Record<string, string[]> = {};
    variantAttributes.forEach((attr) => {
      const hasOptions = Array.isArray(attr.options?.options) && attr.options.options.length > 0;
      const values = hasOptions
        ? matrixSelections[attr.field_code] || []
        : (matrixInputs[attr.field_code] || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
      if (values.length > 0) {
        axes[attr.field_code] = values;
      }
    });
    return axes;
  };

  const handlePreviewMatrix = async () => {
    setMatrixError(null);
    setMatrixPreview([]);
    setPreviewCreatedScins([]);
    setMatrixCommitted(false);

    const axes = buildAxisPayload();
    if (Object.keys(axes).length === 0) {
      setMatrixError('Add at least one value for each axis.');
      return;
    }

    try {
      setMatrixLoading(true);
      const response = await fetch(
        `/api/${tenantSlug}/products/${productId}/variants/matrix`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            axes,
            baseName: productName || undefined
          })
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to build matrix preview');
      }

      const previewRows = payload.data || [];
      setMatrixPreview(previewRows);
      setPreviewCreatedScins(
        previewRows
          .filter((row: any) => !row.isExisting)
          .map((row: any) => String(row.scin))
      );
      setMatrixEdits(
        previewRows.map((row: any) => {
          const values = Object.values(row.attributes || {}).map((value) => String(value));
          return {
            product_name: `${productName} ${values.join(' ')}`.trim(),
            sku: '',
            barcode: '',
            status: 'Draft'
          };
        })
      );
    } catch (error: any) {
      setMatrixError(error.message || 'Failed to build matrix preview');
    } finally {
      setMatrixLoading(false);
    }
  };

  const handleCreateMatrixVariants = async () => {
    setMatrixError(null);

    if (!matrixPreview.length) {
      setMatrixError('Preview combinations before creating variants.');
      return;
    }

    try {
      setMatrixCreating(true);

      const variants = matrixPreview.map((row: any, index: number) => {
        const values = Object.values(row.attributes || {}).map((value) => String(value));
        const edit = matrixEdits[index] || {};
        const suggestedSku = edit.sku?.trim() || row.suggestedSku || null;
        const suggestedName =
          edit.product_name?.trim() || row.suggestedName || `${productName} ${values.join(' ')}`;
        return {
          scin: row.scin,
          sku: suggestedSku,
          product_name: suggestedName,
          variant_attribute_values: row.attributes || {},
          status: edit.status || 'Draft',
          barcode: edit.barcode?.trim() || null
        };
      });

      const response = await fetch(
        `/api/${tenantSlug}/products/${productId}/variants/bulk`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variants })
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create variants');
      }

      setMatrixCommitted(true);
      setShowMatrixDialog(false);
      setMatrixPreview([]);
      setMatrixInputs({});
      setMatrixSelections({});
      setMatrixEdits([]);
      setPreviewCreatedScins([]);
      onVariantCreated();
    } catch (error: any) {
      setMatrixError(error.message || 'Failed to create variants');
    } finally {
      setMatrixCreating(false);
    }
  };

  const cleanupPreviewDrafts = async () => {
    if (matrixCommitted || previewCreatedScins.length === 0) {
      return;
    }

    try {
      await fetch(
        `/api/${tenantSlug}/products/${productId}/variants/matrix`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scins: previewCreatedScins })
        }
      );
    } catch (error) {
      // Cleanup is best-effort; avoid blocking UI close.
      console.warn('Failed to clean up preview drafts');
    }
  };

  const handleMatrixDialogOpenChange = async (open: boolean) => {
    if (!open) {
      await cleanupPreviewDrafts();
      setMatrixPreview([]);
      setMatrixInputs({});
      setMatrixSelections({});
      setMatrixEdits([]);
      setPreviewCreatedScins([]);
      setMatrixCommitted(false);
    }
    setShowMatrixDialog(open);
  };

  const parseCsv = (input: string) => {
    const rows: string[][] = [];
    let row: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      const next = input[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === ',' && !inQuotes) {
        row.push(current);
        current = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') {
          i += 1;
        }
        if (current.length > 0 || row.length > 0) {
          row.push(current);
          rows.push(row);
        }
        row = [];
        current = '';
        continue;
      }

      current += char;
    }

    if (current.length > 0 || row.length > 0) {
      row.push(current);
      rows.push(row);
    }

    return rows;
  };

  const handleCsvImport = async (file: File) => {
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) return;

      const headers = rows[0].map((header) => header.trim().toLowerCase());
      const indexCol = headers.indexOf('scin');

      if (indexCol === -1) {
        setMatrixError('CSV must include a "scin" column.');
        return;
      }

      const updates = [...matrixEdits];
      const scinIndex = new Map<string, number>();
      matrixPreview.forEach((row: any, index: number) => {
        if (row.scin) {
          scinIndex.set(String(row.scin).trim(), index);
        }
      });

      rows.slice(1).forEach((row) => {
        const indexValue = row[indexCol];
        const rowIndex = scinIndex.get(String(indexValue || '').trim());
        if (typeof rowIndex !== 'number' || rowIndex < 0 || rowIndex >= updates.length) {
          return;
        }

        const next = { ...updates[rowIndex] };
        headers.forEach((header, colIndex) => {
          const value = row[colIndex] || '';
          if (header === 'sku') next.sku = value.trim();
          if (header === 'product_name') next.product_name = value.trim();
          if (header === 'barcode') next.barcode = value.trim();
          if (header === 'status') next.status = value.trim() || 'Draft';
          return;
        });

        updates[rowIndex] = next;
      });

      setMatrixEdits(updates);
    } catch (error) {
      setMatrixError('Failed to import CSV.');
    }
  };

  const downloadTemplate = () => {
    const headers = ['scin', 'product_name', 'sku', 'barcode', 'status'];
    const lines = [
      headers.join(','),
      ...matrixPreview.map((row, index) => {
        const values = Object.values(row.attributes || {}).map((value) => String(value));
        const name = `${productName} ${values.join(' ')}`.trim();
        return `${row.scin},"${name.replace(/"/g, '""')}",,,Draft`;
      })
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `variant-matrix-${productSku || productId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const updateMatrixEdit = (index: number, field: string, value: string) => {
    setMatrixEdits((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const renderFieldInput = (attribute: VariantAttribute) => {
    const value = newVariantData[attribute.field_code] || '';

    switch (attribute.field_type) {
      case 'select':
        const options = attribute.options?.options || [];
        return (
          <Select
            value={value}
            onValueChange={(newValue) =>
              setNewVariantData((prev) => ({ ...prev, [attribute.field_code]: newValue }))
            }
          >
            <SelectTrigger
              className="h-8 px-2 text-sm"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt: any, idx: number) => {
                const optionValue = opt.value || opt;
                const optionLabel = opt.label || opt;
                return (
                  <SelectItem key={idx} value={optionValue}>
                    {optionLabel}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        );

      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => setNewVariantData(prev => ({ ...prev, [attribute.field_code]: e.target.value }))}
            className="w-full px-2 py-1 border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            onClick={(e) => e.stopPropagation()}
          />
        );

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => setNewVariantData(prev => ({ ...prev, [attribute.field_code]: e.target.value }))}
            placeholder={attribute.is_required ? `${attribute.field_name} *` : attribute.field_name}
            className="w-full px-2 py-1 border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            onClick={(e) => e.stopPropagation()}
          />
        );
    }
  };

  // Build columns dynamically
  const columns: Column<ProductVariant>[] = [
    {
      key: 'primary_image_url',
      label: 'Image',
      sortable: false,
      width: '80px',
      render: (value, item) => {
        if (item.isNew) {
          return (
            <div className="w-10 h-10 bg-muted rounded-md flex items-center justify-center border border-border">
              <Package className="w-4 h-4 text-muted-foreground" />
            </div>
          );
        }
        return (
          <div className="w-10 h-10 bg-muted rounded-md flex items-center justify-center border border-border">
            {value ? (
              <img src={value} alt={item.product_name} className="w-full h-full object-cover rounded-md" />
            ) : (
              <Package className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        );
      }
    },
    {
      key: 'product_name',
      label: 'Variant Name',
      width: '250px',
      render: (value, item) => {
        if (item.isNew) {
          const axisValues = variantAttributes
            .map((attr) => newVariantData[attr.field_code])
            .filter(Boolean)
            .map((val) => String(val));
          const previewName = `${productName} ${axisValues.join(' ')}`.trim();
          return (
            <div className="text-sm text-foreground">
              {previewName || productName}
            </div>
          );
        }
        return <div className="font-medium text-foreground">{value}</div>;
      }
    },
    {
      key: 'scin',
      label: 'SCIN',
      width: '140px',
      render: (value, item) => {
        if (item.isNew) {
          return <span className="text-sm text-muted-foreground">Auto</span>;
        }
        return <span className="text-sm text-muted-foreground">{value || item.id}</span>;
      }
    },
    {
      key: 'sku',
      label: 'SKU',
      width: '150px',
      render: (value, item) => {
        if (item.isNew) {
          return (
            <Input
              value={newVariantData.sku || ''}
              onChange={(e) => setNewVariantData(prev => ({ ...prev, sku: e.target.value }))}
              placeholder="SKU (optional)"
              className="text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          );
        }
        return (
          <span className="text-sm text-muted-foreground">
            {value || '—'}
          </span>
        );
      }
    },
    {
      key: 'barcode',
      label: 'Barcode',
      width: '160px',
      render: (value, item) => {
        if (item.isNew) {
          return (
            <Input
              value={newVariantData.barcode || ''}
              onChange={(e) => setNewVariantData(prev => ({ ...prev, barcode: e.target.value }))}
              placeholder="Barcode (optional)"
              className="text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          );
        }
        return (
          <span className="text-sm text-muted-foreground">
            {value || 'â€”'}
          </span>
        );
      }
    }
  ];

  // Add dynamic variant attribute columns
  variantAttributes.forEach((attr) => {
    columns.push({
      key: attr.field_code as any,
      label: attr.field_name + (attr.is_required ? ' *' : ''),
      width: '150px',
      render: (value, item) => {
        if (item.isNew) {
          return renderFieldInput(attr);
        }
        return <span className="text-sm">{item.variant_attributes?.[attr.field_code] || '—'}</span>;
      }
    });
  });

  // Add status column
  columns.push({
    key: 'status',
    label: 'Status',
    width: '120px',
    render: (value, item) => {
      if (item.isNew) {
        return (
          <Select
            value={newVariantData.status || 'Draft'}
            onValueChange={(value) =>
              setNewVariantData((prev) => ({ ...prev, status: value }))
            }
          >
            <SelectTrigger className="h-8 text-xs" onPointerDown={(event) => event.stopPropagation()}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Enrichment">Enrichment</SelectItem>
              <SelectItem value="Review">Review</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Discontinued">Discontinued</SelectItem>
              <SelectItem value="Archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        );
      }
      return (
        <Select
          value={value || 'Draft'}
          onValueChange={(nextValue) => handleVariantStatusChange(item.id, nextValue)}
          disabled={statusUpdatingId === item.id}
        >
          <SelectTrigger className="h-8 text-xs" onPointerDown={(event) => event.stopPropagation()}>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Enrichment">Enrichment</SelectItem>
            <SelectItem value="Review">Review</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Discontinued">Discontinued</SelectItem>
            <SelectItem value="Archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      );
    }
  });

  // Add actions column for new row
  if (isAddingRow) {
    columns.push({
      key: 'id' as any,
      label: 'Actions',
      sortable: false,
      width: '100px',
      className: 'text-right',
      render: (value, item) => {
        if (item.isNew) {
          return (
            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSaveNewVariant}
                disabled={isSaving}
                className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancelAdd}
                disabled={isSaving}
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          );
        }
        return null;
      }
    });
  }

  // Prepare data with new row if adding
  const tableData = isAddingRow
    ? [
        {
          id: 'new',
          sku: '',
          product_name: '',
          variant_attributes: {},
          status: newVariantData.status || 'Draft',
          isNew: true
        } as ProductVariant,
        ...existingVariants
      ]
    : existingVariants;

  return (
    <div className="space-y-4">
      {/* Header with Add Variant button on the right */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => setShowMatrixDialog(true)}>
          Build Variant Matrix
        </Button>
        {!isAddingRow && (
          <Button variant="accent-blue" onClick={handleAddNewRow} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Variant
          </Button>
        )}
      </div>

      <DataTable
        data={tableData}
        columns={columns}
        searchable={false}
        sortable={false}
        emptyState={
          emptyStateOverride || {
            title: "No variants yet",
            description: "Click 'Add Variant' to create your first variant.",
            icon: <Package className="w-8 h-8 text-muted-foreground" />
          }
        }
        onRowClick={navigateToVariant}
        rowClassName={(item) => item.isNew ? 'bg-muted/10' : ''}
      />

      <Dialog open={showMatrixDialog} onOpenChange={handleMatrixDialogOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Build Variant Matrix</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Select values for each variant axis to generate the variant matrix. This flow is the next step
              in the new Product Model experience.
            </p>
            {variantAttributes.length === 0 ? (
              <div className="rounded-md border border-border/60 bg-muted/30 p-4">
                No variant axes configured yet. Add axes in the Product Model settings first.
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Variant names are generated as "{productName} + axis values". SKUs stay empty until you assign them.
                </p>

                <div className="space-y-3">
                  {variantAttributes.map((attr) => {
                    const options = Array.isArray(attr.options?.options)
                      ? attr.options.options
                      : [];
                    const hasOptions = options.length > 0;
                    const selected = matrixSelections[attr.field_code] || [];

                    return (
                      <div key={attr.id} className="space-y-2">
                        <label className="text-xs font-medium text-foreground">
                          {attr.field_name}
                        </label>
                        {hasOptions ? (
                          <div className="flex flex-wrap gap-2">
                            {options.map((option: any) => {
                              const optionValue = option.value || option;
                              const optionLabel = option.label || option;
                              const isSelected = selected.includes(optionValue);
                              return (
                                <button
                                  key={optionValue}
                                  type="button"
                                  onClick={() => {
                                    setMatrixSelections((prev) => {
                                      const current = new Set(prev[attr.field_code] || []);
                                      if (current.has(optionValue)) {
                                        current.delete(optionValue);
                                      } else {
                                        current.add(optionValue);
                                      }
                                      return {
                                        ...prev,
                                        [attr.field_code]: Array.from(current)
                                      };
                                    });
                                  }}
                                  className={`px-2 py-1 rounded-full text-xs border ${
                                    isSelected
                                      ? 'border-primary bg-primary/10 text-primary'
                                      : 'border-border text-muted-foreground'
                                  }`}
                                >
                                  {optionLabel}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <Input
                            value={matrixInputs[attr.field_code] || ''}
                            onChange={(event) =>
                              setMatrixInputs((prev) => ({
                                ...prev,
                                [attr.field_code]: event.target.value
                              }))
                            }
                            placeholder="Comma-separated values"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {matrixError && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {matrixError}
                  </div>
                )}

                {matrixPreview.length > 0 && (
                  <div className="rounded-md border border-border/60 bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-medium text-foreground">Bulk SKU Assignment</div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={downloadTemplate}>
                          Download CSV
                        </Button>
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) {
                                handleCsvImport(file);
                                event.target.value = '';
                              }
                            }}
                          />
                          <span className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground">
                            Import CSV
                          </span>
                        </label>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Edit SKUs, barcodes, and status inline or import a CSV mapped by SCIN.
                      Variants inherit other attributes from the parent unless overridden later.
                    </p>

                    <div className="mt-4 max-h-64 overflow-y-auto rounded-md border border-border/60">
                      <table className="min-w-full text-xs">
                        <thead className="bg-muted/30 text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left">SCIN</th>
                            <th className="px-3 py-2 text-left">Variant</th>
                            <th className="px-3 py-2 text-left">SKU</th>
                            <th className="px-3 py-2 text-left">Barcode</th>
                            <th className="px-3 py-2 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matrixPreview.map((row, index) => {
                            const values = Object.values(row.attributes || {}).map((value) => String(value));
                            const defaultName = `${productName} ${values.join(' ')}`.trim();
                            const edit = matrixEdits[index] || {};
                            return (
                              <tr key={index} className="border-t border-border/60">
                                <td className="px-3 py-2 text-muted-foreground">{row.scin}</td>
                                <td className="px-3 py-2">
                                  <Input
                                    value={edit.product_name ?? defaultName}
                                    onChange={(event) =>
                                      updateMatrixEdit(index, 'product_name', event.target.value)
                                    }
                                    className="h-8 text-xs"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    value={edit.sku ?? ''}
                                    onChange={(event) => updateMatrixEdit(index, 'sku', event.target.value)}
                                    placeholder="SKU"
                                    className="h-8 text-xs"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    value={edit.barcode ?? ''}
                                    onChange={(event) => updateMatrixEdit(index, 'barcode', event.target.value)}
                                    placeholder="Barcode"
                                    className="h-8 text-xs"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Select
                                    value={edit.status ?? 'Draft'}
                                    onValueChange={(value) => updateMatrixEdit(index, 'status', value)}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Draft">Draft</SelectItem>
                                      <SelectItem value="Enrichment">Enrichment</SelectItem>
                                      <SelectItem value="Review">Review</SelectItem>
                                      <SelectItem value="Active">Active</SelectItem>
                                      <SelectItem value="Discontinued">Discontinued</SelectItem>
                                      <SelectItem value="Archived">Archived</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {matrixPreview.length > 0
                      ? `${matrixPreview.length} combinations`
                      : 'Preview combinations before creating variants.'}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handlePreviewMatrix}
                      disabled={matrixLoading}
                      className="h-8"
                    >
                      {matrixLoading ? 'Building...' : 'Preview Matrix'}
                    </Button>
                    <Button
                      onClick={handleCreateMatrixVariants}
                      disabled={matrixCreating || matrixPreview.length === 0}
                      className="h-8"
                    >
                      {matrixCreating ? 'Creating...' : 'Create Variants'}
                    </Button>
                  </div>
                </div>

                {matrixPreview.length > 0 && (
                  <div className="max-h-56 overflow-y-auto rounded-md border border-border/60 bg-muted/10">
                    <div className="divide-y divide-border/60">
                      {matrixPreview.slice(0, 50).map((row, index) => (
                        <div key={index} className="px-3 py-2 text-xs text-muted-foreground">
                          <span className="text-foreground font-medium">#{index + 1}</span>{' '}
                          {Object.entries(row.attributes || {})
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(', ')}
                        </div>
                      ))}
                    </div>
                    {matrixPreview.length > 50 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Showing first 50 combinations.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => handleMatrixDialogOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
