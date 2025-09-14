'use client';

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, MoreHorizontal } from 'lucide-react';
import { Button } from './button';
import type { DamFolder } from '@tradetool/types';

interface FolderTreeProps {
  folders: DamFolder[];
  selectedFolderId?: string | null;
  onFolderSelect?: (folderId: string | null) => void;
  onFolderCreate?: (parentId: string | null) => void;
  onFolderEdit?: (folder: DamFolder) => void;
  onFolderDelete?: (folder: DamFolder) => void;
}

interface FolderNode extends DamFolder {
  children: FolderNode[];
  level: number;
}

export function FolderTree({
  folders,
  selectedFolderId,
  onFolderSelect,
  onFolderCreate,
  onFolderEdit,
  onFolderDelete,
}: FolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Build tree structure
  const folderTree = React.useMemo(() => {
    const nodeMap = new Map<string, FolderNode>();
    const rootNodes: FolderNode[] = [];

    // Create nodes
    folders.forEach(folder => {
      nodeMap.set(folder.id, {
        ...folder,
        children: [],
        level: 0,
      });
    });

    // Build hierarchy
    folders.forEach(folder => {
      const node = nodeMap.get(folder.id)!;
      
      if (folder.parentId) {
        const parent = nodeMap.get(folder.parentId);
        if (parent) {
          parent.children.push(node);
          node.level = parent.level + 1;
        } else {
          rootNodes.push(node);
        }
      } else {
        rootNodes.push(node);
      }
    });

    // Sort by name
    const sortNodes = (nodes: FolderNode[]) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      nodes.forEach(node => sortNodes(node.children));
    };
    sortNodes(rootNodes);

    return rootNodes;
  }, [folders]);

  const toggleExpanded = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const renderFolderNode = (node: FolderNode) => {
    const isExpanded = expandedFolders.has(node.id);
    const isSelected = selectedFolderId === node.id;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className={`
            flex items-center gap-1 py-1 px-2 rounded cursor-pointer group hover:bg-gray-100
            ${isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}
          `}
          style={{ paddingLeft: `${0.5 + node.level * 1}rem` }}
        >
          {/* Expand/collapse button */}
          <Button
            variant="ghost"
            size="icon"
            className="w-4 h-4 p-0"
            onClick={() => hasChildren && toggleExpanded(node.id)}
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )
            ) : (
              <div className="w-3 h-3" />
            )}
          </Button>

          {/* Folder icon */}
          <div className="flex-shrink-0">
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-blue-500" />
            ) : (
              <Folder className="w-4 h-4 text-blue-500" />
            )}
          </div>

          {/* Folder name */}
          <span
            className="flex-1 text-sm truncate select-none"
            onClick={() => onFolderSelect?.(node.id)}
          >
            {node.name}
          </span>

          {/* Actions */}
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="w-4 h-4 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onFolderCreate?.(node.id);
              }}
            >
              <Plus className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-4 h-4 p-0"
              onClick={(e) => {
                e.stopPropagation();
                // Show context menu or dropdown
              }}
            >
              <MoreHorizontal className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Children */}
        {isExpanded && node.children.map(child => renderFolderNode(child))}
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Root level */}
      <div
        className={`
          flex items-center gap-2 py-2 px-2 rounded cursor-pointer hover:bg-gray-100 group
          ${selectedFolderId === null ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}
        `}
        onClick={() => onFolderSelect?.(null)}
      >
        <FolderOpen className="w-4 h-4 text-blue-500" />
        <span className="flex-1 text-sm font-medium">All Files</span>
        <Button
          variant="ghost"
          size="icon"
          className="w-4 h-4 p-0 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onFolderCreate?.(null);
          }}
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      {/* Folder tree */}
      <div className="mt-1">
        {folderTree.map(node => renderFolderNode(node))}
      </div>

      {/* Empty state */}
      {folders.length === 0 && (
        <div className="text-center py-4 text-gray-500">
          <p className="text-sm">No folders yet</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => onFolderCreate?.(null)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Create Folder
          </Button>
        </div>
      )}
    </div>
  );
}