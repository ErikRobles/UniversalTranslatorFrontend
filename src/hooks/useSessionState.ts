import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { BackendConversationState, ConversationView, SpeakerRole, UiSessionState } from '../types/session'

interface UseSessionStateOptions {
  accessToken: string | null
  fetchImpl?: typeof fetch
}

interface ApiErrorShape {
  detail?: string
  error?: string
}

export function mapBackendStateToUiState(
  view: ConversationView | null,
  participantRole: SpeakerRole,
  transientState: UiSessionState | null,
): UiSessionState {
  if (view?.session_status === 'ended') {
    return 'ended';
  }

  // If backend already has content and is in playback/turn_complete, it is more authoritative than 'processing'
  let effectiveBackendState: BackendConversationState | null = view?.backend_state ?? null;

  if (transientState !== null) {
    if (transientState === 'processing' && view && view.transcript.length > 0) {
      const lastItem = view.transcript[view.transcript.length - 1];
      if (lastItem.interpretation_status === 'succeeded' || lastItem.interpretation_status === 'repeat_requested' || lastItem.playback_status === 'completed') {
        console.log('[UI] Backend truth overriding transient processing state', { backend: view.backend_state });
        // Continue to use effectiveBackendState instead of returning transientState
      } else {
        return transientState;
      }
    } else if (transientState === 'turn_complete' && view?.backend_state === 'awaiting_speaker') {
      console.log('[UI] Backend truth overriding transient turn_complete state', {
        backend: view.backend_state,
        current_turn_speaker: view.current_turn_speaker,
      });
    } else if (transientState === 'turn_complete' && view?.backend_state === 'repeat_required') {
      console.log('[UI] Backend truth overriding transient turn_complete state for repeat', {
        backend: view.backend_state,
        current_turn_speaker: view.current_turn_speaker,
      });
    } else {
      return transientState;
    }
  }

  if (view === null || effectiveBackendState === null) {
    return 'waiting_to_start';
  }

  switch (effectiveBackendState) {
    case 'awaiting_speaker':
      return view.current_turn_speaker === participantRole ? 'your_turn_speaking' : 'other_speaker_active';
    case 'waiting_to_start':
    case 'processing':
    case 'playback_output':
    case 'turn_complete':
    case 'repeat_required':
    case 'low_confidence':
    case 'no_result':
    case 'error':
      return effectiveBackendState;
    default:
      const result: UiSessionState = 'waiting_to_start';
      console.log('[UI] Unknown state mapped to:', result, { unknownState: effectiveBackendState });
      return result;
  }
}

export function resolveSubmissionSpeakerRole(view: ConversationView, participantRole: SpeakerRole): SpeakerRole {
  return view.backend_state === 'repeat_required' ? view.current_turn_speaker : participantRole
}

async function parseJson<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T
  }
  const errorBody = (await response.json().catch(() => ({}))) as ApiErrorShape
  throw new Error(errorBody.error ?? errorBody.detail ?? `request_failed_${response.status}`)
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api/v1'
const WS_BASE = API_BASE.replace('http', 'ws') + '/realtime/ws'

export function useSessionState(sessionId: string, participantRole: SpeakerRole, options: UseSessionStateOptions) {
  useEffect(() => {
    console.log('[Session] Hook initialized', { sessionId, role: participantRole });
  }, []);

  const { accessToken, fetchImpl = fetch } = options
  const [view, setView] = useState<ConversationView | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [transientState, setTransientState] = useState<UiSessionState | null>(null)
  const [isSocketReady, setIsSocketReady] = useState(false)
  const [isSessionBound, setIsSessionBound] = useState(false)
  const [usageLimitReached, setUsageLimitReached] = useState(false)
  const [browserCompletedPlaybackUtteranceId, setBrowserCompletedPlaybackUtteranceId] = useState<string | null>(null)
  const lastChimedUtteranceId = useRef<string | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null)
  const browserCompletedPlaybackUtteranceIdRef = useRef<string | null>(null)
  const isRefreshing = useRef(false)

  const authorizedFetch = useCallback(
    async <T,>(path: string, init?: RequestInit) => {
      if (accessToken === null) {
        throw new Error('authentication_required')
      }
      const response = await fetchImpl(`${API_BASE}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...(init?.headers ?? {}),
        },
      })
      return parseJson<T>(response)
    },
    [accessToken, fetchImpl],
  )

  const refresh = useCallback(
    async (reason: string = 'manual') => {
      if (!sessionId.trim() || accessToken === null) return null
      if (isRefreshing.current) return null

      const ts = new Date().toISOString()
      isRefreshing.current = true
      setIsLoading(true)
      setErrorMessage(null)
      console.log(`[INSTRUMENTATION] [${ts}] refresh START. reason=${reason}, sessionId=${sessionId}`)

      try {
        const nextView = await authorizedFetch<ConversationView>(`/sessions/${sessionId}/conversation-view`)
        const latestItem = nextView.transcript[nextView.transcript.length - 1];
        const now = new Date().toISOString()
        console.log(`[INSTRUMENTATION] [${now}] refresh SUCCESS. reason=${reason}`, {
          backend_state: nextView.backend_state,
          current_turn_speaker: nextView.current_turn_speaker,
          transcript_count: nextView.transcript.length,
          can_submit: nextView.can_submit_turn
        });
        setView(nextView)
        return nextView
      } catch (error) {
        const now = new Date().toISOString()
        const message = error instanceof Error ? error.message : 'conversation_view_failed'
        console.error(`[INSTRUMENTATION] [${now}] refresh FAILURE. reason=${reason}, error=${message}`)
        setErrorMessage(message)
        setView(null)
        return null
      } finally {
        setIsLoading(false)
        isRefreshing.current = false
      }
    },
    [accessToken, authorizedFetch, sessionId],
  )

  // Initialize refreshRef AFTER refresh is declared
  const refreshRef = useRef<typeof refresh>(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  // Initial load only - triggered by sessionId/accessToken change
  useEffect(() => {
    if (sessionId && accessToken) {
      void refreshRef.current('initial_load')
    }
  }, [sessionId, accessToken])

  useEffect(() => {
    if (!sessionId || !accessToken) return

    setIsSocketReady(false)
    setIsSessionBound(false)
    const wsUrl = `${WS_BASE}?token=${accessToken}`
    console.log('[Realtime] Connecting to WebSocket:', WS_BASE)
    const socket = new WebSocket(wsUrl)
    socketRef.current = socket

    socket.onopen = () => {
      const ts = new Date().toISOString()
      console.log(`[INSTRUMENTATION] [${ts}] WebSocket OPENED. session=${sessionId}, role=${participantRole}`)
      setIsSocketReady(true)
      socket.send(
        JSON.stringify({
          type: 'session.bind',
          payload: { session_id: sessionId, speaker_role: participantRole },
        }),
      )
    }

    socket.onmessage = (event) => {
      const ts = new Date().toISOString()
      const message = JSON.parse(event.data)
      console.log(`[INSTRUMENTATION] [${ts}] WebSocket MESSAGE: ${message.type}`, { payload: message.payload })

      if (message.type === 'session.bound') {
        setIsSessionBound(true)
      } else if (
        message.type === 'asr.final' ||
        message.type === 'interpretation.completed' ||
        message.type === 'session.state.updated'
      ) {
        void refreshRef.current(`event_${message.type}`)
      } else if (message.type === 'playback.completed') {
        const utteranceId = message.payload?.utterance_id ?? null
        if (utteranceId !== null && browserCompletedPlaybackUtteranceIdRef.current !== utteranceId) {
          setTransientState('playback_output')
        }
        void refreshRef.current(`event_${message.type}`)
      } else if (message.type === 'playback.ready') {
        const { utterance_id, audio_base64, audio_encoding } = message.payload
        if (audio_base64 && audio_encoding) {
          setTransientState('playback_output')
          setBrowserCompletedPlaybackUtteranceId(null)
          browserCompletedPlaybackUtteranceIdRef.current = null
          const audio = new Audio(`data:${audio_encoding};base64,${audio_base64}`)
          playbackAudioRef.current = audio
          audio.onended = () => {
            const endTs = new Date().toISOString()
            console.log(`[INSTRUMENTATION] [${endTs}] AUDIO_ONENDED in browser: ${utterance_id}`)
            browserCompletedPlaybackUtteranceIdRef.current = utterance_id ?? null
            setBrowserCompletedPlaybackUtteranceId(utterance_id ?? null)
            playbackAudioRef.current = null
          }
          void audio.play().catch((err) => {
            console.error('[Realtime] Playback failed:', err)
            playbackAudioRef.current = null
          })
        }
      } else if (message.type === 'transport.error') {
        console.error('[Realtime] Transport error:', message.payload)
      }
    }

    socket.onerror = (err) => {
      const ts = new Date().toISOString()
      console.error(`[INSTRUMENTATION] [${ts}] WebSocket ERROR`, err)
      setIsSocketReady(false)
      setIsSessionBound(false)
    }

    socket.onclose = () => {
      const ts = new Date().toISOString()
      console.log(`[INSTRUMENTATION] [${ts}] WebSocket CLOSED`)
      setIsSocketReady(false)
      setIsSessionBound(false)
    }

    return () => {
      playbackAudioRef.current?.pause()
      playbackAudioRef.current = null
      socket.close()
      socketRef.current = null
    }
  }, [accessToken, participantRole, sessionId])

  const advanceTurn = useCallback(() => {
    setTransientState((current) => {
      if (current === 'playback_output') {
        return 'turn_complete'
      }
      return null
    })
  }, [])

  useEffect(() => {
    if (view === null || view.transcript.length === 0) return
    const lastItem = view.transcript[view.transcript.length - 1]
    if (
      lastItem.playback_status === 'completed' &&
      lastItem.content_id === browserCompletedPlaybackUtteranceId &&
      lastItem.content_id !== lastChimedUtteranceId.current
    ) {
      console.log('[UI] Playback completed, playing chime')
      const audio = new Audio(`${import.meta.env.BASE_URL}sounds/chime.wav`)
      audio.preload = 'auto'
      void audio.play()
        .then(() => {
          lastChimedUtteranceId.current = lastItem.content_id
          setTimeout(() => {
            console.log('[UI] Auto-advancing turn after chime')
            advanceTurn()
          }, 500)
        })
        .catch((err) => {
          console.warn('[UI] Chime playback failed:', err)
          advanceTurn()
        })
    }
  }, [view, advanceTurn, browserCompletedPlaybackUtteranceId])

  const endConversation = useCallback(async () => {
    if (!sessionId.trim() || accessToken === null) return null

    setIsLoading(true)
    setErrorMessage(null)
    setTransientState(null)
    setBrowserCompletedPlaybackUtteranceId(null)

    try {
      await authorizedFetch(`/sessions/${sessionId}/end`, {
        method: 'POST',
      })

      const socket = socketRef.current
      if (socket) {
        socket.close()
        socketRef.current = null
      }
      setIsSocketReady(false)
      setIsSessionBound(false)

      return await refresh('session_ended')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'session_end_failed'
      setErrorMessage(message)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [accessToken, authorizedFetch, refresh, sessionId])

  const uiState = useMemo(() => {
    const result = mapBackendStateToUiState(view, participantRole, transientState)
    if (view) {
      console.log(`[INSTRUMENTATION] Mapping layer: mapped transcript length=${view.transcript.length}`);
    }
    return result
  }, [participantRole, transientState, view])

  const submitTurn = useCallback(
    async (audioData: ArrayBuffer, sampleRate: number = 16000) => {
      const ts = new Date().toISOString()
      console.log(`[INSTRUMENTATION] [${ts}] submitTurn START`, {
        byte_length: audioData.byteLength,
        sampleRate,
        participant_role: participantRole,
        current_turn_speaker: view?.current_turn_speaker,
        can_submit_turn: view?.can_submit_turn,
        transientState
      })
      if (view === null) {
        throw new Error('conversation_view_missing')
      }
      if (usageLimitReached) {
        throw new Error('usage_limit_reached')
      }
      const submissionSpeakerRole = resolveSubmissionSpeakerRole(view, participantRole)
      if (submissionSpeakerRole !== view.current_turn_speaker) {
        const errorTs = new Date().toISOString()
        console.error(`[INSTRUMENTATION] [${errorTs}] speaker_turn_mismatch. participantRole=${participantRole}, submissionSpeakerRole=${submissionSpeakerRole}, backendTruth=${view.current_turn_speaker}`)
        throw new Error('speaker_turn_mismatch')
      }

      const socket = socketRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN || !isSocketReady) {
        console.error('[Realtime] WebSocket not open', { readyState: socket?.readyState, isSocketReady })
        throw new Error('realtime_connection_failed')
      }
      if (!isSessionBound) {
        console.error('[Realtime] Session not bound')
        throw new Error('realtime_not_bound')
      }

      setIsLoading(true)
      setErrorMessage(null)
      setTransientState('processing')

      try {
        console.log('[Turn] Creating interaction...')
        const interaction = await authorizedFetch<{ id: string }>(`/sessions/${view.session_id}/interactions`, {
          method: 'POST',
          body: JSON.stringify({ speaker_role: submissionSpeakerRole }),
        })
        await authorizedFetch(`/sessions/${view.session_id}/interactions/${interaction.id}/activate`, {
          method: 'POST',
        })

        const utteranceId = `u-${Date.now()}`
        const streamStartTs = new Date().toISOString()
        console.log(`[INSTRUMENTATION] [${streamStartTs}] Starting ASR stream: ${utteranceId}`)

        socket.send(
          JSON.stringify({
            type: 'audio.stream.start',
            payload: {
              utterance_id: utteranceId,
              audio_encoding: 'pcm_s16le',
              sample_rate_hz: sampleRate,
              channel_count: 1,
            },
          }),
        )

        // Convert ArrayBuffer to base64 directly using a fast binary string loop
        const bytes = new Uint8Array(audioData)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64 = btoa(binary)

        socket.send(
          JSON.stringify({
            type: 'audio.chunk.append',
            payload: {
              utterance_id: utteranceId,
              chunk_base64: base64,
              sequence: 0,
            },
          }),
        )

        socket.send(
          JSON.stringify({
            type: 'audio.stream.commit',
            payload: { utterance_id: utteranceId },
          }),
        )

        // Aggressive polling loop removed in favor of WebSocket event-driven refreshes.
        // We perform one final refresh after commit to ensure state is synced.
        await new Promise((r) => setTimeout(r, 1000))
        const finalView = await refresh('post_commit_sync')
        return finalView
      } catch (error) {
        const message = error instanceof Error ? error.message : 'turn_submission_failed'
        if (message === 'usage_limit_reached') {
          setUsageLimitReached(true)
        }
        setErrorMessage(message)
        setTransientState('error')
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [accessToken, authorizedFetch, isSessionBound, isSocketReady, participantRole, refresh, transientState, usageLimitReached, view],
  )

  return {
    conversationView: view,
    errorMessage,
    isLoading,
    participantRole,
    submitTurn,
    uiState,
    refresh,
    advanceTurn,
    endConversation,
    usageLimitReached,
    isSocketReady,
    isSessionBound,
  }
}
