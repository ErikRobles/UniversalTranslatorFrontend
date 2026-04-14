import { startTransition, useState } from 'react'

import { AuthForm } from '../../components/auth/AuthForm'
import { authApi, type AuthApi } from '../../lib/api/authApi'
import { useAuth } from '../../lib/auth/AuthContext'
import { useTranslation } from '../../lib/i18n'

export function RegisterScreen({ api = authApi, onAuthenticated }: { api?: AuthApi; onAuthenticated?: () => void }) {
  const { login } = useAuth()
  const { t } = useTranslation()
  const [statusKey, setStatusKey] = useState<string>('register_message')
  const [statusData, setStatusData] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false)

  const displayMessage = statusData ? `${t(statusKey)} ${statusData}` : t(statusKey)

  return (
    <section className="auth-panel" aria-labelledby="register-title">
      <AuthForm
        title={t('register_title')}
        submitLabel={t('register')}
        helperText={t('register_helper')}
        isLoading={isLoading}
        onSubmit={async (payload) => {
          if (!hasAcceptedLegal) {
            setStatusKey('legal_required')
            setStatusData(null)
            return
          }
          setIsLoading(true)
          try {
            setStatusKey('creating_account')
            setStatusData(null)
            const response = await api.register(payload)
            startTransition(() => {
              login(response.user, response.access_token)
              onAuthenticated?.()
            })
            setStatusKey('account_created')
            setStatusData(response.user.email)
          } catch (err) {
            console.error(err)
            const errorDetail = err instanceof Error ? err.message : 'registration_failed'
            setStatusKey(errorDetail)
            setStatusData(null)
          } finally {
            setIsLoading(false)
          }
        }}
      >
        <label className="legal-checkbox">
          <input type="checkbox" checked={hasAcceptedLegal} onChange={(event) => setHasAcceptedLegal(event.target.checked)} />
          <span>
            {t('agree_to')} <a href="/terms">{t('terms_and_conditions')}</a> {t('and')} <a href="/privacy">{t('privacy_policy')}</a>.
          </span>
        </label>
      </AuthForm>
      <p id="register-title" className="auth-message" role="status" aria-live="polite">
        {displayMessage}
      </p>
    </section>
  )
}
