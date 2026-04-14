import { useState, useEffect, type ReactNode } from 'react'

import { ProtectedRoute } from './routes/ProtectedRoute'
import { LoginScreen } from '../features/auth/LoginScreen'
import { RegisterScreen } from '../features/auth/RegisterScreen'
import { Cookies } from '../pages/Cookies'
import { PrivacyPolicy } from '../pages/PrivacyPolicy'
import { SessionPage } from '../pages/SessionPage'
import { Terms } from '../pages/Terms'
import { AuthProvider, useAuth } from '../lib/auth/AuthContext'

const themes = {
  light: {
    label: 'Light mode',
    surfaceClassName: 'theme-light',
  },
  dark: {
    label: 'Dark mode',
    surfaceClassName: 'theme-dark',
  },
} as const

type ThemeName = keyof typeof themes

type AuthView = 'login' | 'register'
type AppRoute = '/' | '/workspace' | '/privacy' | '/terms' | '/cookies'
type PricingPlanName = 'Starter' | 'Pro' | 'Team'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api/v1'

const pricingPlans: Array<{ name: PricingPlanName; planKey: 'starter' | 'pro' | 'team'; price: string; description: string }> = [
  {
    name: 'Starter',
    planKey: 'starter',
    price: '$9',
    description: 'For occasional interpreted conversations.',
  },
  {
    name: 'Pro',
    planKey: 'pro',
    price: '$29',
    description: 'For regular travel, family, and client conversations.',
  },
  {
    name: 'Team',
    planKey: 'team',
    price: '$99',
    description: 'For small teams coordinating multilingual support.',
  },
]

function currentRoute(): AppRoute {
  if (window.location.pathname === '/workspace') return '/workspace'
  if (window.location.pathname === '/privacy') return '/privacy'
  if (window.location.pathname === '/terms') return '/terms'
  if (window.location.pathname === '/cookies') return '/cookies'
  return '/'
}

function acknowledgmentKey(userId: string | undefined): string {
  return `universal_translator_translation_disclaimer_ack:${userId ?? 'anonymous'}`
}

function TranslationDisclaimerGate({ children }: { children: ReactNode }) {
  const { authState } = useAuth()
  const key = acknowledgmentKey(authState.user?.id)
  const [hasAcknowledged, setHasAcknowledged] = useState(() => window.localStorage.getItem(key) === 'true')
  const [isChecked, setIsChecked] = useState(false)

  useEffect(() => {
    setHasAcknowledged(window.localStorage.getItem(key) === 'true')
    setIsChecked(false)
  }, [key])

  const acceptDisclaimer = () => {
    if (!isChecked) return
    window.localStorage.setItem(key, 'true')
    setHasAcknowledged(true)
  }

  if (hasAcknowledged) {
    return <>{children}</>
  }

  return (
    <section className="disclaimer-gate" aria-labelledby="translation-disclaimer-title">
      <div className="usage-limit-modal" role="dialog" aria-modal="true" aria-labelledby="translation-disclaimer-title">
        <h2 id="translation-disclaimer-title">Translation accuracy acknowledgment</h2>
        <p>Universal Translator uses AI-assisted translation. Translations may contain errors, omissions, or misinterpretations.</p>
        <label className="legal-checkbox">
          <input type="checkbox" checked={isChecked} onChange={(event) => setIsChecked(event.target.checked)} />
          <span>I understand that translations may not be accurate and I accept all responsibility for their use.</span>
        </label>
        <button type="button" className="auth-submit" disabled={!isChecked} onClick={acceptDisclaimer}>
          Continue
        </button>
      </div>
    </section>
  )
}


function AppShell() {
  const [theme, setTheme] = useState<ThemeName>('light')
  const [authView, setAuthView] = useState<AuthView>('login')
  const [route, setRoute] = useState<AppRoute>(() => currentRoute())
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [initiatingPlan, setInitiatingPlan] = useState<PricingPlanName | null>(null)
  const nextTheme: ThemeName = theme === 'light' ? 'dark' : 'light'
  const { authState, logout } = useAuth()

  const navigate = (nextRoute: AppRoute) => {
    window.history.pushState({}, '', nextRoute)
    setRoute(nextRoute)
  }

  useEffect(() => {
    const handlePopState = () => setRoute(currentRoute())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    console.log('[Auth] State changed:', { status: authState.status, user: authState.user?.email, hasToken: !!authState.accessToken });
  }, [authState]);

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const themeToggle = (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(nextTheme)}
      aria-label={`Activate ${themes[nextTheme].label.toLowerCase()}`}
    >
      Switch to {themes[nextTheme].label}
    </button>
  )



  const startSubscriptionCheckout = async (plan: (typeof pricingPlans)[number]) => {
    setCheckoutError(null)

    if (authState.status !== 'authenticated' || authState.accessToken === null) {
      setAuthView('login')
      setCheckoutError('Please sign in before choosing a subscription plan.')
      return
    }

    const checkoutWindow = window.open('about:blank', '_blank')
    if (checkoutWindow === null) {
      setCheckoutError('Please allow popups to open PayPal checkout in a new tab.')
      return
    }

    checkoutWindow.opener = null
    setInitiatingPlan(plan.name)

    try {
      const response = await fetch(`${API_BASE}/billing/create-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authState.accessToken}`,
        },
        body: JSON.stringify({ plan: plan.planKey }),
      })

      if (!response.ok) {
        throw new Error('checkout_start_failed')
      }

      const payload = (await response.json()) as { approval_url?: string }
      if (typeof payload.approval_url !== 'string' || payload.approval_url.length === 0) {
        throw new Error('checkout_url_missing')
      }

      checkoutWindow.location.href = payload.approval_url
    } catch (error) {
      checkoutWindow.close()
      setCheckoutError('PayPal checkout could not be started. Please try again in a moment.')
    } finally {
      setInitiatingPlan(null)
    }
  }

  const signOutButton = authState.status === 'authenticated' ? (
    <button type="button" className="secondary-action" onClick={handleLogout}>
      Sign out
    </button>
  ) : null

  return (
    <div className={`app-shell ${themes[theme].surfaceClassName}`} data-theme={theme}>
      {route === '/privacy' ? (
        <PrivacyPolicy />
      ) : route === '/terms' ? (
        <Terms />
      ) : route === '/cookies' ? (
        <Cookies />
      ) : route === '/workspace' ? (
        <main className="workspace-page" aria-labelledby="workspace-title">
          <div className="workspace-header">
            <div>
              <p className="brand-mark">Universal Translator</p>
              <h1 id="workspace-title">Interpreter workspace</h1>
              <p className="hero-support">Start or resume a private two-person translation session.</p>
            </div>
            <div className="hero-actions">
              <button type="button" className="secondary-action" onClick={() => navigate('/')}>
                Landing page
              </button>
              {themeToggle}
              {signOutButton}
            </div>
          </div>
          <ProtectedRoute>
            <TranslationDisclaimerGate>
              <section className="access-preview" aria-label="Authenticated workspace user">
                <p>Signed in as: <strong>{authState.user?.email}</strong></p>
              </section>
              <SessionPage />
            </TranslationDisclaimerGate>
          </ProtectedRoute>
        </main>
      ) : (
        <main className="landing-page" aria-labelledby="hero-title">
          <section className="hero landing-hero">
            <div className="hero-copy">
              <p className="brand-mark">Universal Translator</p>
              <h1 id="hero-title">Speak naturally. Be understood.</h1>
              <p className="hero-support">
                Real-time, speech-first interpretation for two-person conversations across languages.
              </p>

              <div className="language-direction" aria-label="Language direction">
                <span>English</span>
                <span aria-hidden="true">↔</span>
                <span>Spanish · French · German · Portuguese · Russian</span>
              </div>

              <div className="hero-actions">
                <button type="button" className="theme-toggle" onClick={() => setAuthView('register')}>
                  Start now
                </button>
                <button type="button" className="secondary-action" onClick={() => setAuthView('login')}>
                  Log in
                </button>
                {authState.status === 'authenticated' ? (
                  <button type="button" className="secondary-action" onClick={() => navigate('/workspace')}>
                    Open workspace
                  </button>
                ) : null}
                {themeToggle}
                {signOutButton}
              </div>
            </div>

            <div className="hero-visual" aria-label="Account access">
              <div className="device-frame">
                <nav className="auth-tabs" aria-label="Authentication screens">
                  <button type="button" className={authView === 'login' ? 'auth-tab is-active' : 'auth-tab'} onClick={() => setAuthView('login')}>
                    Login
                  </button>
                  <button type="button" className={authView === 'register' ? 'auth-tab is-active' : 'auth-tab'} onClick={() => setAuthView('register')}>
                    Register
                  </button>
                </nav>

                {authView === 'login' ? <LoginScreen onAuthenticated={() => navigate('/workspace')} /> : <RegisterScreen onAuthenticated={() => navigate('/workspace')} />}
              </div>
            </div>
          </section>

          <section className="marketing-section" aria-labelledby="why-title">
            <p className="eyebrow">Why users need it</p>
            <h2 id="why-title">Smoother multilingual conversations</h2>
            <div className="marketing-grid">
              <article className="marketing-card">
                <h3>Two-person interpretation</h3>
                <p>Alternate turns naturally while the app carries meaning between both speakers.</p>
              </article>
              <article className="marketing-card">
                <h3>Simple session flow</h3>
                <p>Choose languages, start a session, speak, and hear translated output.</p>
              </article>
              <article className="marketing-card">
                <h3>Consistent interpreter voice</h3>
                <p>One interpreter voice stays locked for the active session.</p>
              </article>
            </div>
          </section>

          <section className="marketing-section" aria-labelledby="how-title">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title">From setup to translated speech</h2>
            <ol className="steps-list">
              <li>Choose both speakers' languages.</li>
              <li>Start a private conversation session.</li>
              <li>Speak naturally into the microphone.</li>
              <li>Hear the interpreted response for the other person.</li>
            </ol>
          </section>

          <section className="marketing-section" id="pricing" aria-labelledby="pricing-title">
            <p className="eyebrow">Pricing</p>
            <h2 id="pricing-title">Pick a plan when you're ready</h2>
            {checkoutError ? <p className="paypal-status" role="alert">{checkoutError}</p> : null}
            <div className="pricing-grid">
              {pricingPlans.map((plan) => (
                <article className="pricing-card" key={plan.name}>
                  <h3>{plan.name}</h3>
                  <p className="price">{plan.price}<span>/month</span></p>
                  <p>{plan.description}</p>
                  <button type="button" className="paypal-button" onClick={() => void startSubscriptionCheckout(plan)} disabled={initiatingPlan === plan.name}>
                    Buy with PayPal
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="marketing-section coming-soon" aria-labelledby="apps-title">
            <p className="eyebrow">Coming soon</p>
            <h2 id="apps-title">Mobile apps</h2>
            <div className="marketing-grid">
              <article className="marketing-card">
                <h3>Android app</h3>
                <p>On-the-go interpreted conversations for Android are coming soon.</p>
              </article>
              <article className="marketing-card">
                <h3>iOS app</h3>
                <p>iPhone and iPad support is planned for a future release.</p>
              </article>
            </div>
          </section>
          <footer className="landing-footer" aria-label="Legal links">
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms</a>
            <a href="/cookies">Cookies</a>
          </footer>
        </main>
      )}
    </div>
  )
}

export function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
