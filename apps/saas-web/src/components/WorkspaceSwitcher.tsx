'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Building2, Plus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkspaces, WorkspaceSummary } from '@/hooks/useWorkspaces'

interface WorkspaceSwitcherProps {
  currentWorkspace: {
    id: string
    name: string
    slug: string
  }
  isCollapsed?: boolean
  initialWorkspaces?: WorkspaceSummary[]
}

export function WorkspaceSwitcher({
  currentWorkspace,
  isCollapsed = false,
  initialWorkspaces
}: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { workspaces, sortedWorkspaces, loading } = useWorkspaces({
    currentWorkspaceSlug: currentWorkspace.slug,
    initialWorkspaces,
  })
  const router = useRouter()

  const handleWorkspaceSelect = (workspace: WorkspaceSummary) => {
    if (workspace.slug !== currentWorkspace.slug) {
      router.push(`/${workspace.slug}`)
    }
    setIsOpen(false)
  }

  const handleCreateWorkspace = () => {
    router.push('/onboarding?create=1')
    setIsOpen(false)
  }

  const renderWorkspaceList = () => {
    if (loading) {
      return (
        <div className="px-3 py-2.5 text-sm text-muted-foreground">
          Loading workspaces...
        </div>
      )
    }

    if (sortedWorkspaces.length === 0) {
      return (
        <div className="px-3 py-2.5 text-sm text-muted-foreground">
          No other workspaces
        </div>
      )
    }

    return sortedWorkspaces.map((workspace) => (
      <button
        key={workspace.id}
        onClick={() => handleWorkspaceSelect(workspace)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg hover:bg-muted/50 transition-colors"
      >
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1 text-left">
          <div className="font-medium">{workspace.name}</div>
          <div className="text-xs text-muted-foreground capitalize">
            {workspace.role}
            {workspace.slug === currentWorkspace.slug && ' (current)'}
          </div>
        </div>
        {workspace.slug === currentWorkspace.slug && (
          <Check className="h-4 w-4 text-primary" />
        )}
      </button>
    ))
  }

  if (isCollapsed) {
    return (
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(!isOpen)}
          className="w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <Building2 className="h-4 w-4" />
        </Button>

        {isOpen && (
          <div className="absolute left-12 top-0 z-50 w-64 bg-white border border-border rounded-lg shadow-lg">
            <div className="p-2 border-b border-border">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                Switch Workspace
              </div>
            </div>
            <div className="p-1">
              {renderWorkspaceList()}
              <button
                onClick={handleCreateWorkspace}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg hover:bg-muted/50 transition-colors border-t border-border mt-1 pt-3"
              >
                <Plus className="h-4 w-4 text-muted-foreground" />
                <span>Create workspace</span>
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 hover:bg-muted/50 group"
      >
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1 text-left">
          <div className="font-medium text-foreground">{currentWorkspace.name}</div>
          <div className="text-xs text-muted-foreground">
            {workspaces.length > 1 ? `${workspaces.length} workspaces` : 'Workspace'}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-border rounded-lg shadow-lg">
          <div className="p-2 border-b border-border">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
              Switch Workspace
            </div>
          </div>
          <div className="p-1 max-h-64 overflow-y-auto">
            {renderWorkspaceList()}
            <button
              onClick={handleCreateWorkspace}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg hover:bg-muted/50 transition-colors border-t border-border mt-1 pt-3"
            >
              <Plus className="h-4 w-4 text-muted-foreground" />
              <span>Create workspace</span>
            </button>
          </div>
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
