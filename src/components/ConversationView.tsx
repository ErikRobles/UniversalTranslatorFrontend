import { useEffect, useRef, useState } from 'react'
import { useMicrophoneCapture } from '../hooks/useMicrophoneCapture'
import { StateIndicator } from './StateIndicator'
import { TranscriptPanel } from './TranscriptPanel'
import { TurnIndicator } from './TurnIndicator'
import { useTranslation } from '../lib/i18n'
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
  const { t } = useTranslation();
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
      const endTs = new Date().toISOString()

      // FINAL GUARD: If the gate closed while we were stopping, discard.
      if (!canSubmit) {
        console.warn(`[INSTRUMENTATION] [${endTs}] DISCARDING recording: turn is no longer valid (canSubmit=false)`)
        return
      }

      console.log(`[INSTRUMENTATION] [${endTs}] stopRecording SUCCESS, submitting...`)
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
    if (conversationView?.session_status === 'ended') return t('conversation_ended')
    if (usageLimitReached) return t('limit_reached')
    if (isChiming) return t('get_ready')
    if (isRecording) return `⏹ ${t('stop_and_translate')}`
    if (isLoading) return t('ai_processing')
    if (uiState === 'playback_output') return t('ai_is_speaking')
    if (uiState === 'processing') return t('interpreting')
    if (uiState === 'turn_complete') return t('handoff')
    if (!isSocketReady || !isSessionBound) return t('connecting')
    if (uiState === 'other_speaker_active' || !isOurTurnAccordingToBackend) return t('other_speaker_turn')
    return `🎤 ${t('start_speaking')}`
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

  // CLEANUP EFFECT: If we are recording but the gate closes, force stop the microphone.
  useEffect(() => {
    if (isRecording && !canRecordNow && !isChiming && !isStoppingRecordingRef.current) {
      console.warn(`[INSTRUMENTATION] [${new Date().toISOString()}] Force stopping recording: gate closed (canRecordNow=false)`)
      void stopRecording()
    }
  }, [isRecording, canRecordNow, isChiming, stopRecording])

  return (
    <div className="conversation-layout">
      {usageLimitReached ? (
        <div className="usage-limit-modal-backdrop" role="presentation">
          <div className="usage-limit-modal" role="dialog" aria-modal="true" aria-labelledby="usage-limit-title">
            <h2 id="usage-limit-title">{t('limit_reached_title')}</h2>
            <p>{t('limit_reached_support')}</p>
            <a className="paypal-button" href="/#pricing">
              {t('view_plans')}
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
            <p className="eyebrow">{t('live_conversation')}</p>
            <strong>{canRecordNow ? t('your_turn') : t('please_wait')}</strong>
          </div>
        </div>

        {errorMessage !== null ? (
          <p className="error-banner" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '0 0 0.5rem 0' }}>
          {t('instruction_helper')}
        </p>

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
            {conversationView?.session_status === 'ended' ? t('conversation_ended') : isEndingConversation ? t('ending') : t('end_conversation')}
          </button>

          {conversationView?.session_status === 'ended' ? (
            <button type="button" className="primary-action" onClick={onNewConversation}>
              {t('start_new_conversation')}
            </button>
          ) : null}

          {/* Hidden Advance state button to maintain logic but remove from UI */}
          <button type="button" className="secondary-action" onClick={onAdvanceTurn} style={{ display: 'none' }}>
            {t('advance_state')}
          </button>
        </div>
      </section>

      <TranscriptPanel items={conversationView?.transcript ?? []} participantRole={participantRole} />
    </div>
  )
}
