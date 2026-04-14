import type { UiSessionState } from '../types/session'

const copyByState: Record<UiSessionState, { title: string; detail: string }> = {
  waiting_to_start: {
    title: 'Tap start to begin',
    detail: 'The interpreter is ready for your conversation.',
  },
  your_turn_speaking: {
    title: 'Your turn',
    detail: 'Speak now. The system is capturing your voice.',
  },
  other_speaker_active: {
    title: 'Other person is speaking',
    detail: 'Please wait for the other speaker to finish.',
  },
  processing: {
    title: 'Translating...',
    detail: 'Carrying your meaning across languages.',
  },
  playback_output: {
    title: 'Playing translation...',
    detail: 'Delivering the interpreted audio.',
  },
  turn_complete: {
    title: 'Your turn',
    detail: 'Turn finished. You can speak again or wait.',
  },
  repeat_required: {
    title: 'Please repeat',
    detail: 'The interpreter needs you to say that again.',
  },
  low_confidence: {
    title: 'Not sure, please repeat',
    detail: 'The audio was unclear. Please try speaking again.',
  },
  no_result: {
    title: "Didn't catch that, try again",
    detail: 'No speech was detected. Please check your microphone.',
  },
  ended: {
    title: 'Conversation ended',
    detail: 'This session has been closed and will not continue listening.',
  },
  error: {
    title: 'Something went wrong',
    detail: 'An unexpected error occurred. Please try refreshing.',
  },
}

export function StateIndicator({ state }: { state: UiSessionState }) {
  const copy = copyByState[state] ?? {
    title: 'Unknown state',
    detail: `State "${state}" is not mapped in the UI.`,
  }
  return (
    <section className="conversation-card state-indicator" aria-live="polite" aria-label="Conversation state">
      <p className="eyebrow">State</p>
      <strong>{copy.title}</strong>
      <span>{copy.detail}</span>
    </section>
  )
}
