import { startTransition, useState } from 'react'

import { AuthForm } from '../../components/auth/AuthForm'
import { authApi, type AuthApi } from '../../lib/api/authApi'
import { useAuth } from '../../lib/auth/AuthContext'
import { useTranslation } from '../../lib/i18n'

export function LoginScreen({ api = authApi, onAuthenticated }: { api?: AuthApi; onAuthenticated?: () => void }) {
  const { login } = useAuth()
  const { t } = useTranslation()
  const [statusKey, setStatusKey] = useState<string>('login_message')
  const [statusData, setStatusData] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const displayMessage = statusData ? `${t(statusKey)} ${statusData}` : t(statusKey)

  return (
    <section className="auth-panel" aria-labelledby="login-title">
      <AuthForm
        title={t('login_title')}
        submitLabel={t('log_in')}
        helperText={t('login_helper')}
        isLoading={isLoading}
        onSubmit={async (payload) => {
          setIsLoading(true)
          try {
            setStatusKey('signing_in')
            setStatusData(null)
            const response = await api.login(payload)
            startTransition(() => {
              login(response.user, response.access_token)
              onAuthenticated?.()
            })
            setStatusKey('signed_in_as')
            setStatusData(response.user.email)
          } catch (err) {
            console.error(err)
            const errorDetail = err instanceof Error ? err.message : 'login_failed'
            setStatusKey(errorDetail)
            setStatusData(null)
          } finally {
            setIsLoading(false)
          }
        }}
      />
      <p id="login-title" className="auth-message" role="status" aria-live="polite">
        {displayMessage}
      </p>
    </section>
  )
}
