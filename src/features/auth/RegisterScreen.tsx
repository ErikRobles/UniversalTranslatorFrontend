import { startTransition, useState } from 'react'

import { AuthForm } from '../../components/auth/AuthForm'
import { authApi, type AuthApi } from '../../lib/api/authApi'
import { useAuth } from '../../lib/auth/AuthContext'

export function RegisterScreen({ api = authApi, onAuthenticated }: { api?: AuthApi; onAuthenticated?: () => void }) {
  const { login } = useAuth()
  const [message, setMessage] = useState('Create an account to save your settings and access your usage plan.')
  const [isLoading, setIsLoading] = useState(false)
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false)

  return (
    <section className="auth-panel" aria-labelledby="register-title">
      <AuthForm
        title="Create your account"
        submitLabel="Register"
        helperText="Start with email/password now. Social sign-in hooks are prepared for a later phase."
        isLoading={isLoading}
        onSubmit={async (payload) => {
          if (!hasAcceptedLegal) {
            setMessage('You must agree to the Terms & Conditions and Privacy Policy before registering.')
            return
          }
          setIsLoading(true)
          try {
            setMessage('Creating account...')
            const response = await api.register(payload)
            startTransition(() => {
              login(response.user, response.access_token)
              onAuthenticated?.()
            })
            setMessage(`Account created for ${response.user.email}`)
          } catch (err) {
            console.error(err)
            setMessage(err instanceof Error ? err.message : 'Registration failed')
          } finally {
            setIsLoading(false)
          }
        }}
      >
        <label className="legal-checkbox">
          <input type="checkbox" checked={hasAcceptedLegal} onChange={(event) => setHasAcceptedLegal(event.target.checked)} />
          <span>
            I agree to the <a href="/terms">Terms &amp; Conditions</a> and <a href="/privacy">Privacy Policy</a>.
          </span>
        </label>
      </AuthForm>
      <p id="register-title" className="auth-message" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  )
}
