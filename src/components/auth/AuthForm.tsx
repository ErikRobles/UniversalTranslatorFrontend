import { useState, type FormEvent, type ReactNode } from 'react'

interface AuthFormProps {
  title: string
  submitLabel: string
  helperText: string
  isLoading?: boolean
  children?: ReactNode
  onSubmit: (payload: { email: string; password: string }) => Promise<void> | void
}

export function AuthForm({ title, submitLabel, helperText, isLoading, children, onSubmit }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
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
        Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} name="email" type="email" />
      </label>

      <label>
        Password
        <input value={password} onChange={(event) => setPassword(event.target.value)} name="password" type="password" />
      </label>

      {children}

      {error ? (
        <p role="alert" className="auth-error">
          {error}
        </p>
      ) : null}

      <button type="submit" className="auth-submit" disabled={isLoading}>
        {isLoading ? 'Processing...' : submitLabel}
      </button>
    </form>
  )
}
