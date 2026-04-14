import { useMemo, useState, useCallback, useEffect } from 'react'

import { ConversationView } from '../components/ConversationView'
import { useSessionState } from '../hooks/useSessionState'
import { useAuth } from '../lib/auth/AuthContext'
import type { SpeakerRole } from '../types/session'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api/v1'

interface LanguageProfileOption {
  id: string
  display_name: string
  locale_code: string
  is_active: boolean
}

interface LanguagePairOption {
  source_profile_id: string
  target_profile_id: string
  is_active: boolean
}

const FALLBACK_LANGUAGE_PROFILES: LanguageProfileOption[] = [
  { id: 'lp-zh-cn', display_name: 'Mandarin Chinese (Mainland)', locale_code: 'zh-CN', is_active: true },
  { id: 'lp-zh-tw', display_name: 'Mandarin Chinese (Taiwan)', locale_code: 'zh-TW', is_active: true },
  { id: 'lp-yue-hk', display_name: 'Cantonese (Hong Kong)', locale_code: 'yue-HK', is_active: true },
  { id: 'lp-yue-gz', display_name: 'Cantonese (Guangzhou)', locale_code: 'yue-GZ', is_active: true },
  { id: 'lp-es-mx', display_name: 'Spanish (Mexico)', locale_code: 'es-MX', is_active: true },
  { id: 'lp-es-es', display_name: 'Spanish (Spain)', locale_code: 'es-ES', is_active: true },
  { id: 'lp-es-419', display_name: 'Spanish (Latin America)', locale_code: 'es-419', is_active: true },
  { id: 'lp-fr-fr', display_name: 'French (France)', locale_code: 'fr-FR', is_active: true },
  { id: 'lp-de-de', display_name: 'German (Germany)', locale_code: 'de-DE', is_active: true },
  { id: 'lp-pt-br', display_name: 'Portuguese (Brazil)', locale_code: 'pt-BR', is_active: true },
  { id: 'lp-ru-ru', display_name: 'Russian (Russia)', locale_code: 'ru-RU', is_active: true },
  { id: 'lp-en-us', display_name: 'English (US)', locale_code: 'en-US', is_active: true },
  { id: 'lp-en-gb', display_name: 'English (UK)', locale_code: 'en-GB', is_active: true },
]

export function SessionPage() {
  const { authState, logout } = useAuth()
  const [sessionIdInput, setSessionIdInput] = useState('')
  const [activeSessionId, setActiveSessionId] = useState('')
  const [participantRole, setParticipantRole] = useState<SpeakerRole>('A')
  const [isCreating, setIsCreating] = useState(false)
  const [availableProfiles, setAvailableProfiles] = useState<LanguageProfileOption[]>(FALLBACK_LANGUAGE_PROFILES)
  const [availablePairs, setAvailablePairs] = useState<LanguagePairOption[]>([])
  const [speakerAProfileId, setSpeakerAProfileId] = useState('lp-es-mx')
  const [speakerBProfileId, setSpeakerBProfileId] = useState('lp-en-us')

  const sessionState = useSessionState(activeSessionId, participantRole, {
    accessToken: authState.accessToken,
  })

  useEffect(() => {
    if (!authState.accessToken) return

    let isCancelled = false

    const loadLanguageConfig = async () => {
      try {
        const [profilesResponse, pairsResponse] = await Promise.all([
          fetch(`${API_BASE}/admin/language-config/profiles`, {
            headers: {
              Authorization: `Bearer ${authState.accessToken}`,
            },
          }),
          fetch(`${API_BASE}/admin/language-config/pairs`, {
            headers: {
              Authorization: `Bearer ${authState.accessToken}`,
            },
          }),
        ])

        if (!isCancelled && (profilesResponse.status === 401 || pairsResponse.status === 401)) {
          logout()
          return
        }

        if (!isCancelled && profilesResponse.ok) {
          const profiles = (await profilesResponse.json()) as LanguageProfileOption[]
          if (profiles.length > 0) {
            setAvailableProfiles(profiles.filter((profile) => profile.is_active))
          }
        }

        if (!isCancelled && pairsResponse.ok) {
          const pairs = (await pairsResponse.json()) as LanguagePairOption[]
          setAvailablePairs(pairs.filter((pair) => pair.is_active))
        }
      } catch (error) {
        console.warn('[Session] Falling back to built-in language options', error)
      }
    }

    void loadLanguageConfig()

    return () => {
      isCancelled = true
    }
  }, [authState.accessToken, logout])

  const speakerAOptions = useMemo(() => availableProfiles, [availableProfiles])

  const speakerBOptions = useMemo(() => {
    const baseOptions = availableProfiles.filter((profile) => profile.id !== speakerAProfileId)
    if (availablePairs.length === 0) {
      return baseOptions
    }
    const allowedTargets = new Set(
      availablePairs
        .filter((pair) => pair.source_profile_id === speakerAProfileId)
        .map((pair) => pair.target_profile_id),
    )
    const filtered = baseOptions.filter((profile) => allowedTargets.has(profile.id))
    return filtered.length > 0 ? filtered : baseOptions
  }, [availablePairs, availableProfiles, speakerAProfileId])

  useEffect(() => {
    if (!speakerAOptions.some((profile) => profile.id === speakerAProfileId) && speakerAOptions.length > 0) {
      setSpeakerAProfileId(speakerAOptions[0].id)
    }
  }, [speakerAOptions, speakerAProfileId])

  useEffect(() => {
    if (!speakerBOptions.some((profile) => profile.id === speakerBProfileId) && speakerBOptions.length > 0) {
      setSpeakerBProfileId(speakerBOptions[0].id)
    }
  }, [speakerBOptions, speakerBProfileId])

  const selectedSpeakerAProfile = useMemo(
    () => availableProfiles.find((profile) => profile.id === speakerAProfileId) ?? null,
    [availableProfiles, speakerAProfileId],
  )

  const selectedSpeakerBProfile = useMemo(
    () => availableProfiles.find((profile) => profile.id === speakerBProfileId) ?? null,
    [availableProfiles, speakerBProfileId],
  )

  useEffect(() => {
    const shouldHoldPlaybackRole =
      sessionState.conversationView?.backend_state === 'awaiting_speaker' &&
      sessionState.uiState === 'playback_output'

    if (!shouldHoldPlaybackRole && (sessionState.conversationView?.backend_state === 'awaiting_speaker' || sessionState.conversationView?.backend_state === 'repeat_required')) {
      if (sessionState.conversationView.current_turn_speaker !== participantRole) {
        console.log('[UI] Syncing participantRole from backend for V1 alternation', {
          backend_state: sessionState.conversationView?.backend_state,
          current_turn_speaker: sessionState.conversationView?.current_turn_speaker,
          previous_participant_role: participantRole,
        })
        setParticipantRole(sessionState.conversationView.current_turn_speaker)
      }
    }
  }, [sessionState.conversationView?.backend_state, sessionState.conversationView?.current_turn_speaker, sessionState.uiState, participantRole])

  const createSession = useCallback(async () => {
    if (!authState.accessToken) return
    setIsCreating(true)
    try {
      const response = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authState.accessToken}`,
        },
        body: JSON.stringify({
          speaker_a_profile_id: speakerAProfileId,
          speaker_b_profile_id: speakerBProfileId,
        }),
      })
      if (!response.ok) {
        if (response.status === 401) {
          logout()
        }
        const errorBody = await response.json().catch(() => ({}))
        throw new Error(`Failed to create session: ${response.status} ${JSON.stringify(errorBody)}`)
      }
      const session = await response.json()
      
      // Fixed: participantRole is 'A' for the creator
      setParticipantRole('A')
      console.log('[UI] Session creator role set to A')

      // Start the session immediately
      const startResponse = await fetch(`${API_BASE}/sessions/${session.id}/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authState.accessToken}`,
        },
      })
      if (!startResponse.ok) {
        if (startResponse.status === 401) {
          logout()
        }
        const errorBody = await startResponse.json().catch(() => ({}))
        throw new Error(`Failed to start session: ${startResponse.status} ${JSON.stringify(errorBody)}`)
      }

      setSessionIdInput(session.id)
      setActiveSessionId(session.id)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to create session')
    } finally {
      setIsCreating(false)
    }
  }, [authState.accessToken, logout, speakerAProfileId, speakerBProfileId])

  const startNewConversation = useCallback(() => {
    setSessionIdInput('')
    setActiveSessionId('')
    setParticipantRole('A')
  }, [])

  return (
    <section className="session-page" aria-labelledby="session-page-title">
      <div className="conversation-card session-config" style={{ display: activeSessionId ? 'none' : 'grid' }}>
        <p className="eyebrow">Interpreter workspace</p>
        <h2 id="session-page-title" style={{ display: 'none' }}>Conversation session</h2>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Speaker A language</span>
            <select value={speakerAProfileId} onChange={(event) => setSpeakerAProfileId(event.target.value)}>
              {speakerAOptions.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.display_name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Speaker B language</span>
            <select value={speakerBProfileId} onChange={(event) => setSpeakerBProfileId(event.target.value)}>
              {speakerBOptions.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.display_name}
                </option>
              ))}
            </select>
          </label>

          <p aria-live="polite" style={{ margin: 0, color: 'var(--muted-text)' }}>
            {selectedSpeakerAProfile?.display_name ?? 'Speaker A'} ↔ {selectedSpeakerBProfile?.display_name ?? 'Speaker B'}
          </p>
        </div>
        <div className="composer-actions">
          <button
            type="button"
            onClick={createSession}
            disabled={isCreating || !authState.accessToken || !speakerAProfileId || !speakerBProfileId || speakerAProfileId === speakerBProfileId}
          >
            {isCreating ? 'Starting...' : 'Start Conversation'}
          </button>
        </div>
      </div>

      <ConversationView
        conversationView={activeSessionId ? sessionState.conversationView : null}
        uiState={activeSessionId ? sessionState.uiState : 'waiting_to_start'}
        participantRole={participantRole}
        isLoading={sessionState.isLoading}
        isSocketReady={sessionState.isSocketReady}
        isSessionBound={sessionState.isSessionBound}
        errorMessage={sessionState.errorMessage}
        onSubmitTurn={sessionState.submitTurn}
        onAdvanceTurn={sessionState.advanceTurn}
        onEndConversation={sessionState.endConversation}
        onNewConversation={startNewConversation}
        usageLimitReached={sessionState.usageLimitReached}
      />
    </section>
  )
}
