import type { ReactNode } from 'react'

import { useAuth } from '../../lib/auth/AuthContext'

export function AdminRoute({ children }: { children: ReactNode }) {
  const { authState } = useAuth()

  if (authState.status !== 'authenticated') {
    return <p role="status">Please sign in to access this admin area.</p>
  }

  if (authState.user?.role !== 'admin') {
    return <p role="status">Admin access is required for this area.</p>
  }

  return <>{children}</>
}
