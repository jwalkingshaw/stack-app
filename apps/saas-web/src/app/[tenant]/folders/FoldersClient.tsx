"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Plus, 
  Search, 
  Filter, 
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Grid3X3,
  List,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronDown,
  Home,
  FileText,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@tradetool/ui";
import { PageHeader } from "@/components/ui/page-header";

interface FolderData {
  id: string;
  organizationId: string;
  name: string;
  parentId: string | null;
  path: string;
  createdBy: string;
  createdAt: string;
  children?: FolderData[];
  assetCount?: number;
}

interface FoldersClientProps {
  tenantSlug: string;
}

export default function FoldersClient({ tenantSlug }: FoldersClientProps) {
  const router = useRouter();
  
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // grid, list
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState("name"); // name, date, path
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [parentFolderId, setParentFolderId] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<FolderData | null>(null);

  // Fetch folders
  useEffect(() => {
    const fetchFolders = async () => {
      try {
        setLoading(true);
        console.log('📁 Fetching folders for tenant:', tenantSlug);
        
        const response = await fetch(`/api/organizations/${tenantSlug}/assets/folders`);
        if (!response.ok) {
          throw new Error(`Failed to fetch folders: ${response.status}`);
        }
        
        const { data } = await response.json();
        console.log('📁 Folders data received:', data);
        
        // Build folder tree structure
        const folderTree = buildFolderTree(data || []);
        setFolders(folderTree);
        
      } catch (error) {
        console.error('Failed to fetch folders:', error);
        setFolders([]);
      } finally {
        setLoading(false);
      }
    };

    if (tenantSlug) {
      fetchFolders();
    }
  }, [tenantSlug]);

  // Build hierarchical folder structure
  const buildFolderTree = (folderList: FolderData[]): FolderData[] => {
    const folderMap = new Map<string, FolderData>();
    const rootFolders: FolderData[] = [];

    // First pass: create all folder objects
    folderList.forEach(folder => {
      folderMap.set(folder.id, { ...folder, children: [] });
    });

    // Second pass: build hierarchy
    folderList.forEach(folder => {
      const folderItem = folderMap.get(folder.id)!;
      if (folder.parentId && folderMap.has(folder.parentId)) {
        const parent = folderMap.get(folder.parentId)!;
        parent.children!.push(folderItem);
      } else {
        rootFolders.push(folderItem);
      }
    });

    return rootFolders;
  };

  // Flatten folders for search and filtering
  const flattenFolders = (folders: FolderData[]): FolderData[] => {
    const result: FolderData[] = [];
    const traverse = (folder: FolderData) => {
      result.push(folder);
      folder.children?.forEach(traverse);
    };
    folders.forEach(traverse);
    return result;
  };

  const filteredFolders = flattenFolders(folders)
    .filter(folder => {
      const matchesSearch = folder.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        folder.path.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "date":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "path":
          return a.path.localeCompare(b.path);
        default:
          return 0;
      }
    });

  // Create new folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const response = await fetch(`/api/organizations/${tenantSlug}/assets/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: parentFolderId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create folder: ${response.status}`);
      }

      // Refresh folders
      const fetchResponse = await fetch(`/api/organizations/${tenantSlug}/assets/folders`);
      const { data } = await fetchResponse.json();
      const folderTree = buildFolderTree(data || []);
      setFolders(folderTree);

      setShowCreateDialog(false);
      setNewFolderName("");
      setParentFolderId(null);
      
      console.log('✅ Folder created successfully');
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  // Navigate to assets in folder
  const handleFolderClick = (folder: FolderData) => {
    router.push(`/${tenantSlug}/assets?folder=${folder.id}`);
  };

  // Toggle folder expansion in tree view
  const toggleFolderExpansion = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  // Render folder tree recursively
  const renderFolderTree = (folders: FolderData[], level: number = 0) => {
    return folders.map((folder) => (
      <div key={folder.id} className="space-y-1">
        <div 
          className={`group flex items-center gap-2 p-3 bg-card rounded-xl border border-border hover:shadow-medium hover:border-ring/20 transition-all duration-300 cursor-pointer ${
            level > 0 ? `ml-${level * 4}` : ''
          }`}
          style={{ marginLeft: level * 16 }}
        >
          {folder.children && folder.children.length > 0 && (
            <button
              onClick={() => toggleFolderExpansion(folder.id)}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              {expandedFolders.has(folder.id) ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          )}
          
          <div 
            onClick={() => handleFolderClick(folder)}
            className="flex items-center gap-3 flex-1"
          >
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              {expandedFolders.has(folder.id) ? (
                <FolderOpen className="w-5 h-5 text-primary" />
              ) : (
                <Folder className="w-5 h-5 text-primary" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">
                {folder.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                {folder.path} • Created {new Date(folder.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                setParentFolderId(folder.id);
                setShowCreateDialog(true);
              }}
            >
              <FolderPlus className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                setEditingFolder(folder);
                setNewFolderName(folder.name);
                setShowRenameDialog(true);
              }}
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {expandedFolders.has(folder.id) && folder.children && folder.children.length > 0 && (
          <div className="space-y-1">
            {renderFolderTree(folder.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  const getGridClasses = () => {
    switch (viewMode) {
      case "list":
        return "space-y-2";
      default: // grid
        return "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4";
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Folders"
        actions={[
          {
            label: "Create Folder",
            onClick: () => setShowCreateDialog(true),
            icon: FolderPlus
          }
        ]}
      />
      
      {/* Search Section */}
      <div className="bg-background border-b border-border px-4 py-4 shadow-soft">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Search Bar */}
            <div className="flex-1 max-w-2xl">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search folders by name or path..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-6 py-3.5 text-base border border-input bg-background rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 placeholder:text-muted-foreground shadow-soft hover:shadow-medium hover:border-ring/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors w-5 h-5 rounded-full hover:bg-muted flex items-center justify-center"
                  >
                    ×
                  </button>
                )}
              </div>
              {searchQuery && (
                <p className="text-sm text-muted-foreground mt-2 ml-1">
                  {filteredFolders.length} {filteredFolders.length === 1 ? 'result' : 'results'} for "{searchQuery}"
                </p>
              )}
            </div>
            
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 shadow-soft">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-foreground">
                  {filteredFolders.length} {filteredFolders.length === 1 ? 'folder' : 'folders'}
                </span>
              </div>
              
              {/* Filters */}
              <div className="flex items-center gap-4">
                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value)}
                  className="text-sm border border-input rounded-xl px-4 h-8 bg-background shadow-soft hover:border-ring/50 hover:shadow-medium focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 min-w-[140px]"
                >
                  <option value="name">Sort by name</option>
                  <option value="date">Sort by date</option>
                  <option value="path">Sort by path</option>
                </select>
              </div>
            </div>

            {/* View Switcher */}
            <div className="flex items-center bg-muted/50 border border-border rounded-xl p-1.5 shadow-soft">
              <button
                onClick={() => setViewMode("grid")}
                className={`px-3 py-2.5 text-sm transition-all duration-200 rounded-lg ${
                  viewMode === "grid" 
                    ? "bg-background shadow-soft text-primary border border-primary/20" 
                    : "hover:bg-background/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-2.5 text-sm transition-all duration-200 rounded-lg ${
                  viewMode === "list" 
                    ? "bg-background shadow-soft text-primary border border-primary/20" 
                    : "hover:bg-background/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <main className="flex-1 overflow-auto p-4 bg-background">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className={getGridClasses()}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-24 bg-muted rounded-xl animate-pulse shadow-soft" />
              ))}
            </div>
          ) : searchQuery ? (
            // Search results view
            <div className={getGridClasses()}>
              {filteredFolders.map((folder) => (
                <div 
                  key={folder.id} 
                  className="group flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:shadow-medium hover:border-ring/20 transition-all duration-300 cursor-pointer hover:-translate-y-0.5"
                  onClick={() => handleFolderClick(folder)}
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Folder className="w-6 h-6 text-primary" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {folder.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {folder.path} • {new Date(folder.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Hierarchical tree view
            <div className="space-y-2">
              {renderFolderTree(folders)}
            </div>
          )}
          
          {!loading && filteredFolders.length === 0 && (
            <div className="text-center py-20">
              <div className="w-24 h-24 mx-auto bg-muted/50 rounded-full flex items-center justify-center mb-8 shadow-soft">
                <Folder className="w-10 h-10 text-muted-foreground opacity-60" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">No folders found</h3>
              <p className="text-muted-foreground text-base max-w-md mx-auto leading-relaxed mb-8">
                {searchQuery ? 'Try adjusting your search terms to find what you\'re looking for.' : 'Create your first folder to organize your assets.'}
              </p>
              <Button size="lg" onClick={() => setShowCreateDialog(true)}>
                <FolderPlus className="w-5 h-5" />
                Create Folder
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Create Folder Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">
                Folder Name
              </label>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Enter folder name..."
                className="mt-1 w-full px-3 h-8 border border-input rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            
            {parentFolderId && (
              <div>
                <label className="text-sm font-medium text-foreground">
                  Parent Folder
                </label>
                <p className="text-sm text-muted-foreground mt-1">
                  Will be created inside the selected folder
                </p>
              </div>
            )}
            
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewFolderName("");
                  setParentFolderId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                Create Folder
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}