import type { ReactNode } from 'react'

import { useAuth } from '../../lib/auth/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { authState } = useAuth()

  if (authState.status !== 'authenticated') {
    return <p role="status">Please sign in to access this area.</p>
  }

  return <>{children}</>
}
