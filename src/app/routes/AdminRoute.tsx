import type { ReactNode } from 'react'

import { useAuth } from '../../lib/auth/AuthContext'
import { useTranslation } from '../../lib/i18n'

export function AdminRoute({ children }: { children: ReactNode }) {
  const { authState } = useAuth()
  const { t } = useTranslation()

  if (authState.status !== 'authenticated') {
    return <p role="status">{t('admin_signin_required')}</p>
  }

  if (authState.user?.role !== 'admin') {
    return <p role="status">{t('admin_required')}</p>
  }

  return <>{children}</>
}
