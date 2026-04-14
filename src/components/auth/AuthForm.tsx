import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from '../../lib/i18n'

interface AuthFormProps {
  title: string
  submitLabel: string
  helperText: string
  isLoading?: boolean
  children?: ReactNode
  onSubmit: (payload: { email: string; password: string }) => Promise<void> | void
}

export function AuthForm({ title, submitLabel, helperText, isLoading, children, onSubmit }: AuthFormProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email.includes('@')) {
      setError(t('error_invalid_email'))
      return
    }
    if (password.length < 8) {
      setError(t('error_password_length'))
      return
    }
    setError(null)
    await onSubmit({ email, password })
  }

  return (
    <form className="auth-form" aria-label={title} onSubmit={handleSubmit}>
      <div>
        <h2>{title}</h2>
        <p>{helperText}</p>
      </div>

      <label>
        {t('email_label')}
        <input value={email} onChange={(event) => setEmail(event.target.value)} name="email" type="email" />
      </label>

      <label>
        {t('password_label')}
        <input value={password} onChange={(event) => setPassword(event.target.value)} name="password" type="password" />
      </label>

      {children}

      {error ? (
        <p role="alert" className="auth-error">
          {error}
        </p>
      ) : null}

      <button type="submit" className="auth-submit" disabled={isLoading}>
        {isLoading ? t('processing') : submitLabel}
      </button>
    </form>
  )
}
