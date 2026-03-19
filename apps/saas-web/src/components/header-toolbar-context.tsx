'use client'

import { createContext, useCallback, useContext, useState } from 'react'

interface HeaderToolbarContextValue {
  showScopeToolbar: boolean
  setShowScopeToolbar: (value: boolean) => void
}

const HeaderToolbarContext = createContext<HeaderToolbarContextValue>({
  showScopeToolbar: false,
  setShowScopeToolbar: () => {},
})

export function HeaderToolbarProvider({ children }: { children: React.ReactNode }) {
  const [showScopeToolbar, setShowScopeToolbarState] = useState(false)
  const setShowScopeToolbar = useCallback((value: boolean) => {
    setShowScopeToolbarState(value)
  }, [])
  return (
    <HeaderToolbarContext.Provider value={{ showScopeToolbar, setShowScopeToolbar }}>
      {children}
    </HeaderToolbarContext.Provider>
  )
}

export function useHeaderToolbar() {
  return useContext(HeaderToolbarContext)
}
