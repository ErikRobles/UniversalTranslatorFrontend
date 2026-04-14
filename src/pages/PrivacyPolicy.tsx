import { useTranslation } from '../lib/i18n'

export function PrivacyPolicy() {
  const { t } = useTranslation()
  return (
    <main className="legal-page" aria-labelledby="privacy-title">
      <p className="brand-mark">{t('brand_name')}</p>
      <h1 id="privacy-title">{t('privacy_policy')}</h1>
      <p className="legal-updated">{t('last_updated')}: April 12, 2026</p>

      <section>
        <h2>Information collected</h2>
        <p>We collect account information such as your email address, usage information related to sessions and plan limits, and audio inputs needed to provide translation functionality.</p>
      </section>

      <section>
        <h2>How data is used</h2>
        <p>We use information to operate real-time translation, maintain sessions, improve system reliability, support billing and subscriptions, prevent abuse, and provide customer support.</p>
      </section>

      <section>
        <h2>Audio handling</h2>
        <p>Audio is processed transiently to provide speech recognition, translation, and text-to-speech output. Audio is not guaranteed to be stored, and the service should not be used as an archive or recording system.</p>
      </section>

      <section>
        <h2>Third parties</h2>
        <p>We may use PayPal for billing and subscription management. We may also use AI providers to process speech, translation, and related language tasks required to deliver the service.</p>
      </section>

      <section>
        <h2>Security</h2>
        <p>We use reasonable technical and organizational safeguards designed to protect account and service data. No internet service can be guaranteed to be completely secure.</p>
      </section>

      <section>
        <h2>User rights</h2>
        <p>You may request access, correction, or deletion of personal information where applicable. Some information may be retained when required for billing, security, legal, or operational reasons.</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Contact us at: privacy@example.com.</p>
      </section>

      <a className="secondary-action legal-home-link" href="/">{t('back_to_home')}</a>
    </main>
  )
}
