import { useState, useEffect, type ReactNode } from 'react'

import { ProtectedRoute } from './routes/ProtectedRoute'
import { LoginScreen } from '../features/auth/LoginScreen'
import { RegisterScreen } from '../features/auth/RegisterScreen'
import { Cookies } from '../pages/Cookies'
import { PrivacyPolicy } from '../pages/PrivacyPolicy'
import { SessionPage } from '../pages/SessionPage'
import { Terms } from '../pages/Terms'
import { AuthProvider, useAuth } from '../lib/auth/AuthContext'
import { LanguageProvider, useTranslation } from '../lib/i18n'
import { LanguageSelector } from '../components/LanguageSelector'

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
    description: 'plan_starter_desc',
  },
  {
    name: 'Pro',
    planKey: 'pro',
    price: '$29',
    description: 'plan_pro_desc',
  },
  {
    name: 'Team',
    planKey: 'team',
    price: '$99',
    description: 'plan_team_desc',
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
  const { t } = useTranslation()
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
        <h2 id="translation-disclaimer-title">{t('disclaimer_title')}</h2>
        <p>{t('disclaimer_body')}</p>
        <label className="legal-checkbox">
          <input type="checkbox" checked={isChecked} onChange={(event) => setIsChecked(event.target.checked)} />
          <span>{t('disclaimer_checkbox')}</span>
        </label>
        <button type="button" className="auth-submit" disabled={!isChecked} onClick={acceptDisclaimer}>
          {t('continue')}
        </button>
      </div>
    </section>
  )
}


function AppShell() {
  const { t } = useTranslation()
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
      aria-label={`${t('switch_to')} ${t(nextTheme === 'light' ? 'light_mode' : 'dark_mode').toLowerCase()}`}
    >
      {t('switch_to')} {t(nextTheme === 'light' ? 'light_mode' : 'dark_mode')}
    </button>
  )



  const startSubscriptionCheckout = async (plan: (typeof pricingPlans)[number]) => {
    setCheckoutError(null)

    if (authState.status !== 'authenticated' || authState.accessToken === null) {
      setAuthView('login')
      setCheckoutError(t('checkout_signin_required'))
      return
    }

    const checkoutWindow = window.open('about:blank', '_blank')
    if (checkoutWindow === null) {
      setCheckoutError(t('checkout_popups_required'))
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
      setCheckoutError(t('checkout_failed'))
    } finally {
      setInitiatingPlan(null)
    }
  }

  const signOutButton = authState.status === 'authenticated' ? (
    <button type="button" className="secondary-action" onClick={handleLogout}>
      {t('sign_out')}
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
              <p className="brand-mark">{t('brand_name')}</p>
              <h1 id="workspace-title">{t('workspace_title')}</h1>
              <p className="hero-support">{t('workspace_support')}</p>
            </div>
            <div className="hero-actions">
              <LanguageSelector />
              <button type="button" className="secondary-action" onClick={() => navigate('/')}>
                {t('landing_page')}
              </button>
              {themeToggle}
              {signOutButton}
            </div>
          </div>
          <ProtectedRoute>
            <TranslationDisclaimerGate>
              <section className="access-preview" aria-label="Authenticated workspace user">
                <p>{t('signed_in_as')} <strong>{authState.user?.email}</strong></p>
              </section>
              <SessionPage />
            </TranslationDisclaimerGate>
          </ProtectedRoute>
        </main>
      ) : (
        <main className="landing-page" aria-labelledby="hero-title">
          <section className="hero landing-hero">
            <div className="hero-copy">
              <p className="brand-mark">{t('brand_name')}</p>
              <h1 id="hero-title">{t('hero_title')}</h1>
              <p className="hero-support">
                {t('hero_support')}
              </p>

              <div className="language_direction" aria-label="Language direction">
                <span>{t('lang_en')}</span>
                <span aria-hidden="true">↔</span>
                <span>{t('lang_others')}</span>
              </div>

              <div className="hero-actions">
                <LanguageSelector />
                <button type="button" className="theme-toggle" onClick={() => setAuthView('register')}>
                  {t('start_now')}
                </button>
                <button type="button" className="secondary-action" onClick={() => setAuthView('login')}>
                  {t('log_in')}
                </button>
                {authState.status === 'authenticated' ? (
                  <button type="button" className="secondary-action" onClick={() => navigate('/workspace')}>
                    {t('open_workspace')}
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
                    {t('log_in')}
                  </button>
                  <button type="button" className={authView === 'register' ? 'auth-tab is-active' : 'auth-tab'} onClick={() => setAuthView('register')}>
                    {t('register')}
                  </button>
                </nav>

                {authView === 'login' ? <LoginScreen onAuthenticated={() => navigate('/workspace')} /> : <RegisterScreen onAuthenticated={() => navigate('/workspace')} />}
              </div>
            </div>
          </section>

          <section className="marketing-section" aria-labelledby="why-title">
            <p className="eyebrow">{t('why_eyebrow')}</p>
            <h2 id="why-title">{t('why_title')}</h2>
            <div className="marketing-grid">
              <article className="marketing-card">
                <h3>{t('feature_1_title')}</h3>
                <p>{t('feature_1_desc')}</p>
              </article>
              <article className="marketing-card">
                <h3>{t('feature_2_title')}</h3>
                <p>{t('feature_2_desc')}</p>
              </article>
              <article className="marketing-card">
                <h3>{t('feature_3_title')}</h3>
                <p>{t('feature_3_desc')}</p>
              </article>
            </div>
          </section>

          <section className="marketing-section" aria-labelledby="how-title">
            <p className="eyebrow">{t('how_eyebrow')}</p>
            <h2 id="how-title">{t('how_title')}</h2>
            <ol className="steps-list">
              <li>{t('step_1')}</li>
              <li>{t('step_2')}</li>
              <li>{t('step_3')}</li>
              <li>{t('step_4')}</li>
            </ol>
          </section>

          <section className="marketing-section" id="pricing" aria-labelledby="pricing-title">
            <p className="eyebrow">{t('pricing_eyebrow')}</p>
            <h2 id="pricing-title">{t('pricing_title')}</h2>
            {checkoutError ? <p className="paypal-status" role="alert">{checkoutError}</p> : null}
            <div className="pricing-grid">
              {pricingPlans.map((plan) => (
                <article className="pricing-card" key={plan.name}>
                  <h3>{t('plan_' + plan.planKey)}</h3>
                  <p className="price">{plan.price}<span>{t('per_month')}</span></p>
                  <p>{t(plan.description)}</p>
                  <button type="button" className="paypal-button" onClick={() => void startSubscriptionCheckout(plan)} disabled={initiatingPlan === plan.name}>
                    {t('buy_with_paypal')}
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="marketing-section coming-soon" aria-labelledby="apps-title">
            <p className="eyebrow">{t('coming_soon_eyebrow')}</p>
            <h2 id="apps-title">{t('apps_title')}</h2>
            <div className="marketing-grid">
              <article className="marketing-card">
                <h3>{t('android_app')}</h3>
                <p>{t('android_app_desc')}</p>
              </article>
              <article className="marketing-card">
                <h3>{t('ios_app')}</h3>
                <p>{t('ios_app_desc')}</p>
              </article>
            </div>
          </section>
          <footer className="landing-footer" aria-label="Legal links">
            <a href="/privacy">{t('privacy_policy')}</a>
            <a href="/terms">{t('terms_of_service')}</a>
            <a href="/cookies">{t('cookies_policy')}</a>
          </footer>
        </main>
      )}
    </div>
  )
}

export function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AppShell />
      </LanguageProvider>
    </AuthProvider>
  )
}
