import type { ConversationDirection, SpeakerRole } from '../types/session'
import { useTranslation } from '../lib/i18n'

export function TurnIndicator({
  currentTurnSpeaker,
  direction,
  participantRole,
}: {
  currentTurnSpeaker: SpeakerRole
  direction: ConversationDirection
  participantRole: SpeakerRole
}) {
  const { t } = useTranslation()
  const speakerName = currentTurnSpeaker === participantRole ? t('you') : t('other_person')
  return (
    <section className="conversation-card turn-indicator" aria-label="Current turn">
      <p className="eyebrow">{t('current_turn')}</p>
      <strong>{speakerName}</strong>
      <span>
        {direction.source_display_name} → {direction.target_display_name}
      </span>
    </section>
  )
}

