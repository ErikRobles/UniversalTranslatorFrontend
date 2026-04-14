import { startTransition, useState } from 'react'

import { AuthForm } from '../../components/auth/AuthForm'
import { authApi, type AuthApi } from '../../lib/api/authApi'
import { useAuth } from '../../lib/auth/AuthContext'

export function LoginScreen({ api = authApi, onAuthenticated }: { api?: AuthApi; onAuthenticated?: () => void }) {
  const { login } = useAuth()
  const [message, setMessage] = useState('Sign in to continue with your interpreter sessions.')
  const [isLoading, setIsLoading] = useState(false)

  return (
    <section className="auth-panel" aria-labelledby="login-title">
      <AuthForm
        title="Welcome back"
        submitLabel="Sign in"
        helperText="Use your email and password to access your interpreter workspace."
        isLoading={isLoading}
        onSubmit={async (payload) => {
          setIsLoading(true)
          try {
            setMessage('Signing in...')
            const response = await api.login(payload)
            startTransition(() => {
              login(response.user, response.access_token)
              onAuthenticated?.()
            })
            setMessage(`Signed in as ${response.user.email}`)
          } catch (err) {
            console.error(err)
            setMessage(err instanceof Error ? err.message : 'Login failed')
          } finally {
            setIsLoading(false)
          }
        }}
      />
      <p id="login-title" className="auth-message" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  )
}
