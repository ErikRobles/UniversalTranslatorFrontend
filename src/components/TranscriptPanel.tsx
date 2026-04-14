import type { SpeakerRole, TranscriptItem } from '../types/session'

export function TranscriptPanel({ items, participantRole }: { items: TranscriptItem[]; participantRole: SpeakerRole }) {
  return (
    <section className="conversation-card transcript-panel" aria-label="Transcript panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Transcript</p>
          <strong>Conversation history</strong>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="empty-state">No transcript yet. Begin the first turn to populate the conversation.</p>
      ) : (
        <ol className="transcript-list">
          {items.map((item) => (
            <li key={item.content_id} className={`transcript-item transcript-speaker-${item.speaker_role.toLowerCase()}`}>
              <div className="transcript-meta">
                <strong>{item.speaker_role === participantRole ? 'You' : 'Other person'}</strong>
                <span>Turn {item.interaction_sequence}.{item.content_sequence}</span>
              </div>
              <p className="transcript-source">{item.source_text}</p>
              <p className="transcript-interpretation">
                {item.interpreted_text ?? 'No interpreted output recorded.'}
              </p>
              <p className="transcript-status">
                Interpretation: {item.interpretation_status ?? 'not_started'} · Playback: {item.playback_status ?? 'not_recorded'}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
