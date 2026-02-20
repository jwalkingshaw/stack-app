"use client";

import { useState, useMemo, ReactNode } from "react";
import {
  ArrowUpDown,
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PageLoader } from "@/components/ui/loading-spinner";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

// Types
export interface Column<T> {
  key: keyof T;
  label: ReactNode;
  sortable?: boolean;
  width?: string;
  render?: (value: any, item: T) => ReactNode;
  className?: string;
}

export interface Action<T> {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: (item: T) => void;
  variant?: 'default' | 'destructive' | 'secondary';
  className?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  sortable?: boolean;
  actions?: Action<T>[];
  hideActions?: (item: T) => boolean;
  onCreateNew?: () => void;
  createNewLabel?: string;
  emptyState?: {
    title: string;
    description: string;
    icon?: ReactNode;
  };
  wrapperClassName?: string;
  className?: string;
  rowClassName?: (item: T) => string;
  onRowClick?: (item: T) => void;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  loading = false,
  searchable = true,
  searchPlaceholder = "Search...",
  sortable = true,
  actions = [],
  hideActions,
  onCreateNew,
  createNewLabel = "Create New",
  emptyState,
  wrapperClassName,
  className,
  rowClassName,
  onRowClick
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<keyof T | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;

    return data.filter(item =>
      columns.some(column => {
        const value = item[column.key];
        return value?.toString().toLowerCase().includes(searchQuery.toLowerCase());
      })
    );
  }, [data, searchQuery, columns]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortField || !sortable) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      let comparison = 0;
      if (aValue < bValue) comparison = -1;
      if (aValue > bValue) comparison = 1;

      return sortDirection === "desc" ? -comparison : comparison;
    });
  }, [filteredData, sortField, sortDirection, sortable]);

  const handleSort = (field: keyof T) => {
    if (!sortable) return;

    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const defaultEmptyState = {
    title: "No data found",
    description: "Get started by creating your first item.",
    icon: <Search className="w-8 h-8 text-muted-foreground" />
  };

  const currentEmptyState = emptyState || defaultEmptyState;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with search and create button */}
      <div className="flex items-center justify-between gap-4">
        {searchable && (
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {onCreateNew && (
          <Button onClick={onCreateNew} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {createNewLabel}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className={cn("bg-white border border-muted/30 rounded-lg", wrapperClassName)}>
        {loading ? (
          <div className="p-8">
            <PageLoader text="Loading..." size="lg" />
          </div>
        ) : sortedData.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              {currentEmptyState.icon}
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {currentEmptyState.title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {currentEmptyState.description}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="bg-muted/50">
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {columns.map((column) => (
                  <th
                    key={String(column.key)}
                    className={cn(
                      "px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider",
                      column.sortable !== false && sortable && "cursor-pointer hover:bg-muted/60 transition-colors",
                      column.className
                    )}
                    style={{ width: column.width }}
                    onClick={() => column.sortable !== false && handleSort(column.key)}
                  >
                    <div className="flex items-center gap-1">
                      {column.label}
                      {column.sortable !== false && sortable && (
                        <ArrowUpDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                ))}
                {actions.length > 0 && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground/80 uppercase tracking-wider w-20">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white">
              {sortedData.map((item, index) => (
                <tr
                  key={index}
                  className={cn(
                    "hover:bg-muted/20 transition-colors",
                    onRowClick && "cursor-pointer",
                    rowClassName?.(item)
                  )}
                  style={{
                    borderBottom: index === sortedData.length - 1 ? "none" : "1px solid #e5e7eb"
                  }}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((column) => (
                    <td
                      key={String(column.key)}
                      className={cn("px-4 py-3 text-sm font-normal text-foreground", column.className)}
                    >
                      {column.render
                        ? column.render(item[column.key], item)
                        : item[column.key]?.toString() || "—"
                      }
                    </td>
                  ))}
                  {actions.length > 0 && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end">
                        {!hideActions?.(item) && (
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content
                                className="min-w-[160px] bg-white text-foreground font-sans rounded-lg shadow-lg border border-border p-1 z-50"
                                sideOffset={5}
                                align="end"
                                alignOffset={-8}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {actions.map((action) => (
                                  <DropdownMenu.Item
                                    key={action.key}
                                    className={cn(
                                      "flex items-center gap-2 px-3 py-2 text-sm font-sans cursor-pointer rounded-md hover:bg-muted outline-none",
                                      action.variant === 'destructive' && "text-red-600"
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      action.onClick(item);
                                    }}
                                  >
                                    {action.icon}
                                    {action.label}
                                  </DropdownMenu.Item>
                                ))}
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Common action helpers
export const createTableActions = {
  view: (onClick: (item: any) => void): Action<any> => ({
    key: 'view',
    label: 'View',
    icon: <Eye className="w-4 h-4" />,
    onClick,
    variant: 'secondary' as const
  }),
  edit: (onClick: (item: any) => void): Action<any> => ({
    key: 'edit',
    label: 'Edit',
    icon: <Edit className="w-4 h-4" />,
    onClick,
    variant: 'secondary' as const
  }),
  delete: (onClick: (item: any) => void): Action<any> => ({
    key: 'delete',
    label: 'Delete',
    icon: <Trash2 className="w-4 h-4" />,
    onClick,
    variant: 'secondary' as const,
    className: 'text-destructive hover:text-destructive'
  })
};
