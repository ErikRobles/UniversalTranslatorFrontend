import { useEffect, useRef, useState } from 'react'
import { useMicrophoneCapture } from '../hooks/useMicrophoneCapture'
import { StateIndicator } from './StateIndicator'
import { TranscriptPanel } from './TranscriptPanel'
import { TurnIndicator } from './TurnIndicator'
import type { ConversationView as ConversationViewModel, SpeakerRole, UiSessionState } from '../types/session'

interface ConversationViewProps {
  conversationView: ConversationViewModel | null
  uiState: UiSessionState
  participantRole: SpeakerRole
  isLoading: boolean
  isSocketReady: boolean
  isSessionBound: boolean
  errorMessage: string | null
  onSubmitTurn: (audioData: ArrayBuffer, sampleRate: number) => Promise<unknown>
  onAdvanceTurn: () => void
  onEndConversation: () => Promise<unknown>
  onNewConversation: () => void
  usageLimitReached: boolean
}

export function ConversationView({
  conversationView,
  uiState,
  participantRole,
  isLoading,
  isSocketReady,
  isSessionBound,
  errorMessage,
  onSubmitTurn,
  onAdvanceTurn,
  onEndConversation,
  onNewConversation,
  usageLimitReached,
}: ConversationViewProps) {
  console.log(`[INSTRUMENTATION] ConversationView: received transcript length=${conversationView?.transcript.length ?? 0}`);
  const { isRecording, startRecording, stopRecording } = useMicrophoneCapture()
  const [isEndingConversation, setIsEndingConversation] = useState(false)
  const [isChiming, setIsChiming] = useState(false)
  const [hasPlayedInitialChime, setHasPlayedInitialChime] = useState(false)

  useEffect(() => {
    setHasPlayedInitialChime(false)
  }, [conversationView?.session_id])
  
  // Tighten the gate: 
  // 1. Backend must say it's our turn
  // 2. WebSocket must be open and bound to our role
  // 3. No other activity (loading/usage limits/chiming)
  const isOurTurnAccordingToBackend = conversationView !== null && conversationView.current_turn_speaker === participantRole
  const canSubmit = isOurTurnAccordingToBackend && 
                    conversationView.can_submit_turn && 
                    isSocketReady && 
                    isSessionBound && 
                    !isLoading && 
                    !usageLimitReached

  const canRecordNow = canSubmit && (uiState === 'your_turn_speaking' || uiState === 'repeat_required') && !isChiming
  
  const tsNow = new Date().toISOString()
  console.log(`[INSTRUMENTATION] [${tsNow}] Gating Check: canSubmit=${canSubmit}, isOurTurn=${isOurTurnAccordingToBackend}, isSocketReady=${isSocketReady}, isSessionBound=${isSessionBound}, uiState=${uiState}, canRecordNow=${canRecordNow}, isRecording=${isRecording}`)

  const lastAutoStartedTurnRef = useRef<string | null>(null)
  const isStoppingRecordingRef = useRef(false)

  const handleStartRecording = async () => {
    const ts = new Date().toISOString()
    console.log(`[INSTRUMENTATION] [${ts}] handleStartRecording called`)

    if (!hasPlayedInitialChime && conversationView?.transcript.length === 0) {
      console.log(`[INSTRUMENTATION] [${new Date().toISOString()}] Playing initial chime before first recording`)
      setIsChiming(true)
      try {
        const audio = new Audio(`${import.meta.env.BASE_URL}sounds/chime.wav`)
        audio.preload = 'auto'
        await audio.play()
        // Delay to allow chime to be heard and system to stabilize
        await new Promise(resolve => setTimeout(resolve, 1000))
        setHasPlayedInitialChime(true)
      } catch (err) {
        console.warn('Initial chime playback failed', err)
      } finally {
        setIsChiming(false)
      }
    }

    try {
      await startRecording()
      console.log(`[INSTRUMENTATION] [${new Date().toISOString()}] startRecording SUCCESS`)
    } catch (err) {
      console.error(`[INSTRUMENTATION] [${new Date().toISOString()}] startRecording FAILURE`, err)
    }
  }

  const handleStopRecording = async () => {
    const ts = new Date().toISOString()
    console.log(`[INSTRUMENTATION] [${ts}] handleStopRecording called`)
    if (isStoppingRecordingRef.current) {
      console.log(`[INSTRUMENTATION] [${new Date().toISOString()}] handleStopRecording BLOCKED (already stopping)`)
      return
    }
    isStoppingRecordingRef.current = true
    try {
      const { buffer, sampleRate } = await stopRecording()
      console.log(`[INSTRUMENTATION] [${new Date().toISOString()}] stopRecording SUCCESS, submitting...`)
      await onSubmitTurn(buffer, sampleRate)
    } catch (err) {
      console.error(`[INSTRUMENTATION] [${new Date().toISOString()}] handleStopRecording FAILURE`, err)
    } finally {
      isStoppingRecordingRef.current = false
    }
  }

  const handleEndConversation = async () => {
    setIsEndingConversation(true)
    try {
      if (isRecording) {
        await stopRecording().catch((err) => {
          console.warn('[UI] Failed to stop recording before ending conversation:', err)
          return { buffer: new ArrayBuffer(0), sampleRate: 16000 }
        })
      }
      await onEndConversation()
    } catch (err) {
      console.error('Failed to end conversation:', err)
    } finally {
      setIsEndingConversation(false)
    }
  }

  const getButtonText = () => {
    if (conversationView?.session_status === 'ended') return 'Conversation Ended'
    if (usageLimitReached) return 'Limit Reached'
    if (isChiming) return 'Get Ready...'
    if (isRecording) return '⏹ Stop & Translate'
    if (isLoading) return 'AI Processing...'
    if (uiState === 'playback_output') return 'AI is Speaking...'
    if (uiState === 'processing') return 'Interpreting...'
    if (uiState === 'turn_complete') return 'Handoff...'
    if (!isSocketReady || !isSessionBound) return 'Connecting...'
    if (uiState === 'other_speaker_active' || !isOurTurnAccordingToBackend) return "Other Speaker's Turn"
    return '🎤 Start Speaking'
  }

  useEffect(() => {
    const autoStartKey = conversationView === null
      ? null
      : `${conversationView.session_id}:${conversationView.current_turn_speaker}:${conversationView.transcript.length}`

    const ts = new Date().toISOString()
    console.log(`[INSTRUMENTATION] [${ts}] auto-start effect. key=${autoStartKey}, canRecordNow=${canRecordNow}, isRecording=${isRecording}`)

    if (
      conversationView === null ||
      conversationView.session_status === 'ended' ||
      !canRecordNow ||
      isRecording ||
      isEndingConversation ||
      lastAutoStartedTurnRef.current === autoStartKey
    ) {
      if (!canRecordNow) {
        lastAutoStartedTurnRef.current = null
      }
      return
    }

    console.log(`[INSTRUMENTATION] [${new Date().toISOString()}] Triggering AUTO-START recording`)
    lastAutoStartedTurnRef.current = autoStartKey
    void handleStartRecording()
  }, [canRecordNow, conversationView, isEndingConversation, isRecording])

  return (
    <div className="conversation-layout">
      {usageLimitReached ? (
        <div className="usage-limit-modal-backdrop" role="presentation">
          <div className="usage-limit-modal" role="dialog" aria-modal="true" aria-labelledby="usage-limit-title">
            <h2 id="usage-limit-title">You've reached your free limit</h2>
            <p>Continue your conversations by upgrading to a paid plan.</p>
            <a className="paypal-button" href="/#pricing">
              View plans
            </a>
          </div>
        </div>
      ) : null}

      <div className="conversation-summary">
        <StateIndicator state={uiState} />
        {conversationView !== null ? (
          <TurnIndicator
            currentTurnSpeaker={conversationView.current_turn_speaker}
            direction={conversationView.current_direction}
            participantRole={participantRole}
          />
        ) : null}
      </div>

      <section className="conversation-card composer-panel" aria-label="Turn composer">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Live conversation</p>
            <strong>{canRecordNow ? 'Your turn to speak' : 'Please wait for your turn'}</strong>
          </div>
        </div>

        {errorMessage !== null ? (
          <p className="error-banner" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="composer-actions" style={{ flexDirection: 'column', gap: '1rem' }}>
          {!isRecording ? (
            <button
              type="button"
              className="primary-action"
              style={{ 
                minHeight: '80px', 
                fontSize: '1.4rem', 
                background: canRecordNow ? 'var(--accent)' : '#e0e0e0', 
                color: canRecordNow ? 'white' : '#9e9e9e',
                opacity: canRecordNow ? 1 : 0.8,
                borderRadius: '1rem',
                cursor: canRecordNow ? 'pointer' : 'not-allowed'
              }}
              onClick={() => void handleStartRecording()}
              disabled={conversationView?.session_status === 'ended' || usageLimitReached || !canRecordNow}
            >
              {getButtonText()}
            </button>
          ) : (
            <button
              type="button"
              className="primary-action"
              style={{ 
                minHeight: '80px', 
                fontSize: '1.4rem', 
                background: '#d32f2f', 
                borderRadius: '1rem',
                cursor: 'pointer'
              }}
              onClick={() => void handleStopRecording()}
              disabled={conversationView?.session_status === 'ended' || usageLimitReached}
            >
              {getButtonText()}
            </button>
          )}

          <button
            type="button"
            className="secondary-action"
            onClick={() => void handleEndConversation()}
            disabled={conversationView?.session_status === 'ended' || isEndingConversation || conversationView === null}
          >
            {conversationView?.session_status === 'ended' ? 'Conversation Ended' : isEndingConversation ? 'Ending...' : 'End Conversation'}
          </button>

          {conversationView?.session_status === 'ended' ? (
            <button type="button" className="primary-action" onClick={onNewConversation}>
              Start New Conversation
            </button>
          ) : null}

          {/* Hidden Advance state button to maintain logic but remove from UI */}
          <button type="button" className="secondary-action" onClick={onAdvanceTurn} style={{ display: 'none' }}>
            Advance state
          </button>
        </div>
      </section>

      <TranscriptPanel items={conversationView?.transcript ?? []} participantRole={participantRole} />
    </div>
  )
}
