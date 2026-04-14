import type { UiSessionState } from '../types/session'
import { useTranslation } from '../lib/i18n'

export function StateIndicator({ state }: { state: UiSessionState }) {
  const { t } = useTranslation()

  const getCopy = (s: UiSessionState) => {
    switch (s) {
      case 'waiting_to_start':
        return { title: t('waiting_to_start_title'), detail: t('waiting_to_start_detail') }
      case 'your_turn_speaking':
        return { title: t('your_turn_speaking_title'), detail: t('your_turn_speaking_detail') }
      case 'other_speaker_active':
        return { title: t('other_speaker_active_title'), detail: t('other_speaker_active_detail') }
      case 'processing':
        return { title: t('processing_title'), detail: t('processing_detail') }
      case 'playback_output':
        return { title: t('playback_output_title'), detail: t('playback_output_detail') }
      case 'turn_complete':
        return { title: t('turn_complete_title'), detail: t('turn_complete_detail') }
      case 'repeat_required':
        return { title: t('repeat_required_title'), detail: t('repeat_required_detail') }
      case 'low_confidence':
        return { title: t('low_confidence_title'), detail: t('low_confidence_detail') }
      case 'no_result':
        return { title: t('no_result_title'), detail: t('no_result_detail') }
      case 'ended':
        return { title: t('ended_title'), detail: t('ended_detail') }
      case 'error':
        return { title: t('error_title'), detail: t('error_detail') }
      default:
        return { title: t('unknown_state_title'), detail: t('unknown_state_detail') }
    }
  }

  const copy = getCopy(state)

  return (
    <section className="conversation-card state-indicator" aria-live="polite" aria-label="Conversation state">
      <p className="eyebrow">{t('state')}</p>
      <strong>{copy.title}</strong>
      <span>{copy.detail}</span>
    </section>
  )
}

