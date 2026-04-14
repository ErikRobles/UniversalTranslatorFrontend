import type { ReactNode } from 'react'

import { useAuth } from '../../lib/auth/AuthContext'
import { useTranslation } from '../../lib/i18n'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { authState } = useAuth()
  const { t } = useTranslation()

  if (authState.status !== 'authenticated') {
    return <p role="status">{t('signin_required')}</p>
  }

  return <>{children}</>
}
