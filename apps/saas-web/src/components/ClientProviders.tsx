'use client'

import { KindeProvider } from "@kinde-oss/kinde-auth-nextjs"
import { ReactNode } from "react"

interface ClientProvidersProps {
  children: ReactNode
}

export default function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <KindeProvider>
      {children}
    </KindeProvider>
  )
}