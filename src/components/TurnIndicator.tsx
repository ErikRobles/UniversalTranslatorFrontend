import type { ConversationDirection, SpeakerRole } from '../types/session'

export function TurnIndicator({
  currentTurnSpeaker,
  direction,
  participantRole,
}: {
  currentTurnSpeaker: SpeakerRole
  direction: ConversationDirection
  participantRole: SpeakerRole
}) {
  const speakerName = currentTurnSpeaker === participantRole ? 'You' : 'Other person'
  return (
    <section className="conversation-card turn-indicator" aria-label="Current turn">
      <p className="eyebrow">Current turn</p>
      <strong>{speakerName}</strong>
      <span>
        {direction.source_display_name} → {direction.target_display_name}
      </span>
    </section>
  )
}
