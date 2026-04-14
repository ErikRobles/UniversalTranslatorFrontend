import { useTranslation } from '../lib/i18n'

export function Cookies() {
  const { t } = useTranslation()
  return (
    <main className="legal-page" aria-labelledby="cookies-title">
      <p className="brand-mark">{t('brand_name')}</p>
      <h1 id="cookies-title">{t('cookies_policy')}</h1>
      <p className="legal-updated">{t('last_updated')}: April 12, 2026</p>

      <section>
        <h2>Basic cookie usage</h2>
        <p>We use cookies and similar local storage technologies to keep the service functional, remember user preferences, and support secure account access.</p>
      </section>

      <section>
        <h2>Session and authentication</h2>
        <p>Session and authentication storage may be used to keep you signed in, validate your account state, and protect access to authenticated workspace features.</p>
      </section>

      <section>
        <h2>Analytics</h2>
        <p>We do not add analytics tracking in this policy implementation. If analytics are introduced later, this policy should be updated to describe the provider and purpose.</p>
      </section>

      <section>
        <h2>{t('privacy_policy')}</h2>
        <p>For more information about how information is handled, please review our <a href="/privacy">{t('privacy_policy')}</a>.</p>
      </section>

      <a className="secondary-action legal-home-link" href="/">{t('back_to_home')}</a>
    </main>
  )
}
