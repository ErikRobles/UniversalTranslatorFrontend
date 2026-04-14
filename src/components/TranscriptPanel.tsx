import type { SpeakerRole, TranscriptItem } from '../types/session'
import { useTranslation } from '../lib/i18n'

export function TranscriptPanel({ items, participantRole }: { items: TranscriptItem[]; participantRole: SpeakerRole }) {
  const { t } = useTranslation()
  return (
    <section className="conversation-card transcript-panel" aria-label="Transcript panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{t('transcript')}</p>
          <strong>{t('conversation_history')}</strong>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="empty-state">{t('no_transcript_yet')}</p>
      ) : (
        <ol className="transcript-list">
          {items.map((item) => (
            <li key={item.content_id} className={`transcript-item transcript-speaker-${item.speaker_role.toLowerCase()}`}>
              <div className="transcript-meta">
                <strong>{item.speaker_role === participantRole ? t('you') : t('other_person')}</strong>
                <span>{t('turn')} {item.interaction_sequence}.{item.content_sequence}</span>
              </div>
              <p className="transcript-source">{item.source_text}</p>
              <p className="transcript-interpretation">
                {item.interpreted_text ?? t('no_interpretation')}
              </p>
              <p className="transcript-status">
                {t('interpretation')}: {item.interpretation_status ?? t('status_not_started')} · {t('playback')}: {item.playback_status ?? t('status_not_recorded')}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

